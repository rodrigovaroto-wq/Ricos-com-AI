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
  email: string | null;
  email_unavailable: boolean;
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
}

/** What a failed or garbled interpretation reads as: nothing detected. */
export const NEUTRAL_INTERPRETATION: Interpretation = Object.freeze({
  asks_human: false,
  wants_cancel: false,
  post_sale: false,
  wants_exchange: false,
  opt_out: false,
  size: Object.freeze({ letter: null, pants: null, waist_cm: null, for_other_person: false }),
  email: null,
  email_unavailable: false,
  payment_choice: null,
  wants_to_think: false,
  wants_to_buy: false,
  pending_answer: "no_pending",
  units: null,
  unit_sizes: Object.freeze([]) as unknown as SizeLetter[],
  unit_pants: Object.freeze([]) as unknown as number[],
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
  '- "asks_human": true só se ela pede para falar com uma PESSOA/atendente/humano no lugar',
  '  da assistente ("me passa pra uma pessoa", "quero falar com alguém de verdade"). false',
  '  para "você é robô?", "é IA?", "tem alguém aí?" (só conferindo se alguém responde),',
  '  "não quero falar com atendente" e qualquer negação.',
  '- "wants_cancel": true só se ela quer cancelar um pedido que JÁ FEZ.',
  '- "post_sale": true se ela fala de um pedido que JÁ FEZ (onde está, quando chega, troca,',
  "  devolução, problema com a entrega).",
  '- "wants_exchange": true só se ela quer TROCAR o tamanho de um colete que JÁ COMPROU',
  '  ("ficou pequeno, quero trocar pelo G", "dá pra trocar o tamanho?"). Pergunta antes de comprar',
  '  ("e se não servir, dá pra trocar?"), devolução e cancelamento: false.',
  '- "opt_out": true se ela pede para não receber mais mensagens.',
  '- "size": { "letter": "P"|"M"|"G"|"GG"|"XGG"|null, "pants": número da CALÇA ou null',
  '  (manequim, número de vestido, de blusa ou de sapato NÃO é calça: pants null),',
  '  "waist_cm": cintura em cm ou null, "for_other_person": true se o tamanho é de outra',
  "  pessoa (mãe, filha, amiga) }. Só o tamanho que ela AFIRMA usar nesta mensagem; idade,",
  "  peso, sapato e preço não são tamanho. PERGUNTA não é tamanho dito: \"tem GG?\", \"qual",
  "  tamanho pra quem usa 44?\", \"o M serve?\" → tudo null. Se ela corrige o tamanho, use o novo.",
  '- "email": o e-mail que ela escreveu, ou null.',
  '- "email_unavailable": true se ela diz que não tem e-mail ou não quer passar.',
  '- "payment_choice": "prepay" se ela escolhe pagar antes (pix, cartão, antecipado),',
  '  "cod" se escolhe pagar na entrega, null se não escolheu.',
  '- "wants_to_think": true se ela diz que vai pensar, ver depois, falar com alguém antes, ou',
  '  se despede desistindo por agora ("deixa pra lá", "deixa então, vlw").',
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
].join("\n");

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

const flag = (v: unknown): boolean => v === true;

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
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
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
      // Same strictness as `extractEmail`: a truncated address is worse than none.
      email: /^[\w.+-]+@[\w-]+(?:\.[\w-]{2,})+$/.test(email) ? email : null,
      email_unavailable: flag(o.email_unavailable),
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
const QUANTITY_CUE = /\b(?:kit|par|cada|outr[oa]s?|mais\s+uma?)\b/;
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
    !new RegExp(`\\b(?:uso|visto|numero|n|apto|ap|casa|rua|as)\\s*${units}\\b`).test(text)) ||
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

/** The words the operator listed as naming a person (R13.2). */
const PERSON_WORD =
  /\b(pessoa|atendente|humano|humana|alguem|gente de verdade|vendedora?|responsavel|gerente|suporte)\b/g;

