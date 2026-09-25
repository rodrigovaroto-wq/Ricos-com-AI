/**
 * The Coinzz order body, built here and posted by n8n.
 *
 * The split follows the rule the project already set: n8n is pipe and clock, business
 * rules are versioned code with tests. Deciding what an order says — which offer,
 * which payment method, the customer's document stripped to digits, the freight in
 * cents — is a rule. Holding the credential and making the HTTP call is pipe.
 *
 * So no token appears in this repository, in Supabase, or in any config file. n8n owns
 * it, the turn answers with the body, and the HTTP node sends it. That also means the
 * base URL is not our problem: it lives in the n8n node beside the credential.
 *
 * One thing this module refuses to guess. Their `payment_method` accepts `afterpay`,
 * `bank_slip`, `credit_card` and `pix` — **none of which is named cash on delivery**,
 * and cash on delivery is the entire funnel. `afterpay` is the obvious candidate, it
 * literally means pay later, but sending the wrong one creates an order the customer
 * never agreed to pay that way and she finds out at the door. So it is configuration
 * the operator confirms in the Coinzz dashboard, never an inference made here.
 */
import type { Address } from "./address.ts";

/**
 * The slice of the checkout request this module reads. Declared here rather than
 * imported so the Edge Function copy stays byte-identical to `src/order/coinzz.ts`,
 * the rule every mirrored file follows.
 */
export interface CheckoutRequest {
  leadId: string;
  name: string;
  phone: string;
  address: Address;
  size: string;
  paymentMethod: "cod" | "prepay";
}

/** The four values their `payment_method` accepts. */
export const COINZZ_PAYMENT_METHODS = ["afterpay", "bank_slip", "credit_card", "pix"] as const;
export type CoinzzPaymentMethod = (typeof COINZZ_PAYMENT_METHODS)[number];

export interface CoinzzConfig {
  /**
   * Hash of the cash-on-delivery offer — the one the site links as
   * `checkout/encorpa-pagamento-na-entrega-0`.
   */
  offerHash: string;
  /**
   * Hash of the prepaid offer (`checkout/encorpa-pagamento-antecipado-0`). It is a
   * different offer, with a different price, so it is a different hash: the shop sells
   * two, and sending the cash-on-delivery hash on the prepaid path charges her the
   * wrong amount. Absent means the prepaid path cannot create an order yet, which is
   * better than creating the wrong one.
   */
  prepayOfferHash?: string;
  /** Which of their four methods means "pays the courier at the door". */
  codPaymentMethod: CoinzzPaymentMethod;
  /** Which one the prepaid path uses. Pix unless the operator says otherwise. */
  prepayPaymentMethod?: CoinzzPaymentMethod;
  /** Freight in cents, for the prepaid path where it is charged separately. */
  shippingValueCents?: number;
}

/** Their customer object. Every field here is required on their side. */
export interface CoinzzCustomer {
  name: string;
  email: string;
  document: string;
  phone: string;
  address: {
    zip_code: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
}

export interface CoinzzOrder {
  offer_hash: string;
  payment_method: CoinzzPaymentMethod;
  customer: CoinzzCustomer;
  shipping_value?: number;
}

/** What n8n gets back, ready to post, with nothing left to decide. */
export interface CoinzzRequest {
  /** The body, exactly as their API expects it. */
  body: CoinzzOrder;
  /**
   * Ours, not theirs: the same confirmed order must never become two. n8n carries it
   * so a retried webhook resolves to the order that already exists.
   */
  idempotencyKey: string;
}

/** Configuration or customer data that is still missing, listed before anything is sent. */
export class CoinzzIncompleteError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`pedido Coinzz incompleto: ${missing.join(", ")}`);
    this.name = "CoinzzIncompleteError";
  }
}

const PLACEHOLDER = /^\{\{.*\}\}$/;
const filled = (v: unknown): boolean =>
  typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v);

export const missingCoinzzConfig = (config: Partial<CoinzzConfig>): string[] => {
  const missing: string[] = [];
  if (!filled(config.offerHash)) missing.push("coinzz.offerHash");
  if (!filled(config.codPaymentMethod)) missing.push("coinzz.codPaymentMethod");
  else if (!COINZZ_PAYMENT_METHODS.includes(config.codPaymentMethod as CoinzzPaymentMethod))
    missing.push(`coinzz.codPaymentMethod inválido: ${config.codPaymentMethod}`);
  return missing;
};

