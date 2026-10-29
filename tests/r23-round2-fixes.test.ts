import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryFor, renderFollowup, type RenderContext } from "@/agent/followups.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { extractName, refusedDatum, sentInvalidCpf } from "@/agent/identity.js";
import { asksForLink, choosesPath } from "@/agent/interpret.js";
import { paidDeadlineLine, priceBeforeCepMessage, systemPrompt } from "@/agent/prompt.js";
import { noFitReply, saidNoFit } from "@/agent/retry.js";
import { extractDressSize, sizeBeyondTable, TABLE_TOP_DRESS, TABLE_TOP_WAIST } from "@/agent/sizing.js";
import { config, ctx } from "./fixtures.js";

/**
 * Real test round 2 (2026-10-14, …3720 and …1632) and the pre-round findings of …7967 (2026-10-13): the eight fixes the
 * operator approved. Every case is a sentence from those conversations, with its negation.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, over: Parameters<typeof ctx>[0] = {}) =>
  runGates(text, ctx({ layer: "auto", ...over })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);
const render = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-abc", config, now: new Date("2026-09-10T10:00:00"), ...over });

describe("1. calça acima da tabela (…1632: \"Tamanho 65\")", () => {
  it("lê a calça fora da tabela com a deixa de tamanho", () => {
    expect(sizeBeyondTable("Tamanho 65")).toBe(65);
    expect(sizeBeyondTable("uso 60 de calça")).toBe(60);
    expect(sizeBeyondTable("65", true)).toBe(65);
  });
  it.each([
    "Estou pesando 200kg", "peso 70", "tenho 62 anos", "calço 60", "uso 52", "nao uso 60, uso 44", "65",
    // R23 review: the house number, the birth year, the "entre" inside "entrega", and a waist in cm are not pants.
    "Rua das Flores, número 65", "Av Brasil numero 72 apto 3", "sou de 62", "sou nascida em 59", "a entrega fica 65?", "uso 60 de cintura",
  ])("não lê: %s", (t) => {
    expect(sizeBeyondTable(t)).toBeNull();
  });
  it("a resposta é a verdade, gentil, com a porta aberta, e passa a cadeia", () => {
    const text = noFitReply(65, TABLE_TOP_DRESS, TABLE_TOP_WAIST);
    expect(text).toContain("até o 52");
    expect(text).toContain("até 100 cm");
    expect(text).not.toContain("?");
    expect(blocked(text)).toEqual([]);
  });
  it("para outra pessoa, a frase não diz \"te vestir\"", () => {
    const text = noFitReply(60, TABLE_TOP_DRESS, TABLE_TOP_WAIST, true);
    expect(text).not.toContain("te vestir");
    expect(blocked(text)).toEqual([]);
    expect(turn).toContain("interpretation.size?.for_other_person === true");
  });
  it("a régua não volta a perguntar o tamanho depois do \"não serve\" enquanto ela não tem tamanho da tabela", () => {
    expect(saidNoFit(noFitReply(65, TABLE_TOP_DRESS, TABLE_TOP_WAIST))).toBe(true);
    expect(saidNoFit(noFitReply(60, TABLE_TOP_DRESS, TABLE_TOP_WAIST, true))).toBe(true);
    expect(saidNoFit("Com 40 de calça o seu é o M")).toBe(false);
    expect(turn).toContain("if (at && !at.leads?.size && ((at.messages ?? []).some((m: { direction: string; body: string | null }) => m.direction === \"outbound\" && saidNoFit(m.body ?? \"\")) ||");
    expect(turn).toContain("select=*,leads(size,score_band,stock_out:address->region->>sizeOutOfStock,stock_zip:address->region->>zip,dates_cep:address->codDates->>cep,dates_kind:address->codDates->result->>kind,orders(status))");
  });
  it("o turno manda a frase e cancela toda a régua", () => {
    const at = turn.indexOf("const beyond = ");
    const block = turn.slice(at, turn.indexOf("// She turns the sale down (grafo §69)", at));
    expect(block).toContain("noFitReply(beyond, TABLE_TOP_DRESS, TABLE_TOP_WAIST, ");
    expect(block).toContain('await cancelScheduled(conversation.id, "all");');
  });
});

describe("2. régua com a região desconhecida (…1632 nunca mandou CEP)", () => {
  it("o silence_2 não promete pagar ao entregador sem CEP; com a região conhecida, promete", () => {
    for (const id of ["a", "b", "c", "d"]) {
      const unknown = renderFollowup("silence_2", render({ leadId: id, regionKnown: false }))!;
      expect(unknown).not.toMatch(/entregador|na entrega|quando ele chegar na sua m/);
      expect(blocked(unknown, { layer: "agent" })).toEqual([]);
    }
    expect(renderFollowup("silence_2", render({ leadId: "a" }))).toMatch(/entregador|chegar na sua m/);
  });
  it("o silence_1 depois do preço pede o CEP em vez de prometer", () => {
    const text = renderFollowup("silence_1", render({ stopPoint: "after_price", regionKnown: false }))!;
    expect(text).toContain("CEP");
    expect(text).not.toMatch(/não paga nada agora|entregador/);
  });
  it("fora da janela, o template do silence_2 e do silence_3 não sai para região desconhecida", () => {
    const tpl = { ...config, channel: { templates: { silence_2: { name: "t", language: "pt_BR", variables: [] } } } } as never;
    const old = new Date("2026-09-01T10:00:00");
    expect(deliveryFor("silence_2", render({ config: tpl, marketingOptIn: true, regionKnown: false }), old)).toEqual({ via: "blocked", reason: "no_template" });
  });
  it("a varredura diz se a região é conhecida — a escolha sozinha não é região", () => {
    expect(turn).toContain("regionKnown: Boolean(order) || typeof lead.address?.codAvailable === \"boolean\",");
    expect(turn).not.toContain("regionKnown: Boolean(order) || typeof lead.address?.codAvailable === \"boolean\" ||");
  });
  it("o cupom do silence_3 não promete \"pagando na entrega\" a quem tem região desconhecida", () => {
    const c = { ...config, coupon: { ...config.coupon, active: true, code: "SUPER10", percent: 10 } } as never;
    expect(renderFollowup("silence_3", render({ config: c, regionKnown: false }))).not.toContain("na entrega");
    expect(renderFollowup("silence_3", render({ config: c }))).toContain("pagando na entrega");
  });
});

describe("3. prompt: dor contada vira tamanho, IA confirmada direto, tabela até o XGG, \"tudo bem?\" respondido", () => {
  const prompt = systemPrompt(config, gateBriefing(config), null);
  it("as quatro instruções estão no prompt", () => {
    expect(prompt).toContain("a pergunta dessa mensagem já é a do tamanho");
    expect(prompt).toContain('confirme direto ("Sou, sim")');
    expect(prompt).toContain("A tabela vai até o");
    expect(prompt).not.toContain("QUEM CHAMA UMA PESSOA DO TIME É O SISTEMA");
  });
  it("a abertura responde o \"tudo bem?\" dela", () => {
    expect(turn).toBeDefined();
    expect(readFileSync("src/agent/prompt.ts", "utf8")).toContain('responda em duas palavras ("Tudo ótimo!") antes');
  });
});

describe("4. kit oferecido não volta (…3720: quatro vezes \"1 ou 2 peças?\")", () => {
  it("depois da oferta sem resposta, a instrução manda seguir com uma peça e não perguntar de novo", () => {
    expect(turn).toContain("kitOffered && units === 1 && quantity === null && !linkNow && !parts.some((p: string) => /\\b(?:pe[cç]as?|kit)\\b/i.test(p))");
    expect(turn).toContain("Não pergunte de novo sobre o kit nem sobre quantas peças.");
  });
  it("a oferta pergunta por todas as quantidades oferecidas", () => {
    expect(turn).toContain('A pergunta cita todas as quantidades que você ofereceu ("1, 2 ou 3 peças?").');
  });
});

describe("5. frases fixas: \"O colete sai de\", CEP que \"parece\" não existir", () => {
  it("o preço antes do CEP nomeia o colete e passa a cadeia", () => {
    const text = priceBeforeCepMessage({ ...config, prices: { ...config.prices, prepayDiscountPercent: 10 } } as never);
    expect(text.startsWith("O colete sai de")).toBe(true);
    expect(text).not.toMatch(/^Ele /);
  });
  it("a instrução do CEP inexistente é de dúvida, não de certeza", () => {
    expect(turn).toContain("porque parece que esse CEP não existe (pode ter sido um número trocado)");
  });
});

describe("6. peso não é tamanho (…7967: \"tamanho, peso 52 e uso 36 de calca\" virou XGG)", () => {
  it("o peso perto de \"tamanho\" não é a calça; a calça dita depois é", () => {
    expect(extractDressSize("Queria saber sobre o produto e tamanho, peso 52 e uso 36 de calca")).toBe(36);
    expect(extractDressSize("peso 52")).toBeNull();
    // Negação: sem o peso, o tamanho continua lido.
    expect(extractDressSize("tamanho 52")).toBe(52);
    expect(extractDressSize("uso 44, peso 80kg")).toBe(44);
  });
});

describe("7. pedir o link de novo (…7967: \"N recebi link\", \"Nao tem LINK\", \"Consegue gerar um novo link?\")", () => {
  it.each(["N recebi link", "Nao tem LINK", "Nao tem link moça", "Consegue gerar um novo link?", "Por favor consegue me gerar o pagamento? Vou levar so 1"])("pede: %s", (t) => {
    expect(asksForLink(t)).toBe(true);
  });
  it.each(["não precisa gerar outro link", "já recebi o link, obrigada", "gera o link amanhã", "Qual?", "nao tem link de pix?"])("não pede: %s", (t) => {
    expect(asksForLink(t)).toBe(false);
  });
});

describe("8. \"paguei\" com \"chega quando?\" (…7967)", () => {
  it("a linha de prazo é a do antecipado e passa a cadeia no caminho antecipado", () => {
    const c = { ...config, delivery: { ...config.delivery, prepayAvgDays: 5, prepayVariesByRegion: true } } as never;
    const line = paidDeadlineLine(c);
    expect(line).toBe("Depois que o pagamento confirma, o prazo varia por região, em média 5 dias úteis.");
    expect(runGates(line, ctx({ layer: "auto", paymentPath: "prepay", config: c })).traces.filter((t) => t.verdict === "block")).toEqual([]);
    // Negação: sem a média no config, nada é dito.
    expect(paidDeadlineLine({ ...config, delivery: { ...config.delivery, prepayAvgDays: undefined } } as never)).toBe("");
  });
  it("o turno junta o prazo à linha do pagamento, também ao pagamento já confirmado", () => {
    expect(turn).toContain('const deadline = parts.some(asksDeadline) ? paidDeadlineLine(CONFIG) : "";');
  });
});

describe("personas 2026-10-14 (Beatriz, Tati): o \"vou pensar\" antes do CEP não promete o entregador", () => {
  const think = { prices: { prepayBrl: 116.91, prepayDiscountPercent: 10 }, delivery: { warrantyDays: 7 } };
  it("com a região desconhecida diz \"dependendo da sua região\"; conhecida, como antes", async () => {
    const { thinkReply } = await import("@/agent/retry.js");
    const unknown = thinkReply(think, "cod", false, 1, false);
    expect(unknown).toContain("Dependendo da sua região");
    expect(unknown).not.toContain("Pagando na entrega você não paga nada agora");
    expect(thinkReply(think, "cod", false, 1, true)).toContain("Pagando na entrega você não paga nada agora");
    expect(blocked(unknown, { layer: "agent", postponing: true })).toEqual([]);
  });
  it("o turno passa a região conhecida", () => {
    expect(turn).toContain("thinkReply(CONFIG, linkPath, thinkLink !== null, units, knownRegion !== null)");
  });
});

describe("persona venda-decidida (14/10): pediu o link nove vezes, nunca recebeu", () => {
  const ask = { direction: "outbound", body: "Para a emissão da nota fiscal, me passa seu CPF por favor?" };
  const refuses = (t: string) => refusedDatum([ask, { direction: "inbound", body: t }], "document");
  it.each(["te passo lá no link, só me manda o link", "Silva. Manda o link que eu completo lá", "eu preencho o resto lá"])("passar lá no checkout é a recusa do CPF: %s", (t) => {
    expect(refuses(t)).toBeGreaterThanOrEqual(1);
  });
  it.each(["vou passar o cpf depois lá no link", "e se eu passar o cpf lá?", "529.982.247-25", "meu cpf é 529.982.247-25, completo o endereço lá", "não sei o cpf"])("não é recusa: %s", (t) => {
    expect(refuses(t)).toBe(0);
  });
  it("pedir o link duas vezes nas últimas cinco mensagens, sem link no chat, solta o que falta de nome, CPF e e-mail", () => {
    expect(turn).toContain(".slice(-5).filter((m: { body: string }) => asksForLink(spoken(m.body ?? \"\")) && ");
    expect(turn).toContain("nameKnown: Boolean(identityDraft.name) || nameRefused || pressed || linkAsked || linkWentBefore,");
    // R28: CPF and e-mail are never waited for — only the name is, and `pressed` still releases it.
    expect(turn).toContain("cpfDone: true,");
    expect(turn).toContain("emailDone: true,");
  });
});

describe("personas Lu e Vera (14/10): pedido que o sistema não lê é respondido, não carimbado", () => {
  it("o turno não manda mais a frase fixa: o modelo recebe a diretiva e responde também a troca, a ausência em casa e a devolução", () => {
    expect(turn).toContain("notifyOrder = (said?.length ?? 0) === 0;");
    expect(turn).toContain("Ela fala de um pedido sobre o qual você não tem informação confiável aqui");
    expect(turn).toContain("depois responda o que mais ela");
    // Negação: o pedido de pessoa continua com a frase honesta.
    expect(turn).toContain('guide("Ela pediu pra falar com uma pessoa.", personAskExample(CONFIG.support ?? {}), "a cliente pediu para falar com uma pessoa", true);');
  });
});

describe("persona Vera (14/10): CPF que não fecha os dígitos não é agradecido", () => {
  it("lê o número de CPF inválido; o válido e o texto sem número não", () => {
    expect(sentInvalidCpf("111.111.111-11")).toBe(true);
    expect(sentInvalidCpf("12345678900")).toBe(true);
    expect(sentInvalidCpf("529.982.247-25")).toBe(false);
    expect(sentInvalidCpf("meu cep é 50030-230")).toBe(false);
    expect(sentInvalidCpf("opa, mandei errado, o certo é 529.982.247-25")).toBe(false);
  });
  it("o turno pede para conferir, sem agradecer nem prometer o link", () => {
    expect(turn).toContain('missing === "document" && parts.some(sentInvalidCpf)');
    expect(turn).toContain("O CPF que ela mandou não confere");
    expect(turn).toContain("não diga que está tudo certo");
  });
});

describe("revisão Opus do loop de personas (14/10)", () => {
  const askCpf = { direction: "outbound", body: "Para a emissão da nota fiscal, me passa seu CPF por favor?" };
  const cpfRefusal = (t: string) => refusedDatum([askCpf, { direction: "inbound", body: t }], "document");
  it.each([
    "peraí que vou passar lá no quarto pegar meu documento",
    "meu marido que sabe, vou passar la no trabalho dele",
    "coloco ali na carteira e ja te mando",
    "o nome completo ta la em cima",
  ])("passar \"lá\" fora do checkout não é recusa do CPF: %s", (t) => {
    expect(cpfRefusal(t)).toBe(0);
  });
  it.each(["te passo lá no link, só me manda o link", "eu preencho o resto lá", "Manda o link que eu completo lá"])("continua sendo recusa: %s", (t) => {
    expect(cpfRefusal(t)).toBeGreaterThanOrEqual(1);
  });

  it("telefone de 11 dígitos não é CPF inválido; o número com pontuação de CPF que não fecha é", () => {
    expect(sentInvalidCpf("meu whats é 11987654321")).toBe(false);
    expect(sentInvalidCpf("meu cpf 123.456.789-00")).toBe(true);
    expect(sentInvalidCpf("111.111.111-11")).toBe(true);
  });

  it("o \"pode mandar\" a uma oferta não solta nome, CPF e e-mail: o pedido do link tem de nomear link, checkout ou pagamento", () => {
    expect(turn).toContain("/\\b(?:link|checkout|pagamento)\\b/i.test(spoken(m.body ?? \"\"))");
    expect(asksForLink("pode mandar")).toBe(true); // a leitura geral não muda…
    // …mas só entra em `pressed` com a palavra do link, e "manda aí" não a tem.
    expect(/\b(?:link|checkout|pagamento)\b/i.test("manda aí")).toBe(false);
  });

  it("pedido que o sistema não lê: o operador recebe o e-mail (status handoff com notify), uma vez por conversa", () => {
    expect(turn).toContain("...(notifyOrder || extraNotify ? { reason: [notifyOrder ? ORDER_UNREADABLE_REASON : null, extraNotify, fallbackReason]");
  });
  it("a diretiva do pedido ilegível não manda recusar na porta nem devolver", () => {
    const at = turn.indexOf("Ela fala de um pedido sobre o qual você não tem informação confiável aqui");
    const directive = turn.slice(at, at + 1300);
    expect(directive).toContain("não oriente recusar na porta nem devolver por conta própria");
    expect(directive).not.toContain("é recusar na porta;");
  });
});

describe("cenários de venda (14/10): link de mentira e deferimento em pergunta", () => {
  it("o marcador no lugar do link é vetado; o link real e a palavra link em texto não", () => {
    const veto = (t: string) => runGates(t, ctx({ layer: "agent" })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    expect(veto("Aqui pra finalizar 1 peça no M pagando na entrega: [link do checkout da entrega]")).toContain("placeholder_link");
    expect(veto("Segue: [link]")).toContain("placeholder_link");
    expect(veto("Lá no link você escolhe o M e o dia da entrega.")).not.toContain("placeholder_link");
    expect(veto("O colete [o modelo preto] é o nosso.")).not.toContain("placeholder_link");
  });
  it("\"o resto eu preencho no link, pode ser?\" é a recusa do CPF; \"e se eu passar o cpf lá?\" não", () => {
    const ask = { direction: "outbound", body: "Para a emissão da nota fiscal, me passa seu CPF por favor?" };
    expect(refusedDatum([ask, { direction: "inbound", body: "Patrícia Souza, o resto eu preencho no link pode ser?" }], "document")).toBeGreaterThanOrEqual(1);
    expect(refusedDatum([ask, { direction: "inbound", body: "cpf prefiro passar no link, pode ser?" }], "document")).toBeGreaterThanOrEqual(1);
    expect(refusedDatum([ask, { direction: "inbound", body: "e se eu passar o cpf lá?" }], "document")).toBe(0);
  });
});

describe("persona venda-sem-dinheiro (14/10): a pergunta ao lado do \"vou pensar\" é respondida", () => {
  it("o \"vou pensar\" só manda a frase fixa quando ela não perguntou nada além", () => {
    const at = turn.indexOf("A real question beside it is answered by the model");
    const block = turn.slice(at, at + 700);
    expect(block).toContain("interpretation.wants_to_think &&");
    expect(block).toContain("!clauses.some((q: string) => asksSomething(q) && !buyerAsk(q))");
  });
});

describe("persona venda-curiosa (14/10): escolha com ponto final e nome no começo de frase maior", () => {
  it("\"prefiro na entrega. quanto fica no total?\" é escolha; com outro caminho, \"mas\" ou \"ou\" depois, não", () => {
    expect(choosesPath("prefiro na entrega. quanto fica no total?")).toBe(true);
    expect(choosesPath("quero no pix, qual a chave?")).toBe(true);
    expect(choosesPath("pode ser na entrega. mas no pix sai mais barato?")).toBe(false);
    expect(choosesPath("prefiro na entrega, mas é seguro?")).toBe(false);
    expect(choosesPath("prefiro na entrega. ou no pix é melhor?")).toBe(false);
  });
  it("o nome que abre a resposta ao pedido do nome é lido; o que não é nome continua fora", () => {
    expect(extractName("Patrícia Lima, o resto te passo no link", true)).toBe("Patrícia Lima");
    expect(extractName("pode ser Jessica Almeida", true)).toBe("Jessica Almeida");
    for (const t of ["Rua das Flores, 10", "prefiro não passar, pode ser sem?", "vou pensar, depois te passo", "boa tarde, Maria Silva", "Sim, pode mandar", "Centro, Recife"]) {
      expect(extractName(t, true), t).toBeNull();
    }
    // Sem o pedido do nome, nada muda.
    expect(extractName("Patrícia Lima, o resto te passo no link")).toBeNull();
  });
});

describe("persona venda-curiosa (14/10): \"o resto te passo no link\" na resposta do nome", () => {
  const askName = { direction: "outbound", body: "Pra deixar o pedido no seu nome, me passa seu nome completo por favor?" };
  it("solta o CPF e o e-mail ainda não pedidos; o nome dado não conta como recusa", () => {
    const m = [askName, { direction: "inbound", body: "Patrícia Lima, o resto te passo no link" }];
    expect(refusedDatum(m, "document")).toBe(1);
    expect(refusedDatum(m, "email")).toBe(1);
    expect(refusedDatum(m, "name")).toBe(0);
  });
  it("\"o resto\" sem o checkout não solta nada", () => {
    expect(refusedDatum([askName, { direction: "inbound", body: "o resto do endereço eu completo depois" }], "document")).toBe(0);
  });
});

describe("segunda revisão Opus do loop de personas (14/10)", () => {
  it.each([
    "Antes disso, qual o prazo de entrega?",
    "Primeiro me diz, quanto tempo demora?",
    "Pera ai, vou pegar o documento",
    "Nossa senhora, que demora",
    "Vixe maria, esqueci",
  ])("o começo de uma frase que não é nome não vira nome: %s", (t) => {
    expect(extractName(t, true)).toBeNull();
  });
  it("o nome que abre uma frase sobre os dados ou o checkout continua lido", () => {
    expect(extractName("Patrícia Lima, o resto te passo no link", true)).toBe("Patrícia Lima");
    expect(extractName("Ana Souza, o cpf eu passo depois", true)).toBe("Ana Souza");
  });
  it("\"o resto\" do endereço, ou com um dado dado ali, não solta nome, CPF nem e-mail", () => {
    const askHouse = { direction: "outbound", body: "Me passa o número da casa e o complemento?" };
    for (const t of ["Rua das Flores 10, o resto do endereço eu completo lá", "o resto do endereço preencho no site"]) {
      for (const f of ["name", "document", "email"] as const) expect(refusedDatum([askHouse, { direction: "inbound", body: t }], f), `${t} ${f}`).toBe(0);
    }
    const askName = { direction: "outbound", body: "Pra deixar o pedido no seu nome, me passa seu nome completo por favor?" };
    expect(refusedDatum([askName, { direction: "inbound", body: "o resto eu passo no link, mas o cpf te mando agora" }], "document")).toBe(0);
  });
  it("dúvida depois do ponto não é escolha", () => {
    expect(choosesPath("quero na entrega. sera que compensa?")).toBe(false);
    expect(choosesPath("prefiro na entrega. é seguro?")).toBe(false);
    expect(choosesPath("prefiro na entrega. quanto fica no total?")).toBe(true);
  });
  it("pedido ilegível: diretiva sempre, e-mail uma vez, também no fallback, e o motivo do link fica ao lado", () => {
    expect(turn).toContain("orderUnreadable = true;");
    expect(turn).toContain("notifyOrder = (said?.length ?? 0) === 0;");
    expect(turn).toContain('reason=like.${encodeURIComponent(`${ORDER_UNREADABLE_REASON}*`)}');
    expect(turn).toContain('status: notifyOrder || extraNotify || (fallbackReason !== null && fallbackIsGeneric) ? "handoff"');
    expect(turn).toContain(".filter((r): r is string => r !== null).join(\" | \") || null,");
  });
});

describe("terceira revisão Opus (14/10)", () => {
  it.each(["Antes disso, me manda o link", "Pera ai, cadê o link?", "Nossa senhora, o link não abre", "Vixe maria, esqueci o cpf", "Só um minuto, o link chegou?"])(
    "interjeição antes de uma frase sobre o link não vira nome: %s",
    (t) => expect(extractName(t, true)).toBeNull(),
  );
  it("o nome escrito como nome continua lido", () => {
    expect(extractName("Patrícia Lima, o resto te passo no link", true)).toBe("Patrícia Lima");
    expect(extractName("Maria da Silva, o cpf eu passo no link", true)).toBe("Maria da Silva");
  });
  it("\"meu nome é …, o resto te passo no link\" solta CPF e e-mail", () => {
    const askName = { direction: "outbound", body: "Pra deixar o pedido no seu nome, me passa seu nome completo por favor?" };
    const m = [askName, { direction: "inbound", body: "meu nome é Patrícia Lima, o resto te passo no link" }];
    expect(refusedDatum(m, "document")).toBe(1);
    expect(refusedDatum(m, "email")).toBe(1);
  });
  it("escolha seguida de pergunta de logística continua escolha; a dúvida sobre o caminho não", () => {
    expect(choosesPath("prefiro na entrega. qual o melhor horário pra receber?")).toBe(true);
    expect(choosesPath("vou na entrega. é garantido que chega amanhã?")).toBe(true);
    expect(choosesPath("prefiro na entrega. é seguro?")).toBe(false);
    expect(choosesPath("quero na entrega. sera que compensa?")).toBe(false);
  });
  it("o turno de fallback continua gravado como fallback; o e-mail leva os dois motivos", () => {
    expect(turn).toContain('fallbackReason !== null ? "fallback" : notifyOrder || extraNotify ? "handoff" : "send",');
    expect(turn).toContain('reason: [notifyOrder ? ORDER_UNREADABLE_REASON : null, extraNotify, fallbackReason].filter(Boolean).join(" | ")');
  });
});

describe("quarta revisão Opus (14/10)", () => {
  it("\"meu nome é …, o resto no link\" e \"me chamo …\" continuam lendo o nome", () => {
    expect(extractName("meu nome é Patrícia Lima, o resto te passo no link", true)).toBe("Patrícia Lima");
    expect(extractName("Meu nome é Patrícia Lima, o cpf te passo no link", true)).toBe("Patrícia Lima");
    expect(extractName("me chamo Ana Souza, o resto no link", true)).toBe("Ana Souza");
  });
  it("a dúvida com advérbio ou \"melhor assim?\" não é escolha", () => {
    expect(choosesPath("prefiro na entrega. é mais seguro?")).toBe(false);
    expect(choosesPath("prefiro na entrega. melhor assim?")).toBe(false);
    expect(choosesPath("prefiro na entrega. qual o melhor horário pra receber?")).toBe(true);
  });
});

describe("adiamento em pergunta, sem vírgula nem \"o resto\"", () => {
  it("\"posso passar o cpf no link?\" é a recusa do CPF", () => {
    const ask = { direction: "outbound", body: "Para a emissão da nota fiscal, me passa seu CPF por favor?" };
    expect(refusedDatum([ask, { direction: "inbound", body: "posso passar o cpf no link?" }], "document")).toBe(1);
  });
});