/**
 * A refusal cancels the request only when it is ATTACHED to the person-word: between the
 * refusal and the word there may be only the connecting words of that same refusal —
 * "não quero falar com atendente", "não precisa chamar atendente", "nao preciso de ajuda de
 * atendente", "não quero que me passe pra atendente", "dispenso atendente". A refusal of
 * something else does not: in "não quero robô quero uma pessoa" and "nao quero esperar
 * quero atendente", "robô" and "esperar" are not connecting words, so the request stands
 * (code reviews, 2026-09-24). "Não tem um atendente?" is no refusal at all.
 */
const REFUSED_BEFORE =
  /\b(?:(?:nao|nunca|jamais)\s+(?:quero|queria|preciso|precisa|precisava)|dispenso|dispensa)\s+(?:(?:falar|conversar|com|de|ajuda|chamar|chama|que|me|passe|passar|passa|transferir|transfira|pra|para|por|ser|atendida|atendido|um|uma|o|a|do|da|nenhum|nenhuma)\s+)*$/;

/** "Você é uma pessoa?" asks what she is talking to — it is not a request for someone else. */
const IDENTITY_QUESTION_BEFORE = /\b(voce|vc|ce|tu)?\s*(e|eh)\s+(um|uma)?\s*$/;

/**
 * Whether the message itself names a person being asked for — the deterministic half of
 * the human-request rule, so a model that hallucinates `asks_human` on "você é robô?" does
 * not end a sale. The clause is what the negation is read against (the lesson of
 * `negation-blindness`): "não quero falar com robô, quero uma pessoa" still names one.
 */
export const namesAPerson = (message: string): boolean => {
  const t = norm(message);
  for (const m of t.matchAll(PERSON_WORD)) {
    const at = m.index ?? 0;
    const clauseStart = Math.max(...[",", ";", ".", "!", "?", "\n"].map((c) => t.lastIndexOf(c, at - 1))) + 1;
    const clause = t.slice(clauseStart, at);
    if (REFUSED_BEFORE.test(clause) || IDENTITY_QUESTION_BEFORE.test(clause)) continue;
    return true;
  }
  return false;
};

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
  return norm(message)
    .split(/[^a-z]+/)
    .filter(Boolean)
    .every((w) => DONE_WORDS.test(w));
};
const DONE_WORDS =
  /^(?:tchau\w*|brigad[ao]s?|obrigad[ao]s?|valeu|vlw|flw|encerr\w*|finaliz\w*|ja|fiz|fechei|comprei|paguei|recebi|chegou|chegaram|amei|adorei|gostei|certinho|certo|tudo|ok|okay|beleza|blz|sim|entao|por|aqui|ate|mais|logo|boa|bom|tarde|noite|dia|muito|muita|pela|pelo|ajuda|atencao|conversa|voce|vc|te|pra|e|o|a|os|as|meu|minha|pedido|coletes?|bjs|beijos?|abraco|deus|abencoe\w*|k+|rs+|ai|hoje|estou|to|ta|usando|serviu|ficou|otim[oa]|perfeit\w*|lind[oa]|coracao|demais|amor|deu|viu|semana|proxima|fica|com|de|pix|paciencia|atendimento|malu|obg|brigadao|gratidao|tmj|sim|vesti|ja|nossa)$/;

/**
 * She closes the conversation — thanks, goodbye, "já fiz". After the link is in the chat,
 * this is not "vou pensar": the link is not sent again (persona round, 2026-09-25).
 */
export const closesConversation = (message: string): boolean =>
  /\b(?:tchau\w*|brigad[ao]|brigadao|obrigad[ao]+|obg|gratidao|tmj|abencoe\w*|valeu|vlw|encerr\w*|finaliz\w*|ja\s+(?:fiz|fechei|comprei|paguei)|ate\s+(?:mais|logo)|boa\s+(?:tarde|noite))\b/.test(norm(message));

