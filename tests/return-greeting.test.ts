import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyOptOutBurst, runGates, wantsHuman } from "@/agent/guardrails.js";
import { declinesInBurst } from "@/agent/interpret.js";
import {
  isReceipt,
  onEarlierDay,
  QUIET_WINDOW_MS,
  RETURN_GREETING,
  RETURN_RESUME_DELAY_SECONDS,
  unansweredInbound,
  WELCOME_RESUME_DELAY_SECONDS,
} from "@/agent/retry.js";
import { ctx } from "./fixtures.js";

/**
 * Grafo §103 (operador, 2026-10-17): "se a cliente mandar uma mensagem no dia seguinte a Malu deve recepcionar com
 * 'Oii, tudo bem? Deseja continuar com seu pedido?' e em seguida a mensagem que ela já iria mandar". Mesmo mecanismo
 * do Estágio 0: texto fixo, layer "auto", `status: "welcomed"`, e a retomada do n8n escreve a resposta de verdade.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf-8");
const blocked = (text: string, over = {}) =>
  runGates(text, ctx(over)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("o texto da volta", () => {
  it("é exatamente o do operador", () => {
    expect(RETURN_GREETING).toBe("Oii, tudo bem? Deseja continuar com seu pedido?");
  });

  it("passa a cadeia inteira como layer auto, de dia e à noite, e não afirma nem nega ser IA", () => {
    expect(blocked(RETURN_GREETING, { layer: "auto" })).toEqual([]);
    expect(blocked(RETURN_GREETING, { layer: "auto", now: new Date("2026-09-06T21:30:00-03:00") })).toEqual([]);
    expect(blocked(RETURN_GREETING, { layer: "auto", codUnavailable: true })).toEqual([]);
    expect(runGates(RETURN_GREETING, ctx({ layer: "auto" })).traces.find((t) => t.gate === "humanity_claim")?.verdict).toBe("pass");
  });

  it("é recepção: não responde nada, e a rajada dela atravessa o texto até a última resposta de verdade", () => {
    expect(isReceipt(RETURN_GREETING)).toBe(true);
    const newestFirst = [
      { id: "m3", direction: "inbound", body: "tem o G ainda?" },
      { id: "g", direction: "outbound", body: RETURN_GREETING },
      { id: "m2", direction: "inbound", body: "oi" },
      { id: "o1", direction: "outbound", body: "Qual o seu CEP?" },
    ];
    expect(unansweredInbound(newestFirst).map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("a resposta de verdade vem logo: a janela de silêncio de uma mensagem nova, nunca o minuto da recepção", () => {
    expect(RETURN_RESUME_DELAY_SECONDS).toBe(QUIET_WINDOW_MS / 1000);
    expect(RETURN_RESUME_DELAY_SECONDS).toBeLessThan(WELCOME_RESUME_DELAY_SECONDS);
  });
});

describe("onEarlierDay — o dia de São Paulo, não o do UTC", () => {
  it("feliz: 23:50 → 00:10 em São Paulo é o dia seguinte", () => {
    expect(onEarlierDay("2026-10-16T23:50:00-03:00", new Date("2026-10-17T00:10:00-03:00"))).toBe(true);
  });
  it("feliz: dias depois também é dia anterior", () => {
    expect(onEarlierDay("2026-10-10T15:00:00-03:00", new Date("2026-10-17T09:00:00-03:00"))).toBe(true);
  });
  it("negação: 08:00 → 22:00 do mesmo dia não é", () => {
    expect(onEarlierDay("2026-10-17T08:00:00-03:00", new Date("2026-10-17T22:00:00-03:00"))).toBe(false);
  });
  it("negação: cruza a meia-noite UTC e é o mesmo dia em São Paulo", () => {
    // 20:30 BRT = 23:30Z de 16/10; 22:30 BRT = 01:30Z de 17/10 — dias UTC diferentes, mesmo dia em São Paulo.
    expect(onEarlierDay("2026-10-16T23:30:00Z", new Date("2026-10-17T01:30:00Z"))).toBe(false);
  });
  it("borda: sem mensagem anterior, ou data ilegível, não é volta", () => {
    expect(onEarlierDay(null, new Date("2026-10-17T09:00:00-03:00"))).toBe(false);
    expect(onEarlierDay("não é data", new Date("2026-10-17T09:00:00-03:00"))).toBe(false);
  });
  it("borda: a mensagem anterior no futuro (relógio torto) não é dia anterior", () => {
    expect(onEarlierDay("2026-10-18T09:00:00-03:00", new Date("2026-10-17T09:00:00-03:00"))).toBe(false);
  });
});

describe("os leitores que vetam a volta já pegam o que ela não quer ouvir", () => {
  it("parar, pedir pessoa e recusar não recebem 'Deseja continuar…'", () => {
    expect(classifyOptOutBurst(["não me manda mais mensagem"])).not.toBe("none");
    expect(wantsHuman("quero falar com uma pessoa")).toBe(true);
    expect(declinesInBurst(["não quero mais, obrigada"])).toBe(true);
  });
  it("negação: um 'oi' e uma pergunta seguem para a volta", () => {
    for (const t of ["oi", "Bom dia! ainda tem o G?"]) {
      expect(classifyOptOutBurst([t])).toBe("none");
      expect(wantsHuman(t)).toBe(false);
      expect(declinesInBurst([t])).toBe(false);
    }
  });
});

describe("index.ts: o ramo da volta", () => {
  const at = turn.indexOf("  // 2c-bis.");
  const branch = turn.slice(at, turn.indexOf("  // She answered: every touch waiting on her silence is moot"));

  it("fica depois da boas-vindas do lead novo e da mensagem gravada, antes do resto do turno", () => {
    expect(at).toBeGreaterThan(turn.indexOf("if (isNewLead && !isResume && !(fastOpening && openNow)) {"));
    expect(at).toBeGreaterThan(turn.indexOf('direction: "inbound",\n        body: inbound.body ?? "",'));
    expect(branch.length).toBeGreaterThan(500);
  });

  it("só lead que volta, mensagem de verdade, sem toque de botão, com a janela aberta", () => {
    expect(branch).toContain("!isNewLead &&\n    !isResume &&\n    !isRetry &&\n    !isRevise &&\n    openNow &&\n    !payload.reply &&");
    expect(branch).toContain("inboundId !== null &&");
  });

  it("nunca a quem saiu, a quem o operador pegou, ou a quem já comprou", () => {
    expect(branch).toContain("!lead.opted_out_at &&\n    !lead.handoff_at &&\n    chasesSilence(storedStage, []) &&");
  });

  it("nunca a quem pediu para parar, pediu uma pessoa ou recusou — os leitores do turno, sem regex nova", () => {
    expect(branch).toContain('classifyOptOutBurst([spokenNow]) === "none" &&\n    !wantsHuman(spokenNow) &&\n    !declinesInBurst([spokenNow]) &&');
  });

  it("a última mensagem antes desta, nos dois sentidos, é de um dia anterior — lida por último, pelo índice da conversa", () => {
    expect(branch).toContain(
      "onEarlierDay(\n      (await db(`messages?conversation_id=eq.${conversation.id}&id=neq.${inboundId}&select=created_at&order=created_at.desc&limit=1`).catch(() => null))?.[0]?.created_at ?? null,",
    );
  });

  it("passa pela cadeia como layer auto; vetada, cai no turno de sempre", () => {
    expect(branch).toContain('const back = runGates(RETURN_GREETING, {\n      config: turnConfig,\n      layer: "auto",');
    expect(branch).toContain("if (passed(back)) {");
  });

  it("devolve o mesmo contrato da recepção: o n8n espera e chama a retomada", () => {
    expect(branch).toContain("body: JSON.stringify({ welcomed_at: new Date().toISOString() }),");
    expect(branch).toContain('status: "welcomed",');
    expect(branch).toContain("resumeInSeconds: RETURN_RESUME_DELAY_SECONDS,");
  });

  it("a retomada lê a última mensagem da agente antes da volta: 'Qual o seu nome?' de ontem continua sendo a pergunta", () => {
    expect(turn).toContain(
      '"&select=body&order=created_at.desc&limit=2",\n      ).catch(() => null)\n    )?.find((m: { body: string | null }) => m.body !== RETURN_GREETING)?.body ?? "";',
    );
  });
});
