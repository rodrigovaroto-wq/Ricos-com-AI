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
 * AND IT IS TRUSTWORTHY BY REGION, NOT BY SIZE. Cash on delivery moved to the Logzz
 * scheduling checkout on 2026-09-09, and this query still reads the same Logzz local
 * operation behind it — the same coverage, the same three dates, the same Express. What
 * it gets wrong is the per-size answer: it reports no delivery for the M anywhere,
 * including a warehouse holding 196 units, and the operator identified that as a fault
 * in the Coinzz product mapping rather than the warehouse's answer.
 *
 * So the agent asks it one question — does delivery reach this postcode, on which days —
 * using a size known to be mapped correctly, and never lets the per-size answer veto a
 * size. Which size she gets is the Logzz checkout's call, where the M works.
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

/** The query the checkout itself sends, minus the fields it ignores. */
export const availabilityQuery = (zip: string, place: Place, code: string): URLSearchParams =>
  new URLSearchParams({
    customer_phone_ddi: "55",
    customer_phone: PLACEHOLDER.phone,
    customer_document: PLACEHOLDER.document,
    "products[0][product_id]": PARENT_PRODUCT_ID,
    "products[0][code]": code,
    "products[0][quantity]": "1",
    zip_code: zip,
    city: place.city,
    state: place.state,
    neighbourhood: place.district,
    number: PLACEHOLDER.number,
    app_integration_detail_id: APP_INTEGRATION_DETAIL_ID,
    freight_value: "0",
    sale_type: "anticipated",
    "billing_moments[]": "on_delivery",
    check_to_finish: "false",
  });

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

export type Fetcher = (url: string) => Promise<unknown>;

export const checkSize = async (
  fetcher: Fetcher,
  zip: string,
  place: Place,
  size: Size,
): Promise<Availability> =>
  readAvailability(
    size,
    await fetcher(`${AVAILABILITY_ENDPOINT}?${availabilityQuery(zip, place, SIZE_CODES[size])}`),
  );

/**
 * The size the region query is asked with. Not a business choice — a diagnostic one: G is
 * mapped correctly on the Coinzz side, so it answers for the region instead of answering
 * for the mapping. Asking with the M would report every praça as closed.
 */
export const REFERENCE_SIZE: Size = "G";

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

export const toRegion = (zip: string, place: Place, a: Availability): Region => ({
  zip,
  place,
  cod: a.cod,
  dates: a.dates,
  sameDay: a.express !== null,
  labelBrl: a.labelBrl,
});

export const checkRegion = async (
  fetcher: Fetcher,
  zip: string,
): Promise<Region | null> => {
  const place = readPlace(await fetcher(`${VIACEP_ENDPOINT}/${zip.replace(/\D/g, "")}/json/`));
  if (!place) return null;
  return toRegion(zip, place, await checkSize(fetcher, zip, place, REFERENCE_SIZE));
};

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
