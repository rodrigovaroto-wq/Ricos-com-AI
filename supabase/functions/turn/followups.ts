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
export type FollowupKind = SilenceKind | OrderKind;

/** Where the conversation stopped decides what the first touch says. */
export type StopPoint = "before_size" | "after_price" | "link_sent";

export interface ScheduledFollowup {
  kind: FollowupKind;
  runAt: Date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Next morning at 09:00 — a touch at 03:00 is how a number gets reported. */
const nextMorning = (from: Date, hour = 9): Date => {
  const at = new Date(from);
  at.setDate(at.getDate() + 1);
  at.setHours(hour, 0, 0, 0);
  return at;
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

const SILENCE_1: Record<StopPoint, readonly string[]> = {
  before_size: [
    "Oi! Ficou alguma dúvida sobre o colete? Se quiser, me fala só o seu manequim que eu já te digo o tamanho certinho 💛",
    "Oi! Qualquer dúvida que tenha ficado, é só me chamar. Me diz o manequim que você usa e eu te falo o tamanho ideal 💛",
  ],
  after_price: [
    "Qualquer coisa é só chamar! Lembrando que você não paga nada agora — o pagamento é só quando o colete chegar na sua mão.",
    "Fico por aqui se precisar! E lembra: não sai nada do seu bolso agora, você paga quando receber o colete.",
  ],
  link_sent: [
    "Vi que o pedido ficou aberto! Precisa de ajuda pra confirmar? Se preferir, eu monto de novo pra você 😊",
    "Seu pedido ficou pendente de confirmação. Quer que eu monte outro link, ou ficou alguma dúvida?",
  ],
};

const SILENCE_2 = [
  "Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê, veste, e só paga se estiver tudo certo. Se não servir, tem 7 dias pra devolver. Se ainda fizer sentido pra você, é só me chamar.",
  "Bom dia! 💛 Uma coisa que talvez tenha te segurado ontem: aqui você não arrisca nada. O colete chega, você veste, e só paga se gostar. E ainda tem 7 dias pra trocar ou devolver. Se quiser retomar, é só falar comigo.",
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
        "Chegou?! 😍 Me conta: serviu direitinho?\n" +
        "Dica de primeira vez: feche os colchetes na fileira mais folgada e vá apertando com o uso — é bem mais confortável assim.\n" +
        "E se quiser mandar uma foto do antes e depois com a roupa, eu adoro ver (e ninguém publica nada sem sua autorização)."
      );
  }
};
