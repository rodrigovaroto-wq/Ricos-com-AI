import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRICES } from "@/llm/pricing.js";

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
  const alias: Record<string, string> = {
    CONVERSATION_MODEL: "gpt-5.6-luna",
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

  it("não cobra por um modelo que a fonte não conhece", () => {
    const declared = [...source.matchAll(/\[(CONVERSATION_MODEL|CHEAP_MODEL)\]:\s*\{/g)];
    expect(declared).toHaveLength(Object.keys(PRICES).length);
  });
});
