import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { extractName } from "@/agent/identity.js";
import { optInMessage } from "@/agent/opt-in.js";
import { openingDirective, systemPrompt } from "@/agent/prompt.js";
import { OPT_IN_DECLINED_REPLY } from "@/agent/retry.js";
import { config, ctx } from "./fixtures.js";

/**
 * Real test of 2026-10-14 (…6682, grafo §95): the three fixes the operator approved on 2026-10-15 (1, A2, 3). Every case is
 * a sentence from that conversation, with its negation.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string) => runGates(text, ctx()).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("1. uma pergunta com acento não é o nome dela (…6682: \"Oque você faz\")", () => {
  it.each(["Oque você faz", "Oque você vende", "Está ótimo então", "Então tá bom", "Você é robô"])("não é nome: %s", (t) => {
    expect(extractName(t)).toBeNull();
    expect(extractName(t, true)).toBeNull();
  });
  it.each([
    ["Fernanda Antônia", "Fernanda Antônia"],
    ["Ângela Simões", "Ângela Simões"],
    ["meu nome é Lúcia Araújo", "Lúcia Araújo"],
  ])("negação: o nome com acento continua aceito — %s", (t, name) => {
    expect(extractName(t, true)).toBe(name);
  });
  // Revisão Opus: o `\b` ASCII cortava a palavra no acento — "Simão" lia "Sim", "Noé" lia "No" — e recusava nomes reais.
  it.each(["Simão Pedro", "Noé Silva", "Mônica Simões"])("nome real que a lista recusava pelo acento agora passa: %s", (t) => {
    expect(extractName(t, true)).toBe(t);
    expect(extractName(t)).toBe(t);
  });
});

describe("A2. o opt-in pergunta só ofertas, e o 'não' recebe uma linha fixa sem promessa (…6682)", () => {
  const msg = optInMessage("Encorpa", "n1")!;
  it("a pergunta é sobre ofertas, não sobre lembretes", () => {
    expect(msg.body).toBe("Posso te mandar ofertas da Encorpa por aqui?");
    expect(msg.body).not.toMatch(/lembrete/i);
  });
  it("a resposta ao 'não' é a do operador, sem prometer silêncio, e passa a cadeia", () => {
    expect(OPT_IN_DECLINED_REPLY).toBe("Tudo bem, não te mando ofertas 💛");
    expect(OPT_IN_DECLINED_REPLY).not.toMatch(/mais nada|nada mais|não (?:te )?mando mais|lembrete/i);
    expect(blocked(OPT_IN_DECLINED_REPLY)).toEqual([]);
  });
  it("index.ts: o toque no 'não' marca a recusa e manda a linha fixa, antes do ramo da recusa de compra", () => {
    expect(turn).toContain('if (answer === "no" && lead.marketing_opt_in_asked_at) optInRefused = true;');
    const branch = turn.indexOf("if (optInRefused && parts.length === 1) {");
    expect(branch).toBeGreaterThan(turn.indexOf("const recentOutbound = recent"));
    expect(turn.slice(branch, branch + 300)).toContain("sendFixed(OPT_IN_DECLINED_REPLY");
    expect(turn.indexOf("if (declinesInBurst(parts, herRecent((recentRows ?? []).filter((m) => !unanswered.includes(m)), spoken)) && !interpretation.wants_to_buy) {")).toBeGreaterThan(branch);
  });
});

describe("§96. sendFixed antes do histórico (personas de 15/10: 500 em 'quero 4 peças' e na troca pela Logzz)", () => {
  it("sendFixed não lê recentOutbound, que nasce depois de cinco das suas chamadas", () => {
    const body = turn.slice(turn.indexOf("  const sendFixed = async ("), turn.indexOf("  const deferDraft = async ("));
    expect(body.length).toBeGreaterThan(500);
    expect(body).not.toMatch(/\brecentOutbound\b/);
    expect(body).toContain("stopPointOf(text, await outboundBefore())");
  });
  it("depois do histórico, a janela é a do turno", () => {
    const at = turn.indexOf("  const recentOutbound = recent");
    expect(turn.indexOf("  recentOutboundRead = recentOutbound;")).toBeGreaterThan(at);
    expect(turn.indexOf("  recentOutboundRead = recentOutbound;") - at).toBeLessThan(250);
  });
});

describe("3. sem anúncio de origem, a Malu diz o que vende (…6682: \"Que isso\", \"Oque você faz\")", () => {
  it("a primeira resposta sem anúncio não supõe anúncio e diz o produto numa frase", () => {
    const noAd = openingDirective(config, "boa tarde", null, false);
    expect(noAd).toContain("não diga que ela veio por um anúncio");
    expect(noAd).toContain("o Colete Cinta Modeladora");
    // Personas de 15/10 (Lu: "já saiu pra entrega?"): quem já falou do colete ou de um pedido não ouve a frase de venda.
    expect(noAd).toContain("se ela ainda não falou do colete nem de um pedido");
    expect(openingDirective(config, "boa tarde", null, true)).toContain("não diga que ela veio por um anúncio");
  });
  it("negação (revisão Opus): sem anúncio, nada na diretiva fala do anúncio como se existisse", () => {
    for (const greeted of [true, false]) expect(openingDirective(config, "boa tarde", null, greeted)).not.toMatch(/anúncio mostra|chegou pelo anúncio/);
    expect(systemPrompt(config, [], null)).not.toContain("Ela veio do anúncio e");
  });
  it("negação: com anúncio, nada muda", () => {
    const withAd = openingDirective(config, "boa tarde", "Colete que afina a cintura na hora", false);
    expect(withAd).not.toContain("não diga que ela veio por um anúncio");
  });
  it("o prompt manda responder 'o que é isso / o que você faz' com o produto primeiro", () => {
    expect(systemPrompt(config, [], null)).toContain(
      "Se ela perguntar o que é isso, o que você faz ou o que a loja vende, a primeira frase diz o produto",
    );
  });
});

describe("§97. falha do provedor nunca cala a cliente (persona venda-some, 15/10: 'meta: resposta sem conteúdo')", () => {
  it("resposta vazia é passageira: entra na nova tentativa de 5 minutos, como um 5xx", () => {
    expect(turn).toContain('if (!text) throw new TransientModelError("meta: resposta sem conteúdo", call);');
    expect(turn).not.toContain('throw new Error("meta: resposta sem conteúdo")');
  });
  it("modelFailure não grava handoff_at e manda a linha segura (a de espera só no erro de configuração)", () => {
    const failure = turn.slice(turn.indexOf("const modelFailure = async"), turn.indexOf("const deferRetry = async"));
    expect(failure).not.toContain("handoff_at: new Date");
    expect(failure).toContain("const line = error instanceof ModelConfigError ? HOLDING_REPLY : SAFE_FALLBACK_REPLY;");
    expect(failure).toContain("silenced: false,");
  });
});
