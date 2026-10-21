import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NEUTRAL_INTERPRETATION, type Interpretation } from "@/agent/interpret.js";
import {
  EMPTY_PROFILE,
  SCORE_WEIGHTS,
  bandOf,
  isAudioBody,
  mergeProfile,
  scoreOf,
  type LeadProfile,
  type ScoreFacts,
} from "@/agent/profile.js";

const said = (over: Partial<Interpretation> = {}): Interpretation => ({ ...NEUTRAL_INTERPRETATION, ...over });
const text = { audio: false };

/** O perfil do lead (plano 16 §4.1, §4.3): cada mensagem lida se soma ao `leads.profile`. */
describe("mergeProfile", () => {
  it("sem perfil guardado parte do vazio", () => {
    expect(mergeProfile(null, NEUTRAL_INTERPRETATION, text)).toEqual(EMPTY_PROFILE);
    expect(mergeProfile(undefined, NEUTRAL_INTERPRETATION, text)).toEqual(EMPTY_PROFILE);
  });

  it("chave ausente de um formato antigo lê vazia", () => {
    const p = mergeProfile({ occasion: "casamento" }, said({ buying_question: true }), text);
    expect(p).toEqual({ ...EMPTY_PROFILE, occasion: "casamento", buying_questions: 1 });
  });

  it("ocasião, dor e hook: o mais recente vence; null não apaga", () => {
    const first = mergeProfile(null, said({ occasion: "casamento", pain: "barriga marca", hook: "h1" }), text);
    const kept = mergeProfile(first, NEUTRAL_INTERPRETATION, text);
    expect(kept).toMatchObject({ occasion: "casamento", pain: "barriga marca", hook: "h1" });
    const next = mergeProfile(kept, said({ occasion: "formatura", hook: "h2" }), text);
    expect(next).toMatchObject({ occasion: "formatura", pain: "barriga marca", hook: "h2" });
  });

  it("objeções se somam sem repetir", () => {
    const a = mergeProfile(null, said({ objections: ["preco", "entrega"] }), text);
    const b = mergeProfile(a, said({ objections: ["entrega", "confianca"] }), text);
    expect(b.objections).toEqual(["preco", "entrega", "confianca"]);
  });

  it.each([
    ["complaint", "alta"],
    ["discount_ask", "alta"],
    ["installments", "media"],
    ["discount_question", "media"],
    [null, "baixa"],
  ] as const)("price_signal %s → %s", (signal, level) => {
    expect(mergeProfile(null, said({ price_signal: signal }), text).price_sensitivity).toBe(level);
  });

  it("a sensibilidade fica no nível mais alto visto", () => {
    const alta = mergeProfile(null, said({ price_signal: "complaint" }), text);
    expect(mergeProfile(alta, said({ price_signal: "installments" }), text).price_sensitivity).toBe("alta");
    expect(mergeProfile(alta, NEUTRAL_INTERPRETATION, text).price_sensitivity).toBe("alta");
    const media = mergeProfile(null, said({ price_signal: "discount_question" }), text);
    expect(mergeProfile(media, said({ price_signal: "discount_ask" }), text).price_sensitivity).toBe("alta");
  });

  it("contadores: áudio, pergunta de compra, pedido de desconto, vou pensar, ocasião contada", () => {
    let p: LeadProfile = mergeProfile(null, said({ buying_question: true, price_signal: "discount_ask" }), { audio: true });
    p = mergeProfile(p, said({ buying_question: true, wants_to_think: true }), text);
    p = mergeProfile(p, said({ price_signal: "discount_ask" }), { audio: true });
    expect(p).toMatchObject({ audio_count: 2, buying_questions: 2, discount_asks: 2, think_count: 1, occasion_told: false });
    expect(mergeProfile(p, said({ pain: "dor nas costas" }), text).occasion_told).toBe(true);
    // "tem desconto?" é pergunta, não pedido
    expect(mergeProfile(null, said({ price_signal: "discount_question" }), text).discount_asks).toBe(0);
  });

  it("não muda o perfil recebido", () => {
    const prev = mergeProfile(null, said({ objections: ["preco"] }), text);
    const copy = structuredClone(prev);
    mergeProfile(prev, said({ objections: ["entrega"], buying_question: true }), { audio: true });
    expect(prev).toEqual(copy);
  });
});

/** Os dois marcadores de áudio do canal (`whatsapp.ts`). */
describe("isAudioBody", () => {
  it("o áudio transcrito e o que não deu pra transcrever são áudio", () => {
    expect(isAudioBody("[áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] quero o G")).toBe(true);
    expect(isAudioBody("[a cliente mandou um áudio, que você não consegue ouvir]")).toBe(true);
  });
  it("texto que fala de áudio não é áudio", () => {
    for (const body of ["vou mandar um áudio", "manda áudio?", "o áudio da cliente", "", "quero o [a cliente mandou um áudio"]) {
      expect(isAudioBody(body), body).toBe(false);
    }
  });
  it("os literais ainda existem no canal", () => {
    for (const file of ["supabase/functions/whatsapp/whatsapp.ts", "src/channel/whatsapp.ts"]) {
      const source = readFileSync(file, "utf-8");
      expect(source).toContain("[áudio da cliente, transcrito automaticamente");
      expect(source).toContain("[a cliente mandou um áudio");
    }
  });
});

