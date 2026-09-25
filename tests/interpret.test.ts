import { describe, expect, it } from "vitest";
import {
  asksSomething,
  CLARIFY_SIZE_REPLIES,
  decideClarify,
  decidesToBuy,
  goodbyeParks,
  handoffFor,
  interpretRequest,
  INTERPRET_MAX_COMPLETION_TOKENS,
  linkPathFor,
  namesAPerson,
  namesOwnPrice,
  NEUTRAL_INTERPRETATION,
  readInterpretation,
  linkSentRecently,
  asksForLink,
  readyForLink,
  saysGoodbye,
  sendLinkNow,
  statesPastPurchase,
  type Interpretation,
} from "@/agent/interpret.js";
import { classifyOptOut, runGates, wantsHuman } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/** A reading with only the fields a case cares about set. */
const read = (over: Partial<Interpretation> = {}): Interpretation => ({
  ...NEUTRAL_INTERPRETATION,
  ...over,
  size: { ...NEUTRAL_INTERPRETATION.size, ...(over.size ?? {}) },
});

/**
 * O intérprete (R13.1): uma chamada que LÊ a mensagem e devolve JSON. Nada aqui chama
 * rede — o que se testa é o que o código faz com o que o modelo devolveu, inclusive
 * quando ele devolve lixo.
 */
describe("a leitura do JSON do intérprete", () => {
  it("lê o formato declarado, campo por campo", () => {
    const { parsed, interpretation } = readInterpretation(
      JSON.stringify({
        asks_human: true,
        wants_cancel: false,
        post_sale: false,
        opt_out: false,
        size: { letter: "G", pants: 46, waist_cm: null, for_other_person: true },
        email: "Karol@Gmail.com",
        email_unavailable: false,
        payment_choice: "prepay",
        wants_to_think: false,
        wants_to_buy: true,
        pending_answer: "answered",
      }),
    );
    expect(parsed).toBe(true);
    expect(interpretation.asks_human).toBe(true);
    expect(interpretation.size).toEqual({ letter: "G", pants: 46, waist_cm: null, for_other_person: true });
    expect(interpretation.email).toBe("karol@gmail.com");
    expect(interpretation.payment_choice).toBe("prepay");
    expect(interpretation.wants_to_buy).toBe(true);
    expect(interpretation.pending_answer).toBe("answered");
  });

  it("aceita o JSON cercado de markdown ou de texto, que é como modelo erra", () => {
    const cercado = readInterpretation('Claro!\n```json\n{"wants_to_think": true}\n```');
    expect(cercado.parsed).toBe(true);
    expect(cercado.interpretation.wants_to_think).toBe(true);
  });

  it("lixo vira a leitura neutra, sem lançar", () => {
    for (const lixo of ["", "não sei", "{quebrado", "[1,2,3]", "null", "{}}{"]) {
      const r = readInterpretation(lixo);
      expect(r.interpretation, lixo).toEqual(NEUTRAL_INTERPRETATION);
    }
    expect(readInterpretation("não sei").parsed).toBe(false);
    expect(readInterpretation("[1,2,3]").parsed).toBe(false);
  });

  it("tipo errado é o valor neutro do campo: \"true\" em texto não é true", () => {
    const { interpretation } = readInterpretation(
      JSON.stringify({
        asks_human: "true",
        wants_cancel: 1,
        size: { letter: "XS", pants: 12, waist_cm: "80" },
        email: "joao@gmail",
        payment_choice: "boleto",
        pending_answer: "talvez",
      }),
    );
    expect(interpretation.asks_human).toBe(false);
    expect(interpretation.wants_cancel).toBe(false);
    expect(interpretation.size.letter).toBeNull();
    expect(interpretation.size.pants).toBeNull(); // 12 não é número de calça
    expect(interpretation.size.waist_cm).toBe(80); // número escrito como texto é lido
    expect(interpretation.email).toBeNull(); // sem domínio completo
    expect(interpretation.payment_choice).toBeNull();
    expect(interpretation.pending_answer).toBe("no_pending");
  });

  it("a letra vem normalizada, e só as cinco da tabela", () => {
    expect(readInterpretation('{"size":{"letter":" gg "}}').interpretation.size.letter).toBe("GG");
    expect(readInterpretation('{"size":{"letter":"L"}}').interpretation.size.letter).toBeNull();
    expect(readInterpretation('{"size":{"letter":"XGG"}}').interpretation.size.letter).toBe("XGG");
  });
});

