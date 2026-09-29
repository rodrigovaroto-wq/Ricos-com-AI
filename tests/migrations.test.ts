import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n")
  .toLowerCase();

/**
 * Every table has RLS on and no policy, so only `service_role` reads a row. A view without
 * `security_invoker` runs as its owner and skips that RLS: the evaluation views (0018) would
 * hand phones, costs and ad ids to the anon key through PostgREST.
 */
describe("migrações: nenhuma view fura o RLS", () => {
  const views = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+((?:public\.)?\w+)([^;]*?)\s+as\b/g)];

  it("existem views para conferir", () => {
    expect(views.map((v) => v[1])).toContain("public.eval_attribution");
  });
  it.each(views.map((v) => [v[1], v[2]] as const))("%s tem security_invoker", (_name, options) => {
    expect(options).toMatch(/security_invoker\s*=\s*true/);
  });
  it("nenhuma migração desliga o security_invoker depois", () => {
    expect(sql).not.toMatch(/alter\s+view[^;]*(?:security_invoker\s*=\s*(?:false|off)|reset\s*\([^)]*security_invoker)/);
  });
});

/**
 * Hermes and the 90-day retention (0020, 2026-09-29): the customer sentences a proposal
 * quotes expire with the rest of her data, and a persona round never counts as leads served.
 */
describe("migrações: o Hermes respeita a retenção", () => {
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  /** The definition in force: the one in the last migration that (re)creates it, up to `end`. */
  const last = (start: RegExp, end: string) => {
    const hit = files.map((f) => readFileSync(`supabase/migrations/${f}`, "utf8").toLowerCase()).filter((s) => start.test(s)).pop() ?? "";
    const from = hit.search(start);
    return from < 0 ? "" : hit.slice(from, hit.indexOf(end, from));
  };

  it("a versão vigente de purge_expired tira os trechos vencidos e mantém objetivo e como_medir", () => {
    expect(last(/create or replace function public\.purge_expired\(\)/, "end; $$;")).toMatch(
      /update public\.hermes_proposals set evidence = evidence - 'evidencias', evidence_redacted_at = now\(\)\s+where expires_at < now\(\)/,
    );
  });
  it("hermes_proposals tem expires_at", () => {
    expect(sql).toMatch(/alter table public\.hermes_proposals\s+add column if not exists expires_at timestamptz not null/);
  });
  it("a versão vigente de hermes_backlog não conta lead sintético, com o prefixo do runner", async () => {
    const { SYNTHETIC_PHONE_PREFIX } = await import("../src/dev/persona-run-core.js");
    expect(last(/create or replace view public\.hermes_backlog/, ";")).toContain(`l.phone not like '${SYNTHETIC_PHONE_PREFIX}%'`);
  });
});
