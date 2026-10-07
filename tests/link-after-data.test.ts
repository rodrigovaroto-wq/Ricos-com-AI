import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { asksForName, extractName, nameOnFirstLine, refusedAsks } from "@/agent/identity.js";
import { NEUTRAL_INTERPRETATION, buyerAsk, kitWasOffered, pathChoiceToStore, quantityOf, type Interpretation } from "@/agent/interpret.js";
import { DEFAULT_COD_CONFIRM, twoOptionsMessage } from "@/agent/prompt.js";
import { confirmsAddress } from "@/agent/address.js";
import { buildPrefilledCheckoutLink } from "@/agent/coinzz.js";
import { thinkReply } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Grafo §63 (operator, 2026-10-06): the code obeys the prompt v2 — the link only after size, CEP,
 * payment path, name, e-mail (or one refusal) and CPF (or two refusals); the size picked on the
 * checkout, never "no complemento"; "vou pensar" without the data gets no link; the CEP lookup
 * has its own directive. The decisions are pure functions (`missingForLink`, `sendLinkNow`,
 * `buyerAsk` in tests/interpret.test.ts; `refusedAsks` here); the wiring is read as source.
 */
const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
const out = (body: string) => ({ direction: "outbound", body });
const inn = (body: string) => ({ direction: "inbound", body });

