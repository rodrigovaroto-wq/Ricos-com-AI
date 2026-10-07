import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmsAddress } from "@/agent/address.js";
import { agreesWithoutChoosing, lastLinkBase, linkHeldBack, pathChoiceToStore, withdrawsInBurst } from "@/agent/interpret.js";
import { DEFAULT_COD_CONFIRM, noCodMessage, twoOptionsMessage } from "@/agent/prompt.js";
import { draftMayGo } from "@/agent/retry.js";
import { config } from "./fixtures.js";

/**
 * Grafo §65: five defects of the v10 code (agent_version 10), each proved by behavior. The wiring is
 * read as source, like tests/link-after-data.test.ts.
 */
const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
const cod = config.checkout!.codUrl!;
const prepay = config.checkout!.prepayUrl!;
const kit2 = "https://entrega.logzz.com.br/pay/ccm-2-unidades";
const bases = [cod, prepay, kit2];
const linkMsg = (base: string) => `Prontinho, segue o link do seu pedido 💛\n\n${base}?name=Maria&phone=5511999999999`;

describe("1. o link não sai de novo depois de três perguntas (linkHeldBack)", () => {
  const conversation = [
    linkMsg(cod),
    "Chega em 3 a 5 dias, no dia que você escolhe.",
    "Se não servir, você tem 7 dias depois de receber pra devolver.",
    "Aceita troca sim, sem custo pra você.",
  ];

  it("link → 3 perguntas → 'tá bom': o mesmo link não volta", () => {
    expect(linkHeldBack(conversation, bases, cod, "tá bom")).toBe(true);
  });

  it("negação: 'me manda o link de novo' manda", () => {
    expect(linkHeldBack(conversation, bases, cod, "me manda o link de novo")).toBe(false);
  });

  it("negação: o pedido mudou para 2 peças — o link do kit sai", () => {
    expect(linkHeldBack(conversation, bases, kit2, "quero 2 então")).toBe(false);
  });

  it("negação: mudou para o antecipado — o outro checkout sai; e voltar à entrega depois dele é pedido novo", () => {
    expect(linkHeldBack(conversation, bases, prepay, "prefiro no pix")).toBe(false);
    expect(linkHeldBack([...conversation, linkMsg(prepay)], bases, cod, "volta pra entrega")).toBe(false);
  });

  it("sem link na conversa, nada segura", () => {
    expect(linkHeldBack(conversation.slice(1), bases, cod, "tá bom")).toBe(false);
    expect(linkHeldBack(conversation, bases, undefined, "tá bom")).toBe(false);
  });

  it("lastLinkBase: o mais novo, e a base mais longa quando uma é prefixo de outra", () => {
    expect(lastLinkBase([linkMsg(cod), linkMsg(kit2), "ok"], bases)).toBe(kit2);
    expect(lastLinkBase([`${cod}-kit`], [cod, `${cod}-kit`])).toBe(`${cod}-kit`);
    expect(lastLinkBase(["sem link"], bases)).toBeNull();
    expect(lastLinkBase([linkMsg(cod)], [""])).toBeNull();
  });

  it("fiação: a conversa inteira é lida pelo host do checkout, só quando a janela não tem link, e falha aberta", () => {
    expect(source).toContain("const linkJustSent = linkHeldBack(linkHistory, CHECKOUT_BASES, pathBase, inbound.body ?? \"\");");
    expect(source).toContain("linkReady && CHECKOUT_HOSTS.length > 0 && lastLinkBase(recentOutbound, CHECKOUT_BASES) === null");
    expect(source).toContain("&direction=eq.outbound&or=(${CHECKOUT_HOSTS.map((h) => `body.like.*${h}*`).join(\",\")})&select=body&order=created_at.desc&limit=1");
    expect(source).toContain(".catch(() => null))?.map((m: { body: string | null }) => m.body ?? \"\") ?? recentOutbound");
  });
});

