/**
 * Size recommendation. Deterministic by decision (round 1): the table is sent and
 * she picks; measuring tape is never required. When she gives a waist measurement
 * that falls between two sizes, the bigger one wins — it holds the same and is
 * more comfortable all day, which is what keeps it out of the 7-day return window.
 */
export const SIZES = ["P", "M", "G", "GG", "XGG"] as const;
export type Size = (typeof SIZES)[number];

/**
 * The published size table, and the only one. Waist in cm, plus the clothing size the
 * customer actually knows — the column the site prints as "equivale ao manequim"
 * (`Offer.tsx` :16-20) and the knowledge base repeats. Both lookups read this array, so
 * they cannot disagree with each other; a test asserts the array still matches the site.
 *
 * It used to be two hardcoded ladders, and they DID disagree. `sizeFromDressSize` said
 * 42 was M and 46 was G, while the site told the same customer 42 is G and 46 is GG —
 * one size smaller than she was promised, on every even step. A size too small comes
 * back, and under cash on delivery a return is the whole freight, lost.
 */
const RANGES: ReadonlyArray<{ size: Size; min: number; max: number; dressMax: number }> = [
  { size: "P", min: 60, max: 68, dressMax: 36 },
  { size: "M", min: 68, max: 76, dressMax: 40 },
  { size: "G", min: 76, max: 84, dressMax: 44 },
  { size: "GG", min: 84, max: 92, dressMax: 48 },
  { size: "XGG", min: 92, max: 100, dressMax: 52 },
];

/** Foreign size charts the customer may quote instead of ours. */
const ALIASES: Record<string, Size> = {
  s: "P", p: "P", pp: "P",
  m: "M",
  l: "G", g: "G",
  xl: "GG", gg: "GG",
  xxl: "XGG", "2xl": "XGG", "3xl": "XGG", xgg: "XGG", eg: "XGG",
};

export const sizeFromLabel = (label: string): Size | null =>
  ALIASES[label.trim().toLowerCase().replace(/\s+/g, "")] ?? null;

export const sizeFromWaist = (cm: number): Size => {
  if (cm <= RANGES[0]!.min) return "P";
  if (cm >= RANGES[RANGES.length - 1]!.max) return "XGG";
  // Boundaries belong to the larger size: 76 cm is G, not M — "na dúvida, o maior".
  const hit = RANGES.find((r) => cm >= r.min && cm < r.max);
  return hit?.size ?? "XGG";
};

/**
 * The clothing size she actually knows, resolved through the published table. Between
 * two rows the larger wins, the same rule the waist lookup follows and for the same
 * reason: a piece that is slightly loose is worn, a piece that is tight comes back.
 */
export const sizeFromDressSize = (n: number): Size =>
  RANGES.find((r) => n <= r.dressMax)?.size ?? "XGG";

/** Plausible clothing sizes a customer would actually quote. */
const DRESS_SIZE_RE = /\b(3[4-9]|4[0-9]|5[0-6])\b/g;

/**
 * Units that make a number something other than a dress size. "Tenho 44 anos" is
 * the one that actually happened: the intent classifier called it a sizing turn —
 * correctly, she was asking whether the product suited her — and the number was
 * read as a clothing size. The unit is the signal, not the intent.
 *
 * Shoes are the other trap, and a worse one, because the numbers overlap exactly:
 * "calço 38" and "uso 38 de sapato" are a foot, not a waist, and 38 would have been
 * written down as an M. Nothing about the number itself says which — only the words
 * around it do.
 */
const NOT_A_SIZE =
  /^\s*(anos?|kg|quilos?|kilos?|cm|m|metros?|reais?|%|horas?|dias?|minutos?|semanas?|meses|de\s+(sapato|tenis|t\u00eanis|sandalia|sand\u00e1lia|chinelo|bota|p[e\u00e9]))\b/i;

/**
 * A foot named before the number. `calço` is the giveaway and it is one letter from
 * `calça`, which is the most natural way to state a clothing size in Brazil.
 */
const SHOE_CUE = /\b(cal[c\u00e7]o|sapato|t[e\u00ea]nis|sand[a\u00e1]lia|chinelo|bota|p[e\u00e9])\b[^.!?]{0,12}$/i;

/**
 * What a customer says right before naming her size. "Manequim" is in here because some
 * people do say it — but the agent never asks with that word, because most do not know
 * it. What they say is "uso 42 de calça", and every shape of that is a cue.
 */
const SIZE_CUE =
  /(tamanho|veste|visto|vestia|uso|usa|usava|cal[c\u00e7]a|blusa|vestido|saia|short|numero|n\u00famero|sou|entre)\D{0,14}$/i;