describe("recusas lidas da conversa (refusedAsks)", () => {
  it("CPF recusado uma vez: conta 1 (pede de novo com o motivo); duas: conta 2 (o link vai sem ele)", () => {
    const once = [out("E por último o CPF, pra nota fiscal. Me passa?"), inn("pra que você precisa do meu CPF?")];
    expect(refusedAsks(once, "document")).toBe(1);
    const twice = [...once, out("É pra nota fiscal, que a lei exige. Pode me passar o CPF?"), inn("não passo CPF por WhatsApp")];
    expect(refusedAsks(twice, "document")).toBe(2);
  });

  it("CPF inválido conta como recusa; válido não", () => {
    expect(refusedAsks([out("Qual o seu CPF?"), inn("111.111.111-11")], "document")).toBe(1);
    expect(refusedAsks([out("Qual o seu CPF?"), inn("731.166.873-58")], "document")).toBe(0);
  });

  it("negações: pergunta ainda sem resposta, frase sem pergunta, ou outro campo não contam", () => {
    expect(refusedAsks([out("Qual o seu CPF?")], "document")).toBe(0);
    expect(refusedAsks([out("Seu CPF já vai preenchido no link."), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Qual o seu e-mail?"), inn("não tenho")], "document")).toBe(0);
    // Uma rajada inteira é a resposta: o CPF na segunda mensagem dela vale.
    expect(refusedAsks([out("Qual o seu CPF?"), inn("pera"), inn("73116687358")], "document")).toBe(0);
  });

  it("e-mail recusado uma vez conta; dado não conta", () => {
    expect(refusedAsks([out("Agora seu e-mail? É pra completar o cadastro do pedido."), inn("não tenho e-mail")], "email")).toBe(1);
    expect(refusedAsks([out("Agora seu e-mail?"), inn("maria@gmail.com")], "email")).toBe(0);
  });
});

describe("recusas: o pedido é a frase que pede o campo (achado 3)", () => {
  it("pedido no imperativo conta: CPF e e-mail", () => {
    expect(refusedAsks([out("E por último me passa seu CPF, pra nota fiscal."), inn("não passo cpf")], "document")).toBe(1);
    const twice = [out("E por último me passa seu CPF, pra nota fiscal."), inn("não passo cpf"), out("É pra nota fiscal, que a lei exige. Me manda o CPF."), inn("não vou passar")];
    expect(refusedAsks(twice, "document")).toBe(2);
    expect(refusedAsks([out("Me passa seu e-mail, pra completar o cadastro."), inn("não tenho e-mail")], "email")).toBe(1);
  });
  it("o campo numa frase e 'Me passa?' na seguinte é pedido", () => {
    expect(refusedAsks([out("E por último o CPF, pra nota fiscal. Me passa?"), inn("não")], "document")).toBe(1);
  });
  it("negações: o campo citado ao lado de outra pergunta não é pedido dele", () => {
    expect(refusedAsks([out("O CPF vai na nota. Qual tamanho você usa?"), inn("M")], "document")).toBe(0);
    expect(refusedAsks([out("A confirmação chega no seu e-mail e no WhatsApp. Ficou alguma dúvida?"), inn("não")], "email")).toBe(0);
    expect(refusedAsks([out("Não precisa me passar o CPF agora. Qual o seu CEP?"), inn("01310-100")], "document")).toBe(0);
  });
});

describe("o link no turno espera os dados (index.ts lido como fonte)", () => {
  it("as seis condições entram no link e no 'vou pensar'", () => {
    expect(source).toContain('const cpfRefusals = refusedAsks(recent, "document");');
    expect(source).toContain("cepKnown: Boolean(addressDraft.cep),");
    expect(source).toContain("pathSettled: paymentChoice !== null || knownRegion?.cod === false,");
    expect(source).toContain("nameKnown: Boolean(identityDraft.name),");
    expect(source).toContain('emailDone: Boolean(identityDraft.email) || interpretation.email_unavailable || refusedAsks(recent, "email") > 0,');
    expect(source).toContain("cpfDone: Boolean(identityDraft.document) || cpfRefusals >= 2,");
    expect(source).toContain("const linkNow = !linkJustSent && sendLinkNow({ ...linkData, yesBesideQuestion });");
    expect(source).toContain("thinkLink = linkNow && !(linkInChat");
    // The old exits are gone: wanting to buy, no e-mail, or an ignored ask no longer send it.
    expect(source).not.toContain("readyForLink");
    expect(source).not.toContain("identityAsked");
  });

  it("sem os dados, a diretiva diz o que falta, com o motivo, e que o link não vai", () => {
    expect(source).toContain("O link do pedido só sai com os dados dela, e falta ${topic}.");
    expect(source).toContain("Ela já recusou o CPF uma vez: diga o motivo uma vez");
    expect(source).toContain("Não escreva link nenhum e não diga que vai mandar agora.");
    expect(source).not.toContain("o link sai assim mesmo e o\\n");
    expect(source).not.toMatch(/o link sai assim mesmo/);
    expect(source).toContain("Ela quer fechar, mas o link só sai com o CEP dela");
  });

  it("a diretiva da região sai sozinha, com ou sem tamanho, e nunca como 'saída boa'", () => {
    expect(source).toContain("regionDirectiveFor(knownRegion, paymentChoice),");
    expect(source).toContain("ali a transportadora ainda não tem pagamento na entrega");
    expect(source).toContain("apresente as duas opções, como no PAGAMENTO");
    expect(source).not.toContain("saída boa");
  });

  it("o kit é oferecido depois da escolha, uma vez, e o link do kit é o checkout do kit", () => {
    expect(source).toContain(
      'units === 1 && pathChosen && missing !== "size" && missing !== "cep" && kitsOnPath.length > 0 && !kitOffered && !linkNow && !farewell;',
    );
    expect(source).toContain("linkNow || linkAlreadySent || kitOfferNow ||");
    expect(source).toContain("const kitUrl = units > 1 ? kits.find((k) => k.path === linkPath && k.units === units)?.checkoutUrl : undefined;");
  });

  it("a escolha gravada é a de pathChoiceToStore (comportamento testado abaixo)", () => {
    expect(source).toContain("const choiceToStore = pathChoiceToStore({");
    expect(source).toContain("payment_choice: choiceToStore,");
  });

  it("nenhum texto do turno fala em complemento; o tamanho se escolhe no checkout", () => {
    expect(source).not.toMatch(/complemento/i);
    expect(source).toContain('lá você escolhe o ${size ?? "seu tamanho"}');
    expect(source).toContain("Lá no checkout você escolhe o tamanho de cada peça:");
  });
});

describe("revisão de 7c8bc7c no turno", () => {
  it("a conversa não tomada (0023 ausente) volta ao descarte do §59 na segunda olhada", () => {
    expect(source).toContain("claimFailed = won === null;");
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard.indexOf("if (claimFailed) {")).toBeGreaterThan(guard.indexOf('status: "retry_moot"'));
    expect(guard.indexOf("if (claimFailed) {")).toBeLessThan(guard.indexOf("revisionAllowed("));
  });

  it("a revisão que não leu a rajada não sai sem ler: revisa de novo ou vai à varredura pela mais nova", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("if (inboundId === null && !isRevise) return null;");
    const defer = source.slice(source.indexOf("const deferRetry = async"), source.indexOf("const lateGuard = async"));
    expect(defer).not.toContain("if (inboundId === null) return null;");
    expect(defer).toContain("if (newest === null) return null;");
  });

  it("a migração 0023 diz que a ordem do deploy importa", () => {
    const sql = readFileSync("supabase/migrations/0023_replying_since.sql", "utf8");
    expect(sql).toContain("Deploy order matters: apply this BEFORE the turn");
    expect(sql).not.toContain("deploy order does not matter");
  });
});

describe("kit: 'uma' depois da oferta continua uma peça", () => {
  const read = (over: Partial<Interpretation>): Interpretation => ({ ...NEUTRAL_INTERPRETATION, ...over });
  it("'só uma mesmo' é uma", () => {
    expect(quantityOf("só uma mesmo", read({ units: 1 }))?.units).toBe(1);
  });
  it("um 2 inventado pelo intérprete sobre 'uma' não vira kit", () => {
    expect(quantityOf("uma", read({ units: 2 }))).toBeNull();
  });
});

describe("o link pré-preenchido", () => {
  const cfg = {
    codUrl: "https://entrega.logzz.com.br/pay/encorpa-pa",
    prepayUrl: "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0",
  };
  it("a Coinzz recebe DDD + número, sem o 55; a Logzz recebe com o 55", () => {
    const customer = { name: "Maria Souza", phone: "5511988887777" };
    expect(new URL(buildPrefilledCheckoutLink(customer, "prepay", cfg)).searchParams.get("phone")).toBe("11988887777");
    expect(new URL(buildPrefilledCheckoutLink(customer, "cod", cfg)).searchParams.get("phone")).toBe("5511988887777");
  });
  it("negações: telefone fixo com 55 perde o 55; sem o 55 fica como está", () => {
    expect(new URL(buildPrefilledCheckoutLink({ phone: "551133334444" }, "prepay", cfg)).searchParams.get("phone")).toBe("1133334444");
    expect(new URL(buildPrefilledCheckoutLink({ phone: "11988887777" }, "prepay", cfg)).searchParams.get("phone")).toBe("11988887777");
  });
});

describe("'vou pensar' sem os dados", () => {
  const c = { ...config, prices: { ...config.prices, prepayBrl: 116.91, prepayDiscountPercent: 10 }, scarcity: { unitsLeft: 12 } };
  it.each(["cod", "prepay"] as const)("sem link, passa a cadeia no adiamento (%s)", (path) => {
    const text = thinkReply(c, path, false);
    const blocked = runGates(text, ctx({ config: c, paymentPath: path, codUnavailable: path === "prepay", postponing: true }))
      .traces.filter((t) => t.verdict === "block");
    expect(blocked).toEqual([]);
    expect(text).not.toMatch(/link/);
  });
  it("a linha do kit no 'vou pensar' passa a cadeia", () => {
    const blocked = runGates("Lá no checkout você escolhe o tamanho de cada peça: M e G.", ctx({ config: c, units: 2 }))
      .traces.filter((t) => t.verdict === "block");
    expect(blocked).toEqual([]);
  });
});

/** Grafo §63: os três conflitos do §62 entre o prompt v2 e os gates, com as negações. */
describe("gates: os conflitos do §62", () => {
  const blocks = (text: string, over = {}) =>
    runGates(text, ctx(over)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  const noCod = { paymentPath: "prepay" as const, codUnavailable: true, regionKnown: true };

  it("charge_promise lê 'a transportadora ainda não faz pagamento na entrega' como negação", () => {
    expect(blocks("Aí na sua região a transportadora ainda não faz pagamento na entrega, mas tem o antecipado.", noCod)).toEqual([]);
    expect(blocks("A gente ainda não trabalha com pagamento na entrega aí.", noCod)).toEqual([]);
  });
  it("negativas que não negam (achado 4): 'não faz você pagar mais, você paga na entrega' segue vetada", () => {
    expect(blocks("Isso não faz você pagar mais, você paga na entrega.", noCod)).toContain("charge_promise");
    expect(blocks("Isso não faz pagar na entrega ficar mais caro.", noCod)).toContain("charge_promise");
  });
  it("negações: 'não faz diferença, você paga na entrega' e 'faz pagamento na entrega' seguem vetados", () => {
    expect(blocks("Não faz diferença, você paga na entrega.", noCod)).toContain("charge_promise");
    expect(blocks("A transportadora faz pagamento na entrega aí.", noCod)).toContain("charge_promise");
  });

  it("delivery_promise: 'escolhe um dia em que você vai estar' não é prazo na entrega", () => {
    expect(blocks("Escolhe um dia em que você vai estar em casa.", { paymentPath: "cod" as const })).toEqual([]);
    expect(blocks("Dá pra marcar um dia em que você vai estar em casa.", { paymentPath: "cod" as const })).toEqual([]);
  });
  it("negação (achado 7): no antecipado não existe agendamento — 'marcar um dia' segue vetado", () => {
    expect(blocks("Dá pra marcar um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
    expect(blocks("Escolhe um dia em que você vai estar em casa.", noCod)).toContain("delivery_promise");
  });
  it("negações: 'chega em um dia' segue prazo", () => {
    expect(blocks("No antecipado chega em um dia.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
    expect(blocks("Chega em um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
  });

  it("coverage_claim veta 'no seu CEP dá pra pagar na entrega' antes da consulta", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: false })).toContain("coverage_claim");
    expect(blocks("Dá pra pagar na entrega aí, sim.", { regionKnown: false })).toContain("coverage_claim");
  });
  it("achado 9: 'aí dá pra pagar na entrega' e 'na sua cidade o pagamento na hora funciona' antes da consulta", () => {
    expect(blocks("Aí dá pra pagar na entrega.", { regionKnown: false })).toContain("coverage_claim");
    expect(blocks("Aí na sua cidade a entrega com pagamento na hora funciona.", { regionKnown: false })).toContain("coverage_claim");
  });
  it("achado 9, negações: a condição 'se no seu CEP der' e 'se quiser' sem condição de lugar", () => {
    expect(blocks("Se no seu CEP der, dá pra pagar na entrega aí.", { regionKnown: false })).not.toContain("coverage_claim");
    expect(blocks("Se quiser, dá pra pagar na entrega aí.", { regionKnown: false })).toContain("coverage_claim");
    expect(blocks("Aí dá pra pagar na entrega.", { regionKnown: true })).toEqual([]);
  });
  it("negações: depois da consulta passa; condição, pergunta e negação passam antes dela", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: true })).toEqual([]);
    expect(blocks("Me passa seu CEP que eu vejo se no seu CEP dá pra pagar na entrega?", { regionKnown: false })).toEqual([]);
    expect(blocks("Aí na sua região ainda não tem pagamento na entrega.", { regionKnown: false })).not.toContain("coverage_claim");
  });
});

