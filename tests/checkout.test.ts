import { describe, expect, it } from "vitest";
import {
  amountFor,
  idempotencyKey,
  mockCheckoutProvider,
  prefillParams,
  type CheckoutRequest,
} from "@/order/checkout.js";
import type { Address } from "@/agent/address.js";

const endereco: Address = {
  cep: "01310-100",
  street: "Rua das Flores",
  number: "123",
  complement: "apto 42",
  neighborhood: "Jardim Paulista",
  city: "São Paulo",
  state: "SP",
};

const pedido: CheckoutRequest = {
  leadId: "lead-1",
  name: "Maria Silva",
  phone: "5511999990000",
  address: endereco,
  size: "M",
  paymentMethod: "cod",
};

const precos = { codBrl: 129.9, prepayBrl: 110.41 };
const provider = mockCheckoutProvider("https://checkout.exemplo.com", precos);

describe("contrato do checkout pré-preenchido (§E1)", () => {
  it("preenche tudo que a cliente não deveria ter que digitar", async () => {
    const params = prefillParams(pedido);
    expect(params).toMatchObject({
      nome: "Maria Silva",
      telefone: "5511999990000",
      cep: "01310-100",
      rua: "Rua das Flores",
      numero: "123",
      complemento: "apto 42",
      bairro: "Jardim Paulista",
      cidade: "São Paulo",
      uf: "SP",
      tamanho: "M",
      pagamento: "cod",
    });
  });

  it("omite o complemento quando não existe, em vez de mandar vazio", () => {
    const { complement: _complement, ...semComplemento } = endereco;
    expect(prefillParams({ ...pedido, address: semComplemento })).not.toHaveProperty(
      "complemento",
    );
  });

  it("devolve um link com os dados na query", async () => {
    const link = await provider.createPrefilledCheckout(pedido);
    const url = new URL(link.url);
    expect(url.origin + url.pathname).toBe("https://checkout.exemplo.com/checkout");
    expect(url.searchParams.get("tamanho")).toBe("M");
    expect(url.searchParams.get("cidade")).toBe("São Paulo");
  });

  it("no COD cobra o valor com frete embutido; no antecipado, só o produto", () => {
    expect(amountFor("cod", precos)).toBe(129.9);
    expect(amountFor("prepay", precos)).toBe(110.41);
  });

  it("carrega a forma de pagamento escolhida para o link", async () => {
    const antecipado = await provider.createPrefilledCheckout({
      ...pedido,
      paymentMethod: "prepay",
    });
    expect(antecipado.paymentMethod).toBe("prepay");
    expect(antecipado.amountBrl).toBe(110.41);
    expect(new URL(antecipado.url).searchParams.get("pagamento")).toBe("prepay");
  });
});

describe("idempotência do pedido (§E2)", () => {
  it("a mesma confirmação nunca vira dois checkouts", async () => {
    const primeiro = await provider.createPrefilledCheckout(pedido);
    const segundo = await provider.createPrefilledCheckout({ ...pedido });
    expect(primeiro.externalId).toBe(segundo.externalId);
  });

  it("mudar o tamanho é outro pedido", () => {
    expect(idempotencyKey(pedido)).not.toBe(idempotencyKey({ ...pedido, size: "G" }));
  });

  it("mudar o endereço é outro pedido", () => {
    const outro = { ...pedido, address: { ...endereco, number: "456" } };
    expect(idempotencyKey(pedido)).not.toBe(idempotencyKey(outro));
  });

  it("mudar a forma de pagamento é outro pedido", () => {
    expect(idempotencyKey(pedido)).not.toBe(
      idempotencyKey({ ...pedido, paymentMethod: "prepay" }),
    );
  });

  it("outra cliente com o mesmo endereço é outro pedido", () => {
    expect(idempotencyKey(pedido)).not.toBe(idempotencyKey({ ...pedido, leadId: "lead-2" }));
  });
});
