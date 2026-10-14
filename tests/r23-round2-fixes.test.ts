import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryFor, renderFollowup, type RenderContext } from "@/agent/followups.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { refusedDatum } from "@/agent/identity.js";
import { asksForLink } from "@/agent/interpret.js";
import { paidDeadlineLine, priceBeforeCepMessage, systemPrompt } from "@/agent/prompt.js";
import { noFitReply, saidNoFit } from "@/agent/retry.js";
import { extractDressSize, sizeBeyondTable, TABLE_TOP_DRESS, TABLE_TOP_WAIST } from "@/agent/sizing.js";
import { config, ctx } from "./fixtures.js";

/**
 * Real test round 2 (2026-10-14, …3720 and …1632) and the pre-round findings of …7967 (2026-10-13): the eight fixes the
 * operator approved. Every case is a sentence from those conversations, with its negation.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ layer: "auto", ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const render = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-abc", config, now: new Date("2026-09-10T10:00:00"), ...over });

describe("1. calça acima da tabela (…1632: \"Tamanho 65\")", () => {
  it("lê a calça fora da tabela com a deixa de tamanho", () => {
    expect(sizeBeyondTable("Tamanho 65")).toBe(65);
    expect(sizeBeyondTable("uso 60 de calça")).toBe(60);
    expect(sizeBeyondTable("65", true)).toBe(65);
  });
  it.each([
    "Estou pesando 200kg", "peso 70", "tenho 62 anos", "calço 60", "uso 52", "nao uso 60, uso 44", "65",
    // R23 review: the house number, the birth year, the "entre" inside "entrega", and a waist in cm are not pants.
    "Rua das Flores, número 65", "Av Brasil numero 72 apto 3", "sou de 62", "sou nascida em 59", "a entrega fica 65?", "uso 60 de cintura",
  ])("não lê: %s", (t) => {
    expect(sizeBeyondTable(t)).toBeNull();
  });
  it("a resposta é a verdade, gentil, com a porta aberta, e passa a cadeia", () => {
    const text = noFitReply(65, TABLE_TOP_DRESS, TABLE_TOP_WAIST);
    expect(text).toContain("até o 52");
    expect(text).toContain("até 100 cm");
    expect(text).not.toContain("?");
    expect(blocked(text)).toEqual([]);
  });
  it("para outra pessoa, a frase não diz \"te vestir\"", () => {
    const text = noFitReply(60, TABLE_TOP_DRESS, TABLE_TOP_WAIST, true);
    expect(text).not.toContain("te vestir");
    expect(blocked(text)).toEqual([]);
    expect(turn).toContain("interpretation.size?.for_other_person === true");
  });
  it("a régua não volta a perguntar o tamanho depois do \"não serve\" enquanto ela não tem tamanho da tabela", () => {
    expect(saidNoFit(noFitReply(65, TABLE_TOP_DRESS, TABLE_TOP_WAIST))).toBe(true);
    expect(saidNoFit(noFitReply(60, TABLE_TOP_DRESS, TABLE_TOP_WAIST, true))).toBe(true);
    expect(saidNoFit("Com 40 de calça o seu é o M")).toBe(false);
    expect(turn).toContain("if (at && !at.leads?.size && (at.messages ?? []).some((m: { direction: string; body: string | null }) => m.direction === \"outbound\" && saidNoFit(m.body ?? \"\"))) {");
    expect(turn).toContain("select=*,leads(size,orders(status))");
  });
  it("o turno manda a frase e cancela toda a régua", () => {
    const at = turn.indexOf("const beyond = ");
    const block = turn.slice(at, turn.indexOf("// She turns the sale down (grafo §69)", at));
    expect(block).toContain("noFitReply(beyond, TABLE_TOP_DRESS, TABLE_TOP_WAIST, ");
    expect(block).toContain('await cancelScheduled(conversation.id, "all");');
  });
});

describe("2. régua com a região desconhecida (…1632 nunca mandou CEP)", () => {
  it("o silence_2 não promete pagar ao entregador sem CEP; com a região conhecida, promete", () => {
    for (const id of ["a", "b", "c", "d"]) {
      const unknown = renderFollowup("silence_2", render({ leadId: id, regionKnown: false }))!;
      expect(unknown).not.toMatch(/entregador|na entrega|quando ele chegar na sua m/);
      expect(blocked(unknown, { layer: "agent" })).toEqual([]);
    }
    expect(renderFollowup("silence_2", render({ leadId: "a" }))).toMatch(/entregador|chegar na sua m/);
  });
  it("o silence_1 depois do preço pede o CEP em vez de prometer", () => {
    const text = renderFollowup("silence_1", render({ stopPoint: "after_price", regionKnown: false }))!;
    expect(text).toContain("CEP");
    expect(text).not.toMatch(/não paga nada agora|entregador/);
  });
  it("fora da janela, o template do silence_2 e do silence_3 não sai para região desconhecida", () => {
    const tpl = { ...config, channel: { templates: { silence_2: { name: "t", language: "pt_BR", variables: [] } } } } as never;
    const old = new Date("2026-09-01T10:00:00");
    expect(deliveryFor("silence_2", render({ config: tpl, marketingOptIn: true, regionKnown: false }), old)).toEqual({ via: "blocked", reason: "no_template" });
  });
  it("a varredura diz se a região é conhecida — a escolha sozinha não é região", () => {
    expect(turn).toContain("regionKnown: Boolean(order) || typeof lead.address?.codAvailable === \"boolean\",");
    expect(turn).not.toContain("regionKnown: Boolean(order) || typeof lead.address?.codAvailable === \"boolean\" ||");
  });
  it("o cupom do silence_3 não promete \"pagando na entrega\" a quem tem região desconhecida", () => {
    const c = { ...config, coupon: { ...config.coupon, active: true, code: "SUPER10", percent: 10 } } as never;
    expect(renderFollowup("silence_3", render({ config: c, regionKnown: false }))).not.toContain("na entrega");
    expect(renderFollowup("silence_3", render({ config: c }))).toContain("pagando na entrega");
  });
});

describe("3. prompt: dor contada vira tamanho, IA confirmada direto, tabela até o XGG, \"tudo bem?\" respondido", () => {
  const prompt = systemPrompt(config, gateBriefing(config), null);
  it("as quatro instruções estão no prompt", () => {
    expect(prompt).toContain("a pergunta dessa mensagem já é a do tamanho");
    expect(prompt).toContain('confirme direto ("Sou, sim")');
    expect(prompt).toContain("A tabela vai até o");
    expect(prompt).not.toContain("QUEM CHAMA UMA PESSOA DO TIME É O SISTEMA");
  });
  it("a abertura responde o \"tudo bem?\" dela", () => {
    expect(turn).toBeDefined();
    expect(readFileSync("src/agent/prompt.ts", "utf8")).toContain('responda em duas palavras ("Tudo ótimo!") antes');
  });
});

describe("4. kit oferecido não volta (…3720: quatro vezes \"1 ou 2 peças?\")", () => {
  it("depois da oferta sem resposta, a instrução manda seguir com uma peça e não perguntar de novo", () => {
    expect(turn).toContain("kitOffered && units === 1 && quantity === null && !linkNow && !parts.some((p: string) => /\\b(?:pe[cç]as?|kit)\\b/i.test(p))");
    expect(turn).toContain("Não pergunte de novo sobre o kit nem sobre quantas peças.");
  });
  it("a oferta pergunta por todas as quantidades oferecidas", () => {
    expect(turn).toContain('A pergunta cita todas as quantidades que você ofereceu ("1, 2 ou 3 peças?").');
  });
});

describe("5. frases fixas: \"O colete sai de\", CEP que \"parece\" não existir", () => {
  it("o preço antes do CEP nomeia o colete e passa a cadeia", () => {
    const text = priceBeforeCepMessage({ ...config, prices: { ...config.prices, prepayDiscountPercent: 10 } } as never);
    expect(text.startsWith("O colete sai de")).toBe(true);
    expect(text).not.toMatch(/^Ele /);
  });
  it("a instrução do CEP inexistente é de dúvida, não de certeza", () => {
    expect(turn).toContain("porque parece que esse CEP não existe (pode ter sido um número trocado)");
  });
});

describe("6. peso não é tamanho (…7967: \"tamanho, peso 52 e uso 36 de calca\" virou XGG)", () => {
  it("o peso perto de \"tamanho\" não é a calça; a calça dita depois é", () => {
    expect(extractDressSize("Queria saber sobre o produto e tamanho, peso 52 e uso 36 de calca")).toBe(36);
    expect(extractDressSize("peso 52")).toBeNull();
    // Negação: sem o peso, o tamanho continua lido.
    expect(extractDressSize("tamanho 52")).toBe(52);
    expect(extractDressSize("uso 44, peso 80kg")).toBe(44);
  });
});

describe("7. pedir o link de novo (…7967: \"N recebi link\", \"Nao tem LINK\", \"Consegue gerar um novo link?\")", () => {
  it.each(["N recebi link", "Nao tem LINK", "Nao tem link moça", "Consegue gerar um novo link?", "Por favor consegue me gerar o pagamento? Vou levar so 1"])("pede: %s", (t) => {
    expect(asksForLink(t)).toBe(true);
  });
  it.each(["não precisa gerar outro link", "já recebi o link, obrigada", "gera o link amanhã", "Qual?", "nao tem link de pix?"])("não pede: %s", (t) => {
    expect(asksForLink(t)).toBe(false);
  });
});

describe("8. \"paguei\" com \"chega quando?\" (…7967)", () => {
  it("a linha de prazo é a do antecipado e passa a cadeia no caminho antecipado", () => {
    const c = { ...config, delivery: { ...config.delivery, prepayAvgDays: 5, prepayVariesByRegion: true } } as never;
    const line = paidDeadlineLine(c);
    expect(line).toBe("Depois que o pagamento confirma, o prazo varia por região, em média 5 dias úteis.");
    expect(runGates(line, ctx({ layer: "auto", paymentPath: "prepay", config: c })).traces.filter((t) => t.verdict === "block")).toEqual([]);
    // Negação: sem a média no config, nada é dito.
    expect(paidDeadlineLine({ ...config, delivery: { ...config.delivery, prepayAvgDays: undefined } } as never)).toBe("");
  });
  it("o turno junta o prazo à linha do pagamento, também ao pagamento já confirmado", () => {
    expect(turn).toContain('const deadline = parts.some(asksDeadline) ? paidDeadlineLine(CONFIG) : "";');
  });
});

describe("personas 2026-10-14 (Beatriz, Tati): o \"vou pensar\" antes do CEP não promete o entregador", () => {
  const think = { prices: { prepayBrl: 116.91, prepayDiscountPercent: 10 }, delivery: { warrantyDays: 7 } };
  it("com a região desconhecida diz \"dependendo da sua região\"; conhecida, como antes", async () => {
    const { thinkReply } = await import("@/agent/retry.js");
    const unknown = thinkReply(think, "cod", false, 1, false);
    expect(unknown).toContain("Dependendo da sua região");
    expect(unknown).not.toContain("Pagando na entrega você não paga nada agora");
    expect(thinkReply(think, "cod", false, 1, true)).toContain("Pagando na entrega você não paga nada agora");
    expect(blocked(unknown, { layer: "agent", postponing: true })).toEqual([]);
  });
  it("o turno passa a região conhecida", () => {
    expect(turn).toContain("thinkReply(CONFIG, linkPath, thinkLink !== null, units, knownRegion !== null)");
  });
});

describe("persona venda-decidida (14/10): pediu o link nove vezes, nunca recebeu", () => {
  const ask = { direction: "outbound", body: "Para a emissão da nota fiscal, me passa seu CPF por favor?" };
  const refuses = (t: string) => refusedDatum([ask, { direction: "inbound", body: t }], "document");
  it.each(["te passo lá no link, só me manda o link", "Silva. Manda o link que eu completo lá", "eu preencho o resto lá"])("passar lá no checkout é a recusa do CPF: %s", (t) => {
    expect(refuses(t)).toBeGreaterThanOrEqual(1);
  });
  it.each(["vou passar o cpf depois lá no link", "e se eu passar o cpf lá?", "529.982.247-25", "meu cpf é 529.982.247-25, completo o endereço lá", "não sei o cpf"])("não é recusa: %s", (t) => {
    expect(refuses(t)).toBe(0);
  });
  it("pedir o link duas vezes nas últimas cinco mensagens, sem link no chat, solta o que falta de nome, CPF e e-mail", () => {
    expect(turn).toContain(".slice(-5).filter((m: { body: string }) => asksForLink(spoken(m.body ?? \"\"))).length >= 2");
    expect(turn).toContain("nameKnown: Boolean(identityDraft.name) || nameRefused || pressed,");
    expect(turn).toContain("cpfDone: Boolean(identityDraft.document) || cpfRefused || cpfRefusals >= 2 || pressed,");
    expect(turn).toContain("refusedDatum(recent, \"email\") >= 1 || linkBefore || pressed,");
  });
});
