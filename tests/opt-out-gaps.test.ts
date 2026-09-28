import { describe, expect, it } from "vitest";
import { classifyOptOut } from "../src/agent/guardrails.js";

/**
 * Found 2026-09-28 by the opt-in review (docs/agente-ia/05-plano/07-opt-in-marketing.md):
 * `silence_3` promises "é só me falar que eu não te mando mais nada", so the way she answers
 * it has to stop the agent. These plain requests to stop read as "none" today. Pinned with
 * `it.fails` because the fix is in `guardrails.ts`, which the open PR #37 rewrites; the day
 * the classifier catches one, its line turns red and moves to a plain `it`.
 *
 * Any fix is a text heuristic: it goes through `pnpm dev:gates` and a second review, and the
 * negation controls below must keep reading "none" (`.claude/memory/negation-blindness.md`).
 */
describe("opt-out: pedidos de parar que hoje passam em branco", () => {
  it.fails.each(["não quero mais promoção", "não quero receber mais mensagens", "chega de mensagem"])(
    "%s deveria parar a agente",
    (text) => {
      expect(classifyOptOut(text)).not.toBe("none");
    },
  );

  it.each(["não quero mais o M, quero o G", "não quero mais esperar, fecha o pedido", "chega de dúvida, vou levar"])(
    "controle de negação: %s continua none",
    (text) => {
      expect(classifyOptOut(text)).toBe("none");
    },
  );
});
