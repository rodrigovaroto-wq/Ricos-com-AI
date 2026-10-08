import { describe, expect, it } from "vitest";
import { classifyOptOut, gateBriefing, gateNames, runGates } from "@/agent/guardrails.js";
import { BUSINESS_TZ, hourIn } from "@/agent/guardrails.js";
import { config, ctx, ctxGratis } from "./fixtures.js";

const blocked = (result: ReturnType<typeof runGates>) =>
  result.traces.filter((t) => t.verdict === "block").map((t) => t.gate);
/** Soft gates (2026-09-24) record `warn` and never block. */
const warned = (result: ReturnType<typeof runGates>) =>
  result.traces.filter((t) => t.verdict === "warn").map((t) => t.gate);

describe("a cadeia inteira", () => {
  it("tem os vinte e sete gates", () => {
    // O vigésimo, `coverage_claim`, entrou na rodada 3 das personas (2026-09-24); o vigésimo
    // primeiro, `order_action_claim`, na rodada de 2026-10-05 (Lu: "já deixo cancelado"); o
    // vigésimo segundo, `internal_note`, na rodada de 2026-10-07 (Jussara: "Need ask CEP."); o
    // vigésimo terceiro, `pending_promise`, e o vigésimo quarto, `noted_claim`, no segundo teste real
    // (grafo §66: "já te mando o link" 4×, "anotei" 5×); o vigésimo quinto, `size_claim`, na revisão do §66
    // (Karol: "Com 38 de calça o seu é o M" sem ela dar a medida).
    expect(gateNames).toHaveLength(27);
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
    expect(result.traces).toHaveLength(27);
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

  it("a mesma mensagem literal saindo de novo fica registrada, sem vetar (gate brando)", () => {
    const text = "Oi! Ficou alguma dúvida sobre o colete?";
    const r = runGates(text, ctx({ recentOutbound: [text] }));
    expect(warned(r)).toContain("identical_template");
    expect(blocked(r)).not.toContain("identical_template");
    expect(r.allowed).toBe(true);
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
const comExpress = { ...config, delivery: { ...config.delivery, expressActive: true } };

describe("Express, e só quando ele existe", () => {
  const frase = "Se você fechar agora, chega hoje mesmo, em até 4 horas.";

  it("sem Express na consulta, continua barrado", () => {
    expect(blocked(runGates(frase, ctx({ config: comExpress })))).toContain("delivery_promise");
  });

  it("com Express ativo e confirmado para o CEP dela, passa", () => {
    expect(blocked(runGates(frase, ctx({ config: comExpress, sameDayWindow: true }))))
      .not.toContain("delivery_promise");
  });

  it("Express não libera prometer amanhã", () => {
    // A modalidade é do mesmo dia. "Amanhã" continua sendo uma data que ninguém agendou.
    expect(blocked(runGates("Chega amanhã sem falta.", ctx({ config: comExpress, sameDayWindow: true }))))
      .toContain("delivery_promise");
  });
});

/**
 * Contar que o Express existe é honesto e converte; dizer que vai acontecer no
 * endereço dela é promessa que só o checkout pode fazer. A diferença é uma cláusula.
 */
describe("contar que o Express existe, sem prometer", () => {
  it("passa quando devolve a pergunta para o checkout, com Express ativo", () => {
    for (const t of [
      "Tem uma opção Express que entrega hoje mesmo — dá pra conferir a disponibilidade da sua região no checkout.",
      "Se estiver disponível aí, você recebe hoje em até 4 horas.",
      "A entrega no mesmo dia depende da sua região; o checkout mostra.",
    ]) {
      expect(blocked(runGates(t, ctx({ config: comExpress })))).not.toContain("delivery_promise");
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

  it("a economia de R$ 12,99 não é citável, nem com a ressalva do frete (saída A)", () => {
    // codBrl − prepayBrl = 129,90 − 116,91. Saída C (citável com ressalva) valeu até
    // 2026-09-22; a saída A tira o número. O bloco "saída A" abaixo cobre o resto.
    expect(blocked(runGates("Você economiza R$ 12,99 pagando antecipado, mais o frete.", prepay)))
      .toContain("price_promise");
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
    // A linha do preço também fala de frete desde a saída C (a ressalva da economia);
    // esta é a do gate do frete. Com `codFreeShipping: false` — o mundo de 22/09.
    const semGratisNaEntrega = { ...config0910, delivery: { ...config0910.delivery, codFreeShipping: false } };
    const linha = gateBriefing(semGratisNaEntrega).find(
      (b) => b.includes("frete") && !b.includes("Os únicos valores"),
    )!;
    expect(linha).toContain('Nunca diga "frete grátis"');
    expect(linha).toContain("já está dentro do preço");
    expect(linha).toContain("calculado por região dentro do checkout");
  });

  it("com a chave codFreeShipping ausente (2026-09-28), o briefing manda dizer o grátis da entrega com o caminho", () => {
    const linha = gateBriefing(config0910).find(
      (b) => b.includes("frete") && !b.includes("Os únicos valores"),
    )!;
    expect(linha).toContain("No pagamento na entrega o frete é grátis");
    expect(linha).toContain("Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber");
    expect(linha).toContain("calculado por região dentro do checkout");
    expect(linha).not.toContain('Nunca diga "frete grátis"');
  });
});

/**
 * Saída A (decisão do operador, 2026-09-22, Frente 4 item 6): a economia em reais do
 * antecipado — `codBrl − prepayBrl`, hoje R$ 12,99 — NUNCA é dita. A agente diz o
 * percentual e o preço do antecipado ("10% de desconto: R$ 116,91 no antecipado").
 *
 * Até aqui valia a saída C (citável com a ressalva do frete), e quatro rodadas de conserto
 * mostraram que o número em reais não se protege por regex: cada formulação de "economia"
 * era uma superfície, e "com o desconto de antecipado sai R$ 12,99" ainda passava. Tirar o
 * número do conjunto citável fecha todas de uma vez — em qualquer formulação, negada ou
 * não, com ou sem ressalva, nos dois caminhos e nos dois ramos de `freeShipping`.
 */
describe("a economia em reais nunca é citada (saída A)", () => {
  const config0922: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const { freeShipping: _omitida, ...deliverySemAChave } = config0922.delivery;
  const configs = {
    "freeShipping: false": config0922,
    "freeShipping ausente": { ...config0922, delivery: deliverySemAChave },
    "freeShipping: true": { ...config0922, delivery: { ...config0922.delivery, freeShipping: true } },
  };

  it("qualquer ocorrência do valor da economia veta, em qualquer formulação", () => {
    for (const frase of [
      // A frase que a saída C ainda deixava passar (com a ressalva, passava a cadeia).
      "Com o desconto de antecipado sai R$ 12,99.",
      "Com o desconto de antecipado sai R$ 12,99, e o frete é calculado no checkout.",
      // Sem "R$" nem "reais": `moneyMatches` não vê, e ainda é o número.
      "Você economiza 12,99 no produto, mais o frete.",
      // As que a saída C ensinava — com ressalva, dita como economia.
      "Você economiza R$ 12,99 no produto, e o frete é calculado no checkout.",
      "São R$ 12,99 a menos no produto, mais o frete.",
      "No antecipado sai R$ 12,99 mais barato, mais o frete da sua região.",
      "O frete é à parte; no produto você economiza R$ 12,99.",
      "Você economiza 12,99 reais no preço; o frete é cobrado à parte no checkout.",
      "Você tem um desconto de até R$ 12,99 no produto, e o frete é calculado no checkout.",
      // Sem ressalva, negada, ou em outra grafia.
      "Você economiza R$ 12,99 pagando antecipado.",
      "Não precisa esperar, você economiza R$ 12,99 no antecipado.",
      "Não é que você economize R$ 12,99 no total, o frete é à parte.",
      "Não consigo te dar R$ 12,99 de desconto.",
      "A diferença entre os dois é de R$12,99.",
      "Você economiza R$ 12.99 no produto, mais o frete.",
      // Dada como preço.
      "No antecipado o colete sai R$ 12,99, e o frete é calculado no checkout.",
      "O frete é calculado no checkout, e o preço cai no antecipado para R$ 12,99.",
    ]) {
      for (const [nome, cfg] of Object.entries(configs)) {
        for (const paymentPath of ["cod", "prepay"] as const) {
          const r = runGates(frase, ctx({ config: cfg, paymentPath }));
          expect(blocked(r), `${frase} | ${nome} | ${paymentPath}`).toContain("price_promise");
        }
      }
    }
  });

  it("o motivo do veto diz o que fazer: só o percentual", () => {
    const r = runGates("Você economiza R$ 12,99 no produto, mais o frete.", ctx({ config: config0922 }));
    const trace = r.traces.find((t) => t.gate === "price_promise")!;
    expect(trace.detail).toContain("saving in reais");
    expect(trace.detail).toContain("only the percentage");
  });

  it("o percentual e os dois preços continuam livres, pela cadeia inteira", () => {
    for (const frase of [
      "10% de desconto: R$ 116,91 no antecipado.",
      "No antecipado você tem 10% de desconto.",
      "Pagando antecipado tem 10% off.",
      "Na entrega são R$ 129,90; no antecipado, R$ 116,91 mais o frete.",
      "No antecipado são 10% de desconto: R$ 116,91, e o frete é calculado no checkout.",
    ]) {
      for (const paymentPath of ["cod", "prepay"] as const) {
        expect(blocked(runGates(frase, ctx({ config: config0922, paymentPath }))), frase).toEqual([]);
      }
    }
  });

  it("sem desconto configurado não há economia, e o número segue inexistente", () => {
    // Fixture padrão: prepayBrl = codBrl, economia zero. R$ 12,99 barra por não existir.
    expect(blocked(runGates("Você economiza R$ 12,99, mais o frete.", ctx({ paymentPath: "prepay" }))))
      .toContain("price_promise");
  });

  it("o frete citado antes de outro sujeito não é valor de frete (shipping_promise)", () => {
    // The amount belongs to whatever the verb is about; the freight was named before.
    for (const frase of [
      "O frete não está incluído, mas o produto sai R$ 12,99 mais barato no antecipado.",
      "O frete é à parte; no produto você economiza R$ 12,99.",
      "O frete é calculado no checkout, e o colete fica R$ 116,91 no antecipado.",
    ]) {
      expect(blocked(runGates(frase, ctx({ config: config0922, paymentPath: "prepay" }))), frase)
        .not.toContain("shipping_promise");
      expect(blocked(runGates(frase, ctx())), frase).not.toContain("shipping_promise");
    }
  });

  it("valor atribuído ao frete continua vetado, inclusive com produto como complemento", () => {
    const prepay = ctx({ config: config0922, paymentPath: "prepay" as const });
    for (const frase of [
      "O frete sai R$ 12,99.",
      "O frete fica R$ 24,98.",
      "São R$ 12,99 de frete.",
      "O frete do antecipado custa uns R$ 15.",
      // "do produto"/"do pedido" is a complement of freight, not a new subject.
      "O frete do produto sai R$ 15.",
      "O frete do pedido fica R$ 15.",
      // A clause break alone does not change the subject: "mas sai" still means freight.
      "O frete é à parte, mas sai R$ 15.",
      "O frete pra você fica R$ 15.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("shipping_promise");
      expect(blocked(runGates(frase, ctx())), frase).toContain("shipping_promise");
    }
  });

  it("o briefing ensina o percentual com o preço e proíbe a economia em reais, nos dois ramos", () => {
    for (const [nome, cfg] of Object.entries(configs)) {
      const linha = gateBriefing(cfg).find((b) => b.includes("Os únicos valores"))!;
      expect(linha, nome).toContain("10% de desconto: R$ 116,91 no antecipado");
      expect(linha, nome).toContain("economia em reais");
      expect(linha, nome).not.toContain("R$ 12,99");
      expect(gateBriefing(cfg).join("\n"), nome).not.toContain("R$ 12,99");
      expect(blocked(runGates("10% de desconto: R$ 116,91 no antecipado", ctx({ config: cfg }))), nome)
        .toEqual([]);
    }
  });
});

/**
 * Os dois furos que a revisão de código pegou na onda de 2026-09-22, ambos cegueira a
 * negação (ou à falta dela). O primeiro: a exceção "o produto sai R$ 12,99" (sujeito
 * novo) também engolia "o frete PARA o pedido é R$ 12,99" e "o frete, QUE o produto não
 * inclui, sai R$ 15" — artigo depois de preposição ou de relativo não abre sujeito. O
 * segundo: "nada de frete cobrado à parte" contava como ressalva, porque só `não`,
 * `nunca`, `jamais`, `nem` e `sem` negavam.
 */
describe("os dois furos de frete da revisão de 2026-09-22", () => {
  const config0910: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const prepay = ctx({ config: config0910, paymentPath: "prepay" as const });
  const cod = ctx({ config: config0910 });

  it("artigo depois de preposição ou de 'que' não abre sujeito novo: o valor é do frete", () => {
    for (const frase of [
      "O frete para o pedido é de R$ 12,99, calculado no checkout.",
      "No antecipado o frete com o pedido fica R$ 129,90.",
      "O frete, que o produto não inclui, sai R$ 15,00.",
      // Adversariais: outras preposições e outro relativo.
      "O frete sobre o pedido fica R$ 15.",
      "O frete, que a cinta não inclui, custa R$ 15.",
      "O frete por o colete sai R$ 20.",
      "O frete que o pedido paga é R$ 15.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("shipping_promise");
      expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
    }
  });

  it("o sujeito novo de verdade não é valor de frete (shipping_promise)", () => {
    // Saída A (2026-09-22): the R$ 12,99 sentences are vetoed by price_promise now; this
    // test only holds that the shipping gate does not read them as a freight amount.
    for (const frase of [
      "O frete não está incluído, mas o produto sai R$ 12,99 mais barato no antecipado.",
      "O frete é à parte; no produto você economiza R$ 12,99.",
      // Adversariais: uma preposição ANTES do sujeito novo não pode devolver o valor ao frete.
      "O frete é à parte, mas com o desconto o produto sai R$ 12,99 mais barato.",
      "O frete é calculado no checkout, e a cinta sai R$ 116,91 no antecipado.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).not.toContain("shipping_promise");
    }
    expect(blocked(runGates("O frete é calculado no checkout, e a cinta sai R$ 116,91 no antecipado.", prepay)))
      .toEqual([]);
  });

  it("ressalva negada por 'nada de', 'nenhum' ou 'esquece' não é ressalva", () => {
    for (const frase of [
      "Você economiza R$ 12,99 e nada de frete cobrado à parte.",
      "Você economiza R$ 12,99 e nenhum frete cobrado à parte.",
      "Você economiza R$ 12,99, e esquece frete cobrado à parte.",
      // Adversariais.
      "Você economiza R$ 12,99, e esqueça o frete cobrado à parte.",
      "Você economiza R$ 12,99 e zero frete cobrado à parte.",
      "Você economiza R$ 12,99, livre de frete cobrado à parte.",
      "Você economiza R$ 12,99 e nenhuma cobrança de frete à parte.",
    ]) {
      expect(runGates(frase, prepay).allowed, frase).toBe(false);
      expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
    }
  });

  it("'nada de frete', 'nenhum frete' e 'esquece o frete' prometem grátis (shipping_promise)", () => {
    for (const frase of [
      "Nada de frete: você paga só R$ 129,90.",
      "Nenhum frete, é só o valor do produto.",
      "Esquece o frete, ele é por nossa conta.",
      "Pode esquecer o frete.",
      "Zero frete pra você.",
    ]) {
      expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
    }
  });

  it("essas palavras negando outra coisa não prometem grátis; a economia veta (saída A)", () => {
    for (const frase of [
      // "nenhum" nega outra coisa, não o frete.
      "Você economiza R$ 12,99 sem nenhum custo escondido, mais o frete da sua região.",
      "Você economiza R$ 12,99 no produto, e o frete é calculado no checkout, nada de surpresa no valor.",
      "Nada muda no produto: você economiza R$ 12,99, mais o frete.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      expect(blocked(runGates(frase, prepay)), frase).not.toContain("shipping_promise");
    }
  });

  it("'não esqueça o frete' é lembrete de que ele existe, não promessa de grátis", () => {
    for (const frase of [
      "Não esqueça o frete, que é calculado no checkout.",
      "Não se esqueça do frete, ele é calculado por região.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).not.toContain("shipping_promise");
    }
  });

  it("decidido: 'nenhum frete grátis' continua vetado — o briefing proíbe as palavras, negadas ou não", () => {
    // A frase é honesta, mas o briefing diz 'Nunca diga "frete grátis"', e o gate tem de
    // ser a mesma promessa escrita duas vezes. A agente tem a frase direta para isso:
    // "o frete é calculado no checkout". Vetar custa uma reescrita; aceitar abriria
    // "nenhum frete, grátis pra você" pela mesma porta.
    expect(
      blocked(runGates("Nenhum frete grátis existe aqui, ele é calculado no checkout.", cod)),
    ).toContain("shipping_promise");
    expect(blocked(runGates("Nenhum frete, grátis pra você.", cod))).toContain("shipping_promise");
  });
});

/**
 * Os quatro achados do /code-review de 2026-09-22 sobre os gates de frete e de economia.
 * Todos são falso positivo — a frase honesta que o prompt manda escrever entrava no laço
 * de reescrita — e cada conserto vem com os adversariais que ele não pode abrir.
 */
describe("achados do /code-review de 2026-09-22 (frete e economia)", () => {
  const config0922: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const prepay = ctx({ config: config0922, paymentPath: "prepay" as const });
  const cod = ctx({ config: config0922 });

  describe("3 — sujeito novo depois do frete: antecipado, total, valor", () => {
    it("a frase honesta com outro sujeito passa", () => {
      for (const frase of [
        "O frete é à parte, e o valor fica R$ 116,91 no antecipado.",
        "O frete é calculado no checkout e o antecipado sai R$ 116,91.",
        "O frete é calculado no checkout, e o total fica R$ 116,91 mais o frete.",
        "O frete já está dentro, e o total é R$ 129,90 na entrega.",
        "O frete é à parte, mas o valor sai R$ 12,99 mais barato no antecipado.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).not.toContain("shipping_promise");
        expect(blocked(runGates(frase, cod)), frase).not.toContain("shipping_promise");
      }
    });

    it("valor atribuído ao frete continua vetado, com 'valor' ou 'total' por perto", () => {
      for (const frase of [
        // "tem o valor de" é o frete falando do próprio valor, não sujeito novo.
        "O frete tem o valor de R$ 12,99.",
        "O frete tem o valor de R$ 15.",
        // Sem quebra de oração, "o valor" é do frete.
        "O frete o valor é R$ 12,99.",
        // "o valor dele": o verbo não está colado, e "dele" é o frete.
        "O frete é à parte, e o valor dele é R$ 12,99.",
        // O segundo "frete" reabre a atribuição.
        "O frete é à parte, e o valor do frete fica R$ 12,99.",
        // Preposição/relativo antes do sujeito novo não abre sujeito.
        "O frete para o antecipado fica R$ 12,99.",
        "O frete que o antecipado paga é R$ 12,99.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("shipping_promise");
      }
    });

    it("a economia dada como preço sob sujeito novo veta (price_promise, desde a regra única)", () => {
      for (const frase of [
        // Sujeito novo com a economia como valor é o frete disfarçado: nada custa R$ 12,99.
        "O frete é à parte, e o valor é R$ 12,99.",
        "O frete é calculado no checkout, e o total fica R$ 12,99.",
        // A economia dada como PREÇO de qualquer sujeito é mentira — nada custa R$ 12,99.
        // O furo já existia com "o produto"; abrir "o antecipado" não pode alargá-lo.
        "O frete é à parte, e o produto sai R$ 12,99.",
        "O frete é à parte, e o antecipado fica R$ 12,99.",
        "O frete é calculado no checkout, e o colete custa R$ 12,99.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });

    it("'total' do antecipado sem o frete somado é a meia-verdade (price_promise)", () => {
      // Liberar "o total" como sujeito abriria "o total fica R$ 116,91" — e no
      // antecipado o total é R$ 116,91 MAIS o frete da região (R$ 15 a R$ 40).
      for (const frase of [
        "O frete é calculado no checkout e o total fica R$ 116,91.",
        "No antecipado o total é R$ 116,91.",
        "Não precisa esperar, o total fica R$ 116,91.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
      for (const frase of [
        "No antecipado o total é R$ 116,91 mais o frete.",
        "O total não é R$ 116,91, o frete é somado no checkout.",
        "Na entrega o total é R$ 129,90, com o frete dentro.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).not.toContain("price_promise");
      }
    });
  });

  describe("4 — 'nenhum frete a mais na porta' é verdade no COD", () => {
    it("qualificado e falando da entrega, passa", () => {
      // With `codFreeShipping: false` (the 2026-09-22 world) the qualified denial is its own rule.
      // While the delivery ships free it is one more free claim, held to the canonical sentences
      // (grafo §32): the free forms cost a rewrite, and the canonical one passes.
      const pago = (c: typeof cod) => ({ ...c, config: { ...c.config, delivery: { ...c.config.delivery, codFreeShipping: false } } });
      for (const frase of [
        "Na entrega você paga R$ 129,90 e nenhum frete a mais na porta.",
        "Na entrega é R$ 129,90, sem frete extra na porta.",
        "Nada de frete somado na entrega: são R$ 129,90.",
      ]) {
        expect(blocked(runGates(frase, pago(cod))), frase).not.toContain("shipping_promise");
        expect(blocked(runGates(frase, pago(prepay))), frase).not.toContain("shipping_promise");
        // custa uma reescrita (R15.3 canônica)
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
      }
      for (const c of [cod, pago(cod), pago(prepay)])
        expect(blocked(runGates("Na entrega, nenhum frete a mais: você paga R$ 129,90 na porta.", c))).not.toContain("shipping_promise");
      // No caminho antecipado, só os núcleos com "pagando / no pagamento na entrega" (grafo §33).
      expect(blocked(runGates("Na entrega, nenhum frete a mais: você paga R$ 129,90 na porta.", prepay))).toContain("shipping_promise");
      // Com preço único (antecipado = entrega), o R$ 129,90 na frase não é o antecipado.
      expect(blocked(runGates("Na entrega você paga R$ 129,90 e nenhum frete a mais na porta.", pago(ctx()))))
        .not.toContain("shipping_promise");
    });

    it("seco, no antecipado, ou com 'grátis' junto, continua vetado", () => {
      for (const frase of [
        "Nenhum frete a mais, pode pagar antecipado.",
        "No antecipado, nenhum frete a mais na entrega.",
        "Nenhum frete a mais na porta, o frete é grátis.",
      ]) {
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
      }
      // Secas mas nomeando a entrega: verdade desde 2026-09-28 (frete grátis na entrega), mas fora
      // das frases canônicas custam uma reescrita (R15.3 canônica, grafo §32); e o veto de 22/09 com
      // `codFreeShipping: false`.
      const codPago = ctx({ config: { ...cod.config, delivery: { ...cod.config.delivery, codFreeShipping: false } } });
      for (const frase of ["Nenhum frete na entrega.", "Sem frete: R$ 129,90 na entrega."]) {
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
        expect(blocked(runGates(frase, codPago)), frase).toContain("shipping_promise");
      }
      // Caminho antecipado e sem falar da porta: ela paga frete, "nenhum a mais" é mentira.
      expect(blocked(runGates("São R$ 116,91 e nenhum frete adicional.", prepay)))
        .toContain("shipping_promise");
      // Pix, cartão, checkout ou o preço do antecipado na frase: é o antecipado, sem porta.
      for (const frase of [
        "Nenhum frete a mais na porta: R$ 116,91 no pix.",
        "Nenhum frete extra na entrega, é só pagar no cartão.",
        "Nenhum frete a mais na entrega, é só pagar no checkout.",
      ]) {
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
      }
      // O checkout é dos dois caminhos: com o frete grátis na entrega (2026-09-28) a frase é
      // verdade, mas não é canônica e custa uma reescrita (grafo §32); com `codFreeShipping: false`
      // o checkout na frase continua vetando.
      expect(blocked(runGates("Nenhum frete a mais na entrega, o checkout já mostra.", cod))).toContain("shipping_promise");
      expect(blocked(runGates("Nenhum frete a mais na entrega, o checkout já mostra.", codPago))).toContain("shipping_promise");
      // A mensagem cita as duas ofertas, mas a frase que nega o frete é a do antecipado.
      expect(
        blocked(runGates("Na entrega são R$ 129,90. No antecipado são R$ 116,91 e nenhum frete a mais.", cod)),
      ).toContain("shipping_promise");
    });
  });

  describe("6 — ressalva válida não pode ser jogada fora", () => {
    it("saída A: com ressalva válida ou não, a economia em reais veta", () => {
      for (const frase of [
        "Não precisa esperar, o frete não está incluído e você economiza R$ 12,99 no produto.",
        "Você economiza R$ 12,99 no produto com juros zero e o frete calculado no checkout.",
        "Não precisa esperar: você economiza R$ 12,99 no produto, não inclui o frete.",
        "Não, você economiza R$ 12,99 no produto, e o frete é calculado no checkout.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });

    it("ressalva negada, ou frete zerado de verdade, continua vetando", () => {
      for (const frase of [
        "Você economiza R$ 12,99 e o frete não é cobrado à parte.",
        "Você economiza R$ 12,99 e zero frete cobrado à parte.",
        "Você economiza R$ 12,99, zero taxa de frete cobrada à parte.",
        "Você economiza R$ 12,99 e zero de frete cobrado à parte.",
        "Você economiza R$ 12,99, e o frete nunca é cobrado à parte.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });
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
 * chave nova nasce ausente lá até alguém editar o secret. O padrão para a chave ausente
 * tem que ser a verdade — e a verdade mudou: até 2026-09-22 era "grátis" (`!== false`);
 * desde a decisão do operador de 22/09, a operação NÃO oferece frete grátis, então a
 * chave ausente lê como não grátis, e só `true` explícito libera o grátis.
 */
describe("config de produção sem a chave nova", () => {
  // A chave é OMITIDA, não posta como undefined: é assim que ela chega da produção,
  // onde o `BUSINESS_CONFIG` foi escrito antes de a chave existir no código.
  const { freeShipping: _omitida, ...deliverySemAChave } = config.delivery;
  const semAChave = { ...ctx(), config: { ...config, delivery: deliverySemAChave } };

  it("sem a chave, frete grátis é vetado: ausente lê como não grátis", () => {
    expect(blocked(runGates("O frete é grátis nos dois casos.", semAChave)))
      .toContain("shipping_promise");
  });

  it("sem a chave, o briefing proíbe o grátis nos dois caminhos em vez de mandá-lo dizer", () => {
    const briefing = gateBriefing({ ...config, delivery: deliverySemAChave }).join("\n");
    expect(briefing).not.toContain("GRÁTIS nos dois caminhos");
    // Desde 2026-09-28 o grátis da entrega é a verdade de hoje (`codFreeShipping` ausente),
    // e o antecipado continua nunca grátis.
    expect(briefing).toContain("No antecipado o frete é calculado por região dentro do checkout: nunca diga que é grátis");
    const semAsDuas = { ...deliverySemAChave, codFreeShipping: false };
    expect(gateBriefing({ ...config, delivery: semAsDuas }).join("\n")).toContain('Nunca diga "frete grátis"');
  });

  it("sem a chave, a economia do antecipado continua vetada (price_promise)", () => {
    // O pior caso da chave ausente: lida como grátis, liberava "você economiza R$ 12,99"
    // — e a cliente paga o frete no checkout. Desde a saída A o número veta nos dois
    // ramos, então a chave nem entra na decisão.
    const cfg = {
      ...config,
      prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
      delivery: deliverySemAChave,
    };
    const prepay = ctx({ config: cfg, paymentPath: "prepay" as const });
    expect(blocked(runGates("Você economiza R$ 12,99 pagando antecipado.", prepay)))
      .toContain("price_promise");
    expect(gateBriefing(cfg).find((b) => b.includes("Os únicos valores"))!).not.toContain("R$ 12,99");
  });

  it("`false` explícito também veta, e só `true` explícito libera o grátis", () => {
    const desligado = {
      ...ctx(),
      config: { ...config, delivery: { ...config.delivery, freeShipping: false } },
    };
    expect(blocked(runGates("O frete é grátis nos dois casos.", desligado)))
      .toContain("shipping_promise");
    const ligado = {
      ...ctx(),
      config: { ...config, delivery: { ...config.delivery, freeShipping: true } },
    };
    expect(blocked(runGates("O frete é grátis nos dois casos.", ligado)))
      .not.toContain("shipping_promise");
  });
});

/**
 * A ambiguidade que não é mentira e custa a venda. O operador achou numa transcrição
 * real: cada oração é verdadeira, e lidas juntas dizem que o prazo vale para os dois
 * caminhos — e não vale. Ela pergunta de novo, o que já é falha da agente, ou não
 * pergunta e espera a data errada, que é a recusa na porta.
 */
describe("prazo com as duas opções na mesa", () => {
  it("sinaliza o prazo solto quando as duas formas estão lado a lado", () => {
    const frase =
      "Para o tamanho G, a entrega fica na janela de 1 a 3 dias e o frete é grátis. " +
      "Você prefere pagar R$ 129,90 na entrega ou antecipar, pelo mesmo valor?";
    expect(warned(runGates(frase, ctx()))).toContain("unattributed_window");
  });

  it("passa quando cada prazo diz de quem é", () => {
    const frase =
      "No pagamento na entrega você recebe em 1 a 3 dias e paga R$ 129,90 na mão do " +
      "entregador. No antecipado o prazo varia, em média 5 dias úteis.";
    expect(warned(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("mensagem de um caminho só não precisa de rótulo", () => {
    expect(warned(runGates("A entrega leva de 1 a 3 dias e você escolhe o dia.", ctx())))
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
  it("sinaliza a comparação com prazo só num dos lados", () => {
    const frase =
      "Na entrega você paga R$ 129,90 quando o colete chegar, em 1 a 3 dias. " +
      "Antecipado você paga R$ 129,90 agora, com frete grátis.";
    expect(warned(runGates(frase, ctx()))).toContain("unattributed_window");
  });

  it("passa com o prazo dos dois lados", () => {
    const frase =
      "Na entrega você recebe em 1 a 3 dias e paga R$ 129,90 na mão do entregador. " +
      "No antecipado o prazo varia por região, em média 5 dias úteis.";
    expect(warned(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("passa sem prazo nenhum — comparar só preço é legítimo", () => {
    const frase = "Na entrega são R$ 129,90 na mão do entregador; antecipado, o mesmo valor.";
    expect(warned(runGates(frase, ctx()))).not.toContain("unattributed_window");
  });

  it("'agendada' não é rótulo: é a nossa palavra, não a dela", () => {
    const frase =
      "A entrega é agendada para 1 a 3 dias. Você prefere pagar na entrega ou antecipado?";
    expect(warned(runGates(frase, ctx()))).toContain("unattributed_window");
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

/**
 * `hourIn` lia a hora com `hour12: false`, que no Node 20 (ICU 78.2) resolve para
 * `hourCycle: "h24"` — e aí a meia-noite sai "24", não "0". O gate de horário compara
 * `h >= openHour && h < closeHour`: com a janela de hoje (6–24) a meia-noite é barrada
 * das duas formas, por coincidência; numa janela 0–24 ela seria barrada sem motivo. O
 * mesmo defeito já tinha tornado um teste de followups dependente de qual `node` estava
 * primeiro no PATH (2026-09-22).
 */
describe("hourIn lê a meia-noite como 0 em qualquer runtime", () => {
  it("03:00Z é meia-noite em São Paulo, hora 0", () => {
    expect(hourIn(new Date("2026-09-11T03:00:00Z"), BUSINESS_TZ)).toBe(0);
  });

  it("numa janela 0–24, o gate de horário não barra a meia-noite", () => {
    const aberto24h = { ...config, hours: { openHour: 0, closeHour: 24 } };
    const r = runGates("Oi! Te respondo já.", {
      ...ctx(),
      config: aberto24h,
      // `agent`, não `auto`: a camada automática roda 24/7 por decisão (R4.4) e nem
      // consulta o relógio — um teste nela passaria com o defeito presente.
      layer: "agent",
      now: new Date("2026-09-11T03:00:00Z"),
    });
    expect(blocked(r)).not.toContain("business_hours");
  });
});

/**
 * Segunda passada do /code-review de 2026-09-22. Duas mentiras que a rodada anterior
 * abriu (itens 1 e 8) e dois falsos positivos (itens 2 e 3). A produção chama os gates
 * com `paymentPath: "cod"` fixo, então os adversariais do item 8 rodam no contexto COD:
 * é nele que a mentira do antecipado chega à cliente.
 */
describe("segunda passada do /code-review de 2026-09-22", () => {
  const config0922: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const prepay = ctx({ config: config0922, paymentPath: "prepay" as const });
  const cod = ctx({ config: config0922 });

  describe("1 — negação entre 'frete' e a ressalva cancela a ressalva, com vírgula no meio", () => {
    it("a ressalva negada não licencia a economia", () => {
      for (const frase of [
        "O frete não é, de jeito nenhum, cobrado à parte, e você economiza R$ 12,99.",
        "Você economiza R$ 12,99, e o frete, de forma nenhuma, é cobrado à parte.",
        "Você economiza R$ 12,99 e o frete jamais, em hipótese alguma, é calculado à parte.",
        "Você economiza R$ 12,99, e o frete não precisa, nesse caso, ser calculado no checkout.",
        "Você economiza R$ 12,99, o frete nunca vai ser, pode ficar tranquila, cobrado à parte.",
        "Você economiza R$ 12,99, e o frete nem é cobrado à parte.",
        "Você economiza R$ 12,99 sem frete cobrado à parte.",
        "Você não paga frete à parte e economiza R$ 12,99.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
        expect(blocked(runGates(frase, cod)), frase).toContain("price_promise");
      }
    });

    it("saída A: nem a ressalva válida licencia a economia em reais", () => {
      for (const frase of [
        "Não precisa esperar, o frete é calculado no checkout e você economiza R$ 12,99 no produto.",
        "Você economiza R$ 12,99 no produto, e o frete é cobrado à parte, calculado no checkout.",
        "Não, você economiza R$ 12,99 no produto, e o frete é calculado no checkout.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });
  });

  describe("8 — 'nenhum frete a mais' só passa quando a frase fala da porta", () => {
    it("sem a porta na frase, veta mesmo no contexto COD que a produção sempre passa", () => {
      for (const frase of [
        "Nenhum frete a mais, pode fechar.",
        "São R$ 129,90 e nenhum frete adicional.",
        "Sem frete extra pra você, pode fechar agora.",
      ]) {
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
      }
    });

    it("com a porta na frase, mas apontando o antecipado, veta", () => {
      for (const frase of [
        "Pagando adiantado, nenhum frete a mais na entrega.",
        "Nenhum frete extra na entrega, o pagamento já foi no boleto.",
        "Na entrega, nenhum frete a mais: você paga R$ 116,91.",
      ]) {
        expect(blocked(runGates(frase, cod)), frase).toContain("shipping_promise");
        expect(blocked(runGates(frase, prepay)), frase).toContain("shipping_promise");
      }
    });

    it("a frase da porta continua passando", () => {
      const frase = "Na entrega, nenhum frete a mais: você paga R$ 129,90 na porta.";
      expect(blocked(runGates(frase, cod))).not.toContain("shipping_promise");
      // Com a entrega grátis, o caminho antecipado só aceita o núcleo que diz "pagando na entrega"
      // (grafo §33): lá "na entrega" sozinho se lê "quando chegar".
      expect(blocked(runGates(frase, prepay))).toContain("shipping_promise");
    });
  });

  /**
   * Os itens 2 e 3 afrouxaram, e cada afrouxamento abriu mentira nova (rodada R3-G,
   * 2026-09-22): a ressalva "depois do valor" aceitava a ressalva que a própria frase
   * desmente ("…que seria calculado no checkout, já está incluso"), "sem o frete" aceitava
   * "sem o frete cobrado à parte", e o verbo de queda aceitava "cai bastante, pra R$ 12,99".
   * Voltaram ao comportamento anterior. As frases honestas abaixo são falso positivo
   * ACEITO: custam uma reescrita, e a mentira custa o frete na porta. As frases que o
   * prompt ensina continuam passando — `tests/prompt.test.ts` garante.
   */
  describe("2 — 'o total' do antecipado só passa com o frete somado logo depois do valor", () => {
    it("falso positivo aceito: ressalva adiante na frase, ou 'sem o frete', veta", () => {
      for (const frase of [
        "No antecipado o total é R$ 116,91 e o frete é calculado no checkout.",
        "O total é R$ 116,91 sem o frete.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });

    it("as mentiras que o afrouxamento abriu vetam", () => {
      for (const frase of [
        "No antecipado o total é R$ 116,91, e o frete, que seria calculado no checkout, já está incluso.",
        "O total é R$ 116,91 sem o frete cobrado à parte.",
        "O total é R$ 116,91 sem o frete adicional.",
        "No antecipado o total é R$ 116,91 e o frete, de jeito nenhum, é calculado à parte.",
        "O total é R$ 116,91 sem frete.",
        "O total é R$ 116,91 e o frete não é cobrado à parte.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
        expect(blocked(runGates(frase, cod)), frase).toContain("price_promise");
      }
    });

    it("o frete somado logo depois do valor continua passando", () => {
      const frase = "No antecipado o total é R$ 116,91 mais o frete.";
      expect(blocked(runGates(frase, prepay))).toEqual([]);
    });
  });

  describe("3 — depois do frete, a economia sob sujeito novo só passa dita como economia", () => {
    it("falso positivo aceito: verbo de queda, ou 'menor', veta", () => {
      for (const frase of [
        "O frete é calculado no checkout, e o preço cai R$ 12,99 no antecipado.",
        "O frete é calculado no checkout, e o valor fica R$ 12,99 menor no antecipado.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      }
    });

    it("a economia como preço veta", () => {
      for (const frase of [
        "O frete é calculado no checkout, e o preço fica R$ 12,99.",
        "O frete é calculado no checkout, e o valor fica R$ 12,99 no antecipado.",
        "O frete é calculado no checkout, e o preço baixa pra R$ 12,99.",
        "O frete é calculado no checkout, e o preço cai para R$ 12,99.",
        // As mentiras que o verbo de queda abriu.
        "O frete é calculado no checkout, e o preço cai bastante, pra R$ 12,99.",
        "O frete é calculado no checkout, e o preço fica baixinho, R$ 12,99.",
      ]) {
        expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
        expect(blocked(runGates(frase, cod)), frase).toContain("price_promise");
      }
    });

    it("saída A: nem dita como economia ela passa", () => {
      const frase = "O frete é calculado no checkout, e o produto sai R$ 12,99 mais barato no antecipado.";
      expect(blocked(runGates(frase, prepay))).toEqual(["price_promise"]);
    });
  });
});

/**
 * Mentira anterior à sessão de consertos de 2026-09-22: "o preço cai no antecipado para
 * R$ 12,99" passava, porque a distância entre o sujeito e o valor passava do limite da
 * checagem de sujeito novo. O `shipping_promise` ganhou uma checagem de "para/pra/por/até/a"
 * antes da economia; desde a saída A (2026-09-22) o `price_promise` veta toda ocorrência
 * do valor, e aquela checagem saiu. As frases continuam barradas — pelo gate do preço.
 */
describe("a economia precedida de 'para/pra/por/até/a' é preço, não economia", () => {
  const config0922: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const prepay = ctx({ config: config0922, paymentPath: "prepay" as const });
  const cod = ctx({ config: config0922 });

  it("veta a economia dada como preço novo, e também a dita como economia", () => {
    for (const frase of [
      "O frete é calculado no checkout, e o preço cai no antecipado para R$ 12,99.",
      "O frete é calculado no checkout, e pagando antecipado sai por R$ 12,99.",
      "O frete é calculado no checkout, e o preço desce no pagamento antecipado até R$ 12,99.",
      "O frete é calculado no checkout; no antecipado, fica a R$ 12,99.",
      "O frete é à parte, e no pix o valor do colete vai lá embaixo, pra 12,99 reais.",
      "O frete é calculado no checkout, e no antecipado a economia chega a R$ 12,99 de desconto no produto.",
      "O frete é calculado no checkout, e no antecipado você paga até R$ 12,99 a menos no produto.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      expect(blocked(runGates(frase, cod)), frase).toContain("price_promise");
    }
  });
});

/**
 * Quatro mentiras anteriores à sessão de 2026-09-22 (`b688479`): o valor da economia era
 * citável, então passava em toda formulação que não caísse numa checagem pontual — e
 * "no antecipado o colete sai R$ 12,99" diz que o produto custa R$ 12,99. Remendar por
 * verbo ou preposição não convergiu. A regra agora é uma só, no `price_promise`: toda
 * ocorrência da economia tem de estar DITA como economia, colada ao valor.
 */
describe("a economia só pode ser dita como economia", () => {
  const config0922: typeof config = {
    ...config,
    prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 },
    delivery: { ...config.delivery, freeShipping: false },
  };
  const prepay = ctx({ config: config0922, paymentPath: "prepay" as const });
  const cod = ctx({ config: config0922 });

  it("a economia dada como preço veta, mesmo com a ressalva do frete", () => {
    for (const frase of [
      "No antecipado o colete sai R$ 12,99, e o frete é calculado no checkout.",
      "O frete é calculado no checkout, e pagando antecipado o colete sai R$ 12,99.",
      "O frete é calculado no checkout, e o preço no pagamento antecipado fica R$ 12,99.",
      "O frete é calculado no checkout, e o preço cai para R$ 12,99 de desconto.",
      // "para/pra/por" antes do valor é preço, mesmo com palavra de economia depois.
      "O frete é calculado no checkout, e o produto sai por R$ 12,99 mais em conta.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toContain("price_promise");
      expect(blocked(runGates(frase, cod)), frase).toContain("price_promise");
    }
  });

  it("saída A: dita como economia, a economia em reais também veta — só price_promise", () => {
    // Were the whole-chain passes of exit C. Under exit A the number is never said, and
    // the veto comes from the price gate alone: shipping_promise no longer judges it.
    for (const frase of [
      "Você economiza R$ 12,99 no produto, e o frete é calculado no checkout.",
      "São R$ 12,99 a menos no produto, mais o frete.",
      "No antecipado sai R$ 12,99 mais barato, mais o frete da sua região.",
      "O frete é à parte; no produto você economiza R$ 12,99.",
      // Was the known false positive of plan item 2.9, vetoed by shipping_promise.
      "Você tem um desconto de até R$ 12,99 no produto, e o frete é calculado no checkout.",
    ]) {
      expect(blocked(runGates(frase, prepay)), frase).toEqual(["price_promise"]);
    }
  });

  it("o total com 'mais o valor do frete' logo depois é frete somado, e passa", () => {
    expect(blocked(runGates("O total fica R$ 116,91 mais o valor do frete.", prepay))).toEqual([]);
  });

  it("o briefing ensina a forma segura, e a forma segura passa a cadeia", () => {
    const linha = gateBriefing(config0922).join("\n");
    const exemplo = "10% de desconto: R$ 116,91 no antecipado";
    expect(linha).toContain(exemplo);
    expect(blocked(runGates(exemplo, prepay)), exemplo).toEqual([]);
    expect(blocked(runGates(exemplo, cod)), exemplo).toEqual([]);
  });
});

describe("unavailable_offer: a metade da loja é branda desde 2026-09-24 (persona Jussara)", () => {
  // Quatro rodadas de revisão mostraram que afrouxar o veto para a negação honesta não
  // convergia. O operador decidiu (2026-09-24) que a loja não veta mais: fica no trace
  // como `warn`. A metade dos outros produtos continua vetando.
  it("a negação honesta da loja física passa, sem nem sinalizar", () => {
    const r = runGates(
      "A gente não tem loja física, a venda é só por aqui e pelo site, e por isso mesmo você só paga quando o colete chega na sua mão.",
      ctx(),
    );
    expect(blocked(r)).not.toContain("unavailable_offer");
    expect(warned(r)).not.toContain("unavailable_offer");
  });
});

describe("delivery_promise: dia da semana ou data antes do pedido é promessa (2026-09-24)", () => {
  it("barra o dia marcado, inclusive depois de uma negativa que não nega", () => {
    for (const t of [
      "Posso seguir com o seu pedido pra receber na quinta-feira?",
      "Na quinta você já recebe.",
      "Chega até o dia 30.",
      "Não precisa se preocupar, chega na quinta.",
      "Não se preocupe que chega na quinta.",
      "Não consigo prometer o dia, mas chega na quinta.",
      "Sem demora, chega na sexta.",
      "Não consigo garantir o dia exato mas chega na quinta.",
      "Não tem como não chegar até sexta.",
      "Nem demora chega na sexta.",
      "Não entrega na sexta, só na quinta.",
      "Chega de quarta a sexta.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).toContain("delivery_promise");
    }
  });

  it("'tá na sua casa', 'vai estar na sua mão', 'dá tempo' e o dia antes do verbo também prometem", () => {
    for (const t of [
      "Vai estar na sua mão na sexta.",
      "Dá tempo sim, até sexta ele tá com você.",
      "Fechando hoje, sexta-feira já tá na sua casa.",
      "Dá tempo até sexta sim.",
      "Dá tempo pra sexta, fica tranquila.",
      "Então quinta chega.",
      "Fechando hoje e quinta você recebe.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).toContain("delivery_promise");
    }
  });

  it("deixa passar a janela, o dia escolhido no checkout e os dias de funcionamento", () => {
    for (const t of [
      "Você escolhe o dia no checkout.",
      "Você recebe em até 3 dias.",
      "O casamento é sábado e você recebe em até 3 dias.",
      "A entrega acontece de segunda a sexta.",
      "O entregador passa de segunda a sábado, das 8h às 18h.",
      "Chega na segunda tentativa se você não estiver.",
      "Você recebe a segunda peça junto.",
      "Chega em 2/3 dias.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).not.toContain("delivery_promise");
    }
  });

  it("recusar o dia é permitido: a negação que governa o verbo", () => {
    for (const t of [
      "Não consigo garantir que chega na quinta, quem escolhe o dia é você no checkout.",
      "Não posso prometer entrega no sábado.",
      "Ele não chega na quinta, a entrega leva de 1 a 3 dias.",
      "Não dá tempo de chegar até sexta.",
      "Não vai dar tempo de chegar na sexta.",
      "Não tenho como garantir que chega sexta.",
      "Não consigo te garantir que chega na quinta.",
      "Não consigo prometer a entrega na sexta.",
      "Não vai estar na sua mão na sexta, a entrega leva de 1 a 3 dias.",
      "Não dá pra garantir que até sexta ele tá com você.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).not.toContain("delivery_promise");
    }
  });

  it("só 'você disse/falou' recontando isenta, e nada de afirmação depois", () => {
    for (const t of [
      "Você disse que precisa pra sexta e chega na sexta sim.",
      "Eu te disse que chega na quinta.",
      "Quem pediu ontem recebe na quinta.",
      "Você disse que precisa até sexta e dá tempo sim.",
      "Você disse que precisa receber na sexta e dá tempo.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).toContain("delivery_promise");
    }
    for (const t of [
      "Você falou que o casamento é sábado.",
      "Você disse que precisa receber até sábado, né? O dia você escolhe no checkout.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).not.toContain("delivery_promise");
    }
  });

  it("D — sem entrega no domingo, 'não sei se', e o dia entregue ao checkout passam", () => {
    for (const t of [
      "Não tem entrega no domingo.",
      "O entregador não trabalha domingo.",
      "Não sei se chega na quinta.",
      "Se no checkout aparecer sexta, você recebe na sexta.",
      "Você escolhe no checkout se quer receber na quinta ou na sexta.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).not.toContain("delivery_promise");
    }
  });

  it("D — a promessa colada a essas isenções continua barrando", () => {
    for (const t of [
      "Não tem problema que chega na quinta.",
      "Não sei, mas chega na quinta.",
      "O entregador não trabalha domingo, só na quinta.",
      "Você escolhe o dia no checkout e chega na quinta.",
      "Escolhe aí que chega na sexta.",
    ]) {
      expect(blocked(runGates(t, ctx())), t).toContain("delivery_promise");
    }
  });

  it("na logística, a data agendada pela transportadora é fato", () => {
    expect(
      blocked(runGates("Sua entrega está agendada: chega na quinta.", ctx({ stage: "logistics" }))),
    ).not.toContain("delivery_promise");
  });
});
