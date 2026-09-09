import type { BusinessConfig } from "@/config/business.js";

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
 */
export const firstReplyAt = (arrivedAt: Date, c: BusinessConfig): Date => {
  const { openHour, closeHour } = c.hours;
  const hour = arrivedAt.getHours();
  if (hour >= openHour && hour < closeHour) return new Date(arrivedAt.getTime() + FIRST_REPLY_DELAY_MS);

  const opening = new Date(arrivedAt);
  if (hour >= closeHour) opening.setDate(opening.getDate() + 1);
  opening.setHours(openHour, 0, 0, 0);
  return opening;
};

/** Splits a reply into WhatsApp-sized bubbles, at most three, never mid-sentence. */
export const splitBubbles = (text: string, max = 3): string[] => {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= max) return paragraphs;
  const head = paragraphs.slice(0, max - 1);
  return [...head, paragraphs.slice(max - 1).join("\n\n")];
};
