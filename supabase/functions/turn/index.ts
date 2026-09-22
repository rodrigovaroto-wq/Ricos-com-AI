/**
 * One conversation turn, end to end — plus the cron sweep of the follow-up rulers.
 *
 * The n8n webhook posts an inbound message here; this function owns everything that
 * decides what goes back: dedupe, persistence, the cost ceiling, the two model calls
 * and the seventeen guardrails. A second entry point, { job: "followups" }, is the clock
 * half: it sweeps due touches, renders them deterministically and gates them the same
 * way. n8n stays the pipe and the clock.
 *
 * Auth is the project's service_role JWT in the Authorization header — the same key
 * n8n holds in its credential.
 */
import {
  classifyOptOut,
  gateBriefing,
  remedyFor,
  runGates,
  wantsHuman,
  type GateConfig,
} from "./guardrails.ts";
import {
  decideTouch,
  nextOpening,
  onOrderConfirmed,
  renderFollowup,
  scheduleSilence,
  type FollowupKind,
  type StopPoint,
} from "./followups.ts";
import { extractDressSize, sizeFromDressSize } from "./sizing.ts";
import { furthest, overwritableBy, reachedStage, type Stage } from "./state-machine.ts";
import { checkRegion, type Region } from "./availability.ts";
import {
  confirmsAddress,
  extractAddress,
  readBackAddress,
  isComplete,
  mergeAddress,
  type Address,
} from "./address.ts";
import {
  extractIdentity,
  isIdentityComplete,
  mergeIdentity,
  nextIdentityQuestion,
  type Identity,
} from "./identity.ts";
import {
  buildCheckoutLink,
  buildCoinzzRequest,
  CoinzzIncompleteError,
  missingCoinzzConfig,
  type CheckoutLinkConfig,
  type CoinzzConfig,
  type CoinzzRequest,
} from "./coinzz.ts";
import {
  decideNext,
  HOLDING_REPLY,
  HUMAN_HANDOFF_REPLY,
  SAFE_FALLBACK_REPLY,
  WELCOME_AUTO_REPLY,
  WELCOME_RESUME_DELAY_SECONDS,
  type NextAction,
} from "./retry.ts";
import { systemPrompt as buildSystemPrompt } from "./prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Meta's Llama API — OpenAI-compatible request/response shape, different host and
// key. `callMuse` is the only function that reads this.
const META_KEY = Deno.env.get("META_API_KEY") ?? "";
const USD_TO_BRL = Number(Deno.env.get("USD_TO_BRL") ?? "5.4");

/** Nenhuma credencial sai desta função em texto de erro. Ver `modelFailure`. */
const redactKeys = (text: string): string => {
  let out = text;
  for (const secret of [GEMINI_KEY, OPENAI_KEY, META_KEY, SERVICE_KEY]) {
    if (secret) out = out.replaceAll(secret, "[redacted]");
  }
  return out;
};

/**
 * The conversation model, read from the environment. On 2026-09-09 the OpenAI quota ran
 * out for 20 hours and every customer turned into a handoff, while Gemini was up the
 * whole time — and this was a constant, so there was no way out without a deploy.
 * `CLAUDE.md` says it in one line: the provider is configuration, not architecture.
 *
 * The default was `gpt-5.6-luna` through v32. **Decided 2026-09-10: Muse Spark 1.3**,
 * inside the R$ 0,50/lead ceiling with the most Intelligence Index headroom of any
 * candidate that fit it — see `HANDOFF.md` §Frente 5. Gemini is untouched; this is the
 * conversation model only, and the eval that section calls for (real conversations,
 * measuring conversion and gate refusal, not benchmark score) has not been run — this
 * swap ships the mechanism, not the proof.
 *
 * What this knob does and does NOT do, because the difference is expensive: it selects a
 * model on **one of two specific APIs**, and only two — `callLuna` speaks the
 * OpenAI-compatible endpoint, `callMuse` speaks Meta's Llama API endpoint (also
 * OpenAI-request-shaped, different host and key). It is not an open provider switch.
 * Pointing it at `gemini-3.5-flash-lite` would send that name to whichever of those two
 * hosts the prefix resolves to, which answers "the model does not exist" — so the name
 * is checked here, at load, against every provider this function does not implement,
 * instead of being discovered one customer at a time.
 *
 * The default stays the model above, so an unset — or blank — variable behaves exactly
 * as intended: no environment variable, no drift between what the operator believes is
 * running and what is.
 */
const DEFAULT_CONVERSATION_MODEL = "muse-spark-1.3";
// `Deno.env.get` returns "" for a variable saved blank, and `??` only falls through on
// `undefined`. A trailing space from a panel copy-paste is the same class of accident.
const CONVERSATION_MODEL =
  (Deno.env.get("CONVERSATION_MODEL") ?? "").trim() || DEFAULT_CONVERSATION_MODEL;
const CHEAP_MODEL = "gemini-3.5-flash-lite";
// Which host and key `CONVERSATION_MODEL` resolves to — the one place that decides it,
// so `callLuna`/`callMuse` and the provider label recorded in `llm_calls` never disagree.
const MUSE_FAMILY = /^muse/i;
/** USD per 1M tokens. Mirrors src/llm/pricing.ts. */
const PRICES: Record<string, { in: number; out: number; cached?: number }> = {
  [DEFAULT_CONVERSATION_MODEL]: { in: 1.25, out: 4.25 },
  [CHEAP_MODEL]: { in: 0.3, out: 2.5 },
};

/**
 * A misconfigured model must not take the function down. The same isolate serves all
 * three paths from one `Deno.serve`: the conversation turn, the **order webhook** and
 * the **cron sweep**. A `throw` at module scope would take all three — a confirmed sale
 * would never be filed, and the sweep would stop and then fire up to 50 overdue touches
 * at once when it came back, because it has no staleness cutoff. Only the conversation
 * depends on this model, so only the conversation fails: the error is held here and
 * thrown inside `callLuna`/`callMuse`.
 */
let MODEL_CONFIG_ERROR: string | null = null;

