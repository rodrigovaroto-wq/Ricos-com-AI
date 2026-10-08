import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRICES } from "@/llm/pricing.js";
import { MS_PER_WORD, bubbleDelayMs, splitBubbles } from "@/agent/pacing.js";

/**
 * The Edge Function ships its own copy of certain modules, because Supabase
 * uploads file contents rather than resolving the repo. A copy that silently drifts
 * from src is the worst of both worlds: tests here proving one thing, production
 * doing another. This test fails the moment any of them differ.
 */
const mirrored = [
  ["src/agent/guardrails.ts", "supabase/functions/turn/guardrails.ts"],
  ["src/agent/followups.ts", "supabase/functions/turn/followups.ts"],
  ["src/agent/sizing.ts", "supabase/functions/turn/sizing.ts"],
  ["src/agent/retry.ts", "supabase/functions/turn/retry.ts"],
  ["src/agent/address.ts", "supabase/functions/turn/address.ts"],
  ["src/agent/identity.ts", "supabase/functions/turn/identity.ts"],
  ["src/agent/coinzz.ts", "supabase/functions/turn/coinzz.ts"],
  ["src/agent/availability.ts", "supabase/functions/turn/availability.ts"],
  ["src/agent/state-machine.ts", "supabase/functions/turn/state-machine.ts"],
  ["src/agent/prompt.ts", "supabase/functions/turn/prompt.ts"],
  ["src/agent/interpret.ts", "supabase/functions/turn/interpret.ts"],
  ["src/agent/opt-in.ts", "supabase/functions/turn/opt-in.ts"],
  ["src/agent/agent-version.ts", "supabase/functions/turn/agent-version.ts"],
  ["src/channel/whatsapp.ts", "supabase/functions/whatsapp/whatsapp.ts"],
  ["src/channel/inbound-signature.ts", "supabase/functions/whatsapp/inbound-signature.ts"],
  ["src/channel/inbound-signature.ts", "supabase/functions/turn/inbound-signature.ts"],
] as const;

describe("cópias na Edge Function", () => {
  it.each(mirrored)("%s é byte a byte igual a %s", (source, deployed) => {
    expect(readFileSync(deployed, "utf-8")).toBe(readFileSync(source, "utf-8"));
  });
});

/**
 * A quinta cópia, que não é um arquivo: a Edge Function declara o próprio `PRICES`
 * inline, porque o custo é calculado lá dentro. Nenhuma das duas tabelas sabia da
 * outra — mudar o preço em `src/llm/pricing.ts` deixava a produção cobrando o preço
 * antigo, e todo custo gravado a partir dali fica incomparável com o anterior. Este
 * teste lê o literal da função e compara com a fonte.
 */
