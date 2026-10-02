import type { BusinessConfig } from "@/config/business.js";
import { BUSINESS_TZ, nextOpening, offsetMinutes } from "@/agent/followups.js";

/**
 * Human rhythm (spec §B7). Two rules that are easy to get wrong:
 *
 * 1. The delay is per bubble, not per reply — otherwise a three-bubble answer sits
 *    silent for twenty seconds and then dumps everything at once, which is the
 *    opposite of the intended effect.
 * 2. The "typing" presence expires in about 20s, so a longer wait has to refresh it
 *    in blocks instead of being set once.
 *
 * The first real reply waits one minute (operator, R18.1, 2026-10-02) — the same number
 * as `WELCOME_RESUME_DELAY_SECONDS`, which is what production actually waits.
 */
export const FIRST_REPLY_DELAY_MS = 60_000;
export const MS_PER_WORD = 800;
export const PRESENCE_REFRESH_MS = 15_000;

export const bubbleDelayMs = (bubble: string): number =>
  Math.max(1_000, bubble.trim().split(/\s+/).length * MS_PER_WORD);

/** How many times to re-send "typing" while waiting out a delay. */
export const presenceRefreshes = (delayMs: number): number =>
  Math.max(1, Math.ceil(delayMs / PRESENCE_REFRESH_MS));

/**
 * When the real (layer 2) reply may go out. Inside business hours it is now plus the
 * first-reply delay; a message that lands overnight waits for opening time.
 *
 * `openHour` and `closeHour` are Brazilian wall-clock hours, and the runtime's are not:
 * Supabase Edge Functions run in UTC, where `getHours()` read three hours ahead of São
 * Paulo and `openHour` 6 meant 03:00. So the window is decided on the local hour, and
 * the reopening comes from `nextOpening` — the same clock the follow-up ruler uses,
 * borrowed instead of reimplemented.
 */
export const firstReplyAt = (arrivedAt: Date, c: BusinessConfig): Date => {
  const { openHour, closeHour } = c.hours;
  const localHour = new Date(
    arrivedAt.getTime() + offsetMinutes(arrivedAt, BUSINESS_TZ) * 60_000,
  ).getUTCHours();
  if (localHour >= openHour && localHour < closeHour) {
    return new Date(arrivedAt.getTime() + FIRST_REPLY_DELAY_MS);
  }

  // Later today when the local clock has not reached `openHour` yet, tomorrow when the
  // day is already over — which is exactly `nextOpening`'s same-day-if-earlier rule.
  return nextOpening(arrivedAt, openHour);
};

/**
 * Bubbles of about thirty words at most (R13.4, 2026-09-24): the persona runs measured a
 * median of 49 words per message, and a wall of text on WhatsApp reads as a form letter.
 * Mirrored inline in `supabase/functions/turn/index.ts` — from the declaration below up to
 * the `export` line, byte for byte, held by `tests/function-drift.test.ts`.
 */
const MAX_BUBBLE_WORDS = 30;

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Splits a reply into WhatsApp-sized bubbles. A paragraph is a bubble; a paragraph over
 * `maxWords` is cut at sentence ends and the sentences packed back up to the limit. A
 * sentence is NEVER cut — one longer than the limit goes out whole, because half a
 * sentence in a bubble reads as a bug. `max` still caps the count, but only by merging
 * trailing bubbles that fit together under `maxWords`.
 */
const splitBubbles = (text: string, max = 3, maxWords = MAX_BUBBLE_WORDS): string[] => {
  const bubbles: string[] = [];
  for (const paragraph of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (wordCount(paragraph) <= maxWords) {
      bubbles.push(paragraph);
      continue;
    }
    // [sentence, separator, sentence, ...] — the separator is kept so a line break
    // between two sentences survives when they land in the same bubble.
    const parts = paragraph.split(/(?<=[.!?\u2026])(\s+)(?=\S)/);
    let current = parts[0]!;
    for (let i = 1; i < parts.length; i += 2) {
      const sentence = parts[i + 1]!;
      if (wordCount(current) + wordCount(sentence) <= maxWords) {
        current += parts[i]! + sentence;
      } else {
        bubbles.push(current);
        current = sentence;
      }
    }
    bubbles.push(current);
  }
  while (bubbles.length > max) {
    const [a, b] = bubbles.slice(-2) as [string, string];
    if (wordCount(a) + wordCount(b) > maxWords) break;
    bubbles.splice(-2, 2, `${a}\n\n${b}`);
  }
  return bubbles;
};

export { MAX_BUBBLE_WORDS, splitBubbles };
