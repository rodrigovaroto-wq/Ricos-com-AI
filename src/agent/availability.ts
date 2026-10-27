/**
 * Availability, inside the agent instead of a dev script.
 *
 * Until now the agent recommended a size with nothing to consult, and the customer
 * discovered the answer in the checkout's "não há disponibilidade" popup — after she
 * had already decided to buy. The query behind that popup is public: no cookie, no
 * CSRF, no token, and only the postcode changes the answer. So the agent can ask for
 * ONE thing — the CEP — and know before it speaks.
 *
 * Three readings of the response are wrong, and each was believed here at some point:
 *
 * 1. `stock` is `"1"` for every size, available or not. It answers nothing.
 * 2. `has_local_operation_cash_on_delivery` is `false` even where cash on delivery
 *    works. Coinzz's own checkout code carries the comment "as flags vêm incorretas
 *    da Logzz" — read the arrays, never the flags.
 * 3. `local_operation` empty does NOT mean the prepaid path is closed. It is the
 *    carrier quote, which is the OPERATOR's cost; the prepaid offer ships free
 *    nationwide (`settingsFreight: []`), so its checkout opens regardless. The
 *    operator proved this by completing a prepaid checkout for a size this query
 *    reports nothing for.
 *
 * What the query therefore answers is exactly one question — is cash on delivery
 * available for this size at this postcode — plus the operator's own shipping cost
 * on the prepaid path. It says nothing about stock. Treat it that way.
 *
 * AND IT IS ASKED BY REGION, NOT BY SIZE. Cash on delivery moved to the Logzz scheduling
 * checkout on 2026-09-09, and this query still reads the same Logzz local operation behind
 * it — the same coverage, the same three dates.
 *
 * The per-size answer was once believed to be simply wrong: it reported no delivery for
 * the M anywhere, including a warehouse holding 196 units, and that was read as a fault in
 * the Coinzz product mapping. The sweep of 2026-09-21 refuted it — the M came back
 * available in Belo Horizonte, Contagem and Betim and stayed absent in the other nineteen
 * covered cities, which is stock in one distribution centre, not a broken mapping.
 *
 * The conduct is unchanged, for a different reason. The per-size answer moves week to
 * week and the checkout makes the final call, so the agent asks one question — does
 * delivery reach this postcode, on which days — and never lets the per-size answer veto
 * a size she was recommended.
 */

/**
 * The size ladder, re-declared here instead of imported. This file is mirrored byte for
 * byte into the Edge Function, and a relative import would need a different specifier on
 * each side — which is exactly the drift the mirror exists to prevent. A test asserts
 * these keys still equal `SIZES` in `sizing.ts`, so the copy cannot rot in silence.
 */
export type Size = "P" | "M" | "G" | "GG" | "XGG";

/** The parent product and the five per-size codes, from `get-variations?product_id=79880`. */
export const PARENT_PRODUCT_ID = "79880";
export const SIZE_CODES: Readonly<Record<Size, string>> = {
  P: "pro4gpo2",
  M: "proqvqmj",
  G: "pro7ml00",
  GG: "pro66jdm",
  XGG: "proe50v0",
};

/** The OmniCash integration on the cash-on-delivery offer, from `getAll`. */
const APP_INTEGRATION_DETAIL_ID = "25458";

/**
 * Values the endpoint accepts but does not read. Confirmed field by field: only the
 * postcode changes the answer, which is what makes this askable in a conversation.
 */
const PLACEHOLDER = { phone: "11900000000", document: "27944872804", number: "1" } as const;

export const AVAILABILITY_ENDPOINT =
  "https://app.coinzz.com.br/checkout/stock-and-delivery-day";

export interface Place {
  readonly city: string;
  readonly state: string;
  readonly district: string;
}

/**
 * One delivery modality the checkout will offer her. There is more than one: the offer
 * carries a "Padrão" that she schedules across three days, and an "Express — receba hoje
 * em até 4 horas" that Logzz reports as roughly 30% more efficient and charges R$ 5,00
 * more for. Reading only the first window threw Express away, and Express is the single
 * strongest thing this funnel can say.
 */
export interface DeliveryWindow {
  readonly code: string;
  readonly name: string;
  readonly priceBrl: number | null;
  /** Today, in hours — not a scheduled day. The claim the agent may only make from here. */
  readonly sameDay: boolean;
  readonly dates: readonly string[];
}

export interface Availability {
  readonly size: Size;
  /** Cash on delivery works for this size at this postcode. The only thing this query knows. */
  readonly cod: boolean;
  /** Every modality offered, in the order the checkout returns them. */
  readonly windows: readonly DeliveryWindow[];
  /** What the customer would be charged for delivery, when cash on delivery exists. */
  readonly codFreightBrl: number | null;
  /** The days the checkout will offer her, in ISO form. */
  readonly dates: readonly string[];
  /** Same-day delivery, when this postcode has it. Absent means she may not be promised it. */
  readonly express: DeliveryWindow | null;
  /** The carrier quote on the prepaid path — the OPERATOR's cost, never her price. */
  readonly labelBrl: number | null;
}

