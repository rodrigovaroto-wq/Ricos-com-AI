/**
 * The webhook Meta's WhatsApp Cloud API calls (WA-2, 2026-09-25).
 *
 * It does one thing: turn a signed Meta event into the turn's own inbound shape and hand it
 * to n8n's `encorpa-inbound`, the door every probe and persona already uses. Nothing about
 * the conversation is decided here — n8n is the pipe (R5.2), the `turn` function the brain.
 *
 * - GET: the subscription handshake, echoed only with our verify token.
 * - POST: 413 above 256 KB (counted while reading) and 401 unless `X-Hub-Signature-256` verifies against the app
 *   secret, both before anything is parsed; otherwise 200 at once, and the forwarding runs
 *   after the response (`EdgeRuntime.waitUntil`). Meta retries anything slower than a few
 *   seconds, and a turn takes up to ~150 s; a retry is harmless anyway, because the turn
 *   deduplicates on the message id.
 * - Each forwarded message carries the inbound seal (INBOUND_SIGNING_SECRET): the n8n door is
 *   public, and the turn refuses an unsealed message once that secret is set.
 *
 * Deployed WITHOUT JWT verification (`--no-verify-jwt`): Meta cannot send a Supabase JWT.
 * The HMAC signature is what authenticates the caller instead.
 *
 * - The read receipt with "digitando…" goes from HERE, the one place that knows the message
 *   really came from Meta (second review: in n8n it fired on any POST to the public door).
 *
 * - A structured marketing refusal (error 131050, or `stop` in WhatsApp's settings) is written
 *   to `leads.marketing_opt_in_declined_at` here, with the consent cleared (PR #38 item 5).
 *
 * Secrets: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, INBOUND_SIGNING_SECRET; optional:
 * WHATSAPP_PHONE_NUMBER_ID (only that number's messages, and needed for the receipt),
 * WHATSAPP_TOKEN (the receipt; absent = no receipt), N8N_INBOUND_URL. SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */
import { deliveryErrors, marketingDeclines, oggOpus, parseWebhook, readAndTyping, toWav16k, transcribedBody, verifyChallenge, verifySignature } from "./whatsapp.ts";
import { sealInbound } from "./inbound-signature.ts";
// The one runtime dependency of the project (operator, 2026-10-07, caminho 1): Meta's transcription takes
// WAV only and WhatsApp sends Ogg/Opus; the Edge runtime has no ffmpeg. libopus in WebAssembly, MIT,
// vendored without its Web Worker (the bundler refuses node:vm) and pinned by hash — see vendor/README.md.
import OpusDecoder from "./vendor/OpusDecoder.js";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const SIGNING_SECRET = Deno.env.get("INBOUND_SIGNING_SECRET") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INBOUND_URL = Deno.env.get("N8N_INBOUND_URL") ?? "https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound";
const META_KEY = Deno.env.get("META_API_KEY") ?? "";
const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
/** US$ 0,18 per hour at R$ 5,40 (dev.meta.ai pricing, 2026-10-07), per second billed. Env overrides. */
const TRANSCRIBE_BRL_PER_SECOND = Number(Deno.env.get("TRANSCRIBE_PRICE_BRL_PER_SECOND") ?? "0.00027");
/** WhatsApp voice is ~16 kbps: 2 MB is ~16 minutes, past Meta's 10. Bigger is not downloaded. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** All of it — media URL, download, decoding, transcription — or the turn goes without the audio. */
const TRANSCRIBE_DEADLINE_MS = 25_000;
/**
 * 5 minutes at the 16 kHz we decode to: ~0.5 s of CPU against the Edge's 2 s per request (10 minutes
 * measured ~1 s, 2026-10-07). Longer, or forged 1-byte packets, stop here and get the "não consegue ouvir" line.
 */
