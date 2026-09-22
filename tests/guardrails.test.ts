import { describe, expect, it } from "vitest";
import { classifyOptOut, gateBriefing, gateNames, runGates } from "@/agent/guardrails.js";
import { config, ctx, ctxGratis } from "./fixtures.js";

const blocked = (result: ReturnType<typeof runGates>) =>
  result.traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("a cadeia inteira", () => {
  it("tem os dezenove gates", () => {
    expect(gateNames).toHaveLength(19);
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
    expect(result.traces).toHaveLength(19);
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
      blocked(runGates("No antecipado o prazo varia, em média 5 dias úteis.", ctx({ paymentPath: "prepay" }))),
    ).not.toContain("delivery_promise");
    expect(
      blocked(runGates("No antecipado chega em 1 a 3 dias.", ctx({ paymentPath: "prepay" }))),
    ).toContain("delivery_promise");
  });

  it("veta preço que não é o configurado", () => {
    const r = runGates("O colete sai por R$ 119,90 hoje!", ctx());
    expect(blocked(r)).toContain("price_promise");
  });

  it("aceita os preços da operação, e a economia só enquanto ela existir", () => {
    // Com o desconto do antecipado em zero (2026-09-09) os dois caminhos custam o mesmo,
    // então "economia de R$ 19,49" virou um número que a loja não tem. Enquanto houvesse
    // desconto, a diferença era citável — é por isso que ela entra na lista pelo cálculo
    // e não escrita à mão.
    const preco = config.prices.prepayBrl.toFixed(2).replace(".", ",");
    expect(blocked(runGates(`No antecipado sai por R$ ${preco}, o mesmo valor.`, ctx())))
      .not.toContain("price_promise");
    expect(blocked(runGates("A economia é de R$ 19,49.", ctx()))).toContain("price_promise");
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
      "ou antecipado, pelo mesmo R$ 129,90.";
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
      "O tecido é 92% poliamida com 8% elastano.";
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
 * O gate mudou de metade em 2026-09-09, depois que o operador leu a transcrição: ele
 * proibia DIZER o tamanho antes de checar a região, então quem perguntava "uso 42, qual
 * o meu?" recebia um pedido de CEP no lugar da resposta. Qual tamanho serve e se ele
 * chega são perguntas diferentes; só a segunda precisa de consulta.
 */
describe("dizer o tamanho é livre; dizer que TEM não é", () => {
  it("indicar pela tabela passa, mesmo sem nenhuma consulta", () => {
    for (const t of [
      "Pelo que você me disse, o seu é o G.",
      "No seu caso é GG mesmo.",
      "Indico o G — e me manda seu CEP que eu vejo a entrega aí?",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("unverified_size");
    }
  });

  it("prometer estoque antes da consulta é o veto", () => {
    for (const t of [
      "Tem no seu tamanho, pode ficar tranquila.",
      "O G está disponível pra sua região.",
      "Já reservei o GG pra você.",
      "Temos o M em estoque.",
    ]) {
      expect(blocked(runGates(t, ctx()))).toContain("unverified_size");
    }
  });

  it("com a região consultada, a promessa é liberada", () => {
    const checked = { ...ctx(), sizeChecked: "G" };
    expect(blocked(runGates("O G está disponível pra sua região.", checked)))
      .not.toContain("unverified_size");
  });

  it("negar a disponibilidade continua liberado", () => {
    // Dizer que NÃO tem é a resposta honesta, e barrá-la deixaria a agente muda.
    expect(blocked(runGates("Não tem entrega agendada no seu CEP, mas o antecipado chega.", ctx())))
      .not.toContain("unverified_size");
  });

  it("perguntar e mostrar a tabela seguem livres", () => {
    for (const t of [
      "Você usa que número de calça?",
      "A tabela vai de P a XGG — me diz o seu número que eu vejo qual é.",
      "Me manda seu CEP que eu confirmo a entrega na sua região.",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("unverified_size");
    }
  });
});

/**
 * "Hoje" é promessa quebrada até o checkout dizer o contrário. Quando a consulta
 * devolve a modalidade Express para o CEP dela, vira fato — e é o melhor argumento
 * que este funil tem.
 */
describe("Express, e só quando ele existe", () => {
  const frase = "Se você fechar agora, chega hoje mesmo, em até 4 horas.";

  it("sem Express na consulta, continua barrado", () => {
    expect(blocked(runGates(frase, ctx()))).toContain("delivery_promise");
  });

  it("com Express confirmado para o CEP dela, passa", () => {
    expect(blocked(runGates(frase, { ...ctx(), sameDayWindow: true })))
      .not.toContain("delivery_promise");
  });

  it("Express não libera prometer amanhã", () => {
    // A modalidade é do mesmo dia. "Amanhã" continua sendo uma data que ninguém agendou.
    expect(blocked(runGates("Chega amanhã sem falta.", { ...ctx(), sameDayWindow: true })))
      .toContain("delivery_promise");
  });
});

/**
 * Contar que o Express existe é honesto e converte; dizer que vai acontecer no
 * endereço dela é promessa que só o checkout pode fazer. A diferença é uma cláusula.
 */
describe("contar que o Express existe, sem prometer", () => {
  it("passa quando devolve a pergunta para o checkout", () => {
    for (const t of [
      "Tem uma opção Express que entrega hoje mesmo — dá pra conferir a disponibilidade da sua região no checkout.",
      "Se estiver disponível aí, você recebe hoje em até 4 horas.",
      "A entrega no mesmo dia depende da sua região; o checkout mostra.",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("delivery_promise");
    }
  });

  it("continua barrando a promessa seca", () => {
    expect(blocked(runGates("Você recebe hoje mesmo, garantido.", ctx())))
      .toContain("delivery_promise");
  });
});

/**
 * O gate do frete tem duas metades e já virou de lado duas vezes. Em 2026-09-09 o
 * operador zerou o frete na oferta da entrega e a frase que o gate barrava ("frete
 * grátis") virou verdade. Em 2026-09-22 ele decidiu que a operação **não** oferece frete
 * grátis, e o padrão voltou a ser `freeShipping: false`.
 *
 * Este bloco cobre o ramo `freeShipping: true` — que não é mais o padrão e continua
 * precisando de teste, porque um gate com metade sem cobertura é um gate que ninguém
 * consegue reverter com segurança.
 */
describe("ramo freeShipping: true — grátis é verdade, cobrar é a mentira", () => {
  it("dizer que é grátis passa", () => {
    for (const t of [
      "O frete é grátis, você paga só os R$ 129,90 na entrega.",
      "Frete por nossa conta, em qualquer forma de pagamento.",
      "No antecipado o frete é grátis também.",
    ]) {
      expect(blocked(runGates(t, ctxGratis()))).not.toContain("shipping_promise");
    }
  });

  it("cobrar frete dela é o veto deste ramo", () => {
    for (const t of [
      "São R$ 129,90 mais o frete.",
      "O frete é calculado à parte no checkout.",
      "O frete fica R$ 24,98, pago na entrega.",
      "O frete não está incluído.",
    ]) {
      expect(blocked(runGates(t, ctxGratis()))).toContain("shipping_promise");
    }
  });

  it("negar a cobrança continua liberado", () => {
    // "o frete NÃO é à parte" é a resposta honesta à pergunta mais comum do funil.
    expect(blocked(runGates("O frete não é cobrado à parte, já está tudo incluso.", ctxGratis())))
      .not.toContain("shipping_promise");
  });
});

/**
 * O ramo que a produção passa a rodar: `freeShipping: false`, o padrão do `config` desde
 * 2026-09-22. Prometer grátis é a mentira; dizer que o frete existe, sem dar valor, é a
 * frase honesta do antecipado.
 */
describe("ramo freeShipping: false — o padrão, e o inverso do bloco acima", () => {
  it("prometer grátis é o veto", () => {
    for (const t of [
      "O frete é grátis!",
      "Frete por nossa conta, em qualquer forma de pagamento.",
      "Não tem frete, você paga só os R$ 129,90.",
    ]) {
      expect(blocked(runGates(t, ctx()))).toContain("shipping_promise");
    }
  });

  it("frete que existe e não tem valor citado passa", () => {
    for (const t of [
      "São R$ 129,90 mais o frete.",
      "O frete é calculado à parte no checkout.",
      "No pagamento na entrega o frete já está incluído no preço.",
    ]) {
      expect(blocked(runGates(t, ctx()))).not.toContain("shipping_promise");
    }
  });

  it("dar um valor ao frete continua barrado nos dois ramos", () => {
    // Nenhuma das duas ofertas tem um número de frete citável: na entrega ele está
    // dentro do preço, no antecipado é o checkout que calcula por região.
    expect(blocked(runGates("O frete fica R$ 24,98.", ctx()))).toContain("shipping_promise");
    expect(blocked(runGates("São R$ 12,99 de frete.", ctx()))).toContain("shipping_promise");
  });
});

/**
 * A configuração que a produção passa a rodar em 2026-09-10, com os três campos juntos:
 * frete da cliente no antecipado, 10% de desconto e R$ 116,91. Os testes acima cobrem
 * cada campo isolado — nunca a combinação, que é a única que existe de verdade.
 */
describe("preço, desconto e frete depois de 2026-09-10", () => {
  const config0910: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const cod = ctx({ config: config0910 });
  const prepay = ctx({ config: config0910, paymentPath: "prepay" as const });

  it("os 10% do antecipado são citáveis", () => {
    expect(blocked(runGates("No antecipado você tem 10% de desconto.", prepay)))
      .not.toContain("price_promise");
  });

  it("a economia de R$ 12,99 é citável", () => {
    // codBrl − prepayBrl = 129,90 − 116,91. O gate admite a diferença entre os dois
    // preços como valor citável; se ela deveria ser citada sem descontar o frete real
    // é decisão comercial em aberto, e este teste documenta o comportamento de hoje.
    expect(blocked(runGates("Você economiza R$ 12,99 pagando antecipado.", prepay)))
      .not.toContain("price_promise");
  });

  it("frete grátis não passa em nenhum dos dois caminhos", () => {
    expect(blocked(runGates("O frete é grátis!", cod))).toContain("shipping_promise");
    expect(blocked(runGates("No antecipado o frete é grátis também.", prepay)))
      .toContain("shipping_promise");
  });

  /**
   * O furo que a revisão pegou: a branch de `freeShipping: false` fazia `return` cedo e
   * levava embora TODA a regra de valor de frete. Sobrava o `price_promise` travando
   * número — e ele só verifica se o valor é um dos preços configurados, então R$ 129,90,
   * R$ 116,91 e a própria economia de R$ 12,99 passavam **como se fossem frete**. Um
   * preço configurado lido como frete continua sendo mentira: nenhuma das duas ofertas
   * tem valor de frete citável (no COD está dentro do preço, no antecipado é calculado
   * por região dentro do checkout).
   */
  it("nenhum valor pode ser atribuído a frete, nem um preço configurado", () => {
    for (const frase of [
      "O frete do antecipado é R$ 12,99.",
      "O frete fica R$ 116,91.",
      "O frete varia por região, fica em torno de R$ 12,99.",
      "O frete é R$ 19,90.",
      "São R$ 24,98 de frete.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("shipping_promise");
    }
  });

  it("mas a moldura que o briefing pede continua liberada", () => {
    // Estas são as frases que a agente TEM de poder dizer neste mundo. Vetá-las manda
    // toda resposta correta para o laço de reescrita e de lá para o handoff.
    for (const frase of [
      "O frete já está dentro do preço: são R$ 129,90 na entrega.",
      "Na entrega o frete vem embutido, você paga R$ 129,90 na porta.",
      "No antecipado o frete é calculado por região dentro do checkout.",
      "O valor é R$ 116,91 e o frete é calculado no checkout conforme a sua região.",
      // Preço do produto com o frete à parte, valor do frete não dito: é exatamente a
      // frase honesta do antecipado neste mundo, e o teste vizinho já a exigia.
      "São R$ 129,90 mais o frete.",
    ]) {
      expect(blocked(runGates(frase, frase.includes("antecipado") || frase.includes("116") ? prepay : cod)), frase)
        .not.toContain("shipping_promise");
    }
  });

  it("o briefing manda dizer frete embutido no COD e calculado no checkout", () => {
    const linha = gateBriefing(config0910).find((b) => b.includes("frete"))!;
    expect(linha).toContain('Nunca diga "frete grátis"');
    expect(linha).toContain("já está dentro do preço");
    expect(linha).toContain("calculado por região dentro do checkout");
  });
});

/**
 * A brecha que a sonda adversarial pegou depois da inversão: "o frete depende da sua
 * região" não cobra um valor, não usa "à parte" e mesmo assim diz que existe frete
 * variável — que é falso nos dois caminhos desde que o operador zerou a oferta.
 */
describe("frete que varia também é cobrança (ramo freeShipping: true)", () => {
  it("barra dizer que o frete depende ou varia", () => {
    for (const t of ["O frete vai depender da sua região.", "O frete varia conforme o CEP."]) {
      expect(blocked(runGates(t, ctxGratis()))).toContain("shipping_promise");
    }
  });

  it("negar a variação continua liberado, e o PRAZO pode variar", () => {
    // O prazo varia de verdade; só o frete é que não. Um gate que confunde os dois
    // proíbe a agente de responder a pergunta mais comum depois do preço.
    for (const t of [
      "O frete não depende da região, é grátis em qualquer lugar.",
      "O prazo de entrega depende da sua região.",
    ]) {
      expect(blocked(runGates(t, ctxGratis()))).not.toContain("shipping_promise");
    }
  });

  it("no padrão (false) o frete variar por região é verdade e passa", () => {
    // É literalmente como o checkout do antecipado funciona: calcula por região.
    expect(blocked(runGates("O frete varia conforme o CEP.", ctx())))
      .not.toContain("shipping_promise");
  });
});

/**
 * Os quatro achados do code review sobre o gate do frete, cada um com a frase que
 * produzia o erro. Três eram falso positivo — e um falso positivo aqui é pior que um
 * falso negativo: a frase que o prompt manda escrever entrava no laço de reescrita e
 * saía do outro lado como handoff.
 */
describe("o gate do frete depois do review (ramo freeShipping: true)", () => {
  it("um valor ao lado de 'frete' numa frase que afirma o grátis é o PREÇO", () => {
    for (const t of ["Frete grátis, R$ 129,90 na entrega.", "Sem frete a mais: R$ 129,90."]) {
      expect(blocked(runGates(t, ctxGratis()))).not.toContain("shipping_promise");
    }
  });

  it("a janela não atravessa a vírgula para a cláusula do prazo", () => {
    expect(blocked(runGates("O frete é grátis, mas o prazo depende da região.", ctxGratis())))
      .not.toContain("shipping_promise");
  });

  it("'mais o frete' negado também passa", () => {
    expect(blocked(runGates("Não é R$ 129,90 mais o frete, o frete é grátis.", ctxGratis())))
      .not.toContain("shipping_promise");
  });

  it("cobrança sem verbo antes e sem valor continua barrada", () => {
    for (const t of [
      "O frete fica por sua conta.",
      "Tem um frete de entrega que você paga depois.",
    ]) {
      expect(blocked(runGates(t, ctxGratis()))).toContain("shipping_promise");
    }
  });
});

/**
 * A produção lê o config inteiro de um secret que sobrescreve o fallback do código. Uma
 * chave nova nasce ausente lá até alguém editar o secret — e `freeShipping` ausente,
 * quando era obrigatória, lia como `false` e reinstalava o veto antigo em produção com
 * todos os testes daqui passando. O padrão tem que ser a verdade.
 */
describe("config de produção sem a chave nova", () => {
  // A chave é OMITIDA, não posta como undefined: é assim que ela chega da produção,
  // onde o `BUSINESS_CONFIG` foi escrito antes de a chave existir no código.
  const { freeShipping: _omitida, ...deliverySemAChave } = config.delivery;
  const semAChave = { ...ctx(), config: { ...config, delivery: deliverySemAChave } };

  it("frete grátis continua liberado quando a chave não existe", () => {
    expect(blocked(runGates("O frete é grátis nos dois casos.", semAChave)))
      .not.toContain("shipping_promise");
  });

  it("só `false` explícito volta a regra antiga", () => {
    const desligado = {
      ...ctx(),
      config: { ...config, delivery: { ...config.delivery, freeShipping: false } },
    };
    expect(blocked(runGates("O frete é grátis nos dois casos.", desligado)))
      .toContain("shipping_promise");
  });
});

/**
 * A ambiguidade que não é mentira e custa a venda. O operador achou numa transcrição
 * real: cada oração é verdadeira, e lidas juntas dizem que o prazo vale para os dois
 * caminhos — e não vale. Ela pergunta de novo, o que já é falha da agente, ou não
 * pergunta e espera a data errada, que é a recusa na porta.
 */
describe("prazo com as duas opções na mesa", () => {
  it("barra o prazo solto quando as duas formas estão lado a lado", () => {
    const frase =
      "Para o tamanho G, a entrega fica na janela de 1 a 3 dias e o frete é grátis. " +
      "Você prefere pagar R$ 129,90 na entrega ou antecipar, pelo mesmo valor?";
    expect(blocked(runGates(frase, ctx()))).toContain("unattributed_window");
  });

  it("passa quando cada prazo diz de quem é", () => {
    const frase =
      "No pagamento na entrega você recebe em 1 a 3 dias e paga R$ 129,90 na mão do " +
      "entregador. No antecipado o prazo varia, em média 5 dias úteis.";
    expect(blocked(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("mensagem de um caminho só não precisa de rótulo", () => {
    expect(blocked(runGates("A entrega leva de 1 a 3 dias e você escolhe o dia.", ctx())))
      .not.toContain("unattributed_window");
  });
});

/**
 * A segunda metade do mesmo defeito, achada na sonda de produção depois da primeira
 * correção: a agente comparou as duas formas e deu prazo só na entrega. Ela lê os dois
 * blocos lado a lado, um tem data e o outro não, e preenche o buraco com o número que
 * acabou de ler.
 */
describe("prazo em uma opção só", () => {
  it("barra a comparação com prazo só num dos lados", () => {
    const frase =
      "Na entrega você paga R$ 129,90 quando o colete chegar, em 1 a 3 dias. " +
      "Antecipado você paga R$ 129,90 agora, com frete grátis.";
    expect(blocked(runGates(frase, ctx()))).toContain("unattributed_window");
  });

  it("passa com o prazo dos dois lados", () => {
    const frase =
      "Na entrega você recebe em 1 a 3 dias e paga R$ 129,90 na mão do entregador. " +
      "No antecipado o prazo varia por região, em média 5 dias úteis.";
    expect(blocked(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("passa sem prazo nenhum — comparar só preço é legítimo", () => {
    const frase = "Na entrega são R$ 129,90 na mão do entregador; antecipado, o mesmo valor.";
    expect(blocked(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("'agendada' não é rótulo: é a nossa palavra, não a dela", () => {
    const frase =
      "A entrega é agendada para 1 a 3 dias. Você prefere pagar na entrega ou antecipado?";
    expect(blocked(runGates(frase, ctx()))).toContain("unattributed_window");
  });
});

/**
 * O gate do prazo escolhia UM caminho pelo contexto, e a mensagem de comparação carrega
 * os dois de propósito — um por opção. O resultado é que a frase que o prompt ensina
 * nunca podia passar: metade certa dela era lida como contradição.
 */
describe("cada prazo julgado pelo caminho que a frase dele nomeia", () => {
  const exemplar =
    "Na entrega: você escolhe um dos próximos 3 dias, recebe em casa e paga R$ 129,90 " +
    "na mão do entregador, só quando o pacote chegar.\n\n" +
    "Antecipado: você paga R$ 129,90 agora, e o prazo varia por região, em média 5 dias úteis.\n\n" +
    // Era "Nos dois o frete é grátis" até 2026-09-22, quando o operador decidiu que a
    // operação não oferece frete grátis. O exemplar acompanha o prompt: se a frase que o
    // prompt ensina não passa a cadeia, a agente entra em laço de reescrita por desenho.
    "Na entrega o frete já está dentro do preço; no antecipado ele é calculado no " +
    "checkout. Qual você prefere?";

  it("o exemplar do próprio prompt passa a cadeia inteira", () => {
    expect(runGates(exemplar, ctx()).allowed).toBe(true);
  });

  it("trocar as janelas de lugar continua sendo veto", () => {
    expect(blocked(runGates("Na entrega chega em 3 a 10 dias.", ctx())))
      .toContain("delivery_promise");
    expect(blocked(runGates("No antecipado chega em 1 a 3 dias.", ctx())))
      .toContain("delivery_promise");
  });

  it("prazo que não é de nenhum dos dois continua barrado", () => {
    expect(blocked(runGates("No antecipado chega em 1 a 20 dias.", ctx())))
      .toContain("delivery_promise");
  });
});

describe("`prepayVariesByRegion` desligado apaga a média, não só a palavra", () => {
  const semVariacao = {
    ...config,
    delivery: { ...config.delivery, prepayAvgDays: 5, prepayVariesByRegion: false },
  };

  it("com a chave desligada, nenhum prazo do antecipado passa — nem o número certo", () => {
    const r = runGates(
      "No antecipado varia por região, em média 5 dias úteis.",
      ctx({ config: semVariacao, paymentPath: "prepay" }),
    );
    expect(blocked(r)).toContain("delivery_promise");
  });

  it("o briefing manda não dizer prazo nenhum, em vez de ensinar a média", () => {
    const linha = gateBriefing(semVariacao).find((b) => b.includes("Prazo na entrega"))!;
    expect(linha).toContain("não diga prazo nenhum");
    expect(linha).not.toContain("em média 5");
  });

  it("ligada, a média volta a valer", () => {
    const comVariacao = { ...semVariacao, delivery: { ...semVariacao.delivery, prepayVariesByRegion: true } };
    const r = runGates(
      "No antecipado varia por região, em média 5 dias úteis.",
      ctx({ config: comVariacao, paymentPath: "prepay" }),
    );
    expect(blocked(r)).not.toContain("delivery_promise");
  });
});
