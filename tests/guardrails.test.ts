import { describe, expect, it } from "vitest";
import { classifyOptOut, gateNames, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const blocked = (result: ReturnType<typeof runGates>) =>
  result.traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("a cadeia inteira", () => {
  it("tem os dezoito gates", () => {
    expect(gateNames).toHaveLength(18);
  });

  it("deixa passar a mensagem correta do funil", () => {
    const text =
      "O colete sai por R$ 129,90 com o frete já incluído, e você paga na entrega. " +
      "Chega em 1 a 3 dias e a entrega é agendada.";
    const result = runGates(text, ctx());
    expect(result.allowed).toBe(true);
  });

  it("devolve o trace de todos os gates, não só do primeiro que vetou", () => {
    const result = runGates("qualquer coisa", ctx({ optedOut: true }));
    expect(result.traces).toHaveLength(18);
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
    const r = runGates("Chega em 1 a 3 dias, e a entrega é agendada.", ctx());
    expect(blocked(r)).not.toContain("delivery_promise");
  });

  /**
   * As duas janelas são diferentes, e a do COD dita no antecipado é uma promessa que a
   * operação não cumpre — 1 a 3 dias lá é o prazo de outro caminho de pagamento.
   */
  it("aceita o prazo real do antecipado, e recusa o prazo do COD dito lá", () => {
    expect(
      blocked(runGates("No antecipado chega em 5 a 10 dias.", ctx({ paymentPath: "prepay" }))),
    ).not.toContain("delivery_promise");
    expect(
      blocked(runGates("No antecipado chega em 1 a 3 dias.", ctx({ paymentPath: "prepay" }))),
    ).toContain("delivery_promise");
  });

  it("veta preço que não é o configurado", () => {
    const r = runGates("O colete sai por R$ 119,90 hoje!", ctx());
    expect(blocked(r)).toContain("price_promise");
  });

  it("aceita os dois preços da operação e a economia entre eles", () => {
    const r = runGates(
      `No antecipado sai por R$ ${config.prices.prepayBrl.toFixed(2).replace(".", ",")} ` +
        "em vez de R$ 129,90 — economia de R$ 19,49.",
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

/**
 * Pechinchar é a mensagem mais comum de um funil COD, e recusar é a resposta certa.
 * Confirmado em produção antes da correção: "Não consigo oferecer 30% de desconto"
 * era vetado, queimava duas reescritas e terminava em handoff — para um turno que a
 * agente já tinha acertado de primeira.
 */
describe("recusar um número não é prometê-lo", () => {
  it("deixa a agente negar desconto que não existe", () => {
    const texto =
      "Não consigo oferecer 30% de desconto. Você pode pagar R$ 129,90 na entrega, " +
      "ou antecipado com 15% de desconto por R$ 110,41.";
    expect(runGates(texto, ctx()).allowed).toBe(true);
  });

  it("deixa a agente negar um preço que não pratica", () => {
    expect(runGates("Não é R$ 99,90, o valor é R$ 129,90 com frete incluído.", ctx()).allowed).toBe(
      true,
    );
  });

  it("mas prometer o mesmo número continua barrado", () => {
    expect(blocked(runGates("Consigo 30% de desconto pra você!", ctx()))).toContain(
      "price_promise",
    );
    expect(blocked(runGates("Hoje sai por R$ 99,90.", ctx()))).toContain("price_promise");
  });

  it("e a negação não atravessa a fronteira da frase", () => {
    expect(
      blocked(runGates("Não temos frete grátis: hoje sai por R$ 99,90.", ctx())),
    ).toContain("price_promise");
  });
});

/**
 * A mesma cegueira, varrida em toda a cadeia: um gate que só enxerga o token barra a
 * frase honesta que o contém. Cada caso abaixo foi confirmado barrando antes da
 * correção, e cada um é a resposta certa para uma pergunta que a cliente faz sempre.
 */
describe("negar não é prometer, em toda a cadeia", () => {
  it("a agente pode dizer que não é gente — que é o que o prompt exige", () => {
    const texto = "Não sou uma pessoa, sou a assistente virtual da Encorpa. Quer que eu chame alguém do time?";
    expect(runGates(texto, ctx()).allowed).toBe(true);
  });

  it("mas negar ser robô continua barrado, porque a negação é a própria infração", () => {
    expect(blocked(runGates("Não sou um robô, pode confiar.", ctx()))).toContain("humanity_claim");
    expect(blocked(runGates("Sou uma pessoa de verdade!", ctx()))).toContain("humanity_claim");
  });

  it("a agente pode recusar o prazo impossível", () => {
    const texto = "Não consigo entregar amanhã. A entrega é agendada e leva de 1 a 3 dias.";
    expect(runGates(texto, ctx()).allowed).toBe(true);
  });

  it("mas prometer amanhã continua barrado", () => {
    expect(blocked(runGates("Chega amanhã na sua casa!", ctx()))).toContain("delivery_promise");
  });

  it("a agente pode dizer que não há cupom", () => {
    expect(runGates("Não temos cupom de desconto no momento.", ctx()).allowed).toBe(true);
  });

  it("mas anunciar cupom inexistente continua barrado", () => {
    expect(blocked(runGates("Tenho um cupom especial pra você!", ctx()))).toContain(
      "coupon_exists",
    );
  });
});

/**
 * A cegueira oposta à do bloco acima: um gate que confunde qualquer negativa com uma
 * negação da própria alegação deixa passar o que existe para barrar. Cada caso aqui
 * foi confirmado **passando** contra a versão anterior da cadeia, com a configuração
 * real de produção — não é hipótese.
 */
describe("uma negativa qualquer não é uma negação da alegação", () => {
  it('"sem juros" não libera um preço inventado', () => {
    expect(blocked(runGates("Sem juros e sem burocracia, sai por R$ 59,90 hoje.", ctx()))).toContain(
      "price_promise",
    );
  });

  it('"sem esperar" não libera a promessa de entrega para amanhã', () => {
    expect(blocked(runGates("Sem esperar muito, chega amanhã na sua casa!", ctx()))).toContain(
      "delivery_promise",
    );
  });

  it('mas "nem", que carrega a negação da frase, continua liberando', () => {
    expect(runGates("Ele não emagrece nem elimina gordura — ele modela.", ctx()).allowed).toBe(true);
  });
});

/**
 * O gate de preço lia a mensagem inteira para decidir se um "%" era desconto. Isso
 * errava nos dois sentidos, e os dois custam: uma oferta sem a palavra "desconto"
 * passava, e a ficha técnica do tecido era vetada — reescrita paga por uma frase
 * correta.
 */
describe("porcentagem: desconto é decidido pela vizinhança do número", () => {
  it("uma oferta sem a palavra desconto continua sendo uma oferta", () => {
    expect(blocked(runGates("Te dou 30% agora se você fechar comigo.", ctx()))).toContain(
      "price_promise",
    );
  });

  it("composição de tecido não é desconto", () => {
    expect(runGates("O tecido é 92% poliamida e 8% elastano.", ctx()).allowed).toBe(true);
  });

  it("e a composição continua liberada mesmo quando a mensagem fala de desconto", () => {
    const texto =
      "No antecipado são 15% de desconto, e o tecido é 92% poliamida com 8% elastano.";
    expect(runGates(texto, ctx()).allowed).toBe(true);
  });
});

/**
 * "Custa 200 reais" é a mesma promessa que "custa R$ 200,00", e só a segunda era vista.
 */
describe("preço escrito por extenso conta como preço", () => {
  it("barra um valor em reais que a operação não pratica", () => {
    expect(blocked(runGates("Fica só 200 reais, fechado?", ctx()))).toContain("price_promise");
  });

  it("e deixa passar o valor configurado escrito do mesmo jeito", () => {
    expect(runGates("Fica 129,90 reais, com frete incluído.", ctx()).allowed).toBe(true);
  });
});

/**
 * O gate de depoimento lia toda aspa como depoimento. Repetir a pergunta da própria
 * cliente de volta é escrita normal, e era vetada — reescrita paga por uma frase certa.
 */
describe("depoimento é a aspa que alguém assina", () => {
  it("repetir a pergunta da cliente de volta não é depoimento", () => {
    const r = runGates('Você perguntou "qual tamanho eu peço?" — me diz seu manequim 💛', ctx());
    expect(r.allowed).toBe(true);
  });

  it("mas a aspa atribuída a alguém continua vetada", () => {
    expect(
      blocked(runGates('Uma cliente me disse: "mudou minha vida, perdi 10 cm"', ctx())),
    ).toContain("invented_testimonial");
  });
});

describe("porcentagem escrita por extenso conta igual", () => {
  it('"30 por cento" é a mesma oferta que "30%"', () => {
    expect(blocked(runGates("Te dou 30 por cento de desconto agora.", ctx()))).toContain(
      "price_promise",
    );
  });
});

/**
 * O defeito que a produção pegou na v15, no turno mais caro do funil.
 *
 * O prompt manda a agente dizer as duas metades na mesma frase — prazo de entrega e
 * garantia. O `3` de "1 a 3 dias" cai a menos de quarenta caracteres de "trocar", e o
 * gate de garantia lia isso como uma garantia de cinco dias: veto, reescrita, e a
 * cliente que tinha acabado de dizer "quero comprar" recebeu uma resposta de desvio.
 *
 * Garantia nesta operação nunca é faixa, é um número só — então dígito que pertence a
 * um "N a M dias" é logística, e não é deste gate.
 */
describe("garantia não confunde prazo de entrega com prazo de troca", () => {
  const garantia = (texto: string) =>
    runGates(texto, ctx()).traces.find((t) => t.gate === "warranty_promise")!;

  it("a frase que a produção vetou passa", () => {
    expect(
      garantia(
        "Entrega em 1 a 3 dias e você tem 7 dias para trocar ou devolver.",
      ).verdict,
    ).toBe("pass");
  });

  it("passa nas duas ordens, e com a faixa colada na palavra troca", () => {
    for (const frase of [
      "Você tem 7 dias pra devolver, e a entrega leva de 1 a 3 dias.",
      "São 1 a 3 dias pra chegar; se não servir, troca em 7 dias.",
      "Chega em 1 a 3 dias, dá pra trocar depois.",
    ]) {
      expect(garantia(frase).verdict, frase).toBe("pass");
    }
  });

  it("e continua barrando a garantia que ninguém prometeu", () => {
    for (const frase of [
      "Você tem 30 dias para devolver.",
      "A troca vale por 15 dias.",
      "Entrega em 1 a 3 dias e você tem 30 dias pra trocar.",
    ]) {
      expect(garantia(frase).verdict, frase).toBe("block");
    }
  });
});

/**
 * O gate que fecha o buraco mais caro do funil: a agente indicava tamanho sem nada
 * para consultar, e a cliente descobria o "não há disponibilidade" no checkout, depois
 * de já ter escolhido. Indicar é compromisso; perguntar não é.
 */
describe("não indicar tamanho sem consultar", () => {
  it("barra a indicação quando nada foi consultado", () => {
    expect(blocked(runGates("Pelo que você me disse, indico o G.", ctx())))
      .toContain("unverified_size");
    expect(blocked(runGates("No seu caso é GG mesmo.", ctx())))
      .toContain("unverified_size");
  });

  it("deixa passar quando a consulta confirmou aquele tamanho", () => {
    const checked = { ...ctx(), sizeChecked: "G" };
    expect(blocked(runGates("Pelo que você me disse, indico o G.", checked)))
      .not.toContain("unverified_size");
  });

  it("barra quando a consulta foi de outro tamanho", () => {
    const checked = { ...ctx(), sizeChecked: "G" };
    expect(blocked(runGates("Pelo que você me disse, indico o GG.", checked)))
      .toContain("unverified_size");
  });

  it("perguntar e mostrar a tabela continua liberado", () => {
    // Se o gate barrasse isto, a agente não conseguiria fazer a pergunta que o abre.
    for (const t of [
      "Você usa que número de calça?",
      "A tabela vai de P a XGG — me diz o seu número que eu vejo qual é.",
      "Me manda seu CEP que eu confirmo o tamanho certo pra sua região.",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("unverified_size");
    }
  });
});
