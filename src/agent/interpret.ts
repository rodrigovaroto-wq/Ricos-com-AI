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
  '- "size": { "letter": "P"|"M"|"G"|"GG"|"XGG"|null, "pants": número da calça ou null,',
  '  "waist_cm": cintura em cm ou null, "for_other_person": true se o tamanho é de outra',
  "  pessoa (mãe, filha, amiga) }. Só o tamanho que ela AFIRMA usar nesta mensagem; idade,",
  "  peso, sapato e preço não são tamanho. PERGUNTA não é tamanho dito: \"tem GG?\", \"qual",
  "  tamanho pra quem usa 44?\", \"o M serve?\" → tudo null. Se ela corrige o tamanho, use o novo.",
  '- "email": o e-mail que ela escreveu, ou null.',
  '- "email_unavailable": true se ela diz que não tem e-mail ou não quer passar.',
  '- "payment_choice": "prepay" se ela escolhe pagar antes (pix, cartão, antecipado),',
  '  "cod" se escolhe pagar na entrega, null se não escolheu.',
  '- "wants_to_think": true se ela diz que vai pensar, ver depois, falar com alguém antes.',
  '- "wants_to_buy": true se ela diz claramente que quer comprar/fechar/pedir.',
  '- "pending_answer": compare com a ÚLTIMA mensagem da assistente.',
  '  "answered" = a assistente fez uma pergunta e a mensagem responde;',
  '  "other_question" = ela faz uma pergunta própria ou traz um assunto real novo;',
  '  "unrelated" = a assistente perguntou algo e a mensagem não responde nem pergunta nada',
  '  que faça sentido ("ta", "?", "kkk", assunto solto);',
  '  "no_pending" = a assistente não deixou pergunta e a mensagem não pergunta nada.',
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
    },
  };
};

const norm = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
 * The three reasons that hand a conversation to a person, and the only three (R13.2):
 * an order she wants to cancel, a question about an order that exists, or a person asked
 * for in so many words. The last needs BOTH the reading and a person-word in her text,
 * or the exact phrase list (`wantsHuman`) the turn already ran. Nothing else — a vetoed
 * reply, a failed rewrite, a confused customer — ever returns non-null here.
 *
 * Cancel and post-sale need an order to be about (`orderContext`): an order on file for
 * the lead, or a checkout link already sent in the conversation. "E se eu não gostar,
 * consigo cancelar depois?" before any purchase is a pre-sale question the agent answers.
 */
export const handoffFor = (
  i: Interpretation,
  message: string,
  exactHumanRequest: boolean,
  orderContext: boolean,
): HandoffKind | null => {
  if (orderContext && i.wants_cancel) return "cancel";
  if (orderContext && i.post_sale) return "post_sale";
  if (exactHumanRequest || (i.asks_human && namesAPerson(message))) return "human";
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
  if ((lastAskedSize || step > 0) && i.pending_answer === "unrelated") {
    return { kind: "reply", text: CLARIFY_SIZE_REPLIES[step]! };
  }
  return { kind: "none" };
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

/** She is ready for the link — whether or not the size is known yet. */
export const readyForLink = (args: {
  identityComplete: boolean;
  interpretation: Interpretation;
  identityAsked: boolean;
  identityGiven: boolean;
}): boolean =>
  args.identityComplete ||
  args.interpretation.wants_to_buy ||
  args.interpretation.email_unavailable ||
  (args.identityAsked && !args.identityGiven);

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
