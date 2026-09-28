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
import { deliveryErrors, marketingDeclines, parseWebhook, readAndTyping, verifyChallenge, verifySignature } from "./whatsapp.ts";
import { sealInbound } from "./inbound-signature.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const SIGNING_SECRET = Deno.env.get("INBOUND_SIGNING_SECRET") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INBOUND_URL = Deno.env.get("N8N_INBOUND_URL") ?? "https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound";
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
 * Every message of one POST at once — in series, the later ones would outlive the function
 * and vanish. Two messages of hers usually arrive as two POSTs anyway. A failure is logged
 * by message id only (never the phone or the text), since Meta already has its 200.
 */
const forward = async (payload: unknown) => {
  for (const e of deliveryErrors(payload, PHONE_NUMBER_ID)) console.error(`whatsapp: entrega falhou ${e.id} código ${e.code}`);
  const declines = Promise.all(marketingDeclines(payload, PHONE_NUMBER_ID).map(declineMarketing));
  await Promise.all(
    parseWebhook(payload, PHONE_NUMBER_ID).map(async (message) => {
      if (TOKEN && PHONE_NUMBER_ID) {
        await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify(readAndTyping(message.externalId)),
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => r.ok || console.error(`whatsapp: leitura recusada ${message.externalId} HTTP ${r.status}`))
          .catch(() => console.error(`whatsapp: leitura falhou ${message.externalId}`));
      }
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
