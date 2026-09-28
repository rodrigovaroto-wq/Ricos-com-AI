import { describe, expect, it } from "vitest";
import { runGates } from "../src/agent/guardrails.js";
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