describe("tabela de preços da Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");

  const priced = (model: string) => {
    const block = source.match(
      new RegExp(`\\[${model}\\]:\\s*\\{([^}]*)\\}`),
    )?.[1];
    if (!block) throw new Error(`sem entrada de preço para ${model} em index.ts`);
    const field = (name: string) => {
      const found = block.match(new RegExp(`\\b${name}:\\s*([\\d.]+)`));
      return found ? Number(found[1]) : undefined;
    };
    return { in: field("in"), out: field("out"), cached: field("cached") };
  };

  // Os nomes das constantes na função, resolvidos aqui para o modelo que representam.
  // `CONVERSATION_MODEL` deixou de ser literal em 2026-09-10 — lê do ambiente, com o
  // padrão em `DEFAULT_CONVERSATION_MODEL`. É o padrão que a tabela precifica, e é ele
  // que este teste prende à fonte.
  const alias: Record<string, string> = {
    DEFAULT_CONVERSATION_MODEL: "muse-spark-1.3",
  };

  it.each(Object.entries(alias))("%s cobra o mesmo que src/llm/pricing.ts", (constant, model) => {
    expect(source).toContain(`const ${constant} = "${model}"`);
    const expected = PRICES[model]!;
    expect(priced(constant)).toEqual({
      in: expected.inputUsdPerM,
      out: expected.outputUsdPerM,
      cached: expected.cachedInputUsdPerM,
    });
  });

  /**
   * O modelo da conversa é configuração, não arquitetura (`CLAUDE.md`). Enquanto foi
   * constante no código não existiu plano B para a queda da OpenAI sem deploy — e em
   * 2026-09-09 a cota esgotou por 20 horas com tráfego pago rodando. Este teste prende
   * as três metades do conserto: lê do ambiente, cai no padrão quando ausente, e recusa
   * um modelo novo que venha sem preço.
   */
  it("lê o modelo da conversa do ambiente, com o padrão de sempre", () => {
    expect(source).toContain('Deno.env.get("CONVERSATION_MODEL")');
    expect(source).toContain("const DEFAULT_CONVERSATION_MODEL");
  });

  it("recusa um modelo novo sem preço, antes de gastar token", () => {
    expect(source).toContain('Deno.env.get("CONVERSATION_MODEL_PRICE")');
    const guard = source.indexOf("if (CONVERSATION_MODEL !== DEFAULT_CONVERSATION_MODEL)");
    expect(guard).toBeGreaterThan(-1);
    expect(source).toContain("sem CONVERSATION_MODEL_PRICE");
    // A recusa é levantada dentro de `callLuna`, antes do `fetch` — não no boot, que
    // levaria o webhook de venda e o sweep do cron junto, e não depois da chamada, que
    // já teria gasto o token.
    const luna = source.indexOf("const callLuna = async (");
    const fetchAt = source.indexOf('fetch("https://api.openai.com', luna);
    const throwAt = source.indexOf("throw new ModelConfigError(MODEL_CONFIG_ERROR)", luna);
    expect(throwAt).toBeGreaterThan(luna);
    expect(throwAt).toBeLessThan(fetchAt);
  });

  /**
   * Os dois cintos que a revisão de segurança pediu, e que existem por um caminho de
   * falha invertido: preço absurdo (`Number.MAX_VALUE` é finito e passa na checagem de
   * tipo) transborda para Infinity, `JSON.stringify` grava `null`, a virada seguinte lê
   * zero, e o teto de custo por conversa é rearmado em zero — gasto ilimitado em vez de
   * conversa travada, e `llm_calls.cost_brl` NULL, sem rastro de auditoria.
   */
  it("põe teto no preço vindo do ambiente e cinto no cálculo de custo", () => {
    // Apertado de 1000 para 100 em 2026-09-10: duas ordens de grandeza acima do modelo
    // mais caro que este funil consideraria (Muse Spark 1.3 é 1,25 / 4,25).
    expect(source).toContain("acima do teto de 100 USD por 1M tokens");
    expect(source).toContain("if (v > 100)");
    expect(source).not.toContain("if (v > 1_000)");
    expect(source).toContain("if (!Number.isFinite(brl))");
  });

  it("nomeia a variável quando o JSON do preço vem malformado", () => {
    expect(source).toContain("CONVERSATION_MODEL_PRICE inválido");
    // `CONVERSATION_MODEL_PRICE=null` é JSON válido e o `as` não protege dele.
    expect(source).toContain("esperado um objeto, veio");
  });

  /**
   * `handoff_at` é escrito e nunca limpo: o lead que o recebe sai da mão da agente para
   * sempre. Um erro de configuração do operador não é sobre a cliente, e marcá-la torna
   * a troca de modelo **irreversível** — desfazer a variável não desfaz o dano. Era o
   * que acontecia com todo lead que escreveu durante as 20 horas de cota esgotada.
   */
  it("erro de configuração não tranca o lead fora da agente", () => {
    expect(source).toContain("class ModelConfigError extends Error");
    expect(source).toContain("if (MODEL_CONFIG_ERROR) throw new ModelConfigError(MODEL_CONFIG_ERROR)");
    expect(source).toContain("reachable = error instanceof ModelConfigError) => {");
    expect(source).toContain("    if (!reachable) {\n      await db(`leads?id=eq.${lead.id}`, {");
  });

  /**
   * O knob troca de modelo **dentro** de uma das duas APIs que esta função implementa —
   * `callLuna` (OpenAI-compatível) e, desde 2026-09-10, `callMuse` (Meta Llama API) — e
   * não de provedor livre. Apontá-lo para um nome do Gemini mandaria aquele nome para um
   * host que não o serve, e a descoberta seria uma cliente por vez.
   */
  it("recusa nome de modelo de provedor que esta função não fala", () => {
    expect(source).toContain("não é servido por nenhuma das duas APIs");
    expect(source).toContain("que esta função fala (OpenAI-compatível para Luna, Meta Llama API para Muse)");
    expect(source).toContain("^(gemini|claude|grok|qwen|llama|mistral|command|deepseek)");
    // `muse` saiu da lista de recusados — é o família que ganhou implementação.
    expect(source).not.toMatch(/\^\([^)]*\bmuse\b[^)]*\)/);
  });

  /**
   * O prefixo `muse` passou a ser servido em 2026-09-10 — `callMuse` fala Meta Llama API.
   * Este teste prova as duas metades: o nome é aceito (não cai no `foreign`), e a chamada
   * de rede vai para o host certo, com a chave certa.
   */
  it("aceita modelos muse e chama o host da Meta, não o da OpenAI", () => {
    expect(source).toContain("const MUSE_FAMILY = /^muse/i;");
    expect(source).toContain("const callMuse = async (");
    expect(source).toContain('fetch("https://api.meta.ai/v1/chat/completions"');
    expect(source).toContain("META_KEY");
  });

  /**
   * A recusa por falta de preço, e a proteção contra gastar token antes dela, valem para
   * `callMuse` tanto quanto para `callLuna` — a guarda foi escrita uma vez e teria sido
   * fácil esquecer de repetir na segunda função.
   */
  it("recusa Muse sem preço, antes de gastar token — mesma guarda de callLuna", () => {
    const muse = source.indexOf("const callMuse = async (");
    expect(muse).toBeGreaterThan(-1);
    const fetchAt = source.indexOf('fetch("https://api.meta.ai', muse);
    const throwAt = source.indexOf("throw new ModelConfigError(MODEL_CONFIG_ERROR)", muse);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(throwAt).toBeGreaterThan(muse);
    expect(throwAt).toBeLessThan(fetchAt);
  });

  /**
   * Um erro de configuração não pode derrubar o webhook de venda nem o sweep do cron —
   * os três caminhos vivem no mesmo isolate, e o sweep não tem corte de obsolescência.
   */
  it("não derruba a função inteira por causa da conversa", () => {
    expect(source).toContain("let MODEL_CONFIG_ERROR: string | null = null");
    // A variável vazia ou com espaço sobrando cai no padrão em vez de virar modelo novo.
    expect(source).toContain('(Deno.env.get("CONVERSATION_MODEL") ?? "").trim() || DEFAULT_CONVERSATION_MODEL');
  });

  it("não deixa credencial sair em texto de erro", () => {
    expect(source).toContain("const redactKeys =");
    expect(source).toContain("detail: redactKeys(");
    // META_KEY entrou com callMuse em 2026-09-10 — a chave da Meta viajaria em texto de
    // erro do mesmo jeito que a do Gemini já viajou antes deste cinto existir. A do
    // Gemini saiu com a chamada de intenção em 2026-09-23 (R12.1).
    expect(source).toContain("[OPENAI_KEY, META_KEY, SERVICE_KEY]");
  });

  /**
   * Desde 2026-09-23 a tabela inline só precifica o modelo padrão da conversa: a
   * `-contributor` entra por `CONVERSATION_MODEL_PRICE`, e `src/llm/pricing.ts` guarda
   * também o que só o ferramental de dev chama. Toda entrada inline tem de existir lá.
   */
  it("não cobra por um modelo que a fonte não conhece", () => {
    const declared = [...source.matchAll(/^\s+\[([A-Z_]+)\]:\s*\{/gm)].map((m) => m[1]);
    expect(declared).toEqual(["DEFAULT_CONVERSATION_MODEL"]);
    for (const constant of declared) expect(PRICES[alias[constant!]!]).toBeDefined();
  });

  it("o turno não chama mais o Gemini (R12.1, só Meta)", () => {
    expect(source).not.toContain("generativelanguage.googleapis.com");
    expect(source).not.toContain("callGemini");
    expect(source).not.toContain("GEMINI_API_KEY");
    expect(source).not.toMatch(/intent: intent/);
  });
});