/**
 * The query the checkout itself sends, minus the fields it ignores. A kit asks every piece in the same query, one product per size
 * with its quantity (the Coinzz kit checkout, Playwright 2026-10-22: G+GG is `products[0]` G ×1 and `products[1]` GG ×1; GG+GG is
 * `products[0]` GG ×2), and its `local_operation` price is the kit's freight.
 */
export const availabilityQuery = (
  zip: string,
  place: Place,
  code: string | ReadonlyArray<readonly [code: string, quantity: number]>,
): URLSearchParams =>
  new URLSearchParams(<Array<[string, string]>>[
    ["customer_phone_ddi", "55"],
    ["customer_phone", PLACEHOLDER.phone],
    ["customer_document", PLACEHOLDER.document],
    ...(typeof code === "string" ? [[code, 1] as const] : code).flatMap(([c, q], i): Array<[string, string]> => [
      [`products[${i}][product_id]`, PARENT_PRODUCT_ID],
      [`products[${i}][code]`, c],
      [`products[${i}][quantity]`, String(q)],
    ]),
    ["zip_code", zip],
    ["city", place.city],
    ["state", place.state],
    ["neighbourhood", place.district],
    ["number", PLACEHOLDER.number],
    ["app_integration_detail_id", APP_INTEGRATION_DETAIL_ID],
    ["freight_value", "0"],
    ["sale_type", "anticipated"],
    ["billing_moments[]", "on_delivery"],
    ["check_to_finish", "false"],
  ]);

interface RawWindow {
  deliveryTypeCode?: string;
  deliveryTypeName?: string;
  deliveryPrice?: number;
  deliverySameDay?: number | boolean;
  dates?: Array<{ date?: string }>;
}
interface RawData {
  local_operation?: Array<{ price?: number }>;
  local_operation_cash_on_delivery?: { delivery_days_available?: RawWindow[] };
  has_pending_cash_on_delivery?: boolean;
}

/**
 * The reader, kept pure so the three misreadings above can be pinned by tests instead
 * of by a comment. Anything unparseable reads as "no cash on delivery" — the agent
 * offering the prepaid path when delivery would have worked costs a little margin;
 * promising delivery that does not exist costs the sale at the door.
 */
export const readAvailability = (size: Size, body: unknown): Availability => {
  const data = (body as { data?: RawData } | null)?.data;
  const windows: DeliveryWindow[] = (
    data?.local_operation_cash_on_delivery?.delivery_days_available ?? []
  ).map((w) => ({
    code: w.deliveryTypeCode ?? "",
    name: w.deliveryTypeName ?? "",
    priceBrl: w.deliveryPrice ?? null,
    sameDay: Boolean(w.deliverySameDay),
    dates: (w.dates ?? []).flatMap((d) => (d.date ? [d.date] : [])),
  }));
  const first = windows[0];
  return {
    size,
    cod: windows.length > 0,
    windows,
    codFreightBrl: first?.priceBrl ?? null,
    dates: first?.dates ?? [],
    express: windows.find((w) => w.sameDay) ?? null,
    labelBrl: data?.local_operation?.[0]?.price ?? null,
  };
};

/**
 * A pending cash-on-delivery order locks that checkout entirely — the offer only has
 * `billing_moments = on_delivery`, so a customer who abandoned one cannot open another.
 * It comes back in the same response, keyed by CPF, so once the real document is known
 * the agent can route her to the prepaid path instead of a door that will not open.
 */
export const hasPendingCod = (body: unknown): boolean =>
  Boolean((body as { data?: RawData } | null)?.data?.has_pending_cash_on_delivery);

/**
 * Since 2026-09-24 the endpoint redirects (302) to the home page every request that does not
 * look like the checkout's own XHR, and with this header it answers again (probe of 2026-10-07:
 * São Paulo 01310-100 → three dates, Manaus 69005-010 → none). Without it every lookup read as
 * "unknown region" in production for two weeks (O-01, grafo §66).
 */
export const AVAILABILITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Requested-With": "XMLHttpRequest",
  Accept: "application/json",
};

export type Fetcher = (url: string, headers?: Readonly<Record<string, string>>) => Promise<unknown>;

/**
 * The raw Coinzz answer for one size. The postcode goes as digits only: "04710-090" is answered
 * 422 "O CEP não foi encontrado", "04710090" with the delivery days (probe of 2026-10-08, L2,
 * grafo §67) — the stored CEP keeps its hyphen, so it is stripped here, where every caller passes.
 */
const askSize = (fetcher: Fetcher, zip: string, place: Place, size: Size): Promise<unknown> =>
  fetcher(
    `${AVAILABILITY_ENDPOINT}?${availabilityQuery(zip.replace(/\D/g, ""), place, SIZE_CODES[size])}`,
    AVAILABILITY_HEADERS,
  );

