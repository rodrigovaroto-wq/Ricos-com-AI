import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
] as const;

describe("cópias na Edge Function", () => {
  it.each(mirrored)("%s é byte a byte igual a %s", (source, deployed) => {
    expect(readFileSync(deployed, "utf-8")).toBe(readFileSync(source, "utf-8"));
  });
});
