/**
 * The two rulers that run on a clock instead of on a reply.
 *
 * Silence: three touches for whoever stopped answering, each from a different angle —
 * repeating the same line is what gets the number blocked. A checkout link sent gets an
 * extra, earlier touch of its own (§R10.4) — 15 minutes in, before the 30-minute one.
 * Post-order: four messages between the order and the door. This is the ruler that
 * attacks the most expensive event in the operation, the refusal on delivery.
 *
 * Everything here is deterministic: no model call, no cost. The copy comes from
 * docs/agente-ia/06-script/02-script-do-agente.md.
 */

export type SilenceKind = "silence_1" | "silence_2" | "silence_3";
export type OrderKind = "order_confirmed" | "order_shipped" | "order_eve" | "order_delivered";
/** The early touch for a checkout link sent and not finished — see scheduleSilence. */
export type CheckoutKind = "checkout_reminder";
/** A reply the model already wrote, held back by the clock rather than reworded. */
export type DeferredKind = "deferred_reply";
export type FollowupKind = SilenceKind | OrderKind | CheckoutKind | DeferredKind;

/** Where the conversation stopped decides what the first touch says. */
export type StopPoint = "before_size" | "after_price" | "link_sent";

export interface ScheduledFollowup {
  kind: FollowupKind;
  runAt: Date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Every hour here is a Brazilian wall-clock hour, and the runtime's is not: Supabase
 * Edge Functions run in UTC, so `setHours(9)` meant 06:00 in São Paulo and `openHour`
 * 6 meant 03:00 — the very hour the next line warns about. Declared locally, like the
 * config types, so this file keeps zero imports and mirrors byte-for-byte.
 */
export const BUSINESS_TZ = "America/Sao_Paulo";

/** How far `timeZone` sits from UTC at that instant, in minutes. Survives DST. */
export const offsetMinutes = (at: Date, timeZone: string): number => {
  const asUtc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const asLocal = new Date(at.toLocaleString("en-US", { timeZone }));
  return (asLocal.getTime() - asUtc.getTime()) / 60000;
};

/**
 * The next time the clock in São Paulo reads `hour`, as a real instant. The date is
 * shifted into local wall-clock terms, moved there, and shifted back — which is why
 * the body reads in UTC methods while meaning Brazilian hours.
 */
const nextLocalHour = (from: Date, hour: number, sameDayIfEarlier: boolean): Date => {
  const offset = offsetMinutes(from, BUSINESS_TZ);
  const local = new Date(from.getTime() + offset * 60_000);
  const target = new Date(local);
  if (!sameDayIfEarlier || local.getUTCHours() >= hour) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  target.setUTCHours(hour, 0, 0, 0);
  return new Date(target.getTime() - offset * 60_000);
};

/** Next morning at 09:00 — a touch at 03:00 is how a number gets reported. */
const nextMorning = (from: Date, hour = 9): Date => nextLocalHour(from, hour, false);

/**
 * When the send window opens again: the next `openHour` in Brazilian time — later the
 * same day if it has not passed, tomorrow morning if it has.
 */
export const nextOpening = (now: Date, openHour: number): Date =>
  nextLocalHour(now, openHour, true);

/**
 * `hour` o'clock in São Paulo, `days` after the calendar day `date` ("YYYY-MM-DD", the shape
 * `orders.scheduled_for` holds). Null for anything else: no date is no eve, never a guess.
 */
const localDateAt = (date: string | null | undefined, days: number, hour: number): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return null;
  const wall = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, hour));
  return new Date(wall.getTime() - offsetMinutes(wall, BUSINESS_TZ) * 60_000);
};

/** The São Paulo calendar day of an instant, "YYYY-MM-DD". */
const localDay = (at: Date): string =>
  new Date(at.getTime() + offsetMinutes(at, BUSINESS_TZ) * 60_000).toISOString().slice(0, 10);

/**
 * Whether the delivery day is tomorrow in São Paulo — the only day "sua entrega está marcada
 * pra amanhã" is true (D1, 2026-09-29). The sweep checks it again at send time, against the
 * order's date as it is then: a webhook may have moved it, and a pre-date eve has none.
 */
export const eveIsTomorrow = (scheduledFor: string | null | undefined, now: Date): boolean => {
  const from = localDateAt(scheduledFor, -1, 0);
  const to = localDateAt(scheduledFor, 0, 0);
  return from !== null && to !== null && now >= from && now < to;
};

/**
 * Structurally the same as the guardrail chain's `Remedy`, declared here instead of
 * imported so this file keeps zero imports and mirrors byte-for-byte into the Edge
 * Function — the rule `guardrails.ts` and `retry.ts` already follow. A test asserts
 * the three stay assignable.
 */
export type Remedy = "rewrite" | "defer" | "stop";

/**
 * What the cron sweep does with a touch the chain refused.
 *
 * The sweep used to cancel every block alike, and the hours gate is the one that
 * fires most: a customer quiet at 23:30 has her `silence_1` due at midnight, outside
 * the 6-24 window, so the ruler's most valuable touch was destroyed rather than sent
 * at dawn. A clock veto is a later verdict, not a harsher one — the same distinction
 * the turn handler has drawn since the rewrite loop landed.
 *
 * `restartRuler` is the second half of that fix. Moving one touch to the reopening
 * and leaving its siblings where they were compresses the ruler: deferred to 06:00,
 * `silence_2` still lands at 09:00 — three hours later instead of nine, which is how
 * a number gets reported. So the silence ruler is re-anchored on the reopening
 * instead, keeping the 30min / next morning / 3 days shape it was designed with.
 * `checkout_reminder` shares that reopening behavior — a checkout touch deferred by
 * the clock re-anchors the same way a silence touch does. The post-order touches and
 * a deferred reply carry their own meaning at their own time and are only moved.
 *
 * One caveat for whoever wires the channel layer: `pacing` carries `defer` too, and
 * the caller sends a postponed touch to the next opening — right for a daily limit,
 * far too long for an hourly one. It is latent today because the sweep passes no
 * pacing counters (they belong to the channel, which does not exist without the
 * number). Wiring them means giving the caller an hourly retry, not reusing this.
 */
