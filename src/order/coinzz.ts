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
import type { Address } from "../agent/address.js";
import type { CheckoutRequest } from "./checkout.js";

/** The four values their `payment_method` accepts. */
export const COINZZ_PAYMENT_METHODS = ["afterpay", "bank_slip", "credit_card", "pix"] as const;
export type CoinzzPaymentMethod = (typeof COINZZ_PAYMENT_METHODS)[number];

export interface CoinzzConfig {
  /** Hash of the main offer, from their dashboard. */
  offerHash: string;
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

  return {
    idempotencyKey,
    body: {
      offer_hash: config.offerHash,
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
