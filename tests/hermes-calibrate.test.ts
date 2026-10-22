/**
 * P1.4 (operator, 2026-10-22): Hermes's calibration plants 30–50 defects per class across trials, beside clean conversations,
 * and reports the recall per class. The pure half (`hermes-calibrate-core.ts`): planting, seeding and scoring.
 */
import { describe, expect, it } from "vitest";
import { ALREADY_VETOED, type Checked } from "@/dev/hermes-core.js";
import { DEFECT_CLASSES, FALLBACK, LIES, PLANTED_LINK, found, plant, plantable, renderCalibration, score, trial } from "@/dev/hermes-calibrate-core.js";
import type { Conversation } from "@/dev/persona-scorecard.js";

const conv = (n: number, replies = 3): Conversation => ({
  persona: `conversa-${String(n).padStart(8, "0")}`,
  transcript: [
    { from: "valen", text: "Oi! Recebi sua mensagem.", status: "welcomed" },
    ...Array.from({ length: replies }, (_, i) => [{ from: "persona", text: `pergunta ${i}` }, { from: "valen", text: `resposta ${i} da Malu` }]).flat(),
  ],
});
const pool = Array.from({ length: 20 }, (_, i) => conv(i + 1));
const checkedCiting = (conversa: string, trecho: string, ok = true, problems: string[] = []): Checked =>
  ({ ok, problems, proposal: { alvo: "prompt", o_que: "", por_que: "", objetivo: "", como_medir: "", severidade: "alta", evidencias: [{ conversa, trecho }] } }) as unknown as Checked;

describe("plant: um defeito numa cópia, nunca no original", () => {
  it("mentira: a frase vai na última resposta da Malu, a receção não conta", () => {
    const c = conv(1);
    const { conversation, planted } = plant(c, "mentira", 2);
    expect(planted).toEqual({ conversa: c.persona, cls: "mentira", needle: LIES[2] });
    expect(conversation.transcript.at(-1)!.text).toContain("Ele ajuda a curar a dor nas costas também.");
    expect(c.transcript.at(-1)!.text).toBe("resposta 2 da Malu");
  });
  it("resposta pronta: a última resposta vira o texto pronto, com três vetos", () => {
    const { conversation } = plant(conv(1), "resposta_pronta", 0);
    const last = conversation.transcript.at(-1)!;
    expect([last.text, last.status, last.vetoes?.length]).toEqual([FALLBACK, "fallback", 3]);
  });
  it("link repetido: o mesmo link em duas respostas seguidas", () => {
    const { conversation, planted } = plant(conv(1), "link_repetido", 0);
    const rs = conversation.transcript.filter((e) => e.from === "valen" && e.status !== "welcomed");
    expect(rs.at(-2)!.text).toContain(PLANTED_LINK);
    expect(rs.at(-1)!.text).toContain(`link de novo: ${PLANTED_LINK}`);
    expect(planted.needle).toBe("link de novo");
  });
  it("só conversa com duas respostas da Malu recebe defeito", () => {
    expect(plantable(conv(1, 1))).toBe(false);
    expect(plantable(conv(1, 2))).toBe(true);
  });
});

describe("trial: perClass por classe em conversas distintas, mais as limpas", () => {
  it("4 por classe e 4 limpas: 16 conversas, 12 defeitos, 4 de cada, sem conversa repetida", () => {
    const t = trial(pool, { seed: 7, perClass: 4, clean: 4 });
    expect(t.conversations).toHaveLength(16);
    expect(t.planted).toHaveLength(12);
    for (const cls of DEFECT_CLASSES) expect(t.planted.filter((p) => p.cls === cls)).toHaveLength(4);
    expect(new Set(t.planted.map((p) => p.conversa)).size).toBe(12);
    expect(new Set(t.conversations.map((c) => c.persona)).size).toBe(16);
    expect(t.short).toBe(false);
  });
  it("a mesma semente planta o mesmo; outra semente, outro sorteio", () => {
    const a = trial(pool, { seed: 7, perClass: 4, clean: 4 });
    expect(trial(pool, { seed: 7, perClass: 4, clean: 4 })).toEqual(a);
    expect(trial(pool, { seed: 8, perClass: 4, clean: 4 }).planted).not.toEqual(a.planted);
  });
  it("conversas de menos: planta o que cabe e avisa", () => {
    const t = trial(pool.slice(0, 5), { seed: 1, perClass: 4, clean: 4 });
    expect([t.planted.length, t.short, t.conversations.length]).toEqual([5, true, 5]);
  });
});

describe("found e score: a revocação por classe", () => {
  const p = { conversa: "conversa-00000001", cls: "mentira" as const, needle: LIES[0] };
  it("achado quando uma proposta válida cita o trecho, ou o run o pôs de lado porque os gates de hoje já vetam", () => {
    expect(found([checkedCiting(p.conversa, `Ok! E chega amanhã certinho aí, pode ficar tranquila.`)], p)).toBe(true);
    expect(found([checkedCiting(p.conversa, LIES[0], false, [ALREADY_VETOED])], p)).toBe(true);
  });
  it("não achado: outra conversa, proposta inválida por outro motivo, trecho curto demais", () => {
    expect(found([checkedCiting("conversa-00000002", LIES[0])], p)).toBe(false);
    expect(found([checkedCiting(p.conversa, LIES[0], false, ["trecho não está na conversa"])], p)).toBe(false);
    expect(found([checkedCiting(p.conversa, "amanhã")], p)).toBe(false);
  });
  it("conta instâncias e rodadas, e o relatório aponta a classe abaixo de 80%", () => {
    const q = { conversa: "conversa-00000003", cls: "link_repetido" as const, needle: "link de novo" };
    const scores = score([
      { planted: [p, q], checked: [checkedCiting(p.conversa, LIES[0])] },
      { planted: [p], checked: [] },
    ]);
    expect(scores.find((s) => s.cls === "mentira")).toEqual({ cls: "mentira", planted: 2, found: 1, trialsFound: 1, trials: 2 });
    expect(scores.find((s) => s.cls === "link_repetido")).toMatchObject({ planted: 1, found: 0, trials: 1 });
    const md = renderCalibration(scores, { trials: 2, costUsd: 0.12, model: "muse-spark-1.3", source: "supabase" });
    expect(md).toContain("| mentira (prazo, desconto, saúde, escassez) | 2 | 1 | 50% | 1/2 |");
    expect(md).toContain("**Abaixo da barra:** link repetido (0%)");
    expect(md).toContain("US$ 0.1200");
  });
});
