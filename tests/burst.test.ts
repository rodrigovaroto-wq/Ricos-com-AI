import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IN_CALL_RETRY_BUDGET_MS,
  MAX_REVISIONS,
  MAX_REWRITES,
  MIN_ATTEMPT_MS,
  QUIET_WINDOW_MS,
  REPLYING_STALE_MS,
  REVISE_DEADLINE_MS,
  REVISE_MIN_MS,
  WELCOME_AUTO_REPLY,
  retryIsMoot,
  reviseInstruction,
  revisionAllowed,
  unansweredInbound,
} from "@/agent/retry.js";
import { MIN_TURN_TIMEOUT_MS } from "@/dev/n8n-rules.js";
import { classifyOptOutBurst } from "@/agent/guardrails.js";
import { asksSomething, decisionInBurst } from "@/agent/interpret.js";
import { confirmsAddress, extractAddressBurst } from "@/agent/address.js";
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
  it("5 s (operador, 2026-10-06), e espera + intérprete (20 s) + região (2 × 10 s) + resposta cabem nos 150 s", () => {
    expect(QUIET_WINDOW_MS).toBe(5_000);
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
    expect(block).toContain("if (!isResume && !isRetry && !isRevise) await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS));");
    // Só mensagens desta conversa contam; linhas da agente não (direction filtrada no find).
    expect(block).toContain("`messages?conversation_id=eq.${conversation.id}&select=id,direction,body,created_at&order=created_at.desc&limit=20`");
    expect(block).toContain('retryIsMoot(inboundId, recentRows.find((m: { direction: string }) => m.direction === "inbound") ?? null, null)');
    expect(block).toContain('status: "superseded"');
    // Grafo §61: um turno respondendo por vez; o mais novo entrega a mensagem a ele.
    expect(block).toContain('status: "joined"');
    expect(block).toContain('inbound = { ...inbound, body: parts.join("\\n") };');
  });

  it("o pedido de pessoa por frase exata é lido mensagem a mensagem", () => {
    expect(source).toContain("if (parts.some(wantsHuman)) {");
  });

  it("a retomada é moot quando chegou mensagem depois da que a disparou", () => {
    expect(source).toContain("if (latest?.[0] && latest[0].external_id !== inbound.externalId) return json(200, { status: \"resume_moot\" });");
  });

  it("logo antes de mandar, uma mensagem mais nova é revisada na resposta — a nova tentativa ainda desiste", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).not.toContain("if (!isRetry) return null;");
    expect(guard).toContain("retryIsMoot(inboundId, latest?.[0] ?? null, null)");
    // Uma leitura que falha nunca cala a cliente.
    expect(guard).toContain("if (latest === null && !isRetry) return null;");
    // Grafo §61: o descarte "superseded" saiu da segunda olhada; só a nova tentativa desiste —
    // e o turno que não conseguiu tomar a conversa (0023 ausente), que volta ao §59 (revisão de 7c8bc7c).
    const fallback = guard.slice(guard.indexOf("if (claimFailed) {"), guard.indexOf("const revisions"));
    expect(fallback).toContain('status: "superseded"');
    expect(guard.replace(fallback, "")).not.toContain("superseded");
    expect(guard).toContain('status: "retry_moot"');
    const finalInsert = source.indexOf("const outbound = (");
    expect(finalInsert - source.lastIndexOf("const gaveUp = await lateGuard(rewritesUsed, replyText);", finalInsert)).toBeLessThan(200);
    expect(source).toContain("const gaveUp = await lateGuard(0, text);");
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
    // A later line that may take it back hands the call to the model, which reads the whole burst
    // (review of 21f2e29: "depois de amanhã pode entregar?" is a buyer, not a retraction).
    expect(decisionInBurst(["quero comprar o M\nnão, pensando bem vou esperar"])).toBeNull();
    expect(decisionInBurst(["quero comprar o M", "não, pensando bem vou esperar"])).toBeNull();
    expect(decisionInBurst(["vou levar", "depois eu vejo"])).toBeNull();
    for (const burst of [
      ["quero o M", "depois de amanhã pode entregar?"],
      ["quero o M", "quanto tempo depois chega?"],
      ["quero o M", "entrega mais tarde?"],
      ["vou levar", "pode mandar depois do almoço?"],
      ["quero o M", "quero pagar na entrega, pode ser depois das 18h?"],
      ["quero o G", "vou pensar no kit depois"],
    ])
      expect(decisionInBurst(burst), burst.join(" + ")).not.toBe(false);
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
    expect(source).toContain("!parts.some(asksSomething) &&");
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
    // 8 since grafo §60: the ladder's silent exit, one of the nine, was deleted with it.
    expect(source.match(/cost_brl: await costTotal\(\)/g)?.length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * Rajada v2 (grafo §61, operador, 2026-10-06): "se chegar outra mensagem enquanto ela 'digita' ela
 * não deve jogar tudo fora: deve dar um passo para trás, olhar o que já tem como resposta e contexto,
 * introduzir a nova mensagem e a partir daí criar a resposta".
 */
describe("um turno respondendo por vez, e a resposta revisada com o que chegou", () => {
  it("a instrução de revisão leva o rascunho e pede uma resposta só, natural, sem lista", () => {
    const text = reviseInstruction("Oi! O colete tem barbatanas flexíveis.");
    expect(text).toContain('"Oi! O colete tem barbatanas flexíveis."');
    expect(text).toContain("Ela mandou mais mensagens enquanto você escrevia");
    expect(text).toContain("uma resposta só");
    expect(text).toContain("sem virar lista");
  });

  it("revisa enquanto há revisão e tempo; depois não", () => {
    const deadline = 100_000;
    expect(revisionAllowed(0, deadline - REVISE_MIN_MS, deadline)).toBe(true);
    expect(revisionAllowed(MAX_REVISIONS - 1, 0, deadline)).toBe(true);
    // Negações: o limite de revisões e o relógio.
    expect(revisionAllowed(MAX_REVISIONS, 0, deadline)).toBe(false);
    expect(revisionAllowed(0, deadline - REVISE_MIN_MS + 1, deadline)).toBe(false);
  });

  it("a revisão cabe nos 150 s do n8n: começa no máximo REVISE_MIN_MS antes do prazo, e as reescritas passam dele no máximo uma tentativa mínima cada", () => {
    expect(MAX_REVISIONS).toBe(2);
    // intérprete (8 s) + região (2 × 5 s) + uma tentativa mínima cabem no mínimo para começar.
    expect(REVISE_MIN_MS).toBeGreaterThanOrEqual(8_000 + 2 * 5_000 + MIN_ATTEMPT_MS);
    expect(REVISE_DEADLINE_MS + MAX_REWRITES * MIN_ATTEMPT_MS + 10_000 /* banco */).toBeLessThan(MIN_TURN_TIMEOUT_MS);
    // A marca de "respondendo" vence quando o turno que a pôs já foi cortado.
    expect(REPLYING_STALE_MS).toBeGreaterThanOrEqual(MIN_TURN_TIMEOUT_MS);
  });

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const burst = source.slice(source.indexOf("// 2d. One answer per burst"), source.indexOf("const optOut = classifyOptOutBurst(parts);"));

  it("depois da espera, o turno toma a conversa num update condicional; quem não toma sai 'joined'", () => {
    expect(burst).toContain("replying_since.is.null,replying_since.lt.");
    expect(burst.indexOf("replying_since")).toBeGreaterThan(burst.indexOf('status: "superseded"'));
    // Só quem o Deno.serve chamou toma a conversa: a revisão herda, a nova tentativa não toma.
    expect(burst).toContain("if (internal.claimed) {");
    // Uma leitura que falha não cala a cliente: só uma resposta vazia do update é "outro turno respondendo".
    expect(burst).toContain(".catch(() => null);");
    expect(burst).toContain("won?.length === 0");
  });

  it("a marca sai quando o turno termina, de qualquer jeito, e só a dele", () => {
    const serve = source.slice(source.indexOf("Deno.serve("), source.indexOf("const humanReply = async"));
    expect(serve).toContain("handleTurn(payload, { claimed }).finally(");
    expect(serve).toContain("replying_since=eq.");
  });

  it("a segunda olhada revisa pelo próprio turno, com o rascunho, o prazo e o custo de antes", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("revisionAllowed(revisions, Date.now(), deadline)");
    expect(guard).toContain("handleTurn(");
    expect(guard).toContain("revise: { draft, revisions: revisions + 1, deadline, spentBefore }");
    // Sem revisão possível, a rajada inteira vai para a varredura — nunca uma resposta que não leu o que chegou.
    expect(guard).toContain("deferRetry(");
    // O custo do rascunho é gravado antes de a revisão reler o total.
    expect(guard.indexOf("cost_brl: await costTotal()")).toBeLessThan(guard.indexOf("handleTurn("));
  });

  it("a revisão não é mensagem nova: sem selo, sem idempotência, sem gravar, sem esperar", () => {
    expect(source).toContain("const isRevise = internal.revise !== undefined;");
    expect(source).toContain("    !isRetry &&\n    !isRevise &&");
    expect(source).toContain("if (!isResume && !isRetry && !isRevise) {\n    const seen");
    expect(source).toContain("if (!isResume && !isRetry && !isRevise) await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS));");
    expect(source).toContain("const spentBefore = internal.revise?.spentBefore ?? spent;");
    // O prazo da revisão manda nas chamadas dela.
    expect(source).toContain("isRevise ? internal.revise!.deadline : replyBudgetFrom + (isRetry ? RETRY_TURN_BUDGET_MS : IN_CALL_RETRY_BUDGET_MS)");
    expect(source).toContain("isRetry || isRevise ? RETRY_INTERPRET_TIMEOUT_MS : INTERPRET_TIMEOUT_MS");
    expect(source).toContain("signal: AbortSignal.timeout(isRetry || isRevise ? RETRY_REGION_TIMEOUT_MS : REGION_TIMEOUT_MS)");
  });

  it("o modelo recebe o rascunho no prompt de sistema, não no histórico", () => {
    expect(source).toContain("internal.revise ? ` ${reviseInstruction(internal.revise.draft)}` : \"\"");
  });

  it("a resposta fora de hora também passa pela segunda olhada", () => {
    const defer = source.slice(source.indexOf('if (outcome.kind === "defer") {'), source.indexOf('kind: "deferred_reply",'));
    expect(defer).toContain("await lateGuard(rewritesUsed, attempt.text)");
  });

  it("a nova tentativa agendada responde pela mensagem mais nova dela, a que pode ter se juntado", () => {
    const defer = source.slice(source.indexOf("const deferRetry = async"), source.indexOf("const lateGuard = async"));
    expect(defer).toContain("direction=eq.inbound&select=id&order=created_at.desc&limit=1");
  });

  it("migração 0023: a coluna da marca, aditiva e anulável", () => {
    const sql = readFileSync("supabase/migrations/0023_replying_since.sql", "utf8");
    expect(sql).toContain("alter table public.conversations add column if not exists replying_since timestamptz;");
  });
});