if (CONVERSATION_MODEL !== DEFAULT_CONVERSATION_MODEL) {
  // Names this function cannot serve, whatever price comes with them. `muse` came off
  // this list on 2026-09-10, when `callMuse` started speaking Meta's Llama API — every
  // other prefix here is still refused because no provider for it exists yet. Checking
  // the name is a heuristic, but it catches the exact misuse the comment above used to
  // invite, and the cost of missing it is not a failed turn — see `modelFailure`.
  const foreign = /^(gemini|claude|grok|qwen|llama|mistral|command|deepseek)/i;
  const rawPrice = (Deno.env.get("CONVERSATION_MODEL_PRICE") ?? "").trim();

  if (foreign.test(CONVERSATION_MODEL)) {
    MODEL_CONFIG_ERROR =
      `CONVERSATION_MODEL=${CONVERSATION_MODEL} não é servido por nenhuma das duas APIs ` +
      `que esta função fala (OpenAI-compatível para Luna, Meta Llama API para Muse). ` +
      `Trocar de provedor é código, não variável de ambiente`;
  } else if (!rawPrice) {
    MODEL_CONFIG_ERROR =
      `CONVERSATION_MODEL=${CONVERSATION_MODEL} sem CONVERSATION_MODEL_PRICE: um modelo novo ` +
      `precisa do preço junto, senão o custo por chamada fica incomparável com o anterior`;
  } else {
    /**
     * A model swap has to carry its own price. `costOf` throws on an unknown model, so a
     * new model with no price would fail one turn at a time, mid-conversation, after the
     * tokens were already spent — and every cost row from there on would be incomparable.
     * Set `CONVERSATION_MODEL_PRICE` to `{"in":1.25,"out":4.25}` (USD per 1M tokens,
     * `cached` optional) alongside the model, and unset both to roll back.
     */
    const num = (v: unknown, name: string): number => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        throw new Error(`CONVERSATION_MODEL_PRICE.${name} inválido: ${JSON.stringify(v)}`);
      }
      // A ceiling, because the failure mode of an absurd price is the opposite of the
      // intuitive one. `Number.MAX_VALUE` is finite and passes the check above, but the
      // cost it produces overflows to Infinity, `JSON.stringify` writes it as `null`,
      // Postgres stores NULL, and the next turn reads `Number(null ?? 0)` — zero. The
      // conversation cap is then rearmed at zero and never fires again: unlimited spend,
      // one model call per turn, forever, with `llm_calls.cost_brl` NULL so the audit
      // trail is gone too.
      //
      // 100 USD per 1M tokens is roughly two orders of magnitude above the priciest model
      // this funnel would ever consider — Muse Spark 1.3 is 1.25 in / 4.25 out. Tightened
      // from 1000 on 2026-09-10. The old value was chosen so a 1000x typo would still
      // land inside the ceiling and fail loudly at the conversation cap instead; at 100 a
      // 1000x typo is refused here, at load. That is the better failure now that a
      // configuration error is a `ModelConfigError` and no longer locks the lead out of
      // the agent — being refused before the first token is spent beats being caught
      // after it.
      if (v > 100) {
        throw new Error(
          `CONVERSATION_MODEL_PRICE.${name}=${v} está acima do teto de 100 USD por 1M tokens: ` +
            `preço absurdo zera o teto de custo por conversa em vez de acioná-lo`,
        );
      }
      return v;
    };
    try {
      const value = JSON.parse(rawPrice) as unknown;
      // `as` does not protect against `null`: `CONVERSATION_MODEL_PRICE=null` is valid
      // JSON, and reading `.in` off it would be a bare TypeError naming no variable.
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`esperado um objeto, veio ${JSON.stringify(value)}`);
      }
      const parsed = value as { in?: unknown; out?: unknown; cached?: unknown };
      PRICES[CONVERSATION_MODEL] = {
        in: num(parsed.in, "in"),
        out: num(parsed.out, "out"),
        ...(parsed.cached === undefined ? {} : { cached: num(parsed.cached, "cached") }),
      };
    } catch (error) {
      // A bare SyntaxError names no variable, and it is the only thing the operator has
      // in the log. Name the variable and the expected shape.
      MODEL_CONFIG_ERROR = `CONVERSATION_MODEL_PRICE inválido — esperado ` +
        `{"in":number,"out":number} (USD por 1M tokens, "cached" opcional): ` +
        `${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

interface BusinessConfig extends GateConfig {
  brand: string;
  agentName: string;
  delivery: {
    codDaysMin: number;
    codDaysMax: number;
    /** A janela do antecipado, em dias úteis — conferida no checkout em 2026-09-08. */
    prepayAvgDays?: number;
    prepayVariesByRegion?: boolean;
    warrantyDays: number;
    freeShipping: boolean;
  };
  cost: { conversationCapBrl: number; overrunTolerance: number };
  /** Where the handoff alert goes while there is no WhatsApp number (R9.2). */
  handoff?: { email: string };
  /**
   * The Coinzz order, minus the credential — that one lives in an n8n credential, and
   * the HTTP call with it. What belongs here is the part that is a business rule:
   * which offer, and which of their four payment methods means paying at the door.
   */
  coinzz?: Partial<CoinzzConfig>;
  /**
   * The two checkout URLs. This is the path the operator chose (2026-09-08): the agent
   * fills what the checkout accepts and she finishes there, because the delivery day is
   * a choice only she can make and it lives inside the checkout.
   */
  checkout?: Partial<CheckoutLinkConfig>;
  /**
   * Real reviews, word for word. The `invented_testimonial` gate refuses any quote
   * attributed to a customer that is not in this list — which, while the list was
   * empty, meant the agent could never use social proof at all. Fill it and quoting
   * becomes a tool she can reach for.
   */
  testimonials?: string[];
}

const CONFIG: BusinessConfig = JSON.parse(
  Deno.env.get("BUSINESS_CONFIG") ??
    JSON.stringify({
      brand: "Encorpa",
      agentName: "Valen",
      prices: { codBrl: 129.9, prepayBrl: 129.9, prepayDiscountPercent: 0, anchorBrl: 216.5 },
      delivery: {
        codDaysMin: 1,
        codDaysMax: 3,
        prepayAvgDays: 5,
        prepayVariesByRegion: true,
        warrantyDays: 7,
        freeShipping: false,
      },
      hours: { openHour: 6, closeHour: 24 },
      cost: { conversationCapBrl: 1.5, overrunTolerance: 0.25 },
      coupon: { percent: 20, active: false },
      cod: { physicalOnDeliveryActive: true },
      // Urgência ligada pelo operador em 2026-09-08. `unitsLeft` dá a ela um número
      // estável para repetir; `allowUnverified` deixa ela criar urgência sobre o lote
      // mesmo sem contagem por trás. Trocar aqui, ou sobrescrever por BUSINESS_CONFIG.
      scarcity: { unitsLeft: 12, allowUnverified: true },
      // `afterpay` é o método da Coinzz que corresponde a pagar depois, confirmado
      // pelo operador em 2026-09-08. `offerHash` ainda vem do painel — sem ele o
      // corpo não é montado, e o turno diz exatamente o que falta em vez de mandar
      // um pedido pela metade.
      coinzz: { codPaymentMethod: "afterpay" },
    }),
);

const ceilingBrl = CONFIG.cost.conversationCapBrl * (1 + CONFIG.cost.overrunTolerance);

const db = async (path: string, init: RequestInit = {}): Promise<any> => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`db ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const costOf = (model: string, inTok: number, outTok: number, cachedTok = 0): number => {
  const p = PRICES[model];
  if (!p) throw new Error(`modelo sem preço: ${model}`);
  const fresh = Math.max(0, inTok - cachedTok);
  const usd =
    (fresh * p.in + cachedTok * (p.cached ?? p.in) + outTok * p.out) / 1_000_000;
  const brl = +(usd * USD_TO_BRL).toFixed(6);
  // Belt for the same overflow, independent of where the price came from: a non-finite
  // cost serializes to `null`, comes back as 0, and disarms the conversation cap in
  // silence. Throwing sends the turn to handoff, which is the loud failure we want.
  if (!Number.isFinite(brl)) {
    throw new Error(`custo não finito para ${model}: in=${inTok} out=${outTok} cached=${cachedTok}`);
  }
  return brl;
};

/**
 * Where the conversation stands, written down (R11.8, achado C de 2026-09-22).
 *
 * `conversations.stage` was born `'discovery'` — a value absent from `STAGES` — and
 * nobody ever wrote it. The state machine ran in tests and in the simulator; production
 * had no idea where any conversation had stopped, so there was no funnel to ask about.
 *
 * `furthest` decides what gets stored: a conversation never regresses, and a terminal
 * stage enters only where `TRANSITIONS` allows it. The PATCH carries the same rule as a
 * condition on the row (`overwritableBy`), because `stored` was read at the start of the
 * turn and an overlapping turn may have advanced it since. Failure here is swallowed on
 * purpose — a funnel counter is not worth losing a reply the customer is waiting for.
 */
const persistStage = async (conversationId: string, stored: Stage, reached: Stage) => {
  const next = furthest(stored, reached);
  if (next === stored) return;
  await db(`conversations?id=eq.${conversationId}&stage=in.(${overwritableBy(next).join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ stage: next }),
  }).catch(() => undefined);
};

/** The six ways a turn can end, as `turn_outcomes.outcome` spells them. */
type TurnOutcome = "send" | "fallback" | "deferred" | "handoff" | "stopped" | "opted_out";

/**
 * How this turn ended, written down (R11.8, achado D de 2026-09-22).
 *
 * The outcome used to travel only in the HTTP body: n8n read it, sent the message, and
 * the fact died there. `gate_traces` records which gate vetoed and `llm_calls` records
 * what each attempt cost — what neither could answer is whether the customer received
 * the model's reply or the canned one. That is the most important quality signal the
 * system has, because a fallback is the agent giving up on the sale.
 *
 * `rewrites` and `cost_brl` ride along because `llm_calls` has no notion of a turn:
 * without them there is no way to price a gate that keeps firing. `cost_brl` is what
 * THIS turn spent, not the conversation's running total — summing the total per turn
 * inflates the price of every gate by the length of the conversation.
 */
const recordOutcome = async (
  conversationId: string,
  outcome: TurnOutcome,
  reason: string | null = null,
  rewrites = 0,
  costBrl = 0,
) => {
  await db("turn_outcomes", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      outcome,
      reason,
      rewrites,
      cost_brl: costBrl,
    }),
  }).catch(() => undefined);
};

const callGemini = async (system: string, user: string) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL}:generateContent`,
    {
      method: "POST",
      // The key rides in the documented header, never in the URL: a network error
      // carries the whole URL in its `message`, and that message used to reach n8n logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        system_instruction: { role: "user", parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 300 },
      }),
    },
  );
  const body = await response.json();
  if (body.error) throw new Error(`gemini: ${body.error.message}`);
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  const usage = body.usageMetadata ?? {};
  const inTok = usage.promptTokenCount ?? 0;
  const outTok = usage.candidatesTokenCount ?? 0;
  return {
    text,
    inTok,
    outTok,
    cachedTok: 0,
    costBrl: costOf(CHEAP_MODEL, inTok, outTok),
  };
};

/**
 * Marca um erro que é da CONFIGURAÇÃO, não desta cliente. A diferença decide se o lead
 * fica permanentemente fora da agente — ver `modelFailure`.
 */
