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
