/**
 * The webhook Meta's WhatsApp Cloud API calls (WA-2, 2026-09-25).
 *
 * It does one thing: turn a signed Meta event into the turn's own inbound shape and hand it
 * to n8n's `encorpa-inbound`, the door every probe and persona already uses. Nothing about
 * the conversation is decided here — n8n is the pipe (R5.2), the `turn` function the brain.
 *
 * - GET: the subscription handshake, echoed only with our verify token.
 * - POST: 413 above 256 KB and 401 unless `X-Hub-Signature-256` verifies against the app
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
 * Secrets: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, INBOUND_SIGNING_SECRET; optional:
 * WHATSAPP_PHONE_NUMBER_ID (only that number's messages), N8N_INBOUND_URL.
 */
import { deliveryErrors, parseWebhook, verifyChallenge, verifySignature } from "./whatsapp.ts";
import { sealInbound } from "./inbound-signature.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const SIGNING_SECRET = Deno.env.get("INBOUND_SIGNING_SECRET") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const INBOUND_URL = Deno.env.get("N8N_INBOUND_URL") ?? "https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound";
/** Meta's payloads are a few KB; anything this big is not Meta, and is refused unread. */
const MAX_BODY_BYTES = 256 * 1024;
/**
 * Under the Edge Function's own wall clock (150 s on the free plan): a forward still waiting
 * then is cut by us, logged, and not silently by the platform. n8n keeps running the turn.
 */
const FORWARD_TIMEOUT_MS = 140_000;

/**
 * Every message of one POST at once — in series, the later ones would outlive the function
 * and vanish. Two messages of hers usually arrive as two POSTs anyway. A failure is logged
 * by message id only (never the phone or the text), since Meta already has its 200.
 */
const forward = async (payload: unknown) => {
  for (const e of deliveryErrors(payload, PHONE_NUMBER_ID)) console.error(`whatsapp: entrega falhou ${e.id} código ${e.code}`);
  await Promise.all(
    parseWebhook(payload, PHONE_NUMBER_ID).map(async (message) => {
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
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "GET") {
    const challenge = verifyChallenge(new URL(request.url).searchParams, VERIFY_TOKEN);
    return challenge === null ? new Response("forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
  }
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return new Response("too large", { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return new Response("too large", { status: 413 });
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
