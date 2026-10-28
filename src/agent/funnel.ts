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
  readonly kits?: ReadonlyArray<{ readonly path: "cod" | "prepay"; readonly units: number; readonly priceBrl: number; readonly discountPercent?: number }>;
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
export const SIZE_ASK = "Qual o número da calça que você veste?\nAssim eu te indico o tamanho certinho 😉";
/** The size ask before the copy v4 (2026-10-20): conversations already open carry it. */
export const LEGACY_SIZE_ASK = "Qual o número da calça que você veste? Assim eu te indico o tamanho certinho 😉";

/** The social proof line, only with the numbers the config holds (absent: no number is cited). */
const proofLine = (config: FunnelConfig): string => {
  const customers = config.socialProof?.satisfiedCustomers;
  const reviews = config.socialProof?.reviews;
  const parts = [
    ...(customers ? [`*Mais de ${customers} Clientes Satisfeitas*`] : []),
    ...(reviews ? [`${reviews} avaliações positivas`] : []),
  ];
  return parts.length ? `\n\nJá são ${parts.join(" e ")}!! ❤️` : " ❤️";
};

/** Etapas 1 e 2 do script v3: the opening, the same for every new lead, whatever her first message said. */
export const openingBubbles = (config: FunnelConfig): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  return [
    // Copy v4 (operator, 2026-10-20, grafo §119).
    { text: `Oi, tudo bem? Aqui é a ${config.agentName}..\nVou te mostrar rapidinho como o colete funciona 💛` },
    ...media(m.audio1, "audio", FUNNEL_LABELS.audio1),
    ...media(m.audio2, "audio", FUNNEL_LABELS.audio2),
    { text: "É só vestir, fechar os colchetes e o zíper e ajustar a alça, o corpo fica *Fininho em Segundos!!*" },
    ...media(m.video, "video", FUNNEL_LABELS.video),
    { text: `Você pode usar embaixo de qualquer roupa, ela é super confortável, não enrola, não dobra e não machuca.${proofLine(config)}` },
    ...media(m.reviews, "image", FUNNEL_LABELS.reviews),
    // The size table only when she asks for it (operator, 2026-10-20): `sizeTableBubbles`.
    { text: SIZE_ASK },
  ];
};

/**
 * She asks for the size table or the measurements (operator, 2026-10-20: the table goes only on request). Negation: "não precisa
 * da tabela", "sem tabela".
 */
export const asksSizeTable = (message: string): boolean => {
  const t = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:nao|sem)\s+(?:\S+\s+){0,2}(?:tabela|medidas)\b/.test(t)) return false;
  return /\btabela\b|\bmedidas\b|\bquais\s+(?:sao\s+)?(?:os\s+)?tamanhos\b|\btamanhos\s+(?:que\s+)?(?:tem|disponiveis)\b/.test(t);
};

/**
 * The opening's media on her request, for a lead who came from the site and got no opening (operator, 2026-10-27): she asks for it,
 * or for what it shows, and the system sends it — never the model (R11.1). The video for "tem vídeo?", "manda foto", "como fica no
 * corpo?"; the reviews image for "tem avaliação?", "é bom mesmo?", "funciona mesmo?", "depoimento"; the two recorded audios for
 * "manda um áudio" — an explicit ask, never her past or a mention (review of ecea0c3). The size table stays `asksSizeTable`'s.
 * Negation: "não precisa de vídeo", "sem áudio", "já vi o vídeo", "não consigo ouvir áudio", "não abre vídeo". Each file absent in
 * the config: that bubble skipped.
 */
