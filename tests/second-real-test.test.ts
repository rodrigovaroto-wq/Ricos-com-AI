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

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

describe("C2 — 'pare de me mandar …' só é descadastro quando o que para são as mensagens da loja", () => {
  it("a frase da compradora não é descadastro", () => {
    expect(classifyOptOut("pare de me mandar confirmações, apenas me mande o link do checkout")).toBe("none");
  });

  it.each([
    "pare de me mandar confirmações",
    "para de me mandar pergunta, só manda o link",
    "pare de mandar mensagem e me manda o checkout",
    "parem de me enviar o resumo, quero finalizar",
  ])("não bloqueia quem compra ou pede outra coisa: %s", (frase) => {
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
