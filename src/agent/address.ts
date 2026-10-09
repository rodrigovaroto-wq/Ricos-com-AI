/**
 * Address extraction from free text (§D2).
 *
 * A wrong address costs exactly what a wrong size costs: under cash on delivery the
 * package travels, fails, and comes back — the loss is the freight, not a rounding
 * error. So this module never guesses. Every field it is not sure about comes back
 * in `missing`, and the caller either asks the model for a second pass or asks the
 * customer directly. What it does resolve, it resolves deterministically and for
 * free; the model is the fallback, not the first move.
 *
 * The confirmation step is not optional either: §D2 requires the address to be read
 * back to the customer before an order exists. `renderConfirmation` writes that line.
 */

/** The 27 federative units. Anything else in that slot is not a state. */
const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type State = (typeof STATES)[number];

export interface Address {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: State;
}

/** Everything a Coinzz cash-on-delivery checkout needs filled in. */
export const REQUIRED_FIELDS = [
  "cep",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export interface ExtractionResult {
  fields: Partial<Address>;
  /** Required fields still unknown. Empty means the address is ready to confirm. */
  missing: RequiredField[];
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim().replace(/[,;.]+$/, "");

/**
 * Words people put in front of a city before naming it — "é em Belo Horizonte",
 * "moro em Recife". They sit inside the captured span, so they are trimmed off the
 * front, one at a time. Only from the front: "Rio de Janeiro" keeps its "de".
 */
const CONNECTORS = new Set([
  "e", "é", "eh", "em", "no", "na", "de", "do", "da", "para", "pra", "aqui", "moro",
  "fica", "sou", "entrega", "entregar", "cidade", "meu", "minha", "o", "a", "aq",
]);

const trimConnectors = (s: string): string => {
  const words = clean(s).split(" ");
  while (words.length > 1 && CONNECTORS.has(words[0]!.toLowerCase())) words.shift();
  return words.join(" ");
};

/**
 * A CEP is eight digits, written with or without the dash. Repdigits (00000-000,
 * 11111-111) are the placeholder people type when they don't know theirs, so they
 * are rejected rather than carried into a delivery attempt.
 */
export const parseCep = (text: string): string | null => {
  // Any way she writes it (operator, 2026-10-09): "04710090", "04710-090", "04.710-090", "04 710 090",
  // "04710 - 090". Only the shapes a CEP has — 8 digits, 5+3, 2+3+3 — and never inside a longer run of
  // digits, so a phone ("3456-7890", "99491-5983") or a CPF ("551.381.468-40") is not read as one.
  const S = String.raw`[\s.\-–]{1,3}`;
  const match = text.match(
    new RegExp(String.raw`(?<!\d[\s.\-–]{0,3})(?<!\d)(?:(\d{8})|(\d{5})${S}(\d{3})|(\d{2})${S}(\d{3})${S}(\d{3}))(?![\s.\-–]{0,3}\d)`),
  );
  if (!match) return null;
  const digits = match.slice(1).filter(Boolean).join("");
  if (/^(\d)\1{7}$/.test(digits)) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

/**
 * A CEP typed with the wrong number of digits — "004710090", nine, in the second real test (grafo
 * §66): never read, and the model told her "Recebi seu CEP". Seven or nine digits, read only beside
 * the word "CEP" or as the answer to the agent asking for it: nine digits alone are as much a phone.
 */
export const malformedCep = (text: string, askedCep = false): string | null => {
  if (parseCep(text)) return null;
  const digits = text.replace(/(\d)[.\-\s](?=\d)/g, "$1");
  // Beside the word, not denied ("meu cep não é 004710090"); after the question, only as the whole
  // message — "moro no 1234567" or a phone in a sentence is no CEP (review of §66, B4).
  const m = /\bcep\b/i.test(digits)
    ? digits.match(/\bcep\b(?![^\d]*\bn[aã]o\b)[^\d]{0,20}(?<!\d)(\d{7}|\d{9})(?!\d)/i)
    : askedCep
      ? digits.match(/^\s*(\d{7}|\d{9})\s*[.!]*\s*$/)
      : null;
  return m ? m[1]! : null;
};

/** Words that open a Brazilian street line. */
const STREET_TYPES =
  "rua|r\\.|avenida|av\\.?|travessa|tv\\.?|alameda|al\\.?|rodovia|rod\\.?|estrada|est\\.?|praca|praça|largo|via|quadra|conjunto|linha|servidao|servidão";

/** Words that open a complement: apartment, block, house, and friends. */
const COMPLEMENT_TYPES =
  "apto|apt|ap|apartamento|bloco|bl|casa|cs|fundos|frente|sobrado|loja|sala|andar|torre|lote";

/**
 * The street line, from a logradouro keyword up to the next separator. Without a
 * keyword there is no reliable signal — "silva 123" is as much a name as an address —
 * so it stays missing rather than being guessed.
 */
const parseStreet = (text: string): string | null => {
  const re = new RegExp(`\\b(${STREET_TYPES})\\s+([^,;\\n]+)`, "i");
  const match = text.match(re);
  if (!match) return null;
  // Cut at the house number: "Rua das Flores 123" is street "Rua das Flores".
  const tail = match[2]!.replace(/\s+n?[oº°.]?\s*\d+.*$/i, "");
  const street = clean(`${match[1]} ${tail}`);
  return street.length > 3 ? street : null;
};

/**
 * The house number. "s/n" is a real answer in rural addresses and is kept as such;
 * a bare number is only read as the house number when it is not the CEP.
 */
const parseNumber = (text: string): string | null => {
  if (/\bs\/?\s?n\b/i.test(text)) return "s/n";

  // The CEP is removed first, and this is not a nicety. "Rua das Flores, 13010-100"
  // fed the fallback below a number that sits right after a street line and reads as
  // a house number: the customer's address went out with 13010 as the door. Under
  // cash on delivery that is a package that travels, fails and comes back.
  const clipped = text.replace(/\b\d{5}-?\s?\d{3}\b/g, " ");

  const labelled = clipped.match(/\b(?:n[oº°.]?|numero|número)\s*[:.]?\s*(\d{1,6})\b/i);
  if (labelled) return labelled[1]!;

  // Otherwise: the number that follows a street line, e.g. "Rua das Flores, 123".
  const re = new RegExp(`\\b(?:${STREET_TYPES})\\s+[^,;\\n]*?[,\\s]\\s*(\\d{1,6})\\b`, "i");
  const afterStreet = clipped.match(re);
  return afterStreet ? afterStreet[1]! : null;
};

/**
 * The complement, and the guard that took a production row to find.
 *
 * `\b` opens the word but nothing closed it, so every short abbreviation matched inside
 * a longer one: "Maria **Ap**arecida Souza" was written down as complement "Ap arecida",
 * and "**casa**mento" would have been a house. The lookahead requires the type to end
 * where a letter does not follow — "apto 32" and "apto32" still match, "Aparecida" and
 * "casamento" no longer do.
 *
 * Under the current funnel the address is not what the order is built from, so this row
 * only misled whoever read the lead. Under the API path it would have been printed on
 * the package.
 */
const parseComplement = (text: string): string | null => {
  const re = new RegExp(
    `\\b(${COMPLEMENT_TYPES})(?![a-z\\u00c0-\\u017f])(?:\\s*[:.]?\\s*([\\w\\u00c0-\\u017f]{1,20}))?`,
    "i",
  );
  const match = text.match(re);
  if (!match) return null;
  // "casa" and "fundos" stand alone; the others carry an identifier. The value used to be
  // required, so the standalone case only worked when some other word happened to follow
  // — "Rua das Flores 123, casa" at the end of a message lost its complement entirely.
  const standalone = /^(casa|cs|fundos|frente|sobrado)$/i.test(match[1]!);
  if (standalone) return clean(match[1]!);
  return match[2] ? clean(`${match[1]} ${match[2]}`) : null;
};

/** Only an explicitly labelled neighbourhood. The unlabelled slot is too ambiguous. */
const parseNeighborhood = (text: string): string | null => {
  const match = text.match(/\bbairro\s*[:.]?\s*([^,;\n\d]{2,40})/i);
  return match ? clean(match[1]!) : null;
};

/**
 * State, and the city that usually sits right before it. "Campinas/SP" and
 * "Campinas - SP" are the two shapes people actually write.
 */
const parseCityAndState = (text: string): { city?: string; state?: State } => {
  const re = /([A-Za-zÀ-ſ][A-Za-zÀ-ſ'\s]{1,40}?)\s*[/\-–,]\s*([A-Za-z]{2})\b/;
  const match = text.match(re);
  if (match) {
    const candidate = match[2]!.toUpperCase() as State;
    if (STATES.includes(candidate)) {
      const city = trimConnectors(match[1]!);
      return city.length > 1 ? { city, state: candidate } : { state: candidate };
    }
  }

  const labelled = text.match(/\b(?:cidade|município|municipio)\s*[:.]?\s*([^,;\n\d]{2,40})/i);
  const bareState = text.match(/\b(?:uf|estado)\s*[:.]?\s*([A-Za-z]{2})\b/i);
  const state = bareState?.[1]?.toUpperCase() as State | undefined;
  return {
    ...(labelled ? { city: clean(labelled[1]!) } : {}),
    ...(state && STATES.includes(state) ? { state } : {}),
  };
};

/**
 * Reads whatever the message reliably carries. What is not here is not in the text —
 * or is not unambiguous enough to risk a delivery on. Callers check `missing` and
 * decide between a model pass and a direct question.
 */
export const extractAddress = (text: string): ExtractionResult => {
  const { city, state } = parseCityAndState(text);
  const fields: Partial<Address> = {
    ...(parseCep(text) ? { cep: parseCep(text)! } : {}),
    ...(parseStreet(text) ? { street: parseStreet(text)! } : {}),
    ...(parseNumber(text) ? { number: parseNumber(text)! } : {}),
    ...(parseComplement(text) ? { complement: parseComplement(text)! } : {}),
    ...(parseNeighborhood(text) ? { neighborhood: parseNeighborhood(text)! } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  };

  return { fields, missing: REQUIRED_FIELDS.filter((f) => !fields[f]) };
};

/**
 * Merges a second pass (the model's, or a later message) over a first one. Fields
 * already known win: a value the customer stated is worth more than one a model
 * inferred, and re-reading an address should never quietly overwrite it.
 */
export const mergeAddress = (
  known: Partial<Address>,
  found: Partial<Address>,
): ExtractionResult => {
  // What she just said wins. The order used to be the other way round, so a
  // correction — "na verdade é 125", "meu e-mail é o outro" — was merged and then
  // thrown away by the stale value, and she confirmed the wrong one forever. A
  // field she did not mention this turn is absent from `found` and survives.
  const fields: Partial<Address> = { ...known, ...found };
  return { fields, missing: REQUIRED_FIELDS.filter((f) => !fields[f]) };
};

/** A burst of her messages (grafo §59): each read on its own, in order — the newest wins. */
export const extractAddressBurst = (messages: readonly string[]): Partial<Address> =>
  messages.reduce<Partial<Address>>((found, m) => mergeAddress(found, extractAddress(m).fields).fields, {});

export const isComplete = (fields: Partial<Address>): fields is Address =>
  REQUIRED_FIELDS.every((f) => Boolean(fields[f]));

/**
 * The read-back required by §D2 before any order exists. One line per piece, because
 * a wall of text is what makes people answer "isso" without actually reading it.
 */
export const renderConfirmation = (address: Address): string =>
  [
    `${address.street}, ${address.number}${address.complement ? ` — ${address.complement}` : ""}`,
    `${address.neighborhood}, ${address.city}/${address.state}`,
    `CEP ${address.cep}`,
  ].join("\n");

/**
 * She said the address back is right.
 *
 * §D2 requires the read-back before an order exists, and the read-back is worthless if
 * nobody checks the answer. This is deliberately narrow: a bare "sim" or "isso" right
 * after the confirmation is a confirmation, and anything that carries a correction
 * ("não", "mudou", "na verdade") is not — reading a correction as a yes is how a
 * package goes to the old address.
 */
/**
 * Whether the agent's last message actually read this address back to her.
 *
 * `confirmsAddress` only knows that she said yes. It cannot know what she said yes TO —
 * and a bare "sim" answering "quer que eu te mande o link?" was setting `confirmedAt`,
 * which is §D2 skipped in silence: the read-back is the whole point, because an address
 * nobody repeated is the failed delivery this operation pays for twice.
 *
 * Street and number are enough to recognise the read-back; asking for every field would
 * fail on a message that abbreviates the state or drops the district.
 */
export const readBackAddress = (outbound: string, address: Partial<Address>): boolean => {
  if (!address.street || !address.number) return false;
  const t = clean(outbound).toLowerCase();
  return t.includes(clean(address.street).toLowerCase()) && t.includes(address.number);
};

export const confirmsAddress = (text: string): boolean => {
  const t = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (/\b(nao|errado|erro|mudou|mudei|troca|trocar|na\s+verdade|corrig)\b/.test(t)) return false;
  // "Ok", "tá bom", "tudo bem", "tranquilo" and the like are a yes to a yes/no question (operator, 2026-10-09).
  return /^(sim|isso|isso\s+mesmo|correto|ta\s+certo|esta\s+certo|certo|exato|perfeito|pode\s+ser|confirmo|confirmado|ok|okay|okk|isso\s+ai|e\s+isso|pode\s+mandar|pode\s+enviar|ta\s+bom|ta|tudo\s+bem|tranquilo|beleza|blz|claro|com\s+certeza|pode|fechado|combinado|show|bora|uhum|aham|s|ss|positivo|otimo|joia)\b/.test(
    t,
  );
};

/** What to ask for next, in the order a person would naturally say it. */
export const nextQuestion = (missing: readonly RequiredField[]): string | null => {
  const asks: Record<RequiredField, string> = {
    cep: "Qual é o seu CEP?",
    street: "Qual é a rua?",
    number: "Qual é o número?",
    neighborhood: "Qual é o bairro?",
    city: "Qual é a cidade?",
    state: "Qual é o estado (UF)?",
  };
  const next = REQUIRED_FIELDS.find((f) => missing.includes(f));
  return next ? asks[next] : null;
};
