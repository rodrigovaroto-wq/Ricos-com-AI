import { describe, expect, it } from "vitest";
import {
  decideNext,
  rewriteInstruction,
  HOLDING_REPLY,
  MAX_REWRITES,
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
    expect(action.kind === "fallback" && action.reason).toContain("não passou na cadeia");
  });

  it("uma reescrita, não duas: o brief mora no prompt, não no laço", () => {
    expect(MAX_REWRITES).toBe(1);
    expect(decideNext(state({ rewritesUsed: 0 })).kind).toBe("rewrite");
    expect(decideNext(state({ rewritesUsed: 1 })).kind).toBe("fallback");
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