class ModelConfigError extends Error {}

const callLuna = async (
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) => {
  if (MODEL_CONFIG_ERROR) throw new ModelConfigError(MODEL_CONFIG_ERROR);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONVERSATION_MODEL,
      messages: [{ role: "system", content: system }, ...history],
      // luna is a reasoning model: a tight budget returns an error with no content,
      // not a truncated answer.
      max_completion_tokens: 900,
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`openai: ${body.error.message}`);
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("openai: resposta sem conteúdo");
  const usage = body.usage ?? {};
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  const cachedTok = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text: text as string,
    inTok,
    outTok,
    cachedTok,
    costBrl: costOf(CONVERSATION_MODEL, inTok, outTok, cachedTok),
  };
};

/**
 * Meta's Llama API — OpenAI-request-shaped, different host and key. Added 2026-09-10
 * alongside the swap to Muse Spark 1.3 (`MUSE_FAMILY`). Unlike `callLuna`, Muse Spark is
 * not documented as a reasoning model, so there is no completion-token floor here —
 * `max_tokens` is the plain output budget, not a reasoning-plus-output one.
 */
const callMuse = async (
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) => {
  if (MODEL_CONFIG_ERROR) throw new ModelConfigError(MODEL_CONFIG_ERROR);
  const response = await fetch("https://api.llama.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${META_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONVERSATION_MODEL,
      messages: [{ role: "system", content: system }, ...history],
      max_tokens: 900,
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`meta: ${body.error.message}`);
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("meta: resposta sem conteúdo");
  const usage = body.usage ?? {};
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  const cachedTok = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text: text as string,
    inTok,
    outTok,
    cachedTok,
    costBrl: costOf(CONVERSATION_MODEL, inTok, outTok, cachedTok),
  };
};

/**
 * One model call, recorded. The token columns exist in `llm_calls` and were being
 * written as zero on every row, which makes the stored cost impossible to audit
 * afterwards: a bill that disagrees with the sum has no breakdown to check it against.
 */
type ModelCall = { text: string; inTok: number; outTok: number; cachedTok: number; costBrl: number };

const recordCall = (
  conversationId: string,
  purpose: string,
  provider: string,
  model: string,
  call: ModelCall,
) =>
  db("llm_calls", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      purpose,
      provider,
      model,
      input_tokens: call.inTok,
      output_tokens: call.outTok,
      cached_tokens: call.cachedTok,
      cost_brl: call.costBrl,
    }),
  }).catch(() => undefined);

/**
 * The prompt lives in `./prompt.ts` since 2026-09-22, where `tests/prompt.test.ts` can
 * build it and run what it teaches through the gates; this only binds it to the running
 * config and to the briefing of the same gates that will judge the reply.
 */
const systemPrompt = (
  sizeDirective: string | null,
  identityDirective: string | null = null,
  checkoutDirective: string | null = null,
): string =>
  buildSystemPrompt(CONFIG, gateBriefing(CONFIG), sizeDirective, identityDirective, checkoutDirective);

/**
 * R8.4: the model must never convert a clothing size on its own — a real conversation
 * had it pick one size off the published table, and a wrong size becomes a COD return
 * (pure loss). When the customer's message names a plausible size, resolve it here and
 * hand the model the answer as a fact to state, not a number to reason about.
 */
const statedSize = (message: string): { stated: number; size: string } | null => {
  const stated = extractDressSize(message);
  return stated === null ? null : { stated, size: sizeFromDressSize(stated) };
};

/**
 * The size, and the postcode that comes after it.
 *
 * This used to hold the size back until a postcode existed, and the operator caught what
 * that produced: she says "uso 42 de calça" and gets asked for her CEP. She asked a
 * question and received a form. Nobody talks like that, and the whole point of this agent
 * is that she should not be able to tell.
 *
 * The order is the natural one now. Which size fits is the published table — ours,
 * deterministic, and the answer she is waiting for, so it goes out immediately. Whether
 * it reaches her is the region, which is a different question and comes second, as a
 * reason rather than a requirement: "pra ver como fica a entrega aí".
 *
 * These are notes on intent, not a script. The prompt gives the agent room to improvise
 * and a directive that dictates the sentence takes it back — which is how the last
 * version ended up sounding like a form in the first place.
 */
const sizeDirectiveFor = (
  stated: { stated: number; size: string } | null,
  known: string | null,
  region: Region | null,
): string | null => {
  // The size survives the turn it was said in. Reading only what THIS message contained
  // left the turn where she sends her postcode with no size at all, and the agent hedged
  // about something it had worked out two turns earlier.
  const size = stated?.size ?? known;
  if (size === null) return null;

  const fitting = `O tamanho dela é ${size} — a tabela da loja resolve isso, não recalcule` +
    ` nem escolha outro. Diga na hora, com naturalidade, sem a palavra "manequim".`;

  if (region === null) {
    return `${fitting} Depois de responder, puxe o CEP dela na mesma mensagem, do jeito` +
      ` que uma pessoa puxaria: você quer ver como fica a entrega na região dela. É um` +
      ` favor que você está fazendo, não um cadastro — nunca peça o endereço inteiro.`;
  }
  if (!region.cod) {
    return `${fitting} A entrega agendada não cobre o CEP dela, então ofereça o pagamento` +
      ` antecipado como a saída boa que ele é: chega em qualquer lugar do país, mesmo` +
      ` frete grátis, e ainda sai mais barato.`;
  }
  return `${fitting} A entrega chega no CEP dela${
    region.sameDay ? `, e existe a opção de receber HOJE, em até 4 horas — não guarde isso` : ""
  }. Fale disso como boa notícia, não como confirmação de sistema.`;
};

/**
 * Name, e-mail and CPF — the three the checkout link carries, and the only three the
 * conversation collects. One question at a time, because a form in a WhatsApp message is
 * where a sale stops.
 *
 * The order matters. Name first, because she gives it without thinking. CPF last, because
 * it is the one that makes people hesitate, and by then she has already invested in the
 * conversation.
 *
 * The address is deliberately not here any more (operator, 2026-09-08). The checkout has
 * no query parameter for it, so anything collected in the conversation she would type
 * again anyway — five turns spent to make her do the work twice.
 */
const identityDirectiveFor = (draft: Partial<Identity>): string | null => {
  if (isIdentityComplete(draft)) return null;
  // Nothing collected yet means the model decides *when* to start — the prompt says only
  // after she has decided to buy. This directive drives the ORDER, not the opening: fired
  // unconditionally it would have the agent asking a stranger for her full name in reply
  // to "oi", which is where the conversation ends.
  if (Object.keys(draft).length === 0) return null;
  const missing = (["name", "email", "document"] as const).filter((f) => !draft[f]);
  const ask = nextIdentityQuestion(missing);
  return ask === null
    ? null
    : `Para fechar o pedido ainda falta: ${missing.join(", ")}. Pergunte SÓ isto agora,` +
      ` com naturalidade: "${ask}". Uma coisa de cada vez — nunca peça a lista inteira.`;
};

/**
 * The message that carries the link, and what it must not imply.
 *
 * The link fills four fields and drops her at the address step; it does not create an
 * order. So the agent says what is left — the address, the size, the day — and never that
 * the order is done. A customer who thinks she has bought and then gets a delivery-day
 * message she does not expect is the refusal at the door this whole funnel is built to
 * avoid.
 *
 * The day is genuinely good news and is said as such: three dates, and she picks.
 *
 * On the cash-on-delivery path the size needs saying out loud, and this is the one
 * instruction that cannot be dropped. That checkout is Logzz's scheduling page, where
 * the size is NOT a selector — the supplier's own product page says it in capitals:
 * "INSIRA O TAMANHO NO COMPLEMENTO DO AGENDAMENTO". She types it into the complement
 * field with the delivery day. Left blank, the warehouse picks for her, and a piece that
 * does not fit comes back at the operator's cost.
 */
const checkoutDirectiveFor = (
  url: string | null,
  size: string | null,
  path: "cod" | "prepay",
): string | null =>
  url === null
    ? null
    : `Você já tem tudo. Mande este link para ela agora, exatamente como está, sem encurtar` +
      ` e sem alterar:\n${url}\nDiga que os dados dela já vão preenchidos. Falta ela, lá` +
      ` dentro: digitar o endereço de entrega, escolher o dia da entrega — são três dias` +
      ` pra ela escolher, e isso é bom, fale como bom — e${
        path === "cod"
          ? ` ESCREVER O TAMANHO${size ? ` (${size})` : ""} NO CAMPO DE COMPLEMENTO do` +
            ` agendamento. Diga isso com todas as letras: é ali que o tamanho entra, e em` +
            ` branco o depósito escolhe por ela.`
          : `${size ? ` escolher o tamanho ${size}` : ` escolher o tamanho`}.`
      } NÃO diga que o pedido já está feito: ele nasce quando ela terminar no checkout.`;