/** Revisão de f657faa, achados 1 e 2: a escolha que fica gravada é a que ela fez, em palavras naturais. */

describe("a escolha gravada (pathChoiceToStore)", () => {
  const two = twoOptionsMessage(config).join("\n\n");
  const store = (msg: string, interpreted: "cod" | "prepay" | null, lastOutbound = two) =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound, confirms: confirmsAddress(msg) });

  it.each([
    ["a primeira", "cod"],
    ["a segunda", "prepay"],
    ["prefiro a primeira", "cod"],
    ["o antecipado", "prepay"],
    ["prefiro pagar quando receber", "cod"],
    ["quero no pix", "prepay"],
  ] as const)("resposta às duas opções: %s → %s", (msg, path) => {
    expect(store(msg, path)).toBe(path);
  });

  it.each(["qual a diferença das duas?", "a primeira tem rastreio?", "não sei, qual compensa mais?", "não sei ainda, talvez a segunda"])(
    "negação: pergunta ou dúvida depois das duas opções não grava (%s)",
    (msg) => expect(store(msg, "cod")).toBeNull(),
  );

  it("negação: 'a primeira' fora da pergunta das duas opções não grava", () => {
    expect(store("a primeira", "cod", "Qual o número da calça que você usa?")).toBeNull();
  });

  it("sem leitura do intérprete, nada se grava pela pergunta das duas", () => {
    expect(store("a primeira", null)).toBeNull();
  });

  it("'sim' ao padrão da entrega grava a entrega — também com pergunta de compradora ao lado", () => {
    expect(store("sim", null, DEFAULT_COD_CONFIRM)).toBe("cod");
    expect(store("Sim! Como faço pra pagar?", null, DEFAULT_COD_CONFIRM)).toBe("cod");
  });

  it("negações do padrão: 'sim' com outra pergunta, ou o antecipado lido, não gravam a entrega", () => {
    expect(store("sim, tem rastreio?", null, DEFAULT_COD_CONFIRM)).toBeNull();
    expect(store("sim", "prepay", DEFAULT_COD_CONFIRM)).toBeNull();
  });
});

