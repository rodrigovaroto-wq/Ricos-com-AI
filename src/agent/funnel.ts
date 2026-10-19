/**
 * The script v3 (R28, operator, 2026-10-19): the funnel the operator validated elsewhere, adapted to
 * Encorpa. It sells first and asks later — the opening shows the product (three recorded audios,
 * a video, real reviews, the size table) before the first question, and after the CEP the offer
 * is fixed text with the price image. Everything here is fixed: the model only writes the answers
 * to her questions (R11.1). Mirrored byte for byte into the Edge Function, so no imports.
 *
 * The recorded audios are the operator's, used as recorded (R28): they do not pass the gates. What
 * they say is stored in the history as their transcript, so the model knows what she heard.
 */

export type MediaKind = "audio" | "image" | "video";

/** One WhatsApp message of a fixed sequence: text, or a media file with its transcript for the history. */
export interface FunnelBubble {
  readonly text: string;
  readonly media?: { readonly kind: MediaKind; readonly url: string };
}

/** Public URLs of the funnel files (Supabase Storage, bucket `funil`). Each one absent = that bubble skipped. */
export interface FunnelMedia {
  readonly audio1?: string;
  readonly audio2?: string;
  readonly audio4?: string;
  readonly video?: string;
  readonly reviews?: string;
  readonly sizes?: string;
  readonly price?: string;
}

export interface FunnelConfig {
  readonly agentName: string;
  readonly prices: { readonly codBrl: number; readonly prepayBrl: number; readonly prepayDiscountPercent: number; readonly anchorBrl: number; readonly prepayMaxInstallments?: number };
  readonly delivery: { readonly codDaysMin: number; readonly codDaysMax: number; readonly warrantyDays: number; readonly prepayAvgDays?: number; readonly codFreeShipping?: boolean; readonly freeShipping?: boolean };
  readonly socialProof?: { readonly satisfiedCustomers?: number; readonly reviews?: number };
  readonly kits?: ReadonlyArray<{ readonly path: "cod" | "prepay"; readonly units: number; readonly priceBrl: number }>;
  readonly funnel?: { readonly media?: FunnelMedia };
}

const money = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** What each recorded audio says, transcribed on 2026-10-19 (`muse-voice-transcribe-1.0`): the history's copy. */
export const AUDIO_TRANSCRIPTS = {
  audio1:
    "Olá, tudo bem? Meu nome é Maria Luiza, mas pode me chamar de Malu. Eu vou te explicar tudo sobre a cinta modeladora e como ela vai deixar o seu corpo modelado e sem barriga em poucos segundos. Essa cinta virou uma febre nos Estados Unidos porque ela reduz até três tamanhos de cintura imediatamente. Sabe aquela gordurinha localizada que fica sempre marcando na roupa? Com essa cinta você vai conseguir deixar seu corpo mais bonito e cheio de curvas, sem nenhum esforço. Com a cinta você fica livre para usar qualquer tipo de roupa, uma blusa de alcinha ou um vestido mais justo, e o melhor de tudo, você fica com o corpo todo modelado e sem precisar passar horas na academia, né?",
  audio2:
    "Ao invés de deixar de usar uma roupa que você gosta só por causa de uma gordurinha aqui e outra ali, você usa a nossa cinta e pronto, seu corpo fica modelado com os seios mais levantados e a barriga retinha, super fácil. Você não precisa mais ficar escondendo o seu corpo atrás de roupas largas, com essa cinta você pode usar tudo que tem direito e vai se sentir muito mais bonita. Ela é perfeita e muito confortável, é toda forrada em algodão macio, o material é super reforçado e você consegue ajustar a alça e o zíper, a cinta não enrola, não dobra e nem machuca a pele. Eu sempre recebo mensagens de clientes super satisfeitas.",
  audio4:
    "Eu acabei de te enviar os tamanhos e o valor com desconto. Você viu? Lembrando que não precisa pagar nada agora. Eu vou enviar o produto pra você aí na sua casa com frete grátis. Aí quando o entregador chegar e te entregar o produto você paga direto pra ele. Combinado? Eu consigo agendar a entrega pra amanhã mesmo e só preciso de algumas informações pra agendar o seu pedido.",
} as const;

/** The history row of a media bubble: what the model reads back as said by Malu. */
export const FUNNEL_LABELS = {
  audio1: `[áudio da Malu] ${AUDIO_TRANSCRIPTS.audio1}`,
  audio2: `[áudio da Malu] ${AUDIO_TRANSCRIPTS.audio2}`,
  audio4: `[áudio da Malu] ${AUDIO_TRANSCRIPTS.audio4}`,
  video: "[vídeo da Malu: uma cliente vestindo o colete, fechando os colchetes e o zíper]",
  reviews: "[imagem da Malu: avaliações reais de clientes, nota 5]",
  sizes: "[imagem da Malu: tabela de tamanhos pela calça — P 34 a 36, M 38 a 40, G 42 a 44, GG 46 a 48, XGG 50 a 52; ficou entre dois, pegue o maior]",
} as const;

