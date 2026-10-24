/**
 * The interpreter: one extra model call, before the reply, that READS the customer's
 * message and returns strict JSON. Operator decision R13.1 (2026-09-24).
 *
 * Why it exists. Personas rounds 1 and 2 (2026-09-24) ended 0 of 12 at the checkout link,
 * and the model's text was almost always right — the sale stalled in the regexes that
 * read her: "ela usa G 46" was not a size, "me passa pra uma pessoa" inside a longer
 * message was not a request, "não tenho e-mail" was not an answer. Every one of those is
 * reading, and reading Portuguese is what the model is good at and a regex is not.
 *
 * What it does NOT change (R11.1). The model still only writes text. This call returns
 * facts about the message — never an action — and every action (handoff, size, link,
 * silence) is decided by the deterministic functions below and in `index.ts`, with tests.
 * A wrong reading costs one turn of a slightly wrong directive; it can never publish a
 * promise, because the reply still goes through the whole gate chain.
 *
 * Why the same model as the conversation. R12.1: Meta is the only provider. Same host,
 * same key, same cost accounting (`llm_calls.purpose = "interpret"`); `reasoning_effort`
 * minimal, and a completion budget of 2000 — Muse always reasons, and on 2026-09-24 a
 * 900-token ceiling returned empty replies with the whole budget spent on reasoning.
 *
 * Why it never throws. A failed interpretation is not a failed turn: it degrades to
 * `NEUTRAL_INTERPRETATION`, which reads as "nothing detected", and the deterministic
 * extractors that ran before this module existed still run first.
 *
 * Zero imports, so it runs byte-identical in Deno and in vitest — mirrored into
 * `supabase/functions/turn/interpret.ts` and held there by `tests/function-drift.test.ts`.
 */

export type SizeLetter = "P" | "M" | "G" | "GG" | "XGG";
export type PendingAnswer = "answered" | "other_question" | "unrelated" | "no_pending";
export type PaymentChoice = "cod" | "prepay";
/** What holds her back in this message (plan 16 §4.1). */
export type Objection = "preco" | "confianca" | "tamanho" | "entrega" | "pagamento" | "conforto" | "resultado" | "outra";
/** How she talks about the price (plan 16 §4.3): the first two read as high sensitivity, the last two as medium. */
export type PriceSignal = "complaint" | "discount_ask" | "installments" | "discount_question";

export interface InterpretedSize {
  letter: SizeLetter | null;
  pants: number | null;
  waist_cm: number | null;
  for_other_person: boolean;
}

export interface Interpretation {
  asks_human: boolean;
  wants_cancel: boolean;
  post_sale: boolean;
  /** She wants to exchange the size of an order she already has (R17.1). */
  wants_exchange: boolean;
  opt_out: boolean;
  size: InterpretedSize;
  payment_choice: PaymentChoice | null;
  wants_to_think: boolean;
  wants_to_buy: boolean;
  pending_answer: PendingAnswer;
  /** How many pieces she says she wants (kits, 2026-09-25), or null. */
  units: number | null;
  /** The letter of each piece she names, in order ("um M e um G" → M, G). */
  unit_sizes: SizeLetter[];
  /** The pants number of each piece, when she gives numbers ("uso 42, ela 46" → 42, 46). */
  unit_pants: number[];
  /** What she wants it for ("casamento", "pós-parto"), ≤ 40 characters, or null (plan 16 §4.1). */
  occasion: string | null;
  /** What bothers her ("barriga marca no vestido"), ≤ 80 characters, or null. */
  pain: string | null;
  /** Only the objections said in THIS message. */
  objections: Objection[];
  price_signal: PriceSignal | null;
  /** A question from someone who is buying: price, delivery time, payment, kit, how to buy. */
  buying_question: boolean;
  /** One short sentence tying the colete to her occasion or pain, ≤ 90 characters; null without either. */
  hook: string | null;
}

/** What a failed or garbled interpretation reads as: nothing detected. */
export const NEUTRAL_INTERPRETATION: Interpretation = Object.freeze({
  asks_human: false,
  wants_cancel: false,
  post_sale: false,
  wants_exchange: false,
  opt_out: false,
  size: Object.freeze({ letter: null, pants: null, waist_cm: null, for_other_person: false }),
  payment_choice: null,
  wants_to_think: false,
  wants_to_buy: false,
  pending_answer: "no_pending",
  units: null,
  unit_sizes: Object.freeze([]) as unknown as SizeLetter[],
  unit_pants: Object.freeze([]) as unknown as number[],
  occasion: null,
  pain: null,
  objections: Object.freeze([]) as unknown as Objection[],
  price_signal: null,
  buying_question: false,
  hook: null,
}) as Interpretation;

/**
 * Completion budget for the call. Muse bills its reasoning inside the completion, and at
 * 900 it came back empty (2026-09-24); 2000 leaves room for reasoning plus ~200 tokens of
 * JSON. The ceiling is headroom, not the expected spend.
 */
export const INTERPRET_MAX_COMPLETION_TOKENS = 2000;

export const INTERPRETER_SYSTEM = [
  "Você lê UMA mensagem de uma cliente de uma loja de colete modelador no WhatsApp e",
  "devolve SOMENTE um objeto JSON, sem texto antes ou depois, sem markdown. Você não",
  "responde a cliente. Você só diz o que a mensagem contém.",
  "",
  "Campos (use exatamente estes nomes):",
  '- "asks_human": true só se ela pede EXPLICITAMENTE para falar com uma PESSOA/um humano/um',
  '  atendente/alguém de verdade no lugar da assistente ("me passa pra um atendente", "quero falar',
  '  com uma pessoa", "quero falar com alguém de verdade"). false para "preciso falar com alguém',
  '  sobre meu pedido" ("alguém" sozinho não é pessoa), "você é robô?", "vc é humano?", "é IA?",',
  '  "tem alguém aí?" (só conferindo se alguém responde), "uma pessoa me indicou", "não quero',
  '  falar com atendente" e qualquer negação.',
  '- "wants_cancel": true só se ela quer cancelar um pedido que JÁ FEZ.',
  '- "post_sale": true se ela fala de um pedido que JÁ FEZ (onde está, quando chega, troca,',
  "  devolução, problema com a entrega).",
  '- "wants_exchange": true só se ela pede para TROCAR ou DEVOLVER um colete que JÁ COMPROU',
  '  ("ficou pequeno, quero trocar pelo G", "dá pra trocar o tamanho?", "quero devolver"). Pergunta',
  '  antes de comprar ("e se não servir, dá pra trocar?"), reclamação sem pedir troca ou devolução',
  '  ("veio com defeito") e cancelamento de pedido que ainda não chegou: false.',
  '- "opt_out": true se ela pede para não receber mais mensagens.',
  '- "size": { "letter": "P"|"M"|"G"|"GG"|"XGG"|null, "pants": número da CALÇA ou null',
  '  (manequim, número de vestido, de blusa ou de sapato NÃO é calça: pants null),',
  '  "waist_cm": cintura em cm ou null, "for_other_person": true se o tamanho é de outra',
  "  pessoa (mãe, filha, amiga) }. Só o tamanho que ela AFIRMA usar nesta mensagem; idade,",
  "  peso, sapato e preço não são tamanho. PERGUNTA não é tamanho dito: \"tem GG?\", \"qual",
  "  tamanho pra quem usa 44?\", \"o M serve?\" → tudo null. Se ela corrige o tamanho, use o novo.",
  '- "payment_choice": "prepay" se ela escolhe pagar antes (pix, cartão, antecipado),',
  '  "cod" se escolhe pagar na entrega, null se não escolheu.',
  '- "wants_to_think": true se ela diz que vai pensar, ver depois, falar com alguém antes, ou',
  '  adia ("deixa então, vlw", "fica pra próxima"). Recusa não é adiar: "não quero mais",',
  '  "desisti", "não tenho interesse" → false.',
  '- "wants_to_buy": true se ela decide comprar: "quero comprar", "vou nesse então", "quero',
  '  então", "vou querer", "pode mandar o link", "quero um G". Pedir preço menor ou desconto',
  '  como condição ("faz por 100 que eu levo", "me dá um desconto que eu levo") não é decisão:',
  '  false. Aceitar o preço que a assistente ofereceu ("por 116 eu levo", "fechado no pix") é.',
  '- "pending_answer": compare com a ÚLTIMA mensagem da assistente.',
  '  "answered" = a assistente fez uma pergunta e a mensagem responde;',
  '  "other_question" = ela faz uma pergunta própria ou traz um assunto real novo;',
  '  "unrelated" = a assistente perguntou algo e a mensagem não responde nem pergunta nada',
  '  que faça sentido ("ta", "?", "kkk", assunto solto);',
  '  "no_pending" = a assistente não deixou pergunta e a mensagem não pergunta nada.',
  '- "units": quantas peças ela diz que quer (1, 2, 3...), ou null se não disse. "um pra mim e',
  '  outro pra minha mãe" = 2; "o kit de 3" = 3; "só uma" = 1. Pergunta ("tem desconto',
  '  levando 2?") não é decisão: null.',
  '- "unit_sizes": a letra de cada peça que ela diz, na ordem ("um M e um G" → ["M","G"];',
  '  "as duas G" → ["G","G"]; só "G" respondendo o tamanho de uma peça → ["G"]); [] se não disser.',
  '- "unit_pants": quando ela quer mais de uma peça e diz o número de CALÇA de cada pessoa, os',
  '  números na ordem ("uso 42, ela 46" → [42,46]); [] se não disser. Só calça, nunca manequim.',
  '- "occasion": pra que ELA diz que quer o colete, em poucas palavras (até 40 letras): "casamento",',
  '  "pós-parto", "trabalho", "dia a dia", "formatura". null se ela não disse nesta mensagem.',
  '- "pain": o que ELA diz que incomoda, em poucas palavras (até 80 letras): "barriga marca no',
  '  vestido", "dor nas costas", "postura". null se ela não disse. Pergunta ("serve pra dor nas',
  '  costas?") não é dor dita: null.',
  '- "objections": lista do que a segura NESTA mensagem, só destes valores: "preco" (acha caro,',
  '  quer pagar menos), "confianca" (medo de golpe, "é confiável?"), "tamanho" (medo de não servir),',
  '  "entrega" (prazo, frete, se chega), "pagamento" (forma de pagar), "conforto" (aperta, calor,',
  '  dá pra usar o dia todo), "resultado" (se funciona, se aparece), "outra". Negação não é',
  '  objeção ("não achei caro", "confio sim") → []. [] se não houver.',
  '- "price_signal": como ela fala do preço nesta mensagem, ou null:',
  '  "complaint" = reclama do preço ("tá caro", "achei mais barato em outro lugar",',
  '  "não tenho esse dinheiro agora");',
  '  "discount_ask" = pede um preço menor ("faz por 100?", "me dá um desconto", "deixa por 120 que eu levo");',
  '  "installments" = pergunta de parcelar ("parcela?", "dá pra dividir?", "em quantas vezes?");',
  '  "discount_question" = só pergunta se existe desconto ("tem desconto?", "tem cupom?",',
  '  "tem desconto no pix?"). Negação não é sinal: "não achei caro", "o preço tá ótimo",',
  '  "não precisa de desconto" → null.',
  '- "buying_question": true se ela faz pergunta de quem está comprando: preço, prazo de entrega,',
  '  forma de pagamento, kit, como compra ("quanto fica?", "chega quando?", "como faço pra',
  '  comprar?", "aceita pix?", "quanto sai o kit?"). Pergunta sobre o produto em si, cumprimento',
  '  ou afirmação: false.',
  '- "hook": SÓ quando "occasion" ou "pain" não é null, uma frase curta e calorosa (até 90 letras)',
  '  ligando o colete a isso, como a assistente diria ("Pro seu casamento ele vai deixar o vestido',
  '  assentadinho 😍"). NUNCA promessa de saúde, de emagrecer, de "reduzir medidas" ou de',
  '  resultado. Fale só do que o colete faz enquanto está vestido (modela, assenta, dá firmeza e',
  '  apoio à postura). Nunca diga que ajuda, alivia ou trata a dor, nem fale de quilos, kg,',
  '  medidas ou centímetros: "Ele vai ajudar na sua dor nas costas." e "Você vai perder 5 quilos."',
  '  são proibidas. Nunca fale de pós-parto, cesárea, cirurgia, diástase nem de recuperação, e',
  '  nunca diga que o colete reduz ou diminui alguma coisa: "Ele ajuda na recuperação do seu',
  '  pós-parto." e "Pro seu casamento ele vai reduzir sua barriga." são proibidas. Sem ocasião e',
  '  sem dor: null.',
].join("\n");

