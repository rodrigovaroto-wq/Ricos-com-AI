import { describe, expect, it } from "vitest";
import { classifyOptOut, gateNames, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const blocked = (result: ReturnType<typeof runGates>) =>
  result.traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("a cadeia inteira", () => {
  it("tem os onze gates", () => {
    expect(gateNames).toHaveLength(11);
  });

  it("deixa passar a mensagem correta do funil", () => {
    const text =
      "O colete sai por R$ 129,90 com o frete já incluído, e você paga na entrega. " +
      "Chega em 3 a 5 dias e a entrega é agendada.";
    const result = runGates(text, ctx());
    expect(result.allowed).toBe(true);
  });

  it("devolve o trace de todos os gates, não só do primeiro que vetou", () => {
    const result = runGates("qualquer coisa", ctx({ optedOut: true }));
    expect(result.traces).toHaveLength(11);
  });
});

describe("opt-out", () => {
  it("não confunde pedido de ajuda com pedido de parar", () => {
    expect(classifyOptOut("tem como parar a dor?")).toBe("none");
    expect(classifyOptOut("posso sair antes das 15h?")).toBe("none");
  });

  it("reconhece o pedido explícito", () => {
    expect(classifyOptOut("não quero mais receber nada")).toBe("explicit");
    expect(classifyOptOut("para de me mandar mensagem")).toBe("explicit");
    expect(classifyOptOut("me tira da lista por favor")).toBe("explicit");
  });

  it("marca o ambíguo como ambíguo, para confirmar antes de bloquear", () => {
    expect(classifyOptOut("parar")).toBe("ambiguous");
    expect(classifyOptOut("cancelar")).toBe("ambiguous");
  });

  it("é irrevogável: nada sai depois do opt-out", () => {
    const result = runGates("Oi! Tudo bem?", ctx({ optedOut: true }));
    expect(result.allowed).toBe(false);
    expect(blocked(result)).toContain("opt_out");
  });
});

describe("promessas que a operação não cumpre", () => {
  it("veta entrega para amanhã", () => {
    const r = runGates("Consigo agendar a entrega pra amanhã mesmo!", ctx());
    expect(blocked(r)).toContain("delivery_promise");
  });

  it("veta o prazo de 7 a 14 dias, que é de outra operação", () => {
    const r = runGates("A entrega leva de 7 a 14 dias.", ctx());
    expect(blocked(r)).toContain("delivery_promise");
  });

  it("aceita o prazo real do COD", () => {
    const r = runGates("Chega em 3 a 5 dias, e a entrega é agendada.", ctx());
    expect(blocked(r)).not.toContain("delivery_promise");
  });

  it("veta prazo firme no antecipado, onde o frete varia por região", () => {
    const r = runGates("No antecipado chega em 3 a 5 dias.", ctx({ paymentPath: "prepay" }));
    expect(blocked(r)).toContain("delivery_promise");
  });

  it("veta preço que não é o configurado", () => {
    const r = runGates("O colete sai por R$ 119,90 hoje!", ctx());
    expect(blocked(r)).toContain("price_promise");
  });

  it("aceita os dois preços da operação e a economia entre eles", () => {
    const r = runGates(
      `No antecipado sai por R$ ${config.prices.prepayBrl.toFixed(2).replace(".", ",")} ` +
        "em vez de R$ 129,90 — economia de R$ 19,48.",
      ctx(),
    );
    expect(blocked(r)).not.toContain("price_promise");
  });

  it("veta desconto que não existe", () => {
    const r = runGates("Só hoje: 30% de desconto!", ctx());
    expect(blocked(r)).toContain("price_promise");
  });

  it("veta cupom antes de ele existir na Coinzz", () => {
    const r = runGates("Separei um cupom especial pra você!", ctx());
    expect(blocked(r)).toContain("coupon_exists");
  });

  it("libera o cupom quando ele está ativo", () => {
    const active = { ...config, coupon: { ...config.coupon, active: true } };
    const r = runGates("Separei um cupom de 20% de desconto pra você!", ctx({ config: active }));
    expect(r.allowed).toBe(true);
  });

  it("veta promessa de pagar na porta quando `Físico na entrega` está desligado", () => {
    const off = { ...config, cod: { physicalOnDeliveryActive: false } };
    const r = runGates("Você paga direto pro entregador quando chegar.", ctx({ config: off }));
    expect(blocked(r)).toContain("charge_promise");
  });
});

describe("claims sobre o produto", () => {
  it("veta promessa de emagrecimento", () => {
    for (const t of [
      "Ele emagrece de verdade!",
      "Você vai queimar gordura usando",
      "afina a cintura de forma permanente",
    ]) {
      expect(blocked(runGates(t, ctx()))).toContain("weight_loss_claim");
    }
  });

  it("não veta a negação — a frase honesta que a spec exige", () => {
    for (const t of [
      "Ele não emagrece, viu? Modela enquanto você usa.",
      "O colete não emagrece e nem elimina gordura — ele muda o caimento.",
      "Sem promessa de emagrecimento: o efeito acaba quando você tira.",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("weight_loss_claim");
    }
  });

  it("continua vetando a afirmação, mesmo perto de uma negação", () => {
    const r = runGates("Não precisa de academia: ele emagrece você em uma semana.", ctx());
    expect(blocked(r)).toContain("weight_loss_claim");
  });

  it("aceita a frase honesta que vende", () => {
    const r = runGates(
      "O colete não muda o seu corpo. Muda como a roupa cai nele — enquanto você usa.",
      ctx(),
    );
    expect(r.allowed).toBe(true);
  });

  it("veta depoimento que não está na base", () => {
    const r = runGates('Uma cliente me disse: "mudou minha vida, perdi 10 cm"', ctx());
    expect(blocked(r)).toContain("invented_testimonial");
  });
});

describe("identidade e ritmo", () => {
  it("veta afirmar que é humana", () => {
    expect(blocked(runGates("Pode ficar tranquila, sou uma pessoa de verdade", ctx()))).toContain(
      "humanity_claim",
    );
    expect(blocked(runGates("Não sou um robô, viu?", ctx()))).toContain("humanity_claim");
  });

  it("aceita a resposta honesta sobre ser assistente virtual", () => {
    const r = runGates(
      "Eu sou a assistente virtual da Encorpa — se preferir falar com uma pessoa, eu chamo agora.",
      ctx(),
    );
    expect(r.allowed).toBe(true);
  });

  it("segura a resposta da agente de madrugada", () => {
    const r = runGates("Oi! Tudo bem?", ctx({ now: new Date("2026-09-06T03:00:00") }));
    expect(blocked(r)).toContain("business_hours");
  });

  it("deixa a mensagem automática passar de madrugada", () => {
    const r = runGates("Recebemos sua mensagem!", ctx({ layer: "auto", now: new Date("2026-09-06T03:00:00") }));
    expect(r.allowed).toBe(true);
  });

  it("veta a mesma mensagem literal saindo de novo", () => {
    const text = "Oi! Ficou alguma dúvida sobre o colete?";
    const r = runGates(text, ctx({ recentOutbound: [text] }));
    expect(blocked(r)).toContain("identical_template");
  });

  it("veta envio acima do teto de pacing", () => {
    const r = runGates("Oi!", ctx({ pacing: { sentLastHour: 40, hourlyLimit: 40, sentToday: 100, dailyLimit: 300 } }));
    expect(blocked(r)).toContain("pacing");
  });
});

describe("prazo: promessa na pré-venda vs. fato na logística", () => {
  const eve = "Sua entrega está marcada pra amanhã 💛 Deixa R$ 129,90 separado.";

  it("veta a mesma frase na pré-venda, onde ela é promessa", () => {
    const r = runGates(eve, ctx({ stage: "presale" }));
    expect(r.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain(
      "delivery_promise",
    );
  });

  it("libera na logística, onde a data foi a transportadora que marcou", () => {
    const r = runGates(eve, ctx({ stage: "logistics" }));
    expect(r.allowed).toBe(true);
  });

  it("mesmo na logística, não inventa janela de prazo", () => {
    const r = runGates("Chega em 7 a 14 dias.", ctx({ stage: "logistics" }));
    expect(r.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain(
      "delivery_promise",
    );
  });
});