/**
 * A sexta cópia, também inline: o ritmo humano. A Edge Function declara o próprio
 * `MS_PER_WORD` e as duas funções de bolha porque é ela quem monta a resposta que o
 * canal vai tocar — `src/agent/pacing.ts` é a fonte, e sem este teste as duas
 * poderiam divergir do mesmo jeito que a tabela de preços divergiu.
 */
describe("ritmo humano da Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");

  it("MS_PER_WORD é o mesmo de src/agent/pacing.ts", () => {
    expect(source).toContain(`const MS_PER_WORD = ${MS_PER_WORD};`);
  });

  /**
   * As bolhas de até ~30 palavras (R13.4) são código de verdade, não uma constante: a
   * cópia inline tem de ser o mesmo texto, da declaração do limite até antes do `export`.
   */
  it("splitBubbles inline é byte a byte o de src/agent/pacing.ts", () => {
    const pacing = readFileSync("src/agent/pacing.ts", "utf-8");
    const start = pacing.indexOf("const MAX_BUBBLE_WORDS = ");
    const end = pacing.indexOf("export { MAX_BUBBLE_WORDS");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(source).toContain(pacing.slice(start, end).trimEnd());
  });

  it("as bolhas saem iguais às de splitBubbles, com o atraso de bubbleDelayMs", () => {
    const texto = ["um dois três", "quatro cinco", "seis"].join("\n\n");
    expect(splitBubbles(texto).map((b) => ({ text: b, delayMs: bubbleDelayMs(b) }))).toEqual([
      { text: "um dois três", delayMs: 1680 },
      { text: "quatro cinco", delayMs: 1120 },
      { text: "seis", delayMs: 1000 },
    ]);
  });

  /**
   * Uma resposta que carrega `reply` e não carrega `bubbles` é uma resposta que o canal
   * vai mandar de uma vez só, sem ritmo nenhum — e ninguém percebe, porque o texto está
   * lá. Por isso a checagem é sobre TODA ocorrência, uma por uma, e não sobre a primeira.
   */
  it("toda resposta com texto devolve bolhas na linha seguinte", () => {
    const linhas = source.split("\n");
    const comReply = linhas
      .map((linha, i) => ({ linha, i }))
      .filter(({ linha }) => /^\s+reply: /.test(linha));
    expect(comReply.length).toBeGreaterThan(0);
    for (const { linha, i } of comReply) {
      expect(`${linha} -> ${linhas[i + 1]}`).toContain("bubbles: paced(");
    }
  });
});

