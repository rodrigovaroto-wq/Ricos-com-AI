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
    DEFAULT_CONVERSATION_MODEL: "gpt-5.6-luna",
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
    expect(source).toContain('Deno.env.get("CONVERSATION_MODEL") ?? DEFAULT_CONVERSATION_MODEL');
  });

  it("recusa um modelo novo sem preço, no boot e não no meio da conversa", () => {
    expect(source).toContain('Deno.env.get("CONVERSATION_MODEL_PRICE")');
    // O `throw` mora fora de qualquer handler: falha de boot, antes de servir requisição.
    const guard = source.indexOf("if (CONVERSATION_MODEL !== DEFAULT_CONVERSATION_MODEL)");
    expect(guard).toBeGreaterThan(-1);
    expect(source.slice(guard, guard + 600)).toContain("sem CONVERSATION_MODEL_PRICE");
  });

  /**
   * Os dois cintos que a revisão de segurança pediu, e que existem por um caminho de
   * falha invertido: preço absurdo (`Number.MAX_VALUE` é finito e passa na checagem de
   * tipo) transborda para Infinity, `JSON.stringify` grava `null`, a virada seguinte lê
   * zero, e o teto de custo por conversa é rearmado em zero — gasto ilimitado em vez de
   * conversa travada, e `llm_calls.cost_brl` NULL, sem rastro de auditoria.
   */
  it("põe teto no preço vindo do ambiente e cinto no cálculo de custo", () => {
    expect(source).toContain("acima do teto de 1000 USD por 1M tokens");
    expect(source).toContain("if (v > 1_000)");
    expect(source).toContain("if (!Number.isFinite(brl))");
  });

  it("nomeia a variável quando o JSON do preço vem malformado", () => {
    expect(source).toContain("CONVERSATION_MODEL_PRICE não é JSON válido");
  });

  it("não deixa credencial sair em texto de erro", () => {
    expect(source).toContain("const redactKeys =");
    expect(source).toContain("detail: redactKeys(");
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
