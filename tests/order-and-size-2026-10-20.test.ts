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
  it("só sem nenhum pedido legível, e nunca a mesma linha duas vezes seguidas", () => {
    expect(turn).toContain("if (handoffKind !== null && logzzPhone !== null && orderNotFoundReply(logzzPhone) !== lastOutbound) {");
    expect(turn).toContain(".some((o: { status: string }) => isKnownOrderStatus(o.status) && stageForOrder(o.status) !== null);");
    expect(turn).toContain("if (!readable) return await handOff(orderNotFoundReply(logzzPhone), `${ORDER_UNREADABLE_REASON}: mandada ao atendimento ao cliente`);");
  });
});

describe("kit: a entrega só com todos os tamanhos dela", () => {
  it("pergunta cada tamanho do kit além do já consultado, e um \"não\" leva ao antecipado", () => {
    expect(turn).toContain("if (region?.cod && units > 1 && addressDraft.cep) {");
    expect(turn).toContain("for (const s of [...new Set(unitSizes)].filter((x): x is Size => (SIZES as readonly string[]).includes(x) && x !== regionSize)) {");
    expect(turn).toContain('if (other.kind === "found") region = { ...region, cod: false, dates: [], sameDay: false, size: s };');
    // Not known is not "no": the lookup failed for the kit.
    expect(turn).toContain("else { failedPlace = region.place; region = null; }");
  });
  it("a oferta da entrega que já foi diz o tamanho antes do antecipado", () => {
    expect(turn).toContain('...(offerBefore === "cod" && !cod && region.size ? [{ text: `No ${region.size} o pagamento na entrega não está disponível aí agora, então o seu vai pelo antecipado 💛` }] : []),');
  });
});