export const requestedMedia = (message: string, config: FunnelConfig): FunnelBubble[] => {
  // The system's own markers ("[a cliente mandou um vídeo sem texto]") are no words of hers (review of ecea0c3, 3).
  const t = message.replace(/\[[^\]]*\]/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = config.funnel?.media ?? {};
  // Refused, or she cannot play it: nothing goes.
  const off = (word: string): boolean =>
    new RegExp(`\\b(?:nao|sem|nem|nunca)\\s+(?:\\S+\\s+){0,3}${word}|${word}\\w*\\s+(?:nao|nem)\\b`).test(t);
  // An explicit ask, in the present, right before the thing (review of ecea0c3, 3): "tem vídeo?", "manda um áudio", "pode me mostrar
  // as avaliações?", "quero ver o vídeo". Never her past ("vi o vídeo no site", "assisti o vídeo", "li as avaliações") nor a mention
  // of it ("a moça do vídeo", "no vídeo ela tá com a bege", "desculpa o áudio").
  const ASK = String.raw`\b(?:tem|teria|tens|manda|mande|me\s+manda|envia|envie|me\s+envia|mostra|mostre|me\s+mostra|me\s+passa|(?:pode|poderia|consegue|da\s+pra)\s+(?:me\s+)?(?:mandar|enviar|mostrar|passar)|(?:quero|queria|gostaria\s+de|posso|da\s+pra)\s+ver)\s+(?:(?:um|uma|o|a|os|as|algum|alguma|mais|outro|outra|de\s+novo)\s+){0,2}`;
  const asked = (word: string): boolean => new RegExp(ASK + word).test(t) && !off(word);
  // A photo of the product, never of her payment or her documents; "foto da etiqueta" is no photo we have.
  const photo = asked(String.raw`(?:fotos?|fotinha)\b(?!\s+d[aoe]s?\s+(?!colete|cinta|produto|corpo)\w)`) &&
    !/\b(?:comprovante|pix|documento|rg|cpf|boleto|endereco|fachada)\b/.test(t);
  // What the video shows, asked as a question: "como fica no corpo?".
  const video = asked(String.raw`videos?\b`) || photo || /\bcomo\s+(?:ela\s+|ele\s+)?fica\s+(?:no\s+corpo|vestid[oa])\b[^.!]*\?/.test(t);
  const reviews = asked(String.raw`(?:avaliac\w*|depoiment\w*|comentarios?|prints?)`) ||
    (/\b(?:e\s+bom|funciona)\s+mesmo\s*\?/.test(t) && !/\bnao\s+(?:e|era|foi|ficou)\s+bom\b|\bnao\s+funciona\b/.test(t));
  const audio = asked(String.raw`audios?\b`) && !/\b(?:nao|nem)\s+(?:\S+\s+){0,2}(?:ouvir|escutar|ouco|escuto)\b/.test(t);
  return [
    ...(video ? media(m.video, "video", FUNNEL_LABELS.video) : []),
    ...(reviews ? media(m.reviews, "image", FUNNEL_LABELS.reviews) : []),
    ...(audio ? [...media(m.audio1, "audio", FUNNEL_LABELS.audio1), ...media(m.audio2, "audio", FUNNEL_LABELS.audio2)] : []),
  ];
};

/** The history's media rows ("[imagem da Malu: …]", "[áudio da Malu] …", "[vídeo da Malu: …]") out of a model reply (replay of 2026-10-20). */
export const stripMediaLabels = (text: string): string =>
  text.replace(/\[(?:imagem|vídeo|video) da Malu:[^\]]*\]/gi, "").replace(/\[áudio da Malu\][^\n]*/gi, "").replace(/\n{3,}/g, "\n\n").trim();

/** The size table, sent when she asks for it. Empty without the file in the config. */
export const sizeTableBubbles = (config: FunnelConfig): FunnelBubble[] => media(config.funnel?.media?.sizes, "image", FUNNEL_LABELS.sizes);

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

/** The fixed offer's first line: also what `offerWasSent` reads back from the history. Copy v4 (operator, 2026-10-20, grafo §119). */
export const OFFER_HEADLINE = (config: FunnelConfig): string =>
  `⭐*~${money(config.prices.anchorBrl)}~ POR ${money(config.prices.codBrl)}*⭐`;
/** The copy v4 headline (20/10 to 21/10): an offer it opened is never offered again. */
export const V4_OFFER_HEADLINE = (config: FunnelConfig): string =>
  `⭐*DE ~${money(config.prices.anchorBrl)}~ POR ${money(config.prices.codBrl)}*⭐`;
// Without a prepaid discount (operator, 2026-10-27: one price on both paths) there is no "0%" to announce: the Correios line opens it.
export const PREPAY_HEADLINE = (config: FunnelConfig): string =>
  config.prices.prepayDiscountPercent > 0 ? `Você Ganhou um Desconto Adicional de *${config.prices.prepayDiscountPercent}%!!!*` : LEGACY_PREPAY_HEADLINE;
