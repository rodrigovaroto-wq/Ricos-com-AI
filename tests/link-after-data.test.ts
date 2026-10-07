import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { emailRefused, refusedAsks } from "@/agent/identity.js";
import {
  asksForLink,
  buyerAsk,
  assentsToBoth,
  choiceToStore,
  choosesPath,
  storedChoiceHolds,
  kitOfferDue,
  checkoutHosts,
  linkedBase,
  linkGoesOut,
  missingForLink,
  NEUTRAL_INTERPRETATION,
  pathAnswer,
  quantityOf,
  withdrawsInBurst,
  type Interpretation,
} from "@/agent/interpret.js";
import { buildPrefilledCheckoutLink } from "@/agent/coinzz.js";
import { DEFAULT_COD_CONFIRM, noCodMessage, twoOptionsMessage } from "@/agent/prompt.js";
import { secondLook, thinkReply } from "@/agent/retry.js";
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

describe("o link no turno espera os dados (index.ts lido como fonte)", () => {
  it("as seis condições entram no link e no 'vou pensar'", () => {
    expect(source).toContain('const cpfRefusals = refusedAsks(recent, "document");');
    expect(source).toContain("cepKnown: Boolean(addressDraft.cep),");
    expect(source).toContain("pathSettled: paymentChoice !== null || knownRegion?.cod === false,");
    expect(source).toContain("nameKnown: Boolean(identityDraft.name),");
    expect(source).toContain("emailDone: Boolean(identityDraft.email) || emailRefusedNow,");
    expect(source).toContain("cpfDone: Boolean(identityDraft.document) || cpfRefusals >= 2,");
    expect(source).toContain("const linkNow = linkGoesOut({");
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
    expect(source).toContain("regionDirectiveFor(knownRegion, paymentChoice, assentsToBoth(lastOutbound, parts, knownRegion?.cod ?? null)),");
    expect(source).toContain("ali a transportadora ainda não tem pagamento na entrega");
    expect(source).toContain("apresente as duas opções, como no PAGAMENTO");
    expect(source).not.toContain("saída boa");
  });

  it("o kit é oferecido depois da escolha, uma vez, e o link do kit é o checkout do kit", () => {
    expect(source).toContain("const kitOfferNow = kitOfferDue({ units, pathChosen, missing, kitsOnPath: kitsOnPath.length, kitOffered, linkNow });");
    expect(source).toContain("linkNow || linkAlreadySent || kitOfferNow ||");
    expect(source).toContain("const kitUrl = units > 1 ? kits.find((k) => k.path === linkPath && k.units === units)?.checkoutUrl : undefined;");
  });

  it("a escolha lida (choiceToStore) é a gravada", () => {
    expect(source).toContain("payment_choice: chosenPath,");
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
    expect(guard).toContain("      claimFailed,\n");
  });

  it("a revisão que não leu a rajada não sai sem ler: revisa de novo ou vai à varredura pela mais nova", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("const draftRead = !isRevise || inboundId !== null;");
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
  it("negações: 'não faz diferença, você paga na entrega' e 'faz pagamento na entrega' seguem vetados", () => {
    expect(blocks("Não faz diferença, você paga na entrega.", noCod)).toContain("charge_promise");
    expect(blocks("A transportadora faz pagamento na entrega aí.", noCod)).toContain("charge_promise");
  });

  it("delivery_promise: o dia que ela escolhe, com a oração relativa, não é prazo", () => {
    expect(blocks("Escolhe um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toEqual([]);
    expect(blocks("Dá pra marcar um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toEqual([]);
  });
  it("negações: 'chega em um dia' segue prazo", () => {
    expect(blocks("No antecipado chega em um dia.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
    expect(blocks("Chega em um dia em que você vai estar em casa.", { paymentPath: "prepay" as const })).toContain("delivery_promise");
  });

  it("coverage_claim veta 'no seu CEP dá pra pagar na entrega' antes da consulta", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: false })).toContain("coverage_claim");
    expect(blocks("Dá pra pagar na entrega aí, sim.", { regionKnown: false })).toContain("coverage_claim");
  });
  it("negações: depois da consulta passa; condição, pergunta e negação passam antes dela", () => {
    expect(blocks("No seu CEP dá pra pagar na entrega, então você tem duas opções.", { regionKnown: true })).toEqual([]);
    expect(blocks("Me passa seu CEP que eu vejo se no seu CEP dá pra pagar na entrega?", { regionKnown: false })).toEqual([]);
    expect(blocks("Aí na sua região ainda não tem pagamento na entrega.", { regionKnown: false })).not.toContain("coverage_claim");
  });
});

/**
 * Revisão de f657faa (NEEDS WORK): cada achado provado pelo comportamento — funções puras que o
 * turno chama —, não pela fonte. A fiação que liga cada uma ao turno é lida como fonte no fim.
 */
describe("revisão de f657faa — 1: a escolha do pagamento fica gravada", () => {
  const options = twoOptionsMessage(config).join("\n\n");
  const answers: Array<[string, "cod" | "prepay" | null]> = [
    ["a primeira", "cod"],
    ["a segunda", "prepay"],
    ["a primeira opção", "cod"],
    ["A segunda opção!", "prepay"],
    ["pagar quando receber", "cod"],
    ["prefiro receber e pagar", "cod"],
  ];
  it.each(answers)("'%s' às duas opções é gravada como %s", (answer, path) => {
    // O intérprete pode ler ou não: a leitura determinística é que grava.
    expect(choiceToStore(null, [answer], options, true)).toBe(path);
    // Quando o intérprete lê o caminho, o mesmo é gravado.
    expect(choiceToStore(path, [answer], options, true)).toBe(path);
  });

  it("a ordem é a da mensagem dela, não uma frase fixa: antecipado primeiro inverte", () => {
    const flipped = "No pix você ganha 10% de desconto. Ou paga na entrega, R$ 129,90 quando receber. Qual você prefere?";
    expect(pathAnswer(flipped, ["a primeira"], true)).toBe("prepay");
    expect(pathAnswer(flipped, ["a segunda"], true)).toBe("cod");
  });

  it("o 'sim' à confirmação do pagamento na entrega grava, em qualquer redação", () => {
    for (const ask of [DEFAULT_COD_CONFIRM, "Fica no pagamento na entrega então, tudo bem?", "Deixo pra você pagar na entrega, combinado?"]) {
      for (const yes of ["sim", "pode ser", "ok", "tá bom", "beleza"]) expect(choiceToStore(null, [yes], ask, true), `${ask} + ${yes}`).toBe("cod");
    }
  });

  it("gravada, o turno seguinte segue: oferta do kit, depois os dados — nunca a pergunta de novo", () => {
    for (const [answer, path] of answers) {
      // Turno 1: ela responde às duas opções; a escolha é gravada.
      const stored = choiceToStore(null, [answer], options, true);
      expect(stored, answer).toBe(path);
      // Turno 1 também oferece o kit (tamanho e CEP já ditos).
      const data = { sizeKnown: true, cepKnown: true, pathSettled: stored !== null, nameKnown: false, emailDone: false, cpfDone: false };
      expect(missingForLink(data), answer).toBe("name");
      expect(kitOfferDue({ units: 1, pathChosen: stored !== null, missing: missingForLink(data), kitsOnPath: 2, kitOffered: false, linkNow: false })).toBe(true);
      // Turno 2: "só uma mesmo" depois da oferta — nada lê caminho, e o guardado vale.
      const next = choiceToStore(null, ["só uma mesmo"], "Levando 2 peças sai R$ 233,82. Quer levar mais uma?", true) ?? stored;
      expect(next, answer).toBe(path);
      expect(missingForLink({ ...data, pathSettled: next !== null })).toBe("name");
      expect(kitOfferDue({ units: 1, pathChosen: true, missing: "name", kitsOnPath: 2, kitOffered: true, linkNow: false })).toBe(false);
    }
  });

  it("negações: pergunta, dúvida, 'sim' a outra pergunta e 'sim' às duas sem escolher não gravam", () => {
    expect(choiceToStore(null, ["a primeira chega quando?"], options, true)).toBeNull();
    expect(choiceToStore(null, ["não sei qual a melhor"], options, true)).toBeNull();
    expect(choiceToStore(null, ["sim"], "Qual o número da sua calça?", true)).toBeNull();
    expect(choiceToStore(null, ["sim"], "No pagamento na entrega você tem 7 dias pra devolver. Qual o seu CEP?", true)).toBeNull();
    // O "sim" às duas opções sem escolher pede a confirmação do prompt antes de gravar.
    expect(choiceToStore(null, ["sim"], options, true)).toBeNull();
    expect(choiceToStore(null, ["não"], DEFAULT_COD_CONFIRM, true)).toBeNull();
    expect(choiceToStore(null, ["sim, mas tem rastreio?"], DEFAULT_COD_CONFIRM, true)).toBeNull();
    expect(choiceToStore(null, ["segunda-feira eu estou em casa"], options, true)).toBeNull();
    // Onde o pagamento na entrega não chega, ordinal e "quando receber" não viram entrega.
    expect(choiceToStore(null, ["pagar quando receber"], noCodMessage(config), false)).toBeNull();
  });

  it("choosesPath aprende 'pagar quando receber' e 'receber e pagar'; a dúvida continua fora", () => {
    expect(choosesPath("pagar quando receber")).toBe(true);
    expect(choosesPath("prefiro receber e pagar")).toBe(true);
    expect(choosesPath("quero saber se posso pagar quando receber")).toBe(false);
    expect(choosesPath("dá pra pagar quando receber?")).toBe(false);
  });
});

describe("revisão de f657faa — 8: sem pagamento na entrega, o 'sim' ao antecipado é a escolha", () => {
  it.each(["ok", "sim", "pode ser", "tá bom", "quero"])("'%s' à mensagem do antecipado grava o antecipado", (yes) => {
    expect(choiceToStore(null, [yes], noCodMessage(config), false)).toBe("prepay");
    expect(choiceToStore(null, [yes], `${noCodMessage(config)} Quer seguir assim?`, false)).toBe("prepay");
  });
  it("e o kit é oferecido uma vez, depois os dados", () => {
    expect(kitOfferDue({ units: 1, pathChosen: true, missing: "name", kitsOnPath: 2, kitOffered: false, linkNow: false })).toBe(true);
    expect(kitOfferDue({ units: 1, pathChosen: true, missing: "name", kitsOnPath: 2, kitOffered: true, linkNow: false })).toBe(false);
  });
  it("negações: 'não', pergunta, ou mensagem que não fala do antecipado não gravam", () => {
    expect(choiceToStore(null, ["não"], noCodMessage(config), false)).toBeNull();
    expect(choiceToStore(null, ["quero saber o prazo"], noCodMessage(config), false)).toBeNull();
    expect(choiceToStore(null, ["ok, e tem rastreio?"], noCodMessage(config), false)).toBeNull();
    expect(choiceToStore(null, ["ok"], "Qual o número da sua calça?", false)).toBeNull();
    // Onde a entrega chega, o "ok" à mensagem do antecipado não escolhe nada sozinho.
    expect(choiceToStore(null, ["ok"], noCodMessage(config), true)).toBeNull();
  });
});

describe("revisão de f657faa — 2: o link não é reenviado", () => {
  const base = "https://entrega.logzz.com.br/pay/encorpa-pa";
  const kit2 = "https://entrega.logzz.com.br/pay/encorpa-pa-kit2";
  const bases = [base, "https://app.coinzz.com.br/checkout/encorpa", kit2];
  const done = { sizeKnown: true, cepKnown: true, pathSettled: true, nameKnown: true, emailDone: true, cpfDone: true };
  const turn = (over: Partial<Parameters<typeof linkGoesOut>[0]>) =>
    linkGoesOut({ ...done, yesBesideQuestion: false, sentBefore: false, orderChanged: false, asked: false, withdrew: false, ...over });

  it("sai uma vez, com os dados", () => {
    expect(turn({})).toBe(true);
  });

  it("link, três perguntas e respostas, 'tá bom' → sem link; 'me manda o link de novo' → link", () => {
    const sent = `Aqui está: ${base}?name=Maria`;
    const history = [sent, "O prazo é de 1 a 3 dias.", "Tem rastreio sim.", "Pode lavar à mão."];
    const last = history.findLast((m) => linkedBase(m, bases) !== null) ?? null;
    expect(linkedBase(last!, bases)).toBe(base);
    for (const msg of ["tá bom", "qual o prazo?", "obrigada"]) {
      expect(turn({ sentBefore: true, asked: asksForLink(msg), orderChanged: linkedBase(last!, bases) !== base }), msg).toBe(false);
    }
    expect(turn({ sentBefore: true, asked: asksForLink("me manda o link de novo"), orderChanged: false })).toBe(true);
  });

  it("mudou pra 2 peças → link novo do kit (o do kit não é lido como o de uma peça)", () => {
    const last = `Aqui está: ${base}?name=Maria`;
    expect(turn({ sentBefore: true, orderChanged: linkedBase(last, bases) !== kit2 })).toBe(true);
    // E o link do kit enviado não volta a sair na rodada seguinte.
    expect(linkedBase(`Aqui: ${kit2}?name=Maria`, bases)).toBe(kit2);
    expect(turn({ sentBefore: true, orderChanged: linkedBase(`Aqui: ${kit2}?name=Maria`, bases) !== kit2 })).toBe(false);
  });

  it("depois do primeiro link, nome, e-mail e CPF não seguram o pedido dela; tamanho e CEP seguram", () => {
    expect(turn({ sentBefore: true, asked: true, emailDone: false, cpfDone: false })).toBe(true);
    expect(turn({ sentBefore: true, orderChanged: true, sizeKnown: false })).toBe(false);
  });

  it("ela desistiu: o link segura, com ou sem envio anterior", () => {
    expect(turn({ withdrew: true })).toBe(false);
    expect(turn({ sentBefore: true, asked: true, withdrew: true })).toBe(false);
    expect(withdrawsInBurst(["731.166.873-58", "pensando bem, desisti"])).toBe(true);
    expect(withdrawsInBurst(["quero o M", "não quero mais"])).toBe(true);
    expect(withdrawsInBurst(["não vou passar o CPF, deixa pra lá"])).toBe(true);
  });
  it("negações: desistência negada, desfeita, ou recusa do kit não seguram", () => {
    expect(withdrawsInBurst(["não desisti não, quero sim"])).toBe(false);
    expect(withdrawsInBurst(["desisti do kit", "vou levar uma"])).toBe(false);
    expect(withdrawsInBurst(["não vou querer o kit, só uma"])).toBe(false);
    expect(withdrawsInBurst(["quero o M", "depois de amanhã pode entregar?"])).toBe(false);
    expect(withdrawsInBurst(["tá bom"])).toBe(false);
  });
});

describe("revisão de f657faa — 3: 'um dia' depois de marcar/agendar só sai na oração relativa", () => {
  const blocks = (text: string) =>
    runGates(text, ctx({ paymentPath: "prepay" as const })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
  it.each([
    "Pelo pix a entrega é marcada um dia depois do pagamento.",
    "A entrega é agendada um dia após a compra.",
    "No antecipado a transportadora agenda um dia depois e entrega.",
    "Pagando no pix, a gente marca um dia só de prazo pra chegar.",
  ])("vetada no antecipado: %s", (lie) => {
    expect(blocks(lie)).toContain("delivery_promise");
  });
  it.each(["Escolhe um dia em que você vai estar em casa.", "Dá pra marcar um dia em que você vai estar em casa.", "Você agenda um dia que você esteja em casa."])(
    "passa: %s",
    (ok) => {
      expect(blocks(ok)).toEqual([]);
    },
  );
});

describe("revisão de f657faa — 4 e 5: recusa só de pedido de verdade, e a régua não interrompe o par", () => {
  it("resposta sobre o CPF seguida de outra pergunta não é pedido do CPF", () => {
    expect(refusedAsks([out("O CPF é pra nota fiscal. Qual o seu nome completo?"), inn("Maria Souza")], "document")).toBe(0);
    expect(refusedAsks([out("O e-mail é só pro cadastro. Qual o seu CEP?"), inn("01310-100")], "email")).toBe(0);
    expect(refusedAsks([out("O CPF é pra nota fiscal, que a lei exige. Me passa seu nome completo?"), inn("Maria Souza")], "document")).toBe(0);
  });
  it("o pedido de verdade continua contando", () => {
    expect(refusedAsks([out("E por último o CPF, pra nota fiscal. Me passa?"), inn("não")], "document")).toBe(1);
    expect(refusedAsks([out("Pra nota fiscal eu preciso do seu CPF, pode me passar?"), inn("não")], "document")).toBe(1);
  });
  it("'Qual seu CPF?' → 'Ainda está aí?' → 'não vou passar' conta 1", () => {
    expect(refusedAsks([out("Qual seu CPF?"), out("Ainda está aí?"), inn("não vou passar")], "document")).toBe(1);
    expect(refusedAsks([out("Qual seu CPF?"), out("Ainda está aí?"), inn("731.166.873-58")], "document")).toBe(0);
  });
  it("um toque que pede o dado de novo é dono da resposta: uma recusa só", () => {
    expect(refusedAsks([out("Qual seu CPF?"), out("Ainda está aí? Me passa o CPF?"), inn("não")], "document")).toBe(1);
  });
  it("a recusa do e-mail fica guardada e vale nos turnos seguintes", () => {
    // Turno 1: ela diz que não tem e-mail sem ninguém pedir — só o intérprete lê.
    expect(emailRefused({}, true, [inn("não tenho e-mail")])).toBe(true);
    // Turno 2: a conversa não mostra o pedido; o que vale é o guardado.
    expect(emailRefused({ emailRefused: true }, false, [])).toBe(true);
    // Negação: nada guardado, nada lido, nada recusado.
    expect(emailRefused({}, false, [out("Qual seu e-mail?"), inn("maria@gmail.com")])).toBe(false);
    expect(emailRefused(null, false, [])).toBe(false);
  });
});

describe("revisão de f657faa — 6: a revisão não manda rascunho que não leu", () => {
  const look = (over: Partial<Parameters<typeof secondLook>[0]>) =>
    secondLook({ retry: false, draftRead: true, newer: false, claimFailed: false, revisionAllowed: true, ...over });
  it("a revisão que não leu a rajada nunca sai: revisa de novo ou vai à varredura", () => {
    expect(look({ draftRead: false, newer: null })).toBe("revise");
    expect(look({ draftRead: false, newer: null, revisionAllowed: false })).toBe("defer");
    expect(look({ draftRead: false, newer: true, revisionAllowed: false })).toBe("defer");
  });
  it("mensagem nova e revisões esgotadas: varredura, nunca o rascunho", () => {
    expect(look({ newer: true, revisionAllowed: false })).toBe("defer");
    expect(look({ newer: true })).toBe("revise");
  });
  it("negações: rascunho que leu tudo sai; leitura que falha não cala quem foi lida", () => {
    expect(look({})).toBe("send");
    expect(look({ newer: null })).toBe("send");
  });
  it("a nova tentativa e a conversa não tomada param como antes", () => {
    expect(look({ retry: true, newer: true })).toBe("stop");
    expect(look({ retry: true, newer: null })).toBe("stop");
    expect(look({ retry: true })).toBe("send");
    expect(look({ claimFailed: true, newer: true })).toBe("stop");
  });
});

describe("revisão de f657faa — 7: 'quero saber' não é pergunta de quem compra", () => {
  it.each(["sim, quero saber se tem rastreio?", "sim, quero saber quanto tempo demora?", "ok, quero ver como lava?", "sim, quero entender o frete?", "sim, quero perguntar uma coisa?"])(
    "%s não é",
    (msg) => {
      expect(buyerAsk(msg)).toBe(false);
    },
  );
  it.each(["sim, quero. qual o prazo?", "quero sim, como pago?"])("%s continua sendo", (msg) => {
    expect(buyerAsk(msg)).toBe(true);
  });
});

describe("revisão de f657faa — fiação no turno (fonte)", () => {
  it("a escolha gravada é a de choiceToStore; nada de frase literal", () => {
    expect(source).toContain("const chosenPath = choiceToStore(interpretation.payment_choice, parts, lastOutbound, knownRegion?.cod ?? null);");
    expect(source).toContain("if (chosenPath !== null) {");
    expect(source).not.toContain("defaultCod");
  });
  it("o link lê a conversa inteira e linkGoesOut decide", () => {
    expect(source).toContain("const linkNow = linkGoesOut({");
    expect(source).not.toContain("linkJustSent");
    expect(source).toContain("for (const host of checkoutHosts(checkoutBases)) {");
  });
  it("a segunda olhada é secondLook, e o adiamento que falha não manda o rascunho", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("secondLook({");
    expect(guard).toContain("?? (await modelFailure(");
  });
  it("a recusa do e-mail é guardada na identidade", () => {
    expect(source).toContain("emailRefused: true");
  });
});

/** Re-revisão de 35d70c0: o que ainda faltava em cada achado. */
describe("re-revisão de 35d70c0 — 1: respostas comuns às duas opções", () => {
  const options = twoOptionsMessage(config).join("\n\n");
  it.each([
    ["a do pix", "prepay"],
    ["a da entrega", "cod"],
    ["a de entrega", "cod"],
    ["no pix", "prepay"],
    ["na entrega mesmo", "cod"],
    ["a primeira mesmo", "cod"],
    ["Primeira, por favor", "cod"],
    ["opção 1", "cod"],
    ["1", "cod"],
    ["opção 2", "prepay"],
    ["2", "prepay"],
    ["a segunda, por favor", "prepay"],
  ] as const)("'%s' → %s", (answer, path) => {
    expect(pathAnswer(options, [answer], true)).toBe(path);
  });
  it("oferta de um caminho só, com a pergunta curta depois", () => {
    expect(pathAnswer("Pagando no pix você ganha 10% de desconto. Prefere assim?", ["sim"], true)).toBe("prepay");
    expect(pathAnswer("Pagando na entrega você paga só quando receber. Pode ser?", ["sim"], true)).toBe("cod");
  });
  it("negações: número que não é opção, pergunta curta sobre outra coisa, os dois caminhos na frase", () => {
    expect(pathAnswer(options, ["12"], true)).toBeNull();
    expect(pathAnswer(options, ["a do pix tem desconto?"], true)).toBeNull();
    expect(pathAnswer("O colete tem 7 dias pra devolver. Pode ser?", ["sim"], true)).toBeNull();
    expect(pathAnswer("No pix tem desconto e na entrega você paga quando receber. Pode ser?", ["sim"], true)).toBeNull();
    expect(pathAnswer("Qual o número da sua calça?", ["1"], true)).toBeNull();
  });
});

describe("re-revisão de 35d70c0 — 1b: 'sim' às duas opções vira a confirmação, e o 'sim' a ela grava", () => {
  const options = twoOptionsMessage(config).join("\n\n");
  it("'sim'/'pode ser' às duas opções: não grava, e pede a confirmação da entrega", () => {
    for (const yes of ["sim", "pode ser", "ok"]) {
      expect(choiceToStore(null, [yes], options, true)).toBeNull();
      expect(assentsToBoth(options, [yes], true)).toBe(true);
    }
    // A confirmação que o prompt ensina, respondida com "sim", grava a entrega.
    expect(choiceToStore(null, ["sim"], DEFAULT_COD_CONFIRM, true)).toBe("cod");
    expect(choiceToStore(null, ["pode ser"], DEFAULT_COD_CONFIRM, true)).toBe("cod");
  });
  it("negações: sem entrega na região, uma escolha, uma pergunta, ou outra mensagem não pedem a confirmação", () => {
    expect(assentsToBoth(options, ["sim"], false)).toBe(false);
    expect(assentsToBoth(options, ["a primeira"], true)).toBe(false);
    expect(assentsToBoth(options, ["sim, tem rastreio?"], true)).toBe(false);
    expect(assentsToBoth("Qual o número da sua calça?", ["sim"], true)).toBe(false);
    expect(assentsToBoth(DEFAULT_COD_CONFIRM, ["sim"], true)).toBe(false);
  });
  it("a diretiva da região manda confirmar a entrega, só onde ela chega (fonte)", () => {
    expect(source).toContain("regionDirectiveFor(knownRegion, paymentChoice, assentsToBoth(lastOutbound, parts, knownRegion?.cod ?? null)),");
    expect(source).toContain('palavras: "${DEFAULT_COD_CONFIRM}" Não pergunte de novo qual das duas.');
    // Só no ramo em que a entrega chega: o ramo sem entrega retorna antes.
    const fn = source.slice(source.indexOf("const regionDirectiveFor = ("), source.indexOf("const identityDirectiveFor"));
    expect(fn.indexOf("if (!region.cod) {")).toBeLessThan(fn.indexOf("agreedToBoth\n"));
  });
});

describe("re-revisão de 35d70c0 — 2: desistir de um pedaço não é desistir da compra", () => {
  it.each(["deixa pra lá o kit, só uma", "mudei de ideia, quero o G", "deixa pra lá, manda o link", "desisti do kit", "não quero mais o kit", "mudei de ideia, vou levar duas"])(
    "%s não segura o link",
    (msg) => {
      expect(withdrawsInBurst([msg])).toBe(false);
    },
  );
  it.each(["desisti", "mudei de ideia", "deixa pra lá", "não quero mais, obrigada", "pensando bem, desisti"])("%s continua desistência", (msg) => {
    expect(withdrawsInBurst([msg])).toBe(true);
  });
});

describe("re-revisão de 35d70c0 — 3: sem entrega, só o 'sim' sobre pagar grava; e a entrega que chega depois reabre", () => {
  it("negações: 'sim' a outra pergunta numa mensagem que fala do antecipado não grava", () => {
    expect(pathAnswer(`${noCodMessage(config)} Quer saber como funciona a troca?`, ["sim"], false)).toBeNull();
    expect(pathAnswer(`${noCodMessage(config)} Qual seu tamanho de calça?`, ["sim"], false)).toBeNull();
  });
  it("o 'sim' à mensagem do antecipado, com ou sem pergunta sobre ele, grava", () => {
    expect(pathAnswer(noCodMessage(config), ["sim"], false)).toBe("prepay");
    expect(pathAnswer(`${noCodMessage(config)} Quer seguir assim?`, ["sim"], false)).toBe("prepay");
    expect(pathAnswer(`${noCodMessage(config)} Pode ser no antecipado?`, ["pode ser"], false)).toBe("prepay");
  });
  it("antecipado guardado numa região sem entrega não vale quando um CEP novo tem entrega", () => {
    expect(storedChoiceHolds("prepay", true, true)).toBe(false);
    // Negações: a escolha feita onde a entrega existia, a da entrega, ou sem consulta nova, valem.
    expect(storedChoiceHolds("prepay", false, true)).toBe(true);
    expect(storedChoiceHolds("prepay", true, null)).toBe(true);
    expect(storedChoiceHolds("prepay", true, false)).toBe(true);
    expect(storedChoiceHolds("cod", true, true)).toBe(true);
    expect(storedChoiceHolds(null, true, true)).toBe(true);
  });
});

describe("re-revisão de 35d70c0 — 4: 'Consegue?' depois da frase do CPF é pedido", () => {
  it.each(["Agora só falta o CPF, pra nota fiscal. Consegue?", "Falta o CPF, pra nota fiscal. Pode ser?", "Só preciso do CPF pra nota. Tudo bem?"])("%s + 'não' conta 1", (ask) => {
    expect(refusedAsks([out(ask), inn("não")], "document")).toBe(1);
  });
  it("negação: 'Consegue?' depois de frase sem o CPF não é pedido do CPF", () => {
    expect(refusedAsks([out("O frete é calculado no checkout. Consegue?"), inn("não")], "document")).toBe(0);
  });
});

describe("re-revisão de 35d70c0 — 5: o link enviado é lido pelos hosts do checkout", () => {
  it("cada host do checkout uma vez, e a leitura procura o host, não qualquer URL (fonte)", () => {
    expect(checkoutHosts(["https://entrega.logzz.com.br/pay/a", "https://entrega.logzz.com.br/pay/kit2", "https://app.coinzz.com.br/checkout/b", "x"])).toEqual([
      "entrega.logzz.com.br",
      "app.coinzz.com.br",
    ]);
    expect(source).toContain("for (const host of checkoutHosts(checkoutBases)) {");
    expect(source).not.toContain('encodeURIComponent("*http*")');
  });
});
