-- Soft gates (decision R13.3, 2026-09-24) record a "warn" verdict: the reply goes out,
-- the finding stays in the trace. The turn inserts one batch of traces per attempt and
-- swallows errors, so without this a single warn row would silently drop the whole
-- batch — block rows included.
alter table public.gate_traces drop constraint if exists gate_traces_verdict_check;
alter table public.gate_traces add constraint gate_traces_verdict_check
  check (verdict in ('pass', 'block', 'rewrite', 'warn'));