/** A body the endpoint answered with success: anything else is a failed lookup, not a region. */
const answered = (body: unknown): boolean => {
  const data = (body as { data?: unknown } | null)?.data;
  return typeof data === "object" && data !== null;
};

/**
 * The prepaid freight of what she is buying at her CEP (4.7): one piece of her size, or a kit with the size of each piece. The
 * prepaid checkout charges this query's `local_operation[0].price` — `labelBrl` — rounded to the cent (Playwright, 2026-10-20: São
 * Paulo GG 19.345 → "Frete: R$ 19,35", XGG 17,78; grafo §116; the kit checkouts 2026-10-22: G+GG 33,17, G+GG+XGG 35,97, GG+GG 20,36),
 * so since the freight became hers (2026-09-10) the "operator's cost" is her price on that path. Only the placeholders of
 * `availabilityQuery` go, never her name, phone or CPF. `null` on any failure, timeout, 404 (the M), no piece or a price not read:
 * the reply keeps "aparece no checkout".
 */
export const prepayFreight = (fetcher: Fetcher, zip: string, place: Place, sizes: Size | readonly Size[]): Promise<number | null> => {
  const pieces = typeof sizes === "string" ? [sizes] : sizes;
  const first = pieces[0];
  const items = [...new Set(pieces)].map((s) => [SIZE_CODES[s], pieces.filter((x) => x === s).length] as const);
  if (first === undefined) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => fetcher(`${AVAILABILITY_ENDPOINT}?${availabilityQuery(zip.replace(/\D/g, ""), place, items)}`, AVAILABILITY_HEADERS))
    .then((body) => {
      const p = readAvailability(first, body).labelBrl;
      // Decimal half-up, as the page shows it: 19.345 * 100 is 1934.4999… in binary.
      // `${p}e2` is NaN for a price JSON writes in exponent form (5e-7): null, never NaN (/code-review).
      const cents = typeof p === "number" ? Math.round(Number(`${p}e2`)) : NaN;
      return Number.isFinite(cents) && cents > 0 ? cents / 100 : null;
    })
    .catch(() => null);
};

export const checkSize = async (
  fetcher: Fetcher,
  zip: string,
  place: Place,
  size: Size,
): Promise<Availability> => readAvailability(size, await askSize(fetcher, zip, place, size));

/**
 * The size the region query trusts first. Not a business choice — a diagnostic one: G is
 * mapped correctly on the Coinzz side. The M is not (404 for every postcode), so it never
 * decides a region alone.
 */
export const REFERENCE_SIZE: Size = "G";

/**
 * Every size, asked at once (R28, 2026-10-19). The G alone stopped answering for the region when stock
 * split by warehouse: G only in Belo Horizonte, GG and XGG in São Paulo, so São Paulo read "no delivery"
 * for every customer. Her size, when known and answered, decides; otherwise any size with delivery does.
 */
const REGION_SIZES: readonly Size[] = [REFERENCE_SIZE, "GG", "XGG", "P", "M"];

/** What the region actually offers her, with no claim about which size she gets. */
export interface Region {
  readonly zip: string;
  readonly place: Place;
  /** Cash on delivery reaches this postcode at all. */
  readonly cod: boolean;
  /** The days the checkout will offer, in ISO form. */
  readonly dates: readonly string[];
  /** Same-day delivery exists here. The only thing that lets the agent say "hoje". */
  readonly sameDay: boolean;
  /** The carrier quote on the prepaid path — the OPERATOR's cost, never her price. */
  readonly labelBrl: number | null;
  /** The size this answer is for: hers when it was asked and answered, null when it is any size's (R28). */
  readonly size?: Size | null;
  /** The size it was asked for, answered or not: the cache's key, so an M that never answers is not asked every turn. */
  readonly askedSize?: Size | null;
  /**
   * Units of her size in the Logzz operations that serve her city (`stock_per_operations[].quantity`, summed over the operations
   * `lookupLogzz` asks the days of), for scarcity (4.6). Absent or null: unknown. Never from the Coinzz `stock`, which is "1" always.
   */
  readonly stockQty?: number | null;
  /**
   * Her size has no stock where she lives, and these sizes have (A4, personas of 2026-10-24): the reason the delivery does not
   * reach her is the size, not her region. Absent: not read (a cache from before, the Coinzz fallback, the region's own "no").
   */
  readonly otherSizesInStock?: readonly Size[];
  /** Her size has no stock to sell on either path (the Coinzz 404 for it, 2026-10-27): no link, no offer. Absent: not read. */
  readonly sizeOutOfStock?: boolean;
}

/**
 * The postcode a Brazilian address lookup answers with. Kept here rather than imported so
 * this file stays mirrorable byte for byte; a failure reads as "unknown region", which
 * makes the agent ask again instead of guessing a city.
 */
export const VIACEP_ENDPOINT = "https://viacep.com.br/ws";

