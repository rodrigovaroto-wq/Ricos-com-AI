/**
 * The A/B arm of a lead (E2.3). Two experiments, two INDEPENDENT sorts from her phone, so a
 * lead in arm 1 of A says nothing about B: `{ A: 0|1, B: 0|1 }`, written once on `leads.arm`.
 *
 * Stable by construction — the phone is the only input, so the same woman lands in the same arm
 * on every turn and every retry. Mirrored byte for byte into the Edge Function.
 */
export type Arm = { readonly A: 0 | 1; readonly B: 0 | 1 };

/** FNV-1a then murmur3's finalizer: FNV alone leaves the low bit tied to the last byte (":A" vs ":B"). */
const bitOf = (text: string): 0 | 1 => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) & 1) as 0 | 1;
};

export const armOf = (phone: string): Arm => ({ A: bitOf(`${phone}:A`), B: bitOf(`${phone}:B`) });

/** Which `BusinessConfig.experiments` flag each arm letter switches. */
const EXPERIMENT = { A: "fastOpening", B: "linkAfterChoice" } as const;

/**
 * Whether experiment `which` changes this lead's turn: live in the config AND she is in arm 1.
 * `experiments` absent (the production secret until the operator writes it) = nobody in a test.
 */
export const armOn = (
  experiments: { fastOpening?: boolean; linkAfterChoice?: boolean } | undefined,
  arm: Arm | null | undefined,
  which: keyof Arm,
): boolean => experiments?.[EXPERIMENT[which]] === true && arm?.[which] === 1;
