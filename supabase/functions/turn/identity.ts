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
 * Two words of letters is not a name, and treating it as one was the most embarrassing
 * bug in this file: "boa tarde", "bom dia", "quero comprar", "muito obrigada" all became
 * the customer's PERMANENT name — written to the lead, carried into the checkout link and
 * into the order body, addressed to her on the parcel.
 *
 * The rule now: a bare message becomes a name only if nothing in it is a common word.
 * A name she actually introduces ("meu nome é...") is trusted as before, because there
 * the sentence itself says what follows is a name.
 */
const COMMON_WORDS =
  /\b(oi+|ol[aá]|opa|eae|desculpa|desculpe|foi\s+mal|sumi|sumida|k{2,}|rs+|(?:ha){2,}|(?:he){2,}|mds|bom|boa|dia|tarde|noite|tudo|bem|beleza|blz|certo|claro|sim|nao|ok|okay|obrigada?|obg|valeu|vlw|por|favor|pfv|quero|queria|posso|pode|vou|vamos|comprar|compro|fechar|fechado|gostei|adorei|amei|show|legal|otimo|otima|perfeito|perfeita|entao|agora|ainda|so|ja|mais|menos|muito|muita|aqui|ali|sei|isso|esse|essa|qual|quais|como|onde|quando|quem|que|voce|vc|eu|meu|minha|seu|sua|com|sem|para|pra|de|do|da|em|no|na|e|ou|mas|se|tem|ter|vai|ver|fica|ficou|sai|custa|chega|manda|mande|envia|entrega|frete|pagamento|pagar|desconto|link|checkout|cinta|modeladora|espera|espere|calma|deixa|deixe|certeza|duvida|entendi|entendo|acho|acha|tchau|tchauzinho|brigad[ao]|flw|bjs|beijos?|abraco|ate|logo|encerro|fechei|fiz|finalizei|comprei|pronto|feito)\b/i;

/**
 * Her name, from the message where she gives it. Only two shapes are read: an explicit
 * introduction, and a short message that is nothing but a name. Anything else — a
 * sentence, an address line, a question — stays missing, because a name written into
 * the order wrong is on the package.
 */
/** Words a name never starts with — what follows "nome dela" when it is not a name. */
const NOT_A_FIRST_NAME =
  /^(eu|te|ta|esta|e|eh|igual|mesmo|mesma|passo|vou|vai|ja|nao|sei|depois|o|a|no|na|do|da|de|um|uma|ele|ela|meu|minha|seu|sua|que|com|pra|para|mae|filha|irma|esposa|amiga|tia|avo|sogra)$/;

export const extractName = (text: string): string | null => {
  // Line breaks survive: WhatsApp messages arrive several lines at once, and a name must
  // not run on into the address typed on the next line ("nome dela maria jose\nRua...").
  const cleaned = text.replace(/[^\S\n]+/g, " ").replace(/ *\n+ */g, "\n").trim();

  // "nome dela é ..." — she is buying for someone else, and the link is prefilled with
  // the recipient's name (persona round 3, Karol buying for her mother).
  const introduced = cleaned.match(
    /\b(?:meu\s+nome\s+(?:é|e|eh)|me\s+chamo|nome\s+d[ae]l[ae](?:\s+(?:é|e|eh))?\s*:?|nome\s*[:=]|sou\s+a|aqui\s+é\s+a?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´` ]{1,60})/i,
  );
  const candidate = introduced?.[1] ?? (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´` ]{1,60}$/.test(cleaned) ? cleaned : null);
  if (candidate === null) return null;

  const name = candidate
    .replace(/[.,;!?].*$/, "")
    // "o nome dele é João e o meu é Ana": the name ends where the next clause starts.
    .replace(/\s+e\s+(o|a|meu|minha)\b.*$/i, "")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 5)
    .join(" ");

  if (name.length < 2 || NOT_A_NAME.test(name)) return null;
  // Even after "nome dela", what follows has to start like a name (code review,
  // 2026-09-24): "o nome dela eu te passo depois", "é igual ao meu", "tá no pedido".
  // A narrower list than COMMON_WORDS on purpose: "meu nome é Bom Jesus da Silva" is a
  // real name, and "bom" is a common word.
  const first = (name.split(" ")[0] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (NOT_A_FIRST_NAME.test(first)) return null;
  if (introduced === null) {
    // A single word is a name only when she introduced it. "Oi" on its own is not.
    if (name.split(" ").length < 2) return null;
    // And neither is any message built out of ordinary words. Without this, the first
    // "boa tarde" of the conversation was filed as who she is.
    if (COMMON_WORDS.test(name)) return null;
  }
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
  // What she just said wins. The order used to be the other way round, so a
  // correction — "na verdade é 125", "meu e-mail é o outro" — was merged and then
  // thrown away by the stale value, and she confirmed the wrong one forever. A
  // field she did not mention this turn is absent from `found` and survives.
  const fields: Partial<Identity> = { ...known, ...found };
  return { fields, missing: IDENTITY_FIELDS.filter((f) => !fields[f]) };
};

/** A burst of her messages (grafo §59): each read on its own, in order — the newest wins. */
export const extractIdentityBurst = (messages: readonly string[]): Partial<Identity> =>
  messages.reduce<Partial<Identity>>((found, m) => mergeIdentity(found, extractIdentity(m).fields).fields, {});

