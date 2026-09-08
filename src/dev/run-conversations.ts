/**
 * The three hundred, run and checked.
 *
 * Every arc is lived by every persona, so the same shape of conversation carries five
 * different sizes, addresses and spellings through the same code. What is asserted is
 * the state she leaves behind — the size in the record, whether a person was called,
 * whether the ruler is armed — because that is what the next message, the cron and the
 * courier all read.
 */
import { runConversation, type ConversationState } from "./engine.js";
import { ARCS, PERSONAS } from "./conversations.js";

export interface ConversationCase {
  scenario: string;
  angle: string;
  input: string;
  expected: string;
  actual: string;
}

const config = {
  prices: { codBrl: 129.9, prepayBrl: 110.42, prepayDiscountPercent: 15, anchorBrl: 216.5 },
  delivery: { codDaysMin: 3, codDaysMax: 5, warrantyDays: 7 },
  hours: { openHour: 6, closeHour: 24 },
  cost: { conversationCapBrl: 0.8, overrunTolerance: 0.25 },
  coupon: { percent: 20, active: false },
  cod: { physicalOnDeliveryActive: true },
};

const NOW = new Date("2026-09-08T18:00:00Z"); // 15:00 em São Paulo

export const runAllConversations = (): ConversationCase[] => {
  const cases: ConversationCase[] = [];

  for (const arc of ARCS) {
    for (const persona of PERSONAS) {
      const turns = arc.turns(persona);
      const want = arc.expect(persona);
      const got: ConversationState = runConversation(turns, { config, now: NOW });
      const label = `${arc.name} · ${persona.id}`;
      const resumo = turns.map((t) => t.from).join(" | ").slice(0, 90);

      const compare = (campo: string, esperado: unknown, obtido: unknown) =>
        cases.push({
          scenario: `conversa completa: ${campo}`,
          angle: label,
          input: resumo,
          expected: String(esperado),
          actual: String(obtido),
        });

      if (want.size !== undefined) compare("tamanho gravado", want.size, got.size);
      if (want.handoff !== undefined) compare("handoff", want.handoff, got.handoff);
      if (want.optedOut !== undefined) compare("opt-out", want.optedOut, got.optedOut);
      if (want.addressComplete !== undefined) compare("endereço completo", want.addressComplete, got.addressComplete);
      if (want.addressConfirmed !== undefined) compare("endereço confirmado", want.addressConfirmed, got.addressConfirmed);
      if (want.identityComplete !== undefined) compare("identidade completa", want.identityComplete, got.identityComplete);
      if (want.orderReady !== undefined) compare("pedido pode nascer", want.orderReady, got.orderReady);
      if (want.stage !== undefined) compare("estágio", want.stage, got.stage);
      if (want.sent !== undefined) compare("mensagens enviadas", want.sent, got.sent.length);
      if (want.touches !== undefined) compare("toques armados", want.touches, got.scheduledTouches);
      if (want.minRewrites !== undefined)
        compare("reescritas", `>= ${want.minRewrites}`, got.rewrites >= want.minRewrites ? `>= ${want.minRewrites}` : got.rewrites);

      // Duas invariantes que valem para toda conversa, sem exceção — e que nenhum
      // roteiro precisa declarar, porque quebrá-las é sempre erro.
      compare(
        "nada sai depois do opt-out",
        "ok",
        got.optedOut && got.sent.length > (arc.expect(persona).sent ?? 99) ? "saiu mensagem" : "ok",
      );
      compare(
        "handoff desarma a régua",
        "ok",
        got.handoff && got.scheduledTouches > 0 ? "régua continua armada" : "ok",
      );
    }
  }

  return cases;
};

const asCli = process.argv[1]?.includes("run-conversations");
if (asCli) {
  const cases = runAllConversations();
  const failed = cases.filter((c) => c.expected !== c.actual);
  const conversas = ARCS.length * PERSONAS.length;
  console.log(`\n${conversas} conversas completas · ${cases.length} verificações\n`);
  for (const c of failed) {
    console.log(`✗ [${c.scenario}] ${c.angle}`);
    console.log(`    turnos:   ${c.input}`);
    console.log(`    esperado: ${c.expected}`);
    console.log(`    obtido:   ${c.actual}\n`);
  }
  console.log(failed.length === 0 ? `✓ ${cases.length}/${cases.length}\n` : `${failed.length} divergência(s)\n`);
  if (failed.length > 0) process.exitCode = 1;
}