/**
 * A rodada 13 (2026-09-24) no código que a produção executa. `index.ts` é Deno e não pode
 * ser importado aqui; estas asserções leem o fonte e prendem o que nenhum teste de
 * módulo alcança.
 */
describe("rodada 13 na Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");

  it("o intérprete é gravado em llm_calls com o próprio propósito, e roda antes da resposta", () => {
    expect(source).toContain('recordCall(conversation.id, "interpret", conversationProvider, CONVERSATION_MODEL, reading)');
    expect(source).toContain("INTERPRET_MAX_COMPLETION_TOKENS");
    expect(source.indexOf("readInterpretation(reading.text)")).toBeLessThan(source.indexOf("while (true) {"));
  });

  it("as linhas de handoff saem pela camada auto, e só pelo handOff", () => {
    const start = source.indexOf("const handOff = async (");
    const end = source.indexOf("const optOutFarewell = async (");
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).toContain('layer: "auto"');
    expect(source.slice(start, end)).toContain("...notification(lead, conversation)");
    for (const m of source.matchAll(/\b(HUMAN_HANDOFF_REPLY|ORDER_HANDOFF_REPLY)\b/g)) {
      const line = source.slice(source.lastIndexOf("\n", m.index) + 1, source.indexOf("\n", m.index));
      expect(line).toMatch(/^\s+(HUMAN_HANDOFF_REPLY,|ORDER_HANDOFF_REPLY,|return await handOff\(|handoffKind ===)/);
    }
  });

  it("só \"block\" veta: nenhum caminho lê `allowed`, que um veredito brando pode não limpar", () => {
    expect(source).toContain('const passed = (result: { traces: ReadonlyArray<{ verdict: string }> }): boolean =>');
    expect(source).not.toMatch(/\.allowed\b/);
  });

  it("falha de rede agenda nova tentativa pela varredura antes de qualquer handoff", () => {
    expect(source).toContain('const RETRY_TURN_KIND = "retry_turn";');
    expect(source).toContain('if (!isRetry || afterRetryFailure(timedOut, retries) === "reschedule") {');
    expect(source).toContain("if (row.kind === RETRY_TURN_KIND) {");
    // A nova tentativa só é marcada pela varredura, nunca pelo corpo que o n8n posta.
    expect(source).toContain("{ retry: ticket }");
    expect(source).not.toMatch(/payload\.retry/);
    expect(source).toContain("const RETRY_TURNS_PER_SWEEP = 1;");
  });

  // Code review, 2026-09-24: a nova tentativa respondia a mensagem MAIS RECENTE, que um
  // turno novo podia já estar respondendo — resposta em dobro.
  it("a nova tentativa responde só a mensagem que falhou, e um turno novo a cancela", () => {
    expect(source).toContain("retryIsMoot(internal.retry!.inboundId, latest?.[0] ?? null, conversation.last_outbound_at ?? null)");
    // E de novo logo antes de mandar: a resposta final e a linha fixa passam pelo mesmo teste.
    const finalInsert = source.indexOf("const outbound = (");
    const lastCheck = source.lastIndexOf("const gaveUp = await lateGuard(rewritesUsed, body);", finalInsert);
    expect(lastCheck).toBeGreaterThan(-1);
    expect(finalInsert - lastCheck).toBeLessThan(200);
    expect(source).toContain("const gaveUp = await lateGuard(0, text);");
    expect(source).toContain("body: JSON.stringify(ticket),");
    expect(source).toContain("`followups?conversation_id=eq.${conversation.id}&kind=eq.${RETRY_TURN_KIND}&status=eq.scheduled`");
  });

  it("429 é falha passageira, não handoff", () => {
    expect(source.match(/response\.status >= 500 \|\| response\.status === 429/g)?.length).toBe(2);
  });

  it("o prazo da resposta conta do fim do intérprete, e a região tem tempo-limite", () => {
    expect(source).toContain("replyBudgetFrom + (isRetry ? RETRY_TURN_BUDGET_MS : IN_CALL_RETRY_BUDGET_MS)");
    expect(source).toContain("isRetry || isRevise ? RETRY_INTERPRET_TIMEOUT_MS : INTERPRET_TIMEOUT_MS");
    expect(source).toContain("signal: AbortSignal.timeout(isRetry || isRevise ? RETRY_REGION_TIMEOUT_MS : REGION_TIMEOUT_MS)");
  });

  // Grafo §60 (operador, 2026-10-06): a escada fixa saiu; toda mensagem vai ao modelo, e a
  // pergunta dela no lugar do tamanho continua respondida primeiro.
  it("a escada do \"não entendi\" não existe mais no turno", () => {
    for (const gone of ["decideClarify", "CLARIFY_SIZE_REPLIES", "escada do tamanho", "não entendi, qual o tamanho"]) {
      expect(source, gone).not.toContain(gone);
    }
    expect(source).toContain("lastAskedSize && stated === null && interpretation.pending_answer === \"other_question\"");
  });

  it("cancelar e pós-venda só vão para o humano com pedido ou link já enviado", () => {
    expect(source).toContain("orders?lead_id=eq.${lead.id}&select=id&limit=1");
    expect(source).toContain('handoffFor(interpretation, spoken(inbound.body ?? ""), orderContext)');
  });

  it("a pergunta fixa de e-mail não existe mais em lugar nenhum do turno", () => {
    for (const file of ["supabase/functions/turn/index.ts", "supabase/functions/turn/identity.ts"]) {
      expect(readFileSync(file, "utf-8")).not.toContain("Qual é o seu e-mail?");
    }
  });
});