export const readPlace = (body: unknown): Place | null => {
  const j = body as { localidade?: string; uf?: string; bairro?: string; erro?: unknown } | null;
  if (!j || j.erro || !j.localidade || !j.uf) return null;
  return { city: j.localidade, state: j.uf, district: j.bairro || "Centro" };
};

export const toRegion = (
  zip: string,
  place: Place,
  a: Availability,
  size: Size | null = null,
  askedSize: Size | null = size,
): Region => ({
  zip,
  place,
  cod: a.cod,
  dates: a.dates,
  sameDay: a.express !== null,
  labelBrl: a.labelBrl,
  size,
  askedSize,
});

/**
 * The CEPs of a street in a city (ViaCEP's street search, operator 2026-10-19): the way out when the CEP she sent is
 * one the Correios do not know. The first candidate split that finds the street wins; none found is an empty list,
 * and a failed search is the caller's to treat as nothing found.
 */
export const cepsByStreet = async (
  fetcher: Fetcher,
  state: string,
  queries: ReadonlyArray<{ street: string; city: string }>,
): Promise<Array<{ cep: string; complement: string; street: string; city: string }>> => {
  const lists = await Promise.all(
    queries.map((q) =>
      fetcher(`${VIACEP_ENDPOINT}/${state}/${encodeURIComponent(q.city)}/${encodeURIComponent(q.street)}/json/`).catch(() => null),
    ),
  );
  for (const list of lists) {
    if (!Array.isArray(list) || list.length === 0) continue;
    return list
      .filter((x): x is { cep: string; complemento?: string; logradouro?: string; localidade?: string; unidade?: string } => typeof x?.cep === "string")
      // A company's own CEP ("unidade": "Rheen Empreendimentos…") is no home's: kept, her one-CEP street asked the house number
      // for nothing (operator's test, 2026-10-21).
      .filter((x) => !x.unidade)
      .map((x) => ({ cep: x.cep, complement: x.complemento ?? "", street: x.logradouro ?? "", city: x.localidade ?? "" }));
  }
  return [];
};

/**
 * What the lookup found: the region, a CEP the Correios do not know (ViaCEP `erro`, operator 2026-10-09:
 * she is told it was not found and asked to check it), or a lookup that failed — the network, a Coinzz
 * answer without `data` — which says nothing about her region.
 */
/** A failed lookup keeps the place when ViaCEP answered: a city where the Logzz delivers gets both checkouts (2026-10-19). */
export type RegionLookup = { kind: "found"; region: Region } | { kind: "not_found" } | { kind: "failed"; place?: Place };

/**
 * The second CEP base (2026-10-19): ViaCEP does not know every CEP the Correios do — "62.930.000", a real lead's town
 * CEP, was "not found" there and found here (BrasilAPI asks the Correios, ViaCEP and others, like the Logzz checkout's
 * own CEP lookup). Asked only when ViaCEP did not answer with a place.
 */
export const BRASILAPI_CEP_ENDPOINT = "https://brasilapi.com.br/api/cep/v1";
const readBrasilPlace = (body: unknown): { place: Place; neighborhood: string } | null => {
  const j = body as { city?: string; state?: string; neighborhood?: string } | null;
  return j?.city && j.state ? { place: { city: j.city, state: j.state, district: j.neighborhood || "Centro" }, neighborhood: j.neighborhood ?? "" } : null;
};

/**
 * The Logzz scheduling checkout's own two queries (operator, 2026-10-19: São Paulo had 180 G while the Coinzz query said
 * "no delivery" for the G there). Cash on delivery is sold on this checkout, so this is the answer she meets: the stock
 * per size in the local operations that serve her city, then the days those operations deliver. Public, read-only,
 * no cookie — the checkout's own XHR, asked with the offer's product and sale ids from the config.
 */
export const LOGZZ_BASE = "https://entrega.logzz.com.br";
export interface LogzzIds {
  readonly productId: string;
  readonly saleId: string;
}
/** The checkout's size names; its "XG" is the table's XGG. */
const LOGZZ_SIZE: Readonly<Record<string, Size>> = { P: "P", M: "M", G: "G", GG: "GG", XG: "XGG", XGG: "XGG" };

/** The operations holding each size, from the stock answer. `null`: it did not answer (a failed lookup). */
/**
 * The Logzz answers "we do not deliver there" as HTTP 400 with `status: "error"` and one of three messages ("bloqueado para
 * entrega nessa cidade", "não faz parte da lista de disponibilidade de entregas", "Produto sem estoque disponível para
 * agendamento nessa cidade") — a region answer, not a failure (real sweep of 2026-10-19: Manaus, Cruz Alta, Recife,
 * Curitiba). Any other error, validation included, is a failed lookup: an unknown message never reads as "no delivery".
 */
const NOT_SERVED = /bloqueado para entrega|n[aã]o faz parte da lista de disponibilidade|sem estoque dispon[ií]vel/i;
/** A non-2xx the fetcher threw, with the parsed body it carries (`status`, `body`): the Logzz 400 is read from it. */
const errorBody = (e: unknown): unknown => (e as { body?: unknown } | null)?.body;