describe("buyerAsk: 'quero saber' não é compra (achado 8)", () => {
  it.each(["sim, quero saber se tem rastreio?", "quero entender como funciona?", "quero ver se serve?"])("%s", (msg) =>
    expect(buyerAsk(msg)).toBe(false),
  );
  it.each(["sim, quero. qual o prazo?", "quero sim, como pago?"])("negação: compra continua (%s)", (msg) => expect(buyerAsk(msg)).toBe(true));
});

describe("a oferta do kit é reconhecida pelo preço, não pela redação (achado 6)", () => {
  it.each([
    "Se levar mais de uma, as duas saem por R$ 239,80 💛",
    "Levando 2 peças sai mais em conta.",
    "Tem o kit também, quer ver?",
    "As três ficam por R$339,70.",
  ])("ofertado: %s", (m) => expect(kitWasOffered([m], [239.8, 339.7])).toBe(true));
  it.each(["O colete sai por R$ 129,90 na entrega.", "Qual o seu tamanho?", "Custa R$ 1.239,80"])("negação: %s", (m) =>
    expect(kitWasOffered([m], [239.8, 339.7])).toBe(false),
  );
});

/** Segunda revisão (41757c8): os furos dos consertos. */
describe("segunda revisão: a escolha gravada é a palavra dela, no caminho que a palavra diz (furo 1)", () => {
  const two = twoOptionsMessage(config).join("\n\n");
  const store = (msg: string, interpreted: "cod" | "prepay") =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound: two, confirms: confirmsAddress(msg) });
  it.each([
    "pix nunca",
    "nunca comprei pelo pix",
    "nem pix nem cartão, só na entrega",
    "antecipado jamais, tenho medo",
    "é minha primeira compra aqui",
    "A entrega é pelos Correios",
    "minha irmã pagou no pix e deu certo",
  ])("não grava: %s", (msg) => {
    expect(store(msg, "prepay")).toBeNull();
    expect(store(msg, "cod")).toBeNull();
  });
  it("a palavra e a leitura discordam: não grava", () => {
    expect(store("a segunda", "cod")).toBeNull();
    expect(store("a primeira", "prepay")).toBeNull();
    expect(store("o antecipado", "cod")).toBeNull();
  });
  it.each([
    ["a primeira 💛", "cod"],
    ["vou de pix", "prepay"],
    ["fico com a segunda", "prepay"],
    ["na entrega mesmo", "cod"],
  ] as const)("grava: %s → %s", (msg, path) => expect(store(msg, path)).toBe(path));
});

describe("segunda revisão: pedido de nome não é pedido de e-mail nem de CPF (furo 2)", () => {
  it("o nome pedido com os outros campos anunciados para depois", () => {
    const msgs = [out("Perfeito! Me passa seu nome completo, que depois eu te peço o e-mail e o CPF."), inn("Maria Silva")];
    expect(refusedAsks(msgs, "email")).toBe(0);
    expect(refusedAsks(msgs, "document")).toBe(0);
    const all = [out("Pra fechar preciso do seu nome completo, e-mail e CPF. Começa pelo nome?"), inn("Maria Silva")];
    expect(refusedAsks(all, "email")).toBe(0);
    expect(refusedAsks(all, "document")).toBe(0);
  });
  it("negação: o pedido só do campo segue contando", () => {
    expect(refusedAsks([out("Agora me passa seu e-mail, pra completar o cadastro."), inn("não tenho")], "email")).toBe(1);
  });
});