/** Persona round 3 (2026-09-24), no código que a produção executa. */
describe("rodada 3 na Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");

  it("a região sem resposta chega ao gate, e a diretiva não afirma cobertura", () => {
    expect(source).toContain("regionKnown: region !== null,");
    expect(source).toContain("nunca diga que chega ou que atende a cidade ou o CEP dela");
  });

  // Grafo §63: a diretiva da região manda ao exemplo do prompt (`noCodMessage`), que lê o frete com
  // o mesmo `=== true` do gate (tests/prompt.test.ts); "saída boa" saiu.
  it("sem pagamento na entrega, a diretiva diz a verdade de hoje — nada de frete grátis", () => {
    expect(source).not.toContain("frete grátis, e ainda sai mais barato");
    expect(source).not.toContain("saída boa");
    expect(source).toContain("ali a transportadora ainda não tem pagamento na entrega");
  });

  it("o nome vai no link em caixa de nome, e o guardado fica como ela escreveu", () => {
    expect(source).toContain("name: titleCaseName(identityDraft.name)");
    expect(source.match(/buildPrefilledCheckoutLink\(linkCustomer, linkPath/g)?.length).toBe(2);
  });

  it("depois do link, nada de pedir e-mail; e a instrução do link é uma frase só", () => {
    expect(source).toContain("O link do pedido já foi enviado nesta conversa: não peça e-mail, nome nem CPF");
    expect(source).not.toContain("são três dias");
    expect(source).toContain("UMA frase curta e natural");
  });

  it("compra passada dita por ela conta como pedido; despedida e decisão são lidas pelo código", () => {
    expect(source).toContain('statesPastPurchase(spoken(inbound.body ?? "")) ||');
    expect(source).toContain("statesPastPurchase(m.body ?? \"\", false)");
    expect(source).toContain('if (goodbyeParks(parts[parts.length - 1] ?? "", interpretation)) interpretation = { ...interpretation, wants_to_think: true };');
    // A decisão é lida antes da despedida, que a consulta.
    expect(source.indexOf("if (decidesToBuy(")).toBeLessThan(source.indexOf("if (goodbyeParks("));
    expect(source).toContain("if (decided !== null) interpretation = { ...interpretation, wants_to_buy: decided };");
  });
});

