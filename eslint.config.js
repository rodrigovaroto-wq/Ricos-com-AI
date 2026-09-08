// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * `pnpm lint` is one of the six canonical commands in CLAUDE.md and it was the only
 * one that could not run: the script called eslint, and eslint was neither installed
 * nor configured. A command that always fails is worse than no command — nobody reads
 * its output, so nothing it would have caught gets caught.
 *
 * Type-aware rules are deliberately off. They need a second full typecheck of the
 * project, and `pnpm typecheck` already does that; running it twice buys nothing.
 */
export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "supabase/functions/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // The turn handler's `db()` returns whatever PostgREST sent; typing that shape
      // for every call site is fiction, not safety.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