/** What the stock answer says: the operations holding each size, the sizes it spoke of clearly, and whether any product was unreadable. */
/** `seen` maps each such size to its units summed over the operations holding it (0: it spoke of the size, none in stock). */
export type LogzzStock =
  | { cod: false }
  | { cod: true; bySize: Partial<Record<Size, number[]>>; seen: ReadonlyMap<Size, number>; unreadable: boolean; productOf: Partial<Record<Size, number>> }
  | null;

export const readLogzzStock = (body: unknown): LogzzStock => {
  const b = body as {
    status?: string;
    msg?: string;
    data?: {
      groups?: Array<{ variations?: Array<{ variation_id?: number; variation_name?: string }> }>;
      products?: Array<{ product_id?: number | string; product_name?: string; variations_combination?: number[]; stock_per_operations?: Array<{ operation_id?: number | string; quantity?: number | string }> }>;
    };
  } | null;
  if (b?.status === "error") return NOT_SERVED.test(typeof b.msg === "string" ? b.msg : "") ? { cod: false } : null;
  if (b?.status !== "success" || !Array.isArray(b.data?.products)) return null;
  // The size of a product: by its variation (the answer carries the id → name table), else by the name's last piece.
  const variation = new Map<number, string>();
  for (const g of Array.isArray(b.data?.groups) ? b.data!.groups! : []) for (const v of Array.isArray(g?.variations) ? g.variations : []) if (typeof v?.variation_id === "number") variation.set(v.variation_id, String(v.variation_name ?? ""));
  const bySize: Partial<Record<Size, number[]>> = {};
  const seen = new Map<Size, number>();
  const productOf: Partial<Record<Size, number>> = {};
  let unreadable = false;
  for (const p of b.data!.products!) {
    const label = variation.get(Array.isArray(p?.variations_combination) ? p.variations_combination[0]! : NaN) ?? String(p?.product_name ?? "").split("-").pop() ?? "";
    const size = LOGZZ_SIZE[label.trim().toUpperCase()];
    // A product is understood only whole: its size, a list of operations, and for each a whole operation id and a quantity.
    // A number, or a text that holds one: an empty field is not a zero (`Number("")` and `Number(null)` are 0, review).
    const num = (x: unknown): number => (typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN);
    const stock = Array.isArray(p?.stock_per_operations) ? p.stock_per_operations.map((o) => ({ op: num(o?.operation_id), qty: num(o?.quantity) })) : null;
    if (!size || stock === null || stock.some((o) => !Number.isInteger(o.op) || !Number.isFinite(o.qty))) {
      unreadable = true;
      continue;
    }
    // Operation 0 is no operation (the Logzz lists stock under it that no city is served from): the real checkout leaves it out
    // of `operation_ids[]`, and asking with it is answered 422 "Cada ID de operação deve existir" — every Recife CEP read as a
    // failed lookup instead of "no delivery" (Playwright, 2026-10-23). Nor does it count as her region's stock (the scarcity line).
    const local = stock.filter((o) => o.op > 0);
    const ops = local.filter((o) => o.qty > 0).map((o) => o.op);
    seen.set(size, (seen.get(size) ?? 0) + local.reduce((t, o) => t + (o.qty > 0 ? o.qty : 0), 0));
    if (ops.length > 0) bySize[size] = [...(bySize[size] ?? []), ...ops];
    const product = num(p?.product_id);
    if (Number.isInteger(product) && product > 0) productOf[size] = product;
  }
  // An answer nothing of which could be read is not "no stock" (review, 19/10): a renamed variation would otherwise
  // tell the whole country there is no delivery. Unknown is a failed lookup; the health probe says so within 15 minutes.
  return seen.size === 0 ? null : { cod: true, bySize, seen, unreadable, productOf };
};

/**
 * The Logzz ids of the configured offer. `checkout.logzz` wins; absent, the one offer this shop runs is known by its checkout
 * slug, so the live secret needs no edit for the lookup to ask the right source (the secret's hash moved from the repository
 * file on 2026-10-19: the operator edits it, and overwriting it would revert them). shortcut: one offer, add a row for a new one.
 */
const KNOWN_LOGZZ_OFFERS: Readonly<Record<string, LogzzIds>> = { "ccm-1-unidade": { productId: "165378", saleId: "75567" } };
export const logzzIdsOf = (checkout: { codUrl?: string; logzz?: LogzzIds } | undefined): LogzzIds | null =>
  checkout?.logzz ?? KNOWN_LOGZZ_OFFERS[(checkout?.codUrl ?? "").split("?")[0]!.replace(/\/+$/, "").split("/").pop() ?? ""] ?? null;

/**
 * The delivery days of the operations that hold her size. `null`: an answer not understood. `dates: []`: a window that is
 * explicitly closed (an empty list, or every window with an empty list of days). A window whose days are not a list is not
 * "closed", it is unknown, unless another window gives days (review, 19/10).
 */