/**
 * The three reasons that hand a conversation to a person, and the only three (R13.2):
 * an order she wants to cancel, a question about an order that exists, or a person asked
 * for in so many words. The last needs BOTH the reading and a person-word in her text;
 * the exact phrase list (`wantsHuman`) hands off earlier in the turn, before this runs. Nothing else — a vetoed
 * reply, a failed rewrite, a confused customer — ever returns non-null here.
 *
 * Cancel and post-sale need an order to be about (`orderContext`): an order on file for
 * the lead, or a checkout link already sent in the conversation. "E se eu não gostar,
 * consigo cancelar depois?" before any purchase is a pre-sale question the agent answers.
 */
export const handoffFor = (
  i: Interpretation,
  message: string,
  orderContext: boolean,
): HandoffKind | null => {
  if (orderContext && i.wants_cancel) return "cancel";
  // Everything about an order goes to a person EXCEPT a happy close: "obrigada, já
  // finalizei" handed the buyer to a person (persona round). Requiring a question instead
  // lost "ficou pequeno", "me cobraram frete" (seventh review) — exclude, never require.
  if (orderContext && i.post_sale && !reportsDone(message)) return "post_sale";
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
  "(?:pix|antecipad\\w*|adiantad\\w*|cartao|entrega|na\\s+porta|pag\\w*\\s+(?:antes|agora|adiantado)|link\\s+do\\s+pix|(?:quando|na\\s+hora\\s+que)\\s+(?:cheg|receb)\\w*|receb\\w*\\s+e\\s+(?:depois\\s+)?pag\\w*)";
export const choosesPath = (message: string): boolean => {
  const t = norm(message);
  const m =
    new RegExp(`\\b(?:quero|vou|prefiro|pode\\s+ser|pode\\s+mandar|fecho|fechar|manda|escolho|opto|melhor|pago|pagar)\\b[^.!?]{0,30}?\\b${PATH_WORD}`).exec(t) ??
    new RegExp(`^\\s*(?:(?:ok|beleza|entao|sim|pode\\s+ser)[,\\s]+)?(?:no\\s+|na\\s+|pelo\\s+|pela\\s+|de\\s+)?${PATH_WORD}(?:[,\\s]+(?:mesmo|entao|pfv|por\\s+favor|sim))?(?:\\s*[.!]*\\s*$|\\s*,)`).exec(t);
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
    after.includes("?") && !(/^\s*(?:sim|mesmo|entao)?\s*,/.test(after) && !new RegExp(PATH_WORD).test(after));
  return !upTo.includes("?") && !/\b(?:quanto|qual|se\s+eu|e\s+se|compensa|diferenca)\b/.test(upTo) && !questionAfter;
};

/**
 * Which checkout the link opens (R13.4): the prepaid one when she chose it or when her
 * region has no cash on delivery, the delivery one otherwise.
 */
/**
 * Her answer read against the agent's last message (review of f657faa; re-review of 35d70c0): the
 * choice that answers the payment question is hers even when it is not a full sentence — "a
 * primeira", "opção 1", "1", "a do pix", "a da entrega" (ordinals in the order that message named
 * the paths, not a fixed sentence), "pagar quando receber", or a yes to a question that offers one
 * path ("Fica no pagamento na entrega, pode ser?", or "Pagando no pix você ganha 10%. Prefere
 * assim?" — a short question reads the sentence before it). Where her region has no payment at
 * the door, a yes to a question about the prepaid path (or to the prepaid message itself, when it
 * asks nothing) is the prepaid. A yes to both options without choosing is not stored: the turn
 * asks the delivery's confirmation first (`assentsToBoth`, `DEFAULT_COD_CONFIRM`). Null when the
 * message offered no path, its last question is about something else, or she asked, doubted or
 * refused.
 */
const COD_OFFER = /\bpag\w*\s+na\s+entrega\b|\bna\s+entrega\b|\bquando\s+receb\w*/;
const PREPAY_OFFER = /\bantecipad\w*|\bpix\b|\badiantad\w*/;
const ASSENT =
  /^(?:sim|isso|isso\s+mesmo|certo|ok|okay|pode\s+ser|pode|ta\s+bom|ta|beleza|blz|fechado|combinado|bora|vamos|perfeito|claro|quero(?!\s+(?:saber|ver|entender|perguntar)\b))\b[\s!.,]*(?:sim|entao|pode\s+ser|quero|vamos|fechado)?[\s!.]*$/;
/** A question that offers a choice between paths. */
const CHOICE_Q = /\b(?:das\s+duas|qual\s+(?:voce\s+)?prefere|qual\s+(?:fica|e)\s+melhor|como\s+(?:voce\s+)?(?:prefere|quer)\s+pagar|qual\s+(?:delas|opcao))\b/;
/** A short question that asks her to agree with the sentence before it. */
const SHORT_OK = /^[^?]{0,30}\b(?:prefere|pode\s+ser|tudo\s+bem|combinado|fica\s+bom|assim|seguir|seguimos|certo|beleza)\b[^?]{0,20}\?$/;
const TAIL = String.raw`(?:\s+mesmo)?[\s!.,]*(?:por\s+favor|pfv|pf)?[\s!.]*$`;
const LEAD = String.raw`^(?:(?:a|o|na|no|pela|pelo|com|fico\s+com|quero|prefiro|vou|vou\s+de|pode\s+ser)\s+)*`;
const FIRST = new RegExp(`${LEAD}(?:(?:a\\s+)?primeira(?:\\s+opcao)?|opcao\\s+(?:1|um)|1)${TAIL}`);
const SECOND = new RegExp(`${LEAD}(?:(?:a\\s+)?segunda(?:\\s+opcao)?|opcao\\s+(?:2|dois)|2)${TAIL}`);
const NAMED = new RegExp(
  `${LEAD}(?:d[aoe]\\s+|n[ao]\\s+|pel[ao]\\s+)?(?:o\\s+|a\\s+)?(pix|cartao|antecipad\\w*|adiantad\\w*|entrega|pag\\w*\\s+na\\s+entrega)${TAIL}`,
);
/** Another subject in a short question — a size, a kit, a quantity, a date, another datum. */
const OTHER_SUBJECT = /\b(?:pp|p|m|g|gg|xgg|tamanho|kit|pecas?|duas|tres|\d+|dia|data|amanha|hoje|semana|cep|nome|e-?mail|cpf)\b/;
const readOffer = (lastOutbound: string) => {
  const o = norm(lastOutbound);
  const sentences = o.split(/(?<=[.!?\n])\s*/).filter((x) => x.trim() !== "");
  const qi = sentences.findLastIndex((x) => x.trim().endsWith("?"));
  const question = qi === -1 ? "" : sentences[qi]!.trim();
  const named = (t: string) => COD_OFFER.test(t) || PREPAY_OFFER.test(t);
  // The short question borrows the sentence before it only in the same bubble (no blank line
  // between) and with no subject of its own: "O M fica bom, tudo bem?" is about the size (697ead2).
  const prev = qi > 0 ? sentences[qi - 1]! : "";
  const sameBubble = prev !== "" && !/\n\s*\n/.test(o.slice(o.lastIndexOf(prev) + prev.length, o.lastIndexOf(question)));
  const borrows = !named(question) && SHORT_OK.test(question) && !OTHER_SUBJECT.test(question) && sameBubble;
  const scope = borrows ? `${prev} ${question}` : question;
  return { o, question, scope, aboutPath: named(scope) || CHOICE_Q.test(question) };
};
/** Her lines when they are a plain answer: no question, no doubt, no refusal. */
const plainLines = (parts: readonly string[]): string[] | null => {
  const lines = parts.map((p) => norm(p).trim()).filter(Boolean);
  return lines.length === 0 || lines.some((l) => l.includes("?") || /\b(?:nao|nem|talvez|duvida)\b/.test(l)) ? null : lines;
};
export const pathAnswer = (
  lastOutbound: string,
  parts: readonly string[],
  codAvailable: boolean | null,
): PaymentChoice | null => {
  const { o, question, scope, aboutPath } = readOffer(lastOutbound);
  const lines = plainLines(parts);
  if (lines === null) return null;
  const said = lines.join("\n");
  if (codAvailable === false) {
    // The prepaid message asks nothing, or its question is about the prepaid (re-review of 35d70c0).
    const offered = question === "" ? PREPAY_OFFER.test(o) : PREPAY_OFFER.test(scope);
    return offered && lines.every((l) => ASSENT.test(l)) ? "prepay" : null;
  }
  if (!aboutPath) return null;
  const codAt = o.search(COD_OFFER);
  const prepayAt = o.search(PREPAY_OFFER);
  if (codAt !== -1 && prepayAt !== -1) {
    const first: PaymentChoice = codAt < prepayAt ? "cod" : "prepay";
    const second: PaymentChoice = first === "cod" ? "prepay" : "cod";
    if (FIRST.test(said)) return first;
    if (SECOND.test(said)) return second;
    const named = NAMED.exec(said);
    if (named) return /entrega/.test(named[1]!) ? "cod" : "prepay";
  }
  if (codAt !== -1 && /\bpag\w*\s+(?:so\s+)?(?:quando|na\s+hora\s+que|depois\s+que)\s+(?:eu\s+)?(?:cheg|receb)\w*|\breceb\w*\s+e\s+(?:depois\s+)?pag\w*/.test(said)) return "cod";
  // A yes to a question that offers one path only; to both, the delivery is confirmed first.
  const cod = COD_OFFER.test(scope);
  const prepay = PREPAY_OFFER.test(scope);
  if (lines.every((l) => ASSENT.test(l)) && cod !== prepay) return cod ? "cod" : "prepay";
  return null;
};

/**
 * She said yes to the two options without choosing (re-review of 35d70c0): the prompt's default,
 * the delivery, is confirmed with `DEFAULT_COD_CONFIRM` — never the two options asked again, which
 * looped. Only where the delivery reaches her.
 */
export const assentsToBoth = (lastOutbound: string, parts: readonly string[], codAvailable: boolean | null): boolean => {
  if (codAvailable === false) return false;
  const { o, scope, aboutPath } = readOffer(lastOutbound);
  const lines = plainLines(parts);
  return (
    lines !== null &&
    aboutPath &&
    COD_OFFER.test(o) &&
    PREPAY_OFFER.test(o) &&
    COD_OFFER.test(scope) === PREPAY_OFFER.test(scope) &&
    lines.every((l) => ASSENT.test(l))
  );
};

/**
 * A choice stored while her region had no payment at the door is the prepaid by force: when a new
 * CEP finds the delivery, it is not hers to keep, and the two options are offered (re-review of
 * 35d70c0). Any other stored choice holds.
 */
export const storedChoiceHolds = (stored: PaymentChoice | null, storedWithoutCod: boolean, codNow: boolean | null): boolean =>
  !(stored === "prepay" && storedWithoutCod && codNow === true);

/**
 * The payment path stored for the next turns (review of f657faa): her explicit choice as the
 * interpreter read it, when her words choose (`choosesPath`), or her answer to the payment
 * question (`pathAnswer`). Unstored, the next turn has no path and asks again, forever.
 */
export const choiceToStore = (
  interpreted: PaymentChoice | null,
  parts: readonly string[],
  lastOutbound: string,
  codAvailable: boolean | null,
): PaymentChoice | null =>
  (interpreted !== null && parts.some(choosesPath) ? interpreted : null) ?? pathAnswer(lastOutbound, parts, codAvailable);

/**
 * The kit, offered once after she chose how to pay and before the data (operator, 2026-10-06), and
 * after the size and the CEP, so the offer never shares a message with another question.
 */
export const kitOfferDue = (s: {
  units: number;
  pathChosen: boolean;
  missing: LinkDatum | null;
  kitsOnPath: number;
  kitOffered: boolean;
  linkNow: boolean;
}): boolean =>
  s.units === 1 && s.pathChosen && s.missing !== "size" && s.missing !== "cep" && s.kitsOnPath > 0 && !s.kitOffered && !s.linkNow;

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
  /** The e-mail is known, or she refused it once (`refusedAsks`, `email_unavailable`). */
  emailDone: boolean;
  /** A valid CPF is known, or she refused it twice. */
  cpfDone: boolean;
}