describe("segunda revisão: a condição do coverage_claim é de cobertura (furo 3)", () => {
  const blocks = (text: string) =>
    runGates(text, ctx({ regionKnown: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  it.each([
    "Se aí tiver alguém em casa, dá pra pagar na entrega aí.",
    "Se lá tiver alguém pra receber, dá pra pagar na entrega lá.",
    "Se no seu CEP chegar em 3 dias, dá pra pagar na entrega aí.",
    "Se aí for bom pra você, dá pra pagar na entrega aí.",
    "Daí dá pra pagar na entrega.",
  ])("vetada antes da consulta: %s", (t) => expect(blocks(t)).toContain("coverage_claim"));
  it("negação: a condição de cobertura segue isenta", () => {
    expect(blocks("Se no seu CEP der, dá pra pagar na entrega aí.")).not.toContain("coverage_claim");
    expect(blocks("Se aí tiver pagamento na entrega, dá pra pagar na entrega aí.")).not.toContain("coverage_claim");
  });
});

describe("segunda revisão: buyerAsk (furo 5) e o artigo do charge_promise", () => {
  it.each(["sim, quero perguntar uma coisa, tem rastreio?", "quero conferir o rastreio?", "quero sabe se tem rastreio?", "quero tirar uma dúvida?"])(
    "não é compra: %s",
    (m) => expect(buyerAsk(m)).toBe(false),
  );
  it("'não faz o pagamento na entrega' é negação onde não há entrega", () => {
    const noCod = { paymentPath: "prepay" as const, codUnavailable: true, regionKnown: true };
    const blocks = (t: string) => runGates(t, ctx(noCod)).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    expect(blocks("A transportadora ainda não faz o pagamento na entrega aí.")).toEqual([]);
    expect(blocks("Isso não faz o pagar na entrega ficar caro, você paga na entrega.")).toContain("charge_promise");
  });
});

/** Terceira revisão (2749cf7). */
describe("terceira revisão: escolha", () => {
  const two = twoOptionsMessage(config).join("\n\n");
  const store = (msg: string, interpreted: "cod" | "prepay") =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound: two, confirms: confirmsAddress(msg) });
  it.each([
    ["a primeira?", "cod"], ["pix?", "prepay"], ["pelo pix?", "prepay"], ["na entrega?", "cod"],
    ["a segunda?", "prepay"], ["pagar quando receber?", "cod"], ["antecipado??", "prepay"],
  ] as const)("pergunta não grava (furo 1): %s", (msg, path) => expect(store(msg, path)).toBeNull());
  it.each([
    ["a 1", "cod"], ["1", "cod"], ["2", "prepay"], ["opção 1", "cod"], ["a primeira opção", "cod"],
    ["primeira opcao", "cod"], ["a segunda opção", "prepay"], ["primeira kkk", "cod"], ["primeira msm", "cod"],
    ["a primeira né", "cod"], ["a primera", "cod"], ["vou querer a primeira", "cod"], ["pagamento na entrega", "cod"],
  ] as const)("resposta natural grava (médio 3): %s → %s", (msg, path) => expect(store(msg, path)).toBe(path));
  it.each(["a segunda vez que compro", "a primeira vez", "pix nao kkk", "1 dúvida", "tenho 2 filhos"])("negação: %s", (msg) => {
    expect(store(msg, "cod")).toBeNull();
    expect(store(msg, "prepay")).toBeNull();
  });
});

describe("terceira revisão: 'no seu nome' no motivo não apaga o pedido (furo 2)", () => {
  it("CPF e e-mail com o motivo 'no seu nome' contam a recusa", () => {
    expect(refusedAsks([out("Agora o CPF, pra nota fiscal sair no seu nome?"), inn("não passo")], "document")).toBe(1);
    expect(refusedAsks([out("Me passa seu e-mail, pra completar o cadastro do pedido no seu nome."), inn("não tenho")], "email")).toBe(1);
  });
  it("negação: o nome completo pedido junto segue não contando", () => {
    expect(refusedAsks([out("Me passa seu nome completo, que depois eu te peço o e-mail e o CPF."), inn("Maria Silva")], "document")).toBe(0);
  });
});

describe("terceira revisão: condição de prazo não é de cobertura (baixo 4)", () => {
  const blocks = (text: string) =>
    runGates(text, ctx({ regionKnown: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  it("vetada: 'Se aí tiver entrega rápida, …'", () => {
    expect(blocks("Se aí tiver entrega rápida, dá pra pagar na entrega aí.")).toContain("coverage_claim");
  });
  it("negação: 'Se aí tiver pagamento na entrega, …' isenta", () => {
    expect(blocks("Se aí tiver pagamento na entrega, dá pra pagar na entrega aí.")).not.toContain("coverage_claim");
  });
});

/** Quarta revisão (b61ed5b). */
describe("quarta revisão", () => {
  it("pedido de nome sem 'completo' junto do e-mail ou do CPF não conta recusa deles (média)", () => {
    expect(refusedAsks([out("Me passa seu nome e e-mail?"), inn("Maria Souza")], "email")).toBe(0);
    expect(refusedAsks([out("Qual seu nome e CPF?"), inn("Maria Souza")], "document")).toBe(0);
  });
  it("negação: 'no seu nome' / 'em seu nome' segue sendo motivo, e a recusa conta", () => {
    expect(refusedAsks([out("Agora o CPF, pra nota fiscal sair no seu nome?"), inn("não passo")], "document")).toBe(1);
    expect(refusedAsks([out("Me passa o CPF pra emitir em seu nome?"), inn("não")], "document")).toBe(1);
  });
  const two = twoOptionsMessage(config).join("\n\n");
  const store = (msg: string, interpreted: "cod" | "prepay") =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound: two, confirms: confirmsAddress(msg) });
  it.each(["quero 2", "vou querer 2", "fico com 2", "prefiro 2", "quero 1", "pode ser 1"])("número depois de verbo é quantidade, não caminho: %s", (m) => {
    expect(store(m, "prepay")).toBeNull();
    expect(store(m, "cod")).toBeNull();
  });
  it.each([["1", "cod"], ["a 1", "cod"], ["opção 2", "prepay"], ["quero a 2", "prepay"]] as const)("negação: o número sozinho ou com artigo segue escolha: %s", (m, p) =>
    expect(store(m, p)).toBe(p),
  );
  const read = (over: Partial<Interpretation>): Interpretation => ({ ...NEUTRAL_INTERPRETATION, ...over });
  it.each(["a 2", "opcao 2", "opção 2"])("'%s' (a segunda opção) não vira kit de 2", (m) => expect(quantityOf(m, read({ units: 2 }))).toBeNull());
  it("negação: 'quero 2' segue quantidade", () => expect(quantityOf("quero 2", read({ units: 2 }))?.units).toBe(2));
});

/** Quinta revisão (a2d1a10). */
describe("quinta revisão", () => {
  it.each([
    "Agora o CPF, pra nota fiscal sair com seu nome?",
    "Me passa o CPF pra nota ir pro seu nome?",
    "Me passa o CPF pra nota ser emitida para seu nome?",
    "Me passa o CPF pra registrar o pedido com o seu nome?",
    "Me passa o CPF pra nota fiscal sair no seu nome completo?",
  ])("o motivo com qualquer preposição não apaga o pedido do CPF: %s", (q) =>
    expect(refusedAsks([out(q), inn("não passo")], "document")).toBe(1),
  );
  it("negação: 'Qual o seu nome e CPF?' pede o nome", () => {
    expect(refusedAsks([out("Qual o seu nome e CPF?"), inn("Maria Souza")], "document")).toBe(0);
  });
  const two = twoOptionsMessage(config).join("\n\n");
  const store = (msg: string, interpreted: "cod" | "prepay") =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound: two, confirms: confirmsAddress(msg) });
  it.each([["sim, 1", "cod"], ["ok, 2", "prepay"], ["beleza, 2", "prepay"], ["na 2", "prepay"], ["pela 1", "cod"]] as const)(
    "o número com o prefixo curto segue escolha: %s",
    (m, p) => expect(store(m, p)).toBe(p),
  );
});

