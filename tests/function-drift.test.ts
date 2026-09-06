import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Edge Function ships its own copy of the guardrail chain, because Supabase
 * uploads file contents rather than resolving the repo. A copy that silently drifts
 * from src is the worst of both worlds: tests here proving one thing, production
 * doing another. This test fails the moment they differ.
 */
describe("cópia dos guardrails na Edge Function", () => {
  it("é byte a byte igual à fonte", () => {
    const source = readFileSync("src/agent/guardrails.ts", "utf-8");
    const deployed = readFileSync("supabase/functions/turn/guardrails.ts", "utf-8");
    expect(deployed).toBe(source);
  });
});