export type TouchAction =
  | { do: "send" }
  | { do: "postpone"; restartRuler: boolean }
  | { do: "cancel" };

/**
 * The touches that chase her silence — the three `silence_*` and the 15-minute checkout
 * touch (§R10.4). Her reply and a sale end all of them; nothing else in the ruler.
 */
export const inSilenceRuler = (kind: string): boolean =>
  kind.startsWith("silence_") || kind === "checkout_reminder";

export const decideTouch = (kind: FollowupKind, remedy: Remedy | null): TouchAction => {
  if (remedy === null) return { do: "send" };
  if (remedy !== "defer") return { do: "cancel" };
  return { do: "postpone", restartRuler: inSilenceRuler(kind) };
};

/**
 * The silence ruler. With `stopPoint` `"link_sent"` it gains an extra, earlier touch —
 * `checkout_reminder` at 15 minutes, asking about trouble with the checkout — before
 * `silence_1` at 30 minutes, which for that same stop point asks whether she managed to
 * finish. Every other stop point, and the omitted-`stopPoint` call every existing caller
 * already makes, keeps the original three-touch shape untouched (§R10.4).
 */
export const scheduleSilence = (now: Date, stopPoint?: StopPoint): ScheduledFollowup[] => {
  const touches: ScheduledFollowup[] = [];
  if (stopPoint === "link_sent") {
    touches.push({ kind: "checkout_reminder", runAt: new Date(now.getTime() + 15 * MINUTE) });
  }
  touches.push(
    { kind: "silence_1", runAt: new Date(now.getTime() + 30 * MINUTE) },
    { kind: "silence_2", runAt: nextMorning(now) },
    { kind: "silence_3", runAt: new Date(now.getTime() + 3 * DAY) },
  );
  return touches;
};

/**
 * The ruler to write when it is (re)anchored. A fresh ruler — the agent just spoke — is
 * `scheduleSilence` whole, except the checkout touch: that one only when THIS reply carried
 * the link (`linkInReply`). The stop point stays `link_sent` for the turns after the link
 * (M-03 window), and re-arming the 15-minute touch on each of them would ask "deu algum
 * problema no checkout?" after every "vou abrir aqui" (second review, 2026-09-28).
 *
 * Re-anchored because a touch was postponed by the clock, the ruler restarts AT that touch:
 * a link sent at 23:40 has its 15-minute touch go out at 23:55, and `silence_1`, deferred
 * past midnight, must not re-arm the touch she already got (sixth review, 2026-09-26) — nor
 * `silence_2` or `silence_3` re-arm the ones before them. The upsert is merge-duplicates, so
 * a kind written here that already went out turns from `sent` back into `scheduled`.
 */
export const rulerFor = (
  from: Date,
  stopPoint: StopPoint,
  postponed?: FollowupKind,
  linkInReply = false,
): ScheduledFollowup[] => {
  const ruler = scheduleSilence(from, stopPoint).filter(
    (f) => f.kind !== "checkout_reminder" || postponed !== undefined || linkInReply,
  );
  const at = ruler.findIndex((f) => f.kind === postponed);
  return at === -1 ? ruler : ruler.slice(at);
};

/**
 * The touch that closes the silence ruler: once it leaves the queue — sent, or cancelled
 * by a gate or the 24-hour window — with no order, the conversation is `perdido` (plan v2,
 * 7.4; operator, 2026-09-26). She can still come back: `furthest` gives way to the stage
 * her next turn reaches. A sale cancels the ruler first, and `pedido_criado` has no edge
 * to `perdido` anyway.
 */
export const endsSilenceRuler = (kind: string): boolean => kind === "silence_3";

/** What the sale webhook says about one order — all the post-order ruler reads. */
export interface OrderFacts {
  readonly orderedAt: Date;
  readonly status: string | undefined;
  /** The delivery day she chose ("YYYY-MM-DD", `orders.scheduled_for`); absent on prepaid. */
  readonly scheduledFor?: string | null | undefined;
}

/**
 * The eve goes out the morning of the day before, at 10:00 in São Paulo: late enough that
 * nobody is woken, early enough that she can still say "não vou estar em casa" and be heard.
 */
const EVE_HOUR = 10;

/**
 * The eve of the delivery: only with a delivery day, and only on the day before it (D1,
 * operator, 2026-09-29). It was armed at orderedAt+30h on both paths, so "sua entrega está
 * marcada pra amanhã" went out on a clock — to a prepaid order that takes five working days,
 * and to a COD order whose day she chose herself in the checkout. Past 10:00 of that day, it
 * leaves soon; on the delivery day or later, not at all. Never before the confirmation.
 */
const eveAt = (order: OrderFacts, now: Date): Date | null => {
  const morning = localDateAt(order.scheduledFor, -1, EVE_HOUR);
  const deliveryDay = localDateAt(order.scheduledFor, 0, 0);
  if (!morning || !deliveryDay) return null;
  const at = new Date(Math.max(morning.getTime(), now.getTime() + 5 * MINUTE, order.orderedAt.getTime() + HOUR));
  return at < deliveryDay ? at : null;
};

/**
 * Post-order ruler, from the order's status and date instead of the clock (Q1, operator,
 * 2026-09-29). The confirmation is the only one the order alone arms. "A caminho" waits for
 * a status that reads `em_rota` — at orderedAt+24h it said so of a parcel still in the
 * warehouse — and "Chegou?!" for one that reads `entregue_pago`, a couple of hours after.
 * The eve needs the date (`eveAt`). Callers filter by what exists.
 */