/** The headlines before the copy v4: conversations already open carry them, and an offer sent is never offered again. */
export const LEGACY_OFFER_HEADLINE = (config: FunnelConfig): string =>
  `⭐ DE ${money(config.prices.anchorBrl)} POR ${money(config.prices.codBrl)} ⭐`;
export const LEGACY_PREPAY_HEADLINE = "Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦";

/** Etapa 3, where cash on delivery reaches her CEP. "Menos de 24 horas" only when the checkout's first day is tomorrow. */
export const codOfferText = (config: FunnelConfig, firstDate: string | undefined, now: Date): string => {
  const day = firstDayLine(firstDate, now);
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  // Operator, 2026-10-21 (grafo §121): the truck on its own line, the day on the next, the check before "Não Paga Nada Agora".
  const freeLead = free ? "🚚 *FRETE GRÁTIS*\n" : "🚚 ";
  const when = day?.startsWith("amanhã")
    ? `${freeLead}Seu Pedido Chegará em *Menos de 24 Horas!!*\n\nOu se preferir outro dia, é só escolher lá no checkout.`
    : day
      ? `${freeLead}Seu Pedido Chegará já *${day}!!*\n\nOu se preferir outro dia, é só escolher lá no checkout.`
      : `${freeLead}Seu Pedido Chegará em *${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} dias!!*\n\nVocê escolhe o dia lá no checkout.`;
  return [
    OFFER_HEADLINE(config),
    when,
    `✅*Não Paga Nada Agora*, só quando chegar aí, no dinheiro, Pix ou cartão!`,
    `🔁 *${config.delivery.warrantyDays} Dias de Garantia* pra trocar ou devolver se não gostar.`,
  ].join("\n\n");
};

/**
 * Etapa 3, where cash on delivery does not reach her: the prepaid as the way, never a "não". `freightBrl` is the prepaid
 * freight the checkout read at her CEP (`prepayFreight`, plan 16 §4.7): said under the Correios line; absent or not a
 * positive amount, or free shipping on both paths, the box of today.
 */
export const prepayOfferText = (config: FunnelConfig, freightBrl: number | null = null): string => {
  const n = config.prices.prepayMaxInstallments;
  const free = config.delivery.freeShipping === true;
  const freight = !free && freightBrl !== null && Number.isFinite(freightBrl) && freightBrl > 0 ? [`Frete pra sua região: *${money(freightBrl)}*`] : [];
  // The Correios sentence is the headline itself when there is no discount to announce (`PREPAY_HEADLINE`); the free shipping on
  // both paths (operator, 2026-10-27) is said where the freight would be, never a value.
  const ship = [...(config.prices.prepayDiscountPercent > 0 ? ["Seu colete vai pelos Correios, com código de rastreio."] : []), ...(free ? ["*FRETE GRÁTIS!!*"] : freight)];
  return [
    PREPAY_HEADLINE(config),
    `⭐*~${money(config.prices.anchorBrl)}~ POR ${money(config.prices.prepayBrl)}*⭐`,
    ...(ship.length > 0 ? [`🚚 ${ship.join("\n")}`] : []),
    `✅ Você pode pagar agora no Pix${n && n > 1 ? ` ou em até *${n}x no cartão!*` : " ou no cartão!"}`,
    `🔁 *${config.delivery.warrantyDays} Dias de Garantia* pra trocar ou devolver se não gostar`,
  ].join("\n\n");
};

/** The question after the offer: the size if it is still missing, else her full name (2.2 and 2.4 of the copy v4). */
export const NAME_ASK = "Vamos agendar seu pedido e aproveitar essa mega oferta?! 😊\n\nSó preciso do seu nome completo pra deixar tudo prontinho pra você.";
/** The prepaid offer's name ask: nothing is scheduled on that path, it goes by the Correios (personas of 2026-10-24, A4). */
export const PREPAY_NAME_ASK = "Só preciso do seu nome completo pra deixar tudo prontinho pra você 😊";
export const offerAsk = (cod: boolean, sizeKnown: boolean): string => (!sizeKnown ? SIZE_ASK : cod ? NAME_ASK : PREPAY_NAME_ASK);

/**
 * Why the prepaid offer, said before it (personas of 2026-10-24, A4: 13 of 14 prepaid boxes went to women who asked to pay at the
 * door, with no reason). The delivery is the stock of her SIZE in her city: where the lookup read another size in stock there, the
 * size is the reason; where it read none, or her size is unknown, the region is.
 */
