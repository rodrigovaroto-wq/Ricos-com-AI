/**
 * The WhatsApp Cloud API at the edge of the system (WA-2, 2026-09-25): what Meta sends in,
 * what goes back out. Pure and dependency-free (Web Crypto only), mirrored byte for byte
 * into `supabase/functions/whatsapp/whatsapp.ts`, which is the webhook Meta calls.
 *
 * This is a trust boundary. Anyone on the internet can POST to a webhook URL, so nothing
 * here is believed before the signature is: Meta signs the raw body with the app secret
 * (`X-Hub-Signature-256: sha256=<hex>`), and a body that does not verify is never parsed.
 */

/** One customer message, in the shape the turn already takes (`encorpa-inbound`). */
export interface InboundMessage {
  /** Meta's message id (`wamid…`): the turn's idempotency key, so a redelivery is a no-op. */
  externalId: string;
  /** The customer's number, digits only, as Meta sends it (e.g. 5511987654321). */
  from: string;
  body: string;
  /** Click-to-WhatsApp attribution, on the message that came from an ad. */
  source?: Record<string, string>;
  /** When she sent it (Meta's unix timestamp, as ISO): starts the 24-hour window. */
  sentAt?: string;
  /**
   * A tap on one of our buttons: the id WE gave the button, and the message it answered.
   * `body` still carries the title, for the conversation; a decision reads `reply.id`, never
   * the text — the text is hers to type, the id only a tap produces (2026-09-28).
   * `id` is sealed (`inbound-signature.ts`): the turn reads it for the marketing opt-in.
   */
  reply?: { id: string; contextId?: string };
  /**
   * The media id of a voice message (operator, 2026-10-07): the webhook downloads it, transcribes it and
   * replaces `body` before forwarding; it never leaves the function (`forward` strips it).
   */
  audioId?: string;
}

/** Compares without leaking where the first difference is. */
const sameString = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Meta's subscription handshake: `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`.
 * The challenge is echoed only when the token is ours; anything else is refused.
 */
export const verifyChallenge = (params: URLSearchParams, verifyToken: string): string | null =>
  verifyToken !== "" &&
  params.get("hub.mode") === "subscribe" &&
  sameString(params.get("hub.verify_token") ?? "", verifyToken)
    ? params.get("hub.challenge")
    : null;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * `X-Hub-Signature-256` against the RAW body — re-serialized JSON would not match. An empty
 * secret verifies nothing: a missing configuration fails closed, never open.
 */