export const scheduleOrder = (order: OrderFacts, now: Date): ScheduledFollowup[] => {
  const touches: ScheduledFollowup[] = [
    { kind: "order_confirmed", runAt: new Date(order.orderedAt.getTime() + 5 * MINUTE) },
  ];
  const stage = stageForOrder(order.status);
  // An hour after the confirmation at the earliest: two messages together get a number reported.
  if (stage === "em_rota") {
    touches.push({
      kind: "order_shipped",
      runAt: new Date(Math.max(now.getTime() + 10 * MINUTE, order.orderedAt.getTime() + HOUR)),
    });
  }
  const eve = eveAt(order, now);
  if (eve) touches.push({ kind: "order_eve", runAt: eve });
  if (stage === "entregue_pago") touches.push({ kind: "order_delivered", runAt: new Date(now.getTime() + 2 * HOUR) });
  // What the status already made moot is never planned: a delivered order with a date still
  // ahead planned its eve, and `orderTakeOver` handed it on after the parcel arrived.
  return touches.filter((f) => orderTouchDue(f.kind, order.status));
};

/**
 * Same customer, same variant; different customers, different variants — without a
 * model call. It is what stops one literal message going out to hundreds of numbers.
 */
/**
 * What a confirmed sale does to the schedule, decided here instead of in the handler so
 * a test can hold it. Two halves, and the second is the one that was missing entirely.
 *
 * Arming the post-order ruler is the obvious half. Cancelling the silence ruler is the
 * half that matters: until 2026-09-09 nothing in this system knew a sale had happened,
 * so a customer who paid at the door still got "ainda tá pensando?" three days later.
 * The touches are per conversation and the sale closes that conversation's question, so
 * every scheduled silence touch dies with it — the post-order ruler takes over.
 *
 * `order_*` touches already scheduled are left alone: a second webhook for the same sale
 * (retry, status change) must not slide the delivery-eve message off its date. The one
 * exception is `move`: a webhook with a NEW delivery day re-dates the eve this order holds,
 * in place — `(conversation_id, kind)` is unique, and the arm is an ignore-duplicates insert.
 */
export interface OrderEffect {
  readonly cancel: readonly FollowupKind[];
  readonly arm: readonly ScheduledFollowup[];
  /** Rows this order already holds, not sent, to reschedule (status back to scheduled). */
  readonly move: readonly ScheduledFollowup[];
}

/** A row as the table holds it: the kind, and whether it is still waiting to go out. */
export interface ExistingFollowup {
  readonly kind: FollowupKind;
  readonly status: "scheduled" | "sent" | "canceled";
  /** The order that armed a post-order touch; null for silence and for rows before 0017. */
  readonly orderId?: string | null;
  /** When it is (or was) due — how a new delivery day is told apart from the same one. */
  readonly runAt?: Date;
}

/**
 * A status that means the sale is off.
 *
 * The post-order ruler is armed by the first webhook, when the order is created. Every
 * later webhook for the same sale carries a status, and until this existed none of them
 * meant anything: a woman who cancelled still had `order_eve` scheduled, so the day
 * before the delivery she would have been told "sua entrega está marcada pra amanhã,
 * deixa R$ 129,90 separado". That is the message that burns the number and the brand at
 * once, and nothing in the system was stopping it.
 *
 * Matched by root rather than by an exact list, because neither platform publishes its
 * status vocabulary and both write in Portuguese with their own wording — "Cancelado",
 * "cancelado pelo cliente", "Recusado na entrega". A root missed here fails the way it
 * failed before, which is the floor, not a new risk.
 */
export const isOrderDead = (status: string | undefined): boolean =>
  /cancel|recus|devolv|estorn|reembols|refund|refus|return/i.test(status ?? "");

/**
 * The status an order keeps when a webhook arrives: a dead order stays dead (third review,
 * 2026-09-28). The row was upserted last-arrival-wins, so a late "created" or "Enviado" after
 * "Cancelado" brought the order back to life — the lead's other order then saw a live
 * sibling, the dead one's touches never moved, and a cancelled order got the whole ruler.
 *
 * A delivered order stays delivered too, except by death — "Devolvido" after "Entregue" is a
 * real return (PR #39 review, finding 1). A late "created" or "Em rota" after "Entregue" put
 * the order back on its way: `onOrderConfirmed` re-armed confirmation, shipping and eve, and
 * the sweep sent "sua entrega está marcada pra amanhã" after the parcel had arrived.
 */
const ORDER_RANK = { pedido_criado: 0, em_rota: 1, entregue_pago: 2 } as const;
export const orderStatusAfter = (stored: string | null | undefined, incoming: string): string => {
  if (isOrderDead(stored ?? undefined) && !isOrderDead(incoming)) return stored!;
  // A late earlier status never walks the order back — delivered stays delivered, on its way stays on
  // its way ("Em rota" then a late "created" wrote "created", independent review, finding 19). A dead
  // status may still arrive after any of them ("Devolvido" after delivery), and a status that reads as
  // no stage ("Não entregue", a failed attempt) is recorded as it came.
  const was = stageForOrder(stored ?? undefined);
  const now = stageForOrder(incoming);
  // Delivered is final for anything but death — "Não entregue" after "Entregue" included.
  if (stored != null && was === "entregue_pago" && !isOrderDead(incoming)) return stored;
  if (stored != null && was !== null && now !== null && was !== "recusado" && now !== "recusado" && ORDER_RANK[now] < ORDER_RANK[was])
    return stored;
  return incoming;
};

/**
 * Where a sale leaves the funnel, from the order status the sale webhook carries (plan v2,
 * 5.8). Until this existed nobody wrote `em_rota`, `entregue_pago` or `recusado`, so the
 * funnel stopped at `pedido_criado` and the one number the operator buys — delivered and
 * paid — did not exist in the database. Read by root, like `isOrderDead`, because neither
 * platform publishes its vocabulary. Paid is not delivered: a prepaid "Pagamento
 * aprovado" is still an order waiting to ship. A failed attempt ("não entregue",
 * "frustrada") may be retried and `recusado` is terminal, so it moves nothing. Handed to the
 * carrier ("Entregue à transportadora", "entregue aos Correios") is on its way, not at her
 * door: read as delivered, it cancelled the shipping and the eve and counted a sale paid.
 */