export const noCodReasonLine = (size: string | null, otherSizeHasIt: boolean): string =>
  size && otherSizeHasIt
    ? `No ${size}, aí na sua cidade o pagamento na entrega não está disponível agora`
    : "Aí na sua região o pagamento na entrega ainda não chega";

/**
 * Her CEP came before her size, and the delivery reaches it (A3, personas of 2026-10-24): whether it reaches HER is the stock of her
 * size, so nothing is promised before it — the delivery offer went, and the next turn took it back ("No M, … não está disponível").
 */
export const SIZE_BEFORE_OFFER = "Anotei seu CEP 😊 A entrega aí depende do tamanho, então antes eu preciso saber:";
export const sizeFirstBubbles = (): FunnelBubble[] => [{ text: SIZE_BEFORE_OFFER }, { text: SIZE_ASK }];

/**
 * The whole offer: the price image, the box, the recorded audio 4 on the delivery path only, and the ask. The audio says "Eu
 * consigo agendar a entrega pra amanhã mesmo": it goes only when the checkout's first day IS tomorrow (personas of 2026-10-24,
 * A10: the box said "segunda (26/10)" on a Saturday and the audio said tomorrow).
 */
export const offerBubbles = (
  config: FunnelConfig,
  region: { cod: boolean; dates: readonly string[]; prepayFreightBrl?: number | null },
  now: Date,
  ask: string | null,
  /** `noCodReasonLine`, before the prepaid box (A4). Ignored on the delivery path. */
  noCodReason: string | null = null,
): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  return [
    ...(!region.cod && noCodReason ? [{ text: noCodReason }] : []),
    ...media(m.price, "image", priceLabel(config)),
    { text: region.cod ? codOfferText(config, region.dates[0], now) : prepayOfferText(config, region.prepayFreightBrl ?? null) },
    ...(region.cod && firstDayLine(region.dates[0], now)?.startsWith("amanhã") ? media(m.audio4, "audio", FUNNEL_LABELS.audio4) : []),
    ...(ask ? [{ text: ask }] : []),
  ];
};

/** Which offer a history row is: the delivery box, the prepaid box, or the two checkouts. */
export type OfferKind = "cod" | "prepay" | "both";
export const BOTH_MARKER = "costuma ter pagamento na entrega";
/** The two checkouts' first bubble since the copy v4: it opens the "both" offer. */
export const BOTH_HEADLINE = "Infelizmente não consegui confirmar a entrega no seu CEP agora";
export const offerKindOf = (m: string, config: FunnelConfig): OfferKind | null =>
  m.startsWith(PREPAY_HEADLINE(config)) || m.startsWith(LEGACY_PREPAY_HEADLINE) ? "prepay"
  : m.startsWith(BOTH_HEADLINE) ? "both"
  : m.startsWith(OFFER_HEADLINE(config)) || m.startsWith(V4_OFFER_HEADLINE(config)) || m.startsWith(LEGACY_OFFER_HEADLINE(config))
  ? (m.includes(BOTH_MARKER) ? "both" : "cod")
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
export const openingWasSent = (outbound: readonly string[]): boolean => outbound.some((m) => m === SIZE_ASK || m === LEGACY_SIZE_ASK);

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
  // Copy v4 (operator, 2026-10-20, grafo §119): 3.1 and 3.2.
  const what = pieces > 1 ? `Seu Kit com ${pieces} peças` : size ? `Seu Colete no ${size}` : "Seu Colete";
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  const n = config.prices.prepayMaxInstallments;
  const head =
    `Pronto${first ? `, ${first}` : ""}! 🎉\n${what}${price ? ` por ${money(price)}` : ""}` +
    (path === "cod"
      ? `${free ? ", com frete grátis," : ""} e você só paga quando receber!!`
      : `, no Pix${n && n > 1 ? ` ou em até ${n}x no cartão` : " ou no cartão"}.`);
  const there = path === "cod"
    ? `É só abrir o link, completar o endereço e escolher o dia da entrega que preferir: ${url}`
    : `No link você preenche seus dados e o endereço, aí é só ser feliz: ${url}`;
  // One line per kit, the price of each piece in it (operator, 2026-10-21, grafo §121: "2 peças saem por apenas *R$ 116,91* cada!").
  const kits = pieces > 1 ? [] : (config.kits ?? []).filter((k) => k.path === path).sort((a, b) => a.units - b.units);
  const kitLines = kits.length
    ? `\n\nValores dos Kits\n${kits.map((k) => `• ${k.units} peças saem por apenas *${money(Math.round((k.priceBrl / k.units) * 100) / 100)}* cada!`).join("\n")}`
    : "";
  return `${head}\n\n${there}${kitLines}`;
};

