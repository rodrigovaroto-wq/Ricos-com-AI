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
 * AND AS OF 2026-09-09 IT NO LONGER DESCRIBES THE CASH-ON-DELIVERY PATH AT ALL.
 * That path moved to the Logzz scheduling checkout; Coinzz now serves the prepaid
 * offer only. The M is the proof: this query reports no delivery for it anywhere,
 * including a warehouse holding 196 units, and the operator confirmed that is a
 * Coinzz integration fault rather than the warehouse's answer. So routing a real
 * conversation on what this returns per size would push every M customer away from a
 * path that works for her. Nothing here is wired into the handler until the Logzz
 * checkout's own availability call is found — the same way this one was, in the
 * network tab of the page the customer actually opens.
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

/** The carrier cost the operator absorbs. Past it, the customer pays the excess. */
export const LABEL_CAP_BRL = 20;

/**
 * Which path to offer, given what the query found.
 *
 * Cash on delivery first — the operator's decision, and the one that converts with a
 * cold audience. When it is closed for her size at her postcode, the prepaid path is
 * always the answer: it ships free nationwide and its checkout opens everywhere.
 *
 * There is no third branch. An earlier version sent her to a waitlist when the carrier
 * quote passed the cap, on the reasoning that a distant postcode sold at a loss. The
 * cap removed that: the operator absorbs up to R$ 20,00 and the excess is charged to
 * the customer, so margin is flat wherever she lives and a sale is never worth refusing.
 */
export type Route =
  | { readonly path: "cod"; readonly freightBrl: number | null; readonly dates: readonly string[] }
  | { readonly path: "prepay"; readonly labelBrl: number | null; readonly excessBrl: number };

export const routeFor = (a: Availability, maxLabelBrl: number = LABEL_CAP_BRL): Route =>
  a.cod
    ? { path: "cod", freightBrl: a.codFreightBrl, dates: a.dates }
    : {
        path: "prepay",
        labelBrl: a.labelBrl,
        // An absent quote is not a high one: the carrier simply did not answer, and the
        // prepaid checkout opens regardless. Charging her for a quote nobody gave is worse
        // than absorbing it, so a missing label costs the customer nothing.
        excessBrl: Math.max(0, (a.labelBrl ?? 0) - maxLabelBrl),
      };