/**
 * M-02 (operator, 2026-09-24): "manequim" never sets the size. Marcinha's "meu manequim é
 * 40" flipped her G to M in rounds 3 and 4 — a number she used to wear, not the calça she
 * wears now. The word right before the number (after any cue) or right after it takes the
 * number out. Dress and blouse numbers still count: the conversation corpus and real
 * customers state the size that way ("eu visto 42 de vestido").
 */
const OTHER_GARMENT = /\bmanequim\b[^\d]{0,14}$/i;
const OTHER_GARMENT_AFTER = /^\s*(de|do|da|no|na)\s+manequim\b/i;

/** She named two sizes because she sits between them, not because she named two things. */
const RANGE_ANSWER = /\b(entre|ou|a|e)\s+\d{2}\b/i;

/**
 * The cue is denied in its own clause: "não uso 40, uso 46" states one size and
 * rejects another, and reading the first one writes G's customer down as an M. Same
 * blindness the guardrail chain had, in the one module whose output outlives the
 * conversation — `leads.size` is what the post-order ruler reads back to her, and a
 * wrong size under cash on delivery is a return. The clause boundary is what lets the
 * second half of the same sentence still count.
 */
const NEGATED_CUE = /\b(nao|não|nunca|jamais)\b[^,;.!?]*$/i;

/**
 * Pulls a dress size out of free text, so it can be resolved through
 * `sizeFromDressSize` instead of left for the model to eyeball.
 *
 * A number alone is not a size. It counts only when the message frames it as one —
 * a cue word before it, or a message that is just the number, which is what an
 * answer to "que tamanho de calça você usa?" looks like — and never when a unit or a
 * shoe right after it says otherwise. Guessing here is expensive in both directions: a wrong size
 * becomes a return, and a size invented from someone's age becomes a wrong size
 * that outlives the conversation.
 */
export const extractDressSize = (text: string): number | null => {
  if (/^\s*\d{2}\s*$/.test(text)) {
    const bare = Number(text.trim());
    return bare >= 34 && bare <= 56 ? bare : null;
  }

  // Two passes over the same numbers: `cued` is what a cue word actually introduces,
  // `plausible` is every number the units and the shoe guard did not rule out. The
  // second pass only matters for a range, where the cue sits before the first number
  // and the second one has nothing in front of it but "e".
  const cued: number[] = [];
  const plausible: number[] = [];
  for (const match of text.matchAll(DRESS_SIZE_RE)) {
    const at = match.index ?? 0;
    if (NOT_A_SIZE.test(text.slice(at + match[0]!.length))) continue;
    const before = text.slice(0, at);
    if (NEGATED_CUE.test(before) || SHOE_CUE.test(before) || OTHER_GARMENT.test(before)) continue;
    if (OTHER_GARMENT_AFTER.test(text.slice(at + match[0]!.length))) continue;
    plausible.push(Number(match[1]));
    if (SIZE_CUE.test(before)) cued.push(Number(match[1]));
  }
  if (cued.length === 0) return null;

  // "entre 42 e 44" and "42 ou 44" are one answer, not two: she is between sizes and
  // does not know which. The larger wins, the same rule the table itself follows —
  // loose is worn, tight comes back.
  return RANGE_ANSWER.test(text) ? Math.max(...plausible) : cued[0]!;
};

/**
 * The size as a letter, the way she says it: "uso M", "ela usa G", "tamanho GG", or a
 * message that is only the letter — the answer to "qual tamanho?". Karol's "G" on its own
 * line (personas, 2026-09-24) was read as nothing, and the M from two turns earlier stayed.
 * A cue is required for anything longer than the bare letter, and the same clause
 * negation as the numbers applies: "não uso M, uso G" is a G.
 */
// "é o G dela", "o G mesmo" also state it (persona round 2026-09-25: Karol's "e o G dela"
// was read only by the interpreter, and the scorecard counted a size flip).
const LETTER_RE =
  /\b(?:(?:uso|usa|usava|visto|veste|vestia|tamanho)\s+(?:o\s+|um\s+)?|o\s+(?=(?:pp|p|m|gg|g|xgg|eg)\s+(?:dela|dele|mesmo)\b))(pp|p|m|gg|g|xgg|eg)\b/gi;

export const extractSizeLetter = (text: string): Size | null => {
  // A line that is only the letter — WhatsApp messages arrive as several lines at once.
  for (const line of text.split("\n")) {
    const bare = line.trim().match(/^(pp|p|m|gg|g|xgg|eg)[.!]?$/i);
    if (bare) return sizeFromLabel(bare[1]!);
  }
  for (const match of text.matchAll(LETTER_RE)) {
    if (NEGATED_CUE.test(text.slice(0, match.index ?? 0))) continue;
    return sizeFromLabel(match[1]!);
  }
  return null;
};