/** O registro de mudanças (docs/agente-ia/08-mudancas), no código que a produção executa. */
describe("M-03 na Edge Function", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");

  it("o link recente bloqueia o reenvio, na resposta do modelo e no \"vou pensar\"", () => {
    // Só o checkout deste caminho conta, e o pedido explícito do link passa (code review, 2026-09-24).
    expect(source).toContain('const pathBase = kitUrl ?? (linkPath === "cod" ? CONFIG.checkout?.codUrl : CONFIG.checkout?.prepayUrl);');
    // Grafo §65: the newest link anywhere in the conversation, not the last three messages.
    expect(source).toContain('const linkJustSent = linkHeldBack(linkHistory, CHECKOUT_BASES, pathBase, spoken(inbound.body ?? ""));');
    expect(source).toContain("const linkNow = !linkJustSent && linkReady && !withdrew;");
    expect(source).toContain("thinkLink = linkNow && !(linkInChat && closesConversation(spoken(inbound.body ?? \"\")))");
  });
});

describe("WA-1 na Edge Function: a régua respeita a janela de 24h (2026-09-25)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("decide texto ou template antes de gravar e antes de enviar", () => {
    const decide = source.indexOf("const delivery = deliveryFor(kind, renderCtx, lastInbound);");
    const blocked = source.indexOf('if (delivery === null || delivery.via === "blocked") {');
    const record = source.indexOf("await db(\"messages\"", blocked);
    expect(decide).toBeGreaterThan(-1);
    expect(blocked).toBeGreaterThan(decide);
    expect(record).toBeGreaterThan(blocked);
    expect(source).toContain("conversations(id,lead_id,stage,last_inbound_at,leads(");
  });
});