/** The price image's history row, from the config: the history never says a price the config does not. */
export const priceLabel = (config: FunnelConfig): string =>
  `[imagem da Malu: o colete de ${money(config.prices.anchorBrl)} por ${money(config.prices.codBrl)}, com ${config.delivery.warrantyDays} dias pra trocar ou devolver]`;

const media = (url: string | undefined, kind: MediaKind, text: string): FunnelBubble[] =>
  url ? [{ text, media: { kind, url } }] : [];

/** The question that closes the opening, and the one asked again when the size is still missing at the offer. */
export const SIZE_ASK = "Qual o número da calça que você veste? Assim eu te indico o tamanho certinho 😉";

/** The social proof line, only with the numbers the config holds (absent: no number is cited). */
const proofLine = (config: FunnelConfig): string => {
  const customers = config.socialProof?.satisfiedCustomers;
  const reviews = config.socialProof?.reviews;
  const parts = [
    ...(customers ? [`mais de ${customers} clientes satisfeitas`] : []),
    ...(reviews ? [`${reviews} avaliações positivas`] : []),
  ];
  return parts.length ? ` Já são ${parts.join(" e ")} ❤️` : " ❤️";
};

/** Etapas 1 e 2 do script v3: the opening, the same for every new lead, whatever her first message said. */
export const openingBubbles = (config: FunnelConfig): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  return [
    { text: `Olá, tudo bem?\nMeu nome é ${config.agentName}, vou te explicar tudo sobre a nossa cinta modeladora 🥰` },
    ...media(m.audio1, "audio", FUNNEL_LABELS.audio1),
    ...media(m.audio2, "audio", FUNNEL_LABELS.audio2),
    { text: "Veja como é simples de usar: é só vestir, fechar os colchetes e o zíper e ajustar a alça, o corpo fica modelado em segundos 😍" },
    ...media(m.video, "video", FUNNEL_LABELS.video),
    { text: `Você pode usar embaixo de qualquer roupa: ela é super confortável, não enrola, não dobra e não machuca.${proofLine(config)}` },
    ...media(m.reviews, "image", FUNNEL_LABELS.reviews),
    ...media(m.sizes, "image", FUNNEL_LABELS.sizes),
    { text: SIZE_ASK },
  ];
};

/**
 * Whether her first message asks something the opening does not answer, so the model answers after it.
 * The ad's ready message ("Olá, tenho interesse no colete cinta modeladora!") and a bare greeting do not:
 * the opening is the answer. A price, a region, a question mark, anything else: the model answers it.
 */
export const firstMessageNeedsAnswer = (message: string): boolean => {
  const t = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9?\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t === "" || t.includes("?")) return t !== "";
  // A datum in it — a number (pants size, CEP, pieces) or a size letter — is read by the turn that answers (review of v3).
  if (/\d|\b(?:pp|p|m|g|gg|xg|xgg|eg|g[1-4])\b/.test(t)) return true;
  if (/\b(?:quanto|qual|quais|valor|preco|como|onde|quando|frete|entrega|tamanho|cep|pagamento|pix|cartao|boleto|parcel|foto|video|tem\b)/.test(t)) return true;
  // "não tenho interesse" is an answer to give, not an opening to skip.
  if (/\b(?:nao|nem|nunca)\b/.test(t)) return true;
  return !/^(?:(?:ola|oi+|oie|bom dia|boa tarde|boa noite|tudo bem|eu)\s*)*(?:(?:tenho|tive|estou com|to com|fiquei com)\s+interesse|quero (?:saber|conhecer|mais|ver|comprar)|gostaria de saber|me interessei|interesse)?\b.{0,60}$/.test(t)
    || t.split(" ").length > 14;
};

/**
 * A first message the opening must not answer: she asks to stop, says it is the wrong number, or asks for a person. The
 * old receipt goes instead, and the turn that answers classifies it like any other (review of v3, 1).
 */
export const skipsOpening = (message: string): boolean => {
  const t = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(?:errad[oa]|engano|pare\b|parar|para de|sair\b|me tir[ae]|remov\w*|descadastr\w*|bloque\w*|denunci\w*|spam|atendente|humano|pessoa de verdade|falar com (?:alguem|uma pessoa))/.test(t);
};

