/**
 * Plan 16 §4 wired into the turn (wave 2): the ruler by band, the band in the operator's e-mail, the interpreter's hook
 * kept off health and weight, and the source of `supabase/functions/turn/index.ts` (the closure of `handleTurn` does not
 * run in a unit test: the proof of the wiring is a reenactment on the local `turn`, see the report of the wave).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rulerFor, rulerForBand, type ScheduledFollowup } from "@/agent/followups.js";
import { scoreTag } from "@/agent/profile.js";
import { INTERPRETER_SYSTEM, readInterpretation } from "@/agent/interpret.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const kinds = (r: readonly ScheduledFollowup[]) => r.map((f) => f.kind);
const from = new Date("2026-10-21T15:00:00Z");

describe("a régua pela faixa do score (§4.2)", () => {
  const today = rulerFor(from, "after_price");

  it("fria recebe só o primeiro lembrete de silêncio", () => {
    expect(kinds(today)).toEqual(["silence_1", "silence_2", "silence_3"]);
    expect(kinds(rulerForBand(today, "fria"))).toEqual(["silence_1"]);
  });

  it("morna, quente e o score ausente seguem a régua de hoje", () => {
    for (const band of ["morna", "quente", null, undefined, "", "FRIA", "outra"]) {
      expect(kinds(rulerForBand(today, band)), String(band)).toEqual(["silence_1", "silence_2", "silence_3"]);
    }
  });

  it("o toque do checkout e o 'Ainda está aí?' ficam na fria", () => {
    const link = rulerFor(from, "link_sent", undefined, true);
    expect(kinds(rulerForBand(link, "fria"))).toEqual(kinds(link).filter((k) => k !== "silence_2" && k !== "silence_3"));
    expect(kinds(rulerForBand(link, "fria"))).toContain("checkout_reminder");
    const asked = rulerFor(from, "after_price", undefined, false, undefined, true);
    expect(kinds(rulerForBand(asked, "fria"))).toEqual(["still_there", "silence_1"]);
  });

  it("o segundo toque adiado de uma fria não volta", () => {
    expect(rulerForBand(rulerFor(from, "after_price", "silence_2"), "fria")).toEqual([]);
  });

  it("o turno lê a faixa guardada ao armar a régua, por `*` (antes da 0029 a coluna não existe)", () => {
    expect(turn).toContain("select=*,leads(*,orders(status)),followups(kind,sent_at)");
    expect(turn).toContain("body: JSON.stringify(rulerForBand(rows, at?.leads?.score_band)),");
  });
});

describe("a faixa no assunto do e-mail (§4.2)", () => {
  it("o rótulo de cada faixa", () => {
    expect(scoreTag(72)).toBe("🔥 QUENTE · 72");
    expect(scoreTag(60)).toBe("🔥 QUENTE · 60");
    expect(scoreTag(45)).toBe("MORNA · 45");
    expect(scoreTag(30)).toBe("MORNA · 30");
    expect(scoreTag(18)).toBe("FRIA · 18");
    expect(scoreTag(0)).toBe("FRIA · 0");
    expect(scoreTag(100)).toBe("🔥 QUENTE · 100");
  });

  it("sem score, sem rótulo", () => {
    for (const v of [null, undefined, "72", Number.NaN, Infinity, {}]) expect(scoreTag(v), String(v)).toBeNull();
  });

  it("vai no corpo que o n8n lê para o e-mail", () => {
    expect(turn).toMatch(/const notification = \([\s\S]{0,600}scoreTag: scoreTag\(lead\.score\)/);
  });
});

describe("o gancho do intérprete nunca promete alívio, peso nem medida", () => {
  it("o prompt proíbe com exemplos", () => {
    for (const s of ["Ele vai ajudar na sua dor nas costas.", "Você vai perder 5 quilos.", "alivia", "quilos", "medidas", "centímetros"]) {
      expect(INTERPRETER_SYSTEM).toContain(s);
    }
  });

  const hook = (h: string) => readInterpretation(JSON.stringify({ pain: "dor nas costas", occasion: "casamento", hook: h })).interpretation.hook;

  it("as frases que passavam pelos gates saem na leitura", () => {
    for (const h of [
      "Ele vai ajudar na sua dor nas costas.",
      "Você vai perder 5 quilos.",
      "Alivia a dor da lombar no dia a dia",
      "Some com as dores depois do parto",
      "Seca 3 kg até o casamento",
      "Perde 4cm de cintura",
      "Reduz as medidas pro casamento",
      "Pro casamento você emagrece rapidinho",
      "Trata a diástase do pós-parto",
    ]) expect(hook(h), h).toBeNull();
  });

  it("o gancho que só liga o colete ao que ela contou passa", () => {
    for (const h of [
      "Pro seu casamento ele vai deixar o vestido assentadinho 😍",
      "Ajuda a postura no dia a dia",
      "No pós-parto ele dá aquela firmeza enquanto você usa 💛",
      "Com ele o vestido não marca a barriga",
      "Perfeito pra formatura, a cintura fica marcadinha",
    ]) expect(hook(h), h).toBe(h);
  });
});

/**
 * The wiring in `handleTurn`, read from the source: the closure does not run in a unit test. Reenactment note — the proof
 * on the local `turn` (`supabase functions serve`, the production config, a lead with 0029 applied): (1) "uso 42" + a CEP of
 * São Paulo with the G at 12 units and `scarcity.lowStock` 20 → the reply may carry "O *G* está acabando: restam só *12* no
 * estoque 😮" and it passes; (2) a CEP without delivery and a size → the prepaid box carries "Frete pra sua região: *R$ …*";
 * (3) "tá caro" → the operator's question, once; again → today's answer; (4) "é pro meu casamento" then the CEP → the hook
 * bubble before the box; (5) `leads.score`/`score_band` written every turn, and a "fria" gets only `silence_1`.
 */
