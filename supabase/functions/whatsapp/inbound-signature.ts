/**
 * The inbound seal (security review, 2026-09-25): n8n's `encorpa-inbound` is a public URL,
 * so a message that reaches the turn through it proves where it came from with an HMAC
 * made by the `whatsapp` function, keyed by a secret only Supabase holds
 * (`INBOUND_SIGNING_SECRET`). n8n passes it through untouched; the turn checks it.
 *
 * Signed: the message id, the phone, the text and Meta's timestamp — everything that
 * decides who the turn talks to, what it answers and when the 24-hour window opened — and,
 * on a tap, the button's id, which is what grants or refuses the marketing opt-in (R15.1).
 * Only when present, so a message without a tap keeps the seal it always had.
 *
 * Mirrored byte for byte into `supabase/functions/turn/` and `supabase/functions/whatsapp/`.
 */
export interface Sealed {
  externalId: string;
  from: string;
  body: string;
  sentAt?: string;
  reply?: { id: string };
}

/** A JSON array: no field can borrow a separator from its neighbour (second review). */
const fields = (m: Sealed): unknown[] => [m.externalId, m.from, m.body, m.sentAt ?? "", ...(m.reply ? [m.reply.id] : [])];
const canonical = (m: Sealed): string => JSON.stringify(fields(m));

/** Only strings are sealed or checked: an array would stringify into the same text. */
const allStrings = (m: Sealed): boolean => fields(m).every((v) => typeof v === "string");

const hmacHex = async (secret: string, text: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const sealInbound = (secret: string, m: Sealed): Promise<string> => hmacHex(secret, canonical(m));

/** Constant time; an empty secret or signature verifies nothing. */
export const sealIsValid = async (secret: string, m: Sealed, signature: unknown): Promise<boolean> => {
  if (secret === "" || typeof signature !== "string" || signature === "" || !allStrings(m)) return false;
  const expected = await sealInbound(secret, m);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
};
