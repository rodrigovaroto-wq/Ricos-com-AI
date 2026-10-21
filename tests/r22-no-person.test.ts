import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ackGoesUnanswered } from "@/agent/followups.js";
import { handoffFor, type Interpretation } from "@/agent/interpret.js";
import { runGates } from "@/agent/guardrails.js";
import { offerFallbackMessage, systemPrompt } from "@/agent/prompt.js";
import { decideNext, kitLimitReply, MAX_REWRITES, rewriteInstruction } from "@/agent/retry.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { config as base, ctx } from "./fixtures.js";

const config = { ...base, prices: { ...base.prices, prepayDiscountPercent: 10, prepayMaxInstallments: 12 } };
const build = () => systemPrompt(config, gateBriefing(config), null);

/**
 * R22 (operador, 2026-10-13): a Malu nunca chama uma pessoa — ninguém responde pelo número da API, e o
 * `handoff_at` a calava para sempre. Quando não dá para seguir, o aviso é só o e-mail. Cinco tentativas nos gates.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
const blocked = (text: string, layer: "agent" | "auto" = "agent") =>
  runGates(text, ctx({ layer, config })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("R22.1 — o handoff não cala a Malu", () => {
  it("o handOff não grava handoff_at; o teto de custo e a falha de configuração é que seguram a conversa", () => {
    const start = turn.indexOf("const handOff = async (");
    const end = turn.indexOf("const draftWith = async (");
    expect(turn.slice(start, end)).not.toContain("handoff_at");
    // Negação: o teto de custo continua calando (proteção de custo, não conversa).
    expect(turn.slice(turn.indexOf("// 4. The ceiling is checked"), turn.indexOf("const modelFailure"))).toContain("handoff_at");
  });

  it("esgotar as tentativas não vira pessoa: resposta segura e e-mail de aviso", () => {
    expect(turn).not.toContain("nenhuma reescrita passou");
    expect(turn).toContain('status: notifyOrder || extraNotify || (fallbackReason !== null && fallbackIsGeneric) ? "handoff"');
  });

  it("nenhuma linha fixa promete retorno de pessoa", () => {
    const fixed = [offerFallbackMessage(config), kitLimitReply(3), kitLimitReply(1)];
    for (const line of fixed) {
      expect(line).not.toMatch(/retorn|te chama|alguém do time|uma pessoa/i);
      expect(blocked(line, "auto"), line).toEqual([]);
    }
  });

  it("o varejo de kits: mais peças que o kit maior recebe o limite, não uma pessoa", () => {
    expect(turn).not.toContain("eu chamo uma pessoa do time");
    expect(kitLimitReply(3)).toBe("Por aqui eu fecho pedidos de até 3 peças 💛 Quer levar 3 peças?");
    expect(build()).not.toMatch(/uma pessoa do\s+time monta/);
  });
});

describe("pós-venda sem pedido (teste real 2026-10-13: 'moro sozinha, não tenho quem receber')", () => {
  const post = { post_sale: true, wants_cancel: false, asks_human: false } as unknown as Interpretation;
  it("só o link no chat não é pós-venda; um pedido de verdade é", () => {
    expect(handoffFor(post, "Mas eu moro sozinha moça, nao tenho quem receber por mim", true, true)).toBeNull();
    expect(handoffFor(post, "Mas eu moro sozinha moça, nao tenho quem receber por mim", true, false)).toBe("post_sale");
  });
  it("cancelar só com o link no chat também não é cancelamento (não há pedido a cancelar); com pedido, é", () => {
    const cancel = { ...post, post_sale: false, wants_cancel: true } as Interpretation;
    expect(handoffFor(cancel, "desisti, pode cancelar", true, true)).toBeNull();
    expect(handoffFor(cancel, "quero cancelar", true, false)).toBe("cancel");
  });
});

describe("'Ok' depois do link (teste real 2026-10-13)", () => {
  const link = "Pronto, aqui está o seu link 💛\nhttps://entrega.logzz.com.br/pay/ccm-1-unidade?name=Maria&phone=5511999999999\nLá você completa o endereço.";
  it("o '?' da query do link não é pergunta: o ok fica sem resposta", () => {
    expect(ackGoesUnanswered(true, link, null)).toBe(true);
  });
  it("uma pergunta de verdade, fora do link, continua sendo respondida", () => {
    expect(ackGoesUnanswered(true, `${link}\nFicou alguma dúvida?`, null)).toBe(false);
  });
});

describe("pergunta de parcela e desconto com todas as tentativas vetadas (teste real 2026-10-13)", () => {
  it("a resposta fixa diz o que é verdade e passa na cadeia inteira", () => {
    const text = offerFallbackMessage(config);
    expect(text).toContain(`${config.prices.prepayDiscountPercent}%`);
    expect(blocked(text)).toEqual([]);
  });
  it("o turno a usa antes da resposta segura genérica", () => {
    expect(turn.indexOf("asksOffer ? offerFallbackMessage(CONFIG)")).toBeLessThan(turn.indexOf("fallbackIsGeneric ? SAFE_FALLBACK_REPLY"));
  });
});

describe("gate: oferecer uma pessoa que não vem", () => {
  it.each([
    "Quer que alguém do time te chame pra ajudar?",
    "Quer que alguém do time te chame pra te ajudar com esse segundo pedido?",
    "Se quiser, alguém do time te chama por aqui.",
    "Posso chamar uma pessoa do time, se você preferir.",
    "Posso passar pro nosso time, se quiser.",
  ])("veta: %s", (text) => {
    expect(blocked(text)).toContain("humanity_claim");
  });
  it.each([
    "Eu não posso chamar alguém do time, mas resolvo isso por aqui.",
    "Outra pessoa pode receber e pagar por você nesse dia.",
    "Se quiser, uma amiga te ajuda a escolher o tamanho.",
    "Posso te passar o link agora?",
  ])("passa: %s", (text) => {
    expect(blocked(text)).not.toContain("humanity_claim");
  });
  it("a linha fixa da camada auto não é vetada", () => {
    expect(blocked("Entendo 💛 Por aqui o atendimento é todo comigo, a assistente virtual da Encorpa, e não tenho como te passar pra uma pessoa. Me conta o que você precisa que eu resolvo agora.", "auto")).toEqual([]);
  });
});

describe("R22.2 — cinco tentativas, cada uma sabendo por que as outras caíram", () => {
  const state = (rewritesUsed: number) => ({ remedy: "rewrite" as const, rewritesUsed, spentBrl: 0, ceilingBrl: 1, reasons: ["parcela"], vetoedText: "x", earlierReasons: ["preço 100"] });
  it("quatro reescritas e só então a saída segura", () => {
    expect(MAX_REWRITES).toBe(4);
    expect(decideNext(state(3)).kind).toBe("rewrite");
    expect(decideNext(state(4)).kind).toBe("fallback");
  });
  it("a instrução carrega os motivos de antes e manda conferir as outras regras", () => {
    const instruction = rewriteInstruction(["parcela"], "x", ["preço 100"]);
    expect(instruction).toContain("preço 100");
    expect(instruction).toMatch(/releia as regras/);
    // Negação: a primeira tentativa não inventa histórico.
    expect(rewriteInstruction(["parcela"], "x")).not.toContain("Tentativas anteriores");
  });
});

describe("R21.7 — os dois fatos da entrega estão no prompt", () => {
  it("horário não se escolhe e não vem pelo correio", () => {
    const prompt = build();
    expect(prompt).toContain("Horário não se escolhe");
    expect(prompt).toContain("não vem pelo correio");
  });
});

describe("R21.8 — o rascunho vetado é gravado mascarado e nunca lido de volta", () => {
  it("só o recordTraces escreve o rascunho, nas duas chamadas de modelo da conversa", () => {
    expect(turn).toContain("{ draft: attempt.text, names: nameWords }");
    expect(turn.match(/\{ draft: attempt\.text, names: nameWords \}/g)).toHaveLength(2);
  });
  it("a máscara cobre query do link, e-mail, CPF, CEP, telefone e o nome dela", () => {
    const mask = turn.slice(turn.indexOf("const maskDraft ="), turn.indexOf("return out.slice(0, 700);"));
    for (const token of ["[dados]", "[email]", "[cpf]", "[cep]", "[telefone]", "[nome]"]) expect(mask).toContain(token);
  });
  it("nenhuma leitura de histórico toca gate_traces (o vetado não volta ao modelo)", () => {
    expect(turn.match(/gate_traces/g)?.length).toBeLessThanOrEqual(4); // the table's name in recordTraces and in comments only
    expect(turn).not.toMatch(/db\([^)]*gate_traces\?/);
  });
});

describe("revisão do R22 — laços, prazo e falsos positivos", () => {
  it("o time de terceiros (Logzz, entrega) não é oferta de pessoa da loja", () => {
    for (const text of [
      "Se precisar trocar, a equipe da Logzz te atende pelo 11 99999-9999.",
      "Se precisar de troca, o time da Logzz te ajuda.",
      "Se preferir pagar na entrega, nosso time de entrega fala com você antes.",
    ]) expect(blocked(text), text).not.toContain("humanity_claim");
    // Negação: a oferta da própria loja continua vetada.
    expect(blocked("Se precisar, o time te atende por aqui.")).toContain("humanity_claim");
  });

  it("a mesma frase fixa não se repete: pedido, pessoa e limite de peças pulam a frase se ela foi a última", () => {
    expect(turn).toContain("lastOutbound === ORDER_HANDOFF_REPLY");
    expect(turn).toContain("lastOutbound === HUMAN_HANDOFF_REPLY");
    // Copy v4: the limit is the model's answer; her insisting reads the previous turn's reason.
    expect(turn).toContain('?.[0]?.reason ?? "").includes("mais que o maior kit");');
  });

  it("a resposta do status do pedido também sai para quem pediu uma pessoa", () => {
    expect(turn).toContain('if ((handoffKind === "post_sale" && !asksReturn) || handoffKind === "cancel") {');
    expect(turn).not.toContain('handoffKind === "cancel") && !asksPerson) {');
  });

  it("cinco tentativas cabem no prazo: o laço principal e o draftWith param ao passar do prazo da resposta", () => {
    expect(turn).toContain("outcome.kind === \"rewrite\" && Date.now() >= replyDeadline");
    expect(turn).toContain("if (next.kind !== \"rewrite\" || Date.now() >= deadline) break;");
    // O draftWith também acumula os motivos (R22.2).
    expect(turn).toContain("earlierReasons: earlier,");
  });

  it("o e-mail diz a verdade: conversa parada (teto, provedor) leva silenced; a que continua não", () => {
    expect(turn.match(/silenced: true/g)?.length).toBe(2);
    // §97: a provider failure never silences her (the safe line, or the holding one on a configuration error).
    expect(turn).toContain("      silenced: false,\n      reason,");
    const email = readFileSync("n8n/workflows/turno-da-agente.json", "utf8");
    expect(email).toContain("$json.silenced ?");
  });

  it("o desconto/parcela só pega barganha de verdade: 'às vezes eu suo' e 'aceita pix na entrega?' não", () => {
    const re = turn.match(/const asksOffer = parts\.some\(\(p\) => (\/.*?\/)\.test\(plain\(p\)\)\);/s)?.[1];
    expect(re).toBeDefined();
    const rx = new RegExp(re!.slice(1, re!.lastIndexOf("/")));
    expect(rx.test("parcelam ou fazem por 100 no pix?")).toBe(true);
    expect(rx.test("tem desconto no pix?")).toBe(true);
    expect(rx.test("as vezes eu suo muito, ele esquenta?")).toBe(false);
    expect(rx.test("aceita pix na entrega?")).toBe(false);
  });

  it("a máscara do rascunho cobre nome com acento, telefone com espaços e rua", () => {
    const mask = turn.slice(turn.indexOf("const maskDraft ="), turn.indexOf("return out.slice(0, 700);"));
    expect(mask).toContain("\\p{L}");
    expect(mask).toContain("[endereço]");
    expect(mask).toContain("{8,}");
  });
});
