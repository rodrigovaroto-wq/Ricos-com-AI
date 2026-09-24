import { describe, expect, it } from "vitest";
import {
  decideNext,
  rewriteInstruction,
  HOLDING_REPLY,
  afterRetryFailure,
  retryIsMoot,
  IN_CALL_RETRY_BUDGET_MS,
  MAX_DEFERRED_RETRIES,
  MAX_REWRITES,
  MIN_ATTEMPT_MS,
  MODEL_CALL_TIMEOUT_MS,
  NETWORK_RETRY_DELAYS_MS,
  networkRetryDelay,
  type TurnState,
} from "@/agent/retry.js";
import { runGates, type Remedy as GateRemedy } from "@/agent/guardrails.js";
import type { Remedy as RetryRemedy } from "@/agent/retry.js";
import { ctx } from "./fixtures.js";

// retry.ts declara `Remedy` localmente para poder ser espelhado byte a byte na Edge
// Function. Estas duas linhas não rodam nada: elas falham no typecheck se as duas
// definições divergirem, que é o único jeito de essa cópia não passar despercebida.
const _remedyMatchesGate: RetryRemedy = null as unknown as GateRemedy;
const _gateMatchesRetry: GateRemedy = null as unknown as RetryRemedy;
void _remedyMatchesGate;
void _gateMatchesRetry;

const state = (over: Partial<TurnState> = {}): TurnState => ({
  remedy: "rewrite",
  rewritesUsed: 0,
  spentBrl: 0.002,
  ceilingBrl: 1,
  reasons: ["price 99.9 is not one of the configured values"],
  vetoedText: "Sai por R$ 99,90 hoje!",
  ...over,
});

describe("o que acontece depois do veto", () => {
  it("nada barrou: manda", () => {
    expect(decideNext(state({ remedy: null }))).toEqual({ kind: "send" });
  });

  it("bloqueio reescrevível vira reescrita, não handoff", () => {
    const action = decideNext(state());
    expect(action.kind).toBe("rewrite");
  });

  it("opt-out para, e nunca vira reescrita", () => {
    expect(decideNext(state({ remedy: "stop" }))).toEqual({ kind: "stop" });
  });

  it("fora de horário adia, e nunca vira reescrita", () => {
    expect(decideNext(state({ remedy: "defer" }))).toEqual({ kind: "defer" });
  });
});

describe("os limites do laço", () => {
  // A mudança de política de 2026-09-08, travada aqui: veto esgotado não chama ninguém.
  // Uma resposta mal escrita nunca foi problema da cliente, e handoff é irreversível —
  // pagar com o fim da conversa por um erro de redação da agente é o pior troco possível.
  it("esgotada a reescrita, responde pela saída segura em vez de chamar gente", () => {
    const action = decideNext(state({ rewritesUsed: MAX_REWRITES }));
    expect(action.kind).toBe("fallback");
    expect(action.kind === "fallback" && action.reason).toContain("nenhuma passou na cadeia");
  });

  // Duas desde 2026-09-24 (R13.4): um falso veto na primeira versão e outro na reescrita
  // mandavam a resposta de saída, que ignora a pergunta dela.
  it("duas reescritas antes da saída segura, não uma nem três", () => {
    expect(MAX_REWRITES).toBe(2);
    expect(decideNext(state({ rewritesUsed: 0 })).kind).toBe("rewrite");
    expect(decideNext(state({ rewritesUsed: 1 })).kind).toBe("rewrite");
    expect(decideNext(state({ rewritesUsed: 2 })).kind).toBe("fallback");
  });

  it("a segunda reescrita também respeita o teto de custo", () => {
    const action = decideNext(state({ rewritesUsed: 1, spentBrl: 2, ceilingBrl: 1 }));
    expect(action.kind).toBe("handoff");
  });

  it("sem orçamento não há reescrita, mesmo na primeira tentativa", () => {
    const action = decideNext(state({ spentBrl: 1.2, ceilingBrl: 1 }));
    expect(action.kind).toBe("handoff");
    expect(action.kind === "handoff" && action.reason).toContain("teto de custo");
  });

  it("o teto vence a contagem de tentativas", () => {
    const action = decideNext(state({ spentBrl: 5, rewritesUsed: 0 }));
    expect(action.kind === "handoff" && action.reason).toContain("teto de custo");
  });
});

describe("a instrução que volta para o modelo", () => {
  const instruction = rewriteInstruction(["prazo prometido menor que o configurado"], "Chega amanhã!");

  it("carrega o motivo e o texto vetado", () => {
    expect(instruction).toContain("prazo prometido menor que o configurado");
    expect(instruction).toContain("Chega amanhã!");
  });

  it("proíbe as duas formas de errar a reescrita", () => {
    expect(instruction).toContain("Não mencione a verificação");
    expect(instruction).toContain("não peça desculpas");
  });
});