/** CEP and CPF go over the wire as digits, without the punctuation people type. */
const digitsOnly = (s: string): string => s.replace(/\D/g, "");

/**
 * Our address into theirs. `complement` is the only optional field on their side, so
 * it is the only one allowed to be absent — a blank anywhere else is a delivery that
 * fails at the door.
 */
export const toCoinzzAddress = (address: Address): CoinzzCustomer["address"] => ({
  zip_code: digitsOnly(address.cep),
  street: address.street,
  number: address.number,
  ...(address.complement ? { complement: address.complement } : {}),
  neighborhood: address.neighborhood,
  city: address.city,
  state: address.state,
});

/** Reais to cents, their unit. R$ 129,90 is 12990, and rounding beats truncation. */
export const toCents = (brl: number): number => Math.round(brl * 100);

/** Everything the order needs that the conversation has to collect. */
export interface OrderIdentity {
  name: string;
  email: string;
  /** CPF as she typed it; the digits are extracted here. */
  document: string;
}

/**
 * The body, built and inspectable before anything leaves. Separated from any HTTP on
 * purpose: a body that can be asserted in a test is a body nobody has to send a real
 * order to check — and here a wrong one becomes a package on a stranger's doorstep.
 */
export const buildCoinzzRequest = (
  request: CheckoutRequest & OrderIdentity,
  config: CoinzzConfig,
  idempotencyKey: string,
): CoinzzRequest => {
  const missing = [
    ...missingCoinzzConfig(config),
    ...(filled(request.name) ? [] : ["customer.name"]),
    ...(filled(request.email) ? [] : ["customer.email"]),
    ...(digitsOnly(request.document ?? "").length >= 11 ? [] : ["customer.document"]),
    ...(filled(request.phone) ? [] : ["customer.phone"]),
  ];
  if (missing.length > 0) throw new CoinzzIncompleteError(missing);

  const payment_method =
    request.paymentMethod === "cod"
      ? config.codPaymentMethod
      : (config.prepayPaymentMethod ?? "pix");

  // Two offers, two hashes. Falling back to the cash-on-delivery one on the prepaid
  // path would charge her R$ 129,90 for the R$ 110,41 offer she chose.
  const offer_hash = request.paymentMethod === "cod" ? config.offerHash : config.prepayOfferHash;
  if (!filled(offer_hash)) throw new CoinzzIncompleteError(["coinzz.prepayOfferHash"]);

  return {
    idempotencyKey,
    body: {
      offer_hash: offer_hash!,
      payment_method,
      customer: {
        name: request.name.trim(),
        email: request.email.trim().toLowerCase(),
        document: digitsOnly(request.document),
        phone: request.phone,
        address: toCoinzzAddress(request.address),
      },
      // Cash on delivery has the freight inside the price already; only the prepaid
      // path charges it separately, and only there does it belong in the body.
      ...(request.paymentMethod === "prepay" && config.shippingValueCents
        ? { shipping_value: config.shippingValueCents }
        : {}),
    },
  };
};

/**
 * The checkout link, with what the checkout can actually receive.
 *
 * Verified against the page itself on 2026-09-08, not assumed: the served bundle
 * `/assets/js/checkout/new-checkout-two.js` reads exactly four values off the query
 * string — `name`, `email`, `phone`, `document` — in `getQueryParams`, writes them into
 * `#customer-name`, `#customer-email`, `#customer-phone` and `#customer-cpf`, and, when
 * **all four** are present and valid, calls `changeAccordion(0)` and moves her straight
 * to the address step. Three out of four fill the fields and skip nothing.
 *
 * What it does NOT accept is as important, and it is the same on both platforms. There
 * is no query parameter for the address: CEP, rua, número, bairro, cidade and UF are
 * typed in the checkout, whatever the conversation collected — which is why the agent
 * does not ask for them. The size cannot be sent either.
 *
 * And on the Logzz path the size is not even a selector. The supplier's own product
 * page says it in capitals: "INSIRA O TAMANHO NO COMPLEMENTO DO AGENDAMENTO". She types
 * it into the complement field when she picks the delivery day, so the agent has to tell
 * her that in words — a customer who leaves it blank gets whatever the warehouse picks.
 *
 * That is the honest shape of this path, and it is why the message that carries the link
 * has to say what is left for her to do instead of implying the order is done.
 */
