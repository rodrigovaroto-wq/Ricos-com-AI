/**
 * Residuals of the v20 review (operator, 2026-10-13: "a agente não deve prometer prazo"; the warranty is 7 days only).
 * (a) `delivery_promise`, same-day/next-day: a "que" after a reassurance and a dash did not cut the promise's clause,
 *     so the "não" before it read as its denial — "Não se preocupa que chega amanhã", "Não sei - chega amanhã".
 * (b) `warranty_promise`: the contact exemption ("me chama a qualquer momento") took any verb after "a gente", and
 *     "a gente resolve a qualquer momento" in a sentence about the exchange passed.
 */
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

const blocks = (text: string, paymentPath: "cod" | "prepay", regionKnown: boolean) =>
  runGates(text, ctx({ paymentPath, regionKnown })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const CTXS = [
  ["cod", false],
  ["cod", true],
  ["prepay", false],
  ["prepay", true],
] as const;

describe("delivery_promise: 'que' after a reassurance, dashes and the colon cut the promise's clause", () => {
  it.each([
    "Não se preocupa que chega amanhã.",
    "Não sei - chega amanhã.",
    "Não esquenta que chega amanhã.",
    "Fica tranquila que chega amanhã sim.",
    "Pode ficar tranquila que chega amanhã.",
    "Relaxa que chega amanhã.",
    "Não precisa se preocupar - chega amanhã.",
    "Não precisa se preocupar – chega amanhã.",
    "Não precisa se preocupar — chega amanhã.",
    "Nada disso: chega amanhã.",
    "Não se preocupe que você recebe hoje.",
    "Não esquenta que você recebe amanhã.",
    "Não sei — chega hoje.",
    "Não tem problema que chega amanhã.",
    "Não precisa ter medo que chega amanhã.",
    "Não se preocupa que eu garanto que chega amanhã.",
    "Chegar até sexta eu não consigo garantir - chega amanhã.",
    // The exception needs the denial right before the verb: these deny nothing about the arrival.
    "Não precisa nem ver que chega amanhã.",
    "Não vou mentir que chega amanhã.",
    "Não nego que chega amanhã.",
    "Não duvido que chega amanhã.",
    "Não tenho dúvida que chega amanhã.",
    "Não se preocupa que eu garanto pra você que chega amanhã.",
    "Não esquenta que eu te confirmo que chega amanhã.",
    // An "e" right before the arrival verb cuts the clause too.
    "Não demora nada e chega amanhã.",
    "Não demora e você recebe amanhã.",
    "Não leva nada e chega hoje.",
    "Não atrasa e chega amanhã.",
    "Não demora e já chega amanhã.",
    // The other branches, same constructions (already vetoed; kept so they stay that way).
    "Não se preocupa que chega na quinta.",
    "Não esquenta que chega na sexta.",
    "Não sei - chega na quinta.",
    "Nada disso: chega na quinta.",
    "Não precisa se preocupar — chega na sexta.",
    "Fica tranquila que chega na quinta sim.",
    "Não se preocupa que chega em 5 dias.",
    "Não sei - chega em 5 dias.",
    "Nada disso: chega em 1 a 5 dias.",
    "Não precisa se preocupar — chega de 2 a 6 dias.",
    "Não se preocupa que chega em uma semana.",
    // v21 review: the span stopped past a denied first verb and swallowed the promising second one.
    "Não sei dizer quando chega, mas chega amanhã.",
    "Não tem como não chegar amanhã, chega amanhã.",
    "Não sei quando entrega, mas você recebe amanhã.",
    "Não consigo garantir quando chega e se chega hoje, mas recebe amanhã.",
    // The spans are read as before: the nearest verb alone loosened these (second review of the residuals).
    "A entrega não demora pois chega amanhã.",
    "A entrega não falha chega amanhã.",
    "Entrega não cobra nada chega amanhã.",
    "Recebe não importa onde chega amanhã.",
    "Não sei quando chega. Chega amanhã.",
  ])("veta: %s", (t) => {
    for (const [p, rk] of CTXS) expect(blocks(t, p, rk)).toContain("delivery_promise");
  });

  it.each([
    "Não chega amanhã, leva de 1 a 3 dias úteis.",
    "Não consigo garantir que chega amanhã.",
    "Não posso te garantir que chega amanhã, depende da região.",
    "Infelizmente não chega amanhã.",
    "Não acho que chega amanhã, o prazo é de 1 a 3 dias.",
    "Não tenho certeza de que chega amanhã.",
    "Não dá pra dizer que chega amanhã.",
    "Não te prometo que chega amanhã.",
    "Não chega amanhã — leva de 1 a 3 dias úteis.",
    "Não sei se chega amanhã, depende da região.",
    "Não consigo garantir que chega na quinta-feira.",
    // /code-review: any denied knowing, saying or guaranteeing takes its "que".
    "Não posso assegurar que chega amanhã.",
    "Não tenho como informar que chega amanhã.",
    "Não dá pra cravar que chega amanhã.",
    "Não sei dizer que chega amanhã.",
    "Não sei dizer se chega amanhã.",
    "Não consigo te falar que chega amanhã.",
    "Não posso afirmar com certeza que chega amanhã.",
    "Não tem como eu te garantir que chega amanhã.",
    "Não consigo prever que chega amanhã.",
    "Não consigo confirmar que chega amanhã.",
    "Não é verdade que chega amanhã.",
    "Não chega amanhã e nem hoje, leva de 1 a 3 dias.",
    "Não consigo garantir que chega amanhã e nem sexta.",
    "Não sei quando chega, não consigo garantir que chega amanhã.",
    "Não consigo garantir que a entrega chega amanhã.",
    "Não posso confirmar que a entrega chega hoje.",
    "Não posso prometer que a sua entrega chega amanhã.",
    "Não posso garantir que você recebe a entrega amanhã.",
    "Não prometo que chega hoje e entrega amanhã.",
    "Não sei quando chega, nem se chega amanhã.",
    "Não consigo dizer se recebe hoje, ou se recebe amanhã.",
    "Não tem como saber se chega hoje. Se chega amanhã, eu não sei.",
    "Não garanto que chega hoje, nem que chega amanhã.",
    "Não consigo garantir que chega amanhã, nem que chega hoje.",
  ])("passa: %s", (t) => {
    // The 1-3 day range is the delivery's: on the prepaid path the range rule vetoes it, rightly.
    for (const [p, rk] of /\d a \d/.test(t) ? CTXS.slice(0, 2) : CTXS) expect(blocks(t, p, rk)).not.toContain("delivery_promise");
  });
});

describe("warranty_promise: only contact is exempt from 'a qualquer momento/hora'", () => {
  it.each([
    "Pode trocar o tamanho, sem problema, a gente resolve a qualquer momento.",
    "Pode trocar, a gente troca a qualquer momento.",
    "Pode devolver, a gente devolve a qualquer momento.",
    "Pode trocar o tamanho, a gente aceita a qualquer momento.",
    "Me chama que a gente troca a qualquer momento.",
    "A gente faz a troca a qualquer momento.",
    "Se não servir, a gente devolve seu dinheiro a qualquer hora.",
  ])("veta: %s", (t) => {
    for (const [p, rk] of CTXS) expect(blocks(t, p, rk)).toContain("warranty_promise");
  });

  it.each([
    "Me chama a qualquer momento.",
    "A gente responde a qualquer hora.",
    "Se precisar trocar, me chama a qualquer momento.",
    "Se precisar trocar, a gente responde a qualquer hora.",
    "Fique à vontade pra me chamar a qualquer momento.",
    "Pode me mandar mensagem a qualquer momento se precisar trocar.",
    "Se precisar trocar, pode me chamar aqui a qualquer momento.",
  ])("passa: %s", (t) => {
    for (const [p, rk] of CTXS) expect(blocks(t, p, rk)).not.toContain("warranty_promise");
  });
});