describe("2. 'sim' às duas opções sem escolher: confirma a entrega (agreesWithoutChoosing)", () => {
  const two = twoOptionsMessage(config).join("\n\n");
  const agrees = (msg: string, lastOutbound = two) =>
    agreesWithoutChoosing({ parts: [msg], lastOutbound, confirms: confirmsAddress(msg) });

  it.each(["sim", "pode ser", "ok", "Sim!"])("'%s' às duas opções é concordar sem escolher", (msg) => {
    expect(agrees(msg)).toBe(true);
  });

  it.each(["a primeira", "sim, no pix", "pode ser na entrega", "sim, qual a diferença?", "não sei", "sim, tem rastreio?"])(
    "negação: escolha, dúvida ou outra pergunta não é '%s' sem escolha",
    (msg) => expect(agrees(msg)).toBe(false),
  );

  it("negação: 'sim' fora das duas opções (e na região sem entrega, que não as apresenta)", () => {
    expect(agrees("sim", "Qual o número da calça que você usa?")).toBe(false);
    expect(agrees("sim", noCodMessage(config))).toBe(false);
  });

  it("o 'sim' seguinte à confirmação grava a entrega (o tratamento do padrão que já existe)", () => {
    expect(pathChoiceToStore({ interpreted: null, parts: ["pode ser"], lastOutbound: DEFAULT_COD_CONFIRM, confirms: true })).toBe("cod");
  });

  it("fiação: só com entrega na região e sem escolha guardada; a diretiva cita DEFAULT_COD_CONFIRM", () => {
    expect(source).toContain("knownRegion?.cod === true &&\n    storedChoice === null &&\n    choiceToStore === null &&\n    interpretation.payment_choice !== \"prepay\" &&\n    agreesWithoutChoosing({ parts, lastOutbound, confirms: parts.some(confirmsAddress) });");
  });

  it("negação: o antecipado lido pelo intérprete ('sim, a com desconto') não vira confirmação da entrega", () => {
    // agreesWithoutChoosing não lê "a com desconto"; a fiação acima é quem guarda o prepay do intérprete
    expect(agrees("sim, a com desconto", "Qual das duas fica melhor pra você?")).toBe(true);
    expect(source.indexOf("const choiceToStore = pathChoiceToStore(")).toBeLessThan(source.indexOf("const agreedOnly ="));
    expect(source).toContain("regionDirectiveFor(knownRegion, paymentChoice, agreedOnly),");
    expect(source).toContain("deixe no pagamento na entrega e confirme com estas palavras:");
    expect(source).toContain("` \"${DEFAULT_COD_CONFIRM}\" Não apresente as duas opções de novo.`");
    expect(source).toContain("const paymentChoice = (agreedOnly ? null : interpretation.payment_choice) ?? choiceToStore ?? storedChoice;");
  });
});

describe("3. desistência no turno em que os dados fecham não leva link (withdrawsInBurst)", () => {
  it.each([["desisti"], ["não quero mais"], ["deixa pra lá"], ["mudei de ideia, não vou levar"], ["desisti do M"], ["ok", "desisti"]])(
    "desistiu: %s",
    (...burst) => expect(withdrawsInBurst(burst)).toBe(true),
  );

  it.each([
    ["deixa pra lá o kit, só uma"],
    ["mudei de ideia, quero o G"],
    ["deixa pra lá, manda o link"],
    ["não quero mais o kit"],
    ["não desisti não"],
    ["não quero mais esperar"],
    ["desisti", "não, pensando bem quero o M"],
    ["Maria Souza"],
    // revisão do 58ba217: recusa de dado, troca de tamanho, "pode mandar", negação depois do verbo
    ["deixa pra lá o email"],
    ["deixa quieto o cpf"],
    ["deixa pra lá, pode mandar"],
    ["desisti não, pode mandar"],
    ["desisti do P, manda o M"],
    ["desisti não, só tava ocupada"],
    ["desisti nada"],
    ["não quero mais pagar frete, tem como?"],
  ])("negação: %s", (...burst) => expect(withdrawsInBurst(burst)).toBe(false));

  // revisão do e796416: "não" depois da vírgula, "não X não" enfático, "quero" solto e "pagar" amplo
  it.each([
    ["desisti, não dá"],
    ["desisti, não tenho dinheiro agora"],
    ["deixa pra lá, não precisa"],
    ["desisti, não"],
    ["desisti, nada a ver"],
    ["não quero mais não"],
    ["não vou levar não, obrigada"],
    ["nao vou querer nao"],
    ["quero desistir"],
    ["eu quero desistir da compra"],
    ["desisti, quero cancelar"],
    ["quero cancelar, desisti"],
    ["desisti, quero meu dinheiro"],
    ["não quero mais pagar nada"],
    ["desisti de pagar isso tudo"],
  ])("desistiu (revisão): %s", (...burst) => expect(withdrawsInBurst(burst)).toBe(true));

  it("fiação: o link e a oferta do kit esperam", () => {
    expect(source).toContain("const linkNow = !linkJustSent && linkReady && !withdrew;");
    // link segurado pelo histórico (além da janela) avisa o modelo que ela já o tem
    expect(source).toContain("const linkAlreadySent = linkJustSent || linkSentRecently(");
    expect(source).toContain("!kitOffered && !linkNow && !farewell && !withdrew;");
  });
});