export const stageForOrder = (
  status: string | undefined,
): "pedido_criado" | "em_rota" | "entregue_pago" | "recusado" | null => {
  const s = (status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bnao\s+entreg|frustrad|insucess/.test(s)) return null;
  if (isOrderDead(s)) return "recusado";
  if (/\bentregue\s+(?:(?:a|ao|aos|as|o|os|para|pra|pro|pros)\s+)+(?:transportador|correio)/.test(s)) return "em_rota";
  if (/\bentregue\b|\bdelivered\b|\bconclui|\bfinalizad/.test(s)) return "entregue_pago";
  if (/\bem\s+rota\b|transit|\benviad|\bshipped\b|\bdespachad|\bsaiu\s+(?:para|pra)\b|\bcoletad|\bexpedid/.test(s)) return "em_rota";
  return "pedido_criado";
};

/**
 * The stage for the whole lead, not just this order: with two orders, one cancelled while
 * the other is on its way must not lock the conversation in `recusado` (terminal) — the
 * delivered one would then count as a refusal forever. `others` are the lead's other orders.
 */
export const stageForLead = (
  status: string | undefined,
  others: readonly string[],
): ReturnType<typeof stageForOrder> => {
  const reached = stageForOrder(status);
  return reached === "recusado" && others.some((s) => !isOrderDead(s)) ? null : reached;
};

/**
 * Whether a post-order touch still has something to say, given its order's status. A dead
 * order has nothing; a delivered one has only the after-delivery touch — `order_eve` was
 * armed at orderedAt+30h and did not know the parcel arrived, so "sua entrega está marcada
 * pra amanhã, deixa R$ 129,90 separado" went out after "Entregue" (HANDOFF, pre-existing).
 * The eve's own date is a second check, at send time (`eveIsTomorrow`).
 */
export const orderTouchDue = (kind: FollowupKind, status: string | undefined): boolean =>
  !isOrderDead(status) && (stageForOrder(status) !== "entregue_pago" || kind === "order_delivered");

/**
 * Whether the silence ruler may chase her at all. A sale cancels it once (`onOrderConfirmed`),
 * and the next thing she wrote — "obrigada!", "chega quando?" — re-armed it: the scheduler
 * read neither the stage nor the orders, and the buyer heard "que tamanho você usa?" and the
 * coupon (HANDOFF, pre-existing). A live order of the lead, or a stage the sale webhook
 * writes, stops it. Only dead orders — a refusal, a cancellation — make her a prospect again,
 * the same reading `stageForLead` and `reopensRefused` give "vivo" (§16).
 */
export const chasesSilence = (stage: string | null | undefined, orderStatuses: readonly string[]): boolean =>
  !["pedido_criado", "em_rota", "entregue_pago"].includes(stage ?? "") && orderStatuses.every((s) => isOrderDead(s));

export const onOrderConfirmed = (
  existing: readonly ExistingFollowup[],
  orderedAt: Date,
  now: Date,
  status?: string,
  orderId?: string,
  /** The delivery day in force — the webhook's, or the one stored when it brings none. */
  scheduledFor?: string | null,
): OrderEffect => {
  const scheduled = existing.filter((f) => f.status === "scheduled");
  const theirs = (f: ExistingFollowup) => !orderId || !f.orderId || f.orderId === orderId;

  // The sale is off. Everything still waiting dies with it — the post-order touches
  // because there is no delivery to talk about, and the silence ones because chasing
  // someone who just cancelled is worse than saying nothing. Nothing is armed.
  //
  // With two orders on one lead, only the dead one's touches go. The rows are one per kind
  // per conversation, so the live order usually has none of its own: `orderTakeOver` moves
  // them to it. A row that does not say its order (before 0017) dies as before.
  if (isOrderDead(status)) {
    return { cancel: scheduled.filter(theirs).map((f) => f.kind), arm: [], move: [] };
  }
  const plan = scheduleOrder({ orderedAt, status, scheduledFor }, now);

  // Delivered: the confirmation, the shipping and the eve have nothing left to say — and the
  // first webhook may already be "Entregue", which armed the whole ruler. This order's pending
  // ones go with the silence ruler; only the after-delivery touch is armed (`orderTouchDue`).
  if (stageForOrder(status) === "entregue_pago") {
    return {
      cancel: scheduled
        .filter((f) => inSilenceRuler(f.kind) || (f.kind.startsWith("order_") && theirs(f) && !orderTouchDue(f.kind, status)))
        .map((f) => f.kind),
      arm: plan.filter(
        (f) => !existing.some((e) => e.kind === f.kind) && orderTouchDue(f.kind, status),
      ),
      move: [],
    };
  }

  // A new delivery day re-dates the eve this order holds, not sent: at the old date the sweep
  // would find the day wrong and cancel it, and she would get no eve at all. The same day again
  // (a retry, another status) moves nothing — nor revives a row cancelled for that day.
  const eve = plan.find((f) => f.kind === "order_eve");
  const held = existing.find((e) => e.kind === "order_eve" && e.status !== "sent" && theirs(e));

  return {
    // Only what is still waiting can be cancelled; a touch already sent is history.
    cancel: scheduled.filter((f) => inSilenceRuler(f.kind)).map((f) => f.kind),
    // Dedupe against EVERY row, not just the scheduled ones. A second webhook arriving
    // after `order_confirmed` already went out would otherwise re-arm a kind the table
    // still holds as `sent`, and `unique (conversation_id, kind)` turns that into a throw
    // — the whole call 500s, the status update is lost, and n8n retries into the same wall.
    arm: plan.filter(
      (f) => !existing.some((e) => e.kind === f.kind),
    ),
    move: eve && held?.runAt && localDay(held.runAt) !== localDay(eve.runAt) ? [eve] : [],
  };
};

/** One of the lead's orders, as the sale webhook sees them. */
export interface LeadOrder extends OrderFacts {
  readonly id: string;
}

