import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
import { optInFollows } from "../src/agent/followups.js";
import { mayAskOptIn, optInAnswer, optInMessage, suspendsMarketingOptIn, type OptInQuestion } from "../src/agent/opt-in.js";
import { parseWebhook, replyButtonsMessage } from "../src/channel/whatsapp.js";
import { config, ctx as gateCtx } from "./fixtures.js";

const brand = config.brand;
const msg = optInMessage(brand, "n1")!;
const [yes, no] = msg.buttons;
const now = new Date("2026-09-10T15:00:00Z");
const askedAt = new Date("2026-09-10T13:00:00Z");
const question = (over: Partial<OptInQuestion> = {}): OptInQuestion => ({ nonce: "n1", askedAt, now, ...over });

/** A tap, as the channel parses Meta's webhook — the real path, not a hand-built object. */
const tap = (id: string, title = "x") =>
  parseWebhook({
    entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "5511", id: "wamid.t", type: "interactive", context: { id: "wamid.q" }, interactive: { type: "button_reply", button_reply: { id, title } } }] } }] }],
  })[0]!;
const typed = (body: string) =>
  parseWebhook({ entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "5511", id: "wamid.x", type: "text", text: { body } }] } }] }] })[0]!;

describe("opt-in de marketing: a pergunta", () => {
  it("cita a marca, não promete cupom e cabe nos limites da Meta", () => {
    expect(msg.body).toContain("Encorpa");
    expect(msg.body).not.toMatch(/cupom|desconto|%/i);
    expect(() => replyButtonsMessage("5511", msg.body, msg.buttons)).not.toThrow();
    expect(yes.id).not.toBe(no.id);
  });

  it("marca ou nonce em branco não geram pergunta", () => {
    for (const blank of ["", " ", "​", "﻿ "]) {
      expect(optInMessage(blank, "n1"), JSON.stringify(blank)).toBeNull();
      expect(optInMessage(brand, blank), JSON.stringify(blank)).toBeNull();
    }
  });

  it("passa a cadeia de gates; a contraprova com cupom é vetada", () => {
    const at = new Date("2026-09-10T10:00:00");
    expect(runGates(msg.body, gateCtx({ now: at, stage: "presale" })).traces.filter((t) => t.verdict === "block")).toEqual([]);
    const withCoupon = msg.body.replace("lembretes e ofertas", "lembretes e um cupom de 20%");
    expect(runGates(withCoupon, gateCtx({ now: at, stage: "presale" })).traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain(
      "coupon_exists",
    );
  });
});

describe("opt-in de marketing: o que um toque diz", () => {
  it("sim da pergunta atual, em até 24h, é consentimento", () => {
    expect(optInAnswer(tap(yes.id, yes.title).reply, question())).toBe("yes");
  });

  it("não de qualquer pergunta, a qualquer hora, é recusa", () => {
    expect(optInAnswer(tap(no.id).reply, question())).toBe("no");
    expect(optInAnswer(tap("optin:no:antiga").reply, question())).toBe("no");
    expect(optInAnswer(tap(no.id).reply, question({ now: new Date(askedAt.getTime() + 30 * 86_400_000) }))).toBe("no");
  });

  it("sim de uma pergunta antiga, ou sem pergunta registrada, não vale", () => {
    expect(optInAnswer(tap("optin:yes:antiga").reply, question())).toBeNull();
    expect(optInAnswer(tap(yes.id).reply, question({ nonce: null }))).toBeNull();
  });

  it("depois de 24h, o sim não vale; datas inválidas ou em texto ISO", () => {
    const at = (h: number) => new Date(askedAt.getTime() + h * 3_600_000);
    expect(optInAnswer(tap(yes.id).reply, question({ now: at(23.9) }))).toBe("yes");
    expect(optInAnswer(tap(yes.id).reply, question({ now: at(24) }))).toBeNull();
    expect(optInAnswer(tap(yes.id).reply, question({ now: at(-1) }))).toBeNull();
    expect(optInAnswer(tap(yes.id).reply, question({ askedAt: askedAt.toISOString() }))).toBe("yes");
    expect(optInAnswer(tap(yes.id).reply, question({ askedAt: "x" }))).toBeNull();
    expect(optInAnswer(tap(yes.id).reply, question({ askedAt: null }))).toBeNull();
    expect(optInAnswer(tap(yes.id).reply, question({ now: new Date("x") }))).toBeNull();
  });

  it("botão de outra coisa (tamanho, lista) não é resposta ao opt-in", () => {
    expect(optInAnswer(tap("size:M").reply, question())).toBeNull();
  });

  // Eight review rounds, 2026-09-28: every one of these, typed, was once read as consent by
  // some version of the text reader. Typed text has no `reply`, so none grants anything.
  it.each(["sim", "Sim!", "SIM 💛", "pode", "quero", "claro", "aceito", "OFERTAS", "Quero ofertas", "optin:yes:n1", "s"])(
    "texto digitado nunca é consentimento: %s",
    (body) => {
      expect(typed(body).reply).toBeUndefined();
      expect(optInAnswer(typed(body).reply, question())).toBeNull();
    },
  );
});

describe("opt-in de marketing: texto dela só suspende", () => {
  it.each([
    "não quero ofertas", "n quero ofertas", "ñ quero ofertas", "naum quero ofertas", "ofertaaas não", "me exclui das ofertas",
    "me descadastra das promoções", "pode deixar as ofertas", "ofertas? tô de boa", "chega de propaganda", "não quero publicidade",
    "para com a publicidade", "chega de mkt", "não quero divulgação", "ofetas não", "nao quero ofeta", "ofretas não",
    "não quero cupom", "chega de desconto", "promoçãozinha não", "não quero spam",
    // Buying sentences suspend too — and are simply asked again with the buttons.
    "o cupom não funcionou", "tem desconto para o pix?", "quero a oferta do kit",
  ])("suspende: %s", (body) => {
    expect(suspendsMarketingOptIn(typed(body))).toBe(true);
  });

  it.each(["me preocupo com golpe", "me ocupo o dia todo", "não quero o M, quero o G", "para quando chega?", "sim"])(
    "não suspende: %j",
    (body) => {
      expect(suspendsMarketingOptIn(typed(body))).toBe(false);
    },
  );

  it("corpo vazio não suspende (o canal nem o entrega como mensagem)", () => {
    expect(suspendsMarketingOptIn({ body: "" })).toBe(false);
  });

  it("o toque em 'Quero ofertas' não suspende, mesmo contendo a palavra", () => {
    expect(suspendsMarketingOptIn(tap(yes.id, yes.title))).toBe(false);
  });
});

describe("opt-in de marketing: quando perguntar", () => {
  const s = (over: Partial<Parameters<typeof mayAskOptIn>[0]>) => ({ askedAt: null, optInAt: null, suspendedAt: null, declinedAt: null, ...over });
  const t1 = "2026-09-10T13:00:00Z";
  const t2 = "2026-09-11T13:00:00Z";

  it("nunca perguntada: pergunta", () => expect(mayAskOptIn(s({}))).toBe(true));
  it("perguntada e sem resposta: não pergunta de novo", () => expect(mayAskOptIn(s({ askedAt: t1 }))).toBe(false));
  it("consentimento em vigor: não pergunta", () => expect(mayAskOptIn(s({ askedAt: t1, optInAt: t1 }))).toBe(false));
  it("suspensa depois da última pergunta: pergunta uma vez mais", () => {
    expect(mayAskOptIn(s({ askedAt: t1, suspendedAt: t2 }))).toBe(true);
    expect(mayAskOptIn(s({ askedAt: t2, suspendedAt: t1 }))).toBe(false);
  });
  it("recusa estruturada é final", () => {
    expect(mayAskOptIn(s({ declinedAt: t1 }))).toBe(false);
    expect(mayAskOptIn(s({ askedAt: t1, suspendedAt: t2, declinedAt: t1 }))).toBe(false);
  });
  it("data ilegível na suspensão não reabre a pergunta", () => {
    expect(mayAskOptIn(s({ askedAt: t1, suspendedAt: "x" }))).toBe(false);
  });
});

/**
 * A fiação no turno e na varredura (R15.1), que nenhum teste executa: fica presa no arquivo que
 * a produção roda. O comportamento foi provado pela Edge Function contra um PostgREST falso
 * com e sem as colunas da 0019, com e sem a flag.
 */
describe("opt-in de marketing: fiação na Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  const sweep = source.slice(source.indexOf("const runFollowupSweep"), source.indexOf('return { status: "swept"'));

  it("a flag só liga com true explícito, e desligada a varredura não seleciona coluna da 0019", () => {
    expect(source).toContain("const ASK_OPT_IN = CONFIG.channel?.askMarketingOptIn === true;");
    expect(sweep).toContain(
      '(ASK_OPT_IN ? ",marketing_opt_in_at,marketing_opt_in_asked_at,marketing_opt_in_suspended_at,marketing_opt_in_declined_at" : "")',
    );
  });
  it("o consentimento que a varredura passa a deliveryFor exige a flag, o opt-in e nenhuma recusa", () => {
    expect(sweep).toContain("marketingOptIn: ASK_OPT_IN && !!lead.marketing_opt_in_at && !lead.marketing_opt_in_declined_at,");
  });
  it("o gate lê o texto que sai: o corpo de deliveryFor, antes de runGates", () => {
    const line = "const text = delivery !== null && delivery.via !== \"blocked\" ? delivery.body : renderFollowup(kind, renderCtx);";
    expect(sweep).toContain(line);
    expect(sweep.indexOf(line)).toBeLessThan(sweep.indexOf("const gates = runGates(text, {"));
  });
  it("a pergunta sai depois do silence_1 em texto, com mayAskOptIn, gravando nonce e horário antes de entrar na fila", () => {
    const ask = sweep.slice(sweep.indexOf("ASK_OPT_IN &&\n"));
    expect(ask).toContain('optInFollows(kind) &&\n      delivery.via === "text" &&\n      mayAskOptIn({');
    const patch = ask.indexOf("marketing_opt_in_nonce: nonce, marketing_opt_in_asked_at:");
    expect(patch).toBeGreaterThan(-1);
    expect(patch).toBeLessThan(ask.indexOf('via: "buttons", body: question.body'));
    expect(sweep.indexOf('via: "buttons", body: question.body')).toBeGreaterThan(sweep.indexOf('{ to: lead.phone, kind, followupId: row.id, via: "text", body: text }'));
  });
  it("o turno grava a resposta antes de guardar a mensagem, e o texto só suspende", () => {
    const optIn = source.indexOf("const answer = optInAnswer(reply, {");
    expect(optIn).toBeGreaterThan(-1);
    expect(optIn).toBeLessThan(source.indexOf("inboundId = (await db(\"messages\", {"));
    expect(source).toContain('const reply = typeof payload.reply?.id === "string" ? { id: payload.reply.id } : undefined;');
    expect(source).toContain('answer === "no" && lead.marketing_opt_in_asked_at');
    expect(source).toContain('(ASK_OPT_IN || lead.marketing_opt_in_at) && suspendsMarketingOptIn({ body: spoken(inbound.body ?? ""), reply })');
  });
  it("as duas verificações do selo incluem o toque", () => {
    expect(source.match(/sentAt: payload\.sentAt, reply: payload\.reply \}/g)).toHaveLength(2);
  });
});

describe("a pergunta de ofertas também depois do lembrete do link (achado 5, operador 2026-10-06)", () => {
  it("segue o silence_1 e o checkout_reminder", () => {
    expect(optInFollows("silence_1")).toBe(true);
    expect(optInFollows("checkout_reminder")).toBe(true);
  });
  it.each(["still_there", "silence_2", "silence_3", "order_eve"])("negação: não segue %s", (k) => expect(optInFollows(k)).toBe(false));
});
