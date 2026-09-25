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
  '  então", "vou querer", "pode mandar o link", "quero um G". Compra com condição de preço',
  '  ("faz por 100 que eu levo", "se baixar eu compro") não é decisão: false.',
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
 * because "nothing detected" and "could not read" must not drive the same decision
 * (the clarify ladder, for one, only runs on a real reading).
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
 * The three fixed lines of the clarify ladder, word for word from the operator (R13.4),
 * then silence. The step is read back from what was last sent, so there is no counter to
 * store and no schema change: the conversation history IS the state.
 */
export const CLARIFY_SIZE_REPLIES = [
  "Desculpa, não entendi, qual o tamanho que deseja?",
  "Precisa de ajuda para escolher o tamanho?",
  "Quando decidir é só me falar que prossigo com a criação do seu pedido.",
] as const;

export type ClarifyDecision = { kind: "none" } | { kind: "reply"; text: string } | { kind: "silent" };

/**
 * What the ladder does with this message.
 *
 * It only runs on a real reading (`interpreted`): a failed call reads as "nothing
 * detected", and silence decided on no information would be the worst failure here.
 * Anything that carries meaning — a size, her own question, a decision, a payment choice,
 * an e-mail — steps off the ladder and the conversation goes on normally.
 */
export const decideClarify = (args: {
  interpreted: boolean;
  interpretation: Interpretation;
  lastOutbound: string;
  lastAskedSize: boolean;
  sizeFound: boolean;
  /**
   * She was just told "Sem problemas, estou aqui…" (she will think, or said goodbye). The
   * ladder does not START again right after that — Neusa got it twice in a row (persona
   * round 3); a ladder already under way still runs its course.
   */
  parked?: boolean;
  /**
   * Anything the deterministic readers took from the message — a CEP, an address piece, a
   * name, an e-mail, a CPF. Data is never "unrelated": silencing "meu cep é 01310-100,
   * Maria Souza" would throw away exactly what the sale needs (code review, 2026-09-24).
   */
  factsFound: boolean;
}): ClarifyDecision => {
  const { interpreted, interpretation: i, lastOutbound, lastAskedSize, sizeFound, factsFound } = args;
  if (!interpreted) return { kind: "none" };
  const step = (CLARIFY_SIZE_REPLIES as readonly string[]).indexOf(lastOutbound.trim()) + 1;
  const meaningful =
    sizeFound ||
    factsFound ||
    i.pending_answer === "answered" ||
    i.pending_answer === "other_question" ||
    i.wants_to_buy ||
    i.wants_to_think ||
    i.email !== null ||
    i.email_unavailable ||
    i.payment_choice !== null;
  if (meaningful) return { kind: "none" };
  if (step === CLARIFY_SIZE_REPLIES.length) return { kind: "silent" };
  if (step === 0 && args.parked === true) return { kind: "none" };
  if ((lastAskedSize || step > 0) && i.pending_answer === "unrelated") {
    return { kind: "reply", text: CLARIFY_SIZE_REPLIES[step]! };
  }
  return { kind: "none" };
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
export const linkPathFor = (
  choice: PaymentChoice | null,
  region: { cod: boolean } | null,
): PaymentChoice => (choice === "prepay" || (region !== null && !region.cod) ? "prepay" : "cod");

/**
 * Whether the link goes out this turn without waiting for the rest of her identity
 * (R13.4). E-mail and CPF stopped being a condition: the checkout form asks for whatever
 * the link did not fill. What remains is the signal that she is ready — the three the
 * operator named, plus the complete identity that already sent it before.
 */
export const sendLinkNow = (args: {
  identityComplete: boolean;
  interpretation: Interpretation;
  /** The agent's last message asked for name, e-mail or CPF... */
  identityAsked: boolean;
  /** ...and this message brought none of them. */
  identityGiven: boolean;
  /**
   * Never a link without a size (code review, 2026-09-24): on the delivery checkout she
   * types the size herself, and a blank one is picked by the warehouse — a return at the
   * operator's cost. Without it, the turn asks the size first.
   */
  sizeKnown: boolean;
}): boolean => args.sizeKnown && readyForLink(args);

/**
 * She is ready for the link — whether or not the size is known yet.
 *
 * H-2 (operator, 2026-09-25): the link goes only once she confirms she wants to buy; a
 * link sent while she is still asking rushes her and loses the sale. Letting the name
 * question pass still counts — the agent asks it only after she decided — but not when
 * she let it pass to ask something new: that is a customer still deciding.
 */
export const readyForLink = (args: {
  identityComplete: boolean;
  interpretation: Interpretation;
  identityAsked: boolean;
  identityGiven: boolean;
}): boolean =>
  args.identityComplete ||
  args.interpretation.wants_to_buy ||
  args.interpretation.email_unavailable ||
  (args.identityAsked && !args.identityGiven && args.interpretation.pending_answer !== "other_question");

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
 */
const ABOUT_US = /\b(colete|com\s+voces|de\s+voces)\b/;
const ORDER_WITH_US =
  /\b(fiz\s+(?:o\s+)?(o|um|meu)\s+pedido|ja\s+pedi\s+(o|um)\s+(colete|pedido)|meu\s+pedido\s+(ja|nao|ainda|chegou|saiu|foi|esta|ta|de|da)|o\s+pedido\s+que\s+(eu\s+)?fiz)\b/g;
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
 * A purchase on a condition the shop does not meet is not a decision (H-2, persona round
 * 2026-09-25, Tati: "faz por 100 que eu levo agora" sent the checkout link at R$ 129,90).
 * Only the bargain shapes count: asking for a price ("faz por 100", "se baixar", "por 100
 * eu levo") or a discount/installment as the condition. A denial of the bargain ("não
 * precisa fazer por 100, manda o link") is not one.
 */
const BARGAIN =
  /\b(?:(?:faz|faca|faria|fazer|deixa|deixaria)\s+(?:por|a|pra)\s+(?:r\$\s*)?\d+|se\s+(?:voce\s+|vc\s+)?(?:fizer|fazer|baixar|abaixar|tirar|der\s+(?:um\s+)?desconto|parcelar|dividir)|por\s+(?:r\$\s*)?\d+[^.!?\n]{0,20}\b(?:levo|compro|fecho|pego)|com\s+desconto[^.!?\n]{0,20}\b(?:levo|compro|fecho|pego))/g;

export const bargainsToBuy = (message: string): boolean => {
  const t = norm(message);
  for (const m of t.matchAll(BARGAIN)) {
    if (!negatedBefore(t, m.index ?? 0)) return true;
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
