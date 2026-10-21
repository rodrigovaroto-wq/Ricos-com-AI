/**
 * The operator's real test on v38 (2026-10-21, grafo §120): her street did not find her CEP, "não sei meu cep" let the sale go on
 * without the region, and a new CEP after the link got "usa lá no mesmo link".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { asksStreet, pickStreetCep, streetQueries, ufOfPhone } from "@/agent/address.js";
import { cepsByStreet } from "@/agent/availability.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("a rua dela acha o CEP", () => {
  it("o título abreviado vira a palavra que a busca dos Correios conhece", () => {
    expect(streetQueries("Rua dr jose aureo bustamante sao paulo").map((q) => q.street)).toContain("rua doutor jose aureo bustamante");
    expect(streetQueries("Av. Pres. Vargas, 100, Rio de Janeiro")[0]!.street).toBe("avenida presidente Vargas");
    // Negation: a word that only starts like a title stays as it is.
    expect(streetQueries("Rua Drummond, Contagem")[0]!.street).toBe("rua Drummond");
    expect(streetQueries("Rua Santa Cruz, Recife")[0]!.street).toBe("rua Santa Cruz");
  });
  it("sem estado nem CEP, o estado é o do DDD dela", () => {
    expect(ufOfPhone("5511994915983")).toBe("SP");
    expect(ufOfPhone("553171159446")).toBe("MG");
    expect(ufOfPhone("5592991234567")).toBe("AM");
    // Negation: a number that is no Brazilian phone gives no state.
    expect(ufOfPhone("12025550123")).toBe(null);
    expect(ufOfPhone("5520991234567")).toBe(null);
    expect(turn).toContain('ufOfPhone(lead.phone ?? "");');
  });
});

describe("o CEP de empresa não é casa", () => {
  it("a rua de um CEP só acha o CEP sem pedir o número da casa", async () => {
    const fetcher = async (url: string) => url.includes("/rua%20doutor%20jose%20aureo%20bustamante/")
      ? [
          { cep: "04710-090", complemento: "", unidade: "", logradouro: "Rua Doutor José Áureo Bustamante", localidade: "São Paulo" },
          { cep: "04710-902", complemento: "301", unidade: "Rheen Empreendimentos Indústria e Comércio Ltda", logradouro: "Rua Doutor José Áureo Bustamante", localidade: "São Paulo" },
        ]
      : [];
    const found = await cepsByStreet(fetcher, "SP", streetQueries("Rua dr jose aureo bustamante sao paulo"));
    expect(found.map((f) => f.cep)).toEqual(["04710-090"]);
    expect(pickStreetCep(found, null)).toBe("04710-090");
  });
  it("negação — a rua de vários CEPs sem empresa continua pedindo o número", async () => {
    const fetcher = async () => [
      { cep: "98005-060", complemento: "até 228", unidade: "", logradouro: "Rua X", localidade: "Cruz Alta" },
      { cep: "98005-070", complemento: "de 229 ao fim", unidade: "", logradouro: "Rua X", localidade: "Cruz Alta" },
    ];
    expect(pickStreetCep(await cepsByStreet(fetcher, "RS", streetQueries("rua x, cruz alta")), null)).toBeNull();
  });
});

describe("não sei meu CEP: a rua e a cidade, uma vez", () => {
  it.each(["Me manda sua rua e a cidade que eu vejo pra você?", "Me passa o nome da rua, o número da casa e a cidade?"])("pediu: %s", (m) => expect(asksStreet(m)).toBe(true));
  it.each(["Me passa seu CEP?", "Moro na rua de baixo, na mesma cidade.", "Qual a sua cidade?"])("negação: %s", (m) => expect(asksStreet(m)).toBe(false));
  it("a diretiva pede a rua e nunca deixa a venda seguir sem a região", () => {
    expect(turn).toContain("Ela não sabe o CEP: não peça o CEP. Peça o nome da rua, o número da casa e a cidade dela, que você encontra pra ela");
    expect(turn).toContain("sem escrever a palavra CEP nessa pergunta. Não fale do buscador dos Correios.");
    expect(turn).not.toContain("siga a conversa (tamanho, kit) e retome o CEP só");
    expect(turn).toContain("peça a rua, o número da` +\n          ` casa e a cidade, que você encontra pra ela, sem escrever a palavra CEP nessa pergunta. Não escreva link nenhum.`");
  });
});

describe("CEP novo depois do link", () => {
  it("o link vai de novo com o endereço novo, nunca 'usa lá no mesmo link'", () => {
    expect(turn).toContain("const linkJustSent = !cepMoved && linkHeldBack(linkHistory, CHECKOUT_BASES, pathBase, spoken(inbound.body ?? \"\"));");
    expect(turn).toContain('storedAddress.cep!.replace(/\\D/g, "") !== addressDraft.cep!.replace(/\\D/g, "")');
  });
});

describe("support_before_order: sem pedido, endereço novo nunca vai ao atendimento", async () => {
  const { runGates } = await import("@/agent/guardrails.js");
  const { ctx } = await import("./fixtures.js");
  const v = (text: string, addressBeforeOrder: boolean) =>
    runGates(text, ctx({ addressBeforeOrder })).traces.find((t) => t.gate === "support_before_order")?.verdict;
  it("veta a frase do replay", () => {
    expect(v("É só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261, que eles mudam o endereço pra você.", true)).toBe("block");
    expect(v("Fala com o suporte que eles trocam.", true)).toBe("block");
  });
  it("negação: com pedido criado, ou pedindo o CEP novo, passa", () => {
    expect(v("É só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261, que eles mudam o endereço pra você.", false)).toBe("pass");
    expect(v("Claro! Só preciso consultar de novo, porque o endereço novo pode estar fora da nossa rede de entrega.\n\nMe passa o CEP novo ou a rua e a cidade?", true)).toBe("pass");
  });
  it("a turn liga o gate e confirma o CEP novo antes do link", () => {
    expect(turn).toContain("      addressBeforeOrder: newAddressBeforeOrder,");
    expect(turn).toContain('const CEP_MOVED_COD = "Conferi o endereço novo: aí também chega com pagamento na entrega 😊');
    expect(turn).toContain('...(cepMoved && linkPath === "cod" ? [{ text: opening(CEP_MOVED_COD) }] : []),');
  });
});

describe("a linha do CEP novo passa a cadeia de gates", async () => {
  const { runGates } = await import("@/agent/guardrails.js");
  const { ctx } = await import("./fixtures.js");
  it("com a região consultada e a entrega no tamanho dela", () => {
    const text = "Conferi o endereço novo: aí também chega com pagamento na entrega 😊\n\nÉ só usar esse endereço no checkout.";
    const blocks = runGates(text, ctx({ regionKnown: true, codUnavailable: false, sizeChecked: "G", knownSize: "G" })).traces.filter((t) => t.verdict === "block");
    expect(blocks.map((b) => b.gate)).toEqual([]);
  });
});

describe("unavailable_offer: o buscador dos Correios não é retirada", async () => {
  const { runGates } = await import("@/agent/guardrails.js");
  const { ctx } = await import("./fixtures.js");
  const v = (text: string) => runGates(text, ctx()).traces.find((t) => t.gate === "unavailable_offer")?.verdict;
  it.each([
    "Você acha rapidinho pelo buscador dos Correios aqui: https://buscacepinter.correios.com.br",
    "Tranquilo, dá pra achar rapidinho no buscador dos Correios pelo endereço",
  ])("passa: %s", (t) => expect(v(t)).toBe("pass"));
  it.each(["Pode buscar aqui na loja", "Você pode vir buscar aqui", "Dá pra buscar no nosso escritório", "Você busca aqui com a gente"])("negação — retirada continua vetada: %s", (t) => expect(v(t)).toBe("block"));
});