/**
 * The first datum the link still waits for, or null when it may go (operator, 2026-10-06,
 * superseding R13.4's "link first, the checkout asks the rest"): size, CEP, payment path,
 * full name, e-mail and CPF, in this order. The order is the directive's: one thing at a time.
 */
export const missingForLink = (d: LinkData): LinkDatum | null =>
  !d.sizeKnown ? "size"
  : !d.cepKnown ? "cep"
  : !d.pathSettled ? "payment"
  : !d.nameKnown ? "name"
  : !d.emailDone ? "email"
  : !d.cpfDone ? "document"
  : null;

/**
 * Whether the link goes out this turn: every datum is in, and her message is not a bare "sim"
 * beside a question (`yesBesideQuestion`) — the H-2 exception that let an ignored identity ask
 * send the link is gone with R13.4 (the data now come first).
 */
export const sendLinkNow = (d: LinkData & { yesBesideQuestion: boolean }): boolean =>
  !d.yesBesideQuestion && missingForLink(d) === null;

/**
 * Whether the link goes out this turn (review of f657faa). The first time, with every datum in.
 * Once a link went out in this conversation — read over the whole conversation, not a window —
 * it goes again only when she asks for it or the order changed (another path, another kit: a
 * different checkout), and then name, e-mail and CPF no longer hold it: the checkout asks them.
 * She took the purchase back (`withdrawsInBurst`): no link.
 */