const MAX_AUDIO_SAMPLES = 300 * 16000;
/** Meta's payloads are a few KB; anything this big is not Meta, and is refused unread. */
const MAX_BODY_BYTES = 256 * 1024;
/**
 * Under the Edge Function's own wall clock (150 s on the free plan): a forward still waiting
 * then is cut by us, logged, and not silently by the platform. n8n keeps running the turn.
 */
const FORWARD_TIMEOUT_MS = 140_000;

/**
 * Her refusal is final (0019): only a lead not yet declined is touched, so the first refusal's
 * time stays. `phone` is the unique index. Never throws, and logs no phone — Meta already has
 * its 200 and the messages still go to n8n.
 */
const declineMarketing = async (phone: string) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?phone=eq.${encodeURIComponent(phone)}&marketing_opt_in_declined_at=is.null`, {
      method: "PATCH",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ marketing_opt_in_declined_at: new Date().toISOString(), marketing_opt_in_at: null }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`whatsapp: recusa de marketing não gravada HTTP ${res.status}`);
  } catch (error) {
    console.error(`whatsapp: recusa de marketing falhou: ${error instanceof Error ? error.name : "erro"}`);
  }
};

/**
 * Her voice message, as text (operator, 2026-10-07): the media URL from the Graph API, the Ogg/Opus
 * bytes, decoded and turned into the WAV Meta's transcription takes, and the transcript. Every step has a
 * timeout, and any failure is null — she then gets the "não consegue ouvir" line, as before. The cost is
 * recorded in `llm_calls` (purpose `transcribe`; the conversation is not known here). Logs no text.
 */
const transcribe = async (mediaId: string): Promise<string | null> => {
  if (!TOKEN || !META_KEY) return null;
  const started = Date.now();
  const deadline = AbortSignal.timeout(TRANSCRIBE_DEADLINE_MS);
  let decoder: OpusDecoder | null = null;
  try {
    const auth = { Authorization: `Bearer ${TOKEN}` };
    const media = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, { headers: auth, redirect: "error", signal: deadline });
    const url = media.ok ? String(((await media.json()) as { url?: unknown }).url ?? "") : "";
    // The token only ever goes to Meta's own hosts (the media lives on lookaside.fbsbx.com).
    if (!/^https:\/\/(?:[a-z0-9-]+\.)*(?:fbsbx\.com|facebook\.com|whatsapp\.net)\//i.test(url)) return null;
    const file = await fetch(url, { headers: auth, redirect: "error", signal: deadline });
    if (!file.ok || Number(file.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) {
      await file.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ogg = bytes.length > 0 && bytes.length <= MAX_AUDIO_BYTES ? oggOpus(bytes) : null;
    if (!ogg) return null;
    decoder = new OpusDecoder({ channels: ogg.channels, preSkip: ogg.preSkip, sampleRate: 16000 });
    await (decoder as unknown as { ready: Promise<void> }).ready; // a getter the JS declares outside the class
    // Packet by packet, so a forged file of 1-byte packets (hours of audio in 2 MB) stops at the cap
    // instead of exhausting the worker's memory — no AbortSignal reaches synchronous decoding.
    const chunks: Float32Array[][] = [];
    let samples = 0;
    for (const packet of ogg.packets) {
      const frame = decoder.decodeFrame(packet);
      samples += frame.samplesDecoded;
      if (samples > MAX_AUDIO_SAMPLES) return null;
      chunks.push(frame.channelData.map((ch: Float32Array) => ch.subarray(0, frame.samplesDecoded)));
    }
    const channelData = Array.from({ length: ogg.channels }, (_, c) => {
      const out = new Float32Array(samples);
      let at = 0;
      for (const chunk of chunks) {
        const ch = chunk[c] ?? new Float32Array(0);
        out.set(ch, at);
        at += ch.length;
      }
      return out;
    });
    const form = new FormData();
    form.append(
      "request",
      new Blob([JSON.stringify({ model: TRANSCRIBE_MODEL, audioEncoding: "WAV", languageBias: ["Portuguese"] })], { type: "application/json" }),
    );
    form.append("audio", new Blob([toWav16k(channelData, 16000).buffer as ArrayBuffer], { type: "audio/wav" }), "audio.wav");
    const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${META_KEY}` },
      body: form,
      signal: deadline,
    });
    if (!res.ok) {
      console.error(`whatsapp: transcrição recusada HTTP ${res.status}`);
      return null;
    }
    const out = (await res.json()) as { transcript?: unknown; audioDurationMs?: unknown };
    const seconds = Math.floor(Number(out.audioDurationMs ?? 0) / 1000);
    await fetch(`${SUPABASE_URL}/rest/v1/llm_calls`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        purpose: "transcribe",
        provider: "meta",
        model: TRANSCRIBE_MODEL,
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: 0,
        cost_brl: Number.isFinite(seconds) ? seconds * TRANSCRIBE_BRL_PER_SECOND : 0,
        latency_ms: Date.now() - started,
      }),
      signal: deadline,
    }).catch(() => undefined);
    return transcribedBody(typeof out.transcript === "string" ? out.transcript : "");
  } catch (error) {
    console.error(`whatsapp: transcrição falhou: ${error instanceof Error ? error.name : "erro"}`);
    return null;
  } finally {
    try {
      decoder?.free();
    } catch {
      // Never stops her message from being forwarded.
    }
  }
};

