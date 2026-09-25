/**
 * Mechanical verdict diff for the gates: runs the gate chain of a base commit and of the
 * working tree over the same corpus, and lists every sentence whose verdict changed.
 *
 *   pnpm dev:gates                       # base = merge-base with origin/main
 *   pnpm dev:gates --base=<ref>          # any commit
 *   pnpm dev:gates --fail-on-loosen      # CI: exit 1 on an unaccepted block → pass
 *
 * WHY. Every gate fix in this repository opened a new hole, and each hole was found by
 * a second reviewer doing this comparison by hand ("before: block, after: pass") —
 * M-01 took six rounds, M-05 four, M-06 two (`.claude/memory/negation-blindness.md`).
 * A loosening that no one compared is how an invented deadline or a discount with no
 * number reaches a customer; a tightening no one compared is how an honest sentence
 * falls to the canned reply. The machine now does the comparison on every change, over
 * every sentence anyone ever wrote a test for, and the reviewer reads the list.
 *
 * CORPUS. Every string literal of 3+ words in tests/*.test.ts, every line of
 * tests/gate-corpus.txt (sentences found by reviewers, lies and honest alike), and —
 * locally — every Malu reply in data/persona-runs (git-ignored). Each sentence runs on
 * both payment paths, region known and unknown, under three configs (the test one, free
 * shipping, and a 10% prepaid discount, the production shape).
 *
 * ACCEPTING A LOOSENING. A block → pass that is the point of the change (M-05 freed
 * "tiro mais alguma dúvida") goes into tests/gate-loosen-accepted.txt as
 * `<entry> | <gate> | <sentence>`. Anything else fails CI.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as current from "../agent/guardrails.js";
import { config, configGratis, ctx } from "../../tests/fixtures.js";
import type { BusinessConfig } from "../config/business.js";

type Gates = typeof current;
type Verdict = "pass" | "block" | "warn";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const failOnLoosen = args.includes("--fail-on-loosen");
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();

async function loadBase(ref: string): Promise<Gates> {
  const dir = mkdtempSync(join(tmpdir(), "gate-diff-"));
  const file = join(dir, "guardrails.ts");
  writeFileSync(file, git("show", `${ref}:src/agent/guardrails.ts`));
  try {
    return (await import(pathToFileURL(file).href)) as Gates;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** String literals of three words or more — the sentences the tests already care about. */
export function literals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.){12,})"|'((?:[^'\\\n]|\\.){12,})'|`([^`$\\]{12,})`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\(["'\\])/g, "$1");
    if (s.trim().split(/\s+/).length >= 3) out.push(s);
  }
  return out;
}

function personaReplies(root = "data/persona-runs"): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".json")) {
        try {
          const j = JSON.parse(readFileSync(p, "utf8")) as { transcript?: { from: string; text?: string }[] };
          for (const t of j.transcript ?? []) if (t.from !== "persona" && t.text) out.push(t.text);
        } catch {
          /* not a conversation file */
        }
      }
    }
  };
  walk(root);
  return out;
}

export function corpus(): string[] {
  const set = new Set<string>();
  for (const f of readdirSync("tests").filter((f) => f.endsWith(".test.ts")))
    for (const s of literals(readFileSync(join("tests", f), "utf8"))) set.add(s);
  if (existsSync("tests/gate-corpus.txt"))
    for (const line of readFileSync("tests/gate-corpus.txt", "utf8").split("\n"))
      if (line.trim() && !line.startsWith("#")) set.add(line.trim());
  for (const s of personaReplies()) set.add(s);
  return [...set];
}

const discount10: BusinessConfig = {
  ...config,
  prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
};
const configs = { teste: config, gratis: configGratis, desconto10: discount10 } as const;
const contexts = Object.entries(configs).flatMap(([name, c]) =>
  (["cod", "prepay"] as const).flatMap((paymentPath) =>
    [true, false].map((regionKnown) => ({
      label: `${name}/${paymentPath}/${regionKnown ? "regiao" : "sem-regiao"}`,
      ctx: ctx({ config: c, paymentPath, regionKnown }),
    })),
  ),
);

const verdicts = (g: Gates, text: string, c: (typeof contexts)[number]["ctx"]) =>
  new Map<string, Verdict>(g.runGates(text, c).traces.map((t) => [t.gate, t.verdict as Verdict]));

export interface Flip {
  gate: string;
  from: Verdict;
  to: Verdict;
  sentence: string;
  contexts: string[];
}

export function diff(base: Gates, head: Gates, sentences: string[]): Flip[] {
  const flips = new Map<string, Flip>();
  for (const sentence of sentences)
    for (const { label, ctx: c } of contexts) {
      const before = verdicts(base, sentence, c);
      const after = verdicts(head, sentence, c);
      for (const gate of new Set([...before.keys(), ...after.keys()])) {
        const from = before.get(gate) ?? "pass";
        const to = after.get(gate) ?? "pass";
        if (from === to) continue;
        const key = `${gate}|${from}|${to}|${sentence}`;
        const f = flips.get(key) ?? { gate, from, to, sentence, contexts: [] };
        f.contexts.push(label);
        flips.set(key, f);
      }
    }
  return [...flips.values()];
}

const loosens = (f: Flip) => f.from === "block" && f.to !== "block";

function accepted(): Set<string> {
  const p = "tests/gate-loosen-accepted.txt";
  if (!existsSync(p)) return new Set();
  return new Set(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => l.split("|").slice(1).map((x) => x.trim()).join("|")),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseRef = flag("base") ?? git("merge-base", "HEAD", "origin/main");
  const sentences = corpus();
  const flips = diff(await loadBase(baseRef), current, sentences);
  const ok = accepted();
  const loose = flips.filter(loosens);
  const unaccepted = loose.filter((f) => !ok.has(`${f.gate}|${f.sentence}`));
  const tight = flips.filter((f) => !loosens(f));

  console.log(`# Diff de vereditos — base ${baseRef.slice(0, 7)} → árvore de trabalho`);
  console.log(`${sentences.length} frases × ${contexts.length} contextos\n`);
  console.log(`## Afrouxou (veto → passa): ${loose.length} (${unaccepted.length} sem aceite)`);
  for (const f of loose)
    console.log(`${ok.has(`${f.gate}|${f.sentence}`) ? "  aceita " : "  NOVA   "} [${f.gate}] ${f.sentence}  (${f.contexts.length} ctx)`);
  console.log(`\n## Endureceu (passa → veto/aviso): ${tight.length}`);
  for (const f of tight) console.log(`  [${f.gate}] ${f.from}→${f.to} ${f.sentence}  (${f.contexts.length} ctx)`);
  if (failOnLoosen && unaccepted.length) process.exitCode = 1;
}
