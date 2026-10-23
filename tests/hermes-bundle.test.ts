/**
 * The Hermes bundle in two files (cost cut of 2026-10-22): the first production run cost US$ 1.82 for 43 conversations, because
 * Hermes read ~60 files one by one and each read re-sent the context before it (25 calls, 1.48 M tokens). Measured on the same 43
 * synthetic conversations: 8 calls, 291 k tokens.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLE_ORDER, bundlePack, registrySummary, renderConversation } from "@/dev/hermes-core.js";

describe("bundlePack: um pacote.md, na ordem de leitura da skill", () => {
  it("cada arquivo vira uma seção com o nome; a ordem é a da skill, o prompt por último", () => {
    const md = bundlePack({ "prompt.md": "P", "reverter.md": "R", "decisoes.md": "D" });
    expect(md.indexOf("# arquivo: reverter.md")).toBeLessThan(md.indexOf("# arquivo: decisoes.md"));
    expect(md.indexOf("# arquivo: decisoes.md")).toBeLessThan(md.indexOf("# arquivo: prompt.md"));
    expect(BUNDLE_ORDER.at(-1)).toBe("prompt.md");
    expect(BUNDLE_ORDER[0]).toBe("reverter.md");
  });
  it("arquivo ausente não deixa seção vazia", () => {
    expect(bundlePack({ "placar.md": "x" })).toBe("# arquivo: placar.md\n\nx\n");
  });
});

describe("registrySummary: título e estado de cada entrada", () => {
  it("o registro real encolhe e guarda toda entrada M-xx com o seu estado", () => {
    const full = readFileSync("docs/agente-ia/08-mudancas/registro.md", "utf8");
    const short = registrySummary(full);
    const ids = [...full.matchAll(/^### (M-\d+)/gm)].map((m) => m[1]);
    for (const id of ids) expect(short).toContain(`### ${id}`);
    expect(short.length).toBeLessThan(full.length / 3);
    expect(short).toContain("- **Estado:**");
  });
});

describe("a recepção automática encurtada (texto fixo)", () => {
  it("passa de 120 caracteres: corta e avisa; a resposta da Malu fica inteira", () => {
    const long = "Olá! ".repeat(60);
    const md = renderConversation({ persona: "c", transcript: [{ from: "persona", text: "oi" }, { from: "valen", status: "welcomed", text: long }, { from: "valen", text: "Qual o número da calça? ".repeat(10) }] });
    expect(md).toContain("… (texto fixo, cortado)");
    expect(md).toContain("Qual o número da calça? ".repeat(10).trim());
  });
});

describe("o runner manda dois arquivos ao Hermes", () => {
  const run = readFileSync("src/dev/hermes-run.ts", "utf8");
  it("pacote.md e conversas.md, e o pedido diz para ler cada um uma vez", () => {
    expect(run).toContain('writeFileSync(join(bundle, "pacote.md"), bundlePack(context));');
    expect(run).toContain('writeFileSync(join(bundle, "conversas.md"), [...rendered.values()].join("\\n---\\n\\n"));');
    expect(run).toContain("Leia pacote.md inteiro");
    expect(run).toContain("registrySummary(readFileSync(");
  });
  it("a skill sabe dos dois arquivos", () => {
    const skill = readFileSync("hermes/skills/encorpa-supervisor/SKILL.md", "utf8");
    expect(skill).toContain("**Dois arquivos, uma leitura de cada**");
  });
});
