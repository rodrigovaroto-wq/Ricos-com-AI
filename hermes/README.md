# Hermes — the Malu supervisor

[Hermes Agent](https://github.com/NousResearch/hermes-agent) reads Malu's conversations in
batch and proposes changes, in the change-registry format
(`docs/agente-ia/08-mudancas/registro.md`). It never runs inside a turn (R11.2) and never
applies anything (R11.6): a person accepts or refuses each proposal.

## The loop

```
conversations (Supabase — picked by `hermes_sample`: flagged first, then a control —
or a persona round)
  → evidence bundle: scorecard + the evaluation views' numbers (numeros.md) + Malu's prompt
    (prompt.md) + conversations with vetoes and outcomes + registry + "do not" list,
    PII masked (phone, CPF, CEP, e-mail)
  → Hermes, file/skills/todo toolsets only, in a throwaway copy, no Supabase key
  → propostas.json
  → validation: every quote verbatim in the conversation, a lie quotes the prompt rule it
    breaks (verbatim too), nothing from the "do not" list, a gate loosening names the
    neighbouring lie that stays vetoed
  → each quote run through TODAY's gates ("hoje: vetada por …" / "passa"); a lie every
    quote of which is already vetoed is set aside
  → the git copy of a production run carries no excerpt nor quoted text (LGPD)
  → hermes_runs + hermes_proposals (status 'proposed') + a PR with the document
  → n8n e-mails the proposal titles (hermes/EMAILS.md — no link; the R14.14 link form is
    disabled); the operator fires the Claude Code Routine "Hermes – decisão"
    (hermes/DECIDIR.md), which shows each proposal with its evidence masked, and approves,
    refuses or corrects it, with a reason
  → approved: the same session implements it (hermes/IMPLEMENTAR.md), proves it (CI,
    Opus review loop, personas) and merges it with `hermes:<id>`; deploy-hermes.yml
    publishes after CI on main as the next version in `agent_versions` (R18.5) — only a row
    the operator approved, and never a change that accepts a gate loosening; the outcome
    is e-mailed
  → rollback (L3 item 8): every production run compares handoff of the version on air with
    the previous one (`eval_version_outcomes`, `revertCheck` in hermes-core.ts); worse → a
    `REVERTER-vN` proposal, shown first by the Routine, and no other proposal is written
    while it waits. An undue premise worse under the new version is Hermes's call (skill)
  → every later production run measures each published proposal's `como_medir` check on
    conversations before and after `published_at`, into `result`
  → every decision, reason and result is in hermes_proposals, and the next run reads it
    (decisoes.md in the bundle) before proposing (R14.14)
  → since 2026-10-08 the bundle also carries historico.md, a copy of hermes/historico-inicial.md,
    read right after decisoes.md: the real cases already audited and what each taught
```

## Commands

| Command | What |
|---|---|
| `pnpm hermes --source=personas:<dir>` | Supervise a persona round (synthetic data). `--model=muse-spark-1.3-contributor` allowed here only. |
| `pnpm hermes --source=supabase --write-db --only-if-due` | Production: runs when 50 leads arrived since the last run (R6.2, view `hermes_backlog`). |
| `pnpm hermes:calibrar <dir>` | Plants three known defects in a copy of a round and checks Hermes finds all three. Rerun after changing the skill or the model. |

Production runs daily from `.github/workflows/hermes.yml` (needs the secrets
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_API_KEY`; optional variable
`HERMES_MAX_USD`, a ceiling per run in US$). Migration `0020` must be applied first.

## Files

- `config.yaml` — standard Muse Spark, every auxiliary task pinned to it (the Meta plugin
  defaults side tasks to a `-contributor` model, which trains on the data).
- `skills/encorpa-supervisor/SKILL.md` — what to look for, in cost order, and the exact
  output format.
- `historico-inicial.md` — the starting history (operator, 2026-10-08): how to diagnose (the order the
  real tests taught), the cases of grafo §60–§66 with cause, fix and guard, and the operator's standing
  decisions. No customer data. `src/dev/hermes-run.ts` puts it in every bundle as `historico.md`;
  `tests/hermes-history.test.ts` guards it. A new lesson from a real conversation goes here in the same
  commit as its grafo entry.
- `DECIDIR.md` — the prompt of the Routine "Hermes – decisão". `IMPLEMENTAR.md` — what the
  session does with an approved proposal.
- `src/dev/hermes-core.ts` (pure, tested) and `src/dev/hermes-run.ts` (the run).
- `supabase/migrations/0008_hermes_runs.sql` — `hermes_runs`, `hermes_proposals.run_id`,
  `hermes_backlog`. `0020_hermes_retention.sql` — the excerpts expire at 90 days,
  `hermes_sample`, `published_at`, the run's skill/commit/conversation ids.

## Seeded decisions (2026-10-08)

Eleven decisions of the second real test (grafo §66) were written into `hermes_proposals` with the codes
`2026-10-08 §66-1` … `§66-11`: status `published`, `published_at` null (so the run does not measure them as
if Hermes had proposed them) and already notified. They are the first lines of `decisoes.md`, so Hermes
does not propose again what the operator already decided. Seeded by the 2026-10-08 session; **not re-read
from the database when this paragraph was written**.

## Local setup (Python 3.14)

```bash
uv python install 3.14
uv tool install --python 3.14 "hermes-agent @ git+https://github.com/NousResearch/hermes-agent@ac4181fdfaa4fa3b0682ea7b592c7a3ee6465e62"
export META_API_KEY=...        # or MODEL_API_KEY
```

In the Claude Code cloud container the proxy injects the Meta key: pass any non-empty
`MODEL_API_KEY`, `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt`, and `HERMES_BIN` pointing at the
install.

## Measured (2026-09-25)

- Calibration: 3/3 planted defects found (invented deadline, canned reply, repeated link).
- Cost: ~US$ 0.005 per persona round on `-contributor` (measured). The standard model was
  never run: at `src/llm/pricing.ts` prices, with no cache price, a production pass of 50
  conversations is estimated at US$ 0.23–0.64 (analysis §f). The earlier "~US$ 0.05 for
  ≈120k tokens" did not follow from that table.
