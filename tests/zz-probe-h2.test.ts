import { it } from "vitest";
import { bargainsToBuy, decidesToBuy } from "@/agent/interpret.js";
import { runGates } from "@/agent/guardrails.js";
import { linkFactLine } from "@/agent/prompt.js";
import { config, ctx } from "./fixtures.js";
it("probe", () => {
  const msgs = [
    "por 116 eu levo, manda o link do pix",
    "se for por 116,91 eu levo",
    "com desconto do pix eu levo",
    "com o desconto no pix eu fecho",
    "no pix com desconto eu compro",
    "faz pra 2 então",
    "deixa a 1 mesmo, quero o G",
    "se fizer o pix hoje ganho desconto? quero comprar",
    "se você tirar uma dúvida eu já compro",
    "se fizer entrega no meu cep eu compro",
    "quero o G. se parcelar melhor ainda",
    "2 por 207 eu levo",
    "não tem como fazer por 100? eu levo",
    "nao da pra fazer por 100 nao? quero o G",
    "não faz por 100 não? quero um G",
    "quero um G por 100",
    "vou levar, mas só por 100",
    "levo por 100",
    "eu fecho em 100",
    "se tiver desconto eu compro",
    "se tiver cupom eu fecho",
    "faz 100 que eu levo",
    "faz por cem que eu levo",
    "se ficar 100 eu levo",
    "manda o link se fizer por 100",
    "me da um desconto que eu levo",
    "nem que seja por 100 eu levo",
    "quero comprar, mas só se fizer por 100",
    "faz por 100 que eu levo",
  ];
  for (const m of msgs) console.log(JSON.stringify(m), "bargain=", bargainsToBuy(m), "decides=", decidesToBuy(m));
  const pre = { ...config, prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 } };
  for (const c of [config, pre]) for (const p of ["cod", "prepay"] as const) {
    const row = linkFactLine(c as any, p)!;
    for (const path of ["cod", "prepay"] as const) {
      const r = runGates(row, ctx({ config: c, paymentPath: path }) as any);
      console.log(p, path, r.allowed, row, JSON.stringify(r.traces.filter((t: any) => t.verdict !== "pass")));
    }
  }
});