/**
 * The hook goes to her as a bubble of its own before the offer (plan 16 §4.4), and the wave-1 review found "Ele vai
 * ajudar na sua dor nas costas." and "Você vai perder 5 quilos." passing every gate: relief, weight and measurement
 * wording drops the hook here, whatever the model wrote. Dropping costs one bubble; a negated mention drops it too.
 */
// Since the compliance review of plan 16: recovery, diástase, reduction and the pós-parto or a surgery named, which passed too.
// `\b` is ASCII here: an accented letter is a boundary, so "recuperação" and "pós-operatório" end where the `\w*` stops.
const HOOK_PROMISE =
  /\b(?:dor|dores|alivi\w*|quilos?|kg|emagrec\w*|medidas?|cent[ií]metros?|perd\w*|sec[ao]|secar|trat\w*|cur[ao]|curar|recupera\w*|di[aá]stase|reduz\w*|diminu\w*|ces[aá]rea|cirurg\w*|p[oó]s[\s-]?(?:parto|operat\w*))\b|\d\s*(?:kg|cm)\b/i;

/** The two messages the call sends. The customer's text is data, quoted, never an order. */
export const interpretRequest = (
  lastOutbound: string,
  inbound: string,
): { system: string; user: string } => ({
  system: INTERPRETER_SYSTEM,
  user:
    `Última mensagem da assistente:\n"""${lastOutbound.trim() || "(nenhuma)"}"""\n\n` +
    `Mensagem da cliente:\n"""${inbound.trim()}"""\n\nJSON:`,
});

const LETTERS: readonly SizeLetter[] = ["P", "M", "G", "GG", "XGG"];
const PENDING: readonly PendingAnswer[] = ["answered", "other_question", "unrelated", "no_pending"];
const OBJECTIONS: readonly Objection[] = ["preco", "confianca", "tamanho", "entrega", "pagamento", "conforto", "resultado", "outra"];
const PRICE_SIGNALS: readonly PriceSignal[] = ["complaint", "discount_ask", "installments", "discount_question"];

const flag = (v: unknown): boolean => v === true;

/** Free text the model wrote, trimmed and cut to `max` characters (code points, so an emoji is never split). */
const textUpTo = (v: unknown, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : [...t].slice(0, max).join("").trim();
};

/** A number the model may have written as a string; anything outside the range is noise. */
const numberIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * The model's JSON, read defensively. Anything that is not exactly the declared shape
 * reads as the neutral value for that field — a `"true"` string is not `true`, a letter
 * outside the table is no letter. `parsed` says whether there was a JSON object at all,
 * because "nothing detected" and "could not read" must not drive the same decision.
 */
export const readInterpretation = (raw: string): { parsed: boolean; interpretation: Interpretation } => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { parsed: false, interpretation: NEUTRAL_INTERPRETATION };
  let value: unknown;
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { parsed: false, interpretation: NEUTRAL_INTERPRETATION };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { parsed: false, interpretation: NEUTRAL_INTERPRETATION };
  }
  const o = value as Record<string, unknown>;
  const s = (typeof o.size === "object" && o.size !== null ? o.size : {}) as Record<string, unknown>;
  const letter = typeof s.letter === "string" ? s.letter.trim().toUpperCase() : "";
  const occasion = textUpTo(o.occasion, 40);
  const pain = textUpTo(o.pain, 80);
  return {
    parsed: true,
    interpretation: {
      asks_human: flag(o.asks_human),
      wants_cancel: flag(o.wants_cancel),
      post_sale: flag(o.post_sale),
      wants_exchange: flag(o.wants_exchange),
      opt_out: flag(o.opt_out),
      size: {
        letter: (LETTERS as readonly string[]).includes(letter) ? (letter as SizeLetter) : null,
        pants: numberIn(s.pants, 34, 56),
        waist_cm: numberIn(s.waist_cm, 50, 150),
        for_other_person: flag(s.for_other_person),
      },
      payment_choice: o.payment_choice === "cod" || o.payment_choice === "prepay" ? o.payment_choice : null,
      wants_to_think: flag(o.wants_to_think),
      wants_to_buy: flag(o.wants_to_buy),
      pending_answer: (PENDING as readonly string[]).includes(o.pending_answer as string)
        ? (o.pending_answer as PendingAnswer)
        : "no_pending",
      units: (() => {
        const n = numberIn(o.units, 1, 50);
        return n !== null && Number.isInteger(n) ? n : null;
      })(),
      unit_sizes: (Array.isArray(o.unit_sizes) ? o.unit_sizes : [])
        .map((x) => (typeof x === "string" ? x.trim().toUpperCase() : ""))
        .filter((x): x is SizeLetter => (LETTERS as readonly string[]).includes(x)),
      unit_pants: (Array.isArray(o.unit_pants) ? o.unit_pants : [])
        .map((x) => numberIn(x, 34, 56))
        .filter((x): x is number => x !== null),
      occasion,
      pain,
      // A hook without an occasion or a pain ties the colete to nothing she said.
      hook: occasion !== null || pain !== null ? ((h) => (h !== null && HOOK_PROMISE.test(h) ? null : h))(textUpTo(o.hook, 90)) : null,
      objections: [...new Set(Array.isArray(o.objections) ? o.objections : [])].filter((x): x is Objection =>
        (OBJECTIONS as readonly unknown[]).includes(x),
      ),
      price_signal: (PRICE_SIGNALS as readonly unknown[]).includes(o.price_signal) ? (o.price_signal as PriceSignal) : null,
      buying_question: flag(o.buying_question),
    },
  };
};

const norm = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * More than one piece only when her own words say more than one (kits, 2026-09-25): a
 * number, a count word, "kit", "par", "cada", "outro/outra", "mais uma". The model reads the
 * quantity; this is the deterministic half, so an invented `units: 2` on "quero o M" does
 * not swap her link for a kit she never asked for. One piece, or sizes alone, need no cue.
 */
const QUANTITY_CUE = /\b(?:kit|par|cada|outr[oa]s?|mais\s+(?:de\s+)?uma?)\b/;
const COUNT_WORDS: Record<number, string> = {
  2: "duas|dois", 3: "tres", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez",
};
/**
 * Her words name this count: the word, a lone digit, or a number of pieces ("12 peças").
 * Not any number — "uso 42" is her pants, and it vouched for an invented `units: 42`
 * (code review, 2026-09-25).
 */
const namesCount = (text: string, units: number): boolean =>
  (COUNT_WORDS[units] !== undefined && new RegExp(`\\b(?:${COUNT_WORDS[units]})\\b`).test(text)) ||
  // "quero 2, M e G" and "quero 2." count; "2,5" and "42" do not (second review).
  // Not a count: "2x", "em 2 vezes", "2 dias", "às 3 horas", "2 filhos", "apto 2" (third review).
  (units <= 9 && new RegExp(`(?<!\\d|\\d[.,])${units}(?!\\d|[.,]\\d|\\s*(?:x|vezes|dias?|horas?|h|parcelas?|filh\\w*)\\b)`).test(text) &&
    // "a 2", "opção 2" name the second payment option, not two pieces (fourth review).
    !new RegExp(`\\b(?:uso|visto|numero|n|apto|ap|casa|rua|as|a|o|op[cç][aã]o)\\s*${units}\\b`).test(text)) ||
  new RegExp(`\\b${units}\\s+(?:pecas?|unidades?|coletes?|kits?)\\b`).test(text) ||
  // "um pra mim e um pra minha mãe", "pra mim e pra minha irmã", "eu e minha filha" are two.
  (units === 2 &&
    /\b(?:um|uma)\b[^.!?]{0,30}\be\s+(?:um|uma)\b|\b(?:pra|para)\s+mim\s+e\s+(?:pra|para)\s+|\beu\s+e\s+(?:a\s+|o\s+)?(?:minha|meu)\s+\w+/.test(text)) ||
  // "quero 2 M e 1 G" is three: the counts before size letters add up (third review).
  [...text.matchAll(/\b(\d)\s*(?:p|m|g|gg|xgg)\b/g)].reduce((sum, m) => sum + Number(m[1]), 0) === units;

export const quantityOf = (
  message: string,
  i: Interpretation,
): { units: number | null; sizes: SizeLetter[] } | null => {
  // A cue she denies is no cue: "não quero kit, só uma", "não quero duas" (code review).
  const text = norm(message).replace(
    /\b(?:nao|nem|sem)\s+(?:\w+\s+){0,3}?(?:(?:o|a|um|uma|do|da)\s+)?(?:kit(?:\s+de\s+\w+)?|par|duas|dois|tres|[2-9])\b/g,
    " ",
  );
  const units = i.units !== null && i.units > 1 && !QUANTITY_CUE.test(text) && !namesCount(text, i.units) ? null : i.units;
  // "um G pra mim e um M pra minha cunhada" (persona cob-recompra, 2026-10-24): each piece's size, read here when the interpreter
  // read none — she was asked the sizes again. The letter as she typed it, capital; a denied one ("não quero um M") is out.
  const pieces = i.unit_sizes.length > 0 ? [] : [...message.matchAll(/\bum(?:as?)?\s+(PP|P|M|GG|G|XGG)\b/g)]
    .filter((m) => !/\b(?:nao|nem|sem)\b[^,;.!?\n]*$/.test(norm(message.slice(0, m.index ?? 0))))
    .map((m) => (m[1] === "PP" ? "P" : m[1]) as SizeLetter);
  if (pieces.length >= 2) return { units: units !== null && units > pieces.length ? units : pieces.length, sizes: pieces };
  if (units === null && i.unit_sizes.length === 0) return null;
  return { units, sizes: [...i.unit_sizes] };
};

/**
 * She corrects her OWN size ("na verdade o meu é G", "a minha é GG", "eu uso 44"), not
 * someone else's. Deterministic: "minha irmã usa G" is about the sister.
 */