describe("a porta do turno: selo, papel e janela (revisão de segurança, 2026-09-25)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("mensagem sem o selo é recusada antes de virar turno", () => {
    const seal = source.indexOf("!(await sealIsValid(");
    const dedupe = source.indexOf("// 1. Idempotency");
    expect(seal).toBeGreaterThan(-1);
    expect(seal).toBeLessThan(dedupe);
    expect(source).toContain('    signingSecret !== "" &&\n    !isRetry &&\n    !isRevise &&\n    !(await sealIsValid(');
  });
  it("com TURN_REQUIRE_SERVICE_ROLE, a chave pública não abre a função", () => {
    expect(source).toContain('Deno.env.get("TURN_REQUIRE_SERVICE_ROLE") === "true" && callerRole(request) !== "service_role"');
  });
  it("a janela de 24h começa na mensagem dela, não no fim do turno nem na retomada", () => {
    const writes = source.match(/last_inbound_at:/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(source).toContain("body: JSON.stringify({ last_inbound_at: inboundAt.toISOString() }),");
  });
  it("a resposta diz se a mensagem veio selada — é o único sinal para o n8n enviar", () => {
    expect(source).toContain("json(response.status, { ...out, sealed })");
  });
  it("a função do turno nunca é publicada sem a verificação da chave (callerRole confia nela)", () => {
    const places = [".github/workflows/deploy-hermes.yml", "docs/operacao/whatsapp-cloud-api.md", "HANDOFF.md"];
    for (const file of places) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (/functions deploy turn\b/.test(line)) expect({ file, line }).toEqual({ file, line: line.replace("--no-verify-jwt", "") });
      }
    }
  });
  it("nova tentativa fora da janela vai para uma pessoa, não sai como texto", () => {
    expect(source).toContain("if (!windowIsOpen(new Date(), retryInbound)) {");
  });
});

describe("H-2 na Edge Function (2026-09-25)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("preço inventado desliga a decisão de compra, depois da leitura determinística", () => {
    const decide = source.indexOf("if (decided !== null) interpretation");
    const bargain = source.indexOf(
      'if (namesOwnPrice(spoken(inbound.body ?? ""), shopPrices, shopPercents)) interpretation = { ...interpretation, wants_to_buy: false };',
    );
    expect(decide).toBeGreaterThan(-1);
    expect(bargain).toBeGreaterThan(decide);
  });
  it("o link leva a linha dos fatos ligados, e o registro do turno a guarda", () => {
    expect(source).toContain("const linkFact = linkFactLine(CONFIG, linkPath, units > 1 ? units : 1);");
    expect(source).toContain('fallbackReason ?? (checkoutUrl && linkFact && replyText.includes(checkoutUrl) ? `link — ${linkFact}` : null),');
  });
});

describe("kits na Edge Function (2026-09-25)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("a quantidade escolhe o link do kit, e mais que o maior kit vai para uma pessoa", () => {
    expect(source).toContain("const quantity = quantityOf(spoken(inbound.body ?? \"\"), interpretation);");
    expect(source).toContain("if (units > maxUnits) {");
    expect(source).toContain("kits.find((k) => k.path === linkPath && k.units === units)?.checkoutUrl");
    expect(source.match(/buildPrefilledCheckoutLink\(linkCustomer, linkPath, linkCheckout\)/g)).toHaveLength(2);
  });
  it("com mais de uma peça, cada tamanho antes do link", () => {
    expect(source).toContain("const sizeKnown = units > 1 ? unitSizes.length >= units");
  });
});