/**
 * The post-order touches a live order takes over from a dead one (second review, 2026-09-28).
 *
 * `(conversation_id, kind)` is unique, so a lead's second order never gets rows of its own —
 * `onOrderConfirmed` dedupes against every row. Two ways that left a live order with no eve:
 * A and B created, A cancelled, and A's rows were the only ones there were; or A cancelled,
 * then B created, and every kind was already taken by A's cancelled row. A row not sent,
 * armed by a dead order, moves to the live one — its id and its dates. A moment already past
 * is not sent late. Nothing moves onto the order whose own rows died: a late webhook of a
 * cancelled order does not bring its touches back. Null when nothing moves.
 */
export const orderTakeOver = (
  existing: readonly ExistingFollowup[],
  order: LeadOrder,
  /** The lead's other orders, newest first. */
  others: readonly LeadOrder[],
  now: Date,
): { orderId: string; arm: ScheduledFollowup[] } | null => {
  const live = isOrderDead(order.status) ? others.find((o) => !isOrderDead(o.status)) : order;
  if (!live) return null;
  const dead = [order, ...others].filter((o) => isOrderDead(o.status)).map((o) => o.id);
  const arm = scheduleOrder(live, now).filter(
    (f) =>
      f.runAt > now &&
      existing.some((e) => e.kind === f.kind && e.status !== "sent" && !!e.orderId && dead.includes(e.orderId)),
  );
  return arm.length > 0 ? { orderId: live.id, arm } : null;
};

/**
 * `recusado` is terminal for the conversation, and a second order is a new sale: this order
 * alive while another of the lead's is dead reopens it (second review, 2026-09-28). A late
 * webhook of the order that died does not — `others` never holds the order itself.
 */
export const reopensRefused = (status: string | undefined, others: readonly string[]): boolean =>
  !isOrderDead(status) && others.some((s) => isOrderDead(s));

