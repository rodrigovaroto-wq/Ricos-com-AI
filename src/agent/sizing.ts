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

export const sizeTable = (): string =>
  RANGES.map((r) => `${r.size} — cintura ${r.min} a ${r.max} cm`).join("\n");