export const saysOwnSize = (message: string, i: Interpretation): boolean => {
  const t = norm(message);
  // A message that also names the other person ("pra mim tá bom, e pra ela G") is not a
  // correction of her own: the size may be the other's (second review).
  if (i.size.for_other_person || OTHER_PERSON.test(t)) return false;
  return /\b(?:o\s+meu|a\s+minha)\s+(?:e|eh|sera|fica|vai\s+ser|tamanho)\b|\b(?:pra|para)\s+mim\b|\beu\s+(?:uso|visto|sou)\b|\bmeu\s+tamanho\b/.test(t);
};
// Not "ele/dele/ela" alone: the vest is "o colete" and the belt "a cinta" — "eu uso G,
// ele é folgado?" is her own size (third review). The other person is named by "pra ela",
// "dela", or kinship.
const OTHER_PERSON =
  /\b(?:dela|delas|(?:pra|para)\s+(?:ela|elas|ele|eles)|(?:pra|para)\s+(?:a|o|minha|meu)\s+\w+|(?:minha|meu)\s+(?:mae|irma|irmao|filha|filho|amiga|tia|avo|sogra|prima|cunhada|namorad[oa]|marido|esposa))\b/;

/**
 * The sizes of each piece, said across messages ("M" now, "G" when asked for the other).
 * A full list replaces. One size she says is her own replaces the first piece — hers —
 * and never fills another piece's slot (code review: "na verdade o meu é G" on ["M"] made
 * the kit "M e G"). Any other partial list completes what is missing.
 */
export const mergeUnitSizes = (
  stored: readonly string[],
  said: readonly string[],
  units: number,
  ownSize = false,
): string[] => {
  if (said.length >= units) return said.slice(0, units);
  if (ownSize && said.length === 1) return [said[0]!, ...stored.slice(1)].slice(0, units);
  // A complete list is not undone by one size said again ("ok, G") — code review.
  if (stored.length >= units) return stored.slice(0, units);
  return [...stored, ...said].slice(0, units);
};

/**
 * Who she may ask for, named outright (operator, 2026-10-13): a person, a human, an attendant, someone
 * "de verdade". "Alguém" alone is not a person — "preciso falar com alguém sobre meu pedido" is the Malu's
 * — and a person-word with no request is not a request ("uma pessoa me indicou", "vc é humano?").
 */
const PERSON = String.raw`(?:(?:um|uma|o|a|algum|alguma|outr[oa])\s+)?(?:pessoa|humano|humana|ser\s+humano|atendente|atendimento\s+humano|vendedora?|responsavel(?!\s+pel[ao]s?\s+(?:(?:minha|sua|meu|seu|minhas|suas|meus|seus)\s+)?(?:entrega|envio|frete|transportadora|correio)s?\b)|gerente|supervisora?|alguem\s+(?:de\s+verdade|real|do\s+time|da\s+equipe|da\s+loja)|gente\s+(?:de\s+verdade|real))\b`;
const PERSON_REQUESTS = [
  // "quero falar com uma pessoa", "posso falar com um atendente?", "dá pra falar com alguém de verdade?"
  new RegExp(String.raw`\b(?:quero|queria|gostaria\s+de|preciso|precisava|posso|prefiro|da\s+pra|tem\s+como|deixa\s+eu)\s+(?:\S+\s+){0,2}?(?:(?:falar|conversar)\s+com|ser\s+atendid[ao]\s+(?:por|com))\s+${PERSON}`, "g"),
  // "quero uma pessoa", "quero atendimento humano"
  new RegExp(String.raw`\b(?:quero|queria|preciso\s+de|prefiro)\s+(?:(?:um|uma)\s+)?(?:atendimento\s+humano|${PERSON})`, "g"),
  // "me passa pra um atendente", "chama uma pessoa", "pode me transferir pra um humano?"
  new RegExp(String.raw`\b(?:passa|passe|passar|transfere|transfira|transferir|encaminha|encaminhe|encaminhar|coloca|coloque|colocar)\s+(?:\S+\s+){0,2}?(?:pra|para|com)\s+${PERSON}|\b(?:chama|chame|chamar)\s+(?:\S+\s+)?${PERSON}`, "g"),
  // "(não) tem um humano aí pra me ajudar?" — someone to help her, not a check on what the agent is.
  // The "não" is inside the match: here it asks, it does not refuse.
  new RegExp(String.raw`\b(?:nao\s+)?tem\s+(?:\S+\s+)?${PERSON}\s+(?:(?:ai|ae|aqui)\s+)?(?:pra|para)\s+(?:me\s+)?(?:ajudar|atender|falar|conversar)`, "g"),
];
/** "Tem gente de verdade aí? quero falar com ela": the pronoun counts only beside a person named outright. */
const PRONOUN_REQUEST =
  /\b(?:quero|queria|gostaria\s+de|preciso)\s+(?:\S+\s+){0,2}?(?:falar|conversar)\s+com\s+(?:ela|ele|essa\s+pessoa|esse\s+atendente|essa\s+atendente)\b/g;
const PERSON_NAMED = /\b(?:de\s+verdade|real|humano|humana|atendente)\b/;

/**
 * A refusal cancels the request only when it is ATTACHED to it: between the negation and the request there
 * may be only connecting words — "não quero falar com atendente", "não precisa me passar pra atendente". A
 * refusal of something else does not: in "não quero robô quero uma pessoa", "robô" is no connecting word
 * (code reviews, 2026-09-24). A negation with no wanting in it is a refusal only when it is not a question:
 * "não me passa pra atendente, só me fala o preço" refuses, "você não vai chamar um atendente?" and "por que
 * você não me passa pra uma pessoa?" ask (/code-review of v21).
 */
const NEGATED_BEFORE =
  /\b(?:nao|nunca|jamais|nem)\s+(?:(?:quero|queria|preciso|precisa|precisava|vou|vai|me|te|que|pra|para|ser|de)\s+)*$/;
const WANTING = /\b(?:quero|queria|preciso|precisa|precisava|gostaria|prefiro)\b/;
const refused = (t: string, clauseStart: number, at: number, match: string): boolean => {
  const negation = NEGATED_BEFORE.exec(t.slice(clauseStart, at));
  if (negation === null) return false;
  if (WANTING.test(`${negation[0]}${match}`)) return true;
  const rest = t.slice(at);
  return !rest.slice(0, rest.search(/[,.;!\n]|$/)).includes("?");
};

/**
 * Whether the message itself asks for a person — the deterministic half of the human-request rule, so a
 * model that hallucinates `asks_human` on "você é robô?" or on "preciso falar com alguém" does not take the
 * conversation from the Malu (R21.1: the person is the last resort). The clause is what the refusal is
 * read against (the lesson of `negation-blindness`): "não quero falar com robô, quero uma pessoa" asks.
 */
export const namesAPerson = (message: string): boolean => {
  const t = norm(message);
  for (const request of PERSON_NAMED.test(t) ? [...PERSON_REQUESTS, PRONOUN_REQUEST] : PERSON_REQUESTS) {
    for (const m of t.matchAll(request)) {
      const at = m.index ?? 0;
      const clauseStart = Math.max(...[",", ";", ".", "!", "?", "\n"].map((c) => t.lastIndexOf(c, at - 1))) + 1;
      if (refused(t, clauseStart, at, m[0])) continue;
      return true;
    }
  }
  return false;
};

/**
 * Her own words ask for an exchange or a return — the deterministic half of `wants_exchange`, so the Logzz
 * line never goes out on a complaint the model read as one ("veio com defeito", operator, 2026-10-13). Blind
 * to negation on purpose: the model's reading is the other half, and both must agree.
 */
export const namesExchangeOrReturn = (message: string): boolean =>
  /\b(?:troc(?:a|ar|o|aria|ou|ando|ado)|trocas|devolv\w*|devoluc\w*|reembols\w*|estorn\w*|dinheiro\s+de\s+volta)\b/.test(norm(message));

export type HandoffKind = "cancel" | "post_sale" | "human";

/**
 * She closes happily — thanks, goodbye, "já fiz" — with no question and no word of a
 * problem. The only post-sale message that is not a person's job.
 */
export const reportsDone = (message: string): boolean => {
  // A reply to "Chegou?! já vestiu?" can be all praise and no goodbye: "chegou sim, amei".
  const praise = /\b(?:amei|adorei|vesti|serviu|chegou|gostei)\b/.test(norm(message));
  if ((!closesConversation(message) && !praise) || message.includes("?")) return false;
  // Happy only when every word left is a goodbye, a thanks, "já fiz/recebi/chegou" or
  // filler: "obrigada, mas veio o M" and "valeu, recebi só 1 das 2" carry a complaint in
  // words no list of problems can enumerate (eighth review) — so allow, never deny.
  return onlyDoneWords(message);
};
const onlyDoneWords = (message: string): boolean =>
  norm(message)
    .split(/[^a-z]+/)
    .filter(Boolean)
    .every((w) => DONE_WORDS.test(w));
const DONE_WORDS =
  /^(?:tchau\w*|brigad[ao]s?|obrigad[ao]s?|valeu|vlw|flw|encerr\w*|finaliz\w*|ja|fiz|fechei|comprei|paguei|recebi|chegou|chegaram|amei|adorei|gostei|certinho|certo|tudo|ok|okay|beleza|blz|sim|entao|por|aqui|ate|mais|logo|boa|bom|tarde|noite|dia|muito|muita|pela|pelo|ajuda|atencao|conversa|voce|vc|te|pra|e|o|a|os|as|meu|minha|pedido|coletes?|bjs|beijos?|abraco|deus|abencoe\w*|k+|rs+|ai|hoje|estou|to|ta|usando|serviu|ficou|otim[oa]|perfeit\w*|lind[oa]|coracao|demais|amor|deu|viu|semana|proxima|fica|com|de|pix|paciencia|atendimento|malu|obg|brigadao|gratidao|tmj|sim|vesti|ja|nossa)$/;

/**
 * She closes the conversation — thanks, goodbye, "já fiz". After the link is in the chat,
 * this is not "vou pensar": the link is not sent again (persona round, 2026-09-25).
 */
export const closesConversation = (message: string): boolean =>
  /\b(?:tchau\w*|brigad[ao]|brigadao|obrigad[ao]+|obg|gratidao|tmj|abencoe\w*|valeu|vlw|encerr\w*|finaliz\w*|ja\s+(?:fiz|fechei|comprei|paguei)|ate\s+(?:mais|logo)|boa\s+(?:tarde|noite))\b/.test(norm(message));

/**
 * The three readings that flag the operator, and the only three (R13.2): an order she wants to cancel,
 * a question about an order that exists, or a person asked for in so many words. Since R22.1 none of them
 * silences the agent or promises her a call: the answer is the agent's own, the e-mail is a flag. The last
 * needs BOTH the reading and a person-word in her text; the exact phrase list (`wantsHuman`) comes earlier
 * in the turn, before this runs. Nothing else — a vetoed reply, a failed rewrite, a confused customer —
 * ever returns non-null here.
 *
 * Cancel and post-sale need an order to be about (`orderContext`): an order on file for the lead, or a
 * checkout link already sent in the conversation. "E se eu não gostar, consigo cancelar depois?" before any
 * purchase is a pre-sale question the agent answers. A link alone (`linkOnly`: no order on file, no purchase
 * said) is neither a cancel nor a post-sale ("desisti, pode cancelar" before any order has nothing to cancel): "moro sozinha, não tenho quem receber" after the link is a sale's
 * doubt (real test 2026-10-13).
 */
export const handoffFor = (
  i: Interpretation,
  message: string,
  orderContext: boolean,
  linkOnly = false,
): HandoffKind | null => {
  if (orderContext && !linkOnly && i.wants_cancel) return "cancel";
  // Everything about an order goes to a person EXCEPT a happy close: "obrigada, já
  // finalizei" handed the buyer to a person (persona round). Requiring a question instead
  // lost "ficou pequeno", "me cobraram frete" (seventh review) — exclude, never require.
  if (orderContext && !linkOnly && i.post_sale && !reportsDone(message)) return "post_sale";
  if (i.asks_human && namesAPerson(message)) return "human";
  return null;
};

