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
  const match = text.match(/\b(\d{5})-?\s?(\d{3})\b/);
  if (!match) return null;
  const digits = `${match[1]}${match[2]}`;
  if (/^(\d)\1{7}$/.test(digits)) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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

const parseComplement = (text: string): string | null => {
  const re = new RegExp(`\\b(${COMPLEMENT_TYPES})\\s*[:.]?\\s*([\\w\\u00c0-\\u017f]{1,20})`, "i");
  const match = text.match(re);
  if (!match) return null;
  // "casa" and "fundos" stand alone; the others carry an identifier.
  const standalone = /^(casa|cs|fundos|frente|sobrado)$/i.test(match[1]!);
  return clean(standalone ? match[1]! : `${match[1]} ${match[2]}`);
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
  const fields: Partial<Address> = { ...found, ...known };
  return { fields, missing: REQUIRED_FIELDS.filter((f) => !fields[f]) };
};

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
