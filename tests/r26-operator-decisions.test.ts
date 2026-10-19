/**
 * Decisões do operador de 2026-10-15 (R26). Cada caso é a frase real da persona, com a negação ao lado.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORREIOS_CEP_URL, forgetsCep } from "@/agent/address.js";
import { renderFollowup } from "@/agent/followups.js";
import { asksCep, runGates } from "@/agent/guardrails.js";
import { config, ctx } from "./fixtures.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, over: Parameters<typeof ctx>[0]) =>
  runGates(text, ctx(over)).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("R26.1 — CEP depois do 'não lembro' (persona Marcinha, 15/10)", () => {
  it.each([
    "e meu cep nao lembro de cabeça agora",
    "não sei meu cep",
    "esqueci meu CEP",
    "o cep eu não lembro",
    "não lembro o cep não",
    "não sei o CEP de cabeça",
  ])("ela não lembra: %s", (text) => {
    expect(forgetsCep(text)).toBe(true);
  });

  it.each([
    "lembro sim, meu cep é 01310-100",
    "meu cep é 01310100",
    "não sei se meu cep tem entrega",
    "meu cep não sei se tem pagamento na entrega",
    "não lembro se o cep é esse",
    "não lembro o número da casa, mas o cep é 01310-100",
    "não sei qual tamanho, me passa o cep de vocês?",
    // Revisão Opus do R26: o "não" é de outra coisa, ou ela nega o esquecer.
    "nao lembro o numero mas o cep eu sei",
    "não sei pq vcs precisam do meu cep",
    "não esqueci o cep não",
  ])("não é esquecer o CEP: %s", (text) => {
    expect(forgetsCep(text)).toBe(false);
  });

  it("o link dos Correios é o buscador de CEP", () => {
    expect(CORREIOS_CEP_URL).toBe("https://buscacepinter.correios.com.br");
  });

  it("cep_insist veta qualquer pedido de CEP depois do 'não lembro', mesmo o primeiro e mesmo ela querendo fechar", () => {
    for (const ask of ["Me passa seu CEP? Quero ver como fica a entrega aí.", "Me passa seu CEP quando lembrar? Quero ver a entrega.", "Quando achar, me manda o CEP aqui."])
      expect(blocked(ask, { cepForgotten: true, cepAsks: 0 })).toContain("cep_insist");
  });

  it("negação: sem o 'não lembro', o primeiro pedido passa; e apontar o buscador não é pedir", () => {
    expect(blocked("Me passa seu CEP? Quero ver como fica a entrega aí.", { cepAsks: 0 })).not.toContain("cep_insist");
    const pointer = `Sem problema! Você acha seu CEP pelo endereço no buscador dos Correios: ${CORREIOS_CEP_URL}`;
    expect(blocked(pointer, { cepForgotten: true })).toEqual([]);
    expect(blocked("Assim que você tiver o CEP, eu já te mando o link.", { cepForgotten: true })).not.toContain("cep_insist");
  });

  it("o turno lê o 'não lembro' das mensagens dela, só enquanto nenhum CEP foi lido, e passa ao gate", () => {
    expect(turn).toContain("const cepForgotten = cepRefused || (!addressDraft.cep && !wrongCep && !cepNotFound && herRecent(recentRows ?? [], spoken).some(forgetsCep));");
    expect(turn).toMatch(/cepForgotten,\n\s+hookSent: recentOutbound\.some\(isHook\)/);
  });

  it("as diretivas não mandam pedir o CEP: a do tamanho, a do link e a do estado do CEP", () => {
    expect(turn).toContain("sizeDirectiveFor(stated, lead.size ?? null, knownRegion, checkoutUrl !== null, cepForgotten)");
    expect(turn).toContain("if (cepForgotten) return fitting;");
    expect(turn).toContain("missing === \"cep\" && cepDue && cepForgotten");
    // A diretiva do link não convida "me manda" (que o cep_insist veta).
    expect(turn).toContain("assim que ela tiver o CEP, o link sai — sem pedir que ela mande.");
    expect(turn).toContain("Ela disse que não lembra o CEP: não peça o CEP de novo até ela mandar");
  });

  it("a falta do CEP esquecido só segura o link: a oferta do kit segue", () => {
    // R28: no kit offer before the link at all; the link waits for the CEP she forgot.
    expect(turn).toContain("const kitOfferNow = false;");
    expect(turn).toContain("cepKnown: Boolean(addressDraft.cep) && !cepNotFound,");
  });
});

describe("R26.1 na régua — o toque depois do preço não pede o CEP que ela não lembra (revisão Opus do R26)", () => {
  const leads = Array.from({ length: 40 }, (_, i) => `lead-${i}`);
  const touch = (leadId: string, cepForgotten?: boolean) =>
    renderFollowup("silence_1", { leadId, config, stopPoint: "after_price", regionKnown: false, ...(cepForgotten ? { cepForgotten } : {}) });
  it("nenhuma linha que a régua manda nesse estado pede o CEP", () => {
    for (const id of leads) expect(asksCep(touch(id, true) ?? "")).toBe(false);
  });
  it("negação: sem o 'não lembro', a variante que pede o CEP continua no sorteio", () => {
    expect(leads.some((id) => asksCep(touch(id) ?? ""))).toBe(true);
  });
  it("a varredura lê o 'não lembro' só para o silence_1, sem CEP e sem pedido", () => {
    expect(turn).toContain('cepForgotten: kind === "silence_1" && !lead.address?.cep && !order &&');
  });
});

describe("R26.5 — o custo da resposta vazia conta no teto e no registro", () => {
  it("a resposta vazia carrega o custo no erro, nos dois provedores", () => {
    expect(turn).toContain('if (!text) throw new TransientModelError("meta: resposta sem conteúdo", call);');
    expect(turn).toContain('if (!text) throw new TransientModelError("openai: resposta sem conteúdo", call);');
  });
  it("o chamador soma ao gasto e grava em llm_calls antes de tentar de novo", () => {
    const wrap = turn.slice(turn.indexOf("const callConversationModel = async"), turn.indexOf("const callConversationModel = async") + 900);
    expect(wrap).toContain("if (error instanceof TransientModelError && error.wasted) {");
    expect(wrap).toContain("spent += error.wasted.costBrl;");
    expect(wrap).toContain('await recordCall(conversation.id, "empty", conversationProvider, CONVERSATION_MODEL, error.wasted);');
    expect(wrap).toContain("throw error;");
  });
});

describe("R26.3 — consulta de cobertura que falha (persona Jussara, 15/10)", () => {
  it("a consulta que falha (ou lança, 'fetch failed') é tentada de novo, curta, antes do link com a ressalva", () => {
    const lookup = turn.slice(turn.indexOf("else if (addressDraft.cep) {"), turn.indexOf("region = lookup.kind === \"found\" ? lookup.region : null;"));
    expect(lookup).toContain('.catch((): RegionLookup => ({ kind: "failed" }))');
    expect(lookup).toContain('.then((first) => (first.kind === "failed" && !isRetry && !isRevise ? lookupRegion(regionFetcher(RETRY_REGION_TIMEOUT_MS), zip, regionSize, CONFIG.checkout?.logzz ?? null) : first));');
  });

  it("negação (revisão Opus): na nova tentativa da varredura e na revisão, sem a segunda consulta — o orçamento é do modelo", () => {
    expect(turn).not.toContain('.then((first) => (first.kind === "failed" ? lookupRegion(');
  });

  it("negação (L2 mantida): ainda falhando, a cobertura fica desconhecida e o link sai com a ressalva", () => {
    expect(turn).toContain("diga que o checkout confirma quando ela digitar o CEP.");
  });

  const SENTENCE =
    "Aquele link que te mandei é da entrega e não serve aí: a consulta do seu CEP agora respondeu que aí a transportadora ainda não tem pagamento na entrega.";

  it("depois do link da entrega, o 'não tem na entrega' vem como a correção que é, uma vez", () => {
    expect(turn).toContain(SENTENCE);
    expect(turn).toContain(
      "const codLinkVoid = codUnavailable && offerBefore !== \"both\" && (storedAddress.codAvailable !== false || isRetry || isRevise) && codLinkAt !== -1 && !recentOutbound.slice(codLinkAt + 1).some(toldNoCod);",
    );
  });

  it("a correção sai só no turno em que a consulta descobre a falta de entrega (revisão Opus: o modelo pode dizer de outro jeito)", () => {
    // `storedAddress` é o lead do começo do turno: o turno seguinte já o lê com `codAvailable: false` e a diretiva não volta.
    expect(turn.indexOf("const storedAddress = (lead.address ?? {})")).toBeLessThan(turn.indexOf("const codLinkVoid ="));
    expect(turn).toMatch(/regionDirectiveFor\(knownRegion, paymentChoice, agreedOnly, region !== null && isLikelyCodCity\(region\.place, CONFIG\.cod\.likelyCities\), [^\n]*\),\n[\s\S]{0,600}?\n\s+codLinkVoid/);
  });

  it("a frase que a diretiva ensina passa a cadeia de gates sem entrega na região, nos dois caminhos", () => {
    for (const p of ["cod", "prepay"] as const)
      expect(blocked(SENTENCE, { paymentPath: p, codUnavailable: true, regionKnown: true })).toEqual([]);
  });
});
