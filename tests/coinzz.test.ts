import { describe, expect, it } from "vitest";
import {
  buildPrefilledCheckoutLink,
  buildCoinzzRequest,
  CHECKOUT_QUERY_FIELDS,
  COINZZ_PAYMENT_METHODS,
  CoinzzIncompleteError,
  missingCoinzzConfig,
  readCoinzzResponse,
  toCents,
  toCoinzzAddress,
  type CoinzzConfig,
} from "@/agent/coinzz.js";
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
    const comAntecipado = { ...config, prepayOfferHash: "offPREPAY1" };
    expect(buildCoinzzRequest(prepaid, comAntecipado, "k").body.shipping_value).toBe(1000);
    expect(buildCoinzzRequest(prepaid, comAntecipado, "k").body.payment_method).toBe("pix");
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
    expect(toCents(110.41)).toBe(11041);
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

/**
 * `afterpay` foi a escolha do operador em 2026-09-08: dos quatro métodos que a Coinzz
 * aceita, é o único que significa pagar depois, e pagar depois é o funil inteiro. Fica
 * travado em teste porque trocar isso sem querer cria um pedido que a cliente não
 * combinou pagar daquele jeito — e ela descobre na porta, que é a recusa mais cara
 * que esta operação tem.
 */
describe("o método de pagamento do COD", () => {
  it("é afterpay, e o corpo sai com ele", () => {
    const { body } = buildCoinzzRequest(request, { ...config, codPaymentMethod: "afterpay" }, "k");
    expect(body.payment_method).toBe("afterpay");
  });

  it("e a Coinzz não tem nenhum método chamado 'cod'", () => {
    expect(COINZZ_PAYMENT_METHODS).toEqual(["afterpay", "bank_slip", "credit_card", "pix"]);
    expect(COINZZ_PAYMENT_METHODS).not.toContain("cod");
  });
});

/**
 * A loja vende duas ofertas — pagamento na entrega e antecipado com 15% —, com preços
 * diferentes e, portanto, hashes diferentes. Cair no hash do COD no caminho antecipado
 * cobra R$ 129,90 por uma oferta de R$ 110,41.
 */
describe("as duas ofertas", () => {
  const comAntecipado = { ...config, prepayOfferHash: "offPREPAY1" };

  it("usa o hash do COD no pagamento na entrega", () => {
    expect(buildCoinzzRequest(request, comAntecipado, "k").body.offer_hash).toBe("off123abc");
  });

  it("e o hash do antecipado no antecipado", () => {
    const prepaid = { ...request, paymentMethod: "prepay" as const };
    expect(buildCoinzzRequest(prepaid, comAntecipado, "k").body.offer_hash).toBe("offPREPAY1");
  });

  it("recusa o pedido antecipado enquanto o hash dele não existir", () => {
    const prepaid = { ...request, paymentMethod: "prepay" as const };
    expect(() => buildCoinzzRequest(prepaid, config, "k")).toThrow(/prepayOfferHash/);
  });
});

/**
 * O link do checkout, conferido contra a página real e não contra a suposição.
 *
 * O bundle `/assets/js/checkout/new-checkout-two.js` lê exatamente quatro valores da
 * query string em `getQueryParams` — name, email, phone, document — e só avança a
 * cliente para a etapa de endereço quando os **quatro** chegam válidos. Endereço e
 * tamanho não têm parâmetro nenhum: ela digita o endereço e escolhe o tamanho lá.
 */
