/**
 * Operator, 2026-10-20 (grafo §117): the delivery is checked with the size she chose — every size of a kit — and an order the
 * system cannot find by any path sends her to the customer service, saying it is the system's problem.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runGates } from "@/agent/guardrails.js";
import { orderNotFoundReply } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

const PHONE = "+55 11 98819-4261";
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("pedido não encontrado", () => {
  const line = orderNotFoundReply(PHONE);
  it("diz que é problema no sistema e passa o número do atendimento ao cliente logo em seguida", () => {
    expect(line).toMatch(/^Não estou encontrando o seu pedido aqui por um problema no sistema/);
    expect(line).toContain(`atendimento ao cliente no WhatsApp ${PHONE}`);
    expect(line).not.toMatch(/Logzz|Gizele|e-?mail/i);
  });
  it.each(["cod", "prepay"] as const)("passa a cadeia (camada auto) no caminho %s", (p) =>
    expect(runGates(line, ctx({ config, paymentPath: p, layer: "auto" })).traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toEqual([]));
  it("procura pelo lead dela e pelo mesmo número com e sem o nono dígito — nunca só pelo final", () => {
    expect(turn).toContain("const m = /^55(\\d{2})9?(\\d{8})$/.exec(digits(String(lead.phone ?? \"\")));");
    expect(turn).toContain("leads?phone=in.(55${m[1]}${m[2]},55${m[1]}9${m[2]})&select=id");
    expect(turn).toContain("const orders: OrderView[] = ((await db(`orders?lead_id=in.(${(await herLeadIds()).join(\",\")})&select=status,payment_method,scheduled_for&order=created_at.desc`)");
  });
  it("só sem nenhum pedido por nenhum caminho (o pedido de status desconhecido existe), e uma vez por conversa", () => {
    expect(turn).toContain("const found = ((await db(`orders?lead_id=in.(${(await herLeadIds()).join(\",\")})&select=id&limit=1`).catch(() => null)) ?? [null]).length > 0;");
    expect(turn).toContain("turn_outcomes?conversation_id=eq.${conversation.id}&reason=like.${encodeURIComponent(`${ORDER_NOT_FOUND_REASON}*`)}");
    expect(turn).toContain("if (!found && sentBefore.length === 0) return await handOff(orderNotFoundReply(logzzPhone), ORDER_NOT_FOUND_REASON);");
  });
  it("o \"paguei\" também lê os pedidos pelos mesmos caminhos", () => {
    expect(turn).toContain("? (await db(`orders?lead_id=in.(${(await herLeadIds()).join(\",\")})&select=status,payment_method`).catch(() => null)) ?? []");
    expect(turn.indexOf("const herLeadIds = async")).toBeLessThan(turn.indexOf('// 4a0. "Paguei"'));
  });
});

describe("kit: a entrega só com todos os tamanhos dela", () => {
  it("pergunta os outros tamanhos do kit em paralelo; sem entrega ou sem resposta, o kit vai pelo antecipado (nunca os dois links)", () => {
    expect(turn).toContain("if (region?.cod && units > 1 && addressDraft.cep) {");
    expect(turn).toContain("const others = [...new Set(unitSizes)].filter((x): x is Size => (SIZES as readonly string[]).includes(x) && x !== regionSize);");
    expect(turn).toContain("const answers = await Promise.all(others.map((s) =>");
    expect(turn).toContain('const missing = answers.find(({ r }) => !(r.kind === "found" && r.region.cod));');
    expect(turn).toContain("if (missing) region = { ...region, cod: false, dates: [], sameDay: false, size: missing.s };");
  });
  it("a oferta da entrega que já foi diz o tamanho antes do antecipado", () => {
    expect(turn).toContain('...(offerBefore === "cod" && !cod && region.size ? [{ text: `No ${region.size} o pagamento na entrega não está disponível aí agora, então o seu vai pelo antecipado 💛` }] : []),');
  });
});

describe("a segunda pergunta do pedido não achado", () => {
  it("a diretiva manda ao atendimento ao cliente pelo número, e ao e-mail só sem ele", () => {
    expect(turn).toContain("${logzzPhone ? ` e que a nossa equipe de atendimento ao cliente confere pra ela no WhatsApp ${logzzPhone}` : supportEmail ? ` e que o e-mail ${supportEmail} confere pra ela` : ``}");
  });
});
