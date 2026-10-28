/**
 * The pay-on-delivery sale, closed inside the conversation (operator, 2026-10-28, grafo §135).
 *
 * The Coinzz checkout and the Logzz disagree on where the door is: the Logzz delivery-days API (asked with HER package) said
 * São Paulo has the G and the XGG, Belo Horizonte the M and the G; the Coinzz checkout said São Paulo GG/XGG, BH G/GG/XGG, and
 * the M nowhere. The Logzz is who delivers. So on the WhatsApp arm the door is the Logzz answer for her package, and the sale is
 * closed by the Logzz Order Import API — no checkout for her: dates, then her data, then a summary, then her explicit "SIM".
 *
 * Every successful import is a real order (no manual approval), and a wrong one costs R$ 9,99 at the door. So the order is only
 * ever created by `handleTurn` on `closeStep` answering `confirm`: the last message the agent sent IS the summary of what will be
 * ordered, re-built from the current facts, and every message of her burst is a bare yes (`confirmsOrder`). The model never
 * decides it (R11.1). The same summary gives the same `external_id` (`closeOrderId`), and the Logzz answers the same id with the
 * same order: a retry or a second "sim" never makes a second order.
 *
 * Mirrored byte for byte into the Edge Function: type imports only.
 */
import type { Size } from "./availability.ts";

/**
 * `BusinessConfig.logzzImport`. OPTIONAL, every key: absent (the secret before 2026-10-28), the Coinzz link closes both paths as
 * before. `offers`: the Logzz offer code per number of pieces ("1": "sal0g3mo") — the offer sets product, quantity and price.
 * `productCode`: the Logzz parent product ("prow6pq0", id 165378). `variations`: the Logzz variation code of each size — the
 * dates' `variants` and the import's `variations[].hash`. NOT the Coinzz product codes (pro4gpo2…): the Logzz answers those
 * "A variação do pedido é diferente do produto" (coordinator's probe, 2026-10-28). Any of them absent: the close is off.
 */
export interface LogzzOrderConfig {
  readonly importUrl?: string;
  readonly productCode?: string;
  readonly offers?: Readonly<Record<string, string>>;
  readonly variations?: Readonly<Partial<Record<Size, string>>>;
}

/** Her package as the Logzz reads it: one item per size, with its quantity. */
export interface CodPackage {
  readonly units: number;
  readonly sizes: readonly Size[];
  readonly offer: string;
  readonly productCode: string;
  /** One per size, its Logzz variation code and how many pieces of it. */
  readonly items: ReadonlyArray<{ readonly code: string; readonly quantity: number }>;
  /** The sizes, sorted: the dates' cache key. */
  readonly key: string;
}