const readLogzzDays = (body: unknown): { dates: string[]; sameDay: boolean } | null => {
  const b = body as { status?: string; data?: unknown } | null;
  if (b?.status !== "success" || !Array.isArray(b.data)) return null;
  const windows = b.data.filter((w): w is RawWindow => typeof w === "object" && w !== null);
  if (windows.length !== b.data.length) return null;
  const datesOf = (w: RawWindow): string[] => (Array.isArray(w.dates) ? w.dates.flatMap((d) => (typeof d?.date === "string" && d.date ? [d.date] : [])) : []);
  const withDays = windows.filter((w) => datesOf(w).length > 0);
  if (withDays.length === 0) return windows.some((w) => !Array.isArray(w.dates) || w.dates.length > 0) ? null : { dates: [], sameDay: false };
  return { dates: datesOf(withDays[0]!), sameDay: withDays.some((w) => Boolean(w.deliverySameDay)) };
};

const lookupLogzzUnsafe = async (
  fetcher: Fetcher,
  zip: string,
  place: Place,
  neighborhood: string,
  size: Size | null,
  ids: LogzzIds,
): Promise<RegionLookup> => {
  const where = { city: place.city, uf: place.state, cep: zip.replace(/\D/g, ""), ...(neighborhood ? { neighborhood } : {}), sale_id: ids.saleId };
  const stock = await fetcher(
    `${LOGZZ_BASE}/ajax/get-available-stock-for-schedule?${new URLSearchParams({ product_id: ids.productId, ...where })}`,
    AVAILABILITY_HEADERS,
  )
    .then(readLogzzStock)
    .catch((e) => readLogzzStock(errorBody(e)));
  if (stock === null) return { kind: "failed", place };
  const none: Region = { zip, place, cod: false, dates: [], sameDay: false, labelBrl: null, size, askedSize: size };
  if (!stock.cod) return { kind: "found", region: none };
  // Her size decides when known: no stock of hers where she lives is no delivery for her, whatever the other sizes hold. But
  // "no stock" is said only of a size the answer spoke of clearly: hers unreadable (renamed, malformed) is an unknown.
  // The days are asked like the real checkout asks them (Playwright, 2026-10-23): the operations holding ONE size and that size's
  // product in `product_requirements` — without it the Logzz answers "Nenhuma opção de entrega" even in São Paulo. With her size
  // unknown, the size with the most local stock stands for the region.
  const asked: Size | null = size ?? (Object.keys(stock.bySize) as Size[]).sort((a, b) => (stock.seen.get(b) ?? 0) - (stock.seen.get(a) ?? 0))[0] ?? null;
  const ops = [...new Set(asked !== null ? stock.bySize[asked] ?? [] : [])];
  if (ops.length === 0) {
    return size !== null
      ? stock.seen.has(size) && !stock.unreadable
        ? { kind: "found", region: { ...none, otherSizesInStock: (Object.keys(stock.bySize) as Size[]).filter((s) => s !== size) } }
        : { kind: "failed", place }
      : stock.unreadable ? { kind: "failed", place } : { kind: "found", region: none };
  }
  const product = asked !== null ? stock.productOf[asked] : undefined;
  if (product === undefined) return { kind: "failed", place };
  const q = new URLSearchParams(where);
  for (const id of ops) q.append("operation_ids[]", String(id));
  q.append("product_requirements[0][product_id]", String(product));
  q.append("product_requirements[0][quantity]", "1");
  // The days are the second question. Stock without a confirmed window is not a delivery to promise (a date, "amanhã") and not
  // a denial either: unless the Logzz itself says it does not serve the address, an unknown is a failed lookup.
  const days = await fetcher(`${LOGZZ_BASE}/ajax/get-delivery-days-options-by-operations-ids?${q}`, AVAILABILITY_HEADERS)
    .then(readLogzzDays)
    .catch((e) => (NOT_SERVED.test(String((errorBody(e) as { msg?: unknown } | null)?.msg ?? "")) ? { dates: [], sameDay: false, closed: true } : null));
  if (days === null) return { kind: "failed", place };
  if ("closed" in days || days.dates.length === 0) return { kind: "found", region: none };
  // A product left unreadable may be more of her size: a partial count is a false "restam só" (plan 16 review), so none.
  const stockQty = size !== null && !stock.unreadable ? stock.seen.get(size) ?? null : null;
  return { kind: "found", region: { zip, place, cod: true, dates: days.dates, sameDay: days.sameDay, labelBrl: null, size, askedSize: size, stockQty } };
};

/** Never throws, whatever the Logzz sends: a failure keeps the place, so a likely city still gets both checkouts. It never falls
 * back to the Coinzz query, the one that said "no delivery" in São Paulo (operator, 2026-10-19). */
const lookupLogzz = (...a: Parameters<typeof lookupLogzzUnsafe>): Promise<RegionLookup> =>
  lookupLogzzUnsafe(...a).catch((): RegionLookup => ({ kind: "failed", place: a[2] }));