export const linkGoesOut = (
  d: LinkData & { yesBesideQuestion: boolean; sentBefore: boolean; orderChanged: boolean; asked: boolean; withdrew: boolean },
): boolean => {
  if (d.withdrew) return false;
  if (!d.sentBefore) return sendLinkNow(d);
  const missing = missingForLink(d);
  return (
    !d.yesBesideQuestion &&
    (d.asked || d.orderChanged) &&
    (missing === null || missing === "name" || missing === "email" || missing === "document")
  );
};

/** Each checkout host once — what the turn searches her conversation for (re-review of 35d70c0). */
export const checkoutHosts = (bases: readonly string[]): string[] => [
  ...new Set(
    bases.flatMap((b) => {
      try {
        return [new URL(b).host];
      } catch {
        return [];
      }
    }),
  ),
];

/** The checkout a message carries: the longest base in it, so a kit's URL that extends the single piece's is the kit's. */
export const linkedBase = (message: string, bases: readonly string[]): string | null =>
  bases.filter((b) => b !== "" && message.includes(b)).sort((a, b) => b.length - a.length)[0] ?? null;

/**
 * She takes the purchase back in her newest words (review of f657faa): "desisti", "não quero
 * mais", "deixa pra lá", "mudei de ideia" — and no later line decides again. Narrower than
 * `RETRACTS` on purpose: "depois de amanhã pode entregar?" and "vou pensar no kit" are buyers, and
 * "não vou querer o kit" refuses the kit, not the piece. A negated one ("não desisti") is not.
 */