describe("kits: revisão de código (2026-09-25)", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("a nova tentativa não reaplica os tamanhos; a compra zera o kit", () => {
    // The retry reads the clock, not the content: merged after the message arrived = replay.
    expect(source).toContain("saidSizes.length < units &&\n    batchFrom !== null &&");
    // Every turn that uses the kit renews its clock.
    expect(source).toContain("  if (quantity || units > 1) {\n    await db(`leads?id=eq.${lead.id}`, {");
    expect(source).toContain("batchFrom = unanswered[0]?.created_at ?? null;");
    expect(source).toContain("replayed ? [] : saidSizes,");
    expect(source).toContain("saysOwnSize(spoken(inbound.body");
    // An abandoned kit expires by time (nothing closes a conversation), and every write stamps it.
    expect(source).toContain("const kitStale = !Number.isFinite(unitsAt) || Date.now() - unitsAt > KIT_MEMORY_MS;");
    expect(source).toContain("const units: number = quantity?.units ?? (kitStale ? null : (lead.units as number | null)) ?? 1;");
    expect(source).toContain("const storedSizes = kitStale ? [] : ((lead.unit_sizes as string[] | null) ?? []);");
    expect(source).toContain("units_at: new Date().toISOString(),");
    expect(readFileSync("supabase/migrations/0011_units_at.sql", "utf8")).toContain("add column if not exists units_at timestamptz");
    expect(source).toContain("interpretation.unit_pants.map(sizeFromDressSize)");
    expect(source).toContain('body: JSON.stringify({ units: null, unit_sizes: null, payment_choice: null, payment_choice_at: null }),');
    // A choice is stored only from a choice, and expires.
    expect(source).toContain("if (choiceToStore) {");
    expect(source).toContain("Number.isFinite(choiceAt) && Date.now() - choiceAt <= KIT_MEMORY_MS");
    // The ruler speaks of the order, and a deferred reply is re-gated with the kit and path.
    expect(source).toContain("orders?lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method,status,scheduled_for&order=created_at.desc&limit=1");
    expect(source).toContain("      paymentPath: touchPath,\n      units: touchUnits,");
    expect(source).toContain("...(order && Number(order.amount_brl) > 0 ? { amountBrl: Number(order.amount_brl) } : {}),");
    // A goodbye after the link is in the chat does not resend it.
    expect(source).toContain("thinkLink = linkNow && !(linkInChat && closesConversation(spoken(inbound.body ?? \"\")))");
    // O10: the sale webhook refuses a forged sale when the secret is set.
    expect(source).toContain('if (saleToken !== "" && !sameSecret(String(payload.token ?? ""), saleToken)) {');
    expect(source).toContain('return json(401, { error: "token do webhook de venda inválido" });');
    // The gate knows the pieces in play.
    expect(source).toContain("      paymentPath: linkPath,\n      // The pieces in play: a kit price needs the kit, a 1-piece price the single piece.\n      units,");
    // The path she chose holds across turns.
    expect(source).toContain("const linkPath = linkPathFor(paymentChoice, knownRegion);");
    // A failed lookup this turn falls back to the region stored on the lead (independent review, finding 8).
    expect(source).toContain("region ?? (codUnavailable ? { cod: false, sameDay: false } : null);");
    expect(source).toContain("sizeDirectiveFor(stated, lead.size ?? null, knownRegion, checkoutUrl !== null)");
    expect(source).toContain("const paymentChoice = (agreedOnly ? null : interpretation.payment_choice) ?? choiceToStore ?? storedChoice;");
  });
  it("no link do kit, as instruções de tamanho usam os tamanhos do kit", () => {
    expect(source).toContain('units > 1 ? unitSizes.join(" e ") : stated?.size ?? lead.size ?? null,');
    expect(source).toContain("units > 1 ? null : sizeDirectiveFor(");
    expect(source).toContain("Lá no checkout você escolhe o tamanho de cada peça:");
    expect(source).not.toMatch(/complemento/i);
  });
});