describe("4. região sem entrega: 'ok' ao antecipado é o caminho escolhido (pathChoiceToStore noCod)", () => {
  const store = (msg: string, lastOutbound: string, interpreted: "cod" | "prepay" | null = null) =>
    pathChoiceToStore({ interpreted, parts: [msg], lastOutbound, confirms: confirmsAddress(msg), noCod: true });

  it.each(["ok", "sim", "pode ser"])("'%s' à mensagem do antecipado grava o antecipado", (msg) => {
    expect(store(msg, noCodMessage(config))).toBe("prepay");
    expect(store(msg, `${noCodMessage(config)} Pode ser no antecipado?`)).toBe("prepay");
  });

  it("negação: o 'sim' que responde outra pergunta não grava", () => {
    expect(store("sim", `${noCodMessage(config)} Qual seu tamanho de calça?`)).toBeNull();
    expect(store("sim", "Qual seu tamanho de calça?")).toBeNull();
    expect(store("ok", `${noCodMessage(config)} Ficou alguma dúvida?`)).toBeNull();
  });

  it("negação: fora da região sem entrega, ou com outra pergunta dela, não grava", () => {
    expect(pathChoiceToStore({ interpreted: null, parts: ["ok"], lastOutbound: noCodMessage(config), confirms: true })).toBeNull();
    expect(store("ok, e chega quando?", noCodMessage(config))).toBeNull();
    expect(store("não", noCodMessage(config))).toBeNull();
  });

  it("fiação: a região é conhecida antes da escolha", () => {
    expect(source).toContain("confirms: parts.some(confirmsAddress),\n    noCod: knownRegion?.cod === false,\n  });");
    expect(source.indexOf("const knownRegion: Pick<Region")).toBeLessThan(source.indexOf("const choiceToStore = pathChoiceToStore({"));
  });
});

describe("5. rascunho que não leu a rajada não sai (draftMayGo)", () => {
  const first = { isRetry: false, isRevise: false };
  const revise = { isRetry: false, isRevise: true };
  it("turno normal: leitura que falha manda (nunca cala); nada novo manda; mensagem nova segura", () => {
    expect(draftMayGo(true, false, first)).toBe(true);
    expect(draftMayGo(false, false, first)).toBe(true);
    expect(draftMayGo(false, true, first)).toBe(false);
  });
  it("revisão: leitura que falha NÃO manda; nada novo manda", () => {
    expect(draftMayGo(true, false, revise)).toBe(false);
    expect(draftMayGo(false, false, revise)).toBe(true);
  });
  it("nova tentativa da varredura: leitura que falha desiste, como antes", () => {
    expect(draftMayGo(true, false, { isRetry: true, isRevise: false })).toBe(false);
  });
  it("fiação: sem revisão possível e sem nova tentativa gravada, a resposta de espera, sem handoff_at", () => {
    const guard = source.slice(source.indexOf("const lateGuard = async"), source.indexOf("const sendFixed = async"));
    expect(guard).toContain("if (draftMayGo(latest === null, inboundId === null || retryIsMoot(inboundId, latest?.[0] ?? null, null), { isRetry, isRevise })) return null;");
    expect(guard).toContain(") ?? (await modelFailure(new Error(\"rascunho sem ler a rajada\"), \"rascunho não leu a rajada e a nova tentativa não foi agendada\", true))");
    expect(source).toContain("const modelFailure = async (error: unknown, reason = \"falha ao chamar o modelo\", reachable = error instanceof ModelConfigError) => {");
    expect(source).toContain("    if (!reachable) {\n      await db(`leads?id=eq.${lead.id}`, {");
  });
});
