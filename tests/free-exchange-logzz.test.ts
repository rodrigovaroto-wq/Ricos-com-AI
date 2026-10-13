/**
 * Operator, 2026-10-13: the size exchange and the return go through the Logzz support, at no cost to her.
 * `returns.freeExchange` is OPTIONAL — absent from the `BUSINESS_CONFIG` secret, R17.1's veto stands (the
 * absent key reads as today's truth). Only an explicit `true` lets "a troca é sem custo" through.
 */
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates, type GateConfig } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const free: GateConfig = { ...config, returns: { freeExchange: true } };
const off: GateConfig = { ...config, returns: { freeExchange: false } };
const blocks = (text: string, c: GateConfig, paymentPath: "cod" | "prepay" = "cod") =>
  runGates(text, ctx({ config: c, paymentPath })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const TRUE_WITH_FLAG = [
  "A troca é sem custo pra você.",
  "Trocar o tamanho não custa nada.",
  "A Logzz faz a troca sem custo.",
  "A troca é grátis.",
  "Você tem 7 dias pra trocar ou devolver, sem custo nenhum.",
];

describe("troca sem custo pela Logzz (returns.freeExchange)", () => {
  it.each(TRUE_WITH_FLAG)("com true passa: %s", (s) => expect(blocks(s, free)).toEqual([]));
  it.each(TRUE_WITH_FLAG)("ausente continua vetada: %s", (s) => expect(blocks(s, config)).toContain("warranty_promise"));
  it.each(TRUE_WITH_FLAG)("false continua vetada: %s", (s) => expect(blocks(s, off)).toContain("warranty_promise"));

  it.each([
    "A troca é grátis em qualquer prazo.",
    "Troca grátis em até 30 dias.",
    "A troca é sem custo e sem prazo.",
    "Pode trocar quantas vezes quiser, sem custo.",
    // v20 review: the unlimited warranty, vetoed with and without the flag
    "A troca é sem custo, a qualquer momento.",
    "A troca é grátis quantas vezes precisar.",
    "Pode trocar à vontade, sem custo.",
    "A troca é grátis mesmo depois de usada.",
    "Pode trocar a qualquer hora.",
    "Não se preocupa, pode trocar a qualquer momento.",
    "Pode trocar a qualquer momento, não tem problema.",
    "A troca é grátis mesmo usada, não tem problema.",
  ])("a mentira de prazo continua vetada: %s", (s) => {
    expect(blocks(s, free)).toContain("warranty_promise");
    expect(blocks(s, config)).toContain("warranty_promise");
  });

  it.each([
    "Fique à vontade pra me chamar a qualquer momento.",
    "Pode me chamar a qualquer hora, tô aqui.",
    "Não dá pra trocar a qualquer momento, só em até 7 dias.",
    "Depois de usado não dá pra trocar.",
    "Fique à vontade pra trocar em até 7 dias.",
    "Mesmo usada não dá pra trocar.",
    "Você fica com a peça só até devolver, aí o dinheiro volta.",
    "No reembolso o dinheiro volta, e se preferir trocar você fica com o colete novo.",
  ])("com true, o honesto passa: %s", (s) => expect(blocks(s, free)).not.toContain("warranty_promise"));

  it("'frete' da troca segue com o shipping_promise, que esta mudança não toca", () => {
    expect(blocks("O frete da troca é por nossa conta.", free)).toContain("shipping_promise");
  });

  it("com true o frete grátis da compra no antecipado continua com o shipping_promise", () => {
    expect(blocks("No pix o frete é grátis.", free, "prepay")).toContain("shipping_promise");
  });

  it.each(["Você devolve e recebe o dinheiro de volta e fica com o colete.", "A gente devolve o dinheiro e você fica com o colete."])(
    "com true, o reembolso sem devolver a peça continua vetado: %s",
    (s) => {
      expect(blocks(s, free).length).toBeGreaterThan(0);
      expect(blocks(s, config).length).toBeGreaterThan(0);
    },
  );

  it.each(["No reembolso você não fica com o colete, ele volta pra gente.", "Devolve o colete e o dinheiro volta pra você."])("o reembolso honesto passa: %s", (s) => expect(blocks(s, free)).toEqual([]));
  it.each(["A troca não é grátis.", "A troca de tamanho tem custo."])("com true, a negação não vira veto de troca: %s", (s) =>
    expect(blocks(s, free)).not.toContain("warranty_promise"),
  );

  it("o briefing segue o config, e passa a cadeia", () => {
    const line = (c: GateConfig) => gateBriefing(c).find((l) => /troca/i.test(l) && /devol/i.test(l))!;
    expect(line(free)).toMatch(/sem custo/);
    expect(line(free)).not.toMatch(/por conta dela/);
    expect(line(config)).toMatch(/por conta dela/);
    expect(blocks("A troca de tamanho, pela Logzz, também é sem custo pra ela.", free)).toEqual([]);
  });
});