export interface CheckoutLinkConfig {
  /** Full checkout URL of the cash-on-delivery offer. */
  codUrl: string;
  /** Full checkout URL of the prepaid offer. */
  prepayUrl?: string;
}

/**
 * The four fields each checkout reads, and they are not the same four.
 *
 * The two paths now live on two platforms (operator, 2026-09-09): cash on delivery runs
 * on the Logzz scheduling checkout, prepaid on Coinzz. Both fill name, e-mail and phone
 * from the query string and both skip straight past the first step — but Logzz names the
 * document field `cpf` and Coinzz names it `document`. Probed field by field against
 * both live pages; every other spelling, address and size included, is ignored by both.
 */
export const CHECKOUT_QUERY_FIELDS = {
  // Cash on delivery is back on Logzz (operator, 2026-09-25: the Coinzz delivery checkout
  // charged freight and could not be set not to). Logzz reads the CPF as `cpf`.
  cod: ["name", "email", "phone", "cpf"],
  prepay: ["name", "email", "phone", "document"],
} as const;

/**
 * The link with whatever is known, and nothing required but the checkout itself (R13.4,
 * operator 2026-09-24). The link that required all four fields (skipping the checkout's
 * first step) became the wall four personas hit — no e-mail, no link, no sale — and was
 * removed once nothing called it (code ladder, 2026-09-24). The checkout form asks for every field the query string did
 * not fill, so a partial link costs her some typing and a missing link costs the sale.
 * Only the base URL is required; each field goes in only when it is really there.
 */
export const buildPrefilledCheckoutLink = (
  customer: Partial<OrderIdentity> & { phone?: string },
  paymentMethod: "cod" | "prepay",
  config: Partial<CheckoutLinkConfig>,
): string => {
  const base = paymentMethod === "cod" ? config.codUrl : config.prepayUrl;
  if (!filled(base)) {
    throw new CoinzzIncompleteError([`checkout.${paymentMethod === "cod" ? "codUrl" : "prepayUrl"}`]);
  }
  const query = new URLSearchParams();
  if (filled(customer.name)) query.set("name", customer.name!.trim());
  if (filled(customer.email)) query.set("email", customer.email!.trim().toLowerCase());
  if (digitsOnly(customer.phone ?? "").length >= 10) query.set("phone", digitsOnly(customer.phone!));
  if (digitsOnly(customer.document ?? "").length >= 11) {
    // Logzz (cash on delivery) reads `cpf`; Coinzz (prepaid) reads `document`.
    query.set(paymentMethod === "cod" ? "cpf" : "document", digitsOnly(customer.document!));
  }
  const qs = query.toString();
  return qs === "" ? base! : `${base}${base!.includes("?") ? "&" : "?"}${qs}`;
};

/**
 * What their API answers with. n8n posts the body and writes this back to the webhook,
 * so the shape is declared here rather than in a workflow nobody can test.
 */
export interface CoinzzOrderResponse {
  success: boolean;
  message?: string;
  data?: Array<{
    order_hash: string;
    status: string;
    pix?: { code: string; qr_code: string };
    bank_slip?: { url: string; barcode: string; barcode_raw: string };
  }>;
}

export interface RecordedOrder {
  externalId: string;
  status: string;
  /** Where to send her to pay, when the method has one. Empty on cash on delivery. */
  url: string;
}

/** Reads their answer into the row `orders` stores, or says why it cannot. */
export const readCoinzzResponse = (response: CoinzzOrderResponse): RecordedOrder => {
  if (!response.success) throw new CoinzzIncompleteError([response.message ?? "resposta sem sucesso"]);
  const order = response.data?.[0];
  if (!order?.order_hash) throw new CoinzzIncompleteError(["resposta sem order_hash"]);
  return {
    externalId: order.order_hash,
    status: order.status,
    url: order.pix?.qr_code ?? order.bank_slip?.url ?? "",
  };
};