/**
 * Everything the notifier needs to reach a person without querying the database
 * again — n8n sends the mail, this decides what it says. The destination comes from
 * the business config (R9.2); null there means nothing is configured yet, which the
 * flow should surface rather than swallow.
 */
const notification = (
  lead: { id: string; phone: string },
  conversation: { id: string },
) => ({
  notify: CONFIG.handoff?.email ?? null,
  leadId: lead.id,
  phone: lead.phone,
  conversationId: conversation.id,
});

/**
 * Human rhythm, for whoever sends. Mirrors `src/agent/pacing.ts` — the bubble half of
 * it, which is the half a sender needs; `firstReplyAt` and `presenceRefreshes` stay
 * there because they belong to the sender's own clock, not to this response. Declared
 * inline like `PRICES`, because Supabase uploads file contents rather than resolving
 * the repo, and held to the source by a test in `tests/function-drift.test.ts`.
 *
 * Two rules that are easy to get wrong, both already paid for once:
 * 1. The delay is per bubble, not per reply. A three-bubble answer that waits twenty
 *    seconds and then dumps everything at once is the opposite of the intended effect.
 * 2. Never instant. A one-word bubble still waits a second.
 */
const MS_PER_WORD = 800;

const bubbleDelayMs = (bubble: string): number =>
  Math.max(1_000, bubble.trim().split(/\s+/).length * MS_PER_WORD);

const splitBubbles = (text: string, max = 3): string[] => {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= max) return paragraphs;
  const head = paragraphs.slice(0, max - 1);
  return [...head, paragraphs.slice(max - 1).join("\n\n")];
};

/**
 * The reply as the channel should play it. `reply` stays exactly as it was — it is what
 * the database holds and what a person reads in a handoff mail — and `bubbles` is the
 * same text, split and timed, so the sender never has to reimplement the rhythm.
 */
const paced = (text: string | null): Array<{ text: string; delayMs: number }> =>
  text === null ? [] : splitBubbles(text).map((b) => ({ text: b, delayMs: bubbleDelayMs(b) }));

/** She answered — every pending touch for this conversation is moot. */
/**
 * She spoke, so the silence ruler has nothing left to chase. ONLY the silence ruler: this
 * used to cancel every scheduled touch, which meant the first message a customer sent
 * after buying killed `order_shipped`, `order_eve` and `order_delivered` — the delivery-eve
 * message being the one the whole post-order ruler exists for, and the one that prevents
 * the refusal at the door. `onOrderConfirmed` filters `silence_` on purpose; this had to
 * as well, and did not.
 */
const cancelScheduled = (conversationId: string) =>
  db(`followups?conversation_id=eq.${conversationId}&status=eq.scheduled&kind=like.silence_*`, {
    method: "PATCH",
    body: JSON.stringify({ status: "canceled" }),
  }).catch(() => undefined);

/** Where she stopped decides what the first touch says. */
const stopPointOf = (replyText: string): StopPoint => {
  const t = replyText.toLowerCase();
  if (t.includes("checkout") || t.includes("link")) return "link_sent";
  // From the config, not typed here: hardcoded prices meant a price change silently
  // downgraded every "she already heard the price" touch to the opening one.
  const priced = [CONFIG.prices.codBrl, CONFIG.prices.prepayBrl].map((v) =>
    v.toFixed(2).replace(".", ","),
  );
  if (priced.some((v) => t.includes(v))) return "after_price";
  return "before_size";
};

/**
 * `from` is the moment the ruler is anchored on: normally now, the instant the agent
 * finished speaking, and the next opening when a touch was postponed by the clock —
 * re-anchoring keeps the 30min / next morning / 3 days spacing instead of dragging one
 * touch forward into the next.
 */
const scheduleSilenceTouches = async (
  conversationId: string,
  stopPoint: StopPoint,
  from: Date = new Date(),
) => {
  await cancelScheduled(conversationId);
  const rows = scheduleSilence(from).map((f) => ({
    conversation_id: conversationId,
    kind: f.kind,
    run_at: f.runAt.toISOString(),
    status: "scheduled",
    stop_point: stopPoint,
  }));
  await db("followups?on_conflict=conversation_id,kind", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  }).catch(() => undefined);
};

/**
 * The clock half of the agent. n8n calls this on a cron; everything it decides is
 * deterministic — no model call, so a sweep costs nothing however often it runs.
 */
/**
 * A confirmed sale, delivered by n8n from the Logzz or Coinzz webhook.
 *
 * This closed the oldest hole in the system. Until 2026-09-09 nothing wrote `orders` and
 * nothing armed the post-order ruler, so four written, rendered and tested touches never
 * fired once — and worse, the silence ruler kept running: a customer who paid at the door
 * still got "ainda tá pensando?" three days later.
 *
 * The decision of what to cancel and what to arm is `onOrderConfirmed`, in `followups.ts`,
 * because nothing in this file is reachable by a test. Here there is only I/O.
 *
 * Idempotent by `external_id`: the same webhook arriving twice — a retry, a status change —
 * writes the order once and never slides an already-scheduled touch off its date.
 */
interface OrderWebhook {
  externalId: string;
  phone: string;
  paymentMethod: "cod" | "prepay";
  size: string;
  amountBrl: number;
  status?: string;
  checkoutUrl?: string;
  scheduledFor?: string;
  orderedAt?: string;
}

/** Digits only, which is how a phone survives being written six different ways. */
const digits = (v: string): string => v.replace(/\D/g, "");