export const verifySignature = async (
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> => {
  if (appSecret === "" || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return sameString(hex(mac), header.slice("sha256=".length).toLowerCase());
};

/**
 * What the agent reads when the message has no text of its own. The model only reads text
 * (R11.1), so an audio or a sticker arrives as a plain sentence saying what came — the
 * alternative is silence, and silence to a customer who sent an audio is a lost sale.
 */
const NO_TEXT: Record<string, string> = {
  audio: "[a cliente mandou um áudio, que você não consegue ouvir]",
  voice: "[a cliente mandou um áudio, que você não consegue ouvir]",
  image: "[a cliente mandou uma imagem sem texto]",
  video: "[a cliente mandou um vídeo sem texto]",
  document: "[a cliente mandou um documento sem texto]",
  sticker: "[a cliente mandou uma figurinha]",
  location: "[a cliente mandou uma localização]",
  contacts: "[a cliente mandou um contato]",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const textOf = (m: Obj): string | null => {
  const type = str(m.type);
  if (type === "text") return str(obj(m.text)?.body) || null;
  if (type === "button") return str(obj(m.button)?.text) || null;
  if (type === "interactive") {
    const i = obj(m.interactive);
    return str(obj(i?.button_reply)?.title) || str(obj(i?.list_reply)?.title) || null;
  }
  const caption = str(obj(m[type])?.caption);
  if (caption) return caption;
  // A reaction (an emoji on one of our messages) is not a turn; nothing else unknown is dropped.
  if (type === "reaction") return null;
  return NO_TEXT[type] ?? `[a cliente mandou uma mensagem do tipo ${type || "desconhecido"}]`;
};

/** The ad a Click-to-WhatsApp message came from — the fields Meta documents, strings only. */
const sourceOf = (m: Obj): Record<string, string> | undefined => {
  const r = obj(m.referral);
  if (!r) return undefined;
  const out: Record<string, string> = {};
  for (const k of ["ctwa_clid", "source_id", "source_type", "source_url", "headline"]) {
    const v = str(r[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
};

/** Our button's id — reply buttons and list rows, or a template's quick-reply payload. */
const replyOf = (m: Obj): { id: string; contextId?: string } | undefined => {
  const i = obj(m.interactive);
  const id =
    str(m.type) === "interactive"
      ? str(obj(i?.button_reply)?.id) || str(obj(i?.list_reply)?.id)
      : str(m.type) === "button"
        ? str(obj(m.button)?.payload)
        : "";
  if (!id) return undefined;
  const contextId = str(obj(m.context)?.id);
  return contextId ? { id, contextId } : { id };
};

/** Meta's unix seconds — text on messages, a number on `user_preferences`. */
const sentAtOf = (m: Obj): string | undefined => {
  const seconds = typeof m.timestamp === "number" ? m.timestamp : Number(str(m.timestamp));
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
};

/** The `value` of every `field` change addressed to our number (all, when none is set). */
const valuesFor = (payload: unknown, phoneNumberId: string, field = "messages"): Obj[] => {
  const out: Obj[] = [];
  const entries = obj(payload)?.entry;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const changes = obj(entry)?.changes;
    for (const change of Array.isArray(changes) ? changes : []) {
      if (obj(change)?.field !== field) continue;
      const value = obj(obj(change)?.value);
      if (!value) continue;
      // A test number and the real one on the same app must not share a funnel.
      if (phoneNumberId !== "" && str(obj(value.metadata)?.phone_number_id) !== phoneNumberId) continue;
      out.push(value);
    }
  }
  return out;
};

/**
 * Every customer message in one webhook POST. Delivery statuses, reactions and anything
 * malformed yield nothing: a webhook that cannot be read is answered 200 and dropped,
 * because Meta retries a non-200 for days. With `phoneNumberId`, only messages to that
 * number count.
 */
export const parseWebhook = (payload: unknown, phoneNumberId = ""): InboundMessage[] => {
  const out: InboundMessage[] = [];
  for (const value of valuesFor(payload, phoneNumberId)) {
    const messages = value.messages;
    for (const raw of Array.isArray(messages) ? messages : []) {
      const m = obj(raw);
      if (!m) continue;
      const externalId = str(m.id);
      const from = str(m.from).replace(/\D/g, "");
      const body = textOf(m);
      if (!externalId || !from || body === null) continue;
      const source = sourceOf(m);
      const sentAt = sentAtOf(m);
      const reply = replyOf(m);
      const type = str(m.type);
      const audioId = type === "audio" || type === "voice" ? str(obj(m[type])?.id) : "";
      out.push({
        externalId,
        from,
        body,
        ...(source ? { source } : {}),
        ...(sentAt ? { sentAt } : {}),
        ...(reply ? { reply } : {}),
        ...(audioId ? { audioId } : {}),
      });
    }
  }
  return out;
};

/**
 * Meta's delivery failures (`statuses[].errors`): id, code and the recipient's digits — never
 * text. 131047 (outside the 24-hour window) is the proof that a send was misjudged; 131050
 * (she turned marketing off) is a refusal, found by her phone.
 */
export const deliveryErrors = (payload: unknown, phoneNumberId = ""): Array<{ id: string; code: number; to: string }> => {
  const out: Array<{ id: string; code: number; to: string }> = [];
  for (const value of valuesFor(payload, phoneNumberId)) {
    const statuses = value.statuses;
    for (const raw of Array.isArray(statuses) ? statuses : []) {
      const st = obj(raw);
      const errors = st?.errors;
      for (const e of Array.isArray(errors) ? errors : []) {
        const code = Number(obj(e)?.code);
        if (Number.isFinite(code)) out.push({ id: str(st?.id), code, to: str(st?.recipient_id).replace(/\D/g, "") });
      }
    }
  }
  return out;
};

/**
 * She turned marketing messages off (or back on) in WhatsApp's own settings ("Ofertas e
 * novidades") — Meta's `user_preferences` webhook. Structured, so no text is read: a `stop`
 * takes the marketing consent back. Only the `marketing_messages` category, phone digits only.
 */
export const marketingPreferences = (
  payload: unknown,
  phoneNumberId = "",
): Array<{ from: string; value: "stop" | "resume"; at?: string }> => {
  const out: Array<{ from: string; value: "stop" | "resume"; at?: string }> = [];
  for (const value of valuesFor(payload, phoneNumberId, "user_preferences")) {
    const prefs = value.user_preferences;
    for (const raw of Array.isArray(prefs) ? prefs : []) {
      const p = obj(raw);
      const v = str(p?.value);
      const from = str(p?.wa_id).replace(/\D/g, "");
      if (!p || str(p.category) !== "marketing_messages" || (v !== "stop" && v !== "resume") || !from) continue;
      const at = sentAtOf(p);
      out.push({ from, value: v, ...(at ? { at } : {}) });
    }
  }
  return out;
};

/** A text message — one per bubble. The checkout link needs its preview off: it is a form. */
/**
 * The phones (digits, as `leads.phone`) that refused marketing in this webhook, structurally:
 * error 131050 on a send, or `stop` in WhatsApp's own settings. Each once.
 */
export const marketingDeclines = (payload: unknown, phoneNumberId = ""): string[] => [
  ...new Set([
    ...deliveryErrors(payload, phoneNumberId).filter((e) => e.code === 131050 && e.to).map((e) => e.to),
    ...marketingPreferences(payload, phoneNumberId).filter((p) => p.value === "stop").map((p) => p.from),
  ]),
];

export const textMessage = (to: string, body: string) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: { preview_url: false, body },
});

/** An approved template, outside the 24-hour window, with its body variables in order. */
export const templateMessage = (to: string, name: string, language: string, variables: readonly string[]) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "template",
  template: {
    name,
    language: { code: language },
    ...(variables.length
      ? { components: [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }] }
      : {}),
  },
});