/** Rodada de personas de 2026-10-07 (Jussara, Cleide). */
describe("diretivas depois da rodada de personas", () => {
  it("o e-mail dispensado é dito ao modelo; a oferta do kit sai sem pedido de dado", () => {
    expect(source).toContain("(!draft.email && emailDone ? ` O e-mail ela não passou e está dispensado: não peça e-mail de novo.` : ``)");
    expect(source).toContain("Nesta mensagem, só a oferta, terminando na pergunta do kit");
    expect(source).toContain("não peça nome, e-mail nem CPF agora");
  });
});

/** Rodada de personas no modelo contribuidor (2026-10-07, Rose): gente que "chega aqui" não é entrega. */
describe("coverage_claim: sujeito pessoa não é cobertura", () => {
  const blocks = (text: string) =>
    runGates(text, ctx({ regionKnown: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  it.each([
    "É normal ficar nessa dúvida, porque a maioria chega aqui com esse mesmo receio.",
    "Muita gente chega aqui com essa dúvida.",
    "Toda cliente chega aqui assim, desconfiada.",
    "Quando você chega aqui já sabe o que quer, né?",
  ])("passa: %s", (t) => expect(blocks(t)).not.toContain("coverage_claim"));
  it.each([
    "O colete chega aqui sim.",
    "Ele chega aí em 3 dias.",
    "Chega aí sim, pode ficar tranquila.",
    "Pra você chega sim aí em Manaus.",
    "Você chega aí rapidinho.",
    "Voce chega aí rapidinho.",
    "Pra você entrega aí em 2 dias.",
    "Pra maioria chega aí em 2 dias.",
    "Para muita gente chega aí em 2 dias.",
    "Pras clientes chega aí em 3 dias.",
    "A gente entrega aí no seu CEP, pode ficar tranquila.",
    "Pra todas as clientes chega aqui.",
    "Pra todas as clientes chega aqui em Manaus.",
    "Pra maioria das clientes chega aqui em 3 dias.",
    "Pra muitas clientes chega aqui em 3 dias.",
    "Pras nossas clientes chega aqui em 3 dias.",
    "Pra várias clientes entrega aqui em 3 dias.",
  ])("negação — o colete chegando segue vetado: %s", (t) =>
    expect(blocks(t)).toContain("coverage_claim"),
  );
});

/** Rodada no contribuidor (2026-10-07, Cleide): nome na 1ª linha e endereço embaixo, na mesma mensagem. */
describe("nome na primeira linha, endereço embaixo", () => {
  it.each([
    ["Cleide Barbosa\nRua Paraiba 210, Adrianopolis, Manaus/AM, CEP 69050-000", "Cleide Barbosa"],
    ["Ana Paula Ferreira\nAv. Brasil 1000, ap 12\n01310-100", "Ana Paula Ferreira"],
  ])("%s", (m, name) => expect(nameOnFirstLine(m)).toBe(name));
  it.each([
    "boa tarde\nRua Paraiba 210, Manaus",
    "quero comprar\nRua Paraiba 210",
    "Maria Silva\nquero comprar",
    "Rua Paraiba 210\nAdrianopolis",
    "Manaus Amazonas\nCEP 69050-000",
    "Segue endereço\nRua Paraiba 210",
    "Endereço completo\nRua Paraiba 210",
    "Parque Dez\nRua X 10",
    "Cidade Nova\nRua X 10, casa 2",
    "Ponta Negra\nRua X 10",
    "Santa Etelvina\nRua X 10",
    "Nova Esperança\nRua X 10",
    "São José\nRua X 10",
    "Dom Pedro\nRua X 10",
    "Conjunto Eldorado\nRua X 10",
    "Conj Vieiralves\nRua X 10",
    "Manaus Amazonas\nRua X 10",
    "Petrópolis Manaus\nRua X 10",
    "Destinatário Cleide Barbosa\nRua X 10",
    "Cleide Barbosa",
  ])("negação: %s", (m) => expect(nameOnFirstLine(m)).toBeNull());
  it("o extrator sozinho segue sem ler a 1ª linha; o turno só a lê logo depois de pedir o nome, sem nome guardado", () => {
    expect(extractName("Cleide Barbosa\nRua Paraiba 210, Manaus")).toBeNull();
    expect(source).toContain("!storedIdentity.name && !burstIdentity.name && asksForName(lastOutbound)");
  });
  it.each(["Qual seu nome completo?", "Me passa seu nome completo, por favor.", "Seu nome completo e o endereço, por favor.", "Pra finalizar: nome completo, CPF e e-mail."])(
    "pedido do nome, com ou sem '?': %s",
    (m) => expect(asksForName(m)).toBe(true),
  );
  it.each(["Me passa seu CPF? A nota sai no seu nome.", "Obrigada, Cleide, já deixei anotado no seu nome.", "Qual seu CEP?"])("negação: %s", (m) =>
    expect(asksForName(m)).toBe(false),
  );
});

/** Rodada final no contribuidor (2026-10-07, Jussara): três recusas de CPF e o link nunca saiu. */
describe("recusa explícita dela conta, seja qual for a redação do pedido", () => {
  const jussara = [
    out("Fechado em 1 peça então.\n\nQual seu nome completo? É pra deixar o pedido no seu nome, por favor?"),
    inn("jussara menezes"),
    out("Obrigada, Jussara.\n\nQual seu e-mail? É pra completar o cadastro do pedido, por favor?"),
    inn("nao tenho email nao\n\nprecisa msm disso ai"),
    out("Sem problemas não ter e-mail, a gente segue assim mesmo, tá?\n\nMe passa seu CPF, por favor? É pra emitir a nota fiscal do pedido, que a lei exige."),
    inn("cpf nao vou passar nao viu\n\nisso ai e golpe é"),
    out("Entendo você ficar com receio, e pode ficar tranquila que é só pra nota fiscal, como a lei pede pra toda compra.\n\nConsegue me mandar só os números pra eu deixar no cadastro do pedido?"),
    inn("nao passo cpf nao\n\nmeu endereço e rua doutor jose lourenço 870 meireles fortaleza ce"),
  ];
  it("a conversa da Jussara conta duas recusas de CPF", () => {
    expect(refusedAsks(jussara, "document")).toBe(2);
    expect(refusedAsks(jussara, "email")).toBe(1);
  });
  it("o motivo 'no seu nome' na frase seguinte não apaga o pedido", () => {
    expect(refusedAsks([out("Sobre o CPF, precisamos dele pra nota fiscal. Consegue me passar só os números pra deixar o pedido certinho no seu nome?"), inn("nao")], "document")).toBe(1);
  });
  it("o campo dispensado com 'tá?' no fim não é pedido", () => {
    expect(refusedAsks([out("Tudo bem sem o CPF, tá?"), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Sem problemas não ter e-mail, a gente segue assim mesmo, tá?"), inn("ta bom")], "email")).toBe(0);
    expect(refusedAsks([out("Tudo bem sem o CPF, pode deixar, tá?"), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Tudo bem sem o CPF, pode ficar tranquila, tá?"), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Sem o CPF a gente passa direto pro link, tá?"), inn("ok")], "document")).toBe(0);
    expect(refusedAsks([out("Sem problemas não ter e-mail, a gente consegue seguir assim, tá?"), inn("ok")], "email")).toBe(0);
  });
  it("negações: CPF dado, CPF citado sem negar, e uma janela conta uma vez só", () => {
    expect(refusedAsks([out("Me passa seu CPF?"), inn("não tem problema, meu cpf é 731.166.873-58")], "document")).toBe(0);
    expect(refusedAsks([inn("o cpf vai na nota né?")], "document")).toBe(0);
    expect(refusedAsks([out("Me passa seu CPF?"), inn("nao passo cpf"), inn("nao passo mesmo o cpf")], "document")).toBe(1);
    expect(refusedAsks([out("Qual o tamanho?"), inn("nao sei")], "document")).toBe(0);
  });
});

describe("'vou pensar' não repete a frase fixa sem nada novo (Cleide, rodada final)", () => {
  it("sem link novo, a frase já dita não sai de novo e o modelo responde", () => {
    expect(source).toContain("const thinkRepeated = thinkLink === null && recentOutbound.some((m: string) => m.startsWith(think.slice(0, 60)));");
    expect(source).toContain("const sent = thinkRepeated ? null : await sendFixed(");
  });
  it("com a frase retida, o modelo sabe que ela se despede: nada de pedir dado, oferta ou link (revisão de 5383dc5)", () => {
    expect(source).toContain("farewell = thinkRepeated;");
    expect(source).toContain("const identityDirective = farewell");
    expect(source).toContain("Responda curto e gentil, sem pedir dado nenhum, sem oferta e sem link.");
    expect(source).toContain("!kitOffered && !linkNow && !farewell;");
    expect(source).toContain("if (farewell) checkoutUrl = null;");
  });
});

/** Revisão de 5383dc5: a recusa espontânea é recusa de verdade, e o pedido com motivo segue pedido. */
describe("recusa: verbo de recusa, não qualquer 'não' perto do campo", () => {
  it.each([
    "nao sei se precisa do cpf",
    "por que precisa do cpf? nao entendi",
    "cpf nao é problema, mas e o frete?",
    "o cpf nao vai aparecer no pacote ne?",
    "nem sei meu cpf de cabeça, posso mandar depois?",
  ])("dúvida não é recusa: %s", (m) => expect(refusedAsks([inn(m), out("Claro, te explico."), inn(m)], "document")).toBe(0));
  it.each(["o email nao chegou", "nao recebi email nenhum de voces"])("e-mail citado não é recusa: %s", (m) =>
    expect(refusedAsks([inn(m)], "email")).toBe(0),
  );
  it("recusa espontânea com verbo conta", () => {
    expect(refusedAsks([inn("nao passo cpf de jeito nenhum")], "document")).toBe(1);
  });
  it.each(["nao passo o cpf", "ja falei que cpf nao passo", "não vou passar meu cpf não"])("recusa com o campo colado ao verbo conta, mesmo depois de pedido sem a palavra CPF: %s", (m) => {
    const msgs = [out("Me passa seu CPF? É pra nota fiscal."), inn("cpf nao vou passar"), out("Consegue me mandar só os números?"), inn(m)];
    expect(refusedAsks(msgs, "document")).toBe(2);
  });
  it("limite conhecido: 'esse dado eu não passo' depois de pedido sem a palavra CPF não conta (a diretiva manda citar o CPF)", () => {
    const msgs = [out("Me passa seu CPF? É pra nota fiscal."), inn("cpf nao vou passar"), out("Consegue me mandar só os números?"), inn("esse dado eu não passo")];
    expect(refusedAsks(msgs, "document")).toBe(1);
    expect(source).toContain("peça de novo citando o CPF");
  });
  it.each([
    ["o email é so pra nao dar problema na entrega ne?", "email"],
    ["pode mandar o boleto no email? nao quero dar trabalho", "email"],
    ["o cpf é pra nao dar problema na nota?", "document"],
    ["posso passar o cpf amanha? hoje nao dou conta", "document"],
    ["cpf eu passo sim, so nao passo cartao", "document"],
  ] as const)("'não' + verbo com outro objeto não é recusa: %s", (m, f) => expect(refusedAsks([inn(m)], f)).toBe(0));
  it.each([
    ["Qual seu CEP?", "nao vou passar agora, to na rua"],
    ["Sem problema! Prefere pagar na entrega ou no pix?", "nao vou passar cartao, na entrega"],
    ["Tudo bem!", "nao quero passar meu endereço"],
    ["Fica tranquila!", "kkk nao vou passar mal nao"],
  ])("recusa de outra coisa não vira recusa de CPF: %s / %s", (q, a) => {
    expect(refusedAsks([out("Me passa seu CPF?"), inn("nao passo"), out(q), inn(a)], "document")).toBe(1);
  });
  it.each([
    "Sem o CPF eu não consigo emitir a nota, pode me passar?",
    "Sem seu CPF a nota não sai: me passa só os números?",
    "Não ter o CPF trava a nota, consegue me mandar?",
  ])("pedido com o motivo 'sem o CPF' segue pedido: %s", (q) => expect(refusedAsks([out(q), inn("não")], "document")).toBe(1));
});

/** Revisão de 6f3a6a6: dúvida com "se" não é recusa; formas comuns de recusa contam; a ordem da despedida. */
describe("recusa: condicional e formas do WhatsApp", () => {
  it.each(["e se eu nao passar o cpf tem problema?", "se eu nao informar o cpf da problema?", "e se eu nao passar o cpf tem problema", "se eu nao informar o cpf da problema"])("condicional não é recusa: %s", (m) => {
    const msgs = [out("Me passa seu CPF?"), inn("pra que?"), out("Consegue me mandar só os números?"), inn(m)];
    expect(refusedAsks(msgs, "document")).toBe(1);
  });
  it.each(["não vou te passar meu cpf", "nao te passo o cpf", "não passo o meu cpf", "n passo cpf", "n vou passar cpf nao"])("recusa conta: %s", (m) =>
    expect(refusedAsks([inn(m)], "document")).toBe(1),
  );
  it.each(["n sei se precisa do cpf", "n tenho o cpf aqui agora"])("negação: %s", (m) => expect(refusedAsks([inn(m)], "document")).toBe(0));
  it("o link da despedida é descartado antes de a diretiva do checkout ser montada", () => {
    expect(source.indexOf("if (farewell) checkoutUrl = null;")).toBeGreaterThan(-1);
    expect(source.indexOf("if (farewell) checkoutUrl = null;")).toBeLessThan(source.indexOf("const checkoutDirective = checkoutDirectiveFor("));
  });
});

/** Confirmação no contribuidor (Jussara): o e-mail da loja na frase não é pedido do e-mail dela. */
describe("e-mail da loja não é pedido do e-mail dela", () => {
  it("'me manda um e-mail pra contato@…' + resposta sem e-mail não conta recusa", () => {
    const q = "Sobre o CNPJ e os dados da empresa, me manda um e-mail pra contato@encorpa-fashion.com.br que por lá o time passa as informações.";
    expect(refusedAsks([out(q), inn("ta mas se eu nao tiver o dinheiro na hora como e que fica")], "email")).toBe(0);
  });
  it("negação: o pedido do e-mail dela segue contando", () => {
    expect(refusedAsks([out("Me passa seu e-mail? É pro cadastro do pedido."), inn("nao tenho")], "email")).toBe(1);
  });
});

describe("revisão de 3c613a4", () => {
  it.each(["Me passa seu e-mail, tipo nome@gmail.com?", "Qual seu e-mail (ex: maria@gmail.com)?"])("pedido com exemplo de endereço segue pedido: %s", (q) =>
    expect(refusedAsks([out(q), inn("nao tenho")], "email")).toBe(1),
  );
  it.each(["tem como nao passar o cpf?", "posso n passar o cpf?", "e se caso eu nao passar o cpf?"])("pergunta não é recusa espontânea: %s", (m) =>
    expect(refusedAsks([inn(m)], "document")).toBe(0),
  );
});
