/** The testable half of `pnpm deploy:turn` (src/dev/deploy-turn.ts). */
import { readdirSync } from "node:fs";

export const FUNCTION_DIR = "supabase/functions/turn";

/**
 * Every `.ts` of the function, read from the directory. A hand-written list went stale
 * three times (`.claude/memory/supabase-deploy-por-api.md`), and one missing import takes
 * the whole function down at boot, not just the route that uses it.
 */
export function functionFiles(dir: string): string[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
  if (!files.includes("index.ts")) throw new Error(`${dir}: sem index.ts — não é a pasta da função`);
  return files;
}

/** `max + 1` over `agent_versions`; an empty table starts at 1. */
export const nextVersion = (rows: ReadonlyArray<{ version: number }>): number => Math.max(0, ...rows.map((r) => r.version)) + 1;