/**
 * Every message of one POST at once — in series, the later ones would outlive the function
 * and vanish. Two messages of hers usually arrive as two POSTs anyway. A failure is logged
 * by message id only (never the phone or the text), since Meta already has its 200.
 */
const forward = async (payload: unknown) => {
  for (const e of deliveryErrors(payload, PHONE_NUMBER_ID)) console.error(`whatsapp: entrega falhou ${e.id} código ${e.code}`);
  const declines = Promise.all(marketingDeclines(payload, PHONE_NUMBER_ID).map(declineMarketing));
  await Promise.all(
    parseWebhook(payload, PHONE_NUMBER_ID).map(async ({ audioId, ...parsed }) => {
      if (TOKEN && PHONE_NUMBER_ID) {
        await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify(readAndTyping(parsed.externalId)),
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => r.ok || console.error(`whatsapp: leitura recusada ${parsed.externalId} HTTP ${r.status}`))
          .catch(() => console.error(`whatsapp: leitura falhou ${parsed.externalId}`));
      }
      // Her voice message as text before it is sealed and forwarded; on failure, the "não ouço" line stays.
      const heard = audioId ? await transcribe(audioId) : null;
      const message = heard ? { ...parsed, body: heard } : parsed;
      try {
        const signature = SIGNING_SECRET ? await sealInbound(SIGNING_SECRET, message) : undefined;
        const res = await fetch(INBOUND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...message, ...(signature ? { signature } : {}), channel: "whatsapp" }),
          signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
        });
        if (!res.ok) console.error(`whatsapp: n8n recusou ${message.externalId} com HTTP ${res.status}`);
      } catch (error) {
        console.error(`whatsapp: falha ao entregar ${message.externalId} ao n8n: ${error instanceof Error ? error.name : "erro"}`);
      }
    }),
  );
  await declines;
};

/**
 * The body, or null above the cap — read with a running count, never whole first. A
 * declared size above the cap is refused unread; a missing one (chunked) is read up to the
 * cap and no further (second review: refusing it outright would drop every real message).
 */
const readCapped = async (request: Request): Promise<string | null> => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(all);
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "GET") {
    const challenge = verifyChallenge(new URL(request.url).searchParams, VERIFY_TOKEN);
    return challenge === null ? new Response("forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
  }
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await readCapped(request);
  if (raw === null) return new Response("too large", { status: 413 });
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), APP_SECRET))) {
    return new Response("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 }); // signed but unreadable: Meta must not retry it
  }
  const work = forward(payload);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return new Response("ok", { status: 200 });
});
