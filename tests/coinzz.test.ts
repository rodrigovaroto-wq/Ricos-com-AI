import { describe, expect, it } from "vitest";
import {
  buildCoinzzRequest,
  CoinzzIncompleteError,
  missingCoinzzConfig,
  readCoinzzResponse,
  toCents,
  toCoinzzAddress,
  type CoinzzConfig,
} from "@/order/coinzz.js";
import type { Address } from "@/agent/address.js";

const address: Address = {
  cep: "13010-100",
  street: "Rua das Flores",
  number: "123",
  neighborhood: "Centro",
  city: "Campinas",
  state: "SP",
};

const config: CoinzzConfig = {
  offerHash: "off123abc",
  codPaymentMethod: "afterpay",
  shippingValueCents: 1000,
};

const request = {
  leadId: "lead-1",
  name: "  Ana Paula Souza ",
  email: "Ana.Souza@GMAIL.com",
  document: "529.982.247-25",
  phone: "(19) 99999-8888",
  address,
  size: "G",
  paymentMethod: "cod" as const,
};

describe("corpo do pedido da Coinzz", () => {
  it("monta o corpo no formato que a API espera", () => {
    const { body } = buildCoinzzRequest(request, config, "abc123");
    expect(body).toEqual({
      offer_hash: "off123abc",
      payment_method: "afterpay",
      customer: {
        name: "Ana Paula Souza",
        email: "ana.souza@gmail.com",
        document: "52998224725",
        phone: "(19) 99999-8888",
        address: {
          zip_code: "13010100",
          street: "Rua das Flores",
          number: "123",
          neighborhood: "Centro",
          city: "Campinas",
          state: "SP",
        },
      },
    });
  });

  /**
   * No pagamento na entrega o frete já está dentro do preço. Mandar `shipping_value`
   * ali cobra a mesma coisa duas vezes, e quem descobre é a cliente na porta.
   */
  it("só manda frete no antecipado, onde ele é cobrado à parte", () => {
    expect(buildCoinzzRequest(request, config, "k").body.shipping_value).toBeUndefined();
    const prepaid = { ...request, paymentMethod: "prepay" as const };
    expect(buildCoinzzRequest(prepaid, config, "k").body.shipping_value).toBe(1000);
    expect(buildCoinzzRequest(prepaid, config, "k").body.payment_method).toBe("pix");
  });

  it("leva a chave de idempotência, porque um pedido confirmado nunca vira dois", () => {
    expect(buildCoinzzRequest(request, config, "abc123").idempotencyKey).toBe("abc123");
  });

  it("mantém o complemento só quando ele existe", () => {
    expect(toCoinzzAddress(address).complement).toBeUndefined();
    expect(toCoinzzAddress({ ...address, complement: "apto 3" }).complement).toBe("apto 3");
  });

  it("converte reais em centavos arredondando", () => {
    expect(toCents(129.9)).toBe(12990);
    expect(toCents(110.42)).toBe(11042);
  });
});

/**
 * O que falta é listado antes de qualquer coisa sair. Pedido montado pela metade vira
 * pacote na porta errada, ou recusa do lado do pagamento depois do sim da cliente.
 */
describe("o que impede o pedido de ser montado", () => {
  it("recusa configuração que ainda é placeholder", () => {
    expect(missingCoinzzConfig({ offerHash: "{{OFFER_HASH}}", codPaymentMethod: "afterpay" })).toEqual([
      "coinzz.offerHash",
    ]);
  });

  it("recusa um método de pagamento que a Coinzz não tem", () => {
    const bad = missingCoinzzConfig({
      offerHash: "off1",
      codPaymentMethod: "cod" as never,
    });
    expect(bad[0]).toMatch(/codPaymentMethod inválido/);
  });

  it("lista o dado da cliente que falta, em vez de mandar em branco", () => {
    const semCpf = { ...request, document: "" };
    expect(() => buildCoinzzRequest(semCpf, config, "k")).toThrow(CoinzzIncompleteError);
    try {
      buildCoinzzRequest({ ...semCpf, email: "" }, config, "k");
    } catch (e) {
      expect((e as CoinzzIncompleteError).missing).toEqual(["customer.email", "customer.document"]);
    }
  });

  it("recusa um CPF que não é CPF, mesmo com onze dígitos", () => {
    expect(() => buildCoinzzRequest({ ...request, document: "1234567890" }, config, "k")).toThrow(
      CoinzzIncompleteError,
    );
  });
});

describe("resposta da Coinzz", () => {
  it("lê o pedido criado", () => {
    expect(
      readCoinzzResponse({
        success: true,
        data: [{ order_hash: "ven3570lpx", status: "PENDING" }],
      }),
    ).toEqual({ externalId: "ven3570lpx", status: "PENDING", url: "" });
  });

  it("leva o link do pix quando ele vem", () => {
    const r = readCoinzzResponse({
      success: true,
      data: [
        {
          order_hash: "ven1",
          status: "PENDING",
          pix: { code: "link_para_pix", qr_code: "https://quickchart.io/qr?text=x" },
        },
      ],
    });
    expect(r.url).toBe("https://quickchart.io/qr?text=x");
  });

  it("não inventa pedido quando a resposta não trouxe um", () => {
    expect(() => readCoinzzResponse({ success: false, message: "oferta inválida" })).toThrow(
      /oferta inválida/,
    );
    expect(() => readCoinzzResponse({ success: true, data: [] })).toThrow(/sem order_hash/);
  });
});