export const pickVariant = <T>(leadId: string, variants: readonly T[]): T => {
  let hash = 0;
  for (const char of leadId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return variants[hash % variants.length]!;
};

const brl = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * The copy is warm on purpose, and specific on purpose.
 *
 * The woman on the other side usually stopped wearing something she likes because she
 * did not feel good in it. The touch that works names that piece — the dress, the white
 * shirt, the photo — instead of praising her in the abstract, and it never suggests
 * there is something wrong with her. What changes is how the clothes fall, and saying
 * exactly that is both the honest line and the one that sells: she has been promised
 * weight loss before and recognises someone who is not lying to her.
 *
 * Every variant here passes the guardrail chain, and the range asserts it — copy the
 * cron generates and then refuses is a touch the customer never gets.
 */
const SILENCE_1 = (days: number): Record<StopPoint, readonly string[]> => ({
  before_size: [
    "Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛",
    "Oi! Pensa naquela roupa que está parada no armário esperando um dia bom. Me fala o tamanho de calça que você usa e eu te digo qual colete deixa ela caindo do jeito que você gosta 💛",
  ],
  after_price: [
    "Qualquer coisa é só chamar! Lembrando que você não paga nada agora — o pagamento é só quando o colete chegar na sua mão.",
    // The courier does not wait for her to try it on (Q4, operator, 2026-09-29): she sees it,
    // pays at the door, and what is not what she expected she does not keep. The return after
    // receiving is at the store's cost (Q3).
    `Fico por aqui se precisar! E lembra: não sai nada do seu bolso agora. Você vê o colete na hora da entrega e paga ali mesmo, ao entregador — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem ${days} dias pra devolver, sem custo nenhum pra você.`,
  ],
  link_sent: [
    "Conseguiu finalizar seu pedido? Se travou em algum passo, é só me falar que eu te ajudo por aqui mesmo 😊",
    "Passando pra ver: deu certo de fechar o pedido? Se preferir, eu monto o link de novo pra você.",
  ],
});

/**
 * The prepaid deadline sentence, on the gate's reading (`prepayAverage`): the average only when
 * the config says it varies by region. Empty when not — no deadline, never a guess or a range.
 */
const prepayAvgLine = (c: FollowupConfig): string =>
  c.delivery.prepayVariesByRegion && c.delivery.prepayAvgDays != null
    ? `No antecipado, o prazo varia por região, em média ${c.delivery.prepayAvgDays} dias úteis.`
    : "";

/**
 * `after_price` for a woman on the prepaid path — she chose it, or her region has no payment
 * at the door (D3/Q2, operator, 2026-09-29). "Você não paga nada agora" is false there. What
 * is true and sells is the discount and the deadline, read from the config the way the gate
 * reads them: the percentage with the price (never the saving in reais), and the average only
 * when the config says it varies by region. A missing key drops its clause, never guesses.
 */
const silence1Prepay = (c: FollowupConfig): readonly string[] => {
  const { prepayBrl, prepayDiscountPercent } = c.prices;
  const price =
    prepayBrl == null ? "" : (prepayDiscountPercent ?? 0) > 0 ? `com ${prepayDiscountPercent}% de desconto: ${brl(prepayBrl)}` : `por ${brl(prepayBrl)}`;
  const avg = prepayAvgLine(c) ? ` ${prepayAvgLine(c)}` : "";
  return [
    `Qualquer coisa é só chamar!${price ? ` Lembrando que no pagamento antecipado você leva o colete ${price}.` : ""}${avg}`,
    `Fico por aqui se precisar!${price ? ` E lembra: pagando antecipado, o colete sai ${price}.` : ""}${avg}`,
  ];
};

/**
 * The 15-minute checkout touch (§R10.4) — earlier and narrower than `silence_1`. It
 * only ever fires for the `link_sent` stop point, so it does not need a `StopPoint`
 * lookup the way `SILENCE_1` does: it asks one thing, whether something is in the way.
 */
const CHECKOUT_REMINDER: readonly string[] = [
  "Oi! Só passando pra lembrar de finalizar seu pedido 💛 Ficou alguma dúvida ou travou em algum passo? Me conta que eu te ajudo.",
  "Oi! Vi que o link do pedido ainda está aberto. Precisa de alguma ajuda pra finalizar, ou ficou alguma dúvida?",
];

/**
 * The warranty is written from the config, not typed into the sentence. It used to be
 * "7 dias" in the string while `warranty_promise` read `warrantyDays` — so changing the
 * config turned the ruler's own copy into a veto, and the sweep, which treats a rewrite
 * remedy as a cancel, would have thrown the touch away without a word.
 */
/**
 * Both used to say she wears it before paying ("você vê, veste, e só paga se estiver tudo
 * certo"; "só paga se, ao se olhar no espelho, achar que valeu") — the courier does not wait
 * for that (Q4, operator, 2026-09-29). True: she sees it and pays at the door, does not keep
 * what is not what she expected, and after receiving has the warranty days to return it, at
 * no cost to her — the store pays the return (Q3).
 */
const SILENCE_2 = (days: number) =>
  [
    `Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem ${days} dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.`,
    `Bom dia! 💛 Ontem você chegou perto e parou — e eu entendo, promessa demais já foi feita pra você. Então vou ser direta: o colete não muda o seu corpo, ele muda como a roupa cai enquanto você usa. É a roupa que você já tem, caindo do jeito que você queria. E você só paga quando ele chegar na sua mão — e, depois de receber, ainda tem ${days} dias pra devolver sem custo nenhum se achar que não valeu. É só me chamar.`,
  ] as const;

/** The same angles on the prepaid path: she pays first, so nothing about paying at the door. */
const SILENCE_2_PREPAY = (days: number) =>
  [
    `Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: comprar sem ver dá um frio na barriga, eu sei. Então fica tranquila: depois que o colete chega na sua casa, você tem ${days} dias pra devolver se não for o que você esperava, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.`,
    `Bom dia! 💛 Ontem você chegou perto e parou — e eu entendo, promessa demais já foi feita pra você. Então vou ser direta: o colete não muda o seu corpo, ele muda como a roupa cai enquanto você usa. É a roupa que você já tem, caindo do jeito que você queria. E se, com ele na mão, você achar que não valeu, tem ${days} dias pra devolver sem custo nenhum. É só me chamar.`,
  ] as const;

const SILENCE_3_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

/** The weekday on the São Paulo calendar — the runtime's is UTC, a day ahead after 21h. */
const localWeekday = (at: Date): string =>
  SILENCE_3_DAYS[(new Date(at.getTime() + offsetMinutes(at, BUSINESS_TZ) * 60_000).getUTCDay() + 6) % 7]!;

/**
 * A value this file can put into a template placeholder. Small on purpose: every entry
 * is something the copy already says, so a template can only ever be filled with what
 * the free-text version would have said in the same sentence.
 */
export type TemplateVariable =
  | "price"
  | "warrantyDays"
  | "size"
  | "address"
  | "couponPercent"
  | "weekday";

/** One template already approved by Meta, as the config declares it. */
export interface TemplateBinding {
  readonly name: string;
  readonly language: string;
  /** The placeholder order as approved — {{1}} is the first entry. Approval fixes it. */
  readonly variables: readonly TemplateVariable[];
}

/** Only what the copy reads. Declared locally so this file has zero imports and
 * runs byte-identical in Deno and in vitest, like the guardrail chain. */
export interface FollowupConfig {
  /** The prepaid keys are optional here: a missing one drops its clause from the copy. */
  prices: { codBrl: number; prepayBrl?: number; prepayDiscountPercent?: number };
  coupon: { percent: number; active: boolean };
  delivery: {
    codDaysMin: number;
    codDaysMax: number;
    warrantyDays: number;
    prepayAvgDays?: number;
    prepayVariesByRegion?: boolean;
  };
  /**
   * OPTIONAL, and absent means no template is approved yet. That is not laziness: in
   * production the whole config comes from a `BUSINESS_CONFIG` secret that overrides the
   * fallback wholesale, so a key added in code is simply missing there until the operator
   * edits the secret. Absent has to be the safe reading, and here safe is blocking the
   * out-of-window touch — free text outside the window is rejected by Meta anyway, so
   * the alternative is a touch that silently never arrives.
   */
  channel?: {
    /**
     * `order_eve_pago` is the prepaid eve's own template (no "Deixa R$ X separado"): absent,
     * a prepaid eve outside the window is blocked rather than sent the one that charges her.
     */
    templates?: Partial<Record<FollowupKind | "order_eve_pago", TemplateBinding>>;
  };
}

export interface RenderContext {
  leadId: string;
  config: FollowupConfig;
  stopPoint?: StopPoint;
  now?: Date;
  size?: string;
  address?: string;
  /**
   * The order's own total and pieces (fifth review, kits): "deixa R$ 129,90 separado" on a
   * kit of R$ 233,82 is the surprise at the door the post-order ruler exists to prevent.
   * Absent means one piece at the configured price.
   */
  amountBrl?: number;
  units?: number;
  /** She already paid (prepaid order): nothing is due at the door (sixth review). */
  prepaid?: boolean;
  /** The order's delivery day ("YYYY-MM-DD", `orders.scheduled_for`), when it has one. */
  scheduledFor?: string | null;
  /**
   * The path the silence touches speak of (D3): "prepay" when she chose it or her region has
   * no payment at the door. Absent reads "cod", the truth for a region nobody looked up.
   */
  paymentPath?: "cod" | "prepay";
  /** The already-written text, for a deferred reply. */
  body?: string;
  /**
   * Her marketing consent is in force (R15.1): `leads.marketing_opt_in_at`, read only when
   * `channel.askMarketingOptIn` is on. Absent = no consent, so no MARKETING template.
   */
  marketingOptIn?: boolean;
}

/**
 * The coupon is the `silence_3` touch's offer to someone who did not buy the first time, not
 * the conversation's (operator, 2026-09-30, R17.4). Until that touch reached her, the turn reads
 * the coupon as off — briefing, prompt, discount gate and `coupon_exists` all take this config —
 * and the ruler keeps reading the operator's, so the touch itself still goes out.
 */
export const conversationCoupon = <C extends { coupon: { percent: number; active: boolean } }>(
  config: C,
  couponTouchSent: boolean,
): C => (config.coupon.active && !couponTouchSent ? { ...config, coupon: { ...config.coupon, active: false } } : config);

/**
 * Renders the message for a touch. Returns null when the touch must not go out —
 * today that is only the coupon one, which is silent until the coupon exists in
 * Coinzz. Announcing a coupon that has no destination is the broken promise this
 * project already decided never to make.
 */
export const renderFollowup = (kind: FollowupKind, ctx: RenderContext): string | null => {
  const now = ctx.now ?? new Date();
  const price = brl(ctx.amountBrl ?? ctx.config.prices.codBrl);
  // A kit's sizes are stored "M,G"; she reads "M e G".
  const sizes = (ctx.size ?? "—").split(",").join(" e ");
  const item = (ctx.units ?? 1) > 1 ? `Kit de ${ctx.units} coletes, tamanhos **${sizes}**` : `Colete tamanho **${sizes}**`;

  switch (kind) {
    // Nothing to render: the text was written when the turn happened. A missing body
    // means the row is unusable, and returning null cancels the touch rather than
    // sending an empty message.
    case "deferred_reply":
      return ctx.body?.trim() ? ctx.body : null;

    case "checkout_reminder":
      return pickVariant(ctx.leadId, CHECKOUT_REMINDER);

    case "silence_1":
      return pickVariant(
        ctx.leadId,
        ctx.paymentPath === "prepay" && ctx.stopPoint === "after_price"
          ? silence1Prepay(ctx.config)
          : SILENCE_1(ctx.config.delivery.warrantyDays)[ctx.stopPoint ?? "before_size"],
      );

    case "silence_2":
      return pickVariant(
        ctx.leadId,
        (ctx.paymentPath === "prepay" ? SILENCE_2_PREPAY : SILENCE_2)(ctx.config.delivery.warrantyDays),
      );

    case "silence_3": {
      if (!ctx.config.coupon.active) return null;
      // "Super + dia da semana" — a seasonal frame with no calendar to maintain.
      const weekday = localWeekday(now);
      return (
        `**Super ${weekday}!** 🎉 Separei um cupom de **${ctx.config.coupon.percent}% de desconto** ` +
        // Where she only has the prepaid path, "nos dois jeitos" names one she cannot use (R16.2).
        (ctx.paymentPath === "prepay"
          ? `pra você, e ele vale no pagamento antecipado.\n\n`
          : `pra você — e ele vale nos dois jeitos: pagando na entrega ou antecipado.\n\n`) +
        `Se quiser, eu monto o pedido agora com o desconto já aplicado. E se não for o momento, ` +
        `tudo bem também — é só me falar que eu não te mando mais nada 💛`
      );
    }

    case "order_confirmed": {
      // Prepaid, she is told when it arrives (Q5, operator, 2026-09-29): the day the order holds,
      // or the regional average. On delivery she chose the day herself, in the checkout.
      const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(ctx.scheduledFor ?? "");
      const eta = !ctx.prepaid ? "" : day ? `Sua entrega está prevista para ${day[2]}/${day[1]}.` : prepayAvgLine(ctx.config);
      return (
        `Pedido confirmado! 🎉 ${item}, ${ctx.prepaid ? `${price}, já pago` : `${price} na entrega`}` +
        `${ctx.address ? `, indo pra ${ctx.address}` : ""}.\n` +
        (eta ? `${eta}\n` : "") +
        `Eu vou acompanhar sua entrega do começo ao fim — qualquer coisa, é só me chamar aqui mesmo.`
      );
    }

    // Armed by a status that reads `em_rota`. Not "assim que a transportadora agendar o dia"
    // (D2): on delivery she chose the day herself, in the checkout. Nor "na véspera eu te
    // aviso": a prepaid order has no date and gets no eve, and "Saiu para entrega" is the day.
    case "order_shipped":
      return "Oi! Seu colete já está a caminho 🚚 Qualquer dúvida sobre a entrega, é só me chamar aqui mesmo.";

    case "order_eve":
      return (
        `Oi! Sua entrega está marcada pra **amanhã** 💛\n` +
        (ctx.prepaid ? "" : `Deixa **${price}** separado — pode ser dinheiro ou cartão, na maquininha do entregador.\n`) +
        `Se você não estiver em casa amanhã, me avisa que eu tento remarcar.`
      );

    case "order_delivered":
      return (
        "Chegou?! 😍 Me conta: já vestiu com aquela roupa que você tinha em mente?\n" +
        "Dica de primeira vez: feche os colchetes na fileira mais folgada e vá apertando com o uso — é bem mais confortável assim.\n" +
        "E se quiser mandar uma foto do antes e depois com a roupa, eu adoro ver (e ninguém publica nada sem sua autorização)."
      );
  }
};

/**
 * WhatsApp Cloud API's customer service window: free text is only accepted within 24
 * hours of HER last inbound message. Outside it, the only thing that goes out is a
 * template Meta approved in advance.
 *
 * This is what forces the ruler's shape into the channel. `silence_3` is three days
 * out and always outside. `silence_2` is the next morning at 09:00, which is inside
 * when she went quiet in the afternoon and outside when she went quiet at dawn — so
 * the kind alone never answers the question, only the clock does. And the post-order
 * touches are anchored on the sale, not on her: an order that arrives by webhook from
 * a woman who never messaged has no open window at all.
 */
export const SERVICE_WINDOW_MS = 24 * HOUR;

/**
 * Closed 10 minutes early (security review, 2026-09-25): the sweep decides at one moment and
 * the send leaves seconds to minutes later, and Meta judges at send time. A template is
 * always accepted; free text one minute late is refused (131047) and lost.
 */
export const SERVICE_WINDOW_SAFETY_MS = 10 * MINUTE;

/** Exactly 24 hours is already closed — the boundary send is the one Meta rejects. */
export const windowIsOpen = (now: Date, lastInboundAt: Date | null): boolean =>
  lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS - SERVICE_WINDOW_SAFETY_MS;

/** Cloud API's limit on a text body; a longer one is refused after it was already stored. */
const TEXT_BODY_MAX = 4096;
/** A second submit of the same text this soon is the form clicked twice, not a new message. */
const DOUBLE_SUBMIT_MS = 2 * MINUTE;

export type HumanReplyRefusal = "empty" | "too_long" | "no_lead" | "opted_out" | "window_closed" | "duplicate";

/** What the operator reads on the form when the reply does not leave (L0.3). */
export const HUMAN_REPLY_REFUSAL: Readonly<Record<HumanReplyRefusal, string>> = {
  empty: "A mensagem está vazia.",
  too_long: "A mensagem passa de 4096 caracteres, o limite do WhatsApp. Divida em duas.",
  no_lead: "Nenhuma conversa com esse telefone. Confira o número (com 55 e DDD), como veio no e-mail de handoff.",
  opted_out: "Ela pediu para não receber mais mensagens. Nada foi enviado.",
  window_closed:
    "Passaram quase 24 h desde a última mensagem dela: o WhatsApp só aceita texto livre dentro dessa janela. Nada foi enviado.",
  duplicate:
    "Essa mesma mensagem foi gravada para ela há menos de 2 min. Se o e-mail \"Mensagem NAO entregue\" chegou, espere 2 min e envie de novo.",
};

/**
 * Whether a reply a person typed in the n8n form "Responder cliente" may go to her (L0.3,
 * 2026-09-30). Free text only, so the same window as the ruler; never to a woman who asked
 * to stop; and one message per click, whatever the form does with a double click.
 */
export const checkHumanReply = (input: {
  readonly now: Date;
  readonly text: string;
  readonly lead: { readonly opted_out_at: string | null } | null;
  readonly lastInboundAt: Date | null;
  readonly lastOutbound: { readonly body: string; readonly at: Date } | null;
}): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: HumanReplyRefusal } => {
  const text = input.text.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > TEXT_BODY_MAX) return { ok: false, reason: "too_long" };
  if (!input.lead) return { ok: false, reason: "no_lead" };
  if (input.lead.opted_out_at) return { ok: false, reason: "opted_out" };
  if (!windowIsOpen(input.now, input.lastInboundAt)) return { ok: false, reason: "window_closed" };
  const last = input.lastOutbound;
  if (last && last.body.trim() === text && input.now.getTime() - last.at.getTime() < DOUBLE_SUBMIT_MS) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, text };
};

