/**
 * Property simulation of the anchored silence ruler (month-1 §4a). No network, no model:
 * thousands of random entries, conversation lengths and reply moments, run through the same
 * `rulerFor` the turn uses and a sweep that defers touches outside 06:00–24:00 exactly like
 * the clock gate does (postpone to the next opening and re-anchor from that touch).
 *
 *   pnpm dev:regua [--cases=20000] [--seed=1]
 *
 * Exits 1 on the first broken invariant, printing the case.
 */
import {
  BUSINESS_TZ,
  nextOpening,
  SERVICE_WINDOW_MS,
  SERVICE_WINDOW_SAFETY_MS,
  offsetMinutes,
  rulerFor,
  type FollowupKind,
  type RulerAnchors,
  type ScheduledFollowup,
  type StopPoint,
} from "../agent/followups.js";

const HOUR = 3_600_000;
const arg = (name: string, fallback: number) =>
  Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const CASES = arg("cases", 20_000);
let seed = arg("seed", 1);
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);

const localHour = (at: Date) => new Date(at.getTime() + offsetMinutes(at, BUSINESS_TZ) * 60_000).getUTCHours();
const open = (at: Date) => localHour(at) >= 6;

interface Sent {
  kind: FollowupKind;
  at: Date;
  /** Scheduled past the 24 h service window — always a failure. */
  late?: boolean;
}

/** One silence after her last message: the sweep sends or postpones until the ruler is empty. */
export const simulate = (entry: Date, lastInbound: Date, reply: Date, stop: StopPoint, link: boolean): Sent[] => {
  const anchors: RulerAnchors = { entry, lastInbound };
  let queue: ScheduledFollowup[] = rulerFor(reply, stop, undefined, link, anchors);
  const sent: Sent[] = [];
  for (let guard = 0; queue.length && guard < 50; guard++) {
    queue.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
    const touch = queue.shift()!;
    // The text touches must fit the 24 h service window as production checks it (`windowIsOpen`:
    // 24 h minus 10 min of safety). One scheduled past it is a ruler bug, not a cancel.
    if (touch.kind !== "silence_3" && touch.runAt.getTime() - lastInbound.getTime() >= SERVICE_WINDOW_MS - SERVICE_WINDOW_SAFETY_MS) {
      return [...sent, { kind: touch.kind, at: touch.runAt, late: true }];
    }
    if (open(touch.runAt)) {
      sent.push({ kind: touch.kind, at: touch.runAt });
      continue;
    }
    const opening = nextOpening(touch.runAt, 6);
    // Re-anchored from the postponed touch: it and the ones after it are replaced.
    const rest = queue.filter((q) => q.runAt < touch.runAt);
    queue = [...rest, ...rulerFor(opening, stop, touch.kind, false, anchors)];
  }
  return sent;
};

const fail = (msg: string, data: unknown) => {
  console.error(`FALHA: ${msg}\n${JSON.stringify(data, null, 2)}`);
  process.exit(1);
};

const base = Date.UTC(2026, 9, 5, 3); // 2026-10-05 00:00 in São Paulo
const stops: StopPoint[] = ["before_size", "after_price", "link_sent"];
const counts = { silence_3: 0, sem_silence_3: 0, silence_2: 0, sem_silence_2: 0 };

for (let i = 0; i < CASES; i++) {
  const entry = new Date(base + Math.floor(rand() * 30 * 24 * 60) * 60_000);
  const lasted = rand() < 0.15 ? rand() * 100 * HOUR : rand() * 6 * HOUR; // most stop within hours
  const lastInbound = new Date(entry.getTime() + lasted);
  const reply = new Date(lastInbound.getTime() + 60_000 + Math.floor(rand() * 4) * 60_000);
  const stop = stops[Math.floor(rand() * stops.length)]!;
  const link = stop === "link_sent" && rand() < 0.5;
  const sent = simulate(entry, lastInbound, reply, stop, link);
  const c = { entry, lastInbound, reply, stop, link, sent };

  const kinds = sent.map((s) => s.kind);
  if (new Set(kinds).size !== kinds.length) fail("um toque saiu duas vezes", c);
  for (let k = 1; k < sent.length; k++) if (sent[k]!.at < sent[k - 1]!.at) fail("toques fora de ordem", c);
  for (const s of sent) {
    if (s.late) fail(`${s.kind} agendado fora da janela de 24 h da última mensagem dela`, c);
    if (!open(s.at)) fail(`${s.kind} saiu de madrugada`, c);
    if (s.at < reply) fail(`${s.kind} antes da resposta da agente`, c);
  }
  const s3 = sent.find((s) => s.kind === "silence_3");
  if (s3) {
    counts.silence_3++;
    const h = (s3.at.getTime() - entry.getTime()) / HOUR;
    if (h < 63 || h > 71) fail(`silence_3 a ${h.toFixed(2)} h da entrada`, c);
  } else counts.sem_silence_3++;
  const s2 = sent.find((s) => s.kind === "silence_2");
  if (s2) {
    counts.silence_2++;
    if (s2.at.getTime() - lastInbound.getTime() > 24 * HOUR) fail("silence_2 depois de 24 h da última dela", c);
  } else counts.sem_silence_2++;
  // A conversation that stopped early enough always gets its coupon touch inside the band.
  if (lasted < 40 * HOUR && !s3) fail("parou cedo e ficou sem silence_3", c);
  if (!sent.some((s) => s.kind.startsWith("silence_"))) fail("régua sem nenhum toque de silêncio", c);
}

console.log(`✓ ${CASES} casos; ${JSON.stringify(counts)}`);
