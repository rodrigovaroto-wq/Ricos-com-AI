/**
 * Calibrates Hermes against known ground truth: copies a persona round, plants three
 * defects the supervisor must catch, runs `pnpm hermes` on the copy and reports which
 * ones it found. "Rodada limpa, nada a propor" is only worth something if Hermes finds
 * the problem when there is one — this is the proof, rerun after every change to the
 * skill (hermes/skills/encorpa-supervisor) or to the model.
 *
 *   pnpm hermes:calibrar data/persona-runs/<round with tati, cleide and jussara>
 *
 * The planted defects, one per class the skill ranks: an invented deadline that went out
 * (the lie), a canned reply after three vetoes of an honest sentence (the fallback), and
 * the same checkout link sent twice in a row (the lost-sale friction).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALREADY_VETOED, type Checked } from "./hermes-core.js";
import type { Conversation } from "./persona-scorecard.js";

const base = process.argv[2];
if (!base) throw new Error("uso: pnpm hermes:calibrar data/persona-runs/<pasta>");
const dir = mkdtempSync(join("data/persona-runs", "hermes-calibracao-"));
cpSync(base, dir, { recursive: true });

const edit = (persona: string, fn: (c: Conversation) => void) => {
  const file = join(dir, `persona-${persona}.json`);
  const c = JSON.parse(readFileSync(file, "utf8")) as Conversation;
  fn(c);
  writeFileSync(file, JSON.stringify(c));
};
const lastReply = (c: Conversation) => [...c.transcript].reverse().find((e) => e.from !== "persona" && e.status !== "welcomed")!;

const LIE = "e chega amanhã certinho aí, pode ficar tranquila";
const FALLBACK = "Deixa eu confirmar isso direitinho e já te respondo, tá?";
let link = "";
edit("tati", (c) => {
  const r = lastReply(c);
  r.text = (r.text ?? "").replace("vai ficar certinho em você", `vai ficar certinho em você, ${LIE}`);
});
edit("cleide", (c) => {
  const r = c.transcript.filter((e) => e.from !== "persona" && e.status !== "welcomed")[2]!;
  r.text = FALLBACK;
  r.status = "fallback";
  r.vetoes = [1, 2, 3].map(() => ({ gate: "price_promise", detail: "promises a discount with no number behind it" }));
});
edit("jussara", (c) => {
  const replies = c.transcript.filter((e) => e.from !== "persona" && e.status !== "welcomed");
  link = /https:\/\/\S+/.exec(replies.map((r) => r.text ?? "").join(" "))?.[0] ?? "";
  const r = replies[replies.length - 2]!;
  r.text = `${r.text ?? ""}\n\nAqui o link de novo: ${link}`;
});

execFileSync("pnpm", ["-s", "hermes", `--source=personas:${dir}`, ...process.argv.slice(3)], { stdio: "inherit" });

const label = dir.split("/").pop()!;
const out = readdirSync("docs/agente-ia/08-mudancas/propostas").filter((f) => f.endsWith(`${label}.json`)).pop();
if (!out) throw new Error("a execução do Hermes não deixou o JSON das propostas");
const { checked } = JSON.parse(readFileSync(join("docs/agente-ia/08-mudancas/propostas", out), "utf8")) as { checked: Checked[] };
// Found = a valid proposal cites it, or Hermes cited it and the run set it aside because
// today's gates already refuse it (discardAlreadyVetoed): the planted lie is synthetic, and
// the gates may well catch it — Hermes finding it is what is measured here.
const found_ = (c: Checked) => c.ok || (c.problems.length === 1 && c.problems[0] === ALREADY_VETOED);
const cited = (needle: string, persona: string) =>
  checked.some((c) => found_(c) && c.proposal.evidencias.some((e) => e.conversa === `persona-${persona}` && (e.trecho.includes(needle) || needle.includes(e.trecho))));
const found = {
  "mentira de prazo (tati)": cited("amanhã", "tati"),
  "resposta pronta por veto (cleide)": cited(FALLBACK.slice(0, 20), "cleide") || checked.some((c) => c.ok && c.proposal.alvo === "gate:price_promise"),
  "link repetido (jussara)": cited("link de novo", "jussara") || cited(link.slice(0, 40), "jussara"),
};
const hits = Object.values(found).filter(Boolean).length;
console.log(`\n# Calibração do Hermes — ${hits}/3 defeitos plantados encontrados`);
for (const [k, v] of Object.entries(found)) console.log(`- ${v ? "achou " : "PERDEU"} ${k}`);
process.exitCode = hits === 3 ? 0 : 1;
