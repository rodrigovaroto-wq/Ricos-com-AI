/**
 * Measures Jev on the Portuguese gold set (P2.4) and writes the questions that pass the operator's 90% to
 * `hermes/jev-aprovadas.json` — the only questions a Hermes run asks. Rerun after changing an instruction, the model or the set.
 *
 *   TYPESAFE_API_KEY=… pnpm jev:avaliar            # writes hermes/jev-aprovadas.json and hermes/jev-avaliacao.md
 *
 * The gold set (`hermes/jev-ouro.json`) is synthetic: persona conversations of the audit, labeled by Claude against the rubric
 * of 2026-10-22, plus 80 items written for the questions the transcripts had too few "sim" for (`fonte: escrito`), checked by the operator
 * on a sample of 30 (`hermes/jev-ouro-amostra.md`). Cost: 230 items × 2 calls, a few cents; capped at US$ 0.15.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { JevBudget, JEV_MODEL, askJev, type JevAnswer } from "./jev.js";
import { approvedFile, renderGold, scoreGold, type GoldItem } from "./jev-gold.js";
import { AUDIT, INBOUND, MISSED, inboundState, replyState } from "./jev-questions.js";

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error("jev:avaliar precisa de TYPESAFE_API_KEY");
const items = JSON.parse(readFileSync("hermes/jev-ouro.json", "utf8")) as GoldItem[];
const budget = new JevBudget();
const answers: Record<string, Record<string, JevAnswer>> = {};
let model = JEV_MODEL;
for (const item of items) {
  const x = { ...item, mensagem: 0 };
  const [a, b] = await Promise.all([
    askJev(inboundState(x), INBOUND, { apiKey, budget }),
    askJev(replyState(x), { ...AUDIT, ...MISSED }, { apiKey, budget }),
  ]);
  if (a?.model) model = a.model;
  answers[item.id] = { ...(a?.answers ?? {}), ...(b?.answers ?? {}) };
}
const scores = scoreGold(items, answers);
const report = renderGold(scores, { model, items: items.length, costUsd: budget.spentUsd });
writeFileSync("hermes/jev-avaliacao.md", `${report}\n`);
// The pinned id, not the API's spelling of it: `approvedOf` compares with JEV_MODEL (code review).
if (model !== JEV_MODEL) console.warn(`jev: a API respondeu como ${model}; as aprovadas ficam para ${JEV_MODEL}, o fixado`);
writeFileSync("hermes/jev-aprovadas.json", `${JSON.stringify(approvedFile(scores, JEV_MODEL, new Date().toISOString()), null, 2)}\n`);
console.log(report);
console.log(`\nchamadas ${budget.calls} · recusadas pelo teto ${budget.refused}`);