describe("o pedido que vai para o modelo", () => {
  it("leva a última mensagem da Malu e a da cliente, entre aspas, como dado", () => {
    const r = interpretRequest("Qual o seu tamanho?", "ela usa G 46");
    expect(r.user).toContain('"""Qual o seu tamanho?"""');
    expect(r.user).toContain('"""ela usa G 46"""');
    expect(r.system).toContain("SOMENTE um objeto JSON");
  });

  it("diz ao modelo que pergunta sobre tamanho não é tamanho dito", () => {
    expect(interpretRequest("", "oi").system).toContain("PERGUNTA não é tamanho dito");
  });

  it("sem mensagem anterior, diz que não há nenhuma", () => {
    expect(interpretRequest("", "oi").user).toContain("(nenhuma)");
  });

  it("nomeia todos os campos que o código lê", () => {
    for (const campo of Object.keys(NEUTRAL_INTERPRETATION)) {
      expect(interpretRequest("", "oi").system, campo).toContain(`"${campo}"`);
    }
    for (const campo of Object.keys(NEUTRAL_INTERPRETATION.size)) {
      expect(interpretRequest("", "oi").system, campo).toContain(`"${campo}"`);
    }
  });

  // Muse sempre raciocina e cobra o raciocínio no orçamento da resposta: com 900 ela
  // voltou vazia em 2026-09-24.
  it("o orçamento da resposta cabe o raciocínio", () => {
    expect(INTERPRET_MAX_COMPLETION_TOKENS).toBeGreaterThanOrEqual(2000);
  });
});

/**
 * O handoff estrito (R13.2): a leitura do modelo E uma palavra de pessoa no texto. As
 * negações vêm primeiro, porque todo leitor de texto deste repositório já errou nelas.
 */
describe("palavra de pessoa na mensagem", () => {
  it("reconhece o pedido de pessoa dentro de uma frase maior", () => {
    for (const frase of [
      "é IA ou nao é? responde sim ou nao\n\nme passa pra uma pessoa",
      "tem alguem ai de verdade?",
      "quero falar com a gerente",
      "não quero falar com robô, quero uma pessoa",
      "me chama um atendente por favor",
      "Não tem um humano aí pra me ajudar?",
      // A negação é de outra coisa, não da pessoa (code review, 2026-09-24).
      "não quero robô quero uma pessoa",
      "nao quero esperar quero atendente",
    ]) {
      expect(namesAPerson(frase), frase).toBe(true);
    }
  });

  it("não conta a palavra negada, nem a pergunta sobre o que ela é", () => {
    for (const frase of [
      "não quero falar com atendente",
      "nao preciso de atendente nao, só me fala o preço",
      "não quero falar com um atendente",
      "você é robô?",
      "você é uma pessoa?",
      "vc é humana?",
      "é uma pessoa de verdade?",
      "quanto custa o colete?",
    ]) {
      expect(namesAPerson(frase), frase).toBe(false);
    }
  });
});

describe("quem vai para o humano, e só quem", () => {
  it("pedido de pessoa lido pelo modelo e escrito com palavra de pessoa: handoff", () => {
    expect(handoffFor(read({ asks_human: true }), "me passa pra uma pessoa por favor", false)).toBe("human");
    expect(handoffFor(read({ asks_human: true }), "tem alguém de verdade aí?", false)).toBe("human");
    // A frase exata da lista (`wantsHuman`) passa ao humano antes, no turno, mesmo com a leitura neutra.
    expect(wantsHuman("quero falar com uma pessoa")).toBe(true);
  });

  it("\"não quero falar com atendente\" nunca vai para o humano — nem com o modelo errando", () => {
    expect(handoffFor(read({ asks_human: false }), "não quero falar com atendente", false)).toBeNull();
    expect(handoffFor(read({ asks_human: true }), "não quero falar com atendente", false)).toBeNull();
    expect(wantsHuman("não quero falar com atendente")).toBe(false);
  });

  it("\"você é robô?\" nunca vai para o humano — nem com o modelo errando", () => {
    expect(handoffFor(read({ asks_human: false }), "você é robô?", false)).toBeNull();
    expect(handoffFor(read({ asks_human: true }), "você é robô?", false)).toBeNull();
    expect(handoffFor(read({ asks_human: true }), "vc é uma pessoa?", false)).toBeNull();
    expect(wantsHuman("você é robô?")).toBe(false);
  });

  it("palavra de pessoa sem o pedido lido não basta", () => {
    expect(handoffFor(read({ asks_human: false }), "a atendente da loja me indicou", false)).toBeNull();
    expect(handoffFor(read({ asks_human: false }), "o suporte na lombar é bom?", false)).toBeNull();
  });

  it("cancelar pedido e pedido existente vão para o humano", () => {
    expect(handoffFor(read({ wants_cancel: true }), "cancela ai por favor", true)).toBe("cancel");
    expect(handoffFor(read({ post_sale: true }), "ja saiu pra entrega?", true)).toBe("post_sale");
    // Cancelar vence o pedido de pessoa: a resposta é "vou checar", que é o que ela quer.
    expect(
      handoffFor(read({ wants_cancel: true, asks_human: true }), "quero falar com alguém pra cancelar", true),
    ).toBe("cancel");
  });

  // Code review, 2026-09-24: sem pedido nem link, "cancelar" é pergunta de pré-venda.
  it("cancelar e pós-venda sem pedido nem link enviado ficam com a agente", () => {
    expect(
      handoffFor(read({ wants_cancel: true }), "e se eu não gostar, consigo cancelar depois?", false),
    ).toBeNull();
    expect(handoffFor(read({ post_sale: true }), "quando chega?", false)).toBeNull();
    // Com pedido ou link, a mesma leitura vai para o humano.
    expect(handoffFor(read({ wants_cancel: true }), "cancela meu pedido", true)).toBe("cancel");
  });

  it("nada disso: a conversa fica com a agente", () => {
    for (const r of [
      NEUTRAL_INTERPRETATION,
      read({ wants_to_think: true }),
      read({ wants_to_buy: true }),
      read({ pending_answer: "unrelated" }),
      read({ opt_out: true }),
    ]) {
      expect(handoffFor(r, "ta", true)).toBeNull();
    }
  });
});