/**
 * "Sim" no meio de outras mensagens (operador, 2026-10-06): "'Sim' depois do endereço conta como
 * confirmação, porém precisa fazer sentido: se a cliente pede mais informações e manda um 'Sim' no
 * meio, o agente não deve mandar o checkout; deve ler as demais mensagens e responder adequadamente."
 */
describe("o 'sim' só confirma quando é tudo o que ela disse", () => {
  /** A regra do turno, com os leitores dele: o "sim" na última mensagem e nenhuma pergunta na rajada. */
  const confirms = (parts: string[]) => confirmsAddress(parts[parts.length - 1] ?? "") && !parts.some(asksSomething);
  it("'sim' sozinho depois da leitura do endereço confirma", () => {
    expect(confirms(["sim"])).toBe(true);
    expect(confirms(["isso mesmo"])).toBe(true);
    expect(confirms(["ok", "sim"])).toBe(true);
  });
  it("'tem rastreio?' + 'sim' não confirma", () => {
    expect(confirms(["tem rastreio?", "sim"])).toBe(false);
  });
  it("'sim' + 'mas antes, qual o prazo?' não confirma", () => {
    expect(confirms(["sim", "mas antes, qual o prazo?"])).toBe(false);
    expect(confirms(["sim, qual o prazo?"])).toBe(false);
  });

  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("o 'sim' do lado de uma pergunta segura o link, sem zerar a decisão de quem compra (revisão de 7c8bc7c)", () => {
    expect(source).toContain(
      "decided !== true && parts.some(confirmsAddress) && parts.some(asksSomething) && !parts.some(buyerAsk);",
    );
    expect(source).not.toMatch(/parts\.some\(asksSomething\)\) interpretation = \{ \.\.\.interpretation, wants_to_buy: false \}/);
    expect(source).toContain("sendLinkNow({ ...linkData, yesBesideQuestion })");
    // Depois da leitura do intérprete e da decisão por mensagem, antes do link.
    const rule = source.indexOf("const yesBesideQuestion =");
    expect(rule).toBeGreaterThan(source.indexOf("const decided = decisionInBurst(parts);"));
    expect(rule).toBeLessThan(source.indexOf("const linkNow = "));
  });
});
