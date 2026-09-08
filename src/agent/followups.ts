/**
 * The two rulers that run on a clock instead of on a reply.
 *
 * Silence: three touches for whoever stopped answering, each from a different angle —
 * repeating the same line is what gets the number blocked.
 * Post-order: four messages between the order and the door. This is the ruler that
 * attacks the most expensive event in the operation, the refusal on delivery.
 *
 * Everything here is deterministic: no model call, no cost. The copy comes from
 * docs/agente-ia/06-script/02-script-do-agente.md.
 */

export type SilenceKind = "silence_1" | "silence_2" | "silence_3";
export type OrderKind = "order_confirmed" | "order_shipped" | "order_eve" | "order_delivered";
/** A reply the model already wrote, held back by the clock rather than reworded. */
export type DeferredKind = "deferred_reply";
export type FollowupKind = SilenceKind | OrderKind | DeferredKind;

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
const BUSINESS_TZ = "America/Sao_Paulo";

/** How far `timeZone` sits from UTC at that instant, in minutes. Survives DST. */
const offsetMinutes = (at: Date, timeZone: string): number => {
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
 * instead, keeping the 30min / next morning / 3 days shape it was designed with. The
 * post-order touches and a deferred reply carry their own meaning at their own time
 * and are only moved.
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
  return { do: "postpone", restartRuler: kind.startsWith("silence_") };
};

export const scheduleSilence = (now: Date): ScheduledFollowup[] => [
  { kind: "silence_1", runAt: new Date(now.getTime() + 30 * MINUTE) },
  { kind: "silence_2", runAt: nextMorning(now) },
  { kind: "silence_3", runAt: new Date(now.getTime() + 3 * DAY) },
];

/**
 * Post-order ruler. `shipped` and `eve` only get a real time once logistics says so;
 * until then they sit at the estimate, which is what the customer was told.
 */
export const scheduleOrder = (orderedAt: Date, codDaysMin: number): ScheduledFollowup[] => [
  { kind: "order_confirmed", runAt: new Date(orderedAt.getTime() + 5 * MINUTE) },
  { kind: "order_shipped", runAt: new Date(orderedAt.getTime() + DAY) },
  { kind: "order_eve", runAt: new Date(orderedAt.getTime() + (codDaysMin - 1) * DAY) },
  { kind: "order_delivered", runAt: new Date(orderedAt.getTime() + (codDaysMin + 1) * DAY) },
];

/**
 * Same customer, same variant; different customers, different variants — without a
 * model call. It is what stops one literal message going out to hundreds of numbers.
 */
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
    "Vi que o pedido ficou aberto! Precisa de ajuda pra confirmar? Se preferir, eu monto de novo pra você 😊",
    "Seu pedido ficou pendente de confirmação. Quer que eu monte outro link, ou ficou alguma dúvida?",
  ],
};

const SILENCE_2 = [
  "Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê, veste, e só paga se estiver tudo certo. Se não servir, tem 7 dias pra devolver. Se ainda fizer sentido pra você, é só me chamar.",
  "Bom dia! 💛 Ontem você chegou perto e parou — e eu entendo, promessa demais já foi feita pra você. Então vou ser direta: o colete não muda o seu corpo, ele muda como a roupa cai enquanto você usa. É a roupa que você já tem, caindo do jeito que você queria. E você só paga se, ao se olhar no espelho, achar que valeu — e ainda tem 7 dias pra devolver se não achar. É só me chamar.",
] as const;

const SILENCE_3_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

/** Only what the copy reads. Declared locally so this file has zero imports and
 * runs byte-identical in Deno and in vitest, like the guardrail chain. */
export interface FollowupConfig {
  prices: { codBrl: number };
  coupon: { percent: number; active: boolean };
  delivery: { codDaysMin: number; codDaysMax: number };
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

    case "silence_1":
      return pickVariant(ctx.leadId, SILENCE_1[ctx.stopPoint ?? "before_size"]);

    case "silence_2":
      return pickVariant(ctx.leadId, SILENCE_2);

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