/**
 * A escada do tamanho (R13.4): três frases fixas do operador e depois silêncio até a
 * mensagem fazer sentido. O degrau é lido da última mensagem enviada.
 */
describe("a escada de esclarecimento do tamanho", () => {
  const perguntou = "Qual número de calça você usa?";
  const solto = read({ pending_answer: "unrelated" });
  const base = { interpreted: true, interpretation: solto, sizeFound: false, factsFound: false };

  it("as três frases são as do operador, palavra por palavra", () => {
    expect(CLARIFY_SIZE_REPLIES).toEqual([
      "Desculpa, não entendi, qual o tamanho que deseja?",
      "Precisa de ajuda para escolher o tamanho?",
      "Quando decidir é só me falar que prossigo com a criação do seu pedido.",
    ]);
  });

  it("sobe um degrau por resposta solta, e depois fica em silêncio", () => {
    expect(decideClarify({ ...base, lastOutbound: perguntou, lastAskedSize: true })).toEqual({
      kind: "reply",
      text: CLARIFY_SIZE_REPLIES[0],
    });
    expect(decideClarify({ ...base, lastOutbound: CLARIFY_SIZE_REPLIES[0], lastAskedSize: true })).toEqual({
      kind: "reply",
      text: CLARIFY_SIZE_REPLIES[1],
    });
    expect(decideClarify({ ...base, lastOutbound: CLARIFY_SIZE_REPLIES[1], lastAskedSize: true })).toEqual({
      kind: "reply",
      text: CLARIFY_SIZE_REPLIES[2],
    });
    // O terceiro degrau não pergunta nada — a leitura pode vir "no_pending", e o silêncio vale.
    for (const pending of ["unrelated", "no_pending"] as const) {
      expect(
        decideClarify({
          ...base,
          interpretation: read({ pending_answer: pending }),
          lastOutbound: CLARIFY_SIZE_REPLIES[2],
          lastAskedSize: false,
        }),
      ).toEqual({ kind: "silent" });
    }
  });

  it("uma mensagem que faz sentido sai da escada, em qualquer degrau", () => {
    for (const last of [perguntou, ...CLARIFY_SIZE_REPLIES]) {
      expect(decideClarify({ ...base, lastOutbound: last, lastAskedSize: true, sizeFound: true }).kind).toBe("none");
      for (const r of [
        read({ pending_answer: "other_question" }),
        read({ pending_answer: "answered" }),
        read({ pending_answer: "unrelated", wants_to_buy: true }),
        read({ pending_answer: "unrelated", wants_to_think: true }),
        read({ pending_answer: "unrelated", payment_choice: "cod" }),
      ]) {
        expect(decideClarify({ ...base, interpretation: r, lastOutbound: last, lastAskedSize: true }).kind, last).toBe(
          "none",
        );
      }
    }
  });

  // Code review, 2026-09-24: "meu cep é 01310-100, Maria Souza" no degrau 3 era silenciada.
  it("mensagem com dado (CEP, endereço, nome, CPF) nunca é silenciada nem ganha frase da escada", () => {
    for (const last of [perguntou, ...CLARIFY_SIZE_REPLIES]) {
      expect(decideClarify({ ...base, lastOutbound: last, lastAskedSize: true, factsFound: true }).kind, last).toBe("none");
    }
    // Sem dado, a mesma mensagem solta continua na escada.
    expect(decideClarify({ ...base, lastOutbound: CLARIFY_SIZE_REPLIES[2], lastAskedSize: false }).kind).toBe("silent");
  });

  it("não sobe a escada quando a última mensagem não perguntou o tamanho", () => {
    expect(decideClarify({ ...base, lastOutbound: "Me passa seu CEP?", lastAskedSize: false }).kind).toBe("none");
  });

  // Silêncio decidido sem informação seria a pior falha daqui.
  it("sem leitura do intérprete, nunca silencia nem sobe", () => {
    for (const last of [perguntou, ...CLARIFY_SIZE_REPLIES]) {
      expect(decideClarify({ ...base, interpreted: false, lastOutbound: last, lastAskedSize: true }).kind).toBe("none");
    }
  });

  it("as três frases passam na cadeia inteira", () => {
    for (const texto of CLARIFY_SIZE_REPLIES) expect(runGates(texto, ctx()).allowed, texto).toBe(true);
  });
});

