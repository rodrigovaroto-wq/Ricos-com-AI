/**
 * Size recommendation. Deterministic by decision (round 1): the table is sent and
 * she picks; measuring tape is never required. When she gives a waist measurement
 * that falls between two sizes, the bigger one wins — it holds the same and is
 * more comfortable all day, which is what keeps it out of the 7-day return window.
 */
export const SIZES = ["P", "M", "G", "GG", "XGG"] as const;
export type Size = (typeof SIZES)[number];

/** Waist in cm, measured over the underwear, without pulling the tape. */
const RANGES: ReadonlyArray<{ size: Size; min: number; max: number }> = [
  { size: "P", min: 60, max: 68 },
  { size: "M", min: 68, max: 76 },
  { size: "G", min: 76, max: 84 },
  { size: "GG", min: 84, max: 92 },
  { size: "XGG", min: 92, max: 100 },
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

/** Brazilian dress size (manequim) is what she actually knows. */
export const sizeFromDressSize = (n: number): Size => {
  if (n <= 38) return "P";
  if (n <= 42) return "M";
  if (n <= 46) return "G";
  if (n <= 50) return "GG";
  return "XGG";
};

/** Plausible Brazilian dress sizes (manequim) a customer would actually quote. */
const DRESS_SIZE_RE = /\b(3[4-9]|4[0-9]|5[0-6])\b/g;

/**
 * Units that make a number something other than a dress size. "Tenho 44 anos" is
 * the one that actually happened: the intent classifier called it a sizing turn —
 * correctly, she was asking whether the product suited her — and the number was
 * read as a manequim. The unit is the signal, not the intent.
 */
const NOT_A_SIZE = /^\s*(anos?|kg|quilos?|kilos?|cm|m|metros?|reais?|%|horas?|dias?|minutos?|semanas?|meses)\b/i;

/** What a customer says right before naming her manequim. */
const SIZE_CUE = /(manequim|tamanho|veste|visto|vestia|uso|usava|calc[oa]|numero|número)\D{0,12}$/i;

/**
 * Pulls a dress size out of free text, so it can be resolved through
 * `sizeFromDressSize` instead of left for the model to eyeball.
 *
 * A number alone is not a size. It counts only when the message frames it as one —
 * a cue word before it, or a message that is just the number, which is what an
 * answer to "qual seu manequim?" looks like — and never when a unit right after it
 * says otherwise. Guessing here is expensive in both directions: a wrong size
 * becomes a return, and a size invented from someone's age becomes a wrong size
 * that outlives the conversation.
 */
export const extractDressSize = (text: string): number | null => {
  if (/^\s*\d{2}\s*$/.test(text)) {
    const bare = Number(text.trim());
    return bare >= 34 && bare <= 56 ? bare : null;
  }

  for (const match of text.matchAll(DRESS_SIZE_RE)) {
    const at = match.index ?? 0;
    if (NOT_A_SIZE.test(text.slice(at + match[0]!.length))) continue;
    if (SIZE_CUE.test(text.slice(0, at))) return Number(match[1]);
  }
  return null;
};

export const sizeTable = (): string =>
  RANGES.map((r) => `${r.size} — cintura ${r.min} a ${r.max} cm`).join("\n");
