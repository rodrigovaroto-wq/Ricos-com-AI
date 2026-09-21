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

export const decideTouch = (kind: FollowupKind, remedy: Remedy | null): TouchAction => {
  if (remedy === null) return { do: "send" };
  if (remedy !== "defer") return { do: "cancel" };
  return { do: "postpone", restartRuler: kind.startsWith("silence_") || kind === "checkout_reminder" };
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
 * Post-order ruler. `shipped` and `eve` only get a real time once logistics says so;
 * until then they sit at the estimate, which is what the customer was told.
 */
export const scheduleOrder = (orderedAt: Date, codDaysMin: number): ScheduledFollowup[] => [
  { kind: "order_confirmed", runAt: new Date(orderedAt.getTime() + 5 * MINUTE) },
  { kind: "order_shipped", runAt: new Date(orderedAt.getTime() + DAY) },
  /**
   * The eve of the delivery, and never before the order exists. It used to be
   * `(codDaysMin - 1)` days out, and `codDaysMin` is 1 — so "sua entrega é amanhã, separe
   * R$ 129,90" fired at order time, ahead of the confirmation itself.
   *
   * Counted in hours because the floor and the shipping touch collide otherwise: with a
   * one-day window both would land at +24h, and two messages arriving together is how a
   * number gets reported. Thirty hours puts it the following day, after the parcel left.
   */
  {
    kind: "order_eve",
    runAt: new Date(orderedAt.getTime() + Math.max(30, (codDaysMin - 1) * 24) * HOUR),
  },
  { kind: "order_delivered", runAt: new Date(orderedAt.getTime() + (codDaysMin + 1) * DAY) },
];

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
 * (retry, status change) must not slide the delivery-eve message off its date.
 */
export interface OrderEffect {
  readonly cancel: readonly FollowupKind[];
  readonly arm: readonly ScheduledFollowup[];
}

/** A row as the table holds it: the kind, and whether it is still waiting to go out. */
export interface ExistingFollowup {
  readonly kind: FollowupKind;
  readonly status: "scheduled" | "sent" | "canceled";
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

export const onOrderConfirmed = (
  existing: readonly ExistingFollowup[],
  orderedAt: Date,
  codDaysMin: number,
  status?: string,
): OrderEffect => {
  const scheduled = existing.filter((f) => f.status === "scheduled");

  // The sale is off. Everything still waiting dies with it — the post-order touches
  // because there is no delivery to talk about, and the silence ones because chasing
  // someone who just cancelled is worse than saying nothing. Nothing is armed.
  if (isOrderDead(status)) return { cancel: scheduled.map((f) => f.kind), arm: [] };

  return {
    // Only what is still waiting can be cancelled; a touch already sent is history.
    cancel: scheduled.filter((f) => f.kind.startsWith("silence_")).map((f) => f.kind),
    // Dedupe against EVERY row, not just the scheduled ones. A second webhook arriving
    // after `order_confirmed` already went out would otherwise re-arm a kind the table
    // still holds as `sent`, and `unique (conversation_id, kind)` turns that into a throw
    // — the whole call 500s, the status update is lost, and n8n retries into the same wall.
    arm: scheduleOrder(orderedAt, codDaysMin).filter(
      (f) => !existing.some((e) => e.kind === f.kind),
    ),
  };
};

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
const SILENCE_1: Record<StopPoint, readonly string[]> = {
  before_size: [
    "Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛",
    "Oi! Pensa naquela roupa que está parada no armário esperando um dia bom. Me fala o tamanho de calça que você usa e eu te digo qual colete deixa ela caindo do jeito que você gosta 💛",
  ],
  after_price: [
    "Qualquer coisa é só chamar! Lembrando que você não paga nada agora — o pagamento é só quando o colete chegar na sua mão.",
    "Fico por aqui se precisar! E lembra: não sai nada do seu bolso agora. Você recebe, veste com a sua roupa, se olha no espelho — e só então decide.",
  ],
  link_sent: [
    "Conseguiu finalizar seu pedido? Se travou em algum passo, é só me falar que eu te ajudo por aqui mesmo 😊",
    "Passando pra ver: deu certo de fechar o pedido? Se preferir, eu monto o link de novo pra você.",
  ],
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
const SILENCE_2 = (days: number) =>
  [
    `Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê, veste, e só paga se estiver tudo certo. Se não servir, tem ${days} dias pra devolver. Se ainda fizer sentido pra você, é só me chamar.`,
    `Bom dia! 💛 Ontem você chegou perto e parou — e eu entendo, promessa demais já foi feita pra você. Então vou ser direta: o colete não muda o seu corpo, ele muda como a roupa cai enquanto você usa. É a roupa que você já tem, caindo do jeito que você queria. E você só paga se, ao se olhar no espelho, achar que valeu — e ainda tem ${days} dias pra devolver se não achar. É só me chamar.`,
  ] as const;

const SILENCE_3_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

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
  prices: { codBrl: number };
  coupon: { percent: number; active: boolean };
  delivery: { codDaysMin: number; codDaysMax: number; warrantyDays: number };
  /**
   * OPTIONAL, and absent means no template is approved yet. That is not laziness: in
   * production the whole config comes from a `BUSINESS_CONFIG` secret that overrides the
   * fallback wholesale, so a key added in code is simply missing there until the operator
   * edits the secret. Absent has to be the safe reading, and here safe is blocking the
   * out-of-window touch — free text outside the window is rejected by Meta anyway, so
   * the alternative is a touch that silently never arrives.
   */
  channel?: { templates?: Partial<Record<FollowupKind, TemplateBinding>> };
}

export interface RenderContext {
  leadId: string;
  config: FollowupConfig;
  stopPoint?: StopPoint;
  now?: Date;
  size?: string;
  address?: string;
  /** The already-written text, for a deferred reply. */
  body?: string;
}

/**
 * Renders the message for a touch. Returns null when the touch must not go out —
 * today that is only the coupon one, which is silent until the coupon exists in
 * Coinzz. Announcing a coupon that has no destination is the broken promise this
 * project already decided never to make.
 */
export const renderFollowup = (kind: FollowupKind, ctx: RenderContext): string | null => {
  const now = ctx.now ?? new Date();
  const price = brl(ctx.config.prices.codBrl);

  switch (kind) {
    // Nothing to render: the text was written when the turn happened. A missing body
    // means the row is unusable, and returning null cancels the touch rather than
    // sending an empty message.
    case "deferred_reply":
      return ctx.body?.trim() ? ctx.body : null;

    case "checkout_reminder":
      return pickVariant(ctx.leadId, CHECKOUT_REMINDER);

    case "silence_1":
      return pickVariant(ctx.leadId, SILENCE_1[ctx.stopPoint ?? "before_size"]);

    case "silence_2":
      return pickVariant(ctx.leadId, SILENCE_2(ctx.config.delivery.warrantyDays));

    case "silence_3": {
      if (!ctx.config.coupon.active) return null;
      // "Super + dia da semana" — a seasonal frame with no calendar to maintain.
      const weekday = SILENCE_3_DAYS[(now.getDay() + 6) % 7]!;
      return (
        `**Super ${weekday}!** 🎉 Separei um cupom de **${ctx.config.coupon.percent}% de desconto** ` +
        `pra você — e ele vale nos dois jeitos: pagando na entrega ou antecipado.\n\n` +
        `Se quiser, eu monto o pedido agora com o desconto já aplicado. E se não for o momento, ` +
        `tudo bem também — é só me falar que eu não te mando mais nada 💛`
      );
    }

    case "order_confirmed":
      return (
        `Pedido confirmado! 🎉 Colete tamanho **${ctx.size ?? "—"}**, ${price} na entrega` +
        `${ctx.address ? `, indo pra ${ctx.address}` : ""}.\n` +
        `Eu vou acompanhar sua entrega do começo ao fim — qualquer coisa, é só me chamar aqui mesmo.`
      );

    case "order_shipped":
      return "Oi! Seu colete já está a caminho 🚚 Assim que a transportadora agendar o dia, eu te aviso aqui pra você não ser pega de surpresa.";

    case "order_eve":
      return (
        `Oi! Sua entrega está marcada pra **amanhã** 💛\n` +
        `Deixa **${price}** separado — pode ser dinheiro ou cartão, na maquininha do entregador.\n` +
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

/** Exactly 24 hours is already closed — the boundary send is the one Meta rejects. */
export const windowIsOpen = (now: Date, lastInboundAt: Date | null): boolean =>
  lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;

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
  | { readonly via: "blocked"; readonly reason: "no_template" | "empty_variable" };

const resolveVariable = (variable: TemplateVariable, ctx: RenderContext): string => {
  switch (variable) {
    case "price":
      return brl(ctx.config.prices.codBrl);
    case "warrantyDays":
      return String(ctx.config.delivery.warrantyDays);
    case "size":
      return ctx.size ?? "";
    case "address":
      return ctx.address ?? "";
    case "couponPercent":
      return String(ctx.config.coupon.percent);
    case "weekday":
      return SILENCE_3_DAYS[((ctx.now ?? new Date()).getDay() + 6) % 7]!;
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

  const template = ctx.config.channel?.templates?.[kind];
  if (!template) return { via: "blocked", reason: "no_template" };

  const variables = template.variables.map((v) => resolveVariable(v, ctx));
  if (variables.some((v) => v.trim() === "")) return { via: "blocked", reason: "empty_variable" };

  return {
    via: "template",
    name: template.name,
    language: template.language,
    variables,
    body,
  };
};