describe("link de checkout pré-preenchido", () => {
  const cliente = {
    name: "Maria Aparecida Souza",
    email: "Maria.Souza@Gmail.com",
    document: "731.166.873-58",
    phone: "5511988887777",
  };
  const config = {
    // Duas plataformas desde 2026-09-09: a entrega agendada é da Logzz, o antecipado
    // continua na Coinzz.
    codUrl: "https://entrega.logzz.com.br/pay/encorpa-pa",
    prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0",
  };

  it.each(["cod", "prepay"] as const)(
    "leva os quatro campos que o checkout %s lê, e nenhum a mais",
    (path) => {
      const url = new URL(buildPrefilledCheckoutLink(cliente, path, config));
      expect([...url.searchParams.keys()].sort()).toEqual(
        [...CHECKOUT_QUERY_FIELDS[path]].sort(),
      );
      expect(url.origin + url.pathname).toBe(path === "cod" ? config.codUrl : config.prepayUrl);
    },
  );

  it("o CPF vai em `document`, o nome que a Coinzz lê — nos dois caminhos desde 25/09", () => {
    // Mandar o nome errado é silencioso: a página abre, três campos vêm preenchidos, e
    // ela redigita o CPF sem entender por quê. Até 25/09 a entrega era Logzz (`cpf`).
    const cod = new URL(buildPrefilledCheckoutLink(cliente, "cod", config));
    expect(cod.searchParams.get("document")).toBe("73116687358");
    expect(cod.searchParams.get("cpf")).toBeNull();

    const prepay = new URL(buildPrefilledCheckoutLink(cliente, "prepay", config));
    expect(prepay.searchParams.get("document")).toBe("73116687358");
    expect(prepay.searchParams.get("cpf")).toBeNull();
  });

  it("normaliza como o checkout espera: e-mail minúsculo, telefone só dígitos", () => {
    const url = new URL(buildPrefilledCheckoutLink(cliente, "cod", config));
    expect(url.searchParams.get("email")).toBe("maria.souza@gmail.com");
    expect(url.searchParams.get("phone")).toBe("5511988887777");
    expect(url.searchParams.get("name")).toBe("Maria Aparecida Souza");
  });

  it("cada oferta tem o seu link, e o antecipado não cai no da entrega", () => {
    expect(buildPrefilledCheckoutLink(cliente, "prepay", config)).toContain("pagamento-antecipado-0");
    expect(buildPrefilledCheckoutLink(cliente, "cod", config)).toContain("entrega.logzz.com.br");
  });

  it("sem URL configurada, diz qual falta em vez de montar um link quebrado", () => {
    expect(() => buildPrefilledCheckoutLink(cliente, "prepay", { codUrl: config.codUrl })).toThrow(
      /checkout\.prepayUrl/,
    );
  });
});

/**
 * O link sai com o que se sabe (R13.4, 2026-09-24): sem e-mail não havia link, e sem link
 * não havia venda — quatro das doze personas pararam aí. O checkout pede o resto.
 */
describe("o link preenchido com o que se sabe", () => {
  const checkout = {
    codUrl: "https://entrega.logzz.com.br/pay/encorpa-pa",
    prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0",
  };

  it("sai só com o telefone, sem e-mail nem CPF", () => {
    const url = new URL(buildPrefilledCheckoutLink({ phone: "+55 (11) 99999-8888" }, "cod", checkout));
    expect(url.origin + url.pathname).toBe(checkout.codUrl);
    expect(url.searchParams.get("phone")).toBe("5511999998888");
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("cpf")).toBe(false);
  });

  it("leva o que existe, com o nome do campo de cada checkout", () => {
    const cliente = { name: "Maria José", email: "Maria@Gmail.com", document: "529.982.247-25", phone: "11999998888" };
    const cod = new URL(buildPrefilledCheckoutLink(cliente, "cod", checkout));
    expect(cod.searchParams.get("document")).toBe("52998224725");
    expect(cod.searchParams.get("email")).toBe("maria@gmail.com");
    const prepay = new URL(buildPrefilledCheckoutLink(cliente, "prepay", checkout));
    expect(prepay.origin + prepay.pathname).toBe(checkout.prepayUrl);
    expect(prepay.searchParams.get("document")).toBe("52998224725");
    expect(prepay.searchParams.has("cpf")).toBe(false);
  });

  it("sem nada conhecido, é o link cru; sem o checkout configurado, diz o que falta", () => {
    expect(buildPrefilledCheckoutLink({}, "cod", checkout)).toBe(checkout.codUrl);
    expect(() => buildPrefilledCheckoutLink({ phone: "11999998888" }, "prepay", { codUrl: checkout.codUrl })).toThrow(
      CoinzzIncompleteError,
    );
  });

  it("campo pela metade não entra: telefone curto e CPF curto ficam de fora", () => {
    const url = new URL(buildPrefilledCheckoutLink({ phone: "9999", document: "123" }, "cod", checkout));
    expect(url.searchParams.has("phone")).toBe(false);
    expect(url.searchParams.has("cpf")).toBe(false);
  });
});
