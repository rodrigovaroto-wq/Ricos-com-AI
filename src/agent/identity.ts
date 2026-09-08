/**
 * Name, e-mail and CPF — the three things the Coinzz order requires and the
 * conversation never asked for.
 *
 * This is the same discipline `address.ts` follows, for the same reason: an order
 * created with a wrong document is rejected by the payment side, and one created with
 * a wrong e-mail leaves the customer with no confirmation and us with no way to reach
 * her. So nothing is guessed. A field that is not unambiguous stays missing and
 * becomes a question.
 *
 * CPF is checked by its own check digits, not by shape. `111.111.111-11` has eleven
 * digits and is not a CPF, and it is exactly what someone types to get past a form.
 */

export interface Identity {
  name: string;
  email: string;
  /** Digits only, validated. */
  document: string;
}

export const IDENTITY_FIELDS = ["name", "email", "document"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

const digitsOnly = (s: string): string => s.replace(/\D/g, "");

/**
 * A CPF's last two digits are computed from the first nine. Rejecting repdigits first
 * is not an optimisation: they satisfy the arithmetic, so the check alone lets
 * `000.000.000-00` through.
 */
export const isValidCpf = (input: string): boolean => {
  const d = digitsOnly(input);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digitAt = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i += 1) sum += Number(d[i]) * (upTo + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digitAt(9) === Number(d[9]) && digitAt(10) === Number(d[10]);
};

/** The CPF in free text, only if the digits check out. */
export const extractCpf = (text: string): string | null => {
  for (const m of text.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)) {
    if (isValidCpf(m[0])) return digitsOnly(m[0]);
  }
  // Some people type it as eleven bare digits with no punctuation at all.
  for (const m of text.matchAll(/\b\d{11}\b/g)) {
    if (isValidCpf(m[0])) return digitsOnly(m[0]);
  }
  return null;
};

/**
 * The e-mail, if there is exactly one thing that looks like one. Deliberately strict
 * about the tail: `joao@gmail` is what people send when the keyboard swallowed the
 * rest, and accepting it produces an order whose confirmation goes nowhere.
 */
export const extractEmail = (text: string): string | null => {
  const m = text.match(/\b[\w.+-]+@[\w-]+(?:\.[\w-]{2,})+\b/);
  return m ? m[0].toLowerCase() : null;
};

const NOT_A_NAME =
  /\b(rua|avenida|av|travessa|bairro|cep|numero|apto|cpf|email|colete|tamanho|obrigad|quanto|preco|pre[çc]o)\b/i;

/**
 * Her name, from the message where she gives it. Only two shapes are read: an explicit
 * introduction, and a short message that is nothing but a name. Anything else — a
 * sentence, an address line, a question — stays missing, because a name written into
 * the order wrong is on the package.
 */
export const extractName = (text: string): string | null => {
  const cleaned = text.replace(/\s+/g, " ").trim();

  const introduced = cleaned.match(
    /\b(?:meu\s+nome\s+(?:é|e|eh)|me\s+chamo|nome\s*[:=]|sou\s+a|aqui\s+é\s+a?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´`\s]{1,60})/i,
  );
  const candidate = introduced?.[1] ?? (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´`\s]{1,60}$/.test(cleaned) ? cleaned : null);
  if (candidate === null) return null;

  const name = candidate
    .replace(/[.,;!?].*$/, "")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 5)
    .join(" ");

  if (name.length < 2 || NOT_A_NAME.test(name)) return null;
  // A single word is a name only when she introduced it. "Oi" on its own is not.
  if (introduced === null && name.split(" ").length < 2) return null;
  return name;
};

export interface IdentityResult {
  fields: Partial<Identity>;
  missing: IdentityField[];
}

export const extractIdentity = (text: string): IdentityResult => {
  const fields: Partial<Identity> = {
    ...(extractName(text) ? { name: extractName(text)! } : {}),
    ...(extractEmail(text) ? { email: extractEmail(text)! } : {}),
    ...(extractCpf(text) ? { document: extractCpf(text)! } : {}),
  };
  return { fields, missing: IDENTITY_FIELDS.filter((f) => !fields[f]) };
};

/** Merges a later message over what is already known. Known wins, as with the address. */
export const mergeIdentity = (
  known: Partial<Identity>,
  found: Partial<Identity>,
): IdentityResult => {
  const fields: Partial<Identity> = { ...found, ...known };
  return { fields, missing: IDENTITY_FIELDS.filter((f) => !fields[f]) };
};

export const isIdentityComplete = (fields: Partial<Identity>): fields is Identity =>
  IDENTITY_FIELDS.every((f) => Boolean(fields[f]));

/**
 * One question at a time, in the order that feels least like a form. The name first
 * because it is the one she gives without thinking; the CPF last because it is the one
 * that makes people hesitate, and by then she has already invested in the conversation.
 */
export const nextIdentityQuestion = (missing: readonly IdentityField[]): string | null => {
  const asks: Record<IdentityField, string> = {
    name: "Qual é o seu nome completo?",
    email: "Qual é o seu e-mail? É pra onde vai a confirmação do pedido.",
    document: "Por último, o seu CPF — a transportadora precisa dele pra entregar.",
  };
  const next = IDENTITY_FIELDS.find((f) => missing.includes(f));
  return next ? asks[next] : null;
};