/** Null when anything is missing — the URL, the product, the offer for this many pieces, a size's variation: the close is off. */
export const codPackage = (cfg: LogzzOrderConfig | undefined, sizes: readonly Size[], units: number): CodPackage | null => {
  if (!cfg?.importUrl?.startsWith("https://") || !cfg.productCode || !Number.isInteger(units) || units < 1 || sizes.length !== units) return null;
  const offer = cfg.offers?.[String(units)];
  if (!offer) return null;
  const counts = new Map<string, number>();
  for (const s of sizes) {
    const code = cfg.variations?.[s];
    if (!code) return null;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return { units, sizes: [...sizes], offer, productCode: cfg.productCode, items: [...counts].map(([code, quantity]) => ({ code, quantity })), key: [...sizes].sort().join("+") };
};

/**
 * The public delivery-days query, no token: with `products` — the parent product and her sizes as `variants`, each with its
 * quantity — the dates of a unit that holds the WHOLE package and serves the CEP.
 */
export const LOGZZ_DATES_ENDPOINT = "https://app.logzz.com.br/api/delivery-day/options/zip-code";

export interface CodDate {
  /** ISO, "2026-10-29". */
  readonly date: string;
  /** The modality (`type_code`), sent back as the import's `delivery_type`. */
  readonly typeCode: string;
}

export type CodDatesLookup =
  | { readonly kind: "dates"; readonly dates: readonly CodDate[] }
  | { readonly kind: "none"; readonly reason: string }
  | { readonly kind: "failed" };

/** A POST that answers status and parsed body (null when not JSON), and throws only on the network. */
export type Poster = (url: string, body: unknown, headers?: Readonly<Record<string, string>>) => Promise<{ status: number; body: unknown }>;

/**
 * The Logzz's own "no door here" (2026-10-28, real answers): CEP unknown to it, area without a cash-on-delivery unit, or no unit
 * with the package's stock serving the city. Anything else that is not a date list — a 429, a 5xx, "Erro ao buscar opções de
 * entrega", a field error — is a lookup that FAILED, never "no delivery" (L2).
 */
const NO_COD = /cep n[aã]o encontrado|[aá]rea n[aã]o dispon[ií]vel para entrega|sem estoque dispon[ií]vel/i;

export const readCodDates = (status: number, body: unknown): CodDatesLookup => {
  const b = body as {
    type?: string;
    message?: unknown;
    errors?: unknown;
    response?: { dates_available?: unknown };
  } | null;
  if (status === 200 && b?.type === "success" && Array.isArray(b.response?.dates_available)) {
    const all = b.response.dates_available as Array<{ date?: unknown; type_code?: unknown; type_name?: unknown }>;
    if (all.length === 0) return { kind: "none", reason: "sem data" };
    const good = all.filter((d) => typeof d?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && typeof d.type_code === "string" && d.type_code !== "");
    // A list none of which can be read is not "no date": unknown.
    if (good.length === 0) return { kind: "failed" };
    // One modality a day, the standard one before an Express (the shop sells no same-day delivery, R13.5).
    const byDay = new Map<string, CodDate>();
    for (const d of [...good].sort((x, y) => Number(/express/i.test(String(x.type_name ?? ""))) - Number(/express/i.test(String(y.type_name ?? ""))))) {
      if (!byDay.has(d.date as string)) byDay.set(d.date as string, { date: d.date as string, typeCode: d.type_code as string });
    }
    return { kind: "dates", dates: [...byDay.values()].sort((x, y) => x.date.localeCompare(y.date)) };
  }
  const message = [b?.message, ...(Array.isArray(b?.errors) ? b.errors : [])].filter((m): m is string => typeof m === "string").join(" ");
  return status >= 400 && status < 500 && status !== 429 && NO_COD.test(message) ? { kind: "none", reason: maskPii(message) } : { kind: "failed" };
};

/** Never throws: the worst answer is `failed`. */
export const lookupCodDates = async (post: Poster, cep: string, pkg: CodPackage, neighborhood = ""): Promise<CodDatesLookup> => {
  try {
    const r = await post(`${LOGZZ_DATES_ENDPOINT}/${cep.replace(/\D/g, "")}`, { products: [{ code: pkg.productCode, quantity: pkg.units, variants: pkg.items }], ...(neighborhood ? { neighborhood } : {}) });
    return readCodDates(r.status, r.body);
  } catch {
    return { kind: "failed" };
  }
};

/** The dates move during the day (a unit fills, a cutoff passes): kept ten minutes, the same São Paulo day, the same CEP and package. */
export const COD_DATES_CACHE_MS = 10 * 60 * 1000;
export interface CachedCodDates {
  readonly cep: string;
  readonly key: string;
  readonly checkedAt: string;
  readonly result: Exclude<CodDatesLookup, { kind: "failed" }>;
}
const brtDay = (ms: number): string => new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const cachedCodDates = (c: CachedCodDates | null | undefined, cep: string, key: string, now: number): CachedCodDates["result"] | null => {
  if (!c || c.cep.replace(/\D/g, "") !== cep.replace(/\D/g, "") || c.key !== key) return null;
  const at = Date.parse(c.checkedAt);
  return now - at >= 0 && now - at < COD_DATES_CACHE_MS && brtDay(at) === brtDay(now) ? c.result : null;
};

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
const PLAIN_WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
/** "quinta (29/10)": never "amanhã" — the day she reads is the one in the order. */
export const dateLabel = (iso: string): string =>
  `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} (${iso.slice(8, 10)}/${iso.slice(5, 7)})`;
const joined = (xs: readonly string[], last: string): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${last} ${xs.at(-1)}`);
const money = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;
const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** How many of the dates are offered at once. */
export const CLOSE_OFFERED = 3;

/** What the close keeps between turns, on `leads.address.codClose`. */
export interface CloseState {
  readonly date?: string;
  readonly number?: string;
  readonly complement?: string;
  readonly street?: string;
  readonly neighborhood?: string;
  /** A cell phone she gave when the Logzz refused the one of her WhatsApp. */
  readonly phone?: string;
  /** A CPF the Logzz refused: never sent again. */
  readonly badCpf?: string;
  /** A phone the Logzz refused: never sent again. */
  readonly badPhone?: string;
  /** Her full name, read from her answer to the checklist. */
  readonly name?: string;
}

const withoutDate = (s: CloseState): CloseState => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "date")) as CloseState;

/**
 * The close's own messages (operator, 2026-10-28): ONE checklist with everything the order needs — the day among the real dates,
 * full name, CPF, house number (and street and neighbourhood on a town's general CEP) — answered in any order, in one message or
 * many; after her answer, only what is still missing, in the same format; then only the summary.
 */
export const CHECKLIST_HEAD = "Pra eu agendar sua entrega, me manda:";
export const MISSING_HEAD = "Anotado! Só falta me mandar:";
export const DAY_ITEM = "📅 Dia: ";
export const NAME_ITEM = "👤 Nome completo";
export const CPF_ITEM = "🪪 CPF";
export const STREET_ITEM = "📍 Rua e bairro";
export const NUMBER_ITEM = "🏠 Número da casa (e complemento, se tiver)";
export const SUMMARY_HEAD = "📝 Confere se está tudo certo:";
export const SUMMARY_ASK = "Responda *SIM* pra eu confirmar o pedido.";
export const PHONE_ASK =
  "📞 O sistema da entrega não aceitou o número deste WhatsApp pro entregador. Me manda um celular com DDD pra ele falar com você?";
const isChecklist = (m: string): boolean => m.includes(CHECKLIST_HEAD) || m.includes(MISSING_HEAD);
export const isCloseMessage = (m: string): boolean => isChecklist(m) || m.includes(SUMMARY_HEAD) || m.includes(PHONE_ASK);

/**
 * The pieces of her answer that may be her name (the turn reads each with `extractName`). Her own "meu nome é…", "o nome é…",
 * "nome: …" at any time, first: a correction always wins over the name kept. Else only while the list asks the name, and never a piece
 * with a digit (CPF, number, date), a day ("quinta", "dia 30"), a bare yes, a complement ("Bloco B"), her CEP's street, neighbourhood
 * or town (`places`), a place ("Santa Cruz", "Cidade Nova", "Perto do mercado") or a payment, product or colour ("Cartão de crédito",
 * "Kit duas", "Cor preta") — review of 9d247f3: each of those became the name on the order.
 */
export const nameCandidates = (
  parts: readonly string[],
  lastOutbound: string,
  dates: readonly CodDate[],
  now: Date,
  places: readonly string[] = [],
): string[] => {
  const pieces = parts.flatMap((p) => p.split(/[,;\n]+/)).map((x) => x.trim()).filter((x) => x !== "");
  // Only what follows her "meu nome é", "o nome é", "nome:".
  const introduced = pieces.flatMap((x) => {
    const m = NAME_INTRO.exec(x);
    return m ? [x.slice((m.index ?? 0) + m[0].length).trim()] : [];
  });
  // "o nome tá errado, é Maria Souza", "nome errado" + "Maria Souza": her correction asks the name as the list does (review of 96b8fc7).
  const corrects = pieces.some((x) => WRONG_NAME.test(norm(x)));
  const answered = !lastOutbound.includes(NAME_ITEM) && !corrects ? [] : pieces.map((x) => x.replace(/^(?:[ée]h?|sou(?:\s+a)?)\s+/i, "")).filter((x) => {
    const t = norm(x);
    return !/\d/.test(x) && pickDate([x], dates, now) === null && !confirmsOrder([x]) && !/\b(?:dia|data)\b/.test(t) && !WRONG_NAME.test(t) &&
      isPlausibleName(x, places);
  });
  return [...introduced.filter((x) => x !== ""), ...answered];
};
/**
 * The one check every name read during the close goes through — the list's answer, her identity from the burst, the name kept
 * (review of 96b8fc7: the identity path skipped it and "Bela Vista", "Dinheiro mesmo" reached the order): never a complement ("Bloco B"),
 * a payment, product, colour or landmark ("Cartão de crédito", "Kit duas", "Cor preta", "Portão azul"), a place ("Santa Cruz",
 * "Cidade Nova") nor her CEP's street, neighbourhood or town (`places`).
 */
export const isPlausibleName = (name: string, places: readonly string[] = []): boolean => {
  const t = norm(name).trim();
  return !new RegExp(`^(?:${COMPLEMENT})(?![\\p{L}])`, "iu").test(t) && !NOT_A_NAME_FIRST.test(t) && !NOT_A_NAME_LAST.test(t) &&
    !places.some((p) => norm(p).trim() === t);
};
const WRONG_NAME = /\bnome\b[^.!?]{0,20}\b(?:errad[oa]|trocad[oa]|incorret[oa]|nao\s+e\s+esse)\b|\bcorrig\w*\s+(?:o\s+|meu\s+)?nome\b/;
const NAME_INTRO = /\b(?:meu\s+nome\s+(?:completo\s+)?(?:[eé]|eh)|o\s+nome\s+(?:completo\s+)?(?:[eé]|eh)|nome\s*(?:completo\s*)?[:=]|me\s+chamo)(?=\s|$)/i;
// The word that opens it (a payment, a product, a colour's noun, a landmark, a place) or closes it ("… mesmo", "Bela Vista", "Kit
// duas"): a surname like Branco, Preto, Rosa or Verde in the middle or the end of a real name is never read as either.
const NOT_A_NAME_FIRST =
  /^(?:cartao|credito|debito|dinheiro|pix|boleto|cor|kit|colete|cinta|tamanho|pecas?|mercado|padaria|posto|farmacia|igreja|escola|portao|lado|perto|proximo|esquina|frente|fundos|manha|tarde|noite|portaria|porteiro|pago|pagar|prefiro|santa|santo|sao|vila|jardim|parque|cidade|bairro|conjunto|residencial|alto|morro|nova|novo|boa|bom|ao|em|na|no)\b/;
const NOT_A_NAME_LAST = /\b(?:mesmo|vista|duas|tres|azul|amarel[ao]|vermelh[ao])$/;

/**
 * "como funciona?", "como faço pra pagar na entrega?": how the sale on delivery works, asked — the checklist answers it (operator,
 * 2026-10-28). Not a question about anything else ("como funciona o tamanho?", "como faço pra lavar?").
 */
export const asksHowItWorks = (parts: readonly string[]): boolean =>
  parts.some((p) =>
    // "já sei como funciona", "entendi como faz": told, not asked.
    !/\b(?:sei|entendi|conheco|sabia|vi)\s+como\b/.test(norm(p)) &&
    /\bcomo\s+(?:(?:e\s+)?que\s+)?(?:eu\s+)?(?:funciona|faco|faz|pago)\b(?:\s*$|\s*[?!.,]|\s+(?:(?:o|a|na|no|esse|essa)\s+)?(?:(?:pra|para)\s+)?(?:pagamento|entrega|pedido|compra|pagar|comprar|receber|pedir|agendar)\b)/.test(norm(p).trim()),
  );

/**
 * Her day, from her words, against the dates the Logzz has. The last day she named and did not deny wins ("pode ser sexta? não,
 * quinta" is Thursday); a day denied in its own clause ("quinta não posso", "não estou em casa na quinta") is no pick; "de segunda a
 * sexta" is when she works, not a day. A day not among the dates comes back `unavailable`, with what she said.
 */
export const pickDate = (
  parts: readonly string[],
  dates: readonly CodDate[],
  now: Date,
): { kind: "pick"; date: string } | { kind: "unavailable"; said: string } | null => {
  const today = brtDay(now.getTime());
  const plus = (n: number): string => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const offered = dates.slice(0, CLOSE_OFFERED);
  const DAY =
    /\b(?:(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[\s-]*feira)?(?!\s+(?:opcao|vez|data))|(?:dia\s+)?(\d{1,2})\/(\d{1,2})|dia\s+(\d{1,2})(?!\s*(?:\/|dias))|(depois\s+de\s+amanha|amanha|hoje)|(primeir[ao]|ultim[ao])(?!\s+vez)|qualquer\s+(?:um|uma|dia|data))\b/g;
  let found: { kind: "pick"; date: string } | { kind: "unavailable"; said: string } | null = null;
  for (const part of parts) {
    const t = norm(part).replace(/\bde\s+segunda(?:[\s-]*feira)?\s+(?:a|ate)\s+(?:sexta(?:[\s-]*feira)?|sabado)\b/g, " ");
    const clauses = t.split(/[,;.!?\n]+|\bmas\b|\bou\s+melhor\b/);
    // Her own doubt after the day ("sexta? não sei", "quinta, talvez") is no pick: the message picks nothing (review of 844743b).
    if (clauses.slice(1).some((c) => /^\s*(?:(?:eu\s+)?nao\s+sei|sei\s+la|talvez|vou\s+ver|acho\s+que\s+nao)\b/.test(c))) {
      found = null;
      continue;
    }
    for (const clause of clauses) {
      const named = new Set<string>();
      for (const m of clause.matchAll(DAY)) {
        const before = clause.slice(0, m.index ?? 0);
        const after = clause.slice((m.index ?? 0) + m[0].length);
        // A denial anywhere in the day's own clause: "não estou em casa na quinta", "quinta eu não posso", "quinta não".
        if (/\b(?:nao|nem|nunca|sem)\b/.test(before) || /\b(?:nao|nem|nunca)\b/.test(after)) continue;
        const iso: string | null = m[1]
          ? dates.find((d) => PLAIN_WEEKDAYS[new Date(`${d.date}T12:00:00Z`).getUTCDay()] === m[1])?.date ?? null
          : m[2]
          ? dates.find((d) => Number(d.date.slice(8, 10)) === Number(m[2]) && Number(d.date.slice(5, 7)) === Number(m[3]))?.date ?? null
          : m[4]
          ? dates.find((d) => Number(d.date.slice(8, 10)) === Number(m[4]))?.date ?? null
          : m[5]
          ? dates.find((d) => d.date === plus(m[5] === "hoje" ? 0 : m[5] === "amanha" ? 1 : 2))?.date ?? null
          : m[6]?.startsWith("ultim")
          ? offered.at(-1)?.date ?? null
          : offered[0]?.date ?? null;
        const said = m[1]
          ? WEEKDAYS[PLAIN_WEEKDAYS.indexOf(m[1] as (typeof PLAIN_WEEKDAYS)[number])]!
          : m[5]
          ? m[5].replace(/amanha/, "amanhã")
          : m[2]
          ? `dia ${m[2]}/${m[3]}`
          : m[4]
          ? `dia ${m[4]}`
          : "esse dia";
        named.add(iso ?? said);
        // Two days left open in one clause ("quinta ou sexta") is a question back, never the last one.
        found = named.size > 1 ? null : iso ? { kind: "pick", date: iso } : { kind: "unavailable", said };
      }
    }
  }
  return found;
};

/**
 * "30" alone, to the list that offered "sexta (30/10)": the day of one offered date, never the door (review of 96b8fc7). Only a segment
 * that is the bare number; the turn reads it only when nothing else in her words named a day.
 */
export const bareDay = (parts: readonly string[], dates: readonly CodDate[]): { date: string; token: string } | null => {
  for (const s of parts.flatMap((p) => p.split(/[,;\n]+/)).map((x) => x.trim())) {
    const d = /^\d{1,2}$/.test(s) ? dates.slice(0, CLOSE_OFFERED).find((x) => Number(x.date.slice(8, 10)) === Number(s)) : undefined;
    if (d) return { date: d.date, token: s };
  }
  return null;
};

/**
 * "muda a data", "quero outro dia", "troca o dia": the date asked again, without a new one named. Not denied in its clause ("não
 * quero mudar a data", "não precisa trocar o dia"), and "outro dia" only as a day wanted ("outro dia eu compro" is "some day").
 */
export const asksDateChange = (parts: readonly string[]): boolean =>
  parts.some((p) =>
    norm(p).split(/[,;.!?\n]+|\bmas\b/).some((c) => {
      const m = /\b(?:mud|troc|alter)\w*\b[^.?!]{0,20}\b(?:data|dia)\b|\b(?:quero|queria|prefiro|preferia|pode\s+ser|tem|teria|seria|escolher|marcar|pra|para)\s+(?:um\s+|uma\s+|n)?outr[ao]\s+(?:data|dia)\b/.exec(c);
      return m !== null && !/\b(?:nao|nem|nunca)\b/.test(c.slice(0, m.index));
    }),
  );

/**
 * Every message of her burst is a bare yes — an allowlist of the whole message (Lesson 3): "sim", "confirmo", "pode confirmar",
 * "sim, pode", "isso mesmo", "ok obrigada". "sim, mas muda a data", "não, ainda não confirmo", "ok, vou ver" are not.
 */
const YES = /^(?:(?:sim+|s+|isso(?:\s+mesmo)?|confirm(?:o|a|ado|ada|ar)|pode(?:\s+(?:sim|confirmar|fechar|mandar|ser))?|fechado|fechou|ok+|okay|certo|correto|(?:ta|esta)\s+(?:tudo\s+)?certo|tudo\s+certo|perfeito|beleza|blz|bora|claro|com\s+certeza|exato|quero)\s*)+(?:obrigad[ao]\s*)?$/;
export const confirmsOrder = (parts: readonly string[]): boolean =>
  parts.length > 0 &&
  parts.every((p) => {
    // A question is never a yes: "confirmado?", "pode?", "tá certo?", "sim?" (review of 844743b).
    if (/[?¿]/.test(p)) return false;
    const t = norm(p).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    return t !== "" && YES.test(t);
  });

/**
 * The house number she sent to the ask that named it ("100", "nº 45, apto 12", "o número é 100 casa 2"). A CEP or a CPF in the
 * segment is never a house number. After the number only a complement may follow (apto, bloco, casa…): "29/10", "30 de outubro",
 * "2 peças", "14:00" are a date, a count or a time, never the door (review of 844743b). Null when the ask did not name it.
 */
export const houseNumberIn = (parts: readonly string[], asked: boolean, skip: readonly string[] = []): { number: string; complement: string | null } | null => {
  if (!asked) return null;
  const complementWord = new RegExp(`^(?:${COMPLEMENT})(?![\\p{L}])`, "iu");
  // The number, a letter glued or apart ("45A", "45 B"; never the "e" of "45 e apto 12", the "h" of "14h" nor the "x" of "2x"), then only a complement may follow. It opens
  // the piece, or comes right after "número", "nº" or "casa" beside the day (the checklist asks both): "29/10 número 45", "dia 30,
  // casa 120". A bare count in a sentence is never the door.
  const TAIL = String.raw`(\d{1,5}|s\/?n)(?:([A-GI-WYZa-gi-wyz])|\s+(?![eE]\s)([A-GI-WYZa-gi-wyz]))?(?![\p{L}\d/:])\s*[-–]?\s*(.*)$`;
  const leads = [
    new RegExp(String.raw`^(?:[ée]h?\s+(?:o\s+)?)?(?:(?:o\s+)?n(?:[º°o.]|u|ú)?(?:mero)?\s*(?:da\s+casa\s*)?(?:[:.]|[ée]\s+)?\s*)?${TAIL}`, "iu"),
    new RegExp(String.raw`(?:^|\s)(?:n[º°o.]|n[uú]mero|num\.?|casa)\s*(?:da\s+casa\s*)?[:.]?\s*(?:[ée]\s+)?${TAIL}`, "iu"),
  ];
  // After a number, a complement piece is part of it, in this message or the next — never a second number (review of 9d247f3):
  // "45", "casa 3"; "45, bloco 2, apto 31"; "45, 2º andar". The first number is the door: a later one replaces it only when she says
  // so ("não, é 46", "errei, 46", "número 46", "nº 46") — "45" then "30" (the day) or "2" is never the door (review of 96b8fc7).
  let number: string | null = null;
  const complements: string[] = [];
  for (const part of parts) {
    const corrects = /^\s*(?:n[ãa]o|errei|ops|opa|na\s+verdade|corrigindo)\b/i.test(part);
    for (const seg of part.split(/[,;\n]+/)) {
      const s = seg.trim();
      if (/\d{5}-?\d{3}|\d{3}\.?\d{3}\.?\d{3}/.test(s) || skip.includes(s)) continue;
      if (number !== null && !corrects && !/^(?:o\s+)?(?:n[º°o.]|n[uú]mero|num\.?)\s*\d/i.test(s) && !(s.length <= 40 && complementWord.test(s))) continue;
      const piece = s.length <= 40 && complementWord.test(s);
      const m: RegExpExecArray | null | undefined = number !== null && piece ? null : leads.map((re) => re.exec(s)).find((x) => x !== null);
      const rest = (m?.[4] ?? "").replace(/^(?:e\s+)/i, "").trim();
      if (m && !/^andar\b/i.test(rest) && (rest === "" || (rest.length <= 40 && complementWord.test(rest)))) {
        number = m[1]!.toLowerCase().replace(/^s\/?n$/, "s/n");
        complements.push(...[(m[2] ?? m[3] ?? "").toUpperCase(), rest].filter(Boolean));
      } else if (piece) complements.push(s);
    }
  }
  return number === null ? null : { number, complement: complements.join(" ") || null };
};

const COMPLEMENT = "apto|apt|ap|apartamento|bloco|bl|casa|cs|fundos|frente|sobrado|loja|sala|andar|torre|lote|quadra|qd|conjunto|cj|\\d{1,3}\\s*[º°o]?\\s*andar";

/**
 * "Rua das Flores 45, Centro": on a town's general CEP, the piece right after her street is her neighbourhood — letters only, not a
 * day, not her name, not a complement.
 */
const hoodAfterStreet = (parts: readonly string[], street: string | undefined, name: string | null | undefined): string | null => {
  if (!street) return null;
  for (const part of parts) {
    const segs = part.split(/[,;\n]+/).map((x) => x.trim());
    const at = segs.findIndex((x) => norm(x).includes(norm(street)));
    const next = at >= 0 ? segs[at + 1] : undefined;
    if (next && /^[\p{L}\s'.-]{2,40}$/u.test(next) && !new RegExp(`^(?:${COMPLEMENT})(?![\\p{L}])`, "iu").test(next) &&
      !/\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dia)\b/.test(norm(next)) && norm(next) !== norm(name ?? "")) return next;
  }
  return null;
};

/** A cell phone in her answer to `PHONE_ASK`: DDD + 9 + 8 digits, national form. */
export const cellIn = (parts: readonly string[]): string | null => {
  for (const p of [...parts].reverse()) {
    const m = /(?:\+?55\s*)?\(?\b([1-9]\d)\)?\s*(9\d{4})[\s.-]?(\d{4})\b/.exec(p);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
  }
  return null;
};

/** Her WhatsApp number as the Logzz takes it: DDD + 8 or 9 digits, no country code. */
export const nationalPhone = (phone: string): string | null => {
  const d = phone.replace(/\D/g, "");
  const n = (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
  return /^[1-9]\d{9,10}$/.test(n) ? n : null;
};

const maskCpf = (cpf: string): string => `***.***.**${cpf[8]}-${cpf.slice(9, 11)}`;
const cepText = (cep: string): string => {
  const d = cep.replace(/\D/g, "");
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

/** What the turn knows when it asks the close for the next step. */
export interface CloseFacts {
  readonly dates: readonly CodDate[];
  /** Her name as it would go on the order; one word is not a full name. */
  readonly name: string | null;
  /** The name she wrote in answer to the checklist this burst (`nameCandidates` + `extractName`), over any earlier one. */
  readonly typedName?: string | null;
  /** Her CEP's street, neighbourhood and town, and the address she typed: never her name (`isPlausibleName`). */
  readonly places?: readonly string[];
  /** Her valid CPF, digits. */
  readonly cpf: string | null;
  /** The CPF she sent this burst does not check out (`sentInvalidCpf`). */
  readonly cpfInvalid: boolean;
  readonly cep: string;
  /** What the CEP itself says (ViaCEP); `street` empty on a town's general CEP. */
  readonly cepStreet: string;
  readonly cepNeighborhood: string;
  readonly city: string;
  readonly state: string;
  /** What she typed this burst (`extractAddressBurst`), and what the lead kept before. */
  readonly typed: { readonly street?: string; readonly number?: string; readonly complement?: string; readonly neighborhood?: string };
  readonly stored: { readonly street?: string; readonly number?: string; readonly complement?: string; readonly neighborhood?: string };
  /** Her WhatsApp number, national. */
  readonly phone: string | null;
  /** "Colete G", "Kit com 2 peças (G e GG)". */
  readonly what: string;
  readonly priceBrl: number;
  readonly freeShipping: boolean;
}

export interface ClosedOrder {
  readonly date: CodDate;
  readonly name: string;
  readonly cpf: string;
  readonly phone: string;
  readonly street: string;
  readonly number: string;
  readonly complement: string;
  readonly neighborhood: string;
}

export type CloseStep =
  | { readonly kind: "send"; readonly text: string; readonly state: CloseState; readonly reason: string; readonly directive: string }
  | { readonly kind: "confirm"; readonly state: CloseState; readonly summary: string; readonly order: ClosedOrder; readonly directive: string }
  | { readonly kind: "model"; readonly state: CloseState; readonly directive: string };

const offeredLabels = (dates: readonly CodDate[]): string[] => dates.slice(0, CLOSE_OFFERED).map((d) => dateLabel(d.date));

export const closeSummary = (f: CloseFacts, o: ClosedOrder): string =>
  [
    SUMMARY_HEAD,
    "",
    `• ${f.what}: ${money(f.priceBrl)} pra pagar na entrega${f.freeShipping ? ", com frete grátis" : ""}`,
    `• Entrega: ${dateLabel(o.date.date)}`,
    `• Endereço: ${o.street}, ${o.number}${o.complement ? ` (${o.complement})` : ""} – ${o.neighborhood ? `${o.neighborhood}, ` : ""}${f.city}/${f.state}, CEP ${cepText(f.cep)}`,
    `• Nome: ${o.name}`,
    `• CPF: ${maskCpf(o.cpf)}`,
    ...(o.phone !== f.phone ? [`• Celular: (${o.phone.slice(0, 2)}) ${o.phone.slice(2, -4)}-${o.phone.slice(-4)}`] : []),
    "",
    SUMMARY_ASK,
  ].join("\n");

/** The directive the model writes under while the close is open (prompt and gate: the same dates, `GateContext.codDates`). */
export const closeDirective = (dates: readonly CodDate[], missing: readonly string[], summarySent: boolean): string =>
  `O pagamento na entrega é fechado aqui na conversa, sem checkout e sem link: nunca mande nem prometa link da entrega.` +
  ` As únicas datas de entrega que você pode citar são ${joined(offeredLabels(dates), "ou")}; nunca outro dia, nem "amanhã" ou "hoje".` +
  (summarySent
    ? ` O resumo do pedido já foi enviado: o pedido só é criado quando ela responder SIM. Nunca diga que o pedido está confirmado,` +
      ` criado ou agendado; se ela quiser mudar algo, pergunte o quê.`
    : missing.length > 0
    ? ` Pra registrar o pedido falta ${joined(missing, "e")}: peça isso, sem pedir e-mail, e nunca diga que o pedido está feito.`
    : ``);

/**
 * The next step of the close. Pure: the turn sends what it says, stores `state`, and imports only on `confirm`.
 * `datesAsked`: the agent's last message asked the day (the dates line, the summary, or the offer's ask) — only then is a day in
 * her words a pick ("dia 5 cai meu salário" to the CPF ask is no day).
 * `lastList`: the newest of the close's own messages in the recent outbound (`isCloseMessage`). Her answer is read against it even
 * when the model's answer to her question beside it went after (review of 9d247f3: "como funciona?" → the list, then the model's
 * answer as the last message, and her whole answer was lost). The order still needs the summary as the very last message.
 */
export const closeStep = (input: {
  readonly facts: CloseFacts;
  readonly state: CloseState;
  readonly parts: readonly string[];
  readonly lastOutbound: string;
  readonly lastList?: string;
  readonly datesAsked: boolean;
  readonly now: Date;
}): CloseStep => {
  const { facts: f, parts, lastOutbound, now } = input;
  const list = input.lastList ?? lastOutbound;
  let state: CloseState = { ...input.state };
  const change = asksDateChange(parts);
  const picked = input.datesAsked || change ? pickDate(parts, f.dates, now) : null;
  const bare = list.includes(DAY_ITEM) && picked === null ? bareDay(parts, f.dates) : null;
  const pick = bare ? { kind: "pick" as const, date: bare.date } : picked;
  if (pick?.kind === "pick") state = { ...state, date: pick.date };
  else if (change || pick?.kind === "unavailable") state = withoutDate(state);
  // A day the Logzz no longer offers is asked again, said as such.
  const gone = state.date !== undefined && !f.dates.some((d) => d.date === state.date) ? state.date : null;
  if (gone) state = withoutDate(state);
  const asked = list.includes(NUMBER_ITEM);
  const house = houseNumberIn(parts, asked, bare ? [bare.token] : []);
  const number = house?.number ?? f.typed.number ?? state.number ?? f.stored.number;
  const complement = (house ? house.complement : null) ?? f.typed.complement ?? state.complement ?? f.stored.complement;
  const street = f.cepStreet || (f.typed.street ?? state.street ?? f.stored.street);
  const neighborhood = f.cepNeighborhood ||
    (f.typed.neighborhood ?? (list.includes(STREET_ITEM) ? hoodAfterStreet(parts, f.typed.street, f.typedName) : null) ?? state.neighborhood ?? f.stored.neighborhood ?? "");
  const phone = [list.includes(PHONE_ASK) ? cellIn(parts) : null, state.phone, f.phone].find((p) => p && p !== state.badPhone) ?? null;
  state = Object.fromEntries(
    Object.entries({ ...state, number, complement, street: f.cepStreet ? undefined : street, neighborhood: f.cepNeighborhood ? undefined : neighborhood || undefined, phone: phone !== f.phone ? phone : undefined })
      .filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as CloseState;
  const cpf = f.cpf && f.cpf !== state.badCpf ? f.cpf : null;
  const named = [f.typedName, state.name, f.name].find((n) => n && n.trim().split(/\s+/).length >= 2 && isPlausibleName(n, f.places)) ?? null;
  const fullName = named ? named.trim() : null;
  if (f.typedName && fullName === f.typedName.trim()) state = { ...state, name: fullName };
  const date = f.dates.find((d) => d.date === state.date) ?? null;
  // The Logzz needs the CEP, the street, the town and the UF ("Endereço inválido"); the neighbourhood goes when read, never blocks
  // (operator's call on the review of 96b8fc7: "Centro" alone was never read and held the close forever).
  const place = Boolean(street);

  const missing = [
    ...(fullName ? [] : ["seu nome completo"]),
    ...(cpf ? [] : ["seu CPF"]),
    ...(place ? [] : ["o nome da sua rua e o bairro"]),
    ...(number ? [] : ["o número da casa (e o complemento, se tiver)"]),
  ];
  const labels = offeredLabels(f.dates);
  const items = [
    ...(date ? [] : [`${DAY_ITEM}${joined(labels, "ou")}`]),
    ...(fullName ? [] : [NAME_ITEM]),
    ...(cpf ? [] : [CPF_ITEM]),
    ...(place ? [] : [STREET_ITEM]),
    ...(number ? [] : [NUMBER_ITEM]),
  ];
  if (date && missing.length === 0 && phone) {
    const order: ClosedOrder = { date, name: fullName!, cpf: cpf!, phone, street: street!, number: number!, complement: complement ?? "", neighborhood };
    const summary = closeSummary(f, order);
    if (lastOutbound.endsWith(summary)) {
      return confirmsOrder(parts)
        ? { kind: "confirm", state, summary, order, directive: closeDirective(f.dates, [], true) }
        : { kind: "model", state, directive: closeDirective(f.dates, [], true) };
    }
    return { kind: "send", text: summary, state, reason: "pedido na entrega: resumo para ela confirmar", directive: closeDirective(f.dates, [], false) };
  }
  if (date && missing.length === 0) {
    return { kind: "send", text: PHONE_ASK, state, reason: "pedido na entrega: celular para o entregador", directive: closeDirective(f.dates, ["um celular com DDD"], false) };
  }
  // One checklist with everything (operator, 2026-10-28); after her answer, only what is missing, never what she already gave.
  const notes = [
    gone ? `${dateLabel(gone)} acabou de lotar 😕` : pick?.kind === "unavailable" ? `${pick.said[0]!.toUpperCase()}${pick.said.slice(1)} não tenho entrega aí 😕` : null,
    f.cpfInvalid && !cpf ? "Esse CPF não confere, algum número pode ter saído trocado 😕" : null,
  ].filter(Boolean);
  const text = [...notes, isChecklist(list) || list.includes(SUMMARY_HEAD) ? MISSING_HEAD : CHECKLIST_HEAD, ...items].join("\n");
  const directive = closeDirective(f.dates, [...(date ? [] : ["o dia da entrega"]), ...missing], false);
  // She gave nothing new to the list above (a question, a remark): the model answers under the directive, never "Anotado!".
  return text === list || (notes.length === 0 && isChecklist(list) && list.endsWith(`:\n${items.join("\n")}`))
    ? { kind: "model", state, directive }
    : { kind: "send", text, state, reason: isChecklist(list) ? "pedido na entrega: o que falta" : "pedido na entrega: a lista do pedido", directive };
};

/** The order's id at the Logzz: the conversation and the summary she said yes to. The same summary, the same order. */
export const closeOrderId = async (conversationId: string, summary: string): Promise<string> => {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(summary)));
  return `malu-${conversationId}-${[...hash.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

/** The import body, exactly the keys the integration was mapped with on 2026-10-28. */
export const importPayload = (p: {
  externalId: string;
  order: ClosedOrder;
  email: string | null;
  cep: string;
  city: string;
  state: string;
  pkg: CodPackage;
  utm: { source: string; medium: string; campaign: string; content: string; term: string; id: string };
}) => ({
  external_id: p.externalId,
  full_name: p.order.name,
  phone: p.order.phone,
  customer_document: p.order.cpf,
  email: p.email ?? "",
  postal_code: p.cep.replace(/\D/g, ""),
  street: p.order.street,
  neighborhood: p.order.neighborhood,
  city: p.city,
  state: p.state,
  house_number: p.order.number,
  complement: p.order.complement,
  delivery_date: p.order.date.date,
  delivery_type: p.order.date.typeCode,
  delivery_period: "",
  offer: p.pkg.offer,
  variations: p.pkg.items.map((i) => ({ hash: i.code, quantity: i.quantity })),
  utm_source: p.utm.source,
  utm_medium: p.utm.medium,
  utm_campaign: p.utm.campaign,
  utm_content: p.utm.content,
  utm_term: p.utm.term,
  utm_id: p.utm.id,
});

export type ImportResult =
  | { readonly kind: "created"; readonly orderCode: string; readonly deliveryDate: string; readonly rescheduled: boolean }
  /** The day filled: the dates are asked again. */
  | { readonly kind: "date_gone"; readonly message: string }
  /** No stock or coverage for the package any more: the prepaid. */
  | { readonly kind: "no_cod"; readonly message: string }
  | { readonly kind: "cpf"; readonly message: string }
  | { readonly kind: "phone"; readonly message: string }
  /** The Logzz keeps one open main order per customer. */
  | { readonly kind: "open_order"; readonly message: string }
  /** 409 "Pedido em processamento": the Logzz is creating it — the SAME id, a moment later, answers its order_code. */
  | { readonly kind: "processing"; readonly message: string }
  /** 429, 5xx, the network, an answer without the order: nothing known to be created; the same id is safe to send again. */
  | { readonly kind: "retry"; readonly message: string }
  /** 401/403/404, 409 "Integração desativada": the token, the URL or the integration — the operator's to fix. */
  | { readonly kind: "config"; readonly message: string }
  | { readonly kind: "rejected"; readonly message: string };

const isoOf = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
};

/** Her CPF and phone out of any text the system keeps or e-mails (a Logzz error may echo them, review of 844743b). */
export const maskPii = (text: string): string =>
  text
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "***CPF***")
    .replace(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[\s.-]?\d{4}/g, "***TEL***");

export const readImport = (status: number, body: unknown, asked: string): ImportResult => {
  const b = body as { status?: unknown; message?: unknown; order_code?: unknown; delivery_date?: unknown; rescheduled?: unknown } | null;
  const message = maskPii(typeof b?.message === "string" ? b.message : `HTTP ${status}`);
  // A 2xx with the order's code is the order, whatever else it says: the same external_id again answers 200 with the order it made.
  if (status >= 200 && status < 300 && b?.status !== "error" && typeof b?.order_code === "string" && b.order_code.trim() !== "") {
    // The day the order holds is the one the Logzz answered: `rescheduled` moved it when hers was full.
    return { kind: "created", orderCode: b.order_code.trim(), deliveryDate: isoOf(b.delivery_date) ?? asked, rescheduled: b.rescheduled === true };
  }
  if (status === 401 || status === 403 || status === 404 || (status === 409 && /desativad/.test(norm(message)))) return { kind: "config", message };
  if (status === 409 && /processamento/.test(norm(message))) return { kind: "processing", message };
  if (status === 409 || status === 429 || status >= 500 || (status >= 200 && status < 300)) return { kind: "retry", message };
  const t = norm(message);
  if (/data de entrega indisponivel/.test(t)) return { kind: "date_gone", message };
  if (/sem estoque|estoque insuficiente|sem cobertura/.test(t)) return { kind: "no_cod", message };
  if (/\bcpf\b/.test(t)) return { kind: "cpf", message };
  if (/telefone/.test(t)) return { kind: "phone", message };
  if (/pedido principal sem finalizacao/.test(t)) return { kind: "open_order", message };
  return { kind: "rejected", message };
};

/** One import, sent again once on `retry` (the same `external_id`: the Logzz answers it with the same order). Never throws. */
export const placeOrder = async (
  post: Poster,
  url: string,
  token: string,
  payload: ReturnType<typeof importPayload>,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ImportResult> => {
  const once = async (): Promise<ImportResult> => {
    try {
      const r = await post(url, payload, { Authorization: `Bearer ${token}` });
      return readImport(r.status, r.body, payload.delivery_date);
    } catch (e) {
      return { kind: "retry", message: e instanceof Error ? e.message : String(e) };
    }
  };
  const first = await once();
  if (first.kind !== "retry" && first.kind !== "processing") return first;
  // Processing: the Logzz asked for "instantes" — a longer wait, then the same id.
  await wait(first.kind === "processing" ? 4000 : 2000);
  return once();
};

/** Her order, said once it exists: the number and the day the Logzz answered (`rescheduled`: hers was full, the next one). */
export const closeConfirmed = (orderCode: string, deliveryDate: string, rescheduled: boolean, priceBrl: number): string =>
  `Pedido confirmado! 🎉 Nº ${orderCode}\n\n` +
  `Sua entrega fica pra ${dateLabel(deliveryDate)}` +
  // Moved by the Logzz (the day she chose was full): said plainly, and she may ask for another (operator's decision pending, §135).
  (rescheduled ? `: o dia que você escolheu lotou, e o sistema passou pro próximo disponível. Se esse dia não der pra você, é só me falar aqui.` : `.`) +
  ` Deixa ${money(priceBrl)} separado pra pagar quando receber: dinheiro, Pix ou cartão, na maquininha do entregador.\n\n` +
  `Qualquer dúvida, é só me chamar aqui 💛`;

/** The import did not answer: said truthfully, with the same summary under it — her "SIM" again sends the same order id. */
export const closeRetryLater = (summary: string): string =>
  `Não consegui registrar seu pedido agora, o sistema da entrega não respondeu 😔 Tento de novo assim que você me responder.\n\n${summary}`;
/** 409 "Pedido em processamento" twice: the order is being made — said as such, the summary under it, her "SIM" asks the same id. */
export const closeProcessing = (summary: string): string =>
  `Estou finalizando seu pedido no sistema da entrega, só leva um instantinho ⏳ Me responde *SIM* de novo daqui a pouco que eu te passo o número.\n\n${summary}`;
export const CLOSE_CPF_REFUSED = "O sistema da entrega não aceitou esse CPF 😕 Confere pra mim e me manda de novo? Tem que ser o CPF de quem vai receber.";
export const CLOSE_OPEN_ORDER =
  "Vi aqui que já existe um pedido seu em aberto na transportadora 💛 Pra não duplicar, não criei outro agora. Me conta o que você precisa que eu te ajudo.";
export const closeNoCodLine = (link: string | null): string =>
  `Poxa, a entrega com pagamento na hora acabou de esgotar aí pro seu pedido 😔` +
  (link ? ` Mas dá pra levar pagando antes, no Pix ou no cartão, e ele vai pelos Correios: ${link}` : ` Se quiser, eu te aviso aqui assim que voltar.`);

/**
 * The row an order webhook belongs to when the order was made by the import (2026-10-28): the Logzz webhook may carry our
 * `external_id`, its `order_code`, or its own sale id. Ours or the code matched → that row. Else a pay-on-delivery webhook for
 * a lead with one live imported row no webhook has claimed yet is that order — the Logzz keeps one open main order per customer.
 */
export const importedTwin = (
  rows: ReadonlyArray<{ external_id: string; status: string | null; created_at: string; details: Record<string, unknown> | null }>,
  incoming: { externalId: string; orderNumber?: string | null; paymentMethod: string },
  isDead: (status: string | undefined) => boolean,
  now: number,
): string | null => {
  const imported = rows.filter((r) => typeof r.details?.importId === "string");
  const ids = [incoming.externalId, incoming.orderNumber].filter((v): v is string => typeof v === "string" && v !== "");
  const named = imported.find((r) => [r.external_id, r.details?.orderNumber, r.details?.webhookId].some((v) => typeof v === "string" && ids.includes(v)));
  if (named) return named.external_id;
  if (incoming.paymentMethod !== "cod") return null;
  const open = imported.filter((r) => !r.details?.webhookId && !isDead(r.status ?? undefined) && now - Date.parse(r.created_at) < 7 * 24 * 60 * 60 * 1000);
  return open.length === 1 ? open[0]!.external_id : null;
};