describe("qual link sai", () => {
  it("antecipado quando ela escolheu antecipado", () => {
    expect(linkPathFor("prepay", null)).toBe("prepay");
    expect(linkPathFor("prepay", { cod: true })).toBe("prepay");
  });

  it("antecipado quando a região não tem pagamento na entrega, mesmo que ela peça entrega", () => {
    expect(linkPathFor(null, { cod: false })).toBe("prepay");
    expect(linkPathFor("cod", { cod: false })).toBe("prepay");
  });

  it("entrega nos demais casos", () => {
    expect(linkPathFor(null, null)).toBe("cod");
    expect(linkPathFor("cod", { cod: true })).toBe("cod");
    expect(linkPathFor(null, { cod: true })).toBe("cod");
  });
});

/** E-mail e CPF deixaram de travar o link (R13.4). */
describe("quando o link sai sem esperar a identidade", () => {
  const args = {
    identityComplete: false,
    interpretation: NEUTRAL_INTERPRETATION,
    identityAsked: false,
    identityGiven: false,
    sizeKnown: true,
  };

  it("sai quando ela quer comprar, não tem e-mail, ou ignorou o pedido", () => {
    expect(sendLinkNow({ ...args, interpretation: read({ wants_to_buy: true }) })).toBe(true);
    expect(sendLinkNow({ ...args, interpretation: read({ email_unavailable: true }) })).toBe(true);
    expect(sendLinkNow({ ...args, identityAsked: true, identityGiven: false })).toBe(true);
    expect(sendLinkNow({ ...args, identityComplete: true })).toBe(true);
  });

  it("não sai quando ela respondeu o que foi pedido — a conversa segue", () => {
    expect(sendLinkNow({ ...args, identityAsked: true, identityGiven: true })).toBe(false);
  });

  // Code review, 2026-09-24: no checkout da entrega ela digita o tamanho; em branco, o
  // depósito escolhe — e volta às custas da operação.
  it("nunca sai sem tamanho, mesmo pronta para comprar — o tamanho vem antes", () => {
    for (const pronta of [
      { ...args, interpretation: read({ wants_to_buy: true }) },
      { ...args, interpretation: read({ email_unavailable: true }) },
      { ...args, identityAsked: true },
      { ...args, identityComplete: true },
    ]) {
      expect(sendLinkNow({ ...pronta, sizeKnown: false })).toBe(false);
      expect(readyForLink(pronta)).toBe(true); // e o turno pede o tamanho
    }
  });

  it("não sai numa conversa que ainda não chegou lá", () => {
    expect(sendLinkNow(args)).toBe(false);
    expect(sendLinkNow({ ...args, interpretation: read({ pending_answer: "other_question" }) })).toBe(false);
  });

  // Revisão do H-2 (2026-09-25): o pedido de identidade só vem depois da decisão, e a
  // decisão não fica guardada em outro lugar — segurar o link aqui deixa sem link quem já
  // disse sim ("pra que você precisa do meu CPF?").
  it("ela ignorou o pedido do nome pra perguntar outra coisa: o link ainda sai", () => {
    const perguntou = read({ pending_answer: "other_question" });
    expect(sendLinkNow({ ...args, identityAsked: true, identityGiven: false, interpretation: perguntou })).toBe(true);
  });
});

/**
 * H-2: quem cita um preço que a loja não tem está pedindo, não decidindo (Tati, "faz por
 * 100 que eu levo agora"). Lido pelo número, não pela frase: a primeira versão, por frase,
 * vetou "por 116 eu levo" (o preço real do pix) e deixou passar "não dá pra fazer por 100?".
 */
