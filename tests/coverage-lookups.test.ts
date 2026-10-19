import { describe, expect, it } from "vitest";
import { lookupsDegraded } from "../src/agent/availability.js";

const rows = (...o: string[]) => o.map((outcome) => ({ outcome }));

describe("lookupsDegraded (grafo §111)", () => {
  it("is healthy with few lookups, even if all failed", () => {
    expect(lookupsDegraded(rows("failed", "failed", "failed", "failed")).degraded).toBe(false);
  });
  it("is degraded when a third of at least five failed", () => {
    expect(lookupsDegraded(rows("failed", "failed", "cod", "cod", "no_cod", "cod")).degraded).toBe(true);
  });
  it("is healthy when failures stay below a third", () => {
    expect(lookupsDegraded(rows("failed", "cod", "cod", "cod", "no_cod", "cod")).degraded).toBe(false);
  });
  it("ignores not_found and garbage rows (a customer typo is not a source failing)", () => {
    const r = lookupsDegraded([...rows("not_found", "not_found", "not_found", "failed"), { outcome: 7 }, {}]);
    expect(r).toEqual({ degraded: false, total: 1, failed: 1 });
  });
  it("is healthy with no rows", () => {
    expect(lookupsDegraded([]).degraded).toBe(false);
  });
});

import { readFileSync } from "node:fs";
describe("turn records and reads the lookups", () => {
  const src = readFileSync("supabase/functions/turn/index.ts", "utf8");
  it("inserts one row per real lookup, not per retry or revision", () => {
    expect(src).toMatch(/if \(!isRetry && !isRevise\) \{\s*await db\("coverage_lookups"/);
  });
  it("health job reads the last hour and folds it into the status", () => {
    expect(src).toContain("coverage_lookups?created_at=gte.");
    expect(src).toContain("!real.degraded");
  });
});