/** "Hoje é 2026-10-19 em São Paulo": the day a date is said against, never the UTC one. */
const brtDay = (now: Date): string => new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** The first delivery day as she reads it: "amanhã, terça (20/10)" or "terça (21/10)". */
export const firstDayLine = (isoDate: string | undefined, now: Date): string | null => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00Z`);
  const tomorrow = new Date(`${brtDay(now)}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const label = `${WEEKDAYS[d.getUTCDay()]} (${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)})`;
  return isoDate === tomorrow.toISOString().slice(0, 10) ? `amanhã, ${label}` : label;
};

/** The fixed offer's first line: also what `offerWasSent` reads back from the history. */
export const OFFER_HEADLINE = (config: FunnelConfig): string =>
  `⭐ DE ${money(config.prices.anchorBrl)} POR ${money(config.prices.codBrl)} ⭐`;
export const PREPAY_HEADLINE = "Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦";

/** Etapa 3, where cash on delivery reaches her CEP. */
export const codOfferText = (config: FunnelConfig, firstDate: string | undefined, now: Date): string => {
  const day = firstDayLine(firstDate, now);
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  return [
    OFFER_HEADLINE(config),
    `🚛 ${free ? "FRETE GRÁTIS: " : ""}${day ? `a primeira data de entrega é ${day}, ou o dia que você escolher` : `chega em ${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} dias, no dia que você escolher`}`,
    `💰 PAGUE SÓ NA ENTREGA: não precisa pagar nada agora, você paga direto ao entregador, no dinheiro, Pix ou cartão`,
    `🔁 ${config.delivery.warrantyDays} dias pra trocar ou devolver depois de receber`,
  ].join("\n");
};

/** Etapa 3, where cash on delivery does not reach her: the prepaid as the way, never a "não". */
export const prepayOfferText = (config: FunnelConfig): string => {
  const n = config.prices.prepayMaxInstallments;
  const avg = config.delivery.prepayAvgDays;
  return [
    PREPAY_HEADLINE,
    `⭐ Pagando agora você ganha ${config.prices.prepayDiscountPercent}% de desconto: ${money(config.prices.prepayBrl)} ⭐ no Pix${n && n > 1 ? ` ou em até ${n}x no cartão` : " ou no cartão"}`,
    `🚚 ${avg ? `Chega em média em ${avg} dias úteis, e o` : "O"} frete aparece no checkout pelo seu CEP`,
    `🔁 ${config.delivery.warrantyDays} dias pra trocar ou devolver depois de receber`,
  ].join("\n");
};

/** The question after the offer: the size if it is still missing, else her full name. */
export const offerAsk = (cod: boolean, sizeKnown: boolean): string =>
  !sizeKnown
    ? SIZE_ASK
    : cod
      ? "Vamos agendar seu pedido? 😊 Só me manda seu nome completo"
      : "Me manda seu nome completo que eu já te passo o link? 😊";

/** The whole offer: the price image, the box, the recorded audio 4 on the delivery path only, and the ask. */
export const offerBubbles = (
  config: FunnelConfig,
  region: { cod: boolean; dates: readonly string[] },
  now: Date,
  ask: string | null,
): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  return [
    ...media(m.price, "image", priceLabel(config)),
    { text: region.cod ? codOfferText(config, region.dates[0], now) : prepayOfferText(config) },
    ...(region.cod ? media(m.audio4, "audio", FUNNEL_LABELS.audio4) : []),
    ...(ask ? [{ text: ask }] : []),
  ];
};

/** Which offer a history row is: the delivery box, the prepaid box, or the two checkouts. */
export type OfferKind = "cod" | "prepay" | "both";
export const BOTH_MARKER = "costuma ter pagamento na entrega";
export const offerKindOf = (m: string, config: FunnelConfig): OfferKind | null =>
  m.startsWith(PREPAY_HEADLINE) ? "prepay"
  : m.startsWith(OFFER_HEADLINE(config)) ? (m.includes(BOTH_MARKER) ? "both" : "cod")
  : null;

/** The newest offer in the history (oldest first), or null. */
export const lastOfferKind = (outbound: readonly string[], config: FunnelConfig): OfferKind | null => {
  for (let i = outbound.length - 1; i >= 0; i--) {
    const k = offerKindOf(outbound[i]!, config);
    if (k) return k;
  }
  return null;
};

/** The offer went out already: its first line is in the history (either path). */
export const offerWasSent = (outbound: readonly string[], config: FunnelConfig): boolean => lastOfferKind(outbound, config) !== null;

/** The opening went out already: its last line is in the history. */
export const openingWasSent = (outbound: readonly string[]): boolean => outbound.some((m) => m === SIZE_ASK);

