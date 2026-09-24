import { describe, expect, it } from "vitest";
import { gateBriefing, remedyFor, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

/**
 * Operator decision, 2026-09-24: persona runs lost sales to vetoes that ended in the
 * canned fallback. The chain splits in two — hard gates veto money, law and the body;
 * soft gates record `warn` and never block — and five optional config keys open what the
 * operation can actually back. Every key is optional: absent reads as "off".
 */

const blocked = (r: ReturnType<typeof runGates>) =>
  r.traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const warned = (r: ReturnType<typeof runGates>) =>
  r.traces.filter((t) => t.verdict === "warn").map((t) => t.gate);

const withConfig = (over: Record<string, unknown>) => ({ ...config, ...over }) as typeof config;
const prices6 = withConfig({ prices: { ...config.prices, prepayMaxInstallments: 6 } });

describe("1. gates brandos: registram, nunca vetam", () => {
  it("frase repetida vira warn, e a resposta sai", () => {
    const text = "Qual roupa você quer voltar a usar?";
    const r = runGates(text, ctx({ recentOutbound: [text] }));
    expect(warned(r)).toEqual(["identical_template"]);
    expect(r.allowed).toBe(true);
    expect(remedyFor(r)).toBeNull();
  });

  it("prazo sem rótulo com os dois caminhos vira warn, e a resposta sai", () => {
    const r = runGates("A entrega é agendada para 1 a 3 dias. Você prefere pagar na entrega ou antecipado?", ctx());
    expect(warned(r)).toContain("unattributed_window");
    expect(r.allowed).toBe(true);
  });

  it("warn nunca esconde um veto de verdade na mesma mensagem", () => {
    const text = "Chega amanhã! E a nossa loja física é linda.";
    const r = runGates(text, ctx({ recentOutbound: [text] }));
    expect(blocked(r)).toEqual(["delivery_promise"]);
    expect(warned(r)).toEqual(["unavailable_offer", "identical_template"]);
    expect(remedyFor(r)).toBe("rewrite");
  });

  it("pacing continua duro: adia, porque é o limite do canal", () => {
    const r = runGates("Oi!", ctx({ pacing: { sentLastHour: 40, hourlyLimit: 40, sentToday: 1, dailyLimit: 300 } }));
    expect(blocked(r)).toEqual(["pacing"]);
    expect(remedyFor(r)).toBe("defer");
  });
});

describe("2. garantia: prazo de entrega não é prazo de troca (Jussara R1, Karol R2, Tati R2)", () => {
  const verdict = (text: string) => runGates(text, ctx()).traces.find((t) => t.gate === "warranty_promise")!.verdict;

  it.each([
    "Você recebe em até 3 dias e quem escolhe o dia é você no checkout, e tem 7 dias pra trocar ou devolver se não gostar.",
    "Você não paga nada agora, você recebe o colete em casa em até 3 dias e só paga R$ 129,90 na mão do entregador, e ainda tem 7 dias pra devolver se não gostar.",
    "Você escolhe um dos próximos 3 dias pra receber em casa e paga R$ 129,90 ali na hora, e fica tranquila porque tem 7 dias pra devolver se não amar.",
    "Você recebe em até 3 dias no dia que você escolhe, podendo devolver em 7 dias se não amar.",
    "Ela paga R$ 129,90 na mão do entregador quando receber em até 3 dias, com 7 dias pra trocar ou devolver se precisar.",
    "Você tem 7 dias após o recebimento pra devolver, e devolvemos o seu dinheiro sem custo nenhum.",
  ])("passa: %s", (text) => {
    expect(verdict(text)).toBe("pass");
    expect(blocked(runGates(text, ctx()))).toEqual([]);
  });

  it.each([
    "Você recebe e tem 30 dias pra devolver.",
    "Você recebe em até 3 dias pra devolver.",
    "Chega em até 3 dias e você devolve em 30 dias.",
    "Pra devolver, você recebe em até 30 dias o seu dinheiro de volta.",
    "Devolvemos o seu dinheiro em até 30 dias.",
    "Você recebe em casa com 30 dias de garantia.",
    "Você recebe, em até 30 dias, o reembolso da troca.",
    "Não precisa se preocupar: você tem 15 dias pra trocar.",
    "Paga ao entregador e em 30 dias pode devolver.",
  ])("barra: %s", (text) => {
    expect(verdict(text)).toBe("block");
  });

  it("o briefing diz 'após o recebimento' e cita o e-mail só quando configurado", () => {
    const sem = gateBriefing(config).join("\n");
    expect(sem).toContain("7 dias após o recebimento");
    expect(sem).not.toContain("escreve para");
    const com = gateBriefing(withConfig({ support: { email: "sac@example.com" } })).join("\n");
    expect(com).toContain("ela escreve para sac@example.com");
  });
});

describe("3. parcelamento: só no antecipado, até o teto, nunca 'sem juros'", () => {
  const inst = (text: string, c = prices6, paymentPath: "cod" | "prepay" = "cod") =>
    runGates(text, ctx({ config: c, paymentPath })).traces.find((t) => t.gate === "installment_promise")!;

  it.each([
    "No antecipado dá pra parcelar em até 6x no cartão.",
    "Na entrega é à vista, e no antecipado dá pra parcelar em até 6x no cartão.",
    "No antecipado, com cartão no checkout, dá pra parcelar em até 6x.",
    "Pagando no cartão pelo checkout, dá pra parcelar em 3x.",
    "Na entrega não dá pra parcelar, é uma vez só.",
    "Na entrega não tem parcelamento.",
  ])("passa com teto 6: %s", (text) => {
    expect(inst(text).verdict).toBe("pass");
  });

  it.each([
    ["No antecipado dá pra parcelar em até 12x no cartão.", "above the configured 6"],
    ["Dá pra parcelar em 3x sem juros no antecipado.", "sem juros"],
    ["Na entrega você parcela em 3x.", "cash-on-delivery"],
    ["Parcela em 6x no cartão do entregador.", "cash-on-delivery"],
    ["No antecipado ou na entrega, parcela em até 6x.", "cash-on-delivery"],
    ["Não se preocupe, parcela em 6x.", "without tying them"],
    ["Sem precisar pagar antecipado, parcela em 6x.", "without tying them"],
    ["Pagando antecipado ou não, parcela em 6x.", "joins two payment paths"],
  ])("barra com teto 6: %s", (text, reason) => {
    const t = inst(text);
    expect(t.verdict).toBe("block");
    expect(t.detail).toContain(reason);
  });

  it("'sem juros' veta sempre, mesmo negado e no caminho antecipado", () => {
    expect(inst("Não é sem juros, tá?", prices6, "prepay").verdict).toBe("block");
    // Code ladder review: the sentence cut follows `sentenceAt`, so a dotted price does not
    // split "antecipado" from its installments — and the negated door stays vetoed.
    expect(inst("No antecipado sai R$ 129.90 e dá pra parcelar em 6x no cartão.", prices6, "prepay").verdict).toBe("pass");
    expect(inst("No antecipado sai R$ 129,90 e dá pra parcelar em 6x no cartão.", prices6, "prepay").verdict).toBe("pass");
    expect(inst("Na entrega sai R$ 159.90 e dá pra parcelar em 6x.", prices6, "cod").verdict).toBe("block");
    // Second review: a statement glued to a short question is not a bare question.
    for (const glued of ["Dá pra parcelar.Quer?", "Parcela sim!Quer?", "Dá pra dividir no cartão.Bora?", "Dá pra parcelar...quer?"]) {
      for (const c of [config, prices6]) {
        for (const p of ["cod", "prepay"] as const) expect(inst(glued, c, p).verdict, `${glued} ${p}`).toBe("block");
      }
    }
    expect(inst("Tem pagamento antecipado.Parcela em 6x.", prices6, "cod").verdict).toBe("block");
    for (const glued of ["Dá pra parcelar.2 tamanhos te servem?", "Parcela sim!1 dúvida: qual tamanho?", "Dá pra dividir!7 dias de garantia, topa?"]) {
      for (const p of ["cod", "prepay"] as const) expect(inst(glued, config, p).verdict, `${glued} ${p}`).toBe("block");
    }
    const cfg12 = withConfig({ prices: { ...config.prices, prepayMaxInstallments: 12 } });
    for (const p of ["cod", "prepay"] as const) {
      expect(inst("Tem pagamento antecipado.6x no cartão.", prices6, p).verdict, p).toBe("block");
      expect(inst("Pague antecipado.12 parcelas no cartão.", cfg12, p).verdict, p).toBe("block");
    }
    expect(inst("No antecipado sai R$ 1.299,90 em 6x no cartão.", prices6, "prepay").verdict).toBe("pass");
    expect(inst("Parcela com juros zero no antecipado.", prices6, "prepay").verdict).toBe("block");
  });

  it("sem teto configurado, nenhum parcelamento passa — nem no antecipado", () => {
    expect(inst("No antecipado dá pra parcelar em até 6x no cartão.", config).verdict).toBe("block");
    expect(inst("Dá pra parcelar em 6x.", config, "prepay").verdict).toBe("block");
    expect(inst("Na entrega não dá pra parcelar.", config).verdict).toBe("pass");
  });

  it("o briefing só ensina parcela quando há teto, e sempre proíbe 'sem juros'", () => {
    const sem = gateBriefing(config).join("\n");
    expect(sem).toContain('Não fale em parcelar');
    expect(sem).toContain('nunca diga "sem juros"');
    const com = gateBriefing(prices6).join("\n");
    expect(com).toContain("dá pra parcelar em até 6x");
    expect(inst("No antecipado, no cartão pelo checkout, dá pra parcelar em até 6x.").verdict).toBe("pass");
  });
});

describe("4. prova social: só o número de clientes configurado", () => {
  const social = withConfig({ socialProof: { satisfiedCustomers: 5000 } });
  const g = (text: string, c = social) =>
    runGates(text, ctx({ config: c })).traces.find((t) => t.gate === "invented_testimonial")!.verdict;

  it.each([
    "Já são mais de 5000 clientes satisfeitas.",
    "Já são mais de 5.000 clientes satisfeitas.",
    "Já são mais de 5 mil clientes satisfeitas.",
    "Você pode ver os depoimentos no nosso site, na seção de depoimentos.",
    "Dá pra fazer os 2 pedidos no mesmo endereço.",
  ])("passa: %s", (text) => {
    expect(g(text)).toBe("pass");
  });

  it.each([
    "Já são mais de 10 mil clientes satisfeitas.",
    "Milhares de clientes já usam.",
    "Mais de 20 mil coletes vendidos.",
    "Mais de 3 mil mulheres já compraram.",
  ])("barra: %s", (text) => {
    expect(g(text)).toBe("block");
  });

  it("sem o número configurado, nenhuma contagem de clientes passa", () => {
    expect(g("Já são mais de 5000 clientes satisfeitas.", config)).toBe("block");
    expect(gateBriefing(config).join("\n")).toContain("Não cite número de clientes");
    expect(gateBriefing(social).join("\n")).toContain('"mais de 5000 clientes satisfeitas"');
  });
});

describe("5. loja física: branda, e a resposta honesta passa limpa", () => {
  const plan = withConfig({ store: { physicalStorePlanCity: "São Paulo" } });
  const offer = (text: string, c = plan) => runGates(text, ctx({ config: c })).traces.find((t) => t.gate === "unavailable_offer")!;

  it("a resposta do operador passa sem warn", () => {
    const t = offer(
      "Ainda não temos loja física, a venda é só online, mas temos planos de abrir uma loja em São Paulo.",
    );
    expect(t.verdict).toBe("pass");
  });

  it("plano de abrir 'nossa loja física' na cidade configurada passa; em outra cidade, warn", () => {
    expect(offer("Temos planos de abrir nossa loja física em São Paulo.").verdict).toBe("pass");
    expect(offer("Temos planos de abrir nossa loja física no Rio.").verdict).toBe("warn");
    expect(offer("Temos planos de abrir nossa loja física em São Paulo.", config).verdict).toBe("warn");
  });

  it("citar uma loja é warn; outro produto continua vetando", () => {
    const r = runGates("Não se preocupe, tem loja física sim.", ctx());
    expect(warned(r)).toContain("unavailable_offer");
    expect(r.allowed).toBe(true);
    expect(blocked(runGates("Também temos calcinha modeladora.", ctx()))).toContain("unavailable_offer");
  });

  it.each([
    "Pode retirar na nossa loja em São Paulo.",
    "Pode retirar na nossa loja física, fica no centro.",
    "Pode vir buscar aqui quando quiser.",
    "Temos loja em SP, pode ir buscar.",
    "Se preferir, venha conhecer a nossa loja.",
  ])("convidar a retirar ou visitar continua vetando: %s", (text) => {
    expect(blocked(runGates(text, ctx({ config: plan })))).toContain("unavailable_offer");
  });

  it.each([
    "Não tem como retirar, a entrega é só em casa.",
    "A gente não tem loja física nem endereço pra retirada, a venda é só por aqui mesmo.",
  ])("a recusa honesta de retirada passa: %s", (text) => {
    expect(blocked(runGates(text, ctx()))).toEqual([]);
  });
});

describe("6. Express: fora do briefing e vetado até o config ligar", () => {
  const express = withConfig({ delivery: { ...config.delivery, expressActive: true } });
  const d = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
    runGates(text, ctx(over)).traces.find((t) => t.gate === "delivery_promise")!.verdict;

  it("o briefing só fala de Express quando está ativo", () => {
    expect(gateBriefing(config).join("\n")).not.toMatch(/express/i);
    expect(gateBriefing(express).join("\n")).toContain("Express");
  });

  it.each([
    "Tem uma opção Express que entrega hoje mesmo — dá pra conferir a disponibilidade da sua região no checkout.",
    "Com a entrega expressa você recebe no mesmo dia.",
    "Se estiver disponível aí, você recebe hoje em até 4 horas.",
    "Você recebe em até 4 horas.",
    "Não se preocupe, tem Express.",
  ])("desligado, barra mesmo com a consulta dizendo mesmo dia: %s", (text) => {
    expect(d(text, { sameDayWindow: true })).toBe("block");
  });

  it.each(["Não temos entrega expressa, a entrega leva de 1 a 3 dias.", "A entrega expressa não está disponível aqui."])(
    "a negação honesta passa: %s",
    (text) => {
      expect(d(text)).toBe("pass");
    },
  );

  it("ligado, volta o comportamento de antes", () => {
    expect(d("Se estiver disponível aí, você recebe hoje em até 4 horas.", { config: express })).toBe("pass");
    expect(d("Você recebe hoje mesmo, garantido.", { config: express })).toBe("block");
  });
});

describe("a negação que libera tem de governar o termo (segunda leitura, 2026-09-24)", () => {
  const inst = (text: string) =>
    runGates(text, ctx()).traces.find((t) => t.gate === "installment_promise")!.verdict;

  it.each([
    "Não tem problema parcelar em 6x na entrega.",
    "Não precisa esperar, parcela em 6x.",
    "Sem entrada parcela em 6x.",
  ])("a negativa que não nega o parcelamento continua barrando: %s", (text) => {
    expect(inst(text)).toBe("block");
  });

  it.each(["A gente não trabalha com parcelamento na entrega.", "Na entrega é à vista, sem parcelamento.", "Não consigo parcelar na entrega."])(
    "a recusa honesta passa: %s",
    (text) => {
      expect(inst(text)).toBe("pass");
    },
  );

  it("'não se preocupe tem Express' continua barrado, sem vírgula nenhuma", () => {
    expect(
      runGates("Não se preocupe tem Express.", ctx()).traces.find((t) => t.gate === "delivery_promise")!.verdict,
    ).toBe("block");
  });
});

describe("humanity_claim: dizer que chamou uma pessoa, sem ter chamado (2026-09-24)", () => {
  const h = (text: string, layer: "agent" | "auto" = "agent") =>
    runGates(text, ctx({ layer })).traces.find((t) => t.gate === "humanity_claim")!.verdict;

  it.each([
    "Já chamei uma atendente pra falar com você.",
    "Já avisei o time, fica tranquila.",
    "A pessoa do time chega daqui a pouquinho.",
    "Estou chamando uma atendente pra você.",
    "Alguém do time vai te chamar já já.",
    "Não se preocupe, já passei pra equipe.",
  ])("barra: %s", (text) => {
    expect(h(text)).toBe("block");
  });

  it.each([
    "Quer que eu chame alguém do time pra falar com você?",
    "Se quiser, alguém do time te chama por aqui.",
    "Posso chamar uma pessoa do time, se você preferir.",
    "Não chamei ninguém ainda: quer que eu chame?",
    "Tô passando o link pra você agora.",
    "Não sou uma pessoa, sou a assistente virtual da marca.",
  ])("passa: %s", (text) => {
    expect(h(text)).toBe("pass");
  });

  it("a linha fixa do handoff, que o código manda com layer auto, não é vetada", () => {
    expect(h("Claro! Já avisei o time e alguém te chama por aqui 💛", "auto")).toBe("pass");
    // A mesma frase escrita pelo modelo é mentira: ninguém foi chamado.
    expect(h("Claro! Já avisei o time e alguém te chama por aqui 💛", "agent")).toBe("block");
  });
});

describe("invented_testimonial: depoimento parafraseado, sem aspas (2026-09-24)", () => {
  const g = (text: string) =>
    runGates(text, ctx({ knownTestimonials: config.testimonials ?? [] })).traces.find(
      (t) => t.gate === "invented_testimonial",
    )!.verdict;

  it.each([
    "Uma cliente me disse que amou o colete.",
    "Outra cliente comentou comigo que usou no casamento e não tirou mais.",
    "Essa semana uma compradora me contou que o vestido caiu diferente.",
  ])("barra: %s", (text) => {
    expect(g(text)).toBe("block");
  });

  it.each([
    "Nenhuma cliente me disse que ele emagrece, porque ele não emagrece.",
    "Você pode ver o que as clientes dizem no nosso site, na seção de depoimentos.",
    'Uma cliente disse: "vesti pra festa e não tirei mais, o vestido caiu diferente".',
  ])("passa: %s", (text) => {
    expect(g(text)).toBe("pass");
  });
});

/**
 * Segunda revisão (2026-09-24): o parcelamento virou lista branca. Passa só com o
 * antecipado afirmado na frase, nenhuma palavra de porta no resto da mensagem (fora a
 * cláusula que recusa), nenhum "ou" juntando caminhos, nenhum "também", e dentro do teto.
 */
describe("parcelamento em lista branca (segunda revisão)", () => {
  const cfg12 = withConfig({ prices: { ...config.prices, prepayMaxInstallments: 12 } });
  const inst = (text: string) =>
    runGates(text, ctx({ config: cfg12 })).traces.find((t) => t.gate === "installment_promise")!.verdict;

  it.each([
    "No antecipado em até 12x, na entrega também.",
    "Parcela em 12x no antecipado, vale pra entrega também.",
    "No antecipado dá em 12x, e pagando na entrega é igual.",
    "No antecipado em 12x, com o motoboy também.",
    "Antecipado em 12x; entrega, 12x também.",
    "Você escolhe: antecipado no pix, ou parcela em 12x no ato da entrega.",
    "Pode antecipar ou parcelar em 12x no dia da entrega.",
    "Antecipado, só que no cartão da entrega em 12x.",
    "No antecipado ou pagando ao receber, em até 12x.",
    "No antecipado ou no recebimento, em até 12x.",
    "No antecipado ou quando chega, em até 12x.",
    "Pagando antecipado ou pagando depois, 12x.",
    "Antecipar não precisa, parcela em 12x.",
    "Quem não quer pagar antecipado parcela em 12x.",
    "Você pode parcelar em 12x no cartão.",
    "No antecipado em até 18x.",
    "Na entrega dá pra dividir em 3.",
  ])("barra: %s", (text) => {
    expect(inst(text)).toBe("block");
  });

  it.each([
    "Na entrega você paga uma vez só; no antecipado parcela em até 12x.",
    "Na entrega não dá pra parcelar, mas no antecipado dá em até 12x no cartão.",
    "No antecipado, pelo cartão no checkout, dá pra parcelar em até 12x.",
    "Se quiser parcelar em 12x é no antecipado, e na entrega paga à vista.",
    "No antecipado em até doze vezes.",
    "Na entrega não tem parcelamento, é à vista.",
  ])("passa: %s", (text) => {
    expect(inst(text)).toBe("pass");
  });

  it.each([
    "No antecipado, 12x sem juros.",
    "No antecipado não tem juros, parcela em 12x.",
    "No antecipado em 12x sem juro.",
    "No antecipado, 12x livre de juros.",
    "No antecipado em 12x, isento de juros.",
    "No antecipado, 12x e não cobra juros.",
    "No antecipado em 12x sem nenhum juros.",
    "No antecipado em 12x e os juros são zero.",
    "No antecipado, 12x, sem cobrar juros.",
    "No antecipado, 12x sem acréscimo.",
  ])("'sem juros' em qualquer forma barra: %s", (text) => {
    expect(inst(text)).toBe("block");
  });

  it("'sem acréscimo' sem parcela não é sobre juros, e 'pode ter juros' passa", () => {
    expect(inst("Na entrega é R$ 129,90 sem acréscimo nenhum.")).toBe("pass");
    expect(inst("No antecipado, no cartão pelo checkout pode ter juros, dá em até 12x.")).toBe("pass");
  });
});

describe("segunda revisão: loja com endereço, Express qualificado, prova social, pessoa chamada, garantia", () => {
  const plan = withConfig({ store: { physicalStorePlanCity: "São Paulo" } });
  const gate = (text: string, name: string, c = plan) =>
    runGates(text, ctx({ config: c })).traces.find((t) => t.gate === name)!.verdict;

  it.each([
    "Nossa loja fica no Brás, pode vir.",
    "Temos loja física em São Paulo, fica na 25 de março.",
    "A loja física fica na Rua Oriente, 300.",
    "Retira com a gente em SP.",
    "Se preferir, retira no nosso endereço.",
    "Dá pra passar lá e pegar.",
    "Pode vir pegar aqui.",
    "Te espero na loja!",
    "Vem provar aqui na loja.",
    "Tem retirada em São Paulo.",
    "Não precisa ir até a loja, pode retirar no nosso endereço.",
    "Temos planos de abrir loja física em São Paulo, e já temos uma em Campinas.",
  ])("loja: barra %s", (text) => {
    expect(gate(text, "unavailable_offer")).toBe("block");
  });

  it.each([
    "Ainda não temos loja física, a venda é só online, mas temos planos de abrir uma loja em São Paulo.",
    "Não temos loja física, só online.",
    "Não tem como retirar.",
    "Nem precisa ir buscar, entregamos na sua casa.",
  ])("loja: passa %s", (text) => {
    expect(gate(text, "unavailable_offer")).toBe("pass");
  });

  it.each([
    "A Express não tem custo extra.",
    "A Express não funciona aos domingos, só de segunda a sábado.",
    "A entrega Express não está disponível depois das 14h.",
    "Chega em 4 horas.",
    "Entrega em 4h na sua região.",
    "Chega em poucas horas.",
    "Tem entrega expressa sim, só não está ativa na sua região.",
  ])("Express desligado: barra %s", (text) => {
    expect(gate(text, "delivery_promise")).toBe("block");
  });

  it.each(["Não temos entrega expressa.", "A Express ainda não tá funcionando.", "Sem Express por enquanto."])(
    "Express desligado: passa %s",
    (text) => {
      expect(gate(text, "delivery_promise")).toBe("pass");
    },
  );

  const social = withConfig({ socialProof: { satisfiedCustomers: 500 } });
  it.each([
    "500 clientes compraram hoje.",
    "Mais de 500 clientes compraram só essa semana.",
    "Mais de mil clientes.",
    "Mais de 300 pessoas compraram esse mês.",
    "Já vendemos 500 peças.",
    "95% das clientes recomendam.",
    "As clientes dizem que é muito confortável.",
    "Tem cliente que fala que nunca mais tirou.",
    "Mais de 500 clientes satisfeitas, e 200 delas voltaram pra comprar de novo.",
    "Mais de 500 clientes satisfeitas, nota 4.9 no site.",
    "Várias clientes já compraram.",
  ])("prova social: barra %s", (text) => {
    expect(gate(text, "invented_testimonial", social)).toBe("block");
  });

  it.each(["Mais de 500 clientes satisfeitas.", "Mais de 500 clientes satisfeitas em todo o Brasil.", "+500 clientes satisfeitas."])(
    "prova social: o número configurado com 'satisfeitas' passa: %s",
    (text) => {
      expect(gate(text, "invented_testimonial", social)).toBe("pass");
    },
  );

  it.each([
    "Vou chamar uma atendente agora.",
    "Já passei pro time.",
    "Transferi pro atendimento humano.",
    "Já acionei o suporte.",
    "O suporte vai te chamar.",
    "Nossa equipe já foi notificada.",
    "Já deixei avisado pro time.",
    "Pedi pra alguém do time te chamar.",
  ])("pessoa chamada: barra %s", (text) => {
    expect(gate(text, "humanity_claim")).toBe("block");
  });

  it.each(["Quer que eu chame alguém do time?", "Posso chamar uma pessoa pra você?", "Ainda não chamei ninguém."])(
    "pessoa chamada: a oferta passa: %s",
    (text) => {
      expect(gate(text, "humanity_claim")).toBe("pass");
    },
  );

  it.each([
    "Devolução em até 3 dias após receber.",
    "Você recebe o reembolso em até 30 dias.",
    "Você recebe em até 3 dias o seu dinheiro de volta.",
  ])("garantia: barra %s", (text) => {
    expect(gate(text, "warranty_promise")).toBe("block");
  });

  it("garantia: a frase do operador passa", () => {
    expect(
      gate("Você tem 7 dias após o recebimento pra devolver, e devolvemos o seu dinheiro sem custo nenhum.", "warranty_promise"),
    ).toBe("pass");
  });
});

describe("garantia: o prazo de entrega não empresta passe a uma troca sem 'dias'", () => {
  it("'recebe em até 3 dias e troca em 3 também' barra; 'e troca grátis' passa", () => {
    const w = (text: string) => runGates(text, ctx()).traces.find((t) => t.gate === "warranty_promise")!.verdict;
    expect(w("Você recebe em até 3 dias e troca em 3 também.")).toBe("block");
    expect(w("Você recebe em até 3 dias e devolve em 30.")).toBe("block");
    expect(w("Chega em até 3 dias e você tem 7 dias pra devolver.")).toBe("pass");
  });
});

/**
 * Terceira revisão (2026-09-24): falsos positivos em frases honestas. Cada caso traz a
 * frase honesta que passa e a mentira vizinha que continua barrada.
 */
describe("terceira revisão: frase honesta passa, a mentira vizinha não", () => {
  const full = withConfig({
    prices: { ...config.prices, prepayMaxInstallments: 12 },
    socialProof: { satisfiedCustomers: 500 },
    store: { physicalStorePlanCity: "São Paulo" },
  });
  const verdict = (text: string, gate: string) =>
    runGates(text, ctx({ config: full })).traces.find((t) => t.gate === gate)!.verdict;

  it.each([
    ["invented_testimonial", "O colete é vendido por R$ 129,90.", "Já vendemos 500 peças."],
    ["invented_testimonial", "O colete é vendido em 5 tamanhos, do P ao XGG.", "Já vendemos mais de 2000."],
    ["invented_testimonial", "A entrega é agendada, sendo 1 a 3 dias pra chegar.", "Mais de 500 clientes satisfeitas, sendo 300 só em São Paulo."],
    ["invented_testimonial", "Mais de 500 clientes satisfeitas.", "Mais de 500 clientes satisfeitas só essa semana."],
    ["invented_testimonial", "Qualidade, mais de 500 clientes satisfeitas, pagamento na entrega, 7 dias pra trocar e suporte todo dia.", "Mais de 500 clientes satisfeitas, 98% recomendam."],
    ["invented_testimonial", "Muitas clientes usam por baixo do vestido.", "Várias clientes já compraram."],
    ["delivery_promise", "Infelizmente a entrega expressa não está disponível na sua região.", "A Express não tem custo extra."],
    ["delivery_promise", "Express ainda não temos, mas chega em 1 a 3 dias.", "A entrega Express não está disponível depois das 14h."],
    ["delivery_promise", "A entrega expressa ainda não chegou na sua região.", "Não se preocupe, temos Express."],
    ["delivery_promise", "Assim que você fizer o pedido, em até 24 horas você recebe a confirmação.", "Chega em 4 horas."],
    ["humanity_claim", "Nosso suporte te atende todos os dias.", "Já acionei o suporte."],
    ["humanity_claim", "Pra trocar, escreve pro sac@x.com que o atendimento te responde rapidinho.", "Transferi pro atendimento humano."],
    ["humanity_claim", "Não sou uma pessoa, sou a assistente virtual da marca.", "Já chamei a atendente."],
    ["unavailable_offer", "Se quiser, pode passar aqui seu CEP que eu confiro.", "Pode vir aqui."],
    ["unavailable_offer", "Loja física ainda não temos, a venda está no site.", "Tem como retirar sim, em SP."],
    ["unavailable_offer", "Não precisa buscar nada, o entregador leva aí.", "Retire no nosso ponto de retirada."],
    ["installment_promise", "Na entrega é à vista, direto com o entregador; no antecipado dá pra parcelar em até 12x.", "Na entrega você paga uma vez só, em 12x no cartão do checkout."],
    ["installment_promise", "Na entrega você paga em dinheiro, pix ou cartão, uma vez só; no antecipado parcela em até 12x.", "Na entrega você paga à vista ou em 12x no cartão."],
    ["installment_promise", "No antecipado parcela em até 12x no cartão e chega em média em 5 dias.", "Parcela em 12x e paga quando chegar."],
    ["installment_promise", "No antecipado, pelo cartão no checkout, dá pra parcelar em até 12x. O prazo varia por região, em média 5 dias pra chegar.", "No antecipado em até 12x no cartão. O entregador também aceita."],
    ["installment_promise", "Pagando antecipado você parcela em até 12x no cartão e recebe em casa.", "No antecipado em até 12x no cartão, e na entrega aceitamos cartão."],
    ["installment_promise", "Quer parcelar? No antecipado, pelo cartão, dá em até 12x.", "No antecipado, 12x. Com o motoboy dá pra passar no crédito parcelado."],
    ["installment_promise", "Na entrega não dá pra parcelar. No antecipado sim, em até 12x no cartão.", "No antecipado em até 12x; quem prefere, faz igual com o entregador."],
  ])("%s: passa a honesta, barra a vizinha", (gate, honest, lie) => {
    expect(verdict(honest, gate), honest).toBe("pass");
    expect(verdict(lie, gate), lie).toBe("block");
  });

  it.each([
    "Hoje, mais de 500 clientes satisfeitas.",
    "Já passamos de 500 clientes satisfeitas este mês.",
    "Mais de 500 clientes satisfeitas compraram hoje.",
  ])("prova social com relógio barra: %s", (text) => {
    expect(verdict(text, "invented_testimonial")).toBe("block");
  });
});

describe("pergunta sobre parcelamento", () => {
  const cfg12 = withConfig({ prices: { ...config.prices, prepayMaxInstallments: 12 } });
  const inst = (text: string) =>
    runGates(text, ctx({ config: cfg12 })).traces.find((t) => t.gate === "installment_promise")!.verdict;
  it("a pergunta seca não promete nada; com número ou porta, promete", () => {
    expect(inst("Quer parcelar? No antecipado, pelo cartão, dá em até 12x.")).toBe("pass");
    expect(inst("Sabia que dá pra parcelar em 12x na entrega?")).toBe("block");
    expect(inst("Quer parcelar em 12x?")).toBe("block");
  });
});

/** Revisão final (2026-09-24): só aperto. Cada mentira nova veta; a vizinha honesta passa. */
describe("revisão final: R1, R2 e os apertos", () => {
  const full = withConfig({
    prices: { ...config.prices, prepayMaxInstallments: 12 },
    socialProof: { satisfiedCustomers: 500 },
  });
  const verdict = (text: string, gate: string) =>
    runGates(text, ctx({ config: full })).traces.find((t) => t.gate === gate)!.verdict;

  it.each([
    ["installment_promise", "Na entrega não dá pra dividir.", "No antecipado em 12x, e na entrega dá pra dividir no cartão."],
    ["installment_promise", "Na entrega não dá pra dividir.", "No antecipado em 12x, e no pagamento na entrega você divide no cartão."],
    ["installment_promise", "Na entrega você paga uma vez só; no antecipado parcela em até 12x.", "No antecipado em 12x; na entrega você divide."],
    ["installment_promise", "Na entrega você paga uma vez só; no antecipado parcela em até 12x.", "No antecipado em 12x, e na entrega você pode dividir."],
    ["installment_promise", "No antecipado, no cartão pelo checkout, o cartão pode cobrar juros, e dá em até 12x.", "No antecipado em até 12x sem pagar juros."],
    ["installment_promise", "No antecipado, no cartão pelo checkout, o cartão pode cobrar juros, e dá em até 12x.", "No antecipado em até 12x sem precisar pagar juros."],
    ["installment_promise", "No antecipado, no cartão pelo checkout, o cartão pode cobrar juros, e dá em até 12x.", "No antecipado em até 12x e você não vai pagar juros."],
    ["installment_promise", "No antecipado, no cartão pelo checkout, o cartão pode cobrar juros, e dá em até 12x.", "No antecipado em até 12x, sem os juros."],
    ["unavailable_offer", "Se quiser, pode passar aqui seu CEP que eu confiro.", "Pode passar aqui pra pegar."],
    ["unavailable_offer", "Se quiser, me passa aqui seu CEP que eu confiro.", "Passa aqui amanhã que te entrego."],
    ["unavailable_offer", "Não tem como retirar.", "Temos um showroom em São Paulo, se quiser conhecer."],
    ["unavailable_offer", "A gente não tem loja física nem endereço pra retirada, a venda é só por aqui mesmo.", "Nosso estoque fica em São Paulo, dá pra combinar a retirada."],
    ["humanity_claim", "Quer que eu chame alguém do time?", "Já encaminhei seu pedido pra equipe."],
    ["humanity_claim", "Quer que eu chame alguém do time?", "Já chamei a Carla do time pra falar com você."],
    ["humanity_claim", "Nosso suporte te atende todos os dias.", "A Carla, nossa atendente, vai te chamar em instantes."],
    ["humanity_claim", "Quer que eu chame alguém do time?", "Deixei seu contato com a equipe, elas te chamam."],
    ["humanity_claim", "Se quiser, vou pedir pra uma atendente te chamar.", "Vou pedir pra uma atendente te chamar."],
    ["humanity_claim", "Nosso suporte te atende todos os dias.", "Já registrei aqui e o time vai te retornar."],
    ["invented_testimonial", "Mais de 500 clientes satisfeitas.", "Somos a marca de colete mais vendida do Brasil."],
    ["invented_testimonial", "Mais de 500 clientes satisfeitas.", "O colete é o mais vendido do site."],
    ["invented_testimonial", "Mais de 500 clientes satisfeitas em todo o Brasil.", "Mais de 500 clientes satisfeitas e zero devoluções."],
    ["invented_testimonial", "Mais de 500 clientes satisfeitas em todo o Brasil.", "Mais de 500 clientes satisfeitas só em São Paulo."],
  ])("%s: passa a honesta, barra a vizinha", (gate, honest, lie) => {
    expect(verdict(honest, gate), honest).toBe("pass");
    expect(verdict(lie, gate), lie).toBe("block");
  });
});
