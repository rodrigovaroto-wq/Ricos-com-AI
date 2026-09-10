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
    CHEAP_MODEL: "gemini-3.5-flash-lite",
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
    expect(source).toContain("if (!(error instanceof ModelConfigError))");
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
    expect(source).toContain('fetch("https://api.llama.com/v1/chat/completions"');
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
    const fetchAt = source.indexOf('fetch("https://api.llama.com', muse);
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
    // erro do mesmo jeito que a do Gemini já viajou antes deste cinto existir.
    expect(source).toContain("[GEMINI_KEY, OPENAI_KEY, META_KEY, SERVICE_KEY]");
  });

  it("não cobra por um modelo que a fonte não conhece", () => {
    const declared = [
      ...source.matchAll(/\[(DEFAULT_CONVERSATION_MODEL|CHEAP_MODEL)\]:\s*\{/g),
    ];
    expect(declared).toHaveLength(Object.keys(PRICES).length);
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

  it("as bolhas saem iguais às de splitBubbles, com o atraso de bubbleDelayMs", () => {
    const texto = ["um dois três", "quatro cinco", "seis"].join("\n\n");
    expect(splitBubbles(texto).map((b) => ({ text: b, delayMs: bubbleDelayMs(b) }))).toEqual([
      { text: "um dois três", delayMs: 2400 },
      { text: "quatro cinco", delayMs: 1600 },
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
