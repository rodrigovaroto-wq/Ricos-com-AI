/**
 * Which published version of the agent (Malu) wrote a row (§5 of
 * docs/agente-ia/05-plano/10-execucao-mes-1.md, L3 item 8). The deploy inserts the next row
 * in `agent_versions` and sets the `AGENT_VERSION` secret before it publishes `turn`; the
 * turn reads it once and writes it on every `turn_outcomes` and `llm_calls` row, so Hermes
 * and the panel can tell before from after a change.
 *
 * Only a positive integer counts. Absent, blank, "0", "-1", "3.0", "03", "v3" — all null:
 * a guessed number would credit turns to a change that did not run them, which is worse
 * than an honest gap. Nine digits at most, so it always fits the `int` column.
 */
export const agentVersionOf = (raw: string | undefined): number | null => {
  const value = (raw ?? "").trim();
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
};