describe("preço que a loja não tem não é decisão de compra", () => {
  const prices = [129.9, 116.91, 199.9, 233.82, 311.76, 207.84, 272.79];
  const real = ["129,90", "129", "130", "116", "116,91", "117", "207", "R$ 233,82", "272", "311"];
  const own = ["100", "110", "90", "R$ 99,90", "115", "120", "180", "150", "80"];
  const frames = [
    (n: string) => `por ${n} eu levo`,
    (n: string) => `faz por ${n} que eu levo agora`,
    (n: string) => `não dá pra fazer por ${n}? quero o G`,
    (n: string) => `não faz ${n} não? quero um G`,
    (n: string) => `quero um G por ${n}`,
    (n: string) => `vou levar, mas só por ${n}`,
    (n: string) => `se for ${n} eu fecho`,
    (n: string) => `levo 2 por ${n}`,
  ];
  it("preço da loja, em qualquer frase e com negação: não é pedido de preço", () => {
    for (const f of frames) for (const n of real) expect({ msg: f(n), own: namesOwnPrice(f(n), prices) }).toEqual({ msg: f(n), own: false });
  });
  it("preço inventado, em qualquer frase e com negação: é pedido de preço", () => {
    for (const f of frames) for (const n of own) expect({ msg: f(n), own: namesOwnPrice(f(n), prices) }).toEqual({ msg: f(n), own: true });
  });
  // Segunda revisão: decisão + número que não é preço fica decisão (o prompt pede a cintura em cm).
  const notPrice = [
    "quero o G, minha cintura é 80",
    "quero o M, cintura 72 cm",
    "quero o GG, quadril 110",
    "quero comprar, peso 75kg",
    "quero o G, tenho 62 anos",
    "Rua Augusta 150, pode mandar o link",
    "moro no numero 321, quero o G",
    "quero o G, apto 102",
    "quero o G, fica 44 em mim?",
    "quero o G, dá pra parcelar em 12x?",
    "quero, chega em 30 dias?",
    "quero o G, 10h30 posso receber?",
  ];
  it("decisão com número que não é preço continua decisão", () => {
    for (const msg of notPrice) expect({ msg, own: namesOwnPrice(msg, prices, [10]) }).toEqual({ msg, own: false });
  });
  it.each([
    "quero o G por 59,90",
    "quero um G por 50",
    "quero o G por noventa",
    "faz por cem que eu levo",
    "quero o G, pago 100 reais",
    "quero o G com 30% de desconto",
  ])("%s → pedido de preço (abaixo de 60, por extenso, porcentagem)", (msg) => {
    expect(namesOwnPrice(msg, prices, [10])).toBe(true);
  });
  it("a porcentagem que a loja dá não é pedido", () => {
    expect(namesOwnPrice("quero no pix com 10% de desconto", prices, [10])).toBe(false);
  });
  it.each([
    "quero o G, uso calça 46",
    "meu cep é 01310-100, quero comprar",
    "meu zap é 11 98765-4321",
    "quero 2, um 42 e um 44",
    "chega em 3 dias?",
    "cpf 123.456.789-09",
    "quero comprar, pode mandar o link",
  ])("%s → sem preço inventado", (msg) => {
    expect(namesOwnPrice(msg, prices)).toBe(false);
  });
});

/** Opt-out com pergunta no meio (R13.4, Rose). */
describe("opt-out que também pergunta", () => {
  it("a mensagem da Rose pede a última resposta", () => {
    const rose = "nao me manda mais mensagem... so me diz o preco antes\n\nse e pra pagar na entrega mesmo";
    expect(classifyOptOut(rose)).toBe("explicit");
    expect(asksSomething(rose)).toBe(true);
  });

  it("opt-out puro não ganha resposta", () => {
    for (const frase of ["não quero mais receber nada", "para de me mandar mensagem", "me tira dessa lista"]) {
      expect(asksSomething(frase), frase).toBe(false);
    }
  });

  it("pergunta com ponto de interrogação, ou com palavra de pergunta, conta", () => {
    expect(asksSomething("para de me mandar mensagem. vocês pegaram meu número onde?")).toBe(true);
    expect(asksSomething("nao quero mais receber, quanto era mesmo")).toBe(true);
  });
});

