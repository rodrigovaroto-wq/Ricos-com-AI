/**
 * The webhook Meta's WhatsApp Cloud API calls (WA-2, 2026-09-25).
 *
 * It does one thing: turn a signed Meta event into the turn's own inbound shape and hand it
 * to n8n's `encorpa-inbound`, the door every probe and persona already uses. Nothing about
 * the conversation is decided here — n8n is the pipe (R5.2), the `turn` function the brain.
 *
 * - GET: the subscription handshake, echoed only with our verify token.
 * - POST: 401 unless `X-Hub-Signature-256` verifies against the app secret; otherwise 200
 *   at once, and the forwarding runs after the response (`EdgeRuntime.waitUntil`). Meta
 *   retries anything slower than a few seconds, and a turn takes up to ~150 s; a retry is
 *   harmless anyway, because the turn deduplicates on the message id.
 *
 * Deployed WITHOUT JWT verification (`--no-verify-jwt`): Meta cannot send a Supabase JWT.
 * The HMAC signature is what authenticates the caller instead.
 *
 * Secrets: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN; N8N_INBOUND_URL is optional.
 */
import { parseWebhook, verifyChallenge, verifySignature } from "./whatsapp.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const INBOUND_URL = Deno.env.get("N8N_INBOUND_URL") ?? "https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound";

/** One message at a time, in order: two messages of hers must reach the turn as two turns. */
const forward = async (raw: string) => {
  for (const message of parseWebhook(JSON.parse(raw))) {
    await fetch(INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, channel: "whatsapp" }),
      signal: AbortSignal.timeout(170_000),
    }).catch((error) => console.error(`whatsapp: falha ao entregar ${message.externalId} ao n8n: ${error}`));
  }
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "GET") {
    const challenge = verifyChallenge(new URL(request.url).searchParams, VERIFY_TOKEN);
    return challenge === null ? new Response("forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
  }
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), APP_SECRET))) {
    return new Response("invalid signature", { status: 401 });
  }
  try {
    JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 }); // signed but unreadable: Meta must not retry it
  }
  const work = forward(raw);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return new Response("ok", { status: 200 });
});
