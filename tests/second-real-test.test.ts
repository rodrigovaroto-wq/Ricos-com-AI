/**
 * Grafo §66 — the operator's second real test (conversation 816795ca, 2026-10-07) and the two
 * friends' conversations of the same day. Each case is a sentence from production, literal, with
 * the negations beside it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { malformedCep } from "@/agent/address.js";
import { asksForLink, choosesPath, pathChoiceToStore } from "@/agent/interpret.js";
import { extractIdentityBurst, extractName, mergeIdentity, refusesAskedDatum } from "@/agent/identity.js";
import { classifyOptOut, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";
import { oncePerDay, renderFollowup, rulerFor } from "@/agent/followups.js";
import { GREETING_ASK, greetingFor, linkMessage, onlyGreets, unansweredInbound, WELCOME_AUTO_REPLY } from "@/agent/retry.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("C2 — 'pare de me mandar …' só é descadastro quando o que para são as mensagens da loja", () => {
  it("a frase da compradora não é descadastro", () => {
    expect(classifyOptOut("pare de me mandar confirmações, apenas me mande o link do checkout")).toBe("none");
  });

  it.each([
    "para de me mandar pergunta, só manda o link",
    "pare de mandar mensagem e me manda o checkout",
  ])("não bloqueia quem pede o link na mesma mensagem: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("none");
  });

  it.each([
    "para de me mandar mensagem",
    "pare de me mandar mensagem",
    "parem de me mandar essas mensagens",
    "para de me mandar mensagem. vocês pegaram meu número onde?",
    "pare de me mandar promoção, por favor",
    "para de me encher o saco",
    "pode parar de me mandar mensagem",
    "pare de me mandar mensagem toda hora",
    "para de mandar isso",
    "pare de me mandar",
    "parem de me mandar mensagem no whatsapp!",
  ])("continua descadastro: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("explicit");
  });
});

describe("C3 — CEP com o número errado de dígitos", () => {
  it("as duas mensagens da conversa", () => {
    expect(malformedCep("e meu cep é 004710090")).toBe("004710090");
    expect(malformedCep("ja te mandei meu cep, mas é 004710090")).toBe("004710090");
  });

  it("sete dígitos, e a resposta ao pedido do CEP sem a palavra", () => {
    expect(malformedCep("cep 0471009")).toBe("0471009");
    expect(malformedCep("004710090", true)).toBe("004710090");
  });

  it.each([
    ["CEP certo", "meu cep é 04710-090", false],
    ["CEP certo sem traço", "04710090", true],
    ["telefone de 9 dígitos sem falar de CEP", "meu número é 996557745", false],
    ["CPF", "meu cpf é 55138146840", true],
    ["número de casa", "cep? moro no 123", false],
  ])("não lê como CEP errado: %s", (_, frase, asked) => {
    expect(malformedCep(frase, asked)).toBeNull();
  });

  it("o turno diz ao modelo que o CEP não foi lido, e nunca 'recebi/anotei'", () => {
    expect(turn).toContain('malformedCep(inbound.body ?? "", /\\bcep\\b/i.test(lastOutbound))');
    expect(turn).toContain("Nunca diga que recebeu ou anotou o CEP.");
    expect(turn).toContain("nunca diga que recebeu, anotou ou vai conferir o CEP.");
    expect(turn).toMatch(/coverageUnknown,\s+cepState,/);
  });
});

describe("C4 — nome, e-mail e CPF esperam o CEP", () => {
  it("com o CEP faltando, o modelo é proibido de pedir os dados e de dizer que está pronto", () => {
    expect(turn).toContain('missing === "cep"\n        ? `Falta o CEP: antes dele não peça nome, e-mail nem CPF, e nunca diga que está tudo pronto.`');
  });

  it("o CEP é pedido também quando ela já escolheu como paga, não só quando pede o link", () => {
    expect(turn).toContain(': missing === "cep" && (linkDue || paymentChoice !== null)');
  });
});

describe("C5 — pending_promise: prometer mandar o link depois, num turno sem link", () => {
  const blockedBy = (text: string, linkInTurn: boolean | undefined) =>
    runGates(text, ctx(linkInTurn === undefined ? {} : { linkInTurn })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

  it.each([
    "Já deixo tudo pronto aqui pra 1 peça no M, pagando na entrega, e te mando o link em seguida, tá bom?",
    "Estou deixando seu link prontinho aqui e já te mando em seguida pra você concluir lá, escolhendo o M e o dia que prefere receber?",
    "Te mando o checkout aqui em seguida pra você concluir lá, escolhendo o M e o dia que prefere receber, tá bom?",
    "Estou só finalizando seu checkout aqui, e já te mando nesta conversa pra você concluir lá?",
    "Tá tudo aqui comigo, então assim que seu link ficar pronto eu mando aqui mesmo, pode ser?",
    "Vou conferir esse CEP com calma pra ver a entrega e o pagamento.",
    "Recebi seu CEP também, deixa eu conferir como fica a entrega e o pagamento aí na sua região.",
    "Vou te mandar o link agora.",
  ])("veta, sem link no turno: %s", (frase) => {
    expect(blockedBy(frase, false)).toContain("pending_promise");
  });

  it.each([
    "Te mando o link?",
    "Quer que eu te mande o link do antecipado, já com seus dados?",
    "Assim que você me passar o CEP, o link sai com seus dados.",
    "O checkout confirma quando você digitar o CEP.",
    "Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região.",
  ])("não veta oferta nem pedido do que falta: %s", (frase) => {
    expect(blockedBy(frase, false)).not.toContain("pending_promise");
  });

  it("com o link no turno, ou fora do turno (varredura), fica ocioso", () => {
    const frase = "Estou deixando seu link prontinho aqui e já te mando em seguida.";
    expect(blockedBy(frase, true)).not.toContain("pending_promise");
    expect(blockedBy(frase, undefined)).not.toContain("pending_promise");
  });

  it("o turno passa se o link sai nesta resposta", () => {
    expect(turn).toContain("linkInTurn: checkoutUrl !== null,");
  });
});

describe("C6 — pedido de link com 'checkout' e a cobrança", () => {
  it.each([
    "sim, me manda o checkout logo",
    "você nao vai me mandar o link do checkout????",
    "então manda logo",
    "sim pode mandar",
    "pode mandar",
    "me manda o link",
  ])("é pedido de link: %s", (frase) => {
    expect(asksForLink(frase)).toBe(true);
  });

  it.each([
    "não me manda o checkout agora",
    "manda o checkout amanhã",
    "pode mandar não, desisti",
    "vou passar o link pro meu marido",
    "o checkout é seguro?",
    "manda logo a tabela de medidas pra eu ver",
    "você vai me mandar o link depois que eu escolher o tamanho, né",
  ])("não é pedido de link: %s", (frase) => {
    expect(asksForLink(frase)).toBe(false);
  });
});

describe("C7 — recusar um dado não é 'vou pensar'", () => {
  const askCpf = "Para a emissão da nota fiscal, me passa seu CPF por favor?";
  const askEmail = "Pra completar o cadastro do pedido, qual é seu melhor e-mail?";

  it("a frase da conversa, ao pedido do e-mail (forma antiga) e ao do CPF", () => {
    expect(refusesAskedDatum(askEmail, "nao vou passar não, valeu")).toBe(true);
    expect(refusesAskedDatum(askCpf, "não vou passar meu cpf, valeu")).toBe(true);
    expect(refusesAskedDatum(askCpf, "n passo")).toBe(true);
  });

  it.each([
    [askCpf, "vou pensar e depois te falo"],
    [askCpf, "e se eu não passar o cpf?"],
    ["Qual das duas fica melhor pra você?", "não vou passar não, valeu"],
    [askCpf, "55138146840"],
  ])("não é recusa de dado: depois de %s, %s", (ask, answer) => {
    expect(refusesAskedDatum(ask, answer)).toBe(false);
  });

  it("o turno não manda a resposta fixa do 'vou pensar' para a recusa de dado", () => {
    expect(turn).toContain('!refusesAskedDatum(lastOutbound, inbound.body ?? "")');
  });
});

describe("C8 — 'o na entrega acho' é escolha", () => {
  it.each(["o na entrega acho", "o da entrega", "a do pix", "na entrega"])("escolhe: %s", (frase) => {
    expect(choosesPath(frase)).toBe(true);
  });

  it.each(["na entrega acho que não", "o na entrega acho, mas e o prazo?", "na entrega é seguro?", "pix ou entrega, não sei"])(
    "não escolhe: %s",
    (frase) => {
      expect(choosesPath(frase)).toBe(false);
    },
  );

  it("a palavra dela contra a leitura do intérprete: não grava", () => {
    const lastOutbound = "Qual das duas fica melhor pra você?";
    expect(pathChoiceToStore({ interpreted: "cod", parts: ["o antecipado"], lastOutbound, confirms: false })).toBeNull();
    expect(pathChoiceToStore({ interpreted: "prepay", parts: ["o na entrega acho"], lastOutbound, confirms: false })).toBeNull();
  });

  it("a escolha lida pelo intérprete é gravada com a frase da conversa", () => {
    expect(
      pathChoiceToStore({
        interpreted: "cod",
        parts: ["o na entrega acho"],
        lastOutbound: "Pagando na entrega o frete é grátis… O que confirma pra esse CEP é digitando no checkout, qual das duas fica melhor pra você?",
        confirms: false,
      }),
    ).toBe("cod");
  });
});

describe("C9 — o nome completo com partícula substitui o primeiro nome", () => {
  it("depois do pedido do sobrenome, 'Leila da silva' é o nome", () => {
    expect(extractIdentityBurst(["Leila da silva"], true).name).toBe("Leila da silva");
    expect(mergeIdentity({ name: "Leila" }, extractIdentityBurst(["Leila da silva"], true)).fields.name).toBe("Leila da silva");
  });

  it.each(["Vila da Penha", "Fim de semana", "Centro da cidade", "Hora do almoço"])("sem o pedido do nome, não é nome: %s", (frase) => {
    expect(extractName(frase)).toBeNull();
  });

  it("nem com o pedido, o que começa por palavra comum", () => {
    expect(extractName("tarde da noite", true)).toBeNull();
    expect(extractName("quero o da entrega", true)).toBeNull();
  });

  it("o turno passa o pedido do nome e do sobrenome", () => {
    expect(turn).toContain("extractIdentityBurst(parts, asksForName(lastOutbound) || /\\bsobrenome\\b/i.test(lastOutbound))");
  });
});

describe("C10 — o lembrete não pede o tamanho a quem já deu", () => {
  const base = { leadId: "8064e949-ac93-476d-820f-05c6d6e834bb", config, stopPoint: "before_size" as const };
  it("com o tamanho conhecido, o lembrete não pergunta a calça", () => {
    for (const size of ["G", "M"]) {
      const text = renderFollowup("silence_1", { ...base, size }) ?? "";
      expect(text).not.toMatch(/tamanho de cal[çc]a/i);
      expect(text.length).toBeGreaterThan(20);
    }
  });
  it("sem o tamanho, continua perguntando", () => {
    const texts = ["a", "b", "c", "d"].map((id) => renderFollowup("silence_1", { ...base, leadId: id }) ?? "");
    expect(texts.every((t) => /cal[çc]a/i.test(t))).toBe(true);
  });
});

describe("R3 — 'Ainda está aí?' aos 20 min e o lembrete a 1 h, cada um no máximo 1 vez por dia", () => {
  const now = new Date("2026-10-07T10:30:00-03:00");
  it("os tempos", () => {
    const ruler = rulerFor(now, "before_size", undefined, false, undefined, true);
    expect(ruler.find((f) => f.kind === "still_there")?.runAt).toEqual(new Date(now.getTime() + 20 * 60_000));
    expect(ruler.find((f) => f.kind === "silence_1")?.runAt).toEqual(new Date(now.getTime() + 60 * 60_000));
  });
  it("enviado há menos de 24 h, não arma de novo", () => {
    const ruler = rulerFor(now, "before_size", undefined, false, undefined, true);
    const sent = { still_there: new Date(now.getTime() - 2 * 3600_000), silence_1: new Date(now.getTime() - 5 * 3600_000) };
    expect(oncePerDay(ruler, sent).map((f) => f.kind)).not.toContain("still_there");
    expect(oncePerDay(ruler, sent).map((f) => f.kind)).not.toContain("silence_1");
    expect(oncePerDay(ruler, sent).map((f) => f.kind)).toContain("silence_2");
  });
  it("enviado há mais de 24 h, ou nunca, arma", () => {
    const ruler = rulerFor(now, "before_size", undefined, false, undefined, true);
    const old = { still_there: new Date(now.getTime() - 25 * 3600_000) };
    expect(oncePerDay(ruler, old).map((f) => f.kind)).toEqual(ruler.map((f) => f.kind));
    expect(oncePerDay(ruler, {}).map((f) => f.kind)).toEqual(ruler.map((f) => f.kind));
  });
  it("o turno lê o envio de cada toque antes de armar", () => {
    expect(turn).toContain("select=*,leads(orders(status)),followups(kind,sent_at)");
  });
});

describe("revisão dos consertos do §66 — os furos que o Opus achou", () => {
  it.each([
    "Pare de me mandar mensagens, não quero comprar nada",
    "parem de me mandar mensagem, já falei que não vou comprar",
    "Pare de me mandar mensagem!!! Não vou comprar",
    "pare de me mandar mensagem, já cancelei o pedido",
    "para de me mandar mensagem por favor obrigada",
    "pare de me mandar mensagens que eu não quero",
    "para de me mandar mensagem pq eu nao quero mais",
    "pare de me enviar mensagens eu não quero",
    "Para de me mandar essas mensagens chatas",
    "pare de me mandar mensagem moça",
    "pare de me mandar mensagens obrigada",
    "pare de me mandar mensagem sobre esse colete",
  ])("C2: opt-out legítimo continua bloqueando: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("explicit");
  });

  it.each(["fim de semana te passo", "hora do almoço te mando", "Fim de semana", "depois te falo"])(
    "C9: depois do pedido do nome, não é nome: %s",
    (frase) => {
      expect(extractName(frase, true)).toBeNull();
      expect(mergeIdentity({ name: "Leila" }, extractIdentityBurst([frase], true)).fields.name).toBe("Leila");
    },
  );

  it.each([
    "não vou passar agora não, vou pensar melhor e te falo",
    "nao passo cpf, deixa que eu penso e volto depois",
    "não dou meu cpf, desisti",
  ])("C7: recusa com adiamento continua 'vou pensar': %s", (frase) => {
    expect(refusesAskedDatum("Para a emissão da nota fiscal, me passa seu CPF por favor?", frase)).toBe(false);
  });

  it.each([
    "Deixa eu conferir: seu tamanho é M e o CEP 01310-100, certo?",
    "Já te passo as opções: na entrega ou antecipado com desconto.",
    "Já te envio a tabela de medidas aqui: P 36-38.",
    "Não vou conferir nada, pode ficar tranquila.",
  ])("C5: não é promessa pendente: %s", (frase) => {
    const gates = runGates(frase, ctx({ linkInTurn: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
    expect(gates).not.toContain("pending_promise");
  });

  it.each(["vai me mandar o link amanhã?", "se eu escolher pix vai me mandar o link?"])("C6: condição não é pedido de link: %s", (frase) => {
    expect(asksForLink(frase)).toBe(false);
  });
});

describe("T1 — a recepção sem o 'Oii, tudo bem?'", () => {
  it("a recepção nova e a antiga fecham a rajada do mesmo jeito: nenhuma das duas é resposta", () => {
    const novo = [{ direction: "inbound", body: "quanto custa?" }, { direction: "outbound", body: WELCOME_AUTO_REPLY }, { direction: "inbound", body: "oi" }];
    const antigo = [{ direction: "inbound", body: "quanto custa?" }, { direction: "outbound", body: `Oii, tudo bem?\n\n${WELCOME_AUTO_REPLY}` }, { direction: "inbound", body: "oi" }];
    expect(WELCOME_AUTO_REPLY.startsWith("Oii")).toBe(false);
    expect(unansweredInbound(novo).map((m) => m.body)).toEqual(["oi", "quanto custa?"]);
    expect(unansweredInbound(antigo).map((m) => m.body)).toEqual(["oi", "quanto custa?"]);
  });
});

describe("T2 — a primeira resposta da Malu abre com a saudação da hora", () => {
  const at = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00-03:00`);
  it.each([
    ["06:00", "bom dia"],
    ["11:59", "bom dia"],
    ["12:00", "boa tarde"],
    ["18:59", "boa tarde"],
    ["19:00", "boa noite"],
    ["23:59", "boa noite"],
    ["03:00", "bom dia"],
  ])("às %s é %s", (hora, parte) => {
    expect(greetingFor(at(hora), "Malu")).toBe(`Oii, ${parte}, tudo bem?! Sou a Malu e darei início ao seu atendimento.`);
  });

  it("a saudação e o 'Em que posso te ajudar?' passam a cadeia, perguntada ou não a identidade", () => {
    for (const askedIdentity of [false, true]) {
      const text = `${greetingFor(at("10:00"), "Malu")}\n\n${GREETING_ASK}`;
      expect(runGates(text, ctx({ askedIdentity, now: at("10:00") })).traces.filter((t) => t.verdict === "block")).toEqual([]);
    }
  });

  it.each([[["oi"]], [["Boa tarde, tudo bem?"]], [["oii", "tudo bem?"]], [["olá 😊"]], [["Oi Malu tudo bem?"]]])(
    "só saudação: %j",
    (parts) => expect(onlyGreets(parts)).toBe(true),
  );
  it.each([[["oi", "quanto custa?"]], [["Gostaria de saber mais sobre a cinta"]], [["bom dia, quero comprar"]], [["tudo sim"]], [[]]])(
    "tem pergunta ou pedido: %j",
    (parts) => expect(onlyGreets(parts)).toBe(false),
  );

  it("o turno: saudação fixa na primeira resposta; com pergunta, a resposta dela vem depois", () => {
    expect(turn).toContain("recentOutbound.some((m: string) => !isReceipt(m)) ? null : greetingFor(new Date(), CONFIG.agentName)");
    expect(turn).toContain("sendFixed(`${greeting}\\n\\n${GREETING_ASK}`");
    expect(turn).toContain("const replyText = greeting === null ? body : `${greeting}\\n\\n${body}`;");
    expect(turn).toContain("não cumprimente, não diga");
  });
});

describe("C2 — segunda revisão: sem o pedido do link, 'pare de me mandar' bloqueia", () => {
  it.each([
    "pare de me mandar confirmações",
    "parem de me enviar o resumo, quero finalizar",
    "pare de me mandar o mesmo link toda hora, não vou comprar",
    "pare de me mandar a mesma mensagem, já disse que não quero",
    "para de me mandar pergunta, não tenho interesse",
    "pare de me mandar mensagem. e nem me manda link nenhum",
    "pare de me mandar mensagem, só me manda o link se eu pedir",
    "pare de me mandar mensagem, me manda o link quando eu pedir",
  ])("bloqueia: %s", (frase) => {
    expect(classifyOptOut(frase)).toBe("explicit");
  });

  it.each([
    "Já te mando o link assim que você me passar o CPF.",
    "Te mando o link logo que você me passar o CPF",
    "Já te mando o link, só me passa o CPF?",
  ])("C5: a condição verdadeira não é promessa pendente: %s", (frase) => {
    const gates = runGates(frase, ctx({ linkInTurn: false })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
    expect(gates).not.toContain("pending_promise");
  });
});

describe("T3 — o link sai do jeito do operador, sem pedir permissão", () => {
  const url = "https://entrega.logzz.com.br/pay/ccm-1-unidade?name=Leila%20da%20Silva&phone=5511900000000";
  it("na entrega: a frase, o link sozinho e o que falta, uma vez", () => {
    expect(linkMessage(url, "cod", "M", "Encorpa")).toBe(
      "Perfeito! É só clicar no link do checkout a seguir e concluir sua compra, obrigada por escolher a Encorpa." +
        `\n\n${url}\n\n` +
        "Lá você completa o endereço, escolhe o M e o dia da entrega. Se precisar de alguma ajuda, estarei aqui.",
    );
  });
  it("no antecipado e no kit", () => {
    expect(linkMessage(url, "prepay", "G", "Encorpa")).toContain(
      "Lá você completa o endereço, escolhe o G, confere o frete e paga no pix ou no cartão.",
    );
    expect(linkMessage(url, "cod", null, "Encorpa", 2)).toContain("escolhe o tamanho de cada peça e o dia da entrega");
  });
  it("passa a cadeia nos dois caminhos", () => {
    for (const path of ["cod", "prepay"] as const) {
      const blocked = runGates(linkMessage(url, path, "M", "Encorpa"), ctx({ paymentPath: path })).traces.filter((t) => t.verdict === "block");
      expect({ path, blocked }).toEqual({ path, blocked: [] });
    }
  });
  it("o turno manda a mensagem fixa quando o link sai e ela não perguntou outra coisa", () => {
    expect(turn).toContain("if (checkoutUrl !== null && !farewell && !parts.some((p: string) => asksSomething(p) && !buyerAsk(p))) {");
    expect(turn).toContain("linkMessage(checkoutUrl, linkPath,");
  });
});

describe("T6 — noted_claim: sem 'anotei'", () => {
  const blocks = (t: string) => runGates(t, ctx()).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
  it.each([
    "Obrigada, Leila da Silva, já deixei anotado aqui.",
    "Obrigada, anotei o CPF pra nota fiscal, como a legislação pede.",
    "Anotei, 004710090, obrigada por mandar de novo.",
    "Anotei seu CEP, obrigada, e o seu tamanho segue o G.",
    "Perfeito, Leila, tá tudo anotado pra 1 peça no M.",
  ])("veta: %s", (frase) => expect(blocks(frase)).toContain("noted_claim"));
  it.each(["Me passa seu CEP?", "Com 40 de calça o seu é o M.", "Para a emissão da nota fiscal, me passa seu CPF por favor?"])(
    "não veta: %s",
    (frase) => expect(blocks(frase)).not.toContain("noted_claim"),
  );
});

describe("revisão 3 do §66", () => {
  const promise = (t: string) => runGates(t, ctx({ linkInTurn: false })).traces.some((x) => x.gate === "pending_promise" && x.verdict === "block");
  it.each([
    "Estou finalizando seu checkout e já te mando em seguida. Só me passa seu nome completo?",
    "Vou conferir esse CEP com calma. Assim que você me passar o CPF, te mando o link.",
  ])("a condição de uma frase não libera a promessa da outra: %s", (frase) => expect(promise(frase)).toBe(true));

  it.each(["O colete tem marca registrada.", "Seu pedido fica registrado no checkout."])("'registrado' não é 'anotei': %s", (frase) => {
    expect(runGates(frase, ctx()).traces.some((x) => x.gate === "noted_claim" && x.verdict === "block")).toBe(false);
  });

  it("emoji com tom de pele ainda é só saudação", () => expect(onlyGreets(["bom dia!! 🙏🏻"])).toBe(true));

  it("cada balão do link fixo tem até 30 palavras, então o link fica sozinho no balão dele", () => {
    for (const path of ["cod", "prepay"] as const)
      for (const pieces of [1, 2])
        for (const p of linkMessage("https://x.y/z", path, pieces > 1 ? null : "M", "Encorpa Fashion", pieces).split("\n\n"))
          expect(p.split(/\s+/).length).toBeLessThanOrEqual(30);
  });

  it("a resposta da primeira mensagem guardada para a abertura leva a saudação da hora em que sai", () => {
    expect(turn).toContain("body: greeting === null ? attempt.text : `${greetingFor(runAt, CONFIG.agentName)}\\n\\n${attempt.text}`,");
  });
});
