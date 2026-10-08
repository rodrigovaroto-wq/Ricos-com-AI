/**
 * Hermes's initial history (operator, 2026-10-08): the audited real cases go into every run's bundle,
 * read right after the ledger, and carry no customer data.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const history = readFileSync("hermes/historico-inicial.md", "utf8");
const run = readFileSync("src/dev/hermes-run.ts", "utf8");
const skill = readFileSync("hermes/skills/encorpa-supervisor/SKILL.md", "utf8");

describe("o histórico inicial do Hermes", () => {
  it("vai no pacote de toda execução e é lido logo depois das decisões", () => {
    expect(run).toContain('cpSync(join(REPO, "hermes/historico-inicial.md"), join(bundle, "historico.md"));');
    expect(run).toContain("depois decisoes.md, historico.md,");
    expect(skill).toContain("`historico.md` — **leia logo depois de `decisoes.md`.**");
  });
  it("não carrega telefone, CPF nem CEP", () => {
    expect(history).not.toMatch(/\b\d{10,13}\b/);
    expect(history).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    expect(history).not.toMatch(/\b\d{5}-?\d{3}\b/);
  });
  it("traz a ordem de diagnóstico e os casos do grafo", () => {
    expect(history).toContain("**Primeiro a integração, depois o texto.**");
    for (const s of ["§65", "§66"]) expect(history).toContain(s);
  });
});
