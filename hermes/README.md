# Hermes — the Malu supervisor

[Hermes Agent](https://github.com/NousResearch/hermes-agent) reads Malu's conversations in
batch and proposes changes, in the change-registry format
(`docs/agente-ia/08-mudancas/registro.md`). It never runs inside a turn (R11.2) and never
applies anything (R11.6): a person accepts or refuses each proposal.

## The loop

```
conversations (Supabase, or a persona round)
  → evidence bundle: scorecard + conversations with vetoes + registry + "do not" list,
    PII masked (phone, CPF, CEP, e-mail)
  → Hermes, file/skills/todo toolsets only, in a throwaway copy, no Supabase key
  → propostas.json
  → validation: every quote verbatim in the conversation, nothing from the "do not" list,
    a gate loosening names the neighbouring lie that stays vetoed
  → each quote run through TODAY's gates ("hoje: vetada por …" / "passa")
  → hermes_runs + hermes_proposals (status 'proposed') + a PR with the document
  → n8n e-mails one link per proposal; the operator approves or refuses, with a reason
  → approved: a scheduled session implements it (hermes/IMPLEMENTAR.md), proves it (CI,
    Opus review loop, personas) and merges it with `hermes:<id>`; deploy-hermes.yml
    publishes after CI on main; the outcome is e-mailed
  → every decision, reason and result is in hermes_proposals, and the next run reads it
    (decisoes.md in the bundle) before proposing (R14.14)
```

## Commands

| Command | What |
|---|---|
| `pnpm hermes --source=personas:<dir>` | Supervise a persona round (synthetic data). `--model=muse-spark-1.3-contributor` allowed here only. |
| `pnpm hermes --source=supabase --write-db --only-if-due` | Production: runs when 50 leads arrived since the last run (R6.2, view `hermes_backlog`). |
| `pnpm hermes:calibrar <dir>` | Plants three known defects in a copy of a round and checks Hermes finds all three. Rerun after changing the skill or the model. |

Production runs daily from `.github/workflows/hermes.yml` (needs the secrets
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_API_KEY`).

## Files

- `config.yaml` — standard Muse Spark, every auxiliary task pinned to it (the Meta plugin
  defaults side tasks to a `-contributor` model, which trains on the data).
- `skills/encorpa-supervisor/SKILL.md` — what to look for, in cost order, and the exact
  output format.
- `src/dev/hermes-core.ts` (pure, tested) and `src/dev/hermes-run.ts` (the run).
- `supabase/migrations/0008_hermes_runs.sql` — `hermes_runs`, `hermes_proposals.run_id`,
  `hermes_backlog`.

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
- Cost: ~US$ 0.005 per persona round on `-contributor`; ~US$ 0.05 per production run on
  the standard model (≈120k tokens, mostly cached).