/**
 * Her words CHOOSE a path, deterministically — the half that decides whether the model's
 * `payment_choice` is stored for the next turns (fourth review). A question compares
 * ("quanto economizo no pix em vez de pagar na entrega?"); a choice decides ("quero no
 * pix", "prefiro pagar na entrega", or a bare "pix" answering the question).
 */
const PATH_WORD =
  "(?:pix|antecipad\\w*|adiantad\\w*|cartao|entrega|na\\s+porta|pag\\w*\\s+(?:antes|agora|adiantado)|link\\s+do\\s+pix|(?:quando|na\\s+hora\\s+que)\\s+cheg\\w*)";
export const choosesPath = (message: string): boolean => {
  const t = norm(message);
  const m =
    new RegExp(`\\b(?:quero|vou|prefiro|pode\\s+ser|pode\\s+mandar|fecho|fechar|manda|escolho|opto|melhor|pago|pagar)\\b[^.!?]{0,30}?\\b${PATH_WORD}`).exec(t) ??
    new RegExp(`^\\s*(?:(?:ok|beleza|entao|sim|pode\\s+ser)[,\\s]+)?(?:(?:o|a)\\s+(?:d[oa]\\s+)?)?(?:no\\s+|na\\s+|pelo\\s+|pela\\s+|de\\s+)?${PATH_WORD}(?:[,\\s]+(?:mesmo|entao|pfv|por\\s+favor|sim|acho|eu\\s+acho))?(?:\\s*[.!]*\\s*$|\\s*,)`).exec(t);
  if (!m) return false;
  // Doubt is not a choice (sixth review): "quero saber se aceita pix", "vou ver se consigo
  // no pix", "pode ser que eu pague no pix", "pix ou cartão, não sei", "pagar na entrega é
  // seguro". Read up to the choice only — a reason after it is not doubt: "prefiro pagar na
  // entrega pra ver se serve" (seventh review).
  const beforeEnd = t.slice(0, m.index + m[0].length);
  if (
    /\b(?:saber|ver|pensar|entender|perguntar)\s+(?:se|sobre|como)\b|\bpode\s+ser\s+que\b|\btalvez\b|\bfalar\s+com\b|\bentender\s+(?:a|o)\b/.test(beforeEnd) ||
    /\bnao\s+sei\b|\btanto\s+faz\b|^[^,]*\be\s+segur\w*/.test(t) ||
    new RegExp(`${PATH_WORD}[^.!?]{0,20}\\bou\\s+(?:n[oa]\\s+|pel[oa]\\s+)?${PATH_WORD}`).test(t)
  )
    return false;
  // A question or a comparison BEFORE the choice is not a choice; one after it ("quero no
  // pix, qual a chave?") is a new question about a path already chosen (fifth review).
  const upTo = t.slice(0, m.index + m[0].length);
  // After the choice, a question ends it unless it comes after a comma and names no other
  // path ("quero no pix, qual a chave?" is a choice; "pode ser na entrega, mas no pix sai
  // mais barato?" is not).
  const after = t.slice(m.index + m[0].length);
  const questionAfter =
    // A full stop works like the comma (persona venda-curiosa, 2026-10-14: "prefiro na entrega. quanto fica no total?").
    after.includes("?") && !(/^\s*(?:sim|mesmo|entao)?\s*[,.;!]/.test(after) && !new RegExp(PATH_WORD).test(after) &&
      // Doubt about the path, never a logistics question with "melhor" in it ("qual o melhor horário?", third Opus review).
      !/\b(?:mas|ou|compensa|sera|vale\s+a\s+pena)\b|\b(?:e|eh|seria|fica)\s+(?:mais\s+|menos\s+)?(?:melhor|seguro|confiavel|garantido)\s*\?|^\s*[,.;!]?\s*melhor\s+assim\b/.test(after));
  return !upTo.includes("?") && !/\b(?:quanto|qual|se\s+eu|e\s+se|compensa|diferenca)\b/.test(upTo) && !questionAfter;
};

/**
 * Which checkout the link opens (R13.4): the prepaid one when she chose it or when her
 * region has no cash on delivery, the delivery one otherwise.
 */
export const linkPathFor = (
  choice: PaymentChoice | null,
  region: { cod: boolean } | null,
): PaymentChoice => (choice === "prepay" || (region !== null && !region.cod) ? "prepay" : "cod");

/** What the link waits for, in the order the conversation collects it (operator, 2026-10-06). */
export type LinkDatum = "size" | "cep" | "payment" | "name" | "email" | "document";

export interface LinkData {
  /**
   * Never a link without a size (code review, 2026-09-24): a piece that does not fit comes
   * back at the operator's cost.
   */
  sizeKnown: boolean;
  /** Her CEP, so the region was looked up and the payment options were said. */
  cepKnown: boolean;
  /** She chose the payment path, or her region left only the prepaid one. */
  pathSettled: boolean;
  nameKnown: boolean;
  /** A valid CPF is known, or she refused it twice. */
  cpfDone: boolean;
  /**
   * Prepaid only (operator, 2026-10-08, L2: the Coinzz checkout does not go on without it): false while
   * her e-mail is not in the chat and she has not refused it. Absent on the delivery path, never waited for.
   */
  emailDone?: boolean;
  /**
   * Experiment B (R20.6), arm 1 with `experiments.linkAfterChoice`: name, e-mail and CPF are the
   * checkout's to fill, so the link waits only for size, CEP and path. Absent or false = the order below.
   */
  identityAtCheckout?: boolean;
  /**
   * She chose the path herself (`payment_choice` stored or said). Experiment B waits for it: a region without
   * cash on delivery settles `pathSettled` alone, before she heard the prepaid offer (review of 9c1053c, 1).
   */
  choiceMade?: boolean;
}

/**
 * The first datum the link still waits for, or null when it may go (operator, 2026-10-06,
 * superseding R13.4's "link first, the checkout asks the rest"): size, CEP, payment path,
 * full name, the e-mail on the prepaid path only (L2, 2026-10-08) and CPF, in this order. The order is the directive's: one thing at a time.
 */
export const missingForLink = (d: LinkData): LinkDatum | null =>
  !d.sizeKnown ? "size"
  : !d.cepKnown ? "cep"
  // Arm B waits for HER choice: a region without cash on delivery settles the path alone, and asking her name then
  // would run arm 0's flow inside arm 1 (/code-review of the E6 fixes).
  : !d.pathSettled || (d.identityAtCheckout === true && d.choiceMade !== true) ? "payment"
  : d.identityAtCheckout === true ? null
  : !d.nameKnown ? "name"
  : d.emailDone === false ? "email"
  : !d.cpfDone ? "document"
  : null;

/**
 * Experiment B (operator, 2026-10-12): the link waits once for the kit offer — with the progressive discounts —
 * when she is on one piece and her path has kits not yet offered. Arm 0 offers the kit before the data anyway.
 * Only when the offer goes in this same turn (`pathChosen`: review of 2695b80, 2 — otherwise neither goes), and
 * never once a link went out (3: the offer came before it, and may have left the 20-message window).
 */
export const kitHoldsLink = (d: {
  identityAtCheckout?: boolean;
  units: number;
  kitsOnPath: number;
  kitOffered: boolean;
  pathChosen: boolean;
  linkSentBefore: boolean;
}): boolean =>
  d.identityAtCheckout === true && d.units === 1 && d.kitsOnPath > 0 && !d.kitOffered && d.pathChosen && !d.linkSentBefore;

/**
 * Whether the link goes out this turn: every datum is in, and her message is not a bare "sim"
 * beside a question (`yesBesideQuestion`) — the H-2 exception that let an ignored identity ask
 * send the link is gone with R13.4 (the data now come first).
 */
export const sendLinkNow = (d: LinkData & { yesBesideQuestion: boolean }): boolean =>
  !d.yesBesideQuestion && missingForLink(d) === null;

/**
 * A question that is itself a buyer's (review of 7c8bc7c): "Sim! Como faço pra pagar?",
 * "sim, quero. qual o prazo?", "isso mesmo, pode mandar?", "ok, como pago?". A "sim" beside one
 * of these goes on to the next datum or the link; a "sim" beside any other question
 * ("tem rastreio?") holds the link until she answers alone. A denied "quero" is no buyer's.
 */
export const buyerAsk = (message: string): boolean => {
  const t = norm(message);
  return (
    asksForLink(message) ||
    /\bpode\s+(?:me\s+)?(?:mandar|enviar)\b/.test(t) ||
    /\bcomo\s+(?:(?:eu\s+)?(?:faco|faz)\s+(?:pra|para)\s+)?pag/.test(t) ||
    [...t.matchAll(/\bquero\b/g)].some((m) => !negatedBefore(t, m.index ?? 0) && !/^\s+(?:sabe|saber|entender|ver|perguntar|tirar|confirmar|conferir|uma\s+(?:duvida|informacao))\b/.test(t.slice((m.index ?? 0) + 5)))
  );
};

/**
 * Whether the agent already offered the kit (review of f657faa, finding 6): by the words she
 * reads ("duas peças", "kit", "levando 2") or by any kit's price in her messages — "as duas saem
 * por R$ 239,80" names no kit and was offered again every turn, holding the data and the link.
 */
export const kitWasOffered = (outbound: readonly string[], kitPrices: readonly number[]): boolean => {
  const prices = kitPrices.map((p) => p.toFixed(2).replace(".", ","));
  return outbound.some(
    (m) =>
      /\b(?:[23]|duas|tr[eê]s)\s+pe[cç]as\b|\bkits?\b|\blevando\s+(?:[23]|duas|tr[eê]s)\b/i.test(m) ||
      prices.some((p) => new RegExp(`(?<![\\d.,])${p}(?![\\d])`).test(m)),
  );
};

/**
 * The path her short answer to the two options names, or null (second review of 41757c8): the whole
 * message is the answer — "a primeira", "vou de pix", "prefiro pagar quando receber", "na entrega
 * mesmo" — so a word inside another sentence ("é minha primeira compra", "a entrega é pelos
 * Correios", "minha irmã pagou no pix") names nothing, and a denial or a doubt is no answer.
 * "A primeira" is the delivery: `twoOptionsMessage` says it first.
 */
const whichOfTwo = (message: string): PaymentChoice | null => {
  // The "?" is read on her raw text, before the trailing marks are cut (third review: "pix?" stored).
  if (message.includes("?")) return null;
  const t = norm(message).trim().replace(/[^a-z0-9]+$/, "");
  if (/\b(?:nao|nunca|jamais|nem|medo|sei|talvez|pensar|tanto\s+faz|qual|quais|quanto|como|diferenca|compensa)\b/.test(t)) return null;
  const m =
    /^(?:(?:ok|sim|entao|beleza)[,\s]+)?(?:(?:prefiro|quero|escolho|pode\s+ser|fico\s+com|vou\s+querer|vou\s+de|vou)\s+)?(?:(?:a|o|na|no|pel[ao]|pagar|pagando|pagamento|de|opcao)\s+)*(primeira|primera|segunda|[12]|antecipad\w*|adiantad\w*|pix|entrega|(?:quando|na\s+hora\s+que)\s+(?:receb|cheg)\w*)(?:[,\s]+(?:mesmo|msm|entao|por\s+favor|pfv|sim|opcao|ne|kk+))*$/.exec(t);
  if (!m) return null;
  // A digit is the option only alone or after "a/o/opção": "quero 2" is two pieces (fourth review).
  if (/^[12]$/.test(m[1]!) && !/(?:^(?:(?:ok|sim|entao|beleza)[,\s]+)?|\b(?:a|o|na|no|pel[ao]|opcao)\s+)[12]\b/.test(t)) return null;
  return /^(?:primeira|primera|1|entrega|quando|na\s+hora)/.test(m[1]!) ? "cod" : "prepay";
};

