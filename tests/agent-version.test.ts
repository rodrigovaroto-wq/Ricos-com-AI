import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentVersionOf } from "../src/agent/agent-version.js";
import { FUNCTION_DIR, functionFiles, nextVersion } from "../src/dev/deploy-turn-core.js";
import { renderNumbers } from "../src/dev/hermes-core.js";

/**
 * The agent (Malu) version on every turn (§5 of docs/agente-ia/05-plano/10-execucao-mes-1.md,
 * L3 item 8): without it neither Hermes nor the panel can split before from after a change.
 */
describe("versão da Malu: o segredo AGENT_VERSION", () => {
  it.each([
    ["3", 3],
    ["1", 1],
    ["42", 42],
    [" 7\n", 7],
  ])("%j vira %d", (raw, expected) => {
    expect(agentVersionOf(raw)).toBe(expected);
  });
  // Never invent: a guessed number attributes turns to a change that did not run them.
  it.each([[undefined], [""], ["   "], ["abc"], ["0"], ["-1"], ["3.0"], ["1e3"], ["v3"], ["03"], ["99999999999"]])(
    "%j vira null",
    (raw) => {
      expect(agentVersionOf(raw)).toBeNull();
    },
  );
});

describe("versão da Malu: a turn grava em cada linha", () => {
  const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
  /** Each POST into `table`, from `db("<table>"` to the end of its body. */
  const inserts = (table: string) => [...source.matchAll(new RegExp(`db\\("${table}", \\{[\\s\\S]*?\\}\\)\\.catch`, "g"))].map((m) => m[0]);

  it("lê o segredo uma vez, no topo, pelo parser testado acima", () => {
    expect(source.match(/Deno\.env\.get\("AGENT_VERSION"\)/g)).toHaveLength(1);
    expect(source).toContain('const AGENT_VERSION = agentVersionOf(Deno.env.get("AGENT_VERSION"));');
    expect(source).toContain('import { agentVersionOf } from "./agent-version.ts";');
  });
  it.each(["turn_outcomes", "llm_calls"])("todo insert em %s leva agent_version", (table) => {
    const found = inserts(table);
    expect(found.length).toBeGreaterThan(0);
    for (const body of found) expect(body).toContain("...(AGENT_VERSION !== null ? { agent_version: AGENT_VERSION } : {}),");
  });
  it("negação: sem segredo, o insert não leva a coluna (antes da 0021 ela não existe e o insert falharia)", () => {
    expect(source).not.toMatch(/^\s*agent_version: AGENT_VERSION,$/m);
  });
  it("nenhum outro insert em turn_outcomes ou llm_calls escapa do padrão acima", () => {
    expect(source.match(/db\("(?:turn_outcomes|llm_calls)"/g)).toHaveLength(inserts("turn_outcomes").length + inserts("llm_calls").length);
  });
});

describe("versão da Malu: o deploy manual lista os arquivos do disco", () => {
  it("a lista é o diretório, não uma lista escrita à mão", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-turn-"));
    for (const f of ["index.ts", "b.ts", "a.ts", "notas.md", "deno.json"]) writeFileSync(join(dir, f), "");
    expect(functionFiles(dir)).toEqual(["a.ts", "b.ts", "index.ts"]);
  });
  it("na função turn, sai todo .ts que existe — inclusive o módulo novo", () => {
    const expected = readdirSync(FUNCTION_DIR).filter((f) => f.endsWith(".ts")).sort();
    expect(functionFiles(FUNCTION_DIR)).toEqual(expected);
    expect(expected).toContain("agent-version.ts");
  });
  it("sem index.ts não é a função: recusa", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-turn-"));
    writeFileSync(join(dir, "a.ts"), "");
    expect(() => functionFiles(dir)).toThrow(/index\.ts/);
  });
  it("o script não carrega nome de arquivo da função escrito à mão", () => {
    const script = readFileSync("src/dev/deploy-turn.ts", "utf8");
    expect(script).toContain("functionFiles(FUNCTION_DIR)");
    expect(script).not.toMatch(/"(?:guardrails|prompt|retry|state-machine)\.ts"/);
  });
  it("a próxima versão é a maior + 1; tabela vazia começa em 1", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([{ version: 4 }])).toBe(5);
    expect(nextVersion([{ version: 2 }, { version: 9 }])).toBe(10);
  });
});