const recordOrder = async (order: OrderWebhook) => {
  // Without an id every retry inserts a fresh row: `external_id` is unique but nullable,
  // and NULL never conflicts with NULL. Refusing loudly beats duplicating silently.
  if (!order.externalId?.trim()) return { status: "missing_external_id", ok: false };

  // The webhook writes the phone the way its platform stores it — +55, spaces, dashes,
  // sometimes without the 9. The lead row holds whatever the channel delivered. An exact
  // match is the happy path; the suffix is what stops a sale from silently not existing.
  const exact = await db(`leads?phone=eq.${encodeURIComponent(order.phone)}&select=id`);
  const tail = digits(order.phone).slice(-8);
  let lead = exact?.[0];
  if (!lead && tail.length === 8) {
    // Two rows ending the same way is not a match, it is a coin toss — and the loser
    // gets someone else's sale filed against her, with the follow-ups to match. Asking
    // for two is how the ambiguity becomes visible; taking [0] threw that away.
    const bySuffix = await db(`leads?phone=like.*${tail}&select=id&limit=2`);
    if (bySuffix?.length === 1) lead = bySuffix[0];
    else if ((bySuffix?.length ?? 0) > 1) {
      return { status: "ambiguous_phone", phone: order.phone, ok: false };
    }
  }
  // 200 here would tell n8n the sale was filed when nothing was written and the silence
  // ruler is still chasing her. It has to be visible.
  if (!lead) return { status: "unknown_lead", phone: order.phone, ok: false };

  const conversations = await db(
    `conversations?lead_id=eq.${lead.id}&select=id&order=created_at.desc&limit=1`,
  );
  const conversation = conversations?.[0] ?? null;

  await db("orders?on_conflict=external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      lead_id: lead.id,
      conversation_id: conversation?.id ?? null,
      external_id: order.externalId,
      checkout_url: order.checkoutUrl ?? null,
      payment_method: order.paymentMethod,
      size: order.size,
      amount_brl: order.amountBrl,
      status: order.status ?? "created",
      scheduled_for: order.scheduledFor ?? null,
      updated_at: new Date().toISOString(),
    }),
  });

  // No conversation means no ruler to touch — the sale is recorded and that is all.
  if (!conversation) return { status: "recorded", orderId: order.externalId, touches: 0 };

  // Every row, not just the scheduled ones: a kind already `sent` still occupies the
  // unique key, and re-arming it throws.
  const existing = await db(
    `followups?conversation_id=eq.${conversation.id}&select=kind,status`,
  );
  const effect = onOrderConfirmed(
    (existing ?? []) as Array<{ kind: FollowupKind; status: "scheduled" | "sent" | "canceled" }>,
    order.orderedAt ? new Date(order.orderedAt) : new Date(),
    CONFIG.delivery.codDaysMin,
    order.status,
  );

  for (const kind of effect.cancel) {
    await db(`followups?conversation_id=eq.${conversation.id}&kind=eq.${kind}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "canceled" }),
    });
  }
  if (effect.arm.length > 0) {
    await db("followups?on_conflict=conversation_id,kind", {
      method: "POST",
      // `ignore-duplicates`, never merge: two webhooks racing must not slide a touch that
      // already exists onto a new date. The rule already dedupes against every row; this
      // is the half that survives the race the rule cannot see.
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(
        effect.arm.map((f) => ({
          conversation_id: conversation.id,
          kind: f.kind,
          run_at: f.runAt.toISOString(),
        })),
      ),
    });
  }

  return {
    status: "recorded",
    orderId: order.externalId,
    canceled: effect.cancel,
    armed: effect.arm.map((f) => f.kind),
  };
};

const runFollowupSweep = async () => {
  const due = await db(
    "followups?status=eq.scheduled&run_at=lte." +
      encodeURIComponent(new Date().toISOString()) +
      "&select=id,kind,stop_point,body,conversation_id,conversations(id,lead_id,leads(id,phone,size,opted_out_at,handoff_at))&limit=50",
  );

  const toSend: Array<{ to: string; body: string; kind: string; followupId: string }> = [];
  const skipped: Array<{ followupId: string; reason: string }> = [];

  for (const row of due ?? []) {
    const lead = row.conversations?.leads;
    const mark = (status: string) =>
      db(`followups?id=eq.${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, sent_at: new Date().toISOString() }),
      });

    if (!lead || lead.opted_out_at || lead.handoff_at) {
      await mark("canceled");
      skipped.push({ followupId: row.id, reason: "opt-out ou handoff" });
      continue;
    }

    const kind = row.kind as FollowupKind;
    const text = renderFollowup(kind, {
      leadId: lead.id,
      config: CONFIG,
      stopPoint: (row.stop_point ?? "before_size") as StopPoint,
      size: lead.size ?? undefined,
      body: row.body ?? undefined,
    });

    // Two touches can render to nothing, and calling both "coupon" hides the one that
    // matters: a deferred reply with no body is a paid-for answer that got lost.
    if (text === null) {
      await mark("canceled");
      skipped.push({
        followupId: row.id,
        reason:
          kind === "deferred_reply"
            ? "resposta adiada sem corpo guardado"
            : "cupom ainda não existe",
      });
      continue;
    }

    const gates = runGates(text, {
      config: CONFIG,
      layer: "agent",
      optedOut: false,
      now: new Date(),
      paymentPath: "cod",
      stage: kind.startsWith("order_") ? "logistics" : "presale",
    });

    await db("gate_traces", {
      method: "POST",
      body: JSON.stringify(
        gates.traces.map((t) => ({
          conversation_id: row.conversation_id,
          gate: t.gate,
          verdict: t.verdict,
          detail: t.detail ?? null,
        })),
      ),
    }).catch(() => undefined);

    if (!gates.allowed) {
      const reason = gates.traces.find((t) => t.verdict === "block")?.detail ?? "guardrail";
      const action = decideTouch(kind, remedyFor(gates));

      // A touch blocked by the clock is postponed, not destroyed — and the silence
      // ruler is re-anchored on the reopening rather than having one touch dragged
      // forward into the next. `decideTouch` owns both halves of that decision, in
      // `followups.ts`, where a test can reach it.
      if (action.do === "postpone") {
        const opening = nextOpening(new Date(), CONFIG.hours.openHour);
        if (action.restartRuler) {
          await scheduleSilenceTouches(
            row.conversation_id,
            (row.stop_point ?? "before_size") as StopPoint,
            opening,
          );
        } else {
          await db(`followups?id=eq.${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ run_at: opening.toISOString() }),
          });
        }
        skipped.push({
          followupId: row.id,
          reason: `adiado para ${opening.toISOString()}: ${reason}`,
        });
        continue;
      }

      await mark("canceled");
      skipped.push({ followupId: row.id, reason });
      continue;
    }

    await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: row.conversation_id,
        direction: "outbound",
        body: text,
      }),
    });
    await mark("sent");

    // The silence ruler starts when the agent finishes speaking, and for a deferred
    // reply that moment is now, not when the turn was written. The turn cancelled every
    // pending touch on the way in and returned before scheduling, so without this the
    // conversation loses follow-up recovery entirely.
    if (kind === "deferred_reply") {
      await scheduleSilenceTouches(row.conversation_id, stopPointOf(text));
    }
    toSend.push({ to: lead.phone, body: text, kind, followupId: row.id });
  }

  return { status: "swept", due: (due ?? []).length, send: toSend, skipped };
};

Deno.serve(async (request: Request): Promise<Response> => {
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (request.method !== "POST") return json(405, { error: "use POST" });

  let payload: {
    job?: string;
    externalId?: string;
    from?: string;
    body?: string;
    /** Ad attribution from a Click-to-WhatsApp entry, kept on the first touch only. */
    source?: Record<string, unknown>;
    order?: OrderWebhook;
    /**
     * n8n's second call for a brand-new lead, sent after its own `Wait` node — opção (a)
     * of 2026-09-21 (see HANDOFF.md). Never a channel event, so it skips the
     * `external_id` idempotency check below and uses `conversations.welcomed_at`
     * instead.
     */
    resume?: boolean;
  };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "corpo não é JSON" });
  }

  // The cron half: sweep the follow-up rulers. Deterministic, no model call.
  if (payload.job === "followups") return json(200, await runFollowupSweep());

  // The sale half. n8n posts here when Logzz or Coinzz confirms an order; the rule of
  // what that does to the schedule lives in `followups.ts`, where a test can hold it.
  if (payload.job === "order") {
    if (!payload.order) return json(400, { error: "order é obrigatório" });
    const result = await recordOrder(payload.order);
    // A refused order must not answer 200. n8n reads the status, and a green webhook over
    // a sale that was never filed is the silent failure this whole route exists to end.
    return json("ok" in result && result.ok === false ? 422 : 200, result);
  }

  let inbound = payload as { externalId: string; from: string; body: string };
  if (!inbound.externalId || !inbound.from) {
    return json(400, { error: "externalId e from são obrigatórios" });
  }
  const isResume = payload.resume === true;

  // 1. Idempotency: the same channel event never becomes two turns. A resume call is
  // n8n's own clock, not a channel event — it never carries a fresh message to dedupe
  // against, so it gets its own guard below instead (welcomed_at vs. last_outbound_at).
  if (!isResume) {
    const seen = await db(`messages?external_id=eq.${encodeURIComponent(inbound.externalId)}&select=id`);
    if (seen?.length) return json(200, { status: "duplicate" });
  }

  // 2. Lead and conversation.
  const existing = await db(`leads?phone=eq.${encodeURIComponent(inbound.from)}&select=*`);
  const lead =
    existing?.[0] ??
    (
      await db("leads", {
        method: "POST",
        // Attribution belongs to the first touch and is never overwritten — this is the
        // only moment it can be recorded, and a lead created without it stays anonymous
        // forever. Without it there is no answer to "which ad produced this sale".
        body: JSON.stringify({
          phone: inbound.from,
          ...(payload.source ? { source: payload.source } : {}),
        }),
      })
    )[0];

  const openConversations = await db(
    `conversations?lead_id=eq.${lead.id}&closed_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  const conversation =
    openConversations?.[0] ??
    (await db("conversations", { method: "POST", body: JSON.stringify({ lead_id: lead.id }) }))[0];

  /**
   * The stage already stored, read once and used by `persistStage` on every exit.
   *
   * The `?? "novo"` covers two real cases: the conversation just created above, and the
   * old rows that migration `0006` converted from `'discovery'` — the value the table
   * was born with and that was never in `STAGES`.
   */
  const storedStage: Stage = (conversation.stage as Stage | null) ?? "novo";

  /**
   * The rung the facts support so far — updated once the turn has settled size, address
   * and identity (5b–5e). Every handoff and `deferred` exit stores this value:
   * `handoff_at` makes every later turn exit as `already_handed_off`, so an exit that
   * does not store it freezes the funnel on exactly the conversation that got far.
   * Before 5b there is only what the lead already holds; nothing here is invented.
   */
  let reachedSoFar: Stage = reachedStage({
    size: lead.size ?? null,
    addressConfirmed: Boolean(lead.address?.confirmedAt),
    addressComplete: isComplete(lead.address ?? {}),
    orderBuilt: false,
  });

  // 2b. The resume call, opção (a). It never inserts an inbound message — the one that
  // triggered the welcome is already stored — so it re-reads the latest inbound text
  // from the conversation instead of trusting whatever n8n resent, and it is a no-op if
  // Valen already answered for real since the welcome went out (she wrote again and got
  // a live reply before the timer fired).
  if (isResume) {
    if (!conversation.welcomed_at) return json(200, { status: "resume_without_welcome" });
    if (
      conversation.last_outbound_at &&
      new Date(conversation.last_outbound_at).getTime() > new Date(conversation.welcomed_at).getTime()
    ) {
      return json(200, { status: "resume_moot" });
    }
    const latest = await db(
      `messages?conversation_id=eq.${conversation.id}&direction=eq.inbound&select=body&order=created_at.desc&limit=1`,
    );
    inbound = { ...inbound, body: latest?.[0]?.body ?? inbound.body ?? "" };
  }

  if (!isResume) {
    await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "inbound",
        body: inbound.body ?? "",
        external_id: inbound.externalId,
      }),
    });
  }

  // 2c. Estágio 0 — every brand-new lead gets this fixed receipt, 24/7, never the
  // model. It replaces the rest of this call entirely: n8n waits
  // `WELCOME_RESUME_DELAY_SECONDS` and calls again with `resume: true` for Valen's real
  // answer (opção a, 2026-09-21). A lead already in `existing` is not new, so a resume
  // call never re-enters here.
  const isNewLead = !existing?.[0];
  if (isNewLead && !isResume) {
    const welcomedAt = new Date().toISOString();
    const receipt = runGates(WELCOME_AUTO_REPLY, {
      config: CONFIG,
      layer: "auto",
      optedOut: false,
      now: new Date(),
      paymentPath: "cod",
    });
    await db("gate_traces", {
      method: "POST",
      body: JSON.stringify(
        receipt.traces.map((t) => ({
          conversation_id: conversation.id,
          gate: t.gate,
          verdict: t.verdict,
          detail: t.detail ?? null,
        })),
      ),
    }).catch(() => undefined);

    if (receipt.allowed) {
      const out = (
        await db("messages", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversation.id,
            direction: "outbound",
            body: WELCOME_AUTO_REPLY,
          }),
        })
      )[0];
      await db(`conversations?id=eq.${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ welcomed_at: welcomedAt }),
      });
      return json(200, {
        status: "welcomed",
        reply: WELCOME_AUTO_REPLY,
        bubbles: paced(WELCOME_AUTO_REPLY),
        messageId: out.id,
        resumeInSeconds: WELCOME_RESUME_DELAY_SECONDS,
      });
    }
    // The chain vetoed the fixed receipt, which should not happen — WELCOME_AUTO_REPLY
    // is asserted gate-clean in tests. Falling through to the normal pipeline below
    // means she still gets an answer instead of silence.
  }

  // She answered: every touch waiting on her silence is moot.
  await cancelScheduled(conversation.id);

  // Retention counts from the last contact, not the first.
  await db("rpc/touch_retention", {
    method: "POST",
    body: JSON.stringify({ p_lead_id: lead.id }),
  }).catch(() => undefined);

  // 3. Opt-out is irrevocable and costs nothing to check.
  const optOut = classifyOptOut(inbound.body ?? "");
  if (optOut === "explicit") {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ opted_out_at: new Date().toISOString() }),
    });
    // `bloqueado` is terminal and irreversible by the agent — only a person undoes it.
    await Promise.all([
      recordOutcome(conversation.id, "opted_out", "opt-out explícito da cliente"),
      persistStage(conversation.id, storedStage, "bloqueado"),
    ]);
    return json(200, { status: "opted_out" });
  }
  if (lead.opted_out_at) return json(200, { status: "already_opted_out" });

  // A conversation handed to a person stays with that person. The sweep already
  // honours `handoff_at`; without the same check here the agent answered the next
  // message as if nothing had happened, talking over whoever took it over.
  if (lead.handoff_at) {
    return json(200, { status: "already_handed_off", ...notification(lead, conversation) });
  }

  // 3b. She asked for a person (§Q12). Deterministic, so it costs nothing and never
  // depends on the model noticing — and it runs before any model call, because there
  // is no point paying to generate a reply she already said she does not want.
  if (wantsHuman(inbound.body ?? "")) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });
    await cancelScheduled(conversation.id);

    // The one outbound that used to skip the chain. It runs as `layer: "auto"` — the
    // 24/7 receipt tier of R4.4 — so every content gate still applies while the hours
    // gate does not: someone who asks for a person at 2am deserves the confirmation
    // then, not at dawn.
    const receipt = runGates(HUMAN_HANDOFF_REPLY, {
      config: CONFIG,
      layer: "auto",
      optedOut: false,
      now: new Date(),
      paymentPath: "cod",
    });
    await db("gate_traces", {
      method: "POST",
      body: JSON.stringify(
        receipt.traces.map((t) => ({
          conversation_id: conversation.id,
          gate: t.gate,
          verdict: t.verdict,
          detail: t.detail ?? null,
        })),
      ),
    }).catch(() => undefined);

    // The handoff itself is already recorded above; only the receipt is gated. If the
    // chain ever vetoes it, the operator is still called — silently dropping the alert
    // would be the worse half of the two.
    const asked = receipt.allowed
      ? (
          await db("messages", {
            method: "POST",
            body: JSON.stringify({
              conversation_id: conversation.id,
              direction: "outbound",
              body: HUMAN_HANDOFF_REPLY,
            }),
          })
        )[0]
      : null;

    await Promise.all([
      recordOutcome(conversation.id, "handoff", "a cliente pediu para falar com uma pessoa"),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "handoff",
      reason: "a cliente pediu para falar com uma pessoa",
      reply: receipt.allowed ? HUMAN_HANDOFF_REPLY : null,
      bubbles: paced(receipt.allowed ? HUMAN_HANDOFF_REPLY : null),
      blocked: receipt.traces.filter((t) => t.verdict === "block"),
      messageId: asked?.id ?? null,
      ...notification(lead, conversation),
      costBrl: Number(conversation.cost_brl ?? 0),
    });
  }

  // 4. The ceiling is checked before a byte leaves for any provider.
  let spent = Number(conversation.cost_brl ?? 0);
  // What the conversation had spent before this turn: `turn_outcomes` records the delta.
  const spentBefore = spent;
  if (spent >= ceilingBrl) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });
    // The third handoff door, and it used to be the silent one: no reply to her, no
    // address for the operator. A conversation that hit the ceiling is exactly the
    // one worth a person's attention.
    const ceilingHold = (
      await db("messages", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversation.id,
          direction: "outbound",
          body: HOLDING_REPLY,
        }),
      })
    )[0];
    await Promise.all([
      recordOutcome(conversation.id, "handoff", "teto de custo da conversa", 0, 0),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "handoff",
      reason: "teto de custo da conversa",
      reply: HOLDING_REPLY,
      bubbles: paced(HOLDING_REPLY),
      messageId: ceilingHold.id,
      ...notification(lead, conversation),
      costBrl: spent,
    });
  }

  /**
   * A provider that fails is the one failure mode this turn cannot let stand. The
   * inbound message is already persisted, so the retry n8n sends next is answered
   * `duplicate` and the customer waits forever for a reply nobody is writing — silent,
   * permanent, and invisible in the logs. So the same rule as every other dead end
   * applies: she hears the holding reply, a person is called, and the spend up to the
   * failure is written down instead of lost.
   */
  const modelFailure = async (error: unknown) => {
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cost_brl: spent, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
    /**
     * `handoff_at` is written and never cleared: a lead that gets it is out of the
     * agent's hands for good (the turn skips her, and the sweep cancels her follow-ups).
     * That is right for a conversation the agent genuinely cannot carry — and wrong for
     * an operator-side misconfiguration, which is not about her at all.
     *
     * It is the difference between reversible and not. Point `CONVERSATION_MODEL` at a
     * model the endpoint does not serve, or let a key rotate, or run the quota out as on
     * 2026-09-09, and every customer who wrote during the window used to be locked out
     * permanently — undoing the variable did not undo the damage. So a configuration
     * failure gets the holding reply and the operator's email, and leaves her reachable:
     * fix the variable and the next message is answered normally.
     */
    if (!(error instanceof ModelConfigError)) {
      await db(`leads?id=eq.${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ handoff_at: new Date().toISOString() }),
      }).catch(() => undefined);
    }
    const held = await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "outbound",
        body: HOLDING_REPLY,
      }),
    }).catch(() => null);
    await Promise.all([
      recordOutcome(conversation.id, "handoff", "falha ao chamar o modelo", 0, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "handoff",
      reason: "falha ao chamar o modelo",
      // The Gemini key used to ride in the URL query string, and Deno's network error
      // carries the whole URL in `message` — which leaves here in the JSON body and lands
      // in n8n's execution log. Since 2026-09-22 it rides in the `x-goog-api-key` header;
      // redacting stays here as defence in depth. A key that already circulated in a
      // third party's log has to be rotated, not masked.
      detail: redactKeys(error instanceof Error ? error.message : String(error)),
      reply: HOLDING_REPLY,
      bubbles: paced(HOLDING_REPLY),
      messageId: held?.[0]?.id ?? null,
      ...notification(lead, conversation),
      costBrl: spent,
    });
  };

  // 5. Cheap model first: intent is 20 calls a conversation and needs no talent.
  let intent: ModelCall;
  try {
    intent = await callGemini(
      "Classifique a intenção da cliente em uma palavra: PRECO, TAMANHO, DUVIDA, COMPRA, OBJECAO, OUTRO.",
      inbound.body ?? "",
    );
  } catch (error) {
    return await modelFailure(error);
  }
  spent += intent.costBrl;
  await recordCall(conversation.id, "intent", "google", CHEAP_MODEL, intent);

  // 5b. A size she stated is worth keeping: the post-order ruler reads it back,
  // and an empty column becomes a dash in a message a customer sees. What counts as
  // "stated" is decided by the text itself, not by the intent classifier — it called
  // "tenho 44 anos" a sizing turn, which is fair, and would have made her a G.
  const stated = statedSize(inbound.body ?? "");
  if (stated && stated.size !== lead.size) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ size: stated.size, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
  }

  // 5d. The address loop. It accumulates across turns because she says it in pieces,
  // and it is only ever *confirmed* by her saying so — a package sent to an address
  // nobody read back is the failed delivery this costs the most to fix.
  const storedAddress = (lead.address ?? {}) as Partial<Address> & { confirmedAt?: string };
  let addressConfirmed = Boolean(storedAddress.confirmedAt);
  let addressDraft: Partial<Address> = { ...storedAddress };
  delete (addressDraft as { confirmedAt?: string }).confirmedAt;

  // The agent's last message, fetched here rather than reused from the history window
  // below, because the confirmation is decided before that window is read.
  const lastOutbound: string =
    (
      await db(
        `messages?conversation_id=eq.${conversation.id}&direction=eq.outbound` +
          "&select=body&order=created_at.desc&limit=1",
      ).catch(() => null)
    )?.[0]?.body ?? "";

  const foundAddress = extractAddress(inbound.body ?? "");
  if (Object.keys(foundAddress.fields).length > 0) {
    // What she stated wins over what a previous pass inferred, and a new piece never
    // silently re-confirms an address she has not seen read back.
    addressDraft = mergeAddress(addressDraft, foundAddress.fields).fields;
    addressConfirmed = false;
  } else if (
    !addressConfirmed &&
    isComplete(addressDraft) &&
    confirmsAddress(inbound.body ?? "") &&
    // Only when the agent's last message actually read the address back. A bare "sim"
    // answering something else — "quer que eu te mande o link?" — used to set
    // `confirmedAt` and flip the order ready, which is §D2 skipped in silence.
    readBackAddress(lastOutbound, addressDraft)
  ) {
    addressConfirmed = true;
  }

  /**
   * 5d-bis. The region, the moment a postcode exists.
   *
   * This is the whole of wave 3 and it costs one question: the CEP. Until now the agent
   * named a size with nothing to consult and the customer met the checkout's "não há
   * disponibilidade" popup after she had already chosen — the most expensive moment
   * possible to find out.
   *
   * The postcode rides in on the address machinery that was already accumulating it, so
   * there is no new state and no second question. What comes back is about the REGION:
   * whether delivery reaches her, which three days, whether Express exists, and the
   * carrier quote. It never vetoes a size — the Coinzz mapping is wrong about the M and
   * the Logzz checkout, where she actually buys, is not.
   *
   * A failed lookup is not a blocked sale. `region` stays null, the agent keeps talking,
   * and the only thing it loses is permission to name a size — which is the correct
   * failure: silence about the size beats a size she cannot receive.
   */
  let region: Region | null = null;
  if (addressDraft.cep) {
    try {
      region = await checkRegion(async (url) => {
        const r = await fetch(url);
        return r.ok ? await r.json() : null;
      }, addressDraft.cep);
    } catch {
      region = null; // The checkout being down is not a reason to stop selling.
    }
  }

  const addressChanged =
    JSON.stringify({ ...addressDraft, confirmedAt: addressConfirmed }) !==
    JSON.stringify({ ...storedAddress, confirmedAt: Boolean(storedAddress.confirmedAt) });
  if (addressChanged) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        address: {
          ...addressDraft,
          ...(addressConfirmed ? { confirmedAt: new Date().toISOString() } : {}),
        },
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  }

  // 5e. Identity accumulates the same way, and for the same reason.
  const storedIdentity = (lead.identity ?? {}) as Partial<Identity>;
  const foundIdentity = extractIdentity(inbound.body ?? "");
  const identityDraft = mergeIdentity(storedIdentity, foundIdentity.fields).fields;
  if (JSON.stringify(identityDraft) !== JSON.stringify(storedIdentity)) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ identity: identityDraft, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
  }

  // This turn's size, address and identity are already stored on the lead; the rung they
  // support holds for every exit from here on. The order is only built at the end.
  reachedSoFar = reachedStage({
    size: stated?.size ?? lead.size ?? null,
    addressConfirmed,
    addressComplete: isComplete(addressDraft),
    orderBuilt: false,
  });

  // 6. History, then the turn that sells.
  const history = await db(
    // The LAST twenty, not the first: ascending order meant that past ten exchanges the
    // model was reading the opening of the conversation and never the turn it was
    // answering — and `recentOutbound` fed the repetition gate a slice from an hour ago.
    `messages?conversation_id=eq.${conversation.id}&select=direction,body&order=created_at.desc&limit=20`,
  );
  // The query returns newest first so the window is the END of the conversation; the
  // model reads it oldest first, like a person scrolling up.
  const recent = [...(history ?? [])].reverse();
  const turns = recent.map((m: { direction: string; body: string }) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body ?? "",
  }));

  // The `identical_template` gate was in the chain and had nothing to compare against:
  // nobody ever passed `recentOutbound`, so it passed by construction on every message
  // the agent ever sent. The history is already here, so the check costs one map.
  const recentOutbound = recent
    .filter((m: { direction: string }) => m.direction === "outbound")
    .map((m: { body: string }) => (m.body ?? "").trim());

  /**
   * The link she finishes in, built before the model writes so the reply can carry it.
   *
   * It needs the three the conversation collects; with all of them plus her phone the
   * checkout skips its first step. Nothing here is half-built — a link that fills three
   * fields and still opens at the top is the same friction with an extra click.
   */
  let checkoutUrl: string | null = null;
  let checkoutBlocked: string[] = (["name", "email", "document"] as const)
    .filter((f) => !identityDraft[f])
    .map((f) => `customer.${f}`);
  if (checkoutBlocked.length === 0) {
    try {
      checkoutUrl = buildCheckoutLink(
        { ...(identityDraft as Identity), phone: lead.phone },
        "cod",
        CONFIG.checkout ?? {},
      );
    } catch (error) {
      checkoutBlocked =
        error instanceof CoinzzIncompleteError ? [...error.missing] : [String(error)];
    }
  }

  const identityDirective = identityDirectiveFor(identityDraft);
  const checkoutDirective = checkoutDirectiveFor(
    checkoutUrl,
    stated?.size ?? lead.size ?? null,
    // Still hardcoded, like every other `paymentPath` in this handler. Routing by what
    // the availability query answers is the next change, and it is blocked: that query
    // belongs to the Coinzz checkout, which as of 2026-09-09 is the PREPAID path only.
    "cod",
  );

  // 7. Nothing reaches the customer without the chain — but a veto is not the end of
  // the turn. The chain knows exactly what was wrong, so the reason goes back to the
  // model and it writes the message again. Silence and "the operator will handle it"
  // are what this loop exists to avoid; both are last resorts, not first answers.
  // Which host serves CONVERSATION_MODEL, resolved once — used for both the call and
  // the provider label written to `llm_calls`, so the two never disagree.
  const conversationProvider = MUSE_FAMILY.test(CONVERSATION_MODEL) ? "meta" : "openai";
  const callConversationModel = conversationProvider === "meta" ? callMuse : callLuna;
  let attempt: ModelCall;
  let gates: ReturnType<typeof runGates>;
  let rewritesUsed = 0;
  let correction: string | null = null;
  let outcome: NextAction = { kind: "send" };

  while (true) {
    try {
      attempt = await callConversationModel(
        // The correction rides in the system prompt, so the vetoed text never enters
        // the conversation history the customer's next turn is built from.
        correction === null
          ? systemPrompt(sizeDirectiveFor(stated, lead.size ?? null, region), identityDirective, checkoutDirective)
          : `${systemPrompt(sizeDirectiveFor(stated, lead.size ?? null, region), identityDirective, checkoutDirective)} ${correction}`,
        turns,
      );
    } catch (error) {
      return await modelFailure(error);
    }
    spent += attempt.costBrl;
    await recordCall(
      conversation.id,
      rewritesUsed === 0 ? "reply" : "rewrite",
      conversationProvider,
      CONVERSATION_MODEL,
      attempt,
    );

    gates = runGates(attempt.text, {
      config: CONFIG,
      layer: "agent",
      optedOut: false,
      now: new Date(),
      paymentPath: "cod",
      recentOutbound,
      // Social proof is a tool, and it was locked: nobody ever passed this list, so
      // every quote she attributed to a customer was read as invented and rewritten.
      knownTestimonials: CONFIG.testimonials,
      // The two the region unlocks. Without a postcode both stay undefined, and the
      // chain refuses a size and refuses "hoje" — which is the correct silence.
      ...(region ? { sizeChecked: stated?.size ?? lead.size ?? undefined } : {}),
      sameDayWindow: region?.sameDay ?? false,
    });

    // Every attempt is traced, not just the last: a gate that keeps firing across
    // rewrites is a prompt problem, and the trace is what lets Hermes see it.
    await db("gate_traces", {
      method: "POST",
      body: JSON.stringify(
        gates.traces.map((t) => ({
          conversation_id: conversation.id,
          gate: t.gate,
          verdict: t.verdict,
          detail: t.detail ?? null,
        })),
      ),
    }).catch(() => undefined);

    outcome = decideNext({
      remedy: remedyFor(gates),
      rewritesUsed,
      spentBrl: spent,
      ceilingBrl,
      reasons: gates.traces.filter((t) => t.verdict === "block").map((t) => t.detail ?? t.gate),
      vetoedText: attempt.text,
    });

    if (outcome.kind !== "rewrite") break;
    correction = outcome.instruction;
    rewritesUsed += 1;
  }

  await db(`conversations?id=eq.${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      cost_brl: spent,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  // Opt-out: the one veto that is never rewritten and never answered.
  if (outcome.kind === "stop") {
    await Promise.all([
      recordOutcome(conversation.id, "stopped", "opt-out detectado pela cadeia", rewritesUsed, spent - spentBefore),
      persistStage(conversation.id, storedStage, "bloqueado"),
    ]);
    return json(200, { status: "stopped", intent: intent.text, costBrl: spent });
  }

  // Deferred: the reply is right, the clock is not. It is stored as written and the
  // same cron that runs the rulers sends it when the window opens — the chain runs
  // again then, so a message held overnight is still gated before it goes out.
  if (outcome.kind === "defer") {
    const runAt = nextOpening(new Date(), CONFIG.hours.openHour);
    // Upsert, and for the same reason the rulers use one: a second reply written in
    // the same closed window replaces the first. What she asked last is the live
    // question when the window opens.
    await db("followups?on_conflict=conversation_id,kind", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        conversation_id: conversation.id,
        kind: "deferred_reply",
        run_at: runAt.toISOString(),
        status: "scheduled",
        body: attempt.text,
      }),
    });
    await Promise.all([
      recordOutcome(conversation.id, "deferred", "fora da janela de envio", rewritesUsed, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "deferred",
      reason: "fora da janela de envio",
      intent: intent.text,
      runAt: runAt.toISOString(),
      rewrites: rewritesUsed,
      costBrl: spent,
    });
  }

  if (outcome.kind === "handoff") {
    const reason = outcome.reason;
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });

    // She hears something either way. The holding reply passes the chain by
    // construction and promises only a reply, so it cannot trip what it stands in for.
    const holding = (
      await db("messages", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversation.id,
          direction: "outbound",
          body: HOLDING_REPLY,
        }),
      })
    )[0];

    await Promise.all([
      recordOutcome(conversation.id, "handoff", reason, rewritesUsed, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "handoff",
      reason,
      intent: intent.text,
      reply: HOLDING_REPLY,
      bubbles: paced(HOLDING_REPLY),
      messageId: holding.id,
      rewrites: rewritesUsed,
      blockedText: attempt.text,
      blocked: gates.traces.filter((t) => t.verdict === "block"),
      ...notification(lead, conversation),
      costBrl: spent,
    });
  }

  /**
   * The rewrite did not pass, so the agent answers with the safe reply instead of the
   * draft — and the conversation stays with it. No `handoff_at`, nobody called: a reply
   * the agent phrased badly was never the customer's problem, and she still gets an
   * answer with a live question in it. The blocked traces are already in `gate_traces`,
   * which is where a gate that keeps firing becomes Hermes' material.
   */
  const fallbackReason = outcome.kind === "fallback" ? outcome.reason : null;
  const replyText = fallbackReason === null ? attempt.text : SAFE_FALLBACK_REPLY;

  const outbound = (
    await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "outbound",
        body: replyText,
      }),
    })
  )[0];

  await db(`conversations?id=eq.${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_outbound_at: new Date().toISOString() }),
  });

  // The silence ruler starts the moment the agent finishes speaking.
  await scheduleSilenceTouches(conversation.id, stopPointOf(replyText));

  // O pedido, montado aqui e postado pelo n8n. Regra de negócio é código versionado;
  // a credencial e a chamada HTTP são cano. Quando falta alguma coisa — configuração
  // ou dado da cliente — vem `orderBlocked` com o nome exato do que falta, em vez de
  // um corpo pela metade que vira pacote na porta errada.
  let order: CoinzzRequest | null = null;
  let orderBlocked: string[] = missingCoinzzConfig(CONFIG.coinzz ?? {});
  const size = stated?.size ?? lead.size ?? null;
  if (addressConfirmed && isComplete(addressDraft) && isIdentityComplete(identityDraft) && size) {
    try {
      order = buildCoinzzRequest(
        {
          leadId: lead.id,
          name: identityDraft.name,
          email: identityDraft.email,
          document: identityDraft.document,
          phone: lead.phone,
          address: addressDraft,
          size,
          paymentMethod: "cod",
        },
        CONFIG.coinzz as CoinzzConfig,
        `${lead.id}:${size}:${addressDraft.cep}:${addressDraft.number}`,
      );
      orderBlocked = [];
    } catch (error) {
      orderBlocked =
        error instanceof CoinzzIncompleteError ? [...error.missing] : [String(error)];
    }
  }

  /**
   * Where the conversation got to, read from the facts this turn established — not from
   * a counter. The order is the funnel's: the highest rung the data supports is the one
   * that counts, and `furthest` makes sure it never goes down.
   *
   * `pedido_criado` requires the order actually built (`order !== null`), not the intent
   * to buy: without `offerHash` in the config, or with a short CPF, the customer's data
   * is complete and `order` still comes out null. A stage that lies about the order
   * poisons exactly the metric that justifies having stages.
   *
   * `orderReady` follows the same rule, for the same reason: it is the signal n8n reads
   * to call Coinzz. Until 2026-09-22 it came out true with `order: null` — "ready to
   * create the order" with no order to create. What is missing stays in `orderBlocked`.
   */
  const orderReady = order !== null;
  await Promise.all([
    recordOutcome(
      conversation.id,
      fallbackReason === null ? "send" : "fallback",
      fallbackReason,
      rewritesUsed,
      spent - spentBefore,
    ),
    persistStage(
      conversation.id,
      storedStage,
      reachedStage({
        size: stated?.size ?? lead.size ?? null,
        addressConfirmed,
        addressComplete: isComplete(addressDraft),
        orderBuilt: order !== null,
      }),
    ),
  ]);

  return json(200, {
    status: fallbackReason === null ? "ok" : "fallback",
    ...(fallbackReason === null
      ? {}
      : {
          reason: fallbackReason,
          blockedText: attempt.text,
          blocked: gates.traces.filter((t) => t.verdict === "block"),
        }),
    intent: intent.text,
    reply: replyText,
    bubbles: paced(replyText),
    messageId: outbound.id,
    rewrites: rewritesUsed,
    order,
    orderBlocked,
    // O caminho vigente: a agente manda este link e a cliente termina no checkout, onde
    // ela escolhe o dia da entrega. `order` continua aqui para quando o pedido passar a
    // nascer por API — mas hoje quem cria o pedido é ela, clicando.
    checkoutUrl,
    checkoutBlocked,
    // Where the sale actually stands. `addressReady` is the gate on creating an order:
    // complete is not enough, she has to have confirmed the read-back.
    size: stated?.size ?? lead.size ?? null,
    addressReady: addressConfirmed && isComplete(addressDraft),
    // O sinal que o n8n espera para chamar a Coinzz: endereço confirmado por ela,
    // identidade completa e tamanho resolvido. Faltando um, o pedido não nasce.
    orderReady,
    identityMissing: (["name", "email", "document"] as const).filter((f) => !identityDraft[f]),
    addressMissing: isComplete(addressDraft) ? [] : extractAddress("").missing.filter((f) => !addressDraft[f]),
    costBrl: spent,
    ceilingBrl,
  });
});