const none: ScoreFacts = {
  sizeKnown: false,
  regionKnown: false,
  codAvailable: false,
  pathChosen: false,
  nameGiven: false,
  wantsToBuyOrAskedLink: false,
  buyingQuestions: 0,
  occasionOrPainTold: false,
  thinkCount: 0,
  secondDiscountAfterNo: false,
  unansweredTouches: 0,
  declinedOrOptOut: false,
  orderCreated: false,
};
const score = (over: Partial<ScoreFacts>) => scoreOf({ ...none, ...over });

/** A régua do §4.2, linha por linha. */
describe("scoreOf", () => {
  it("o começo vale 10", () => expect(score({})).toBe(10));

  it.each([
    ["sizeKnown", 15],
    ["regionKnown", 15],
    ["codAvailable", 5],
    ["pathChosen", 10],
    ["nameGiven", 10],
    ["wantsToBuyOrAskedLink", 20],
    ["occasionOrPainTold", 5],
  ] as const)("%s soma %i", (fact, points) => {
    expect(score({ [fact]: true })).toBe(10 + points);
  });

  it("pergunta de compra: +5 cada, até +15", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => score({ buyingQuestions: n }))).toEqual([10, 15, 20, 25, 25, 25]);
  });

  it("vou pensar: −15, uma vez", () => {
    const base = { sizeKnown: true, regionKnown: true }; // 40
    expect(score({ ...base, thinkCount: 1 })).toBe(25);
    expect(score({ ...base, thinkCount: 3 })).toBe(25);
  });

  it("segundo desconto depois do não: −10", () => {
    expect(score({ sizeKnown: true, secondDiscountAfterNo: true })).toBe(15);
  });

  it("toque sem resposta: −10 cada", () => {
    const base = { sizeKnown: true, regionKnown: true, pathChosen: true }; // 50
    expect(score({ ...base, unansweredTouches: 1 })).toBe(40);
    expect(score({ ...base, unansweredTouches: 3 })).toBe(20);
  });

  it("nunca abaixo de 0 nem acima de 100", () => {
    expect(score({ thinkCount: 1, secondDiscountAfterNo: true, unansweredTouches: 5 })).toBe(0);
    const all = { ...none, sizeKnown: true, regionKnown: true, codAvailable: true, pathChosen: true, nameGiven: true,
      wantsToBuyOrAskedLink: true, buyingQuestions: 5, occasionOrPainTold: true };
    expect(scoreOf(all)).toBe(100); // 105 somados
  });

  it("recusa ou opt-out zera; pedido criado é 100", () => {
    expect(score({ sizeKnown: true, wantsToBuyOrAskedLink: true, declinedOrOptOut: true })).toBe(0);
    expect(score({ unansweredTouches: 3, orderCreated: true })).toBe(100);
    expect(score({ declinedOrOptOut: true, orderCreated: true })).toBe(100);
  });

  it("os pesos são os do §4.2", () => {
    expect(SCORE_WEIGHTS).toMatchObject({ start: 10, size: 15, region: 15, cod: 5, path: 10, name: 10, wantsToBuy: 20,
      buyingQuestion: 5, buyingQuestionsMax: 15, occasionOrPain: 5, think: -15, secondDiscountAfterNo: -10,
      unansweredTouch: -10, order: 100 });
  });
});

describe("bandOf", () => {
  it.each([
    [0, "fria"], [29, "fria"], [30, "morna"], [59, "morna"], [60, "quente"], [100, "quente"],
  ] as const)("%i → %s", (s, band) => expect(bandOf(s)).toBe(band));
});

/** A view do portal (0029): sem dado que identifica a cliente e sem lead de persona. */
describe("lead_profiles_v", () => {
  const sql = readFileSync("supabase/migrations/0029_lead_profile.sql", "utf-8").toLowerCase();
  const view = sql.slice(sql.indexOf("create or replace view public.lead_profiles_v"));
  it("tem as colunas que o portal lê", () => {
    for (const col of ["l.id", "l.created_at", "as stage", "l.score", "l.score_band", "l.score_at", "l.profile"]) {
      expect(view).toContain(col);
    }
  });
  it("nunca expõe telefone, nome, identidade ou endereço", () => {
    const select = view.slice(0, view.indexOf("where l.phone"));
    expect(select).not.toMatch(/\b(?:phone|name|identity|address)\b/);
  });
  it("deixa a persona de fora, com o prefixo do runner", async () => {
    const { SYNTHETIC_PHONE_PREFIX } = await import("../src/dev/persona-run-core.js");
    expect(view).toContain(`where l.phone not like '${SYNTHETIC_PHONE_PREFIX}%'`);
  });
});