/**
 * Her size has no stock at all (the Coinzz answers 404 for it while the other sizes answer, operator 2026-10-27: the M, on both
 * paths, and the supplier cannot restock it): said once, honestly, with no link, no date and no other size to make the sale.
 */
export const sizeOutOfStockLine = (size: string): string =>
  `O ${size} está sem estoque agora 😔 Se quiser, eu te aviso aqui assim que ele voltar, tá bom?`;

/** The safe reply after five vetoes with her size out of stock (review of 481f2d3): the line itself, or its short form once said. */
export const sizeOutFallback = (size: string, said: boolean): string =>
  said ? `Assim que o ${size} voltar eu te aviso aqui 💛` : sizeOutOfStockLine(size);

/**
 * The reply said her size is out of stock (the model's own words, or the line): only then the turn records it as said, so the
 * next turn does not skip a line she never read (review of 481f2d3). Negation: "não está sem estoque", "não esgotou".
 */
export const sizeOutLineSent = (reply: string, size: string | null): boolean => {
  if (size === null) return false;
  const t = reply.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return t.split(/(?<=[.!?])\s+|\n+/).some((s) =>
    /\bsem\s+estoque\b|\besgotad[oa]s?\b|\bem\s+falta\b/.test(s) && !/\b(?:nao|nem)\s+(?:\S+\s+){0,2}(?:sem\s+estoque|esgot|em\s+falta)/.test(s));
};

/** 2.5 of the copy v4: her size has no delivery there after the delivery offer went. A question: the prepaid box goes on her yes. */
// The size is the reason, not her region (A4, personas of 2026-10-24): the same CEP has the delivery in another size.
export const sizeNoCodAsk = (size: string): string =>
  `No ${size}, aí na sua cidade o pagamento na entrega não está disponível agora... posso te enviar via correios? 💛`;
/** 3.3 of the copy v4: a delivery link went and the new address has none. The prepaid link goes on her yes. */
export const ADDRESS_NO_COD_ASK = "Nesse endereço infelizmente não tem entrega com pagamento na hora... posso te enviar por correios? 💛";

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
  _city: string,
  codUrl: string,
  prepayUrl: string,
  _size: string | null,
  pieces = 1,
): FunnelBubble[] => {
  const m = config.funnel?.media ?? {};
  // A kit's checkouts charge the kit's price (review of v3, 5): the box says what the link charges.
  const kit = (path: "cod" | "prepay") => config.kits?.find((k) => k.path === path && k.units === pieces)?.priceBrl;
  const codPrice = pieces > 1 ? kit("cod") ?? config.prices.codBrl * pieces : config.prices.codBrl;
  const free = config.delivery.freeShipping === true || config.delivery.codFreeShipping !== false;
  // One checkout with both payments inside (operator, 2026-10-27, grafo §133/§134): ONE link, both ways named, and no second
  // "oferta especial" with the same URL and the same price.
  if (oneCheckout(codUrl, prepayUrl)) {
    return [
      ...media(m.price, "image", priceLabel(config)),
      { text: `${BOTH_HEADLINE}, mas a sua cidade costuma ter disponibilidade sim. Te mando o link, que tem as duas formas de pagar:` },
      {
        text: (pieces > 1 ? `⭐*${pieces} PEÇAS POR ${money(codPrice)}*⭐` : `⭐*~${money(config.prices.anchorBrl)}~ POR ${money(codPrice)}*⭐`) +
          `\n\n🟢 *Pagar SÓ Quando Receber*, se aparecer o dia da entrega pra você\n🔵 Ou pagar agora, no Pix ou no cartão` +
          `${free ? "\n\nE o Melhor, com *FRETE GRÁTIS!!*" : ""}\n\n${codUrl}`,
      },
      { text: "Abre o link: se aparecer um dia de entrega pra escolher, é só finalizar e ser feliz! Se não aparecer, dá pra pagar no Pix ou no cartão ali mesmo 💛" },
    ];
  }
  // Copy v4, section 4 (operator, 2026-10-20, grafo §119): the delivery link first; the prepaid one only when she says no day
  // showed up (`bothPrepayBubbles`).
  return [
    ...media(m.price, "image", priceLabel(config)),
    { text: `${BOTH_HEADLINE}, mas a sua cidade costuma ter disponibilidade sim. Vou te mandar as duas opções para escolher a sua preferida:` },
    {
      text: `🟢 *Pagar SÓ Quando Receber*\n\n` +
        (pieces > 1 ? `⭐*${pieces} PEÇAS POR ${money(codPrice)}*⭐` : `⭐*~${money(config.prices.anchorBrl)}~ POR ${money(codPrice)}*⭐`) +
        `${free ? "\n\nE o Melhor, com *FRETE GRÁTIS!!*" : ""}\n\n${codUrl}`,
    },
    { text: "Abre esse primeiro. Se aparecer um dia de entrega pra escolher, é só finalizar e ser feliz!" },
    { text: "Se não aparecer me fala aqui que a gente utiliza outro método, tudo bem?" },
  ];
};