/** Code review, 2026-09-24: recusas ligadas à palavra de pessoa por outras palavras de ligação. */
describe("recusa de atendente com palavras de ligação", () => {
  it("não conta como pedido de pessoa", () => {
    for (const frase of [
      "não precisa chamar atendente",
      "nao preciso de ajuda de atendente",
      "não quero que me passe pra atendente",
      "dispenso atendente",
    ]) {
      expect(namesAPerson(frase), frase).toBe(false);
      expect(handoffFor(read({ asks_human: true }), frase, false), frase).toBeNull();
    }
  });

  it("a negação de outra coisa continua sendo pedido", () => {
    for (const frase of ["não quero robô quero uma pessoa", "nao quero esperar quero atendente"]) {
      expect(namesAPerson(frase), frase).toBe(true);
      expect(handoffFor(read({ asks_human: true }), frase, false), frase).toBe("human");
    }
  });
});

/** Persona round 3 (2026-09-24). */
describe("rodada 3: quem diz que já comprou", () => {
  it("lê a compra passada que ela afirma", () => {
    for (const frase of [
      "oi ja fez 3 dias que comprei\n\nquando chega?",
      "já fiz o pedido e não chegou",
      "fiz um pedido semana passada",
      "meu pedido ainda não chegou",
      "paguei e ninguém me falou nada",
    ]) {
      expect(statesPastPurchase(frase), frase).toBe(true);
    }
  });

  it("a pergunta hipotética e a negação não são compra passada", () => {
    for (const frase of [
      "e se eu não gostar, consigo cancelar depois?",
      "ainda não comprei",
      "quero fazer meu pedido",
      "nunca comprei nada online",
      "quanto custa?",
    ]) {
      expect(statesPastPurchase(frase), frase).toBe(false);
    }
  });

  it("com a compra dita, cancelar vai para o humano; sem ela, fica com a Malu", () => {
    // Lu, turno 1: a compra e a pergunta na mesma mensagem.
    const lu = "oi ja fez 3 dias que comprei\n\nquando chega?";
    expect(handoffFor(read({ post_sale: true }), lu, statesPastPurchase(lu))).toBe("post_sale");
    // Vera: o pedido dito numa mensagem anterior conta pelo histórico.
    const vera = "fiz um pedido semana passada e nada";
    expect(statesPastPurchase(vera, false)).toBe(true);
    expect(handoffFor(read({ wants_cancel: true }), "cancela ai", statesPastPurchase(vera, false))).toBe("cancel");
    const hipotese = "e se eu não gostar, consigo cancelar depois?";
    expect(handoffFor(read({ wants_cancel: true }), hipotese, statesPastPurchase(hipotese))).toBeNull();
  });
});

describe("rodada 3: decisão de compra nas palavras dela", () => {
  it("lê a decisão", () => {
    for (const frase of ["ta bom, vou nesse entao", "quero então", "entao ta quero um G", "pode mandar o link", "vou querer"]) {
      expect(decidesToBuy(frase), frase).toBe(true);
    }
  });

  it("não lê decisão onde não há", () => {
    for (const frase of ["não vou querer não", "quero sim", "quero um desconto", "quero saber o preço", "vou ver"]) {
      expect(decidesToBuy(frase), frase).toBe(false);
    }
  });
});

describe("rodada 3: despedida e a escada", () => {
  it("a despedida é lida", () => {
    for (const frase of ["ah deixa entao kkk vlw", "deixa pra lá, obrigada", "tchau", "deixa quieto"]) {
      expect(saysGoodbye(frase), frase).toBe(true);
    }
  });

  it("\"deixa\" que continua a conversa não é despedida", () => {
    for (const frase of ["deixa eu ver o cep", "deixa então eu te mandar o CEP", "ta", "obrigada pela explicação"]) {
      expect(saysGoodbye(frase), frase).toBe(false);
    }
  });

  it("a escada não recomeça logo depois do \"Sem problemas, estou aqui…\"", () => {
    const solto = read({ pending_answer: "unrelated" });
    const base = { interpreted: true, interpretation: solto, sizeFound: false, factsFound: false };
    const perguntou = "Qual número de calça você usa?";
    expect(decideClarify({ ...base, lastOutbound: perguntou, lastAskedSize: true, parked: true }).kind).toBe("none");
    expect(decideClarify({ ...base, lastOutbound: perguntou, lastAskedSize: true, parked: false }).kind).toBe("reply");
    // Uma escada já em curso segue.
    expect(
      decideClarify({ ...base, lastOutbound: CLARIFY_SIZE_REPLIES[0], lastAskedSize: true, parked: true }).kind,
    ).toBe("reply");
  });

  it("o intérprete sabe que despedida é \"vou pensar\" e que manequim não é calça", () => {
    const { system } = interpretRequest("", "oi");
    expect(system).toContain("deixa pra lá");
    expect(system).toContain("manequim");
    expect(system).toContain("vou nesse então");
  });
});