describe("index.ts — a fiação do plano 16", () => {
  const at = (s: string) => {
    const i = turn.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };

  it("estoque: a linha só com a entrega, uma peça, dentro da janela, uma vez; e o mesmo valor no prompt e nos gates", () => {
    expect(turn).toContain("const stockLine = openNow && region?.cod && region.size && units === 1 && !recentOutbound.some(");
    expect(turn).toContain("? stockScarcityLine(CONFIG, region.size, region.stockQty)");
    expect(turn).toContain("const factsGate = { ...(stockLeft ? { stockLeft } : {}), ...(prepayFreightBrl !== null ? { prepayFreightBrl } : {}) };");
    // The main loop's two prompts and its gate context, the extra call (which spreads the main loop's context), and the hook.
    expect(turn.split("systemPrompt(turnConfig, sizeDirective, identityDirective, checkoutDirective, turnFacts)").length - 1).toBe(2);
    expect(turn).toContain("system: systemPrompt(turnConfig, sizeDirective, identityDirective, null, turnFacts),");
    expect(turn).toContain("      regionKnown: region !== null,\n      // Plan 16 §4.6–4.7: the stock and the freight the prompt taught this turn, the same values (`turnFacts`).\n      ...factsGate,\n    });");
    expect(turn.slice(at("const withHook = async"), at("const withHook = async") + 1500)).toContain("...factsGate,");
  });

  it("frete: lido com a região só onde a entrega não chega, uma peça com tamanho, e só no caminho do antecipado", () => {
    expect(turn).toContain("if (region && !region.cod && regionSize && units === 1) {");
    expect(turn).toContain("prepayFreightBrl: await prepayFreight(regionFetcher(isRetry || isRevise ? RETRY_REGION_TIMEOUT_MS : REGION_TIMEOUT_MS), zip, region.place, regionSize)");
    // Read before the region is cached on the lead, so the next turn's cache carries it.
    expect(at("prepayFreightBrl: await prepayFreight(")).toBeLessThan(at("if (region) freshRegion = { ...region, checkedAt: new Date().toISOString() };"));
    expect(turn).toContain('const prepayFreightBrl = openNow && linkPath === "prepay" && typeof region?.prepayFreightBrl === "number" ? region.prepayFreightBrl : null;');
    expect(turn).toContain("offerBubbles(CONFIG, { cod, dates: region.dates, prepayFreightBrl }, new Date(),");
  });

  it("objeção vaga: uma pergunta, nunca sobre a recusa, e o 'vou pensar' de hoje fica para a segunda vez", () => {
    const decline = at("let declined = false;");
    const vague = at("const vagueObjection = !declined && !interpretation.wants_to_buy &&");
    expect(vague).toBeGreaterThan(decline);
    expect(turn).toContain("!clauses.some((q: string) => asksSomething(q) && !buyerAsk(q)) && !askedVagueQuestion(recentOutbound) &&");
    // The interpreter's own "vou pensar", read before a bare goodbye is parked as one: "obrigada, tchau" gets no question.
    expect(turn).toContain('(putsOff || interpretation.price_signal === "complaint" || interpretation.price_signal === "discount_ask") &&');
    expect(at("const putsOff = interpretation.wants_to_think;")).toBeLessThan(at('if (goodbyeParks(parts[parts.length - 1] ?? "", interpretation))'));
    expect(turn).toContain("reason=like.${encodeURIComponent(`*${VAGUE_OBJECTION_REASON}*`)}");
    expect(turn).toContain("      VAGUE_OBJECTION_QUESTION,\n      VAGUE_OBJECTION_REASON,\n    );");
    expect(turn).toContain("firstDateIsTomorrow: region?.cod === true && eveIsTomorrow(region.dates[0], new Date()),");
    expect(turn).toContain("  if (\n    !vagueObjection &&\n    interpretation.wants_to_think &&");
    expect(at("    !vagueObjection &&\n    interpretation.wants_to_think &&")).toBeGreaterThan(vague);
  });

  it("perfil e score: uma escrita própria por turno, antes de qualquer resposta, sem somar duas vezes a mesma rajada", () => {
    expect(turn).toContain("const profileReplayed = batchFrom !== null && Number.isFinite(scoredAt) && scoredAt >= Date.parse(batchFrom);");
    expect(turn).toContain("mergeProfile(storedProfile, profileReplayed ? NEUTRAL_INTERPRETATION : interpretation, { audio: !profileReplayed && audioParts > 0 });");
    expect(turn).toContain("const audioParts = rawParts.filter(isAudioBody).length;");
    expect(turn).toContain("body: JSON.stringify({ profile, score, score_band: scoreBand, score_at: new Date().toISOString() }),\n  }).then(() => Object.assign(lead, { score, score_band: scoreBand }), () => undefined);");
    const write = at("body: JSON.stringify({ profile, score, score_band: scoreBand");
    expect(write).toBeLessThan(at("const think = thinkReply("));
    expect(write).toBeLessThan(at("const withHook = async"));
    expect(write).toBeLessThan(at("// 7. Nothing reaches the customer without the chain"));
    expect(write).toBeGreaterThan(at("const rawParts: string[] ="));
  });

  it("gatilho pessoal: a diretiva entra no turno, 'agora' quando ela contou nesta mensagem", () => {
    // Never beside her refusal: the goodbye carries no argument (§69).
    expect(turn).toContain('const triggerDirective = declined ? null : personalTriggerDirective(profile, triggerUses, interpretation.occasion !== null || interpretation.pain !== null ? "next_reply" : "free")');
    expect(turn).toContain("      ...guides,\n      triggerDirective,\n");
  });

  it("gancho: um balão antes da oferta do operador, só com uso sobrando e aprovado pela cadeia", () => {
    const hook = turn.slice(at("const withHook = async"), at("const withHook = async") + 1500);
    expect(hook).toContain("if (!hook || triggerUses >= MAX_TRIGGER_USES || at === -1) return bubbles;");
    expect(hook).toContain("return passed(gated) ? [...bubbles.slice(0, at), { text: hook }, ...bubbles.slice(at)] : bubbles;");
    expect(turn).toContain("await withHook(bothLinksBubbles(");
    expect(turn).toContain("await withHook([\n          ...offerBubbles(");
    // Only the offer branch that never runs after a link or an order.
    expect(turn.split("await withHook(").length - 1).toBe(2);
    expect(at("const withHook = async")).toBeLessThan(at("if (guides.length === 0 && offerNow !== null && offerNow !== offerBefore && !pastLink"));
  });
});
