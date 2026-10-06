import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IN_CALL_RETRY_BUDGET_MS, QUIET_WINDOW_MS, WELCOME_AUTO_REPLY, retryIsMoot, unansweredInbound } from "@/agent/retry.js";
import { MIN_TURN_TIMEOUT_MS } from "@/dev/n8n-rules.js";

/**
 * Uma resposta por rajada (grafo §59, primeiro teste real no WhatsApp, 2026-10-06): cada
 * mensagem dela virava um turno e uma resposta — duas perguntas seguidas, duas respostas quase
 * iguais; "Leila" e "Leila da Silva Claude", o link duas vezes.
 */
const inbound = (id: string, body: string, at = "2026-10-06T14:17:51Z") => ({ id, direction: "inbound", body, created_at: at });
const outbound = (id: string, body: string) => ({ id, direction: "outbound", body, created_at: "2026-10-06T14:10:00Z" });

describe("o que ela ainda não teve resposta", () => {
  it("lê todas as mensagens dela desde a última resposta, da mais antiga para a mais nova", () => {
    const newestFirst = [
      inbound("m2", "Qual o material usado?"),
      inbound("m1", "Mas queria entender melhor sobre a cinta, ela tem quelas barbatanas de metal?"),
      outbound("o1", "Qual o seu CEP?"),
      inbound("m0", "oi"),
    ];
    expect(unansweredInbound(newestFirst).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("uma mensagem sozinha continua sendo respondida", () => {
    expect(unansweredInbound([inbound("m1", "oi"), outbound("o1", "Olá")]).map((m) => m.id)).toEqual(["m1"]);
  });

  it("linha da agente não entra, e qualquer resposta (régua, pessoa, agente) fecha a rajada", () => {
    const newestFirst = [inbound("m3", "e o frete?"), outbound("o2", "Oi, passando pra lembrar do seu pedido"), inbound("m2", "ok")];
    expect(unansweredInbound(newestFirst).map((m) => m.id)).toEqual(["m3"]);
    expect(unansweredInbound([outbound("o1", "Olá")])).toEqual([]);
    expect(unansweredInbound([])).toEqual([]);
  });

  it("a boas-vindas fixa não responde nada: a retomada responde a mensagem que a disparou", () => {
    const newestFirst = [inbound("m2", "tem G?"), outbound("w", WELCOME_AUTO_REPLY), inbound("m1", "oi, quanto custa?")];
    expect(unansweredInbound(newestFirst).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("chegou mensagem mais nova dela", () => {
  const mine = { id: "m1", created_at: "2026-10-06T14:17:51Z" };
  it("o turno da mensagem mais nova responde; o da anterior desiste", () => {
    expect(retryIsMoot("m1", { id: "m2", created_at: "2026-10-06T14:17:53Z" }, null)).toBe(true);
  });
  it("sem mensagem nova, o turno responde", () => {
    expect(retryIsMoot("m1", mine, null)).toBe(false);
  });
});

describe("a janela de silêncio cabe no tempo do n8n", () => {
  it("8 s, e espera + intérprete (20 s) + região (2 × 10 s) + resposta cabem nos 150 s", () => {
    expect(QUIET_WINDOW_MS).toBe(8_000);
    expect(QUIET_WINDOW_MS + 20_000 + 20_000 + IN_CALL_RETRY_BUDGET_MS).toBeLessThan(MIN_TURN_TIMEOUT_MS);
  });
});

describe("fiação no turno (index.ts lido como fonte)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const insert = source.indexOf('direction: "inbound",\n        body: inbound.body ?? "",');
  const burst = source.indexOf("// 2d. One answer per burst");
  const optOut = source.indexOf('const optOut = classifyOptOut(inbound.body ?? "");');

  it("a espera roda depois de guardar a mensagem e antes de qualquer leitura do texto dela", () => {
    expect(insert).toBeGreaterThan(-1);
    expect(burst).toBeGreaterThan(insert);
    expect(optOut).toBeGreaterThan(burst);
    const block = source.slice(burst, optOut);
    // Só o turno de uma mensagem nova espera: a retomada já esperou, a nova tentativa é da varredura.
    expect(block).toContain("if (!isResume && !isRetry) await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS));");
    // Só mensagens desta conversa contam; linhas da agente não (direction filtrada no find).
    expect(block).toContain("`messages?conversation_id=eq.${conversation.id}&select=id,direction,body,created_at&order=created_at.desc&limit=20`");
    expect(block).toContain('retryIsMoot(inboundId, recentRows.find((m: { direction: string }) => m.direction === "inbound") ?? null, null)');
    expect(block).toContain('status: "superseded"');
    expect(block).toContain('inbound = { ...inbound, body: unanswered.map((m: { body: string | null }) => m.body ?? "").join("\\n") };');
  });

  it("o pedido de pessoa por frase exata é lido mensagem a mensagem", () => {
    expect(source).toContain("if (unanswered.some((m: { body: string | null }) => wantsHuman(m.body ?? \"\"))) {");
  });

  it("a retomada é moot quando chegou mensagem depois da que a disparou", () => {
    expect(source).toContain("if (latest?.[0] && latest[0].external_id !== inbound.externalId) return json(200, { status: \"resume_moot\" });");
  });

  it("logo antes de mandar, uma mensagem mais nova descarta a resposta — para todo turno, não só a nova tentativa", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).not.toContain("if (!isRetry) return null;");
    expect(guard).toContain("retryIsMoot(inboundId, latest?.[0] ?? null, null)");
    // Uma leitura que falha nunca cala a cliente.
    expect(guard).toContain("if (latest === null && !isRetry) return null;");
    expect(guard).toContain('status: isRetry ? "retry_moot" : "superseded"');
    const finalInsert = source.indexOf("const outbound = (");
    expect(finalInsert - source.lastIndexOf("const gaveUp = await lateGuard(rewritesUsed);", finalInsert)).toBeLessThan(200);
    expect(source).toContain("const gaveUp = await lateGuard(0);");
  });

  it("os tamanhos de um kit não se somam duas vezes quando um turno descartado já os gravou", () => {
    expect(source).toContain("saidSizes.length < units &&\n    batchFrom !== null &&");
    expect(source).toContain("batchFrom = unanswered[0]?.created_at ?? null;");
  });
});
