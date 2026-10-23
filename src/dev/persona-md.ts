/**
 * The persona transcripts the audit keeps in git (`docs/agente-ia/10-auditoria/personas-*`, written by the persona runner's
 * report), read back as `Conversation`s. Synthetic customers only (`5500099…` phones): they feed Hermes's calibration and the
 * JEV Portuguese test (P1.4, P2.4, operator 2026-10-22) where the real conversations are too few (43 messages on 2026-10-22).
 *
 * The format: `### Turno N`, `**Cliente**: text` (continuing on the next lines), `**Malu** (`status`):` followed by `> ` lines,
 * then `Bolhas (n):` and an optional `- Vetos: `gate` (…)` line that belongs to the reply above it.
 */
import type { Conversation, Entry } from "./persona-scorecard.js";

export const parsePersonaMd = (md: string, name: string): Conversation => {
  const transcript: Entry[] = [];
  let mode: "none" | "client" | "malu" = "none";
  let client: string[] = [];
  let malu: Entry | null = null;
  let quoted: string[] = [];
  const flushClient = () => {
    if (mode === "client" && client.length) transcript.push({ from: "persona", text: client.join("\n").trim() });
    client = [];
  };
  const flushMalu = () => {
    if (mode === "malu" && malu) {
      malu.text = quoted.join("\n").trim();
      transcript.push(malu);
    }
    malu = null;
    quoted = [];
  };
  for (const line of md.split("\n")) {
    const c = /^\*\*Cliente\*\*:\s?(.*)$/.exec(line);
    const m = /^\*\*Malu\*\*\s*\(`([^`]*)`\):/.exec(line);
    if (c) {
      flushClient();
      flushMalu();
      mode = "client";
      client = [c[1] ?? ""];
    } else if (m) {
      flushClient();
      flushMalu();
      mode = "malu";
      malu = m[1] === "ok" || m[1] === undefined ? { from: "valen" } : { from: "valen", status: m[1] };
    } else if (/^(?:#{1,3} |Bolhas \()/.test(line)) {
      flushClient();
      flushMalu();
      mode = "none";
    } else if (/^- Vetos:/.test(line)) {
      const last = [...transcript].reverse().find((e) => e.from !== "persona");
      if (last) last.vetoes = [...line.matchAll(/`(\w+)`/g)].map((g) => ({ gate: g[1]! }));
    } else if (mode === "client") client.push(line);
    else if (mode === "malu" && line.startsWith(">")) quoted.push(line.replace(/^> ?/, ""));
  }
  flushClient();
  flushMalu();
  return { persona: name, transcript };
};
