/**
 * The checkout contract (§E1), and the mock that stands in until the Coinzz
 * credential exists.
 *
 * The order is never created by API. The agent builds a **prefilled** checkout —
 * name, phone, address, size, payment method already filled — and sends the link;
 * the customer confirms there. That was a deliberate decision (round 3, kept in
 * round 4 even after the API turned out to be available): under cash on delivery she
 * sees the summary before confirming, which catches a wrong size or address while it
 * is still free to fix; under prepay, card data never travels through WhatsApp.
 *
 * The plan sanctions this shape being written and tested before the credential
 * arrives, so that swapping the mock for the real provider is configuration rather
 * than a rewrite — the same bet the channel contract makes about WAHA.
 */
import type { Address } from "../agent/address.js";

export type PaymentMethod = "cod" | "prepay";

export interface CheckoutRequest {
  leadId: string;
  name: string;
  phone: string;
  address: Address;
  size: string;
  paymentMethod: PaymentMethod;
}

export interface CheckoutLink {
  /**
   * The provider's id for this checkout. It is also our idempotency key: the same
   * confirmed order must never become two checkouts, because two checkouts is how a
   * customer receives two packages and refuses both.
   */
  externalId: string;
  url: string;
  amountBrl: number;
  paymentMethod: PaymentMethod;
}

export interface CheckoutProvider {
  createPrefilledCheckout: (request: CheckoutRequest) => Promise<CheckoutLink>;
}

export interface CheckoutPrices {
  /** Freight included — this is the whole amount collected at the door. */
  codBrl: number;
  /** Product only. Freight is calculated separately inside the checkout. */
  prepayBrl: number;
}

export const amountFor = (method: PaymentMethod, prices: CheckoutPrices): number =>
  method === "cod" ? prices.codBrl : prices.prepayBrl;

/**
 * Stable id for a checkout request. Same customer, same address, same size, same
 * payment method → same id, so a repeated confirmation resolves to the order that
 * already exists instead of a second one. Hand-rolled rather than imported so this
 * module keeps zero dependencies and behaves identically in Deno and in vitest,
 * the same rule the guardrail chain follows.
 */
export const idempotencyKey = (request: CheckoutRequest): string => {
  const { address: a } = request;
  const canonical = [
    request.leadId,
    request.size,
    request.paymentMethod,
    a.cep,
    a.street,
    a.number,
    a.complement ?? "",
    a.city,
    a.state,
  ]
    .join("|")
    .toLowerCase();

  let hash = 2166136261;
  for (const char of canonical) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** The fields the checkout page expects prefilled. Named as the query it becomes. */
export const prefillParams = (request: CheckoutRequest): Record<string, string> => {
  const { address: a } = request;
  return {
    nome: request.name,
    telefone: request.phone,
    cep: a.cep,
    rua: a.street,
    numero: a.number,
    ...(a.complement ? { complemento: a.complement } : {}),
    bairro: a.neighborhood,
    cidade: a.city,
    uf: a.state,
    tamanho: request.size,
    pagamento: request.paymentMethod,
  };
};

/**
 * The stand-in provider. It builds the real URL shape against the configured base,
 * so the link is inspectable and the contract test is meaningful — it just never
 * calls Coinzz. Swapping it out is one line at the call site.
 */
export const mockCheckoutProvider = (
  baseUrl: string,
  prices: CheckoutPrices,
): CheckoutProvider => ({
  createPrefilledCheckout: (request) => {
    const query = new URLSearchParams(prefillParams(request)).toString();
    return Promise.resolve({
      externalId: `mock-${idempotencyKey(request)}`,
      url: `${baseUrl.replace(/\/$/, "")}/checkout?${query}`,
      amountBrl: amountFor(request.paymentMethod, prices),
      paymentMethod: request.paymentMethod,
    });
  },
});