/** Code review, 2026-09-24: objeção não é compra, e o histórico só lê pedido conosco. */
describe("compra passada: objeção e outra loja não contam", () => {
  const objecoes = [
    "já comprei cinta antes e não gostei",
    "comprei um parecido em outra loja e não serviu",
    "paguei caro numa cinta que não prestou",
    "minha irmã comprei pra ela ano passado e amou",
    "já pedi o link duas vezes",
  ];

  it("nenhuma das objeções é compra passada, nem na mensagem atual nem no histórico", () => {
    for (const frase of objecoes) {
      expect(statesPastPurchase(frase), frase).toBe(false);
      expect(statesPastPurchase(frase, false), frase).toBe(false);
    }
  });

  it("\"comprei\" sozinho vale só na mensagem atual", () => {
    expect(statesPastPurchase("comprei faz 3 dias", true)).toBe(true);
    expect(statesPastPurchase("comprei faz 3 dias", false)).toBe(false);
    expect(statesPastPurchase("já pedi o colete semana passada", false)).toBe(true);
    expect(statesPastPurchase("meu pedido ainda não chegou", false)).toBe(true);
  });
});

describe("decisão de compra: adiamento não é decisão", () => {
  it("adiar não é decidir", () => {
    for (const frase of [
      "vou querer pensar",
      "vou levar uns dias pra decidir",
      "vou fechar aqui o whats, depois te chamo",
      "quero a GG, mas é pra depois",
      "vou comprar quando cair o salário",
    ]) {
      expect(decidesToBuy(frase), frase).toBe(false);
    }
  });

  it("a decisão continua sendo lida", () => {
    for (const frase of ["vou levar o G", "vou querer, pode mandar", "quero então, depois te mando o CEP", "vou comprar esse"]) {
      expect(decidesToBuy(frase), frase).toBe(true);
    }
  });
});

describe("despedida não vence decisão", () => {
  it("com decisão na mesma mensagem, não estaciona", () => {
    for (const frase of ["quero comprar, me manda o link. tchau", "deixa quieto, quero o G mesmo", "deixa então, me manda o link"]) {
      expect(goodbyeParks(frase, NEUTRAL_INTERPRETATION), frase).toBe(false);
    }
    expect(goodbyeParks("tchau", read({ wants_to_buy: true }))).toBe(false);
  });

  it("a despedida pura estaciona", () => {
    for (const frase of ["ah deixa entao kkk vlw", "deixa pra lá, obrigada", "tchau"]) {
      expect(goodbyeParks(frase, NEUTRAL_INTERPRETATION), frase).toBe(true);
    }
  });
});

/** Code review, 2026-09-24: compras conosco que o filtro de objeção derrubava. */
describe("compra passada conosco, mesmo com \"antes\" ou para outra pessoa", () => {
  it("lê a compra", () => {
    for (const frase of [
      "comprei o colete antes de ontem e não chegou",
      "fiz o meu pedido e não recebi",
      "fiz o pedido pra ela ontem, quando chega?",
      "comprei pra minha mãe, cadê?",
    ]) {
      expect(statesPastPurchase(frase), frase).toBe(true);
    }
  });

  it("as objeções continuam fora", () => {
    for (const frase of [
      "já comprei cinta antes e não gostei",
      "comprei um parecido em outra loja e não serviu",
      "paguei caro numa cinta que não prestou",
      "minha irmã comprei pra ela ano passado e amou",
      "já pedi o link duas vezes",
    ]) {
      expect(statesPastPurchase(frase), frase).toBe(false);
    }
  });
});

describe("decisão com \"sim\", \"agora\" e quantidade", () => {
  it("lê a decisão", () => {
    for (const frase of ["vou querer sim", "vou levar sim", "vou comprar agora", "vou fechar agora", "vou querer 2"]) {
      expect(decidesToBuy(frase), frase).toBe(true);
    }
  });

  it("adiamento continua fora", () => {
    for (const frase of ["vou querer pensar", "vou comprar agora não, depois", "vou levar uns dias"]) {
      expect(decidesToBuy(frase), frase).toBe(false);
    }
  });
});

/** Code review, 2026-09-24 (terceira): outra loja vence tudo; "pedido" sozinho não é conosco. */
describe("compra passada: outra loja e medo antigo", () => {
  it("não é compra conosco", () => {
    for (const frase of [
      "fiz um pedido em outra loja e nunca chegou",
      "já fiz um pedido na shopee e não chegou",
      "já fiz um pedido na internet e nunca chegou",
      "da última vez meu pedido não chegou, por isso tenho medo",
      "comprei um colete parecido em outra loja e não serviu",
    ]) {
      expect(statesPastPurchase(frase), frase).toBe(false);
      expect(statesPastPurchase(frase, false), frase).toBe(false);
    }
  });

  it("Lu, Vera e a compra para outra pessoa continuam valendo", () => {
    expect(statesPastPurchase("oi ja fez 3 dias que comprei\n\nquando chega?")).toBe(true);
    expect(statesPastPurchase("fiz um pedido semana passada", false)).toBe(true);
    expect(statesPastPurchase("fiz o pedido pra ela ontem, quando chega?")).toBe(true);
    expect(statesPastPurchase("comprei o colete pelo site de vocês e não chegou")).toBe(true);
  });
});

