import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cachedRegion, REGION_CACHE_MS, type CachedRegion } from "@/agent/availability.js";
import { STAGES } from "@/agent/state-machine.js";
import { config } from "./fixtures.js";

/** E2 (docs/agente-ia/05-plano/13-plano-pratico-conversao.md): latency, real stages, arm, coverage cache. */
const source = readFileSync("supabase/functions/turn/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/0026_measurement.sql", "utf8").toLowerCase();

describe("E2.1 latência gravada", () => {
  it("todo llm_calls da turn leva latency_ms, medido nos dois provedores", () => {
    const insert = source.match(/db\("llm_calls", \{[\s\S]*?\}\)\.catch/g) ?? [];
    expect(insert).toHaveLength(1);
    expect(insert[0]).toContain("latency_ms: call.latencyMs,");
    expect(source.match(/const startedAt = Date\.now\(\);\n {2}const response = await fetch\(/g)).toHaveLength(2);
    expect(source.match(/latencyMs: Date\.now\(\) - startedAt,/g)).toHaveLength(2);
  });
  it("todo turn_outcomes leva duration_ms desde o início do turno", () => {
    const insert = source.match(/db\("turn_outcomes", \{[\s\S]*?\}\)\.catch/g) ?? [];
    expect(insert).toHaveLength(1);
    expect(insert[0]).toContain("duration_ms: Date.now() - turnStartedAt,");
    // Every outcome of the turn goes through the wrapper that carries `turnStartedAt`.
    expect(source.match(/writeOutcome\(/g)).toHaveLength(1);
    expect(source).toContain("writeOutcome(turnStartedAt, conversationId, outcome, reason, rewrites, costBrl)");
  });
  it("a migração cria a coluna e a view com p50/p90 por dia e braço, sem furar o RLS", () => {
    expect(migration).toContain("alter table public.turn_outcomes add column if not exists duration_ms int;");
    expect(migration).toMatch(/create or replace view public\.eval_latency with \(security_invoker = true\)/);
    expect(migration).toMatch(/percentile_cont\(0\.5\)[\s\S]*percentile_cont\(0\.9\)[\s\S]*group by 1, 2, 3;/);
  });
});

describe("E2.2 estágios reais do funil", () => {
  const list = (sql: string) => [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  it("o check e as duas views de funil listam exatamente STAGES, na ordem", () => {
    const check = migration.match(/add constraint conversations_stage_check\s+check \(stage in \(([\s\S]*?)\)\)/)?.[1] ?? "";
    expect(list(check)).toEqual([...STAGES]);
    const arrays = [...migration.matchAll(/array\[([\s\S]*?)\]/g)].map((m) => list(m[1]!));
    expect(arrays).toHaveLength(2);
    for (const a of arrays) expect(a).toEqual([...STAGES]);
  });
  it("as linhas em endereco_coletado são relidas pelos fatos do lead, antes do check novo", () => {
    const drop = migration.indexOf("drop constraint if exists conversations_stage_check");
    const update = migration.indexOf("update public.conversations c");
    const add = migration.indexOf("add constraint conversations_stage_check");
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(update);
    expect(update).toBeLessThan(add);
    expect(migration).toContain("where l.id = c.lead_id and c.stage = 'endereco_coletado';");
  });
  it("toda chamada de reachedStage passa os três fatos novos", () => {
    const calls = source.match(/reachedStage\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c).toMatch(/coverageKnown[\s\S]*pathChosen[\s\S]*linkSent/);
    expect(source).not.toMatch(/addressConfirmed: Boolean\(lead\.address\?\.confirmedAt\)/);
  });
  it("a saída final grava link_enviado quando a resposta leva o link", () => {
    expect(source).toContain("linkSent: linkSentRecently([replyText], CHECKOUT_BASES),");
  });
  it("a linha fixa com link grava link_enviado", () => {
    expect(source).toContain('persistStage(conversation.id, storedStage, linkOut ? furthest(reachedSoFar, "link_enviado") : reachedSoFar),');
  });
  it("a resposta adiada com link, mandada pela varredura, grava link_enviado", () => {
    expect(source).toMatch(
      /if \(linkSentRecently\(\[text\], CHECKOUT_BASES\)\) \{\n\s+await persistStage\(row\.conversation_id, \(row\.conversations\?\.stage as Stage \| null\) \?\? "novo", "link_enviado"\);/,
    );
  });
});

describe("E2.3 braço A/B gravado", () => {
  it("a turn grava o braço uma vez, sem sobrescrever", () => {
    expect(source).toContain("await db(`leads?id=eq.${lead.id}&arm=is.null`, {");
    expect(source).toContain("body: JSON.stringify({ arm: armOf(lead.phone) }),");
  });
  it("a migração cria leads.arm e as views por braço, todas security_invoker", () => {
    expect(migration).toContain("alter table public.leads add column if not exists arm jsonb;");
    for (const v of ["eval_latency", "eval_arm_outcomes", "eval_arm_funnel"]) {
      expect(migration).toContain(`create or replace view public.${v} with (security_invoker = true)`);
    }
  });
  it("negação: experiments é opcional — o config sem ele compila e é o de hoje", () => {
    expect(config.experiments).toBeUndefined();
  });
});

describe("E2.4 cobertura guardada por CEP", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const region: CachedRegion = {
    zip: "04710-090",
    place: { city: "São Paulo", state: "SP", district: "Centro" },
    cod: true,
    dates: ["2026-10-13"],
    sameDay: false,
    labelBrl: null,
    checkedAt: new Date(now - 10 * 60 * 1000).toISOString(),
  };

  it("mesmo CEP há menos de 1 h: usa o guardado, com ou sem hífen", () => {
    expect(cachedRegion(region, "04710-090", now)).toBe(region);
    expect(cachedRegion(region, "04710090", now)).toBe(region);
  });
  it("janela do mesmo dia sai do cache, mas nunca como 'hoje' (revisão e /code-review da E2)", () => {
    expect(cachedRegion({ ...region, sameDay: true }, "04710-090", now)?.sameDay).toBe(false);
  });
  it("as datas viram na meia-noite: só o mesmo dia de São Paulo sai do cache (/code-review da E2)", () => {
    // 23:40 em São Paulo (02:40 UTC) guardado; 00:20 do dia seguinte (03:20 UTC) consulta de novo.
    const at = Date.parse("2026-10-13T03:20:00Z");
    expect(cachedRegion({ ...region, checkedAt: "2026-10-13T02:40:00.000Z" }, "04710-090", at)).toBeNull();
    expect(cachedRegion({ ...region, checkedAt: "2026-10-13T03:10:00.000Z" }, "04710-090", at)).not.toBeNull();
  });
  it("CEP novo: consulta de novo", () => {
    // R28: an answer for another size, or for any size once hers is known, is asked again.
    expect(cachedRegion({ ...region, size: "GG" }, "04710-090", now, "G")).toBeNull();
    expect(cachedRegion(region, "04710-090", now, "G")).toBeNull();
    expect(cachedRegion({ ...region, size: "G" }, "04710-090", now, "G")).not.toBeNull();
    expect(cachedRegion(region, "01310-100", now)).toBeNull();
  });
  it("vencido (1 h ou mais), data inválida ou futura: consulta de novo", () => {
    expect(cachedRegion({ ...region, checkedAt: new Date(now - REGION_CACHE_MS).toISOString() }, "04710-090", now)).toBeNull();
    expect(cachedRegion({ ...region, checkedAt: "ontem" }, "04710-090", now)).toBeNull();
    expect(cachedRegion({ ...region, checkedAt: new Date(now + 60_000).toISOString() }, "04710-090", now)).toBeNull();
    expect(cachedRegion(undefined, "04710-090", now)).toBeNull();
  });
  it("a turn só guarda região encontrada, nunca a consulta que falhou", () => {
    expect(source).toContain("if (region) freshRegion = { ...region, checkedAt: new Date().toISOString() };");
    expect(source).toContain("const cached = addressDraft.cep ? cachedRegion(storedAddress.region, addressDraft.cep, Date.now(), regionSize) : null;");
    expect(source).toMatch(/if \(cached\) region = cached;\n\s+else if \(addressDraft\.cep\) \{/);
    // The cache never travels into the order body or the link with the address.
    expect(source).toContain("delete (addressDraft as { region?: CachedRegion }).region;");
  });
});

describe("revisão da E2 — ordem do deploy e janela do mesmo dia", () => {
  it("o deploy:turn para se a 0026 não estiver aplicada (grafo §75)", () => {
    const deploy = readFileSync("src/dev/deploy-turn.ts", "utf8");
    const guard = deploy.indexOf("column_name = 'duration_ms'");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(deploy.indexOf("insert into public.agent_versions"));
    expect(deploy).toContain("if (!dryRun) throw new Error(\"a migração 0026 não está aplicada");
    expect(deploy).toContain("column_name = 'arm'");
    expect(deploy).not.toMatch(/column_name = 'duration_ms'[^;]*\.catch\(/s);
  });
});