/**
 * The payment path to store for the next turns, or null (review of f657faa, findings 1 and 2).
 * The link waits for a settled path, so the choice must survive the turn it was made in:
 * - the interpreter's reading, when her words choose (`choosesPath`) or answer the prompt's
 *   "Qual das duas fica melhor pra você?" naturally ("a primeira", "o antecipado", "prefiro pagar
 *   quando receber") — never a question about the two ("qual a diferença das duas?");
 * - the delivery, when she says "sim" to `DEFAULT_COD_CONFIRM` — also beside a buyer's question
 *   ("Sim! Como faço pra pagar?"), never beside another one ("sim, tem rastreio?").
 * `confirms` is `parts.some(confirmsAddress)`, computed by the caller: this file has zero imports.
 */
/** A message that is only "quero" (and its yes): "quero sim", "sim, quero!", "kero", "qro sim". */
const WANT_ONLY = /^\s*(?:(?:sim|ok|entao|ah)[\s,!]+)*(?:quero|qro|kero)(?:[\s,!]+(?:sim+|quero|qro|kero))*\s*[!.]*\s*$/;

export const pathChoiceToStore = (d: {
  interpreted: PaymentChoice | null;
  parts: readonly string[];
  lastOutbound: string;
  confirms: boolean;
  /** Her region has no payment at the door: a yes to the prepaid offer is the prepaid (grafo §65). */
  noCod?: boolean;
}): PaymentChoice | null => {
  const askedTwo = /\bqual\s+das\s+duas\b/.test(norm(d.lastOutbound));
  // The path her own words name never contradicts the reading ("o antecipado" read as cod): grafo §66.
  const named = (p: string): PaymentChoice | null => {
    const t = norm(p);
    const cod = /\b(?:entrega|na\s+porta|quando\s+cheg\w*)\b/.test(t);
    // "Pagar antes/agora", not "antes eu queria saber o prazo" (review of §66, B8).
    const prepay = /\b(?:pix|antecipad\w*|adiantad\w*|cartao)\b|\bpag\w*\s+(?:antes|agora)\b/.test(t);
    return cod === prepay ? null : cod ? "cod" : "prepay";
  };
  if (
    d.interpreted &&
    (d.parts.some((p) => choosesPath(p) && (named(p) ?? d.interpreted) === d.interpreted) ||
      (askedTwo && d.parts.some((p) => whichOfTwo(p) === d.interpreted)))
  )
    return d.interpreted;
  const yes = d.confirms && (!d.parts.some(asksSomething) || d.parts.some(buyerAsk));
  const defaultCod =
    d.interpreted !== "prepay" &&
    /\bdeixo\s+no\s+pagamento\s+na\s+entrega\b/.test(norm(d.lastOutbound)) &&
    yes;
  if (defaultCod) return "cod";
  // "quero sim" / "manda o link" to the prepaid-only offer is her yes too (second review of the E6 fixes). A list of
  // the WHOLE message, never a loose "quero": "quero pensar", "quero na entrega", "quero cancelar" are not a yes
  // (third review; grafo lesson 11). Naming the delivery is never a yes to the prepaid, "pode mandar" included.
  const wants = d.parts.every((p) => WANT_ONLY.test(norm(p)) || asksForLink(p));
  const namesCod = d.parts.some((p) => named(p) === "cod");
  return d.noCod === true && d.interpreted !== "cod" && !namesCod && (yes || wants) && offersPrepayOnly(d.lastOutbound) ? "prepay" : null;
};

/**
 * Whether the agent's message is the prepaid offer of a region without payment at the door
 * (`noCodMessage`, in her words or the model's), with no question about anything else at the end
 * (grafo §65): "ok" to "Aí na sua região … tem o antecipado" chooses it; "sim" to "… Qual seu tamanho
 * de calça?" or "… Ficou alguma dúvida?" answers that question.
 */
/**
 * She was told her region has no payment at the door (`noCodMessage`, or the model's own words): "ainda não tem pagamento na
 * entrega", "aí não chega o pagamento na entrega". A mere mention of the prepaid ("no antecipado você paga no pix") is not it
 * (review of the v19 candidates: it let the link out in the CEP's own turn).
 */
export const toldNoCod = (message: string): boolean =>
  /\bnao\s+(?:tem|chega|aceita|faz|atende|existe)\s+(?:o\s+)?pagamento\s+na\s+entrega\b/.test(norm(message));

export const offersPrepayOnly = (lastOutbound: string): boolean => {
  const t = norm(lastOutbound);
  if (!/\bantecipad/.test(t)) return false;
  const q = t.lastIndexOf("?");
  if (q === -1) return true;
  const ask = t.slice(0, q).split(/[.!?\n]/).pop() ?? "";
  return (
    /\b(?:antecipad\w*|pix|pagamento|pagar|pode\s+ser|seguir|seguimos|fechar|fechamos|combinado)\b/.test(ask) &&
    !/\b(?:tamanho|calca|cintura|cep|nome|e-?mail|cpf|kit|pecas|endereco|duvida)\b/.test(ask)
  );
};

/**
 * She said yes to the two options without choosing one (grafo §65): "sim", "pode ser", "ok" right
 * after "Qual das duas fica melhor pra você?". The prompt answers that with `DEFAULT_COD_CONFIRM`, and
 * her yes to it is stored by `pathChoiceToStore`. A choice ("a primeira", "sim, no pix"), a doubt or
 * another question is no bare yes. `confirms` is `parts.some(confirmsAddress)`, as above.
 */
export const agreesWithoutChoosing = (d: { parts: readonly string[]; lastOutbound: string; confirms: boolean }): boolean =>
  /\bqual\s+das\s+duas\b/.test(norm(d.lastOutbound)) &&
  d.confirms &&
  !d.parts.some((p) => asksSomething(p) || choosesPath(p) || whichOfTwo(p) !== null || new RegExp(PATH_WORD).test(norm(p)));

/**
 * Whether an opt-out message also asks something (R13.4, Rose): "não me manda mais
 * mensagem... só me diz o preço antes". She gets one last answer with the confirmation;
 * a plain opt-out still gets none. Deterministic and free, because it runs on the one
 * path where nothing else may be spent without reason.
 */
export const asksSomething = (message: string): boolean => {
  const t = norm(message);
  return (
    t.includes("?") ||
    /\b(me\s+(diz|diga|fala|fale|conta|conte|explica|explique|responde|responda)|quanto|qual|quais|como|onde|quando|por\s*que|pq)\b/.test(t)
  );
};

/**
 * Every message of the burst is only an acknowledgment — "ok", "aah entendi, ok", "ta bom", "👍" —
 * with no question, datum, decision or refusal in it (L2, grafo §67). Thanks are not here: "obrigada"
 * after the link is warmth worth answering (the partner liked that reply). "Sim" is not here either:
 * after a question it is a decision.
 */
const ACK_WORDS = new Set([
  "ok", "okay", "okk", "okok", "blz", "beleza", "ta", "bom", "certo", "entendi", "entendido",
  "ah", "aah", "ahh", "aham", "uhum", "hum", "hm", "hmm", "show", "joia", "combinado", "tranquilo", "tudo", "bem",
]);
export const isBareAck = (parts: readonly string[]): boolean =>
  parts.length > 0 &&
  parts.every((p) => {
    const t = norm(p).replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu, " ");
    if (t.includes("?")) return false;
    const words = t.split(/[\s,.!;]+/).filter(Boolean);
    // An emoji alone (👍) is an acknowledgment; an empty message is not.
    if (words.length === 0) return p.trim() !== "";
    return words.length <= 5 && words.every((w) => ACK_WORDS.has(w));
  });

/** The clause before `at` carries a negation: "ainda não comprei", "não vou querer". */
const negatedBefore = (t: string, at: number): boolean =>
  /\b(nao|nunca|jamais|nem)\b/.test(t.slice(0, at).split(/[,;.!?\n]/).pop() ?? "");

/**
 * She says she already bought (persona round 3, Lu and Vera): "ja fez 3 dias que comprei",
 * "fiz um pedido semana passada", "meu pedido não chegou". That is the order context the
 * post-sale handoff needs even when no order is on file — the sale may have come through
 * a channel this system does not see. A hypothetical ("e se eu não gostar, consigo
 * cancelar depois?") or a denial ("ainda não comprei") is not.
 *
 * Code review, 2026-09-24: read over her history, a bare "comprei" turned an objection
 * into a permanent handoff — "já comprei cinta antes e não gostei", "comprei um parecido em
 * outra loja". So the bare verbs (comprei, paguei) count only in the CURRENT message, and
 * never in a clause about another product, another store, the past or someone else. Only
 * the phrases that can only mean an order with us count from the history.
 */
const OTHER_PURCHASE =
  /\b(outra|outro|outras|outros|antes(?!\s+de\s+ontem)|parecid\w*|shopee|mercado|cinta|ano\s+passado|loja|internet|site|online|ultima\s+vez)\b/;
/**
 * A store that is not us wins over everything, "colete" included: "comprei um colete
 * parecido em outra loja" is an objection (code review, 2026-09-24). "Site" is left out on
 * purpose — ours is one, and "comprei o colete pelo site" is an order with us.
 */
const OTHER_STORE = /\b(outra\s+loja|outras\s+lojas|shopee|mercado(\s+livre)?|internet)\b/;
/**
 * A clause that names our product or us is about an order with us whatever else it says:
 * "comprei o colete antes de ontem" (code review, 2026-09-24). Not "pedido": "da última
 * vez meu pedido não chegou" is fear, not an order. Buying for someone else is still
 * buying: "comprei pra minha mãe, cadê?", "fiz o pedido pra ela ontem".
 *
 * Wanting THE order cancelled, or asking if it already left for delivery, only exists after a
 * purchase (persona round 2026-10-05, Lu: "quero cancelar o pedido", "já saiu pra entrega?" kept
 * her with Malu for six turns). The want is required — "posso cancelar o pedido se não servir?"
 * is still the pre-sale question — and so is the "já": "quando sai pra entrega?" is not.
 */
const ABOUT_US = /\b(colete|com\s+voces|de\s+voces)\b/;
/**
 * "uma dessas", "um desses" names the kind of product, not her order (E4, 2026-10-13: "já comprei
 * uma dessas e enrolou" went to a person) — unless the clause carries the fate of an order with us:
 * "comprei uma dessas ontem e não chegou", "…daqui", "paguei uma dessas no pix" (second review, §82).
 */
const KIND_OF_PRODUCT = /\b(?:um|uma)\s+(?:dess|dest)[ae]s?\b/;
const OUR_ORDER_SIGN = /\b(cheg\w*|entreg\w*|rastrei\w*|pedido|daqui|por\s+aqui|pix|ate\s+agora)\b/;
/** Past the comma only a LATE order counts — "…enrolou, quero saber da entrega" asks about ours, it reports nothing (review of §85). */
const LATE_ORDER_SIGN = /\b(nao\s+chegou|ate\s+agora|ainda\s+nao\s+(?:chegou|veio)|rastrei\w*|pedido|pix)\b/;
/**
 * The sign is read in the whole sentence, not the comma clause (/code-review of §82): "já comprei uma dessas, até agora nada" and
 * "comprei uma dessas semana passada, não chegou" are a late order of ours.
 */
