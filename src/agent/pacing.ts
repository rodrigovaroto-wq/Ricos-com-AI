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
 */
export const FIRST_REPLY_DELAY_MS = 3 * 60_000;
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

/** Splits a reply into WhatsApp-sized bubbles, at most three, never mid-sentence. */
export const splitBubbles = (text: string, max = 3): string[] => {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= max) return paragraphs;
  const head = paragraphs.slice(0, max - 1);
  return [...head, paragraphs.slice(max - 1).join("\n\n")];
};