describe("decisão adiada para o mês ou a semana que vem", () => {
  it("não é decisão", () => {
    for (const frase of ["vou levar sim, mas só mês que vem", "quero comprar semana que vem", "vou querer mes que vem"]) {
      expect(decidesToBuy(frase), frase).toBe(false);
    }
  });

  it("a decisão de agora continua", () => {
    expect(decidesToBuy("vou levar sim")).toBe(true);
    expect(decidesToBuy("quero comprar, me manda o link")).toBe(true);
  });
});

/** M-03 (rodada 4, Jussara recebeu o mesmo link duas vezes seguidas). */
describe("M-03: link já enviado nas últimas 3 mensagens não sai de novo", () => {
  const bases = ["https://entrega.logzz.com.br/pay/encorpa-pa", "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0"];
  const link = "Aqui está: https://entrega.logzz.com.br/pay/encorpa-pa?phone=5511999999999";

  it("link nas últimas 3 mensagens: não reenvia", () => {
    expect(linkSentRecently([link], bases)).toBe(true);
    expect(linkSentRecently(["a", link, "b"], bases)).toBe(true);
    expect(linkSentRecently(["x", link, "a", "b"], bases)).toBe(true);
  });

  it("link mais antigo que 3 mensagens, ou nenhum: pode enviar", () => {
    expect(linkSentRecently([link, "a", "b", "c"], bases)).toBe(false);
    expect(linkSentRecently(["a", "b"], bases)).toBe(false);
    expect(linkSentRecently([], bases)).toBe(false);
    expect(linkSentRecently([link], [""])).toBe(false);
  });

  it("link do outro caminho não bloqueia o link deste (troca de entrega para antecipado)", () => {
    expect(linkSentRecently([link], [bases[1]!])).toBe(false);
  });

  it("ela pede o link de novo: o pedido explícito passa pela janela", () => {
    for (const m of ["manda o link de novo", "me envia o link por favor", "não achei o link", "pode reenviar o link?", "manda um link", "me passa o link por favor", "eu quero, manda o link", "ah sim, manda o link", "não sei, manda o link aí", "Ok, pode passar o link", "manda link"])
      expect(asksForLink(m), m).toBe(true);
    for (const m of [
      "vou pensar",
      "o link é seguro?",
      "abri o link e vi o preço",
      // Segunda revisão: negação e passado dizem que ela já tem o link.
      "já recebi, não precisa mandar o link",
      "não precisa enviar o link de novo",
      "você já mandou o link",
      "vc já enviou o link né",
      "enviaram o link certinho, obrigada",
      "ja passaram o link",
      "passei o link pro meu marido",
      "mandei o link pra minha irmã",
      "abri o link de novo e deu certo",
      // Segunda revisão, segunda rodada: recusa e encaminhamento.
      "para de mandar o link",
      "chega de mandar link",
      "nem manda o link",
      "nunca mais manda esse link",
      "sem mandar o link pra ninguém",
      "já tenho, não, manda o link não",
      "vou passar o link pro meu marido",
      "minha amiga pediu pra eu passar o link pra ela",
      "ele disse pra não mandar o link",
      // Terceira rodada: condição, adiamento e terceiros.
      "nada de mandar o link",
      "deixa de mandar o link",
      "evita mandar o link toda hora",
      "espera antes de mandar o link",
      "pode esperar pra mandar o link?",
      "manda o link só se eu pedir",
      "só manda o link quando eu pedir",
      "ela vai passar o link pro meu marido",
      "meu marido que vai mandar o link",
      // Quarta rodada: intenção dela de encaminhar, e a pergunta respondida com "não".
      "quero passar o link pra minha amiga",
      "eu quero passar o link pro meu marido",
      "passar o link pro grupo da família",
      "mandar o link? não precisa",
      "Enviar link? Não, obrigada",
      // Quinta rodada: pedido para depois não é pedido para agora.
      "manda o link amanhã",
      "sim, manda o link, mas só amanhã",
      "manda o link mais tarde",
      "manda o link à noite",
      "me manda o link na sexta",
      "pode mandar o link semana que vem",
      "passa o link, não!",
    ])
      expect(asksForLink(m), m).toBe(false);
  });
});
