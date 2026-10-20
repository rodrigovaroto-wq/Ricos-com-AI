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
    for (const k of kits) expect(msg).toContain(`• ${k.units} peças: R$ ${k.priceBrl.toFixed(2).replace(".", ",")} (${k.discountPercent}% de desconto)`);
    expect(msg).toContain("Se quiser levar mais de uma:\n");
  });
});

describe("endereço novo antes do pedido", () => {
  it.each(["Quero mudar meu endereço", "La no checkout eu tentei mudar e ta falando que não tem entrega pro meu endereço", "posso receber em outro endereço?", "o endereço tá errado"])(
    "lê: %s", (m) => expect(changesAddress(m)).toBe(true));
  it.each(["não quero mudar o endereço", "o endereço tá certo", "meu endereço é rua x 10", "qual o endereço da loja?"])("negação: %s", (m) => expect(changesAddress(m)).toBe(false));
  it("a turn, sem pedido por nenhum caminho, manda consultar o CEP novo e nunca o atendimento ao cliente", () => {
    expect(turn).toContain("const newAddressBeforeOrder = !parts.some((p: string) => parseCep(p) !== null) && parts.some((p: string) => changesAddress(spoken(p))) &&");
    expect(turn).toContain("Não mande ela ao atendimento ao cliente e não peça pra ela conferir o CEP no checkout.");
  });
  it("o prompt manda ao atendimento ao cliente só com o pedido já criado", () => {
    const p = systemPrompt(prod as PromptConfig, gateBriefing(prod as PromptConfig), null).replace(/\s+/g, " ");
    expect(p).toContain("mudança de endereço de um pedido JÁ CRIADO são com o atendimento ao cliente");
    expect(p).toContain("Antes do pedido criado, endereço novo é CEP novo");
    expect(p).not.toContain("ou trocar o endereço da entrega, mande");
  });
});
void config;