const sentenceAt = (t: string, at: number): string => {
  const start = Math.max(...[".", "!", "?", "\n"].map((c) => t.lastIndexOf(c, at - 1))) + 1;
  const ends = [".", "!", "?", "\n"].map((c) => t.indexOf(c, at)).filter((i) => i !== -1);
  return t.slice(start, ends.length ? Math.min(...ends) : t.length);
};
const ORDER_WITH_US =
  /\b(fiz\s+(?:o\s+)?(o|um|meu)\s+pedido|ja\s+pedi\s+(o|um)\s+(colete|pedido)|meu\s+pedido\s+(ja|nao|ainda|chegou|saiu|foi|esta|ta|de|da)|o\s+pedido\s+que\s+(eu\s+)?fiz|(?:quero|queria|preciso|gostaria\s+de)\s+cancelar\s+(?:o\s+|o\s+meu\s+|meu\s+)pedido|cancela\s+(?:o\s+|o\s+meu\s+|meu\s+)pedido|ja\s+saiu\s+(?:pra|para)\s+(?:a\s+)?entrega)\b/g;
const BARE_PURCHASE = /\b(comprei|paguei)\b/g;

/**
 * She wants the delivery somewhere else, or says the checkout refused her address (real test of the operator, 2026-10-20: "Quero
 * mudar meu endereço", "La no checkout eu tentei mudar e ta falando que não tem entrega pro meu endereço"). Before an order this is a
 * new CEP to look up, never the customer service. Negation: "não quero mudar o endereço", "o endereço tá certo".
 */
export const changesAddress = (message: string): boolean => {
  const t = norm(message);
  if (/\b(?:nao|nem)\s+(?:\S+\s+){0,2}(?:mudar|trocar|alterar)\b[^.!?\n]{0,20}\bendereco\b/.test(t)) return false;
  return /\b(?:mudar|muda|trocar|troca|alterar|altera|corrigir|outro|novo|diferente)\b[^.!?\n]{0,25}\bendereco\b/.test(t) ||
    /\bendereco\b[^.!?\n]{0,20}\b(?:novo|outro|diferente|errado)\b/.test(t) ||
    /\b(?:nao\s+tem|sem)\s+entrega\s+(?:pro|pra|para\s+o|no|nesse|neste)\s+(?:meu\s+|esse\s+|novo\s+)?endereco\b/.test(t);
};

export const statesPastPurchase = (message: string, current = true): boolean => {
  const t = norm(message);
  for (const re of current ? [ORDER_WITH_US, BARE_PURCHASE] : [ORDER_WITH_US]) {
    for (const m of t.matchAll(re)) {
      const at = m.index ?? 0;
      const start = Math.max(...[",", ";", ".", "!", "?", "\n"].map((c) => t.lastIndexOf(c, at - 1))) + 1;
      const ends = [",", ";", ".", "!", "?", "\n"].map((c) => t.indexOf(c, at)).filter((i) => i !== -1);
      const clause = t.slice(start, ends.length ? Math.min(...ends) : t.length);
      if (negatedBefore(t, at) || OTHER_STORE.test(clause)) continue;
      if (OTHER_PURCHASE.test(clause) && !ABOUT_US.test(clause)) continue;
      if (KIND_OF_PRODUCT.test(clause) && !ABOUT_US.test(clause) && !OUR_ORDER_SIGN.test(clause) && !LATE_ORDER_SIGN.test(sentenceAt(t, at))) continue;
      return true;
    }
  }
  return false;
};

/**
 * She says she paid (L2, grafo §67): "pronto, paguei" handed the operator's test to a person who never
 * came, and she asked "deu certo meu pagamento?" for 35 minutes. Read per clause: a negation before it
 * ("ainda não paguei"), a question ("paguei?"), the future ("vou pagar") or another store does not count.
 */
const PAID =
  /\b(?:paguei|(?:ja\s+|ta\s+|esta\s+)pago|fiz\s+(?:o\s+)?(?:pix|pagamento)|pix\s+feito|pagamento\s+(?:feito|realizado|concluido|efetuado)|(?:efetuei|realizei)\s+o\s+pagamento|(?:finalizei|conclui)\s+(?:o\s+pagamento|a\s+compra|o\s+pedido))\b/g;
export const saysPaid = (message: string): boolean => {
  const t = norm(message);
  for (const m of t.matchAll(PAID)) {
    const at = m.index ?? 0;
    const start = Math.max(...[",", ";", ".", "!", "?", "\n"].map((c) => t.lastIndexOf(c, at - 1))) + 1;
    const ends = [",", ";", ".", "!", "?", "\n"].map((c) => t.indexOf(c, at)).filter((i) => i !== -1);
    const end = ends.length ? Math.min(...ends) : t.length;
    const clause = t.slice(start, end);
    // "paguei?" is a question; "já paguei ainda não deu baixa?" is a statement asking about its fate (sixth review).
    const asked = t[end] === "?" && t.slice(at + m[0].length, end).trim() === "";
    if (negatedBefore(t, at) || asked || OTHER_STORE.test(clause)) continue;
    // "paguei não", "paguei nao" (review of the L2 fixes, finding 5); and the door payment is no checkout paid.
    // "ainda não" negates unless what follows is the payment's fate: "já paguei ainda não caiu" is paid
    // (third review); "paguei ainda não rs", "…\nvou pagar" are not (fourth review).
    if (/^\s*(?:(?:n|nao|nada)\b|ainda\s+(?:n|nao)\b(?!\s+(?:caiu|chegou|entrou|apareceu|confirmou|compensou|recebi|recebeu|veio|consta|aparece|deu\s+certo|deu\s+baixa|foi\s+(?:aprovad|confirmad|compensad|liberad|processad|identificad)\w*)\b))/.test(t.slice(at + m[0].length)) || /\b(?:entrega|entregador|motoboy)\b/.test(clause)) continue;
    if (OTHER_PURCHASE.test(clause) && !ABOUT_US.test(clause)) continue;
    if (KIND_OF_PRODUCT.test(clause) && !ABOUT_US.test(clause) && !OUR_ORDER_SIGN.test(clause) && !LATE_ORDER_SIGN.test(sentenceAt(t, at))) continue;
    return true;
  }
  return false;
};

/**
 * She asks whether her payment went through: a question naming the payment AND its fate — "deu certo
 * meu pagamento?", "o pix caiu?" — never "aceita pix?" or "o pagamento é na entrega?" (finding 5).
 */
export const asksPaymentStatus = (message: string): boolean => {
  const t = norm(message);
  return (
    t.includes("?") &&
    /\b(?:pagamento|pix|paguei|pago)\b/.test(t) &&
    /\b(?:cai|caiu|deu\s+certo|confirm\w*|chegou|entrou|aprovad\w*|passou|compensou)\b/.test(t) &&
    // A condition on the payment itself is no question about it: "quando o pagamento for aprovado vcs mandam?"
    // (second review); any other "se"/"quando" in the message is (third review).
    !/\b(?:quando|se|depois\s+que|assim\s+que)\s+(?:o\s+)?(?:meu\s+)?(?:pagamento|pix)(?:\s+(?!(?:caiu|entrou|passou|compensou|confirmou|chegou|deu|e)\b)\w+){0,2}?\s+(?:for|cai|cair|entra|entrar|confirma|confirmar|passa|passar|compensa|compensar)\b/.test(t)
  );
};

/**
 * A nudge that only means "and my payment?" while it is being checked — "eai??", "checou?", "caiu?"
 * (L2). Outside the check it is anything at all, and is not read.
 */
export const nudgesCheck = (message: string): boolean => {
  // The whole message is the nudge (finding 5): "e aí, tem o tamanho G?", "caiu o preço?", "não deu certo" are not.
  // "certo", "já já", "oi oi" are acknowledgements, not a nudge (second review): only "e aí" / "e então" and a
  // checking verb, alone or together.
  const t = norm(message).split(/[\s,.!?;]+/).filter(Boolean).join(" ");
  const m = /^(?:(e\s?ai|eai|e\s?ae|eae|e\s+entao)\s?)?(?:ja\s+)?(checou|conferiu|verificou|caiu|deu\s+certo|confirmou)?(?:\s+ja)?$/.exec(t);
  return m !== null && (m[1] !== undefined || m[2] !== undefined);
};

/**
 * The payment receipt: an image or a document (the channel's placeholder), or the word itself — not
 * "não tenho o comprovante" nor a question about it (L2).
 */
