/**
 * Every persona at once (operator, 2026-10-15: all of them, at the same time, minimum time and machine): the safety personas,
 * the venda buyers and the coverage cards, each suite its own `dev:personas` process sharing nothing but the door. A
 * conversation waits on the models, so the run takes about the longest conversation. Extra flags go to every suite
 * (`--door=local`, `--max-turns=12`, `--budget-brl=5` — the budget is per suite).
 *
 *   NODE_USE_ENV_PROXY=1 pnpm dev:personas:todas --door=local --max-turns=12
 */
import { spawn } from "node:child_process";

const extra = process.argv.slice(2);
const SUITES: ReadonlyArray<[string, string[]]> = [
  ["cobertura", ["--suite=cobertura", "--concurrency=13"]],
  ["segurança", ["--all", "--concurrency=7"]],
  ["venda", ["--suite=venda", "--concurrency=8"]],
];

const codes = await Promise.all(
  SUITES.map(
    ([label, flags]) =>
      new Promise<number>((done) => {
        const child = spawn("pnpm", ["-s", "dev:personas", ...flags, ...extra], { stdio: ["ignore", "pipe", "inherit"] });
        child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk.toString().replace(/^(?=.)/gm, `[${label}] `)));
        child.on("close", (code) => done(code ?? 1));
      }),
  ),
);
if (codes.some((c) => c !== 0)) process.exitCode = 1;
