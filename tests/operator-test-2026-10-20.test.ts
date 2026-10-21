/**
 * The operator's real test of 2026-10-20 (grafo §118): the size table only on request, the kits one line each with price and
 * discount, and a new address before the order is a new CEP — never the customer service.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { asksSizeTable, funnelLinkMessage, openingBubbles, sizeTableBubbles, type FunnelConfig } from "@/agent/funnel.js";
import { changesAddress } from "@/agent/interpret.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { systemPrompt, type PromptConfig } from "@/agent/prompt.js";
import { config } from "./fixtures.js";

const prod = JSON.parse(readFileSync("docs/operacao/business-config-2026-10-20.min.json", "utf8"));
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("tabela de tamanhos só a pedido", () => {
  it("a abertura não manda a tabela; ela existe para quando ela pedir", () => {
    expect(openingBubbles(prod as FunnelConfig).some((b) => /tabela de tamanhos/.test(b.text))).toBe(false);
    expect(sizeTableBubbles(prod as FunnelConfig)[0]?.media?.kind).toBe("image");
  });
  it.each(["me manda a tabela de tamanhos", "quais as medidas?", "quais são os tamanhos?", "tem tabela?"])("pede: %s", (m) => expect(asksSizeTable(m)).toBe(true));
  it.each(["não precisa da tabela", "sem tabela, visto 42", "visto 42", "qual o tamanho certo pra mim?"])("negação — não pede: %s", (m) => expect(asksSizeTable(m)).toBe(false));
  it("a turn manda a tabela pelo roteiro e deixa o modelo responder depois", () => {
    expect(turn).toContain('const sent = await sendFunnelTurn(tableBubbles, "tabela de tamanhos, a pedido dela", {}, true);');
  });
});

describe("kits: uma linha por opção, com preço e desconto", () => {
  it.each(["cod", "prepay"] as const)("no link do caminho %s", (path) => {
    const msg = funnelLinkMessage(prod as FunnelConfig, "https://x/y", path, "Ana", "G", 1);
    const kits = (prod.kits as Array<{ path: string; units: number; priceBrl: number; discountPercent: number }>).filter((k) => k.path === path);
    // Operator, 2026-10-21 (grafo §121): the same line on both paths, the price of each piece in the kit.
    for (const k of kits) {
      const each = `R$ ${(Math.round((k.priceBrl / k.units) * 100) / 100).toFixed(2).replace(".", ",")}`;
      expect(msg).toContain(`• ${k.units} peças saem por apenas *${each}* cada!`);
    }
    expect(msg).toContain("Valores dos Kits\n");
  });
});

describe("endereço novo antes do pedido", () => {
  it.each(["Quero mudar meu endereço", "La no checkout eu tentei mudar e ta falando que não tem entrega pro meu endereço", "posso receber em outro endereço?", "o endereço tá errado"])(
    "lê: %s", (m) => expect(changesAddress(m)).toBe(true));
  it.each(["não quero mudar o endereço", "o endereço tá certo", "meu endereço é rua x 10", "qual o endereço da loja?"])("negação: %s", (m) => expect(changesAddress(m)).toBe(false));
  it("a turn, sem pedido por nenhum caminho, manda consultar o CEP novo e nunca o atendimento ao cliente", () => {
    expect(turn).toContain("const newAddressBeforeOrder = handoffKind === null && !parts.some((p: string) => parseCep(p) !== null) && parts.some((p: string) => changesAddress(spoken(p))) &&");
    // Copy v4, 5.1 (operator, 2026-10-20): the model answers on the example, not a fixed line.
    expect(turn).toContain("o atendimento e peça o CEP novo, no seu jeito, com este modelo: \"${NEW_ADDRESS_ASK}\" Não mande ela ao atendimento ao cliente");
    expect(turn).toContain("porque o endereço novo pode estar fora da nossa rede de entrega.\\n\\nMe passa o CEP novo ou a rua e a cidade?");
  });
  it("depois de um link da entrega, o endereço novo sem entrega pergunta antes de mandar o antecipado (copy v4, 3.3)", () => {
    expect(turn).toContain("const sent = refusedCorreios ? null : codBefore && lastOutbound !== ADDRESS_NO_COD_ASK");
  });
  it("o prompt manda ao atendimento ao cliente só com o pedido já criado", () => {
    const p = systemPrompt(prod as PromptConfig, gateBriefing(prod as PromptConfig), null).replace(/\s+/g, " ");
    expect(p).toContain("mudança de endereço de um pedido JÁ CRIADO são com o atendimento ao cliente");
    expect(p).toContain("Antes do pedido criado, endereço novo é CEP novo");
    expect(p).not.toContain("ou trocar o endereço da entrega, mande");
  });
});
void config;

describe("revisão Opus da v38 (copy v4)", () => {
  it("o e-mail do operador sai em todo caminho (noite, linha fixa, rascunho), uma vez por conversa", () => {
    expect(turn).toContain("const notifyOnce = async (): Promise<Record<string, unknown>> => {");
    expect(turn.match(/const once = await notifyOnce\(\);/g)?.length).toBe(3);
    expect(turn).toContain('return json(200, { status: "deferred", ...once, reason, runAt: runAt.toISOString(), rewrites: 0, costBrl: spent });');
    expect(turn).toContain('      status: "ok",\n      ...once,\n      reason,');
    expect(turn).toContain('      status: "deferred",\n      ...once,');
    expect(turn).toContain("  await notifyOnce();\n  await Promise.all([\n    recordOutcome(");
    expect(turn).toContain("    if (guideReasons.includes(reason)) return;");
  });
  it("o antecipado depois da pergunta dos Correios só vai com o sim dela", () => {
    expect(turn).toContain("lastOutbound === sizeNoCodAsk(region.size) && !parts.some((p: string) => confirmsAddress(spoken(p)) || interpretation.wants_to_buy)) {");
    expect(turn).toContain("const refusedCorreios = codBefore && lastOutbound === ADDRESS_NO_COD_ASK && !parts.some((p: string) => confirmsAddress(spoken(p))) && !interpretation.wants_to_buy;");
  });
  it("a calça fora da tabela, dita por ela, para a régua mesmo com a resposta do modelo", () => {
    expect(turn).toContain("herRecent(at.messages ?? [], spoken).some((m: string) => sizeBeyondTable(m, true) !== null))) {");
  });
});

describe("replay de 20/10: o rótulo da mídia nunca chega à cliente", () => {
  it("tira a descrição da imagem, do vídeo e do áudio que o modelo copiou do histórico", async () => {
    const { stripMediaLabels } = await import("@/agent/funnel.js");
    expect(stripMediaLabels("Tem sim, te mando aqui! 💛\n\n[imagem da Malu: tabela de tamanhos pela calça — P 34 a 36]\n\nQue número você veste?"))
      .toBe("Tem sim, te mando aqui! 💛\n\nQue número você veste?");
    expect(stripMediaLabels("[áudio da Malu] Olá, tudo bem?\nOi!")).toBe("Oi!");
    // Negation: her own words in brackets, or a reply without labels, pass untouched.
    expect(stripMediaLabels("Com 42 o seu é o G [cintura 76 a 84]")).toBe("Com 42 o seu é o G [cintura 76 a 84]");
  });
  it("a turn limpa toda resposta do modelo na porta única da chamada", () => {
    expect(turn).toContain("return { ...call, text: stripMediaLabels(call.text) };");
  });
});