const WITHDRAWS =
  /\b(?:desisti(?!\s+d[oa]\s+kit)\w*|desist(?:o|ir)\b|nao\s+quero\s+mais|nao\s+vou\s+mais\s+(?:querer|levar|comprar)|deixa\s+pra\s+la|mudei\s+de\s+ideia)/;
const KEEPS_BUYING = /\b(?:kit|so\s+uma?|uma?\s+so|quero|vou\s+levar|levo|manda\w*|link|tamanho|pp|p|m|g|gg|xgg|duas|tres|\d)\b/;
export const withdrawsInBurst = (messages: readonly string[]): boolean => {
  const lines = messages.flatMap((m) => m.split("\n")).map(norm);
  const at = lines.findLastIndex((l) => {
    // Each withdrawal in the line. The rest of the line may take back only a piece, or go on buying
    // (re-review of 35d70c0): "deixa pra lá o kit, só uma", "mudei de ideia, quero o G". What the
    // withdrawal takes ("desisti do M") and a negated span ("não quero mais o G", "não vou levar")
    // never count as buying (697ead2).
    return [...l.matchAll(new RegExp(WITHDRAWS.source, "g"))].some((m) => {
      if (/\bnao\s*$/.test(l.slice(0, m.index))) return false;
      const rest = l
        .slice((m.index ?? 0) + m[0].length)
        .replace(/^\s*(?:d[oa]|o|a)\s+(?:pp|p|m|g|gg|xgg|colete|pedido|compra)\b/, "")
        .replace(/\b(?:nao|nem|nada)\b[^,;.!?]*/g, "");
      return !(decidesToBuy(rest) || asksForLink(rest) || KEEPS_BUYING.test(rest));
    });
  });
  return at !== -1 && !lines.slice(at + 1).some((l) => decidesToBuy(l) || /^(?:quero|vou\s+levar)\b/.test(l));
};

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
    // "quero saber/ver/entender/perguntar" asks, it does not buy (review of f657faa).
    [...t.matchAll(/\bquero\b(?!\s+(?:saber|ver|entender|perguntar)\b)/g)].some((m) => !negatedBefore(t, m.index ?? 0))
  );
};

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
const ORDER_WITH_US =
  /\b(fiz\s+(?:o\s+)?(o|um|meu)\s+pedido|ja\s+pedi\s+(o|um)\s+(colete|pedido)|meu\s+pedido\s+(ja|nao|ainda|chegou|saiu|foi|esta|ta|de|da)|o\s+pedido\s+que\s+(eu\s+)?fiz|(?:quero|queria|preciso|gostaria\s+de)\s+cancelar\s+(?:o\s+|o\s+meu\s+|meu\s+)pedido|cancela\s+(?:o\s+|o\s+meu\s+|meu\s+)pedido|ja\s+saiu\s+(?:pra|para)\s+(?:a\s+)?entrega)\b/g;