/** The Coinzz query, per size, for a place already known. */
const lookupCoinzz = async (fetcher: Fetcher, zip: string, place: Place, size: Size | null): Promise<RegionLookup> => {
  // A failed lookup (422, a redirect, a timeout's null) is "unknown region", never "no cash on
  // delivery": read as "no", it told every buyer in São Paulo that delivery did not reach her (L2).
  // One size that throws (timeout, network, HTML) is one size unanswered, never the whole region (R28 review).
  // `undefined` = it threw; `null` = it answered nothing (the M's 404 reaches here as null, `!r.ok`).
  const bodies = await Promise.all(REGION_SIZES.map((s) => askSize(fetcher, zip, place, s).catch(() => undefined)));
  // Her own size failing in transit is an unknown region, as before: another size's delivery is never kept for her
  // for an hour on a timeout (third review). The short second try and L2 take it from there.
  if (size !== null && bodies[REGION_SIZES.indexOf(size)] === undefined) return { kind: "failed", place };
  const answers = REGION_SIZES.flatMap((s, i) => (answered(bodies[i]) ? [readAvailability(s, bodies[i])] : []));
  if (answers.length === 0) return { kind: "failed", place };
  // Her size, answered, is the truth for her: the G in São Paulo is not promised on the GG's stock (R28 review).
  const hers = answers.find((a) => a.size === size);
  if (hers) return { kind: "found", region: toRegion(zip, place, hers, size) };
  // Her size answered nothing (the 404 "Não foi possível identificar o endereço", `null` here) while another size answered: the
  // real Coinzz checkout blocks that size on both paths (Playwright, 2026-10-27: the M in every city), so no door and no stock.
  if (size !== null && bodies[REGION_SIZES.indexOf(size)] === null) {
    return { kind: "found", region: { ...toRegion(zip, place, answers[0]!, size), cod: false, dates: [], sameDay: false, labelBrl: null, sizeOutOfStock: true } };
  }
  const any = toRegion(zip, place, answers.find((a) => a.cod) ?? answers[0]!, null, size);
  // Her size known and not answered: another size's delivery may stand, its "hoje" never does (second review).
  return { kind: "found", region: size === null ? any : { ...any, sameDay: false } };
};

const lookupRegionUnsafe = async (fetcher: Fetcher, zip: string, size: Size | null, logzz: LogzzIds | null): Promise<RegionLookup> => {
  const viacep = await fetcher(`${VIACEP_ENDPOINT}/${zip.replace(/\D/g, "")}/json/`).catch(() => null);
  const erro = (viacep as { erro?: unknown } | null)?.erro;
  let place = readPlace(viacep);
  let neighborhood = (viacep as { bairro?: string } | null)?.bairro ?? "";
  if (!place) {
    const brasil = readBrasilPlace(await fetcher(`${BRASILAPI_CEP_ENDPOINT}/${zip.replace(/\D/g, "")}`).catch(() => null));
    if (brasil) ({ place, neighborhood } = brasil);
  }
  if (!place) return erro === true || erro === "true" ? { kind: "not_found" } : { kind: "failed" };
  if (!logzz) return lookupCoinzz(fetcher, zip, place, size);
  const first = await lookupLogzz(fetcher, zip, place, neighborhood, size, logzz);
  if (first.kind !== "failed") return first;
  // The Logzz could not answer (down, challenged, an answer not understood): the second legitimate source is the Coinzz query.
  // Its "yes" is evidence (BH answers cod on both); its "no" is the answer that was wrong in São Paulo, so it is never a denial.
  const second = await lookupCoinzz(fetcher, zip, place, size).catch((): RegionLookup => first);
  // Evidence for HER size, with days: another size's delivery lent to her, or a window with no day, is not a "yes".
  return second.kind === "found" && second.region.cod && second.region.dates.length > 0 && second.region.size === size ? second : first;
};

/**
 * The region of a CEP. NEVER throws, whatever any source sends: the worst outcome is `failed`, which the turn answers with the
 * place kept (both checkouts for a likely city, the prepaid otherwise) and the health probe reports to the operator.
 */
export const lookupRegion = (fetcher: Fetcher, zip: string, size: Size | null = null, logzz: LogzzIds | null = null): Promise<RegionLookup> =>
  lookupRegionUnsafe(fetcher, zip, size, logzz).catch((): RegionLookup => ({ kind: "failed" }));

/**
 * The region a turn found, kept on `leads.address.region` (E2.4, latency): the next turn reuses it
 * instead of asking ViaCEP and Coinzz again, for the same CEP and up to an hour. Only a `found`
 * region is ever kept — a failed lookup stays "unknown region", never "no cash on delivery".
 */
export const REGION_CACHE_MS = 60 * 60 * 1000;
export type CachedRegion = Region & { readonly checkedAt: string };