describe("a resposta de espera", () => {
  // Ela entra justamente quando a cadeia vetou tudo o mais. Se ela própria não
  // passasse, o último recurso do sistema seria silêncio.
  it("passa na cadeia inteira, que é a condição para existir", () => {
    expect(runGates(HOLDING_REPLY, ctx()).allowed).toBe(true);
  });

  it("não promete prazo, preço nem cupom", () => {
    expect(HOLDING_REPLY).not.toMatch(/R\$|dias|cupom|desconto/i);
  });
});

/**
 * Falha de rede ao chamar o modelo (R13.4, Vera R1: `fetch failed` virou handoff
 * definitivo). Tenta de novo dentro da invocação enquanto cabe — a Edge Function é
 * cortada com 504 aos 150 s — e o resto vai para a varredura do cron.
 */
describe("novas tentativas quando a rede falha", () => {
  it("espera cada vez mais entre as tentativas", () => {
    expect(networkRetryDelay(1, 0)).toBe(2_000);
    expect(networkRetryDelay(2, 5_000)).toBe(5_000);
    expect(networkRetryDelay(3, 15_000)).toBe(10_000);
    expect(networkRetryDelay(4, 30_000)).toBe(20_000);
  });

  it("para quando acabam as esperas previstas", () => {
    expect(networkRetryDelay(NETWORK_RETRY_DELAYS_MS.length + 1, 0)).toBeNull();
    expect(networkRetryDelay(0, 0)).toBeNull();
  });

  it("não começa tentativa que não cabe no orçamento da invocação", () => {
    // Faltam 5 s: a espera de 2 s mais a tentativa mínima de 10 s não cabem.
    expect(networkRetryDelay(1, IN_CALL_RETRY_BUDGET_MS - 5_000)).toBeNull();
    // Exatamente no limite ainda cabe.
    expect(networkRetryDelay(1, IN_CALL_RETRY_BUDGET_MS - 2_000 - MIN_ATTEMPT_MS)).toBe(2_000);
    // O orçamento curto da nova tentativa pela varredura (30 s) corta mais cedo.
    expect(networkRetryDelay(3, 20_000, 30_000)).toBeNull();
  });

  it("o orçamento inteiro cabe folgado sob o corte de 150 s da Edge Function", () => {
    const tentativas = NETWORK_RETRY_DELAYS_MS.length + 1;
    const pior = NETWORK_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + tentativas * MODEL_CALL_TIMEOUT_MS;
    // O laço não passa do orçamento, porque cada tentativa é cortada no que resta dele.
    expect(IN_CALL_RETRY_BUDGET_MS).toBeLessThan(150_000 - 20_000 /* intérprete */ - 10_000 /* banco */);
    expect(pior).toBeGreaterThan(IN_CALL_RETRY_BUDGET_MS);
  });
});

/**
 * A nova tentativa pela varredura: falha de rede de novo é handoff, MAS o corte do nosso
 * próprio orçamento numa chamada só lenta não é falha do provedor — reagenda uma vez.
 */
describe("depois da nova tentativa pela varredura", () => {
  it("chamada cortada pelo nosso tempo reagenda uma vez", () => {
    expect(MAX_DEFERRED_RETRIES).toBe(1);
    expect(afterRetryFailure(true, 0)).toBe("reschedule");
  });

  it("reagendada uma vez, a próxima falha é handoff", () => {
    expect(afterRetryFailure(true, 1)).toBe("handoff");
  });

  it("conexão morta ou 5xx na nova tentativa é handoff", () => {
    expect(afterRetryFailure(false, 0)).toBe("handoff");
  });
});

/**
 * A nova tentativa responde só a mensagem que falhou (code review, 2026-09-24). A mesma
 * função decide no começo da nova tentativa e de novo logo antes de mandar a resposta.
 */
describe("quando a nova tentativa desiste", () => {
  const msg = { id: "m1", created_at: "2026-09-24T10:00:00Z" };

  it("segue quando a mensagem que falhou ainda é a mais recente e nada saiu depois", () => {
    expect(retryIsMoot("m1", msg, null)).toBe(false);
    expect(retryIsMoot("m1", msg, "2026-09-24T09:59:00Z")).toBe(false);
  });

  it("desiste quando chegou mensagem nova — um turno novo é dono da resposta", () => {
    expect(retryIsMoot("m1", { id: "m2", created_at: "2026-09-24T10:01:00Z" }, null)).toBe(true);
  });

  it("desiste quando já saiu resposta depois dela, ou quando não há mensagem", () => {
    expect(retryIsMoot("m1", msg, "2026-09-24T10:00:30Z")).toBe(true);
    expect(retryIsMoot("m1", null, null)).toBe(true);
  });
});