describe("versão da Malu: o pacote do Hermes separa por versão", () => {
  const byVersion = [
    { agent_version: 2, first_at: "2026-10-03T10:00:00Z", last_at: "2026-10-04T10:00:00Z", turns: 40, sent: 36, fallbacks: 1, handoffs: 3, fallback_rate: "0.0250", handoff_rate: "0.0750", avg_rewrites: "0.30", cost_brl: "4.0000" },
    { agent_version: 1, first_at: "2026-10-01T10:00:00Z", last_at: "2026-10-03T09:00:00Z", turns: 50, sent: 40, fallbacks: 5, handoffs: 5, fallback_rate: "0.1000", handoff_rate: "0.1000", avg_rewrites: "0.80", cost_brl: "6.0000" },
    { agent_version: null, first_at: "2026-09-25T10:00:00Z", last_at: "2026-10-01T09:00:00Z", turns: 7, sent: 7, fallbacks: 0, handoffs: 0, fallback_rate: "0.0000", handoff_rate: "0.0000", avg_rewrites: "0.00", cost_brl: "1.0000" },
  ];
  const latest = { version: 2, git_sha: "abcdef1234567890", published_at: "2026-10-03T10:00:00Z", hermes_proposal_id: "11111111-2222-3333-4444-555555555555", note: null };

  it("cada versão vira uma linha com as taxas do SQL, e a versão no ar aparece", () => {
    const md = renderNumbers([], [], byVersion, latest);
    expect(md).toContain("`eval_version_outcomes`");
    expect(md).toContain("| 2 | 2026-10-03T10:00:00Z | 2026-10-04T10:00:00Z | 40 | 36 | 1 | 3 | 0.0250 | 0.0750 | 0.30 | 4.0000 |");
    expect(md).toContain("| 1 | 2026-10-01T10:00:00Z | 2026-10-03T09:00:00Z | 50 | 40 | 5 | 5 | 0.1000 | 0.1000 | 0.80 | 6.0000 |");
    expect(md).toContain("| sem versão |");
    expect(md).toMatch(/Versão no ar: v2 \(commit abcdef1, publicada em 2026-10-03T10:00:00Z, proposta 11111111-2222-3333-4444-555555555555\)/);
  });
  it("deploy manual não inventa proposta", () => {
    expect(renderNumbers([], [], byVersion, { ...latest, hermes_proposal_id: null })).toContain("deploy manual, sem proposta");
  });
  it("sem versão registrada, diz que não há — nunca supõe uma", () => {
    const md = renderNumbers([], []);
    expect(md).toContain("Nenhuma versão registrada em `agent_versions`");
    expect(md).not.toMatch(/Versão no ar: v\d/);
  });
});

describe("versão da Malu: a migração 0021", () => {
  const m = readFileSync("supabase/migrations/0021_agent_version.sql", "utf8").toLowerCase();

  it("cria agent_versions com RLS e sem policy, como as outras", () => {
    expect(m).toMatch(/create table if not exists public\.agent_versions \(\s*version int primary key,/);
    expect(m).toContain("hermes_proposal_id uuid references public.hermes_proposals(id)");
    expect(m).toContain("alter table public.agent_versions enable row level security;");
    expect(m).not.toMatch(/create policy/);
  });
  it("a coluna é nula e sem FK: um segredo sem linha nunca derruba o insert do turno", () => {
    expect(m).toContain("alter table public.turn_outcomes add column if not exists agent_version int;");
    expect(m).toContain("alter table public.llm_calls add column if not exists agent_version int;");
    expect(m).not.toMatch(/agent_version int[^;]*references/);
  });
  it("eval_conversation_cost só acrescenta coluna no fim (create or replace não aceita outra coisa)", () => {
    const old = readFileSync("supabase/migrations/0018_evaluation_views.sql", "utf8").toLowerCase();
    const selectList = (sql: string) => sql.slice(sql.indexOf("create or replace view public.eval_conversation_cost"), sql.indexOf("\nfrom public.conversations c", sql.indexOf("create or replace view public.eval_conversation_cost")));
    expect(selectList(m).startsWith(selectList(old) + ",")).toBe(true);
  });
});