const BARE_PURCHASE = /\b(comprei|paguei)\b/g;

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
      return true;
    }
  }
  return false;
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
 * She asks for the link herself ("manda o link de novo", "não achei o link") — the M-03
 * window does not hold it back (code review, 2026-09-24). Only the request form counts:
 * "você já mandou o link", "mandei o link pra minha irmã" and "não precisa mandar o link"
 * say she has it, and a refusal, a condition or someone else forwarding it is not a
 * request (second review).
 */
export const asksForLink = (message: string): boolean => {
  const t = norm(message);
  if (/\bnao\s+(?:achei|acho|abriu|abre|chegou|veio|vi|recebi|encontrei)\s+(?:o\s+)?link\b/.test(t)) return true;
  // An allowlist, not a blocklist (second review, three rounds): the imperative opens the
  // clause, after at most a filler ("ah", "sim", "pode", "me"…), and no condition follows.
  for (const m of t.matchAll(
    /(?:^|[,;.!?\n]\s*)(?:(?:ah|sim|entao|ok|por\s+favor)\s+)*(?:(?:me\s+)?(?:manda|mande|envia|envie|passa|passe|reenvia|reenvie)|pode\s+(?:me\s+)?(?:mandar|enviar|passar|reenviar))\s+(?:(?:o|um|esse|aquele)\s+)?link\b/g,
  )) {
    // The whole rest of the message: "manda o link, mas só amanhã" and "passa o link, não!"
    // are not a request for now (second review, 5th round).
    const after = t.slice((m.index ?? 0) + m[0].length);
    if (/\b(?:nao|se|quando|depois|amanha|mais\s+tarde|noite|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|so)\b/.test(after)) continue;
    return true;
  }
  return false;
};
