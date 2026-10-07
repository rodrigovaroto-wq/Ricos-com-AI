# Code ladder — before writing any code

Applies to every change that creates or edits code (`src/`, `supabase/`, `tests/`,
`scripts/`, SQL), in the main session and in every subagent. Adapted from
[ponytail](https://github.com/DietrichGebert/ponytail) (MIT) — only the parts this
repository did not already state.

**First understand, then climb.** Read the task and every file the change touches, trace
the real flow end to end (turn → gates → state → persistence), and only then pick a rung.
The smallest diff in the wrong place is not simple, it is a second bug.

Stop at the first rung that holds:

1. **Does it need to exist?** Speculative need → skip it and say so in one line.
2. **Already in this repository?** Grep for the helper, type, regex or pattern before
   writing one. Re-implementing what sits a few files over is the most common slop — and
   here a second copy of a heuristic is a second place for negation blindness to hide.
3. **Standard library does it?** Node/Deno and Web APIs (`Intl`, `URL`, `crypto`,
   `structuredClone`, `Array` methods) before hand-rolled code.
4. **The platform does it?** A Postgres constraint, index, view or `ON CONFLICT` before
   application code; a n8n node for plumbing — but never business rules (n8n is pipe and
   clock, see `CLAUDE.md`).
5. **An installed dependency does it?** This repository ships **one runtime
   dependency** — `ogg-opus-decoder`, in the `whatsapp` function only (R18.9: an Opus decoder
   is not a few lines) — and the Edge Function runs on Deno from a mirrored copy. A new
   dependency needs a reason a few lines of code cannot meet.
6. **Can it be one line?** One line.
7. **Only then:** the minimum code that works.

Two rungs work → take the higher one. Two same-size options → take the one correct on
edge cases.

**Bug fix = root cause, not symptom.** Before editing a function, grep every caller and
fix it once where they all route through; patching only the path the report names leaves
the siblings broken. Every `src/agent/X.ts` fix lands in `supabase/functions/turn/X.ts`
too.

## Never on the chopping block

The ladder shortens the solution, never these:

- Gates, guardrails and the veto → rewrite loop. The model only writes text; the action
  stays deterministic TypeScript (R11.1).
- Validation at trust boundaries (webhook payload, customer text, `BUSINESS_CONFIG`) and
  error handling that prevents data loss or a duplicate send.
- Negation tests on any text heuristic, and the test the change needs (TDD, guideline 4).
- The byte-for-byte mirror, and new `BusinessConfig` fields being optional.
- Anything the operator explicitly asked for — asked for the full version, build it.