/**
 * Reply buttons (up to 3), inside the 24-hour window. The id is ours and comes back on the tap
 * (`reply.id`), which is what makes a yes a fact instead of a reading of her text. Meta's
 * limits are enforced here, where a wrong call is a bug, not at the send, where it is a lost
 * message: 1–3 buttons, title 1–20 characters, id 1–256, body 1–1024.
 */
export const replyButtonsMessage = (to: string, body: string, buttons: ReadonlyArray<{ id: string; title: string }>) => {
  if (body.length < 1 || body.length > 1024) throw new Error("botões: corpo de 1 a 1024 caracteres");
  if (buttons.length < 1 || buttons.length > 3) throw new Error("botões: de 1 a 3");
  for (const b of buttons)
    if (b.id.length < 1 || b.id.length > 256 || [...b.title].length < 1 || [...b.title].length > 20)
      throw new Error(`botões: id de 1 a 256 e título de 1 a 20 caracteres (${b.id})`);
  if (new Set(buttons.map((b) => b.id)).size !== buttons.length) throw new Error("botões: ids repetidos");
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  };
};

/** Marks her message read and shows "digitando…" while the turn thinks. */
export const readAndTyping = (messageId: string) => ({
  messaging_product: "whatsapp",
  status: "read",
  message_id: messageId,
  typing_indicator: { type: "text" },
});

/**
 * Her voice message as the agent reads it (operator, 2026-10-07): the transcript, marked as one, so the
 * model knows a strange word may be the transcription's and confirms instead of guessing. Empty → null,
 * and the turn gets the "não consegue ouvir" line as before.
 */
export const transcribedBody = (transcript: string): string | null => {
  const t = transcript.replace(/\s+/g, " ").trim().replace(/\.{2,}$/, ".");
  return t ? `[áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] ${t}` : null;
};

/**
 * Decoded audio (any rate, any channels) as the WAV Meta's transcription takes: mono, 16 kHz, 16-bit PCM.
 * The channels are averaged and the rate reduced by averaging each window — enough for speech, which
 * carries little above 8 kHz. Pure, so it is tested here; the Opus decoding itself is the function's.
 */
export const toWav16k = (channels: readonly Float32Array[], sampleRate: number): Uint8Array => {
  const n = channels[0]?.length ?? 0;
  const ratio = sampleRate / 16000;
  const pcm = new Int16Array(ratio > 0 ? Math.floor(n / ratio) : 0);
  for (let i = 0; i < pcm.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.floor(i * ratio); k < Math.floor((i + 1) * ratio) && k < n; k++) {
      for (const ch of channels) {
        sum += ch[k] ?? 0;
        count++;
      }
    }
    const v = Math.max(-1, Math.min(1, count ? sum / count : 0));
    pcm[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  const wav = new Uint8Array(44 + pcm.length * 2);
  const dv = new DataView(wav.buffer);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) dv.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true);
  dv.setUint32(28, 32000, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  tag(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i]!, true);
  return wav;
};
