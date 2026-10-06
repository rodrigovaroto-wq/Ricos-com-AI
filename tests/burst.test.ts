import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IN_CALL_RETRY_BUDGET_MS, QUIET_WINDOW_MS, WELCOME_AUTO_REPLY, retryIsMoot, unansweredInbound } from "@/agent/retry.js";
import { MIN_TURN_TIMEOUT_MS } from "@/dev/n8n-rules.js";
import { classifyOptOutBurst } from "@/agent/guardrails.js";
import { decisionInBurst } from "@/agent/interpret.js";
import { extractAddressBurst } from "@/agent/address.js";
import { extractIdentityBurst } from "@/agent/identity.js";

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
  const optOut = source.indexOf("const optOut = classifyOptOutBurst(parts);");

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
    expect(block).toContain('inbound = { ...inbound, body: parts.join("\\n") };');
  });

  it("o pedido de pessoa por frase exata é lido mensagem a mensagem", () => {
    expect(source).toContain("if (parts.some(wantsHuman)) {");
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

/**
 * Revisão de 5af3a8b: a rajada unida por quebra de linha quebrava os leitores ancorados no texto
 * inteiro (opt-out, endereço, nome), e a última mensagem dela não vencia quando corrigia a anterior.
 */
describe("leitura da rajada mensagem a mensagem", () => {
  it("opt-out: a mais forte das mensagens vale, com outra linha antes", () => {
    expect(classifyOptOutBurst(["oi", "não quero receber mais promoção"])).toBe("explicit");
    expect(classifyOptOutBurst(["kkk", "pare com isso"])).toBe("explicit");
    expect(classifyOptOutBurst(["vi o colete", "chega de mensagem"])).toBe("explicit");
    expect(classifyOptOutBurst(["oi", "sair"])).toBe("ambiguous");
    expect(classifyOptOutBurst(["sair", "pare com isso"])).toBe("explicit");
  });
  it("opt-out: rajada sem pedido continua sem opt-out", () => {
    expect(classifyOptOutBurst(["oi", "qual o preço?"])).toBe("none");
    expect(classifyOptOutBurst(["tem como parar a dor?", "uso G"])).toBe("none");
  });

  it("decisão: a desistência numa mensagem posterior vence", () => {
    expect(decisionInBurst(["quero comprar o M\nnão, pensando bem vou esperar"])).toBe(false);
    expect(decisionInBurst(["quero comprar o M", "não, pensando bem vou esperar"])).toBe(false);
    expect(decisionInBurst(["vou levar", "depois eu vejo"])).toBe(false);
  });
  it("decisão: continua decidida quando a mensagem posterior não desiste, e nula sem decisão", () => {
    expect(decisionInBurst(["quero comprar o M", "qual o prazo?"])).toBe(true);
    expect(decisionInBurst(["vou esperar", "não, quero comprar o M"])).toBe(true);
    expect(decisionInBurst(["vou levar", "não sei meu CEP de cabeça"])).toBe(true);
    expect(decisionInBurst(["oi", "qual o material?"])).toBeNull();
  });

  it("endereço: o da mensagem mais nova vence", () => {
    expect(extractAddressBurst(["Rua das Flores 10", "não, Rua das Rosas 12"])).toMatchObject({ street: "Rua das Rosas", number: "12" });
    expect(extractAddressBurst(["oi", "Rua A 10"])).toMatchObject({ street: "Rua A", number: "10" });
    expect(extractAddressBurst(["oi", "qual o preço?"])).toEqual({});
  });

  it("nome sozinho numa mensagem continua lido com outra mensagem antes", () => {
    expect(extractIdentityBurst(["oi", "Leila Souza"])).toEqual({ name: "Leila Souza" });
    expect(extractIdentityBurst(["boa tarde", "quero comprar"])).toEqual({});
  });
});

describe("fiação da leitura por mensagem (index.ts lido como fonte)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("cada leitor ancorado lê as mensagens, não o texto unido", () => {
    expect(source).toContain("const optOut = classifyOptOutBurst(parts);");
    expect(source).toContain("parts.some(asksSomething)");
    expect(source).toContain("if (parts.some(wantsHuman)) {");
    expect(source).toContain("const decided = decisionInBurst(parts);");
    expect(source).toContain("const foundAddress = { fields: extractAddressBurst(parts) };");
    expect(source).toContain("confirmsAddress(parts[parts.length - 1] ?? \"\")");
    expect(source).toContain("const foundIdentity = { fields: extractIdentityBurst(parts) };");
    expect(source).toContain("parts.some(choosesPath)");
    expect(source).toContain("askedIdentity: parts.some(asksWhatSheIs),");
    expect(source).not.toMatch(/classifyOptOut\(inbound\.body|extractAddress\(inbound\.body|extractIdentity\(inbound\.body|confirmsAddress\(inbound\.body|decidesToBuy\(inbound\.body/);
  });
  it("uma leitura que falha na espera não cala a cliente", () => {
    expect(source).toContain("&order=created_at.desc&limit=20`).catch(() => null);");
    expect(source).toContain("if (recentRows !== null && !isRetry && inboundId !== null && retryIsMoot(");
  });
  it("o custo gravado soma ao que está no banco, não sobrescreve", () => {
    expect(source).not.toMatch(/cost_brl: spent\b/);
    expect(source.match(/cost_brl: await costTotal\(\)/g)?.length).toBeGreaterThanOrEqual(9);
  });
});