/** How a touch leaves, once the clock has been consulted. */
export type Delivery =
  | { readonly via: "text"; readonly body: string }
  | {
      readonly via: "template";
      readonly name: string;
      readonly language: string;
      readonly variables: readonly string[];
      readonly body: string;
    }
  | { readonly via: "blocked"; readonly reason: "no_template" | "empty_variable" | "no_opt_in" };

const resolveVariable = (variable: TemplateVariable, ctx: RenderContext): string => {
  switch (variable) {
    case "price":
      return brl(ctx.amountBrl ?? ctx.config.prices.codBrl);
    case "warrantyDays":
      return String(ctx.config.delivery.warrantyDays);
    case "size":
      return ctx.size ?? "";
    case "address":
      return ctx.address ?? "";
    case "couponPercent":
      return String(ctx.config.coupon.percent);
    case "weekday":
      return localWeekday(ctx.now ?? new Date());
  }
};

/**
 * The touch, decided end to end: what it says, and how it is allowed to leave.
 *
 * `null` keeps the meaning it already had — nothing to say, cancel the row — so the
 * sweep's existing handling of a silent touch is unchanged. What is new is the third
 * outcome: a touch with real copy that still cannot go out, because the window closed
 * and nobody has approved a template for it. That is a blocked touch, not a cancelled
 * one, and it says so, because the fix is the operator registering the template.
 *
 * A template parameter may not be empty — Meta refuses the send — so a placeholder that
 * resolves to nothing blocks the touch here instead of failing at the channel, where
 * the only trace would be an API error nobody reads.
 */