export const isPaymentReceipt = (message: string): boolean => {
  const t = norm(message);
  // A described image is a receipt only when the description says so (review of round 2): a print of a
  // checkout error or a photo of the colete is not. The bare placeholder (no description) still is.
  if (/^\[a cliente mandou uma imagem, descrita automaticamente/.test(t)) return /^\[[^:]*:\s*comprovante\b/.test(t);
  if (/^\[a cliente mandou (?:uma imagem|um documento)\b/.test(t)) return true;
  const at = t.search(/\bcomprovante\b/);
  // Not the one she will send or lost: "vou mandar o comprovante", "perdi o comprovante" (finding 6).
  return (
    at !== -1 &&
    !t.includes("?") &&
    !negatedBefore(t, at) &&
    !/\b(?:vou|vo|depois|ja\s+ja|daqui|assim\s+que|perdi|sumiu|apaguei|cade|achar|procurar|tirar|mandarei)\b/.test(t.slice(0, at))
  );
};

/**
 * A buying decision in her own words (persona round 3, Marcinha: "vou nesse então"). Read
 * deterministically as well as by the interpreter, because missing it keeps the link
 * back from a customer who already said yes. Conservative on purpose: "quero sim" answers
 * whatever was asked, and "quero um desconto" is not a purchase. "Vou querer / levar /
 * fechar / comprar" count only with the product or at the end of the clause — "vou querer
 * pensar", "vou levar uns dias", "vou fechar aqui o whats" are not decisions — and a
 * "quando"/"depois" in the same clause, or a "mas … depois" after it, postpones it
 * ("quero a GG, mas é pra depois", "vou comprar quando cair o salário").
 */
const BUY =
  /\b(vou\s+(nesse|nessa|nele|nela)|vou\s+(querer|levar|comprar|fechar)(?=\s*(?:$|[,.!;\n]|(?:o|a|um|uma)\s+(?:colete|pp|p|m|g|gg|xgg)\b|(?:esse|essa|ele|ela|entao|sim|agora)\b|\d+\b))|quero\s+(entao|comprar|fechar|levar)|quero\s+(um|uma|o|a)\s+(pp|p|m|g|gg|xgg|colete)|(pode|me)\s+mand(ar|a)\s+o\s+link|manda\s+o\s+link|fecha(r)?\s+(pra\s+mim|entao))\b/g;

export const decidesToBuy = (message: string): boolean => {
  const t = norm(message);
  for (const m of t.matchAll(BUY)) {
    const at = m.index ?? 0;
    if (negatedBefore(t, at)) continue;
    const rest = t.slice(at);
    const clauseEnd = rest.search(/[,;.!?\n]/);
    const clause = clauseEnd === -1 ? rest : rest.slice(0, clauseEnd);
    // "vou comprar agora não" — a denial after the verb, in the same clause, cancels too.
    const LATER = String.raw`\b(depois|quando|mais\s+tarde|outro\s+dia|m[eê]s\s+que\s+vem|semana\s+que\s+vem)\b`;
    if (/\bnao\b/.test(clause) || new RegExp(LATER).test(clause)) continue;
    if (new RegExp(String.raw`\bmas\b[^.!?\n]*` + LATER).test(rest)) continue;
    return true;
  }
  return false;
};

/**
 * The decision in a burst of her messages (grafo §59): the newest word wins. True when a line
 * decides and no later line puts it off or takes it back ("quero o M" / "não, pensando bem vou
 * esperar"); false when one does; null when no line decides.
 */
const RETRACTS =
  /\b(?:depois|esperar|pensar|pensando\s+bem|desist\w*|mais\s+tarde|outro\s+dia|deixa\s+(?:pra\s+la|pra\s+depois|quieto)|agora\s+nao|melhor\s+nao|nao\s+vou\s+(?:querer|levar|comprar)|nao\s+quero\s+mais)\b/;
export const decisionInBurst = (messages: readonly string[]): boolean | null => {
  const lines = messages.flatMap((m) => m.split("\n"));
  const at = lines.findLastIndex(decidesToBuy);
  if (at === -1) return null;
  // A later line that may take it back is not read as "no": "depois de amanhã pode entregar?" is
  // a buyer (review of 21f2e29). The model, reading the whole burst, decides.
  return lines.slice(at + 1).some((l) => RETRACTS.test(norm(l))) ? null : true;
};

/**
 * She takes the purchase back (grafo §65): "desisti", "não quero mais", "deixa pra lá", "não vou
 * levar", "desisti do M". Narrower than `RETRACTS`, which also reads "depois" and "pensar" — "vou
 * pensar" has its own reply, with the link. Giving up a part of the order is no withdrawal ("deixa
 * pra lá o kit, só uma", "não quero mais o kit"), nor is impatience ("não quero mais esperar"), nor
 * dropping a datum or the freight ("deixa pra lá o email", "não quero mais pagar frete"), nor a size
 * swap ("desisti do P, manda o M"), nor the spoken negation after the verb ("desisti não", "desisti
 * nada" — only after "desisti", with no comma: "desisti, não dá" and "não vou levar não" withdraw).
 * The newest line wins: a line that buys, asks for the link or chooses a path ("mudei de ideia,
 * quero o G", "deixa pra lá, pode mandar") counts as buying; a bare "quero" does not ("quero
 * desistir"). Reviews of 58ba217 and e796416.
 */
const WITHDRAWS =
  /\b(?:desist\w*|(?:nao|nem)\s+quero\s+mais|deixa\s+(?:pra\s+la|quieto)|nao\s+vou\s+(?:mais\s+)?(?:querer|levar|comprar)|nao\s+tenho\s+(?:mais\s+)?interesse)\b/g;
const PART_OF_ORDER =
  /^\s*(?:d?[oa]s?\s+|de\s+|n[oa]\s+)?(?:kit|[23]\b|duas|tres|pecas?|outra|segunda|pix|antecipad|entrega|cartao|esperar|pensar|e-?mail|cpf|nome|tamanho|frete|pagar\s+(?:o\s+)?frete)/;
const SIZE_SWAP = /\b(?:manda|quero|prefiro|fico\s+com|troca\w*)\s+(?:[oa]\s+)?(?:pp|p|m|g|gg|xgg)\b/;
const withdraws = (line: string): boolean => {
  const t = norm(line);
  return [...t.matchAll(WITHDRAWS)].some((m) => {
    const rest = t.slice((m.index ?? 0) + m[0].length);
    return !negatedBefore(t, m.index ?? 0) && !(m[0].startsWith("desist") && /^\s*(?:nao|nada)\b/.test(rest)) && !PART_OF_ORDER.test(rest) && !SIZE_SWAP.test(rest) &&
      // "não quero mais nada" is "nothing else"; "não tenho interesse no kit" has an object (grafo §69).
      !(m[0].endsWith("quero mais") && /^\s*nada\b/.test(rest)) &&
      !(m[0].endsWith("interesse") && /^\s+(?!(?:nao|obrigad\w*|valeu|vlw|nenhum|mesmo|msm)\b)[a-z]/.test(rest));
  });
};
export const withdrawsInBurst = (messages: readonly string[]): boolean => {
  const lines = messages.flatMap((m) => m.split("\n"));
  const buys = lines.findLastIndex(
    (l) => decidesToBuy(l) || asksForLink(l) || /(?<!\bnao\s+)\bpode\s+(?:me\s+)?(?:mandar|enviar)\b(?!\s+nao\b)/.test(norm(l)) || choosesPath(l),
  );
  const quits = lines.findLastIndex(withdraws);
  return quits > buys;
};

/**
 * She turns the sale down (grafo §69). An allow-list (review of E1.1): the whole line is a refusal and
 * filler, or it is not one — "deixa pra lá por enquanto", "não vou comprar agora", "não quero mais o P",
 * "não tenho interesse não, tenho certeza que quero" carry a word the list does not have, and the model
 * answers them. "Mais nada" is no filler: "não quero mais nada" is "nothing else". A "não" after the
 * refusal that starts with "não" is its spoken echo ("não vou comprar não"); after "desisti" or "deixa pra lá"
 * it takes the refusal back ("desisti não", second review of E1.1).
 */
const DECLINE_FILLER = String.raw`(?:ah|ai|entao|olha|oi|ok|ta|bom|na verdade|pensando bem|moca|malu|obrigad[ao]s?|brigad[ao]|obg|valeu|vlw|tchau|mesmo|msm|de verdade|viu|beleza|blz|kk+|rs+|eu|ja|mas|pela|atencao)`;
const DECLINE_LINE = new RegExp(
  String.raw`^(?:${DECLINE_FILLER} )*(?:` +
    String.raw`(?:(?:nao|n|nem) quero mais(?: comprar| o colete| a cinta)?|nao vou (?:mais )?(?:querer|levar|comprar)|nao tenho (?:mais )?interesse(?: nenhum| (?:no|nesse|neste|em|pelo) (?:produto|colete|cinta|comprar|compra))?)(?: (?:${DECLINE_FILLER}|nao))*` +
    String.raw`|(?:desisti(?: d[ao] (?:compra|colete|cinta|pedido))?|desisto|deixa pra la|deixa quieto)(?: ${DECLINE_FILLER})*` +
    String.raw`)$`,
);
const words = (line: string): string => norm(line).replace(/[^a-z0-9]+/g, " ").trim();
const declineLine = (line: string): boolean => DECLINE_LINE.test(words(line));
/** After the refusal, the line keeps it closed: another refusal, a goodbye, "ok", or a bare "não". */
const staysClosed = (line: string): boolean =>
  declineLine(line) ||
  (closesConversation(line) && !line.includes("?") && onlyDoneWords(line)) ||
  /^(?:nao|n)(?: quero| obrigad[ao]| valeu)?$/.test(words(line)) ||
  isBareAck([line]);
/**
 * The newest refusal in her words and nothing after it but lines that keep it closed. Read over the
 * burst by the turn and over her recent messages by the ruler — one notion of "she came back".
 */
/**
 * R26.2 (persona Cleide, 15/10): "só pago na entrega" and then "então deixa, obrigada". A bare "então deixa" also answers
 * a smaller question ("quer o kit de 2?" — leave it), so it refuses the sale only where her region has no payment at the
 * door (`noCod`) and right after her own "só pago na entrega" — not a question ("só pago na entrega?") — her line just
 * before it, in the burst or, through `earlier` (her messages before the burst), a turn before. The refusal and its
 * condition in one line (persona cob-paga-na-porta-como: "então deixa se não tem na entrega não quero não") likewise.
 */
const ONLY_COD = /(?<!\bnao\s)\b(?:so|somente|apenas)\s+(?:pago|compro|aceito)\s+(?:na|pela)\s+entrega\b/;
const DROP_LINE = new RegExp(String.raw`^(?:${DECLINE_FILLER} )*deixa(?! eu)(?: ${DECLINE_FILLER})*$`);
const NO_COD_LINE = new RegExp(
  String.raw`^(?:${DECLINE_FILLER} )*(?:deixa se nao (?:tem|tiver|da) na entrega(?: (?:nao|n) quero)?|se nao (?:tem|tiver|da) na entrega (?:nao|n) quero)(?: ${DECLINE_FILLER}| nao)*$`,
);
const refusesPath = (line: string, before: readonly string[]): boolean =>
  NO_COD_LINE.test(words(line)) || (DROP_LINE.test(words(line)) && !(before.at(-1) ?? "").includes("?") && ONLY_COD.test(norm(before.at(-1) ?? "")));
export const declinesInBurst = (messages: readonly string[], earlier: readonly string[] = [], noCod = false): boolean => {
  // A blank line or a sticker (empty body) after the refusal is not her coming back (/code-review of E1).
  const lines = messages.flatMap((m) => m.split("\n")).filter((l) => l.trim() !== "");
  const before = earlier.flatMap((m) => m.split("\n")).filter((l) => l.trim() !== "");
  const at = lines.findLastIndex((l, i) => declineLine(l) || (noCod && refusesPath(l, [...before, ...lines.slice(0, i)])));
  return at !== -1 && lines.slice(at + 1).every(staysClosed);
};

/**
 * Her words in a conversation's newest messages (`rows` newest first, as the turn and the ruler read
 * them), oldest first, cleaned by `clean` (the turn's `spoken`) — a parameter, because a value import
 * between these mirrored modules is illegal on one side (see prompt.ts).
 */
export const herRecent = (rows: ReadonlyArray<{ direction: string; body: string | null }>, clean: (body: string) => string): string[] =>
  rows.filter((m) => m.direction === "inbound").map((m) => clean(m.body ?? "")).reverse();

/**
 * She names a price the shop does not have (H-2, persona round 2026-09-25, Tati: "faz por
 * 100 que eu levo agora" got the R$ 129,90 link). Read by the number, not by the phrasing:
 * the phrase-based first version (review, 2026-09-25) vetoed "por 116 eu levo" — Tati
 * accepting the real prepaid price — and let "não dá pra fazer por 100? quero o G" through.
 *
 * A number counts only in price context (second review: "cintura 80", "tenho 62 anos",
 * "apto 102" are not prices, and the prompt asks for the waist in cm): a money cue before
 * it ("R$", "pago", "custa"; "por", "faz", "fica", "fecha em", "só tenho" from 60, so
 * "troco por 44" stays a size) or "reais"/"eu levo" after, and no unit or body measure
 * around it ("dias", "x", "kg", "cintura 80", "apto 102"). A price within R$ 1 of the shop's is the shop's. A discount
 * percentage the shop does not give is a price too ("com 30% de desconto").
 */
const PRICE_WORDS: Record<string, string> = {
  cem: "100", cinquenta: "50", sessenta: "60", setenta: "70", oitenta: "80", noventa: "90",
};
/** Only money: from R$ 20. */
const STRONG_CUE = /(?:r\$|rs|pago|paga|pagar|pagaria|custa|custar|custando)\s*$/;
/**
 * Money or something else — "troco por 44", "fica 80 de cintura": from R$ 60, above every
 * pants size. A preposition may sit between ("fecha em 100", "sai a 100", "meu limite é 100").
 */
const WEAK_CUE =
  /\b(?:por|faz|faca|fazer|faria|fica|ficar|sai|sair|deixa|vale|valor|for|fosse|ser|fecha|fecho|fechar|consegue|conseguiria|tenho|limite|aceita|topa|cobra|cobraria|tal|da|daria)\s+(?:(?:e|em|a|de|por|so|uns|umas)\s+)*$/;
const NOT_MONEY_UNIT =
  /^\s*(?:x\b|vezes|parcelas?|anos?|kg|quilos?|kilos?|cm|m\b|metros?|%|horas?|h\b|dias?|semanas?|meses|pecas?|unidades?|numero|de\s+(?:cintura|quadril|busto|calca|sapato))/;
/**
 * A body measure, an address or a size exchange right before the number: "cintura 80",
 * "troco por 44", "apto 102". Glued to it, never anywhere in the window — "no pix por 100"
 * is a bargain (fourth review).
 */
const NOT_MONEY_BEFORE =
  /\b(?:cintura|quadril|busto|calca|calco|visto|uso|troc\w*|tamanho|numero|n[ou]?\.?|apto?|casa|bloco|rua|avenida|av)\s*(?:(?:e|de|eh|por|fica|tem|mede|da)\s+)?$/;

export const namesOwnPrice = (
  message: string,
  prices: readonly number[],
  percents: readonly number[] = [],
): boolean => {
  const t = norm(message).replace(/\b(cem|cinquenta|sessenta|setenta|oitenta|noventa)\b/g, (w) => PRICE_WORDS[w]!);
  for (const m of t.matchAll(/(?<![\d.,-])(\d{2,3})(?:[.,](\d{1,2}))?(?![\d-]|[.,]\d)/g)) {
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 24), at);
    const after = t.slice(at + m[0].length);
    if (NOT_MONEY_UNIT.test(after) || NOT_MONEY_BEFORE.test(before)) continue;
    const value = Number(m[1]) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0);
    const moneyAfter = /^\s*(?:reais|real|conto|contos|pila)\b/.test(after);
    // "100 eu pago", "100 eu levo": money only above the sizes ("o 44 eu levo" is a size).
    const offerAfter = /^\s*(?:(?:eu\s+)?(?:pago|levo|fecho|compro|pego)|ta\s+bom|pode\s+ser)\b/.test(after);
    // Cents make it money whatever the cue ("por 59,90"); a bare "por 50" is a size range
    // (36–56) and stays a residual.
    const cue =
      STRONG_CUE.test(before) || moneyAfter || (m[2] && WEAK_CUE.test(before)) ? 20 : WEAK_CUE.test(before) || offerAfter ? 60 : null;
    if (cue === null || value < cue) continue;
    if (!prices.some((p) => Math.abs(p - value) <= 1)) return true;
  }
  for (const m of t.matchAll(/(\d{1,2})\s*%\s*(?:de\s+)?(?:desconto|off)\b/g)) {
    if (!percents.includes(Number(m[1]))) return true;
  }
  return false;
};