/** Etapa 4, the link: the address is the checkout's, and the kits ride along as an option, never a question before it. */
export const funnelLinkMessage = (
  config: FunnelConfig,
  url: string,
  path: "cod" | "prepay",
  name: string | null,
  size: string | null,
  pieces: number,
): string => {
  const first = name?.trim().split(/\s+/)[0];
  const price = pieces > 1
    ? config.kits?.find((k) => k.path === path && k.units === pieces)?.priceBrl
    : path === "cod" ? config.prices.codBrl : config.prices.prepayBrl;
  const what = pieces > 1 ? `Suas ${pieces} peças` : `Seu ${size ?? "colete"}`;
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  const n = config.prices.prepayMaxInstallments;
  const head =
    `Prontinho${first ? `, ${first}` : ""}! 🎉 ${what}${price ? ` por ${money(price)}` : ""}` +
    (path === "cod"
      ? `${free ? ", com frete grátis," : ""} e você só paga quando receber. Escolhe aqui o dia da entrega:`
      : `, no Pix${n && n > 1 ? ` ou em até ${n}x no cartão` : " ou no cartão"}:`);
  const kits = pieces > 1 ? [] : (config.kits ?? []).filter((k) => k.path === path).sort((a, b) => a.units - b.units);
  const kitLine = kits.length
    ? ` E se quiser levar mais: ${kits.map((k) => `${k.units} peças saem por ${money(k.priceBrl)}`).join(", e ")} 💛`
    : "";
  const there = path === "cod" ? "Lá você só completa o endereço." : "Lá você completa o endereço e vê o frete.";
  return `${head}\n\n${url}\n\n${there}${kitLine}`;
};

// "Santa Bárbara d'Oeste", "Ceará-Mirim": accents, apostrophes and hyphens never decide a match.
const plain = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9/]+/g, " ").replace(/\s*\/\s*/g, "/").trim();

/**
 * Where the Logzz delivers, by the operator's list ("Campinas/SP"): the lookup said no delivery, but the city has it as a
 * rule, so the "no" may be the lookup's (operator, 2026-10-19). Absent or empty list: never.
 */
export const isLikelyCodCity = (place: { city: string; state: string } | undefined, list: readonly string[] | undefined): boolean =>
  !!place && !!list?.some((c) => plain(c) === plain(`${place.city}/${place.state}`));

/**
 * The lookup said no, the city usually has it: both checkouts, told apart at a glance — green for the door, blue for paying
 * now — and she checks in the first one whether the delivery shows up for her (operator, 2026-10-19). No audio 4: the
 * delivery is not confirmed. Sent right after the CEP, before her name.
 */
export const bothLinksBubbles = (
  config: FunnelConfig,
  city: string,
  codUrl: string,
  prepayUrl: string,
  size: string | null,
  pieces = 1,
): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  const n = config.prices.prepayMaxInstallments;
  // A kit's checkouts charge the kit's price (review of v3, 5): the box says what the link charges.
  const kit = (path: "cod" | "prepay") => config.kits?.find((k) => k.path === path && k.units === pieces)?.priceBrl;
  const codPrice = pieces > 1 ? kit("cod") ?? config.prices.codBrl * pieces : config.prices.codBrl;
  const prepayPrice = pieces > 1 ? kit("prepay") ?? config.prices.prepayBrl * pieces : config.prices.prepayBrl;
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  const what = pieces > 1 ? ` das ${pieces} peças` : size ? ` do ${size}` : "";
  return [
    ...media(m.price, "image", priceLabel(config)),
    {
      text: [
        OFFER_HEADLINE(config),
        `${city} costuma ter pagamento na entrega, mas a nossa consulta de CEP está instável agora e não conseguiu confirmar pra você 😕`,
        `Por isso vou te mandar os dois links${what}, e você confere direto no checkout 💛`,
      ].join("\n"),
    },
    {
      text: `🟢 1) PAGAR SÓ NA ENTREGA · ${money(codPrice)}${free ? " · frete grátis" : ""}\nVocê não paga nada agora: paga ao entregador, no dinheiro, Pix ou cartão\n${codUrl}`,
    },
    {
      text: `🔵 2) PAGAR AGORA NO PIX OU CARTÃO · ${money(prepayPrice)}${pieces > 1 ? "" : ` (${config.prices.prepayDiscountPercent}% de desconto)`}${n && n > 1 ? ` · até ${n}x` : ""}\nVai pelos Correios, com rastreio\n${prepayUrl}`,
    },
    {
      text: `Abre primeiro o link 🟢: se aparecer o dia da entrega pra escolher, é só finalizar por lá. Se não aparecer a entrega pra sua região, usa o link 🔵: o colete chega no conforto da sua casa do mesmo jeito, com a mesma segurança e ${config.delivery.warrantyDays} dias pra trocar ou devolver 💛`,
    },
  ];
};