export const deliveryFor = (
  kind: FollowupKind,
  ctx: RenderContext,
  lastInboundAt: Date | null,
): Delivery | null => {
  const body = renderFollowup(kind, ctx);
  if (body === null) return null;

  if (windowIsOpen(ctx.now ?? new Date(), lastInboundAt)) return { via: "text", body };

  // `silence_2` and `silence_3` are MARKETING templates: only to someone who said yes (R15.1).
  if ((kind === "silence_2" || kind === "silence_3") && ctx.marketingOptIn !== true) {
    return { via: "blocked", reason: "no_opt_in" };
  }

  // The `silence_2` template is the delivery path's text ("só paga ao entregador"): on the
  // prepaid path there is no template, so the touch is blocked rather than sent that one (D3).
  if (kind === "silence_2" && ctx.paymentPath === "prepay") return { via: "blocked", reason: "no_template" };
  // Same for the coupon: its template says "nos dois jeitos: pagando na entrega ou antecipado".
  if (kind === "silence_3" && ctx.paymentPath === "prepay") return { via: "blocked", reason: "no_template" };

  // One template per touch, and `body` is what it says — the text the sweep gates: `silence_2`
  // leaves as its first variant (R15.2), and a prepaid eve by its own template.
  const template = ctx.config.channel?.templates?.[kind === "order_eve" && ctx.prepaid ? "order_eve_pago" : kind];
  if (!template) return { via: "blocked", reason: "no_template" };

  const variables = template.variables.map((v) => resolveVariable(v, ctx));
  if (variables.some((v) => v.trim() === "")) return { via: "blocked", reason: "empty_variable" };

  return {
    via: "template",
    name: template.name,
    language: template.language,
    variables,
    body: kind === "silence_2" ? SILENCE_2(ctx.config.delivery.warrantyDays)[0] : body,
  };
};
