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
    expect(turn).toContain('?? ufOfPhone(lead.phone ?? "");');
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
    expect(turn).toContain("` casa e a cidade, que você encontra pra ela, sem escrever a palavra CEP nessa pergunta. Não escreva link nenhum.`");
  });
});

describe("CEP novo depois do link", () => {
  it("o link vai de novo com o endereço novo, nunca 'usa lá no mesmo link'", () => {
    expect(turn).toContain("const linkJustSent = !cepMoved && foreignUrl === null && linkHeldBack(linkHistory, CHECKOUT_BASES, pathBase, spoken(inbound.body ?? \"\"));");
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
    expect(v("Fala com o suporte que eles trocam o endereço.", true)).toBe("block");
  });
  it("negação (revisão do §120): a linha da troca que o prompt ensina passa", () => {
    expect(v("Se não servir, é só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261 e pedir a troca.", true)).toBe("pass");
  });
  it("code review do §121: a frase do endereço quebrada no ponto continua vetada", () => {
    expect(v("É só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261. Eles mudam o endereço pra você.", true)).toBe("block");
    expect(v("Eu não consigo alterar, mas o suporte muda o endereço pra você.", true)).toBe("block");
  });
  it("negação: com pedido criado, ou pedindo o CEP novo, passa", () => {
    expect(v("É só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261, que eles mudam o endereço pra você.", false)).toBe("pass");
    expect(v("Claro! Só preciso consultar de novo, porque o endereço novo pode estar fora da nossa rede de entrega.\n\nMe passa o CEP novo ou a rua e a cidade?", true)).toBe("pass");
  });
  it("a turn liga o gate e confirma o CEP novo antes do link", () => {
    expect(turn).toContain("      addressBeforeOrder: newAddressBeforeOrder,");
    expect(turn).toContain('const CEP_MOVED_COD = "Conferi o endereço novo: aí também chega com pagamento na entrega 😊');
    expect(turn).toContain('...(cepMoved && linkPath === "cod" && region?.cod === true ? [{ text: opening(CEP_MOVED_COD) }] : []),');
  });
  it("revisão do §120: o CEP novo só solta o link depois de um link, antes de qualquer pedido", () => {
    expect(turn).toContain('!["pedido_criado", "em_rota", "entregue_pago", "recusado"].includes(storedStage) && lastLinkBase(linkHistory, CHECKOUT_BASES) !== null &&');
    expect(turn).toContain("const newAddressBeforeOrder = handoffKind !== \"post_sale\" && ");
  });
  it("revisão do §120: a rua pedida uma vez não é pedida de novo, e a recusa não vira 'não lembra'", () => {
    expect(turn).toContain("? cepRefused || recentOutbound.some(asksStreet)");
  });
  it("revisão do §120: o estado do DDD é dito com o CEP achado, e a rua não achada pede o estado", () => {
    expect(turn).toContain("const streetState = typedState ?? ufOfPhone(lead.phone ?? \"\");");
    expect(turn).toContain("no estado do DDD dela (${streetState}): peça a rua, a");
    expect(turn).toContain("${streetFound.find((f) => f.cep === streetCep)?.city ?? \"\"} - ${streetState})");
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

describe("copy de 21/10 (grafo §121)", async () => {
  const { offerKindOf, V4_OFFER_HEADLINE, codOfferText, prepayOfferText } = await import("@/agent/funnel.js");
  const { config } = await import("./fixtures.js");
  it("a oferta mandada com a manchete da copy v4 continua reconhecida (conversa aberta não recebe oferta de novo)", () => {
    expect(offerKindOf(`${V4_OFFER_HEADLINE(config)}\n\n*FRETE GRÁTIS* e Seu Pedido…`, config)).toBe("cod");
    expect(offerKindOf(codOfferText(config, undefined, new Date()), config)).toBe("cod");
    expect(offerKindOf(prepayOfferText(config), config)).toBe("prepay");
    // Negation: a reply of the model that only quotes the price is no offer.
    expect(offerKindOf("O colete sai de R$ 216,50 por R$ 129,90 pagando na entrega.", config)).toBe(null);
  });
  it("o antecipado no formato novo: âncora sem 'DE', Correios, Pix ou 12x", () => {
    const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-20.min.json", "utf8"));
    const t = prepayOfferText(prod);
    expect(t).toContain("Você Ganhou um Desconto Adicional de *10%!!!*");
    expect(t).toContain("⭐*~R$ 216,50~ POR R$ 116,91*⭐");
    expect(t).toContain("ou em até *12x no cartão!*");
    expect(t).toContain("✅ Você pode pagar agora no Pix");
    expect(t).not.toMatch(/gr[aá]tis|juros/i);
  });
  it("a turn lê as três manchetes no histórico inteiro", () => {
    expect(turn).toContain('["⭐ DE R$ ", "⭐*DE ", "⭐*~R$ ", PREPAY_HEADLINE');
  });
});

describe("a rua que ela manda depois de outra pergunta, e o número no fim da faixa", () => {
  it("'até 99/100' cobre o 100", () => {
    expect(pickStreetCep([{ cep: "36070-010", complement: "até 99/100" }, { cep: "36010-000", complement: "de 101/102 a 449/450" }], "100")).toBe("36070-010");
    // Negation: past the range it is the next one, and "até 228" alone still ends at 228.
    expect(pickStreetCep([{ cep: "36070-010", complement: "até 99/100" }, { cep: "36010-000", complement: "de 101/102 a 449/450" }], "101")).toBe("36010-000");
    expect(pickStreetCep([{ cep: "1", complement: "até 228" }, { cep: "2", complement: "de 229 ao fim" }], "229")).toBe("2");
  });
  it("a rua pedida dois turnos atrás ainda é lida", () => {
    expect(turn).toContain("const streetAsked = herEarlier.some(forgetsCep) &&");
    expect(turn).toContain("askedHouse || streetAsked)");
    // Newest first (replay of 21/10: slice(-3) read the oldest replies and the street was never looked up).
    expect(turn).toContain('.filter((m: { direction: string }) => m.direction === "outbound").slice(0, 3).some(');
  });
});

describe("code review do §121", async () => {
  const { runGates } = await import("@/agent/guardrails.js");
  const { ctx } = await import("./fixtures.js");
  const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-20.min.json", "utf8"));
  it("o preço de cada peça do kit, que o link diz, passa o gate de preço", () => {
    const price = (text: string) => runGates(text, ctx({ config: prod })).traces.find((t) => t.gate === "price_promise")?.verdict;
    expect(price("Isso, 3 peças saem por R$ 103,92 cada.")).toBe("pass");
    // With the coupon held, as the conversation has it before the touch (grafo §137): 103,92 is also 129,90 − 20%, and only the kit's
    // own per-piece price lets it through then.
    const held = (text: string) =>
      runGates(text, ctx({ config: { ...prod, coupon: { ...prod.coupon, active: false } } })).traces.find((t) => t.gate === "price_promise")?.verdict;
    expect(held("Isso, 3 peças saem por R$ 103,92 cada.")).toBe("pass");
    // Negation: a per-piece price nobody configured is still a promise.
    expect(price("Isso, 3 peças saem por R$ 99,90 cada.")).toBe("block");
  });
  it("o preço de cada peça vezes as peças é o preço do kit no checkout (sem centavo de diferença)", () => {
    for (const k of prod.kits as Array<{ units: number; priceBrl: number }>) {
      expect(Math.round(Math.round((k.priceBrl / k.units) * 100) * k.units)).toBe(Math.round(k.priceBrl * 100));
    }
  });
  it("o CEP novo só solta o link com a região consultada; o pedido de pessoa mantém o gate", () => {
    expect(turn).toContain("const cepMoved = region !== null && Boolean(storedAddress.cep && addressDraft.cep)");
    expect(turn).toContain('const newAddressBeforeOrder = handoffKind !== "post_sale" && ');
    expect(turn).toContain("const herOrderRows = (): Promise<unknown[] | null> =>");
    expect(turn).toContain(": (/\\brua\\b/i.test(lastOutbound) || streetAsked) && typedState === null");
  });
});