/** The two paths share one checkout page (the same URL without its query): one link says both (2026-10-27). */
export const oneCheckout = (codUrl: string | null | undefined, prepayUrl: string | null | undefined): boolean =>
  !!codUrl && !!prepayUrl && codUrl.split(/[?#]/)[0] === prepayUrl.split(/[?#]/)[0];

/** The second half of section 4: she says no delivery day showed up in the first link. */
export const bothPrepayBubbles = (config: FunnelConfig, name: string | null, prepayUrl: string, pieces = 1): FunnelBubble[] => {
  const first = name?.trim().split(/\s+/)[0];
  const n = config.prices.prepayMaxInstallments;
  const kit = config.kits?.find((k) => k.path === "prepay" && k.units === pieces)?.priceBrl;
  const price = pieces > 1 ? kit ?? config.prices.prepayBrl * pieces : config.prices.prepayBrl;
  return [
    { text: `${BOTH_PREPAY_HEADLINE}${first ? ` ${first}` : ""}...\nMas não desanima não porque eu tenho uma oferta especial para você!!` },
    {
      text: `🔵 Pagar Agora\n\n${config.prices.prepayDiscountPercent > 0 ? `*Você Ganhou Mais ${config.prices.prepayDiscountPercent}% de Desconto!!*\n` : ""}` +
        (pieces > 1 ? `⭐*${pieces} PEÇAS POR ${money(price)}*⭐` : `⭐*~${money(config.prices.anchorBrl)}~ POR ${money(price)}*⭐`) +
        `\n\nPode pagar no Pix${n && n > 1 ? ` ou em até ${n}x no cartão!!` : " ou no cartão!!"}\n\n${prepayUrl}`,
    },
  ];
};
/** What opens the second half: it says the prepaid link of the two went already. */
export const BOTH_PREPAY_HEADLINE = "Ah que pena";

/**
 * She says the delivery link showed no day for her (copy v4, section 4): "não apareceu", "não tem dia", "nenhuma data". Negation:
 * "apareceu sim", "já apareceu o dia", and her not knowing yet ("ainda não abri").
 */
export const saysNoDeliveryDay = (message: string): boolean => {
  const t = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // She has not opened it yet (review of v38): "sem dia ainda, nem abri", "vou abrir depois".
  if (/\b(?:nem|nao|ainda\s+nao)\s+abri\b|\bvou\s+abrir\b|\bainda\s+vou\b/.test(t)) return false;
  return /\b(?:nao|n)\s+(?:me\s+)?(?:apareceu|aparece|apareceram|aparecem|mostrou|mostra)\b(?!\s+(?:sim|duvida))|\b(?:nao|n)\s+(?:tem|tinha|deu)\s+(?:nenhum\w*\s+)?(?:dia|data|entrega|opcao)\b/.test(t) ||
    /\b(?:nenhum|nenhuma)\s+(?:dia|data|opcao)\b/.test(t) || /\bsem\s+(?:dia|data|entrega)\b/.test(t);
};