export const cachedRegion = (
  cached: CachedRegion | null | undefined,
  zip: string,
  now: number,
  size: Size | null = null,
): Region | null => {
  if (!cached || cached.zip.replace(/\D/g, "") !== zip.replace(/\D/g, "")) return null;
  // An answer for another size (or for any size, now that hers is known) is asked again (R28).
  if ((cached.askedSize ?? cached.size ?? null) !== size) return null;
  const age = now - Date.parse(cached.checkedAt);
  if (!(age >= 0 && age < REGION_CACHE_MS)) return null;
  // The dates shift at midnight: only the same São Paulo day (UTC−3) is served (/code-review of E2).
  const day = (ms: number) => new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (day(Date.parse(cached.checkedAt)) !== day(now)) return null;
  // The same-day window closes during the day: served, but never as "hoje" (E2 review, /code-review).
  return cached.sameDay ? { ...cached, sameDay: false } : cached;
};

export const checkRegion = async (fetcher: Fetcher, zip: string, size: Size | null = null): Promise<Region | null> => {
  const lookup = await lookupRegion(fetcher, zip, size);
  return lookup.kind === "found" ? lookup.region : null;
};

/**
 * The coverage alarm (E1.2): cash on delivery vanished twice for every customer with nobody told
 * (grafo §66/§67). Each CEP goes through the conversation's own lookup; a throw is `failed`.
 */
export interface CoverageCheck {
  readonly cep: string;
  readonly result: "cod" | "no_cod" | "failed" | "not_found";
}

export const checkCoverage = (fetcher: Fetcher, ceps: readonly string[], logzz: LogzzIds | null = null): Promise<CoverageCheck[]> =>
  Promise.all(
    ceps.map(async (cep): Promise<CoverageCheck> => {
      const lookup = await lookupRegion(fetcher, cep, null, logzz).catch((): RegionLookup => ({ kind: "failed" }));
      return { cep, result: lookup.kind === "found" ? (lookup.region.cod ? "cod" : "no_cod") : lookup.kind };
    }),
  );

/**
 * The lookups of real conversations in the last hour (`coverage_lookups`): a source that is down shows here before anyone
 * counts the sales that did not happen. Degraded when at least `LOOKUPS_MIN` of them were answered and a third or more
 * were "could not tell" (`failed`). A CEP nobody knows (`not_found`) is the customer's typo, not a source failing.
 */
export const LOOKUPS_MIN = 5;
export const LOOKUPS_FAILED_SHARE = 1 / 3;
export const lookupsDegraded = (rows: ReadonlyArray<{ outcome?: unknown }>): { degraded: boolean; total: number; failed: number } => {
  const known = rows.filter((r) => r.outcome === "cod" || r.outcome === "no_cod" || r.outcome === "failed");
  const failed = known.filter((r) => r.outcome === "failed").length;
  return { degraded: known.length >= LOOKUPS_MIN && failed / known.length >= LOOKUPS_FAILED_SHARE, total: known.length, failed };
};

/** Healthy only when every CEP known to have cash on delivery still answers with it. */
export const healthOf = (checks: readonly CoverageCheck[]): "healthy" | "unhealthy" =>
  checks.length > 0 && checks.every((c) => c.result === "cod") ? "healthy" : "unhealthy";

/**
 * The label the operator paid, fixed by Logzz at R$ 15,00 (support, 2026-09-09). It was
 * R$ 20,00 with the excess passed on to the customer; both changed at once — the freight
 * became a single value everywhere, paid by the operator on either path.
 *
 * On 2026-09-10 that arrangement ended: the prepaid freight is the customer's again,
 * calculated by region inside the checkout, and cash on delivery carries it inside the
 * price. So this number is **no longer the current cost of freight** — it is the
 * historical record of what the margin sheet read up to here, kept because that sheet
 * still cites it. Nothing routes on it: there is no postcode where a sale is worth
 * refusing over freight.
 */
export const LABEL_COST_BRL = 15;

/**
 * Which path to offer, given what the query found.
 *
 * Cash on delivery first — the operator's decision, and the one that converts with a
 * cold audience. When delivery does not reach her postcode, the prepaid path is always
 * the answer: it ships free nationwide and its checkout opens everywhere.
 *
 * There is no third branch, and since 2026-09-09 there is no arithmetic either. An early
 * version sent her to a waitlist when the carrier quote passed a cap, on the reasoning
 * that a distant postcode sold at a loss; then the cap moved the excess onto her. Logzz
 * fixed the freight instead — one value, paid by the operator, everywhere — so margin is
 * flat wherever she lives and no postcode is worth refusing.
 */
export type Route =
  | { readonly path: "cod"; readonly freightBrl: number | null; readonly dates: readonly string[] }
  | { readonly path: "prepay"; readonly labelBrl: number | null };

export const routeFor = (a: Availability): Route =>
  a.cod
    ? { path: "cod", freightBrl: a.codFreightBrl, dates: a.dates }
    // `labelBrl` is the carrier's quote, kept for the margin sheet. It is not her price
    // and no longer decides anything: the freight is fixed and she pays none of it.
    : { path: "prepay", labelBrl: a.labelBrl };
