/**
 * Mutation test of the guards themselves: puts each historical bug back, in a throwaway git
 * worktree, and requires the guard written for it to FAIL. A guard that stays green with
 * its own bug reinstated protects nothing — this is how "fixed at the origin" is proved,
 * not asserted.
 *
 *   pnpm verificar:guardas            # every mutation
 *   pnpm verificar:guardas M-05 n8n   # only the named ones
 *
 * Each mutation names: the file it breaks, the exact text it swaps back, and the command
 * that must fail. Exit 1 if any mutation survives (its guard stayed green).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Mutation {
  id: string;
  bug: string;
  files: string[];
  from: string;
  to: string;
  guard: string[];
}

const MUTATIONS: Mutation[] = [
  {
    id: "M-05",
    bug: 'afrouxamento: "tiro … dúvida" removido mesmo com concessão depois (1ª versão da M-05)',
    files: ["src/agent/guardrails.ts"],
    from: "(?![^.!?]{0,20}\\b(?:um\\s+pou(?:c|qu)\\w+|mais|pra\\s+voce|para\\s+voce)\\b)",
    to: "(?![\\s,]*\\b(?:e|mais)\\b)",
    guard: ["pnpm", "-s", "dev:gates", "--base=HEAD", "--fail-on-loosen"],
  },
  {
    id: "pouquinho",
    bug: '"Eu tiro um pouquinho." passava: pouc\\w+ não casa "pouquinho"',
    files: ["src/agent/guardrails.ts"],
    from: "(um\\s+pou(?:c|qu)\\w+|mais|pra\\s+voce)",
    to: "(um\\s+pouc\\w+|mais|pra\\s+voce)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/change-registry.test.ts"],
  },
  {
    id: "M-07-numero",
    bug: "qualquer número vira garantia (a regra por contexto, antes da regra do número)",
    files: ["src/agent/guardrails.ts"],
    from: "if (days === ctx.config.delivery.warrantyDays) {",
    to: "if (true) {",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "M-07-recusa",
    bug: 'a recusa larga liberava "não tem como passar de 2 dias"',
    files: ["src/agent/guardrails.ts"],
    // The whole regex as it was: the denial governing any of these verbs, with anything after.
    from: "(?:(?:consigo|conseguimos|posso|podemos|da\\s+pra|tem\\s+como)\\s+)?(?:te\\s+|lhe\\s+)?(?:garant\\w*|promet\\w*)\\s+(?:que\\s+(?:chegue|chega|receba|recebe)\\s+(?:em\\s+)?(?:ate\\s+)?)?$/",
    to: "(?:\\w+\\s+){0,2}?(?:garant\\w*|promet\\w*|consig\\w*|posso|podemos|da\\s+pra|tem\\s+como|sei\\s+se)\\b[^,;:]*$/",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "O-04",
    bug: 'a régua chamando a Edge Function com a credencial "Gemini API"',
    files: ["n8n/workflows/relogio-da-regua.json"],
    from: '"name": "Supabase service_role"',
    to: '"name": "Gemini API"',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
  {
    id: "neverError",
    bug: "neverError escondendo o 401 como execução verde",
    files: ["n8n/workflows/relogio-da-regua.json"],
    from: '"neverError": false',
    to: '"neverError": true',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
  {
    id: "espelho",
    bug: "o gate de produção diverge do repositório",
    files: ["supabase/functions/turn/guardrails.ts"],
    from: 'name: "price_promise",',
    to: 'name: "price_promise", // drift',
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "provedor-5xx",
    bug: 'o provedor parseia a página de erro 504 como JSON ("Unexpected token u")',
    files: ["src/llm/providers/http.ts"],
    from: "const transient = response.status >= 500 || response.status === 429;",
    to: "const transient = false;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/provider-http.test.ts"],
  },
  {
    id: "5.8",
    bug: "o webhook de venda não escreve o estágio (o funil parava em pedido_criado)",
    files: ["supabase/functions/turn/index.ts"],
    from: 'if (reached) await persistStage(conversation.id, (conversation.stage as Stage | null) ?? "novo", reached);',
    to: "void reached;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/order-stage.test.ts"],
  },
  {
    id: "hermes-trecho",
    bug: "proposta do Hermes com trecho inventado passando pela validação",
    files: ["src/dev/hermes-core.ts"],
    from: "else if (!e?.trecho || !norm(text).includes(norm(e.trecho)))",
    to: "else if (false)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/hermes-core.test.ts"],
  },
  {
    id: "hermes-lgpd",
    bug: "CPF e telefone saindo para o modelo sem máscara",
    files: ["src/dev/hermes-core.ts"],
    from: '.replace(/\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b/g, "[cpf]")',
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/hermes-core.test.ts"],
  },
  {
    id: "kit-preco",
    bug: "qualquer preço de kit passa (o gate não lê os kits do config)",
    files: ["src/agent/guardrails.ts"],
    from: "...kits.map((k) => k.priceBrl)]);",
    to: "...kits.map((k) => k.priceBrl), 220]);",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-quantidade",
    bug: "quantidade inventada pelo modelo troca o link por um kit que ela não pediu",
    files: ["src/agent/interpret.ts"],
    from: "i.units !== null && i.units > 1 && !QUANTITY_CUE.test(text) && !namesCount(text, i.units) ? null : i.units",
    to: "i.units",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "apto-12",
    bug: '"Apto 12, G" perdia o tamanho (números descartados no complemento)',
    files: ["n8n/workflows/venda-confirmada.json"],
    from: "complemento.split(/[^A-Z0-9]+/)",
    to: "complemento.split(/[^A-Z]+/)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-sale-mapping.test.ts"],
  },
  {
    id: "kit-banco",
    bug: 'orders.size só aceitava uma letra — toda venda de kit ("M,G") falhava no insert',
    files: ["supabase/migrations/0010_order_kit_sizes.sql"],
    from: "check (size ~ '^(P|M|G|GG|XGG)(,(P|M|G|GG|XGG))*$')",
    to: "check (size ~ '^(P|M|G|GG|XGG)$')",
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-sale-mapping.test.ts"],
  },
  {
    id: "kit-retry",
    bug: 'a nova tentativa reaplicava o tamanho e virava "G e G"',
    files: ["supabase/functions/turn/index.ts"],
    from: "replayed ? [] : saidSizes,",
    to: "saidSizes,",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-caminho",
    bug: '"na entrega você leva com 30%" passava — percentual de outro caminho',
    files: ["src/agent/guardrails.ts"],
    from: "if (paths.size !== 1 && counts.length === 0) continue;",
    to: "continue;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-calca",
    bug: '"uso 42, ela 46" pedia a letra à cliente, que chutava (o número de cada peça não passava pela tabela)',
    files: ["supabase/functions/turn/index.ts"],
    from: "interpretation.unit_pants.map(sizeFromDressSize)",
    to: "[]",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "placar-reenvio",
    bug: "o placar contava como link repetido o reenvio que a cliente pediu (achado do Hermes)",
    files: ["src/dev/persona-scorecard.ts"],
    from: "if (!asksForLink(customer) && links.some(",
    to: "if (links.some(",
    guard: ["pnpm", "-s", "vitest", "run", "tests/persona-scorecard.test.ts"],
  },
  {
    id: "kit-comparacao",
    bug: 'o gate vetava a fala do script "R$ 116,91 em vez de R$ 129,90" (preço de comparação lido como oferta)',
    files: ["src/agent/guardrails.ts"],
    from: "if (comparedAgainst) continue;",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-correcao",
    bug: '"na verdade o meu é G" virava o tamanho da outra peça',
    files: ["src/agent/interpret.ts"],
    from: "if (ownSize && said.length === 1) return",
    to: "if (false) return",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-calca-quantidade",
    bug: '"uso 42" contava como pista de quantidade e liberava units inventado',
    files: ["src/agent/interpret.ts"],
    from: "const QUANTITY_CUE = /\\b(?:kit|",
    to: "const QUANTITY_CUE = /\\b(?:[1-9]\\d|kit|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-conversa-nova",
    bug: "o kit abandonado voltava dias depois (nada fecha conversa; expira por tempo)",
    files: ["supabase/functions/turn/index.ts"],
    from: "(kitStale ? null : (lead.units as number | null))",
    to: "(lead.units as number | null)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-virgula",
    bug: "\"quero 2, M e G\" virava 1 peça (a vírgula depois do 2 não contava)",
    files: ["src/agent/interpret.ts"],
    from: "(?!\\\\d|[.,]\\\\d)",
    to: "(?![\\\\d,.])",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-outra-pessoa",
    bug: "\"pra mim tá bom, e pra ela G\" trocava o tamanho dela pelo da outra",
    files: ["src/agent/interpret.ts"],
    from: "if (i.size.for_other_person || OTHER_PERSON.test(t)) return false;",
    to: "if (i.size.for_other_person) return false;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-do-que",
    bug: "\"menos do que R$ 272,79\" passava como comparação (preço falso sozinho)",
    files: ["src/agent/guardrails.ts"],
    from: "moneys.slice(0, k).some(",
    to: "true || moneys.slice(0, k).some(",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-oferta",
    bug: "\"R$ 129,90 levando 2 peças\" passava (o preço não era ligado à quantidade da oração)",
    files: ["src/agent/guardrails.ts"],
    from: "if (before) return before.units;",
    to: "if (before) return before.units;\n          return null;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "cep-entrega",
    bug: "\"dá pra ver a entrega em casa nesse tempo\" passava como pedido de CEP",
    files: ["src/agent/guardrails.ts"],
    from: "\\b(?:cep|endereco)\\b[^.!?]{0,20}?",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
];

const wanted = process.argv.slice(2);
const repo = resolve(".");
const results: Array<{ id: string; caught: boolean; bug: string; note?: string }> = [];

for (const mu of MUTATIONS.filter((m) => wanted.length === 0 || wanted.includes(m.id))) {
  const dir = mkdtempSync(join(tmpdir(), `guard-${mu.id}-`));
  rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["worktree", "add", "--detach", "-q", dir, "HEAD"]);
  try {
    symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
    let applied = true;
    for (const f of mu.files) {
      const p = join(dir, f);
      const src = readFileSync(p, "utf8");
      if (!src.includes(mu.from)) applied = false;
      else writeFileSync(p, src.replace(mu.from, mu.to));
    }
    if (!applied) {
      results.push({ id: mu.id, caught: false, bug: mu.bug, note: "a mutação não se aplicou — o texto de origem mudou; atualize a mutação" });
      continue;
    }
    // The guard runs against the mutated tree; the gate diff compares it with HEAD.
    const run = spawnSync(mu.guard[0]!, mu.guard.slice(1), { cwd: dir, encoding: "utf8", timeout: 10 * 60_000 });
    results.push({ id: mu.id, caught: run.status !== 0, bug: mu.bug });
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", dir]);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

console.log("# Mutação das guardas — cada bug histórico reinstalado precisa ser pego\n");
for (const r of results) console.log(`- ${r.caught ? "pegou   " : "ESCAPOU "} ${r.id}: ${r.bug}${r.note ? ` (${r.note})` : ""}`);
const escaped = results.filter((r) => !r.caught).length;
console.log(`\n${results.length - escaped}/${results.length} guardas pegaram o próprio bug.`);
process.exitCode = escaped ? 1 : 0;
