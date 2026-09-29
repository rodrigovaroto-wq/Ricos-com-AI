import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import type { BusinessConfig } from "@/config/business.js";
import { ctx } from "./fixtures.js";

/**
 * Operator, 2026-09-29 (R16.6, R16.7): the vest helps with posture while worn — say it, it adds
 * value — but never that it corrects or treats anything; and the site's testimonials section is
 * mentioned only when she asks for testimonials.
 */
const config = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const blocked = (text: string, paymentPath: "cod" | "prepay") =>
  runGates(text, ctx({ config, paymentPath })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("postura: agrega valor sem virar tratamento", () => {
  it.each([
    "Além de modelar, ele ajuda na postura.",
    "Ele dá apoio à postura enquanto você está com ele.",
    "Ele segura a postura e deixa a roupa caindo melhor.",
    // The honest denial next to the value.
    "Ele não corrige a postura, mas ajuda enquanto está vestido.",
  ])("passa: %s", (text) => {
    for (const p of ["cod", "prepay"] as const) expect(blocked(text, p)).not.toContain("health_claim");
  });
  it.each([
    "Ele corrige a postura.",
    "Ele melhora a postura.",
    "Ele trata a dor nas costas.",
    "Ajuda na postura e cura a dor na coluna.",
  ])("veta: %s", (text) => {
    for (const p of ["cod", "prepay"] as const) expect(blocked(text, p)).toContain("health_claim");
  });
  it("o prompt ensina a frase e o briefing a permite", () => {
    const prompt = systemPrompt(config, gateBriefing(config), null);
    expect(prompt).toContain(`"além de modelar, ele ajuda na postura"`);
    expect(blocked("Além de modelar, ele ajuda na postura.", "cod")).toEqual([]);
    expect(gateBriefing(config).join(" ")).toMatch(/ajuda na postura/);
  });
});

describe("depoimentos: só quando ela pedir", () => {
  it("o prompt e o briefing limitam a seção de depoimentos ao pedido dela", () => {
    const prompt = systemPrompt(config, gateBriefing(config), null);
    expect(prompt).toMatch(/Só fale\s+dos depoimentos quando ela pedir/);
    expect(gateBriefing(config).join(" ")).toMatch(/Quando ela pedir depoimento, e só então/);
    expect(prompt).not.toMatch(/Você pode indicar os depoimentos no nosso site, na seção de depoimentos\./);
  });
});