export const isIdentityComplete = (fields: Partial<Identity>): fields is Identity =>
  IDENTITY_FIELDS.every((f) => Boolean(fields[f]));

/**
 * One thing at a time, in the order that feels least like a form. The name first
 * because it is the one she gives without thinking; the CPF last because it is the one
 * that makes people hesitate, and by then she has already invested in the conversation.
 *
 * What comes back is a TOPIC for the agent to phrase, not a sentence to send (R13.4,
 * 2026-09-24). The fixed e-mail question ("…É pra onde vai a confirmação do pedido.")
 * was quoted into the directive and the model repeated it word for word, turn after turn,
 * to customers who had already answered something else — four of twelve personas stalled
 * on it. Never a fixed identity question again: the agent says it her own way.
 */
export const nextIdentityQuestion = (missing: readonly IdentityField[]): string | null => {
  const asks: Record<IdentityField, string> = {
    name: "o nome completo dela, pra deixar o pedido no nome dela",
    email: "o e-mail dela, pra completar o cadastro do pedido",
    document: "o CPF dela, pra nota fiscal do pedido, que a lei exige",
  };
  const next = IDENTITY_FIELDS.find((f) => missing.includes(f));
  return next ? asks[next] : null;
};

/**
 * Whether the agent's last message ASKED for name, e-mail or CPF — in a question, so the
 * link message saying "seu e-mail já vai preenchido" does not count. When it did and her
 * answer brought none of them, she ignored the ask — and the link goes out anyway, with
 * what is known, instead of asking again (R13.4).
 */
export const asksForIdentity = (text: string): boolean =>
  text
    .split(/(?<=[.!?\n])\s*/)
    .some((q) => q.trim().endsWith("?") && /\b(e-?mail|cpf|nome\s+completo|seu\s+nome)\b/i.test(q));

/**
 * How many times the agent asked for the e-mail or the CPF and her answer did not bring it
 * (operator, 2026-10-06: the link waits for the data; an e-mail refused once and a CPF refused
 * twice are not asked again). Read from the conversation instead of a column. An ask is a
 * question sentence about that datum — it names it ("Qual o seu CPF?"), or asks her to pass
 * something right after a sentence that names it ("E por último o CPF, pra nota fiscal. Me
 * passa?"); a sentence that only explains the datum beside a question about another one ("O CPF
 * é pra nota fiscal. Qual o seu nome completo?") is not (review of f657faa). Her answer is every
 * inbound after the ask until the next outbound; outbound rows before her first answer are the
 * ruler's touches ("Ainda está aí?"), and she answers the ask through them — unless one of them
 * asks for the datum again, and then that one owns the answer. A "pra que?", a refusal, an
 * invalid CPF and a change of subject all count — the script's own steps (design §6). An ask not
 * yet answered does not. `messages` oldest first, as the model reads them.
 */
export const refusedAsks = (
  messages: ReadonlyArray<{ direction: string; body: string | null }>,
  field: "email" | "document",
): number => {
  const word = field === "email" ? /\be-?mail\b/i : /\bcpf\b/i;
  const found = field === "email" ? extractEmail : extractCpf;
  const asks = (body: string): boolean => {
    const sentences = body.split(/(?<=[.!?\n])\s*/);
    return sentences.some(
      (q, i) =>
        q.trim().endsWith("?") &&
        (word.test(q) ||
          (!/\b(?:e-?mail|cpf|nome|cep|tamanho|cal[cç]a|endere[cç]o)\b/i.test(q) &&
            /\b(?:passa|passar|manda|mandar|envia|enviar|informa|informar|digita|digitar)\b/i.test(q) &&
            word.test(sentences[i - 1] ?? ""))),
    );
  };
  let count = 0;
  messages.forEach((m, i) => {
    if (m.direction === "inbound" || !asks(m.body ?? "")) return;
    const next = messages.slice(i + 1);
    const first = next.findIndex((n) => n.direction === "inbound");
    if (first === -1 || next.slice(0, first).some((n) => asks(n.body ?? ""))) return;
    const rest = next.slice(first);
    const end = rest.findIndex((n) => n.direction !== "inbound");
    const answer = (end === -1 ? rest : rest.slice(0, end)).map((n) => n.body ?? "");
    if (!answer.some((a) => found(a) !== null)) count += 1;
  });
  return count;
};

/**
 * The e-mail is refused for good (review of f657faa): stored on the lead's identity
 * (`emailRefused`, written by the turn the first time), said this turn (the interpreter's
 * `email_unavailable`, which nothing else remembers), or an ask she let pass in the window.
 */
export const emailRefused = (
  stored: { emailRefused?: unknown } | null,
  unavailableNow: boolean,
  messages: ReadonlyArray<{ direction: string; body: string | null }>,
): boolean => stored?.emailRefused === true || unavailableNow || refusedAsks(messages, "email") > 0;

/**
 * The name as the checkout should show it — applied only when the link is built, the
 * stored value stays as she typed it. "maria jose ferreira" and "MARIA DA SILVA" both come
 * out "Maria Jose Ferreira" / "Maria da Silva": the Portuguese particles stay lowercase.
 */
export const titleCaseName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && /^(da|de|do|das|dos|e)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