const larger = (a: Size | null, b: Size | null): Size | null =>
  a === null ? b : b === null ? a : SIZES.indexOf(a) >= SIZES.indexOf(b) ? a : b;

/**
 * The size the interpreter read, resolved through the same table (R13.1). The model reads;
 * the table decides. When she gives more than one — "G, 46 de calça" — the larger wins,
 * the rule the table itself follows between two rows: loose is worn, tight comes back.
 */
export const sizeFromInterpreted = (read: {
  letter: string | null;
  pants: number | null;
  waist_cm: number | null;
}): Size | null => {
  const letter = read.letter === null ? null : sizeFromLabel(read.letter);
  const pants = read.pants === null ? null : sizeFromDressSize(read.pants);
  const waist = read.waist_cm === null ? null : sizeFromWaist(read.waist_cm);
  return larger(larger(letter, pants), waist);
};

/** Words that make a clause a question about sizes rather than a statement of hers. */
const QUESTION_CLAUSE = /\b(t[e\u00ea]m|existe|vem|serve|qual|quais|pra\s+quem|para\s+quem)\b/i;

/**
 * The size this message states, if any. The deterministic readers are the fast path and
 * win when they find something; the interpreter is the fallback for what they cannot read.
 * Whatever comes out REPLACES the stored size — a size she states now is the current one,
 * including when it is for someone else ("é pra minha mãe, ela usa G, 46").
 */
export const statedSizeOf = (
  message: string,
  interpreted: { letter: string | null; pants: number | null; waist_cm: number | null } | null = null,
): Size | null => {
  // A question is not a stated size: "tem tamanho GG?", "o M serve em quem usa 44?" asked
  // about a size and used to overwrite hers (code review, 2026-09-24). A clause that ends
  // in "?" — or, since WhatsApp questions often have no "?", one that carries a question
  // or existence word ("tem tamanho GG", "pra quem usa 50", "o M serve") — is left out of
  // the fast path; the interpreter, told the same, is the one that reads it.
  const statements = message
    .split(/(?<=[,;.!?\n])/)
    .filter((clause) => !clause.trim().endsWith("?") && !QUESTION_CLAUSE.test(clause))
    .join("");
  const dress = extractDressSize(statements);
  const fast = larger(dress === null ? null : sizeFromDressSize(dress), extractSizeLetter(statements));
  return fast ?? (interpreted === null ? null : sizeFromInterpreted(interpreted));
};

/**
 * Whether the agent's message asked for her size — the condition that opens the clarify
 * ladder. Read on the question itself, so a size merely mentioned is not a question.
 */
/**
 * "Número" is a size only when it is the pants number — followed by the question mark, by
 * "de calça", or by "que você usa/veste". "Qual o número da sua casa?", "seu número de CPF",
 * "número de WhatsApp" are the address and identity asks (code review, 2026-09-24).
 */
const NUMBER = String.raw`n[u\u00fa]mero(?=\s*(?:\?|d[ea]\s+cal[c\u00e7]a|que\s+(?:voc|vc)|(?:voc|vc)\S*\s+(?:usa|veste)))`;

export const asksForSize = (text: string): boolean => {
  const questions = text.split(/(?<=[.!?\n])\s*/).filter((q) => q.trim().endsWith("?"));
  // The question has to be ABOUT her size — "qual/que tamanho", "que número de calça",
  // "você veste" — not merely mention it: "fico por aqui pra ajudar com tamanho ou pedido,
  // quer que eu explique a troca?" restarted the ladder for Neusa (persona round 3).
  return questions.some((q) =>
    new RegExp(
      String.raw`\b(qual|que|quais)\s+(?:(?:o|a|e|\u00e9)\s+)?(?:(?:o|a|seu|sua)\s+)?(tamanho|${NUMBER}|manequim|cal[c\u00e7]a|numera[c\u00e7][a\u00e3]o)` +
        String.raw`|\b(voc[e\u00ea]|vc)\s+(usa|veste|visto)\b(?!\s+(?:o\s+)?(?:cart|pix|dinheiro|boleto|whats))` +
        String.raw`|\b(seu|sua)\s+(tamanho|${NUMBER}|manequim|cintura)\b|\bqual\s+a\s+(sua\s+)?cintura\b|\bescolher\s+o\s+tamanho\b`,
      "i",
    ).test(q),
  );
};

export const sizeTable = (): string =>
  RANGES.map((r) => `${r.size} — cintura ${r.min} a ${r.max} cm`).join("\n");