/**
 * A goodbye that parks the sale (persona round 3, Tati: "ah deixa entao kkk vlw" got the
 * size ladder). It is answered like "vou pensar". Only the closing shape counts — "deixa
 * então eu te mandar o CEP" goes on.
 */
export const saysGoodbye = (message: string): boolean =>
  /\bdeixa\s+(entao|pra\s+la|quieto|pra\s+depois)\s*(k+|rs+|vlw|valeu|obrigad[ao]|[,.!]|$)|\b(tchau|fica\s+pra\s+proxima)\b/.test(
    norm(message).trim(),
  );

/**
 * A goodbye parks the sale only when it carries no decision (code review, 2026-09-24):
 * "quero comprar, me manda o link. tchau" and "deixa quieto, quero o G mesmo" are buying.
 */
export const goodbyeParks = (message: string, i: Interpretation): boolean =>
  saysGoodbye(message) && !decidesToBuy(message) && !i.wants_to_buy;

/**
 * M-03 (persona round 4, Jussara got the same link twice in a row): a checkout link that
 * went out in one of the last `window` outbound messages is not sent again.
 */
export const linkSentRecently = (
  recentOutbound: readonly string[],
  checkoutBases: readonly string[],
  window = 3,
): boolean => recentOutbound.slice(-window).some((m) => checkoutBases.some((base) => base !== "" && m.includes(base)));

/**
 * The checkout the newest link in these messages opens, or null (grafo §65): the longest base the
 * newest message with a link carries, so a base that prefixes another is not read as it.
 */
export const lastLinkBase = (outbound: readonly string[], checkoutBases: readonly string[]): string | null => {
  const has = (m: string) => checkoutBases.filter((b) => b !== "" && m.includes(b));
  const m = outbound.findLast((o) => has(o).length > 0);
  return m === undefined ? null : has(m).reduce((a, b) => (b.length > a.length ? b : a));
};

/**
 * Grafo §65 (supersedes M-03's three-message window for the link the turn would send): once this
 * order's checkout went out, anywhere in the conversation, it goes again only when she asks for it
 * (`asksForLink`) or the order changed — another path or kit makes another link the newest one.
 * Three questions after the link and a "tá bom" sent it again, and each resend armed a reminder.
 */
export const linkHeldBack = (
  outbound: readonly string[],
  checkoutBases: readonly string[],
  pathBase: string | undefined,
  message: string,
): boolean => pathBase !== undefined && !asksForLink(message) && lastLinkBase(outbound, checkoutBases) === pathBase;

/**
 * A payment link in her message that is not ours (persona venda-decidida, 2026-10-24: "https://encorpa.pay/checkout?size=G" was
 * answered "Combinado, fica no seu nome assim"): never endorsed, ours goes instead. A checkout, payment or cart word in it, on a
 * host that is none of `ourHosts` nor under one of them. Our own link pasted back, a site or an Instagram post is not one.
 */
export const foreignCheckoutUrl = (message: string, ourHosts: readonly string[]): string | null => {
  for (const m of message.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<>"']*/gi)) {
    const raw = m[0].replace(/[.,;!?)]+$/, "");
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = URL.canParse(href) ? new URL(href) : null;
    if (!url || !/\./.test(url.hostname)) continue;
    const host = url.hostname.toLowerCase();
    if (ourHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`))) continue;
    if (/checkout|pay|pagamento|pagar|pix|boleto|carrinho|cart|compra|order|pedido/i.test(`${host}${url.pathname}${url.search}`)) return raw;
  }
  return null;
};

/**
 * She asks for the link herself ("manda o link de novo", "não achei o link") — the M-03
 * window does not hold it back (code review, 2026-09-24). Only the request form counts:
 * "você já mandou o link", "mandei o link pra minha irmã" and "não precisa mandar o link"
 * say she has it, and a refusal, a condition or someone else forwarding it is not a
 * request (second review).
 */
export const asksForLink = (message: string): boolean => {
  const t = norm(message);
  // Pre-round test 2026-10-13 (…7967): "N recebi link", "Nao tem LINK", "Nao tem link moça" — she never got one, and the
  // agent sent her up the chat four times.
  // "Não tem link de pix?" asks about a way to pay, not for the link (R23 review).
  if (/\b(?:nao|n)\s+(?:achei|acho|abriu|abre|chegou|veio|vi|recebi|encontrei|tem|apareceu|aparece)\s+(?:o\s+|nenhum\s+)?link\b(?!\s+(?:de|do|da|pra|pro|para|no|na)\b)/.test(t)) return true;
  // "Consegue gerar um novo link?", "consegue me gerar o pagamento?" (same conversation): a new link asked for. A refusal or
  // a condition after it is not a request ("não precisa gerar outro link", "gera o link amanhã").
  const generate = /\b(?:gera|gerar|gere)\s+(?:me\s+)?(?:um\s+|o\s+|outro\s+)?(?:novo\s+)?(?:link|pagamento)\b/.exec(t);
  if (generate && !/\b(?:nao|precisa)\s+(?:\S+\s+){0,2}$/.test(t.slice(0, generate.index)) && !/\b(?:se|quando|depois|amanha|mais\s+tarde)\b/.test(t.slice(generate.index + generate[0].length))) return true;
  // Second real test (grafo §66): "você nao vai me mandar o link do checkout????" — the cobrança, in a
  // question — and "então manda logo" / "sim pode mandar" as the whole message.
  if (
    /\b(?:nao\s+)?vai\s+(?:me\s+)?(?:mandar|enviar|passar)\s+(?:o\s+)?(?:link|checkout)\b[^?]*\?/.test(t) &&
    // A condition is no request for now ("se eu escolher pix vai me mandar o link?", "… amanhã?").
    // "Quando vai me mandar o link?" is the cobrança itself (review of §66, M2); "quando eu pagar" is a condition.
    !/\bse\b|\b(?:quando|depois)\s+(?:eu|ela|voce|vc|tiver|der|puder|chegar|pagar|escolher)\b|\b(?:amanha|mais\s+tarde)\b/.test(t)
  )
    return true;
  if (/^\s*(?:(?:entao|sim|ok|ta|pode|ah)[\s,]+)*(?:(?:me\s+)?(?:manda|mande|envia|envie)\s+(?:logo|agora|ja|ai|aqui)|pode\s+(?:me\s+)?(?:mandar|enviar))\s*[!.]*\s*$/.test(t)) return true;
  // "sim, manda" as the whole message, after a yes (persona venda-compra-forte, 2026-10-24); a bare "manda" stays out.
  if (/^\s*(?:(?:entao|sim|ok|ta|pode|isso|blz|beleza)[\s,]+)+(?:manda|mande|envia|envie)\s*[!.]*\s*$/.test(t)) return true;
  // "cadê o link" is the cobrança itself (persona venda-curiosa, 2026-10-24).
  if (/\bcade\s+(?:o\s+)?(?:meu\s+)?link\b/.test(t)) return true;
  // "pode agendar pra mim" (persona cob-gatilho-formatura, 2026-10-24): the delivery offer's own "Vamos agendar seu pedido?" answered
  // yes — the checkout is where it is scheduled. Never denied, put off or about a day ("agenda pra sexta").
  for (const m of t.matchAll(/(?:^|[,;.!?\n]\s*|\b(?:sim|ok|entao|ta|blz)\s+)(?:(?:ah|sim|entao|ok|ta|por\s+favor)\s+)*(?:pode\s+(?:me\s+)?agendar|agenda|agende)(?:\s+(?:pra|para)\s+mim)?\b/g)) {
    const after = t.slice((m.index ?? 0) + m[0].length);
    if (/\b(?:nao|se|quando|depois|amanha|mais\s+tarde|noite|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|cheia|lotada)\b/.test(after)) continue;
    return true;
  }
  // An allowlist, not a blocklist (second review, three rounds): the imperative opens the
  // clause, after at most a filler ("ah", "sim", "pode", "me"…), and no condition follows.
  for (const m of t.matchAll(
    // "só manda o link aí", "tá então me manda o link" (persona cob-pago-na-entrega-sim and gatilho-formatura, 2026-10-24).
    /(?:^|[,;.!?\n]\s*)(?:(?:ah|sim|entao|ok|por\s+favor|so|ta|blz)\s+)*(?:(?:me\s+)?(?:manda|mande|envia|envie|passa|passe|reenvia|reenvie)|pode\s+(?:me\s+)?(?:mandar|enviar|passar|reenviar))\s+(?:(?:o|um|esse|aquele)\s+)?(?:link|checkout)\b/g,
  )) {
    // The whole rest of the message: "manda o link, mas só amanhã" and "passa o link, não!"
    // are not a request for now (second review, 5th round).
    // "Só" puts it off only before a time ("só às 18h", "só a partir de"): "manda o link só aí eu vejo" asks for it now (2026-10-24).
    const after = t.slice((m.index ?? 0) + m[0].length);
    if (/\b(?:nao|se|quando|depois|amanha|mais\s+tarde|noite|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|so\s+(?:as|a\s+partir|la\s+pr?a|de\s+tarde|mais))\b/.test(after)) continue;
    return true;
  }
  return false;
};
