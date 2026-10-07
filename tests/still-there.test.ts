import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STILL_THERE_MS,
  STILL_THERE_REPLY,
  decideTouch,
  deliveryFor,
  endsWithQuestion,
  inSilenceRuler,
  renderFollowup,
  rulerFor,
  type RenderContext,
} from "@/agent/followups.js";
import { runGates } from "@/agent/guardrails.js";
import { config, ctx as gateCtx } from "./fixtures.js";

/**
 * "Ainda está aí?" (operador, 2026-10-06): a última mensagem da Malu foi uma pergunta e ela não
 * respondeu em 10 minutos — uma vez por pergunta aberta, só dentro da janela de 24 h, como texto.
 */
const now = new Date("2026-10-06T15:00:00Z"); // 12:00 em São Paulo
const ctx: RenderContext = { leadId: "l1", config, now };

describe("a pergunta dela ficou no ar", () => {
  it.each(["Qual o número da calça que você usa?", "Quer que eu te mande o link? 💛", "Consegue me passar o CEP?  ", "Posso te ajudar com mais alguma coisa? 😊🙏🏽"])(
    "termina em pergunta: %s",
    (t) => expect(endsWithQuestion(t)).toBe(true),
  );
  it.each(["Te mando o link agora 💛", "O prazo é de 3 dias. Qualquer dúvida, me chama!", "Pergunta boa? Sim, tem rastreio.", "", "https://entrega.logzz.com.br/pay/x?ref=1"])(
    "não termina em pergunta: %s",
    (t) => expect(endsWithQuestion(t)).toBe(false),
  );
});

describe("o toque na régua", () => {
  it("a resposta que termina em pergunta arma o toque 10 minutos depois, antes de qualquer outro", () => {
    const ruler = rulerFor(now, "before_size", undefined, false, undefined, true);
    expect(STILL_THERE_MS).toBe(10 * 60_000);
    expect(ruler[0]).toEqual({ kind: "still_there", runAt: new Date(now.getTime() + STILL_THERE_MS) });
    // silence_1 continua na hora dela.
    expect(ruler.find((f) => f.kind === "silence_1")?.runAt).toEqual(new Date(now.getTime() + 30 * 60_000));
  });
  it("sem pergunta no fim, nenhum toque", () => {
    expect(rulerFor(now, "before_size", undefined, false).some((f) => f.kind === "still_there")).toBe(false);
  });
  it("a régua reancorada por um toque adiado não rearma o toque", () => {
    expect(rulerFor(now, "before_size", "silence_1", false, undefined, true).some((f) => f.kind === "still_there")).toBe(false);
  });
  it("é da régua de silêncio: a resposta dela e a venda o cancelam", () => {
    expect(inSilenceRuler("still_there")).toBe(true);
  });
  it("fora do horário ele morre, não é adiado: 'Ainda está aí?' de manhã não faz sentido", () => {
    expect(decideTouch("still_there", "defer")).toEqual({ do: "cancel" });
    expect(decideTouch("silence_1", "defer")).toEqual({ do: "postpone", restartRuler: true });
  });
});

describe("o texto e a entrega", () => {
  it("diz exatamente 'Ainda está aí?'", () => {
    expect(STILL_THERE_REPLY).toBe("Ainda está aí?");
    expect(renderFollowup("still_there", ctx)).toBe("Ainda está aí?");
  });
  it("dentro da janela de 24 h sai como texto", () => {
    expect(deliveryFor("still_there", ctx, new Date(now.getTime() - 15 * 60_000))).toEqual({ via: "text", body: "Ainda está aí?" });
  });
  it("fora da janela nunca vira template", () => {
    const withTemplate = {
      ...ctx,
      config: { ...config, channel: { templates: { still_there: { name: "x", language: "pt_BR", variables: [] } } } },
    } as RenderContext;
    expect(deliveryFor("still_there", withTemplate, new Date(now.getTime() - 25 * 60 * 60_000))).toEqual({ via: "blocked", reason: "no_template" });
  });
  it("passa a cadeia de gates no horário", () => {
    const gated = runGates(STILL_THERE_REPLY, gateCtx({ now }));
    expect(gated.traces.filter((t) => t.verdict === "block")).toEqual([]);
  });
});

describe("fiação (index.ts lido como fonte)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("a resposta dela cancela o toque junto com o silêncio", () => {
    expect(source).toContain("or=(kind.like.silence_*,kind.eq.checkout_reminder,kind.eq.still_there)");
  });
  it("a resposta da agente, a linha fixa e a resposta adiada armam o toque quando terminam em pergunta", () => {
    expect(source).toContain("endsWithQuestion(replyText)");
    expect(source).toContain("endsWithQuestion(text)");
    expect(source).toContain("const ruler = rulerFor(from, stopPoint, postponed, linkInReply, anchors, askedQuestion);");
  });
  it("na mesma varredura ele vai primeiro, e o outro toque de silêncio da conversa fica para a próxima", () => {
    expect(sweep).toContain('Number(b.kind === "still_there") - Number(a.kind === "still_there")');
    expect(sweep).toContain('if (inSilenceRuler(row.kind) && row.kind !== "still_there" && nudged.has(row.conversation_id)) {');
    expect(sweep).toContain('if (kind === "still_there") nudged.add(row.conversation_id);');
  });
  it("handoff e opt-out cancelam todo toque, este incluído", () => {
    expect(sweep).toContain("if (!lead || lead.opted_out_at || lead.handoff_at) {");
  });
});

/** Opção 1 dos toques (operador, 2026-10-06): com link, só o lembrete do link aos 15 min. */
describe("toques depois do link", () => {
  const kinds = (...a: Parameters<typeof rulerFor>) => rulerFor(...a).map((f) => f.kind);
  it("a resposta com o link arma só o lembrete de 15 min na primeira meia hora — sem 'Ainda está aí?' nem silence_1", () => {
    expect(kinds(now, "link_sent", undefined, true, undefined, true)).toEqual(["checkout_reminder", "silence_2", "silence_3"]);
    expect(kinds(now, "link_sent", undefined, true)).toEqual(["checkout_reminder", "silence_2", "silence_3"]);
  });
  it("o lembrete do link adiado pelo relógio volta sem silence_1", () => {
    expect(kinds(now, "link_sent", "checkout_reminder", false)).toEqual(["checkout_reminder", "silence_2", "silence_3"]);
  });
  it("negações: sem link na resposta, 'Ainda está aí?' aos 10 e silence_1 aos 30 seguem", () => {
    expect(kinds(now, "before_size", undefined, false, undefined, true)).toEqual(["still_there", "silence_1", "silence_2", "silence_3"]);
    expect(kinds(now, "link_sent", undefined, false, undefined, true)).toEqual(["still_there", "silence_1", "silence_2", "silence_3"]);
    expect(kinds(now, "link_sent", "silence_1", true)[0]).toBe("silence_1");
  });
  it("ancorada, a resposta com link também perde o silence_1", () => {
    const anchors = { entry: new Date(now.getTime() - 60 * 60_000), lastInbound: now };
    expect(kinds(now, "link_sent", undefined, true, anchors, true)).not.toContain("silence_1");
    expect(kinds(now, "link_sent", undefined, true, anchors, true)).not.toContain("still_there");
  });
});

describe("toques depois do link: só na régua do link", () => {
  it("negação: link na resposta fora de link_sent não apaga o silence_1 (não haveria lembrete nenhum)", () => {
    expect(rulerFor(now, "after_price", undefined, true).map((f) => f.kind)).toContain("silence_1");
  });
});
