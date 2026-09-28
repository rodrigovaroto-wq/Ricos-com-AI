import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
import { renderFollowup, type StopPoint } from "../src/agent/followups.js";
import { acceptsMarketingOptIn, optInQuestion } from "../src/agent/opt-in.js";
import { config, ctx as gateCtx } from "./fixtures.js";

const brand = config.brand;
const asked = `Oi! Ficou alguma dúvida sobre o colete?\n\n${optInQuestion(brand)}`;

describe("opt-in de marketing: a pergunta", () => {
  it("cita a marca e não promete cupom", () => {
    expect(optInQuestion(brand)).toContain("Encorpa");
    expect(optInQuestion(brand)).not.toMatch(/cupom|desconto|%/i);
  });

  // The line rides on the ruler's first touch; the sweep gates the whole text. Every
  // stop point and both variants, as the sweep would send them.
  it.each(["before_size", "after_price", "link_sent"] as StopPoint[])("junto do silence_1 (%s) passa a cadeia de gates", (stopPoint) => {
    for (const leadId of ["lead-0", "lead-1", "lead-2", "lead-3"]) {
      const touch = renderFollowup("silence_1", { leadId, config, stopPoint, now: new Date("2026-09-10T10:00:00") })!;
      const text = `${touch}\n\n${optInQuestion(brand)}`;
      const result = runGates(text, gateCtx({ now: new Date("2026-09-10T10:00:00"), stage: "presale" }));
      expect(result.traces.filter((t) => t.verdict === "block"), `${stopPoint}/${leadId}`).toEqual([]);
    }
  });
});

describe("opt-in de marketing: a resposta", () => {
  it.each(["sim", "Sim!", "SIM 💛", "siiim", "pode", "Pode sim", "pode mandar", "quero", "claro", "aceito", "s", "Sim, pode."])(
    "sim explícito: %s",
    (reply) => {
      expect(acceptsMarketingOptIn(reply, asked, brand)).toBe(true);
    },
  );

  it.each([
    "não",
    "nao",
    "não obrigada",
    "agora não",
    "pode não",
    "sim, mas não quero oferta",
    "sim, só o pedido",
    "não precisa",
    "melhor não",
    "talvez",
    "depois eu vejo",
    "pode ser",
    "ok",
    "sim?",
    "pode mandar o quê?",
    "quero o M",
    "sim, quero o G",
    "",
  ])("não é sim: %j", (reply) => {
    expect(acceptsMarketingOptIn(reply, asked, brand)).toBe(false);
  });

  it("sim sem a pergunta antes não grava nada", () => {
    expect(acceptsMarketingOptIn("sim", null, brand)).toBe(false);
  });

  it("sim a outra pergunta da agente, depois da de opt-in, não é consentimento", () => {
    expect(acceptsMarketingOptIn("sim", "Perfeito! Então fica o M, certo?", brand)).toBe(false);
  });

  it("a pergunta de outra marca não vale", () => {
    expect(acceptsMarketingOptIn("sim", `Oi!\n\n${optInQuestion("Outra")}`, brand)).toBe(false);
  });
});
