/**
 * One conversation turn, end to end — plus the cron sweep of the follow-up rulers.
 *
 * The n8n webhook posts an inbound message here; this function owns everything that
 * decides what goes back: dedupe, persistence, the cost ceiling, the model calls (the
 * interpreter that reads her message, R13.1, and the reply) and the guardrails. A second entry point, { job: "followups" }, is the clock
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
  deliveryFor,
  nextOpening,
  windowIsOpen,
  onOrderConfirmed,
  stageForLead,
  renderFollowup,
  scheduleSilence,
  endsSilenceRuler,
  type FollowupKind,
  type StopPoint,
} from "./followups.ts";
import { asksForSize, sizeFromDressSize, statedSizeOf } from "./sizing.ts";
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
  asksForIdentity,
  extractIdentity,
  isIdentityComplete,
  mergeIdentity,
  titleCaseName,
  nextIdentityQuestion,
  type Identity,
} from "./identity.ts";
import {
  buildCoinzzRequest,
  buildPrefilledCheckoutLink,
  CoinzzIncompleteError,
  missingCoinzzConfig,
  type CheckoutLinkConfig,
  type CoinzzConfig,
  type CoinzzRequest,
} from "./coinzz.ts";
import {
  decideNext,
  DEFERRED_RETRY_DELAY_SECONDS,
  HOLDING_REPLY,
  HUMAN_HANDOFF_REPLY,
  afterRetryFailure,
  IN_CALL_RETRY_BUDGET_MS,
  MAX_REWRITES,
  MIN_ATTEMPT_MS,
  MODEL_CALL_TIMEOUT_MS,
  networkRetryDelay,
  ORDER_HANDOFF_REPLY,
  retryIsMoot,
  SAFE_FALLBACK_REPLY,
  THINK_REPLY,
  WELCOME_AUTO_REPLY,
  WELCOME_RESUME_DELAY_SECONDS,
  type NextAction,
} from "./retry.ts";
import {
  asksSomething,
  decidesToBuy,
  decideClarify,
  goodbyeParks,
  handoffFor,
  INTERPRET_MAX_COMPLETION_TOKENS,
  interpretRequest,
  linkPathFor,
  linkSentRecently,
  namesOwnPrice,
  asksForLink,
  choosesPath,
  closesConversation,
  saysOwnSize,
  mergeUnitSizes,
  NEUTRAL_INTERPRETATION,
  quantityOf,
  readInterpretation,
  readyForLink,
  sendLinkNow,
  statesPastPurchase,
  type Interpretation,
} from "./interpret.ts";
import { linkFactLine, systemPrompt as buildSystemPrompt } from "./prompt.ts";
import { sealIsValid } from "./inbound-signature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
// Meta's Llama API — OpenAI-compatible request/response shape, different host and
// key. `callMuse` is the only function that reads this.
const META_KEY = Deno.env.get("META_API_KEY") ?? "";
const USD_TO_BRL = Number(Deno.env.get("USD_TO_BRL") ?? "5.4");

/** Nenhuma credencial sai desta função em texto de erro. Ver `modelFailure`. */
const redactKeys = (text: string): string => {
  let out = text;
  for (const secret of [OPENAI_KEY, META_KEY, SERVICE_KEY]) {
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
 * candidate that fit it — see `HANDOFF.md` §Frente 5. The Gemini intent call left the
 * turn on 2026-09-23 (R12.1: Meta only); `callLuna` stays as the v32 rollback, and
 * the eval that section calls for (real conversations, measuring conversion and gate
 * refusal, not benchmark score) has not been run — this swap ships the mechanism, not
 * the proof.
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
// Which host and key `CONVERSATION_MODEL` resolves to — the one place that decides it,
// so `callLuna`/`callMuse` and the provider label recorded in `llm_calls` never disagree.
const MUSE_FAMILY = /^muse/i;
/** USD per 1M tokens. Mirrors src/llm/pricing.ts. */
const PRICES: Record<string, { in: number; out: number; cached?: number }> = {
  [DEFAULT_CONVERSATION_MODEL]: { in: 1.25, out: 4.25 },
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
    /** Only an explicit `true` lets her name the Express delivery (R13.5). Absent: off. */
    expressActive?: boolean;
  };
  cost: { conversationCapBrl: number; overrunTolerance: number };
  /**
   * The four facts the operator declared on 2026-09-24 (R13.5). All OPTIONAL, and absent
   * reads as off — `BUSINESS_CONFIG` replaces this whole object in production, so a key
   * added here does not exist there until the operator edits the secret. Absent, the
   * agent cites no support address, no customer count and no store plan, which is
   * today's truth until someone writes the real value down.
   */
  support?: { email?: string };
  socialProof?: { satisfiedCustomers?: number };
  store?: { physicalStorePlanCity?: string };
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
      agentName: "Malu",
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

/**
 * Marca um erro que é da CONFIGURAÇÃO, não desta cliente. A diferença decide se o lead
 * fica permanentemente fora da agente — ver `modelFailure`.
 */
class ModelConfigError extends Error {}

/**
 * A failure that says nothing about the request — the server answered 5xx, or 429 (rate
 * limit: waiting is the cure, not a person). It joins the
 * two the runtime raises by itself (a `TypeError` when the connection dies, a
 * `TimeoutError` from the abort signal) as the only failures worth trying again
 * (R13.4). A 4xx is the request, and sending it again sends the same mistake.
 */
class TransientModelError extends Error {}

const isTransient = (error: unknown): boolean =>
  error instanceof TransientModelError ||
  error instanceof TypeError ||
  (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"));

const callLuna = async (
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 900,
  timeoutMs = MODEL_CALL_TIMEOUT_MS,
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
      max_completion_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new TransientModelError(`openai: HTTP ${response.status}`);
  }
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
 * Meta Model API (dev.meta.ai) — OpenAI-request-shaped, different host and key. Added
 * 2026-09-10 alongside the swap to Muse Spark 1.3 (`MUSE_FAMILY`); the host was
 * `api.llama.com` until 2026-09-24, which does not serve Muse.
 *
 * Muse Spark always reasons, and the reasoning is billed inside the completion budget.
 * Measured on 2026-09-24 against the real system prompt (~2.9k input tokens): with
 * `max_tokens: 900` and the default effort, 4 of 4 answers came back EMPTY
 * (`finish_reason: "length"`, 897 reasoning tokens) — every turn would have become a
 * handoff. With effort `minimal` and a 4000 ceiling, 11 of 11 answered, spending 310–580
 * completion tokens. The ceiling is headroom, not the expected spend.
 */
const callMuse = async (
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 4000,
  timeoutMs = MODEL_CALL_TIMEOUT_MS,
) => {
  if (MODEL_CONFIG_ERROR) throw new ModelConfigError(MODEL_CONFIG_ERROR);
  const response = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${META_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONVERSATION_MODEL,
      messages: [{ role: "system", content: system }, ...history],
      max_completion_tokens: maxTokens,
      reasoning_effort: "minimal",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new TransientModelError(`meta: HTTP ${response.status}`);
  }
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
 * One model call, tried again while the failure is the network's (R13.4). The wait
 * between tries is `networkRetryDelay` (in `retry.ts`, where a test holds it); every try
 * is cut at whatever is left before `deadline`, so the whole loop fits inside one
 * invocation. The last failure is rethrown for the caller to decide: defer or hand off.
 */
const withNetworkRetry = async <T>(call: (timeoutMs: number) => Promise<T>, deadline: number): Promise<T> => {
  const startedAt = Date.now();
  for (let failures = 0; ; ) {
    try {
      return await call(Math.max(MIN_ATTEMPT_MS, Math.min(MODEL_CALL_TIMEOUT_MS, deadline - Date.now())));
    } catch (error) {
      if (!isTransient(error)) throw error;
      failures += 1;
      const delay = networkRetryDelay(failures, Date.now() - startedAt, deadline - startedAt);
      if (delay === null) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
 * Only "block" stops a message. Since R13.3 a gate may answer something softer ("warn")
 * that is recorded and does not veto, so nothing here reads `allowed` — which a soft
 * verdict may or may not clear, depending on how the chain spells it — but the verdicts.
 */
const passed = (result: { traces: ReadonlyArray<{ verdict: string }> }): boolean =>
  !result.traces.some((t) => t.verdict === "block");

/**
 * Every verdict, written down as the chain spelled it. DEPLOY ORDER: `gate_traces.verdict`
 * was checked against ('pass','block','rewrite') until migration 0007 added 'warn', and
 * each batch is one INSERT — without 0007 applied, a single "warn" row fails the batch and
 * every trace of that attempt is lost in silence (the `.catch` below swallows it).
 */
const recordTraces = (
  conversationId: string,
  traces: ReadonlyArray<{ gate: string; verdict: string; detail?: string }>,
) =>
  db("gate_traces", {
    method: "POST",
    body: JSON.stringify(
      traces.map((t) => ({
        conversation_id: conversationId,
        gate: t.gate,
        verdict: t.verdict,
        detail: t.detail ?? null,
      })),
    ),
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
const statedSize = (message: string, read: Interpretation): { size: string; forOther: boolean } | null => {
  // The deterministic readers first, the interpreter as fallback (R13.1) — and the table
  // decides either way. The result replaces the stored size: what she says now is current.
  const size = statedSizeOf(message, read.size);
  return size === null ? null : { size, forOther: read.size.for_other_person };
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
  stated: { size: string; forOther?: boolean } | null,
  known: string | null,
  region: Region | null,
  linkGoing = false,
): string | null => {
  // The size survives the turn it was said in. Reading only what THIS message contained
  // left the turn where she sends her postcode with no size at all, and the agent hedged
  // about something it had worked out two turns earlier.
  const size = stated?.size ?? known;
  if (size === null) return null;

  const fitting = `O tamanho dela é ${size} — a tabela da loja resolve isso, não recalcule` +
    ` nem escolha outro. Diga na hora, com naturalidade, sem a palavra "manequim".${
      stated?.forOther ? ` Esse tamanho é da pessoa pra quem ela está comprando.` : ""
    }`;

  if (region === null) {
    // She decided and the link goes in this message: the CEP is typed in the checkout,
    // which is also where coverage is confirmed (persona round 3, Marcinha).
    if (linkGoing) return `${fitting} Não peça o CEP agora: o link vai nesta mensagem.`;
    return `${fitting} Depois de responder, puxe o CEP dela na mesma mensagem, do jeito` +
      ` que uma pessoa puxaria: você quer ver como fica a entrega na região dela. É um` +
      ` favor que você está fazendo, não um cadastro — nunca peça o endereço inteiro.`;
  }
  if (!region.cod) {
    // Today's truth, from the config (persona round 3 found "mesmo frete grátis" here,
    // two days after the operator decided the operation has no free shipping).
    const pct = CONFIG.prices.prepayDiscountPercent;
    const avg = CONFIG.delivery.prepayAvgDays;
    return `${fitting} A entrega com pagamento na entrega não cobre o CEP dela, então ofereça` +
      ` o pagamento antecipado como a saída boa que ele é${pct > 0 ? `, com ${pct}% de desconto` : ""}.` +
      (CONFIG.delivery.freeShipping === true ? ` O frete é grátis` : ` O frete é calculado no checkout`) +
      `${
        avg != null ? `, e o prazo varia por região, em média ${avg} dias úteis` : ""
      }.`;
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
  const topic = nextIdentityQuestion(missing);
  // A topic, never a quoted sentence (R13.4): the quoted e-mail question came back word
  // for word, turn after turn. And never a condition — the link goes without it.
  return topic === null
    ? null
    : `Para o link do pedido já sair preenchido, falta ${topic}. Se a conversa estiver nesse` +
      ` ponto, peça isso com as suas palavras, uma coisa só — nunca repita uma pergunta que` +
      ` você já fez. Se ela não quiser ou não tiver, tudo bem: o link sai assim mesmo e o` +
      ` checkout pede o resto.`;
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
  prefilled = true,
  fact: string | null = null,
): string | null =>
  url === null
    ? null
    : // One short, natural line about what is left inside (persona round 3, Cleide: the old
      // list of steps came back as "escolhe o dia, que são 3 dias pra escolher").
      `Mande este link para ela agora, exatamente como está, sem encurtar e sem alterar:\n${url}\n` +
      `Junto, UMA frase curta e natural: ${prefilled ? "o que ela já te passou vai preenchido, e " : ""}` +
      `lá ela completa o endereço e escolhe o dia da entrega${
        path === "cod"
          ? `, e escreve o tamanho${size ? ` ${size}` : ""} no campo de complemento — essa parte diga` +
            ` com todas as letras, porque em branco o depósito escolhe por ela`
          : `${size ? ` e o tamanho ${size}` : " e o tamanho"}`
      }. Não liste passos e não repita o que já disse. NÃO diga que o pedido já está feito: ele` +
      ` nasce quando ela terminar no checkout.` +
      // H-2: the link's own row of the linked facts, for her reasoning — not a line to send.
      (fact
        ? ` Este link é o desta linha dos FATOS LIGADOS: [${fact}]. Se ela perguntar quanto é ou` +
          ` quando chega, a resposta é essa linha, nunca a de outro caminho.`
        : ``);

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

const MAX_BUBBLE_WORDS = 30;

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Splits a reply into WhatsApp-sized bubbles. A paragraph is a bubble; a paragraph over
 * `maxWords` is cut at sentence ends and the sentences packed back up to the limit. A
 * sentence is NEVER cut — one longer than the limit goes out whole, because half a
 * sentence in a bubble reads as a bug. `max` still caps the count, but only by merging
 * trailing bubbles that fit together under `maxWords`.
 */
const splitBubbles = (text: string, max = 3, maxWords = MAX_BUBBLE_WORDS): string[] => {
  const bubbles: string[] = [];
  for (const paragraph of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (wordCount(paragraph) <= maxWords) {
      bubbles.push(paragraph);
      continue;
    }
    // [sentence, separator, sentence, ...] — the separator is kept so a line break
    // between two sentences survives when they land in the same bubble.
    const parts = paragraph.split(/(?<=[.!?\u2026])(\s+)(?=\S)/);
    let current = parts[0]!;
    for (let i = 1; i < parts.length; i += 2) {
      const sentence = parts[i + 1]!;
      if (wordCount(current) + wordCount(sentence) <= maxWords) {
        current += parts[i]! + sentence;
      } else {
        bubbles.push(current);
        current = sentence;
      }
    }
    bubbles.push(current);
  }
  while (bubbles.length > max) {
    const [a, b] = bubbles.slice(-2) as [string, string];
    if (wordCount(a) + wordCount(b) > maxWords) break;
    bubbles.splice(-2, 2, `${a}\n\n${b}`);
  }
  return bubbles;
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
 * as well, and did not. The 15-minute checkout touch (§R10.4) is part of the silence ruler.
 */
const cancelScheduled = (conversationId: string) =>
  db(`followups?conversation_id=eq.${conversationId}&status=eq.scheduled&or=(kind.like.silence_*,kind.eq.checkout_reminder)`, {
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
  const rows = scheduleSilence(from, stopPoint).map((f) => ({
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
  /** One size, or one per piece ("M,G") when the order is a kit. */
  size: string;
  amountBrl: number;
  /** Pieces in the order (Coinzz `order_quantity`), 1 when absent. */
  units?: number;
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
    `conversations?lead_id=eq.${lead.id}&select=id,stage&order=created_at.desc&limit=1`,
  );
  const conversation = conversations?.[0] ?? null;

  const saved = await db("orders?on_conflict=external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      lead_id: lead.id,
      conversation_id: conversation?.id ?? null,
      external_id: order.externalId,
      checkout_url: order.checkoutUrl ?? null,
      payment_method: order.paymentMethod,
      size: order.size,
      units: order.units ?? 1,
      amount_brl: order.amountBrl,
      status: order.status ?? "created",
      scheduled_for: order.scheduledFor ?? null,
      updated_at: new Date().toISOString(),
    }),
  });

  // The purchase closes the kit she was building: a later purchase starts from one piece
  // and asks again, instead of sending the old kit link with the old sizes (code review).
  await db(`leads?id=eq.${lead.id}`, {
    method: "PATCH",
    body: JSON.stringify({ units: null, unit_sizes: null, payment_choice: null, payment_choice_at: null }),
  }).catch(() => undefined);

  // No conversation means no ruler to touch — the sale is recorded and that is all.
  if (!conversation) return { status: "recorded", orderId: order.externalId, touches: 0 };

  // The funnel follows the sale (plan v2, 5.8): same no-regression rule as the turn.
  // The row's own id, so each post-order touch speaks of the order that armed it (two
  // orders on one lead read the latest otherwise).
  const orderRowId: string | undefined = saved?.[0]?.id;

  const others = await db(
    `orders?lead_id=eq.${lead.id}&external_id=neq.${encodeURIComponent(order.externalId)}&select=status`,
  );
  const reached = stageForLead(order.status, (others ?? []).map((o: { status: string | null }) => o.status ?? ""));
  if (reached) await persistStage(conversation.id, (conversation.stage as Stage | null) ?? "novo", reached);

  // Every row, not just the scheduled ones: a kind already `sent` still occupies the
  // unique key, and re-arming it throws.
  const existing = await db(
    `followups?conversation_id=eq.${conversation.id}&select=kind,status,order_id`,
  );
  const effect = onOrderConfirmed(
    ((existing ?? []) as Array<{ kind: FollowupKind; status: "scheduled" | "sent" | "canceled"; order_id: string | null }>)
      .map((f) => ({ kind: f.kind, status: f.status, orderId: f.order_id })),
    order.orderedAt ? new Date(order.orderedAt) : new Date(),
    CONFIG.delivery.codDaysMin,
    order.status,
    orderRowId,
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
          order_id: orderRowId ?? null,
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

/**
 * The row that carries a turn to retry (R13.4). `followups.kind` is free text and the
 * unique (conversation_id, kind) key makes it one pending retry per conversation, which
 * is the right number: a newer failure re-arms the same row instead of stacking another.
 */
const RETRY_TURN_KIND = "retry_turn";
const RETRY_TURNS_PER_SWEEP = 1;
/** A retried turn's own in-call budget: short, because it runs inside the sweep. */
const RETRY_TURN_BUDGET_MS = 30_000;
/** The interpreter gets one try: a failed reading degrades to "nothing detected". */
const INTERPRET_TIMEOUT_MS = 20_000;
/** On the sweep's retry the interpreter is cut much sooner — the reply is what matters. */
const RETRY_INTERPRET_TIMEOUT_MS = 8_000;
/**
 * How long a kit is remembered with no turn using it (loop review). Every turn that uses
 * the kit renews it, so a conversation that crosses days — the ruler's follow-ups — keeps it.
 */
const KIT_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;
/** Each postcode lookup (ViaCEP, then the checkout's availability) is cut here. */
const REGION_TIMEOUT_MS = 10_000;
const RETRY_REGION_TIMEOUT_MS = 5_000;

/**
 * What the `retry_turn` row carries in `followups.body`: the inbound message the failed
 * turn was answering, and how many times it was already rescheduled. The retry answers
 * exactly that message or nothing — a newer message means a newer turn owns the reply.
 */
type RetryTicket = { inboundId: string; retries: number };

const readTicket = (body: unknown): RetryTicket | null => {
  try {
    const t = JSON.parse(String(body ?? ""));
    return typeof t?.inboundId === "string" && Number.isInteger(t?.retries)
      ? { inboundId: t.inboundId, retries: t.retries }
      : null;
  } catch {
    return null;
  }
};
/** The last reply to an opt-out that also asked something — budget from turn start. */
const OPT_OUT_FAREWELL_BUDGET_MS = 60_000;
const OPT_OUT_FAREWELL_DIRECTIVE =
  "Ela pediu para não receber mais mensagens, e isso já está registrado. Esta é a sua ÚLTIMA" +
  " mensagem para ela: responda em poucas palavras só o que ela perguntou nesta mensagem e" +
  " confirme que ela não vai receber mais mensagens nossas. Não faça pergunta, não tente" +
  " convencer, não ofereça mais nada.";

const runFollowupSweep = async () => {
  const due = await db(
    "followups?status=eq.scheduled&run_at=lte." +
      encodeURIComponent(new Date().toISOString()) +
      "&select=id,kind,run_at,stop_point,body,order_id,conversation_id,conversations(id,lead_id,stage,last_inbound_at,leads(id,phone,size,opted_out_at,handoff_at,units,units_at,payment_choice,payment_choice_at))&limit=50",
  );

  /**
   * What n8n sends through the Cloud API. `via` is the 24-hour window decided here, not in
   * n8n (WA-1, 2026-09-25): inside it the text goes as is; outside, only an approved
   * template, with its variables. `body` is always the gated text, for the record.
   */
  type Send =
    | { to: string; kind: string; followupId: string; via: "text"; body: string }
    | {
        to: string;
        kind: string;
        followupId: string;
        via: "template";
        body: string;
        name: string;
        language: string;
        variables: readonly string[];
      };
  const toSend: Send[] = [];
  const skipped: Array<{ followupId: string; reason: string }> = [];
  /** Handoffs decided inside a retried turn — n8n mails these like the turn's own. */
  const handoffs: Array<Record<string, unknown>> = [];
  let retriedTurns = 0;

  for (const row of due ?? []) {
    const lead = row.conversations?.leads;
    // Only the row as this sweep read it: a turn that answered meanwhile re-arms the same
    // (conversation_id, kind) row with a new run_at, and that one is not ours to close.
    const mark = (status: string) =>
      db(`followups?id=eq.${row.id}&status=eq.scheduled&run_at=eq.${encodeURIComponent(row.run_at)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, sent_at: new Date().toISOString() }),
      });

    if (!lead || lead.opted_out_at || lead.handoff_at) {
      await mark("canceled");
      skipped.push({ followupId: row.id, reason: "opt-out ou handoff" });
      continue;
    }

    /**
     * The turn that failed on the network, tried once more (R13.4). It runs the whole turn
     * again — interpreter, gates, everything — and a failure now is the handoff. Capped
     * per sweep because each one may spend its own retry budget, and the sweep answers
     * inside the same 150 s as any request; the rest wait for the next sweep.
     */
    if (row.kind === RETRY_TURN_KIND) {
      if (retriedTurns >= RETRY_TURNS_PER_SWEEP) {
        skipped.push({ followupId: row.id, reason: "nova tentativa fica para a próxima varredura" });
        continue;
      }
      // A retry that waited past her 24-hour window cannot answer as free text (security
      // review, 2026-09-25): a person picks it up instead of Meta refusing it in silence.
      const retryInbound = row.conversations?.last_inbound_at ? new Date(row.conversations.last_inbound_at) : null;
      if (!windowIsOpen(new Date(), retryInbound)) {
        await mark("canceled");
        // A real handoff, as the e-mail says: the agent stops answering her (second review).
        await db(`leads?id=eq.${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({ handoff_at: new Date().toISOString() }),
        }).catch(() => undefined);
        handoffs.push({
          followupId: row.id,
          reason: "nova tentativa passou da janela de 24h do WhatsApp: responda você",
          notify: CONFIG.handoff?.email ?? null,
          leadId: lead.id,
          phone: lead.phone,
          conversationId: row.conversation_id,
        });
        continue;
      }
      // Claimed before it runs: a turn she sent meanwhile cancelled this retry, and running
      // it anyway would answer an old message after the new one.
      const claimed = await mark("sent");
      if (!Array.isArray(claimed) || claimed.length === 0) {
        skipped.push({ followupId: row.id, reason: "ela escreveu de novo antes da nova tentativa" });
        continue;
      }
      retriedTurns += 1;
      const ticket = readTicket(row.body);
      if (ticket === null) {
        skipped.push({ followupId: row.id, reason: "nova tentativa sem a mensagem de origem" });
        continue;
      }
      // A turn that throws here must not take the rest of the sweep down with it.
      const result = await handleTurn({ externalId: `retry:${row.id}`, from: lead.phone }, { retry: ticket })
        .then((r) => r.json())
        .catch((error) => ({ status: `erro: ${redactKeys(error instanceof Error ? error.message : String(error))}` }));
      // A retried turn answers a message of hers from minutes ago: inside the window.
      if (typeof result.reply === "string") {
        toSend.push({ to: lead.phone, via: "text", body: result.reply, kind: row.kind, followupId: row.id });
      }
      if (result.status === "handoff") {
        handoffs.push({
          followupId: row.id,
          reason: result.reason,
          notify: result.notify,
          leadId: result.leadId,
          phone: result.phone,
          conversationId: result.conversationId,
        });
      } else if (typeof result.reply !== "string") {
        skipped.push({ followupId: row.id, reason: `nova tentativa: ${result.status}` });
      }
      continue;
    }

    const kind = row.kind as FollowupKind;
    // From here every exit goes through `leave`: the ruler's last touch leaving the queue
    // without a sale is where the lead is lost (plan v2, 7.4) — sent, or cancelled for any
    // reason. Opt-out and handoff left above; a postponed touch has not left. Only a row
    // this sweep actually closed counts, or a turn that just answered would be undone.
    const leave = async (status: string): Promise<boolean> => {
      const closed = await mark(status);
      const ours = Array.isArray(closed) && closed.length > 0;
      if (endsSilenceRuler(kind) && ours) {
        await persistStage(row.conversation_id, (row.conversations?.stage as Stage | null) ?? "novo", "perdido");
      }
      return ours;
    };
    // A post-order touch speaks of THAT order — its total, pieces and sizes — never the
    // 1-piece price (fifth review, kits).
    const order = kind.startsWith("order_")
      ? (
          await db(
            // Its own order when the row says which (0017); the latest for rows armed before.
            row.order_id
              ? `orders?id=eq.${row.order_id}&select=amount_brl,units,size,payment_method`
              : `orders?lead_id=eq.${lead.id}&select=amount_brl,units,size,payment_method&order=created_at.desc&limit=1`,
          )
        )?.[0] ?? null
      : null;
    // Before the order, what the turn knew when it wrote a deferred reply: the kit and the
    // path she chose, while fresh. Re-gated as "cod" and one piece, a kit reply was lost.
    const fresh = (at: unknown) =>
      typeof at === "string" && Number.isFinite(Date.parse(at)) && Date.now() - Date.parse(at) <= KIT_MEMORY_MS;
    const touchUnits: number = order ? Number(order.units ?? 1) : fresh(lead.units_at) ? Number(lead.units ?? 1) : 1;
    const touchPath: "cod" | "prepay" = order
      ? order.payment_method === "prepay" ? "prepay" : "cod"
      : fresh(lead.payment_choice_at) && lead.payment_choice === "prepay" ? "prepay" : "cod";
    const renderCtx = {
      leadId: lead.id,
      config: CONFIG,
      stopPoint: (row.stop_point ?? "before_size") as StopPoint,
      size: order?.size ?? lead.size ?? undefined,
      ...(order && Number(order.amount_brl) > 0 ? { amountBrl: Number(order.amount_brl) } : {}),
      units: touchUnits,
      prepaid: order?.payment_method === "prepay",
      body: row.body ?? undefined,
    };
    const text = renderFollowup(kind, renderCtx);

    // Two touches can render to nothing, and calling both "coupon" hides the one that
    // matters: a deferred reply with no body is a paid-for answer that got lost.
    if (text === null) {
      await leave("canceled");
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
      paymentPath: touchPath,
      units: touchUnits,
      ...(order && Number(order.amount_brl) > 0 ? { orderAmountBrl: Number(order.amount_brl) } : {}),
      stage: kind.startsWith("order_") ? "logistics" : "presale",
    });

    await recordTraces(row.conversation_id, gates.traces);

    if (!passed(gates)) {
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

      await leave("canceled");
      skipped.push({ followupId: row.id, reason });
      continue;
    }

    // The 24-hour window (WA-1): outside it only an approved template leaves. A touch with
    // no template is cancelled and reported, never sent as text Meta would refuse — and
    // never written to `messages` as if she had read it.
    const lastInbound = row.conversations?.last_inbound_at ? new Date(row.conversations.last_inbound_at) : null;
    const delivery = deliveryFor(kind, renderCtx, lastInbound);
    if (delivery === null || delivery.via === "blocked") {
      await leave("canceled");
      skipped.push({
        followupId: row.id,
        reason:
          delivery?.via === "blocked" && delivery.reason === "empty_variable"
            ? "fora da janela de 24h: template com variável vazia"
            : "fora da janela de 24h e sem template aprovado",
      });
      continue;
    }

    // Closed before it is recorded or sent: if she answered after this sweep read the row,
    // her turn re-armed it and the old touch ("sumiu?") must not follow her reply. At most
    // once — a failure after the claim loses one touch instead of sending it twice.
    if (!(await leave("sent"))) {
      skipped.push({ followupId: row.id, reason: "ela respondeu antes do envio" });
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

    // The silence ruler starts when the agent finishes speaking, and for a deferred
    // reply that moment is now, not when the turn was written. The turn cancelled every
    // pending touch on the way in and returned before scheduling, so without this the
    // conversation loses follow-up recovery entirely.
    if (kind === "deferred_reply") {
      await scheduleSilenceTouches(row.conversation_id, stopPointOf(text));
    }
    toSend.push(
      delivery.via === "template"
        ? { to: lead.phone, kind, followupId: row.id, via: "template", body: text, name: delivery.name, language: delivery.language, variables: delivery.variables }
        : { to: lead.phone, kind, followupId: row.id, via: "text", body: text },
    );
  }

  return { status: "swept", due: (due ?? []).length, send: toSend, skipped, handoffs };
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type TurnPayload = {
  job?: string;
  externalId?: string;
  from?: string;
  body?: string;
  /** Ad attribution from a Click-to-WhatsApp entry, kept on the first touch only. */
  source?: Record<string, unknown>;
  /** When she sent it, from Meta's own timestamp (ISO): starts the 24-hour window. */
  sentAt?: string;
  /**
   * The inbound seal made by the `whatsapp` function (security review, 2026-09-25). With
   * INBOUND_SIGNING_SECRET set, a conversation turn without a valid seal is refused.
   */
  signature?: string;
  order?: OrderWebhook;
  /** The sale webhook's secret, forwarded by n8n from the platform's URL (O10). */
  token?: string;
  /**
   * n8n's second call for a brand-new lead, sent after its own `Wait` node — opção (a)
   * of 2026-09-21 (see HANDOFF.md). Never a channel event, so it skips the
   * `external_id` idempotency check below and uses `conversations.welcomed_at`
   * instead.
   */
  resume?: boolean;
};

/**
 * The role inside the caller's JWT. The platform already verified its signature
 * (`verify_jwt`); this only reads who it is. The anon key is public by design — it sits in
 * any browser client — so with TURN_REQUIRE_SERVICE_ROLE=true it no longer opens the
 * sweep, the order route or a turn (security review, 2026-09-25). Unset = not enforced yet.
 */
const callerRole = (request: Request): string | null => {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1] ?? "";
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.role ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json(405, { error: "use POST" });
  if (Deno.env.get("TURN_REQUIRE_SERVICE_ROLE") === "true" && callerRole(request) !== "service_role") {
    return json(401, { error: "use a chave de serviço" });
  }

  let payload: TurnPayload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "corpo não é JSON" });
  }
  const response = await handleTurn(payload);
  if (payload.job) return response;
  // `sealed` tells n8n this message really came through the `whatsapp` function (second
  // review): the only signal n8n may send to the customer on. `channel` is the caller's
  // word; this is the seal's. With the secret unset it is always false — fail closed.
  const secret = Deno.env.get("INBOUND_SIGNING_SECRET") ?? "";
  const sealed =
    secret !== "" &&
    (await sealIsValid(
      secret,
      { externalId: payload.externalId ?? "", from: payload.from ?? "", body: payload.body ?? "", sentAt: payload.sentAt },
      payload.signature,
    ));
  const out = await response.json().catch(() => null);
  return out && typeof out === "object" && !Array.isArray(out) ? json(response.status, { ...out, sealed }) : response;
});

/**
 * Everything after the JSON is read. A function of its own since 2026-09-24 so the sweep
 * can run a turn again after a network failure (R13.4); `internal.retry` is only ever set
 * by the sweep, never by what n8n posts.
 */
/** Constant-time comparison: a wrong token takes as long to refuse at any prefix. */
const sameSecret = (given: string, expected: string): boolean => {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  return diff === 0;
};

const handleTurn = async (payload: TurnPayload, internal: { retry?: RetryTicket } = {}): Promise<Response> => {
  const turnStartedAt = Date.now();

  // The cron half: sweep the follow-up rulers. Deterministic, no model call — except the
  // `retry_turn` rows, which run a whole turn again (R13.4).
  if (payload.job === "followups") return json(200, await runFollowupSweep());

  // The sale half. n8n posts here when Logzz or Coinzz confirms an order; the rule of
  // what that does to the schedule lives in `followups.ts`, where a test can hold it.
  if (payload.job === "order") {
    // O10: the sale webhook is public — anyone could post a forged sale with a real
    // customer's phone and arm the post-order ruler on her. Coinzz and Logzz cannot send a
    // custom header, so the secret travels in their webhook URL (`&token=`), n8n forwards it,
    // and it is checked here against a Supabase secret. Unset = not enforced yet.
    const saleToken = Deno.env.get("SALE_WEBHOOK_TOKEN") ?? "";
    if (saleToken !== "" && !sameSecret(String(payload.token ?? ""), saleToken)) {
      return json(401, { error: "token do webhook de venda inválido" });
    }
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
  // The sweep's second try at a turn the network failed (R13.4). Like a resume, it
  // carries no fresh message: it re-reads the one already stored.
  const isRetry = internal.retry !== undefined;
  /** When the message a retry answers arrived — the kit step compares it with `units_at`. */
  let retriedInboundAt: string | null = null;

  // The door is public (n8n `encorpa-inbound`): with the secret set, only a message sealed
  // by the `whatsapp` function becomes a turn — a forged "para de me mandar mensagem" on a
  // real customer's number would otherwise opt her out for good. Unset = not enforced yet.
  // The sweep's own retry is internal and carries no seal.
  const signingSecret = Deno.env.get("INBOUND_SIGNING_SECRET") ?? "";
  if (
    signingSecret !== "" &&
    !isRetry &&
    !(await sealIsValid(
      signingSecret,
      { externalId: inbound.externalId, from: inbound.from, body: payload.body ?? "", sentAt: payload.sentAt },
      payload.signature,
    ))
  ) {
    return json(401, { error: "mensagem sem o selo da entrada" });
  }

  // 1. Idempotency: the same channel event never becomes two turns. A resume call is
  // n8n's own clock, not a channel event — it never carries a fresh message to dedupe
  // against, so it gets its own guard below instead (welcomed_at vs. last_outbound_at).
  if (!isResume && !isRetry) {
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

  /** The stored inbound message this turn answers — what a `retry_turn` ticket names. */
  let inboundId: string | null = null;

  // 2b. The resume call, opção (a). It never inserts an inbound message — the one that
  // triggered the welcome is already stored — so it re-reads the latest inbound text
  // from the conversation instead of trusting whatever n8n resent, and it is a no-op if
  // Malu already answered for real since the welcome went out (she wrote again and got
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
      `messages?conversation_id=eq.${conversation.id}&direction=eq.inbound&select=id,body&order=created_at.desc&limit=1`,
    );
    inbound = { ...inbound, body: latest?.[0]?.body ?? inbound.body ?? "" };
    inboundId = latest?.[0]?.id ?? null;
  }

  // 2b-bis. The retry answers exactly the message whose turn failed — and only while that
  // is still her latest and nothing was sent after it. A newer message means a newer turn
  // already owns the reply, and answering the old one too is the duplicate this guards.
  // Index: messages_conversation_idx (conversation_id, created_at), read backwards.
  if (isRetry) {
    const latest = await db(
      `messages?conversation_id=eq.${conversation.id}&direction=eq.inbound&select=id,body,created_at&order=created_at.desc&limit=1`,
    );
    if (retryIsMoot(internal.retry!.inboundId, latest?.[0] ?? null, conversation.last_outbound_at ?? null)) {
      return json(200, { status: "retry_moot" });
    }
    inbound = { ...inbound, body: latest[0].body ?? "" };
    inboundId = latest[0].id;
    retriedInboundAt = latest[0].created_at ?? null;
  }

  if (!isResume && !isRetry) {
    inboundId = (await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "inbound",
        body: inbound.body ?? "",
        external_id: inbound.externalId,
      }),
    }))?.[0]?.id ?? null;
    // The 24-hour window counts from HER message (security review, 2026-09-25): stamped
    // here, once, with Meta's own timestamp when it is plausible — never at the end of the
    // turn, and never by a resume or a retry, which would stretch the window by minutes.
    const sentAt = Date.parse(String(payload.sentAt ?? ""));
    // Only the future is clamped (second review): an old message keeps its own time, so a
    // redelivery days later reads as a closed window instead of reopening it.
    const inboundAt = Number.isFinite(sentAt) ? new Date(Math.min(sentAt, Date.now())) : new Date();
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_inbound_at: inboundAt.toISOString() }),
    }).catch(() => undefined);
  }

  // 2c. Estágio 0 — every brand-new lead gets this fixed receipt, 24/7, never the
  // model. It replaces the rest of this call entirely: n8n waits
  // `WELCOME_RESUME_DELAY_SECONDS` and calls again with `resume: true` for Malu's real
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
    await recordTraces(conversation.id, receipt.traces);

    if (passed(receipt)) {
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
  // And a turn waiting to be retried is moot too: this turn answers her, with the failed
  // message still in the history it reads. Index: unique (conversation_id, kind).
  if (!isRetry) {
    await db(
      `followups?conversation_id=eq.${conversation.id}&kind=eq.${RETRY_TURN_KIND}&status=eq.scheduled`,
      { method: "PATCH", body: JSON.stringify({ status: "canceled" }) },
    ).catch(() => undefined);
  }

  // Retention counts from the last contact, not the first.
  await db("rpc/touch_retention", {
    method: "POST",
    body: JSON.stringify({ p_lead_id: lead.id }),
  }).catch(() => undefined);

  // The spend so far, read before any exit that may call a model. `turn_outcomes`
  // records the delta against `spentBefore`.
  let spent = Number(conversation.cost_brl ?? 0);
  const spentBefore = spent;

  // Which host serves CONVERSATION_MODEL, resolved once — used for every call and for
  // the provider label written to `llm_calls`, so the two never disagree.
  const conversationProvider = MUSE_FAMILY.test(CONVERSATION_MODEL) ? "meta" : "openai";
  const callConversationModel = conversationProvider === "meta" ? callMuse : callLuna;

  /**
   * The conversation goes to a person (R13.2) — for the three reasons that are hers, never
   * for a reply the agent phrased badly. The handoff is recorded first; only the receipt
   * is gated, as `layer: "auto"` (R4.4), so every content gate still applies while the
   * hours gate does not: someone who asks for a person at 2am deserves the confirmation
   * then. If the chain ever vetoes the receipt, the operator is still called — silently
   * dropping the alert would be the worse half of the two. The e-mail goes the way it
   * always did: `notification(...)` in the body, sent by n8n.
   */
  const handOff = async (reply: string, reason: string): Promise<Response> => {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });
    await cancelScheduled(conversation.id);
    const receipt = runGates(reply, {
      config: CONFIG,
      layer: "auto",
      optedOut: false,
      now: new Date(),
      paymentPath: "cod",
    });
    await recordTraces(conversation.id, receipt.traces);
    const sendable = passed(receipt);
    const asked = sendable
      ? (
          await db("messages", {
            method: "POST",
            body: JSON.stringify({ conversation_id: conversation.id, direction: "outbound", body: reply }),
          })
        )[0]
      : null;
    if (spent !== spentBefore) {
      await db(`conversations?id=eq.${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ cost_brl: spent, updated_at: new Date().toISOString() }),
      }).catch(() => undefined);
    }
    await Promise.all([
      recordOutcome(conversation.id, "handoff", reason, 0, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "handoff",
      reason,
      reply: sendable ? reply : null,
      bubbles: paced(sendable ? reply : null),
      blocked: receipt.traces.filter((t) => t.verdict === "block"),
      messageId: asked?.id ?? null,
      ...notification(lead, conversation),
      costBrl: spent,
    });
  };

  /**
   * She opted out and asked something in the same message (R13.4, Rose: "não me manda
   * mais mensagem... só me diz o preço antes"). One last reply — the answer and the
   * confirmation — through the whole chain, with the same rewrites any reply gets. The
   * opt-out gate is told `optedOut: false` for this one message only: it is the reply to
   * the opt-out itself, and the opt-out is already written. Anything that goes wrong
   * returns null, and she gets the plain opt-out — never a retry, never a handoff.
   */
  const optOutFarewell = async (): Promise<{ text: string; id: string | null } | null> => {
    if (spent >= ceilingBrl) return null;
    const history = await db(
      `messages?conversation_id=eq.${conversation.id}&select=direction,body&order=created_at.desc&limit=20`,
    ).catch(() => null);
    const turns = [...(history ?? [])].reverse().map((m: { direction: string; body: string }) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.body ?? "",
    }));
    const base = `${systemPrompt(null)} ${OPT_OUT_FAREWELL_DIRECTIVE}`;
    let correction = "";
    const deadline = turnStartedAt + OPT_OUT_FAREWELL_BUDGET_MS;
    for (let rewrites = 0; rewrites <= MAX_REWRITES; rewrites += 1) {
      let attempt: ModelCall;
      try {
        attempt = await withNetworkRetry(
          (timeoutMs) => callConversationModel(`${base}${correction}`, turns, undefined, timeoutMs),
          deadline,
        );
      } catch {
        break;
      }
      spent += attempt.costBrl;
      await recordCall(conversation.id, "farewell", conversationProvider, CONVERSATION_MODEL, attempt);
      const gated = runGates(attempt.text, {
        config: CONFIG,
        layer: "agent",
        optedOut: false,
        now: new Date(),
        paymentPath: "cod",
      });
      await recordTraces(conversation.id, gated.traces);
      if (passed(gated)) {
        const out = await db("messages", {
          method: "POST",
          body: JSON.stringify({ conversation_id: conversation.id, direction: "outbound", body: attempt.text }),
        }).catch(() => null);
        await db(`conversations?id=eq.${conversation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ cost_brl: spent, last_outbound_at: new Date().toISOString() }),
        }).catch(() => undefined);
        return { text: attempt.text, id: out?.[0]?.id ?? null };
      }
      // The same rewrite policy as the main loop, not a copy of it (code ladder, 2026-09-24).
      const next = decideNext({
        remedy: remedyFor(gated),
        rewritesUsed: rewrites,
        spentBrl: spent,
        ceilingBrl,
        reasons: gated.traces.filter((t) => t.verdict === "block").map((t) => t.detail ?? t.gate),
        vetoedText: attempt.text,
      });
      if (next.kind !== "rewrite") break;
      correction = ` ${next.instruction}`;
    }
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cost_brl: spent }),
    }).catch(() => undefined);
    return null;
  };

  // 3. Opt-out is irrevocable and costs nothing to check.
  const optOut = classifyOptOut(inbound.body ?? "");
  if (optOut === "explicit") {
    // Written first: nothing below — a model call, a failure — may delay or lose it.
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ opted_out_at: new Date().toISOString() }),
    });
    // Only on the opt-out itself: a lead already out, or already with a person, gets none.
    const farewell =
      !lead.opted_out_at && !lead.handoff_at && asksSomething(inbound.body ?? "") ? await optOutFarewell() : null;
    // `bloqueado` is terminal and irreversible by the agent — only a person undoes it.
    await Promise.all([
      recordOutcome(
        conversation.id,
        "opted_out",
        farewell ? "opt-out explícito, com a última resposta ao que ela perguntou" : "opt-out explícito da cliente",
        0,
        spent - spentBefore,
      ),
      persistStage(conversation.id, storedStage, "bloqueado"),
    ]);
    // n8n sends `reply` when it is present; a plain opt-out still carries none.
    return json(200, {
      status: "opted_out",
      reply: farewell?.text ?? null,
      bubbles: paced(farewell?.text ?? null),
      messageId: farewell?.id ?? null,
      costBrl: spent,
    });
  }
  if (lead.opted_out_at) return json(200, { status: "already_opted_out" });

  // A conversation handed to a person stays with that person. The sweep already
  // honours `handoff_at`; without the same check here the agent answered the next
  // message as if nothing had happened, talking over whoever took it over.
  if (lead.handoff_at) {
    return json(200, { status: "already_handed_off", ...notification(lead, conversation) });
  }

  // 3b. She asked for a person (§Q12), in one of the exact phrases. Deterministic, so it
  // costs nothing and never depends on the model noticing — and it runs before any model
  // call, because there is no point paying to generate a reply she already said she does
  // not want. The interpreter (4b) catches the request inside a longer message.
  if (wantsHuman(inbound.body ?? "")) {
    return await handOff(HUMAN_HANDOFF_REPLY, "a cliente pediu para falar com uma pessoa");
  }

  // 4. The ceiling is checked before a byte leaves for any provider.
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
      // in n8n's execution log. Gemini left the turn on 2026-09-23; redacting stays here as
      // defence in depth for the keys still in use. A key that already circulated in a
      // third party's log has to be rotated, not masked.
      detail: redactKeys(error instanceof Error ? error.message : String(error)),
      reply: HOLDING_REPLY,
      bubbles: paced(HOLDING_REPLY),
      messageId: held?.[0]?.id ?? null,
      ...notification(lead, conversation),
      costBrl: spent,
    });
  };

  /**
   * The network stayed down through every in-call retry (R13.4). Not a handoff yet: one
   * more attempt is scheduled for the sweep, which runs every 5 minutes on the n8n cron.
   * She hears nothing now — the retried turn answers her, or hands off if it fails too.
   * Null when the row could not be written, and then the caller hands off: silence with
   * nothing scheduled would be the one outcome worse than a handoff.
   * Index: the unique (conversation_id, kind) of `followups`, as the rulers use.
   */
  const deferRetry = async (error: unknown, retries: number): Promise<Response | null> => {
    if (inboundId === null) return null;
    const runAt = new Date(Date.now() + DEFERRED_RETRY_DELAY_SECONDS * 1000);
    const ticket: RetryTicket = { inboundId, retries };
    const armed = await db("followups?on_conflict=conversation_id,kind", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        conversation_id: conversation.id,
        kind: RETRY_TURN_KIND,
        run_at: runAt.toISOString(),
        status: "scheduled",
        body: JSON.stringify(ticket),
      }),
    }).then(() => true, () => false);
    if (!armed) return null;
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cost_brl: spent, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
    const reason = "falha de rede ao chamar o modelo — nova tentativa agendada";
    await Promise.all([
      recordOutcome(conversation.id, "deferred", reason, 0, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "deferred",
      reason,
      detail: redactKeys(error instanceof Error ? error.message : String(error)),
      runAt: runAt.toISOString(),
      costBrl: spent,
    });
  };

  /**
   * The retry's second look, right before it sends (code review, 2026-09-24): its model
   * calls take seconds, and a message she sends meanwhile starts a turn that owns the
   * reply. Null means "go ahead"; otherwise the spend is written down and nothing is sent.
   * Index: messages_conversation_idx (conversation_id, created_at), read backwards.
   */
  const retryGaveUp = async (rewrites: number): Promise<Response | null> => {
    if (!isRetry) return null;
    const latest = await db(
      `messages?conversation_id=eq.${conversation.id}&direction=eq.inbound&select=id,created_at&order=created_at.desc&limit=1`,
    ).catch(() => null);
    if (!retryIsMoot(internal.retry!.inboundId, latest?.[0] ?? null, null)) return null;
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cost_brl: spent, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
    const reason = "nova tentativa sem objeto: chegou mensagem nova enquanto ela rodava";
    await recordOutcome(conversation.id, "stopped", reason, rewrites, spent - spentBefore);
    return json(200, { status: "retry_moot", reason, costBrl: spent });
  };

  /**
   * A fixed line, sent through the chain like anything else (the clarify ladder and the
   * "vou pensar" reply, R13.4). Null when the chain refuses it — out of hours, typically —
   * and the caller then falls through to the normal turn, which handles that case.
   */
  const sendFixed = async (
    text: string,
    reason: string,
    path: "cod" | "prepay" = "cod",
    extra: Record<string, unknown> = {},
  ): Promise<Response | null> => {
    const gated = runGates(text, {
      config: CONFIG,
      layer: "agent",
      optedOut: false,
      now: new Date(),
      paymentPath: path,
    });
    await recordTraces(conversation.id, gated.traces);
    if (!passed(gated)) return null;
    const gaveUp = await retryGaveUp(0);
    if (gaveUp) return gaveUp;
    const out = (
      await db("messages", {
        method: "POST",
        body: JSON.stringify({ conversation_id: conversation.id, direction: "outbound", body: text }),
      })
    )[0];
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        cost_brl: spent,
        last_outbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    // A fixed line that carries the link starts the ruler at `link_sent`: the delivery
    // checkout's URL has neither "checkout" nor "link" in it for `stopPointOf` to see.
    await scheduleSilenceTouches(conversation.id, extra.checkoutUrl ? "link_sent" : stopPointOf(text));
    await Promise.all([
      recordOutcome(conversation.id, "send", reason, 0, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, {
      status: "ok",
      reason,
      reply: text,
      bubbles: paced(text),
      messageId: out.id,
      rewrites: 0,
      ...extra,
      costBrl: spent,
      ceilingBrl,
    });
  };

  // The agent's last message: what the interpreter compares her answer with, what the
  // clarify ladder counts from, and what the address read-back is checked against.
  // Index: messages_conversation_idx (conversation_id, created_at), read backwards.
  const lastOutbound: string =
    (
      await db(
        `messages?conversation_id=eq.${conversation.id}&direction=eq.outbound` +
          "&select=body&order=created_at.desc&limit=1",
      ).catch(() => null)
    )?.[0]?.body ?? "";

  /**
   * 4b. The interpreter (R13.1). One call, same model, strict JSON: what her message
   * says, read by the model and acted on by the code below. It never fails the turn — a
   * failed call reads as `NEUTRAL_INTERPRETATION` and the deterministic readers still run.
   */
  let interpretation: Interpretation = NEUTRAL_INTERPRETATION;
  let interpreted = false;
  try {
    const ask = interpretRequest(lastOutbound, inbound.body ?? "");
    const reading = await callConversationModel(
      ask.system,
      [{ role: "user", content: ask.user }],
      INTERPRET_MAX_COMPLETION_TOKENS,
      isRetry ? RETRY_INTERPRET_TIMEOUT_MS : INTERPRET_TIMEOUT_MS,
    );
    spent += reading.costBrl;
    await recordCall(conversation.id, "interpret", conversationProvider, CONVERSATION_MODEL, reading);
    ({ parsed: interpreted, interpretation } = readInterpretation(reading.text));
  } catch {
    // Neutral reading; the turn goes on.
  }
  // Two readings the code also makes on its own, because missing either costs the sale
  // (persona round 3): a goodbye is answered like "vou pensar" (Tati got the size ladder),
  // and a decision in her words sends the link (Marcinha's "vou nesse então").
  // A goodbye never beats a decision: "deixa quieto, quero o G mesmo" is buying.
  if (decidesToBuy(inbound.body ?? "")) interpretation = { ...interpretation, wants_to_buy: true };
  // A purchase on a price the shop does not have is not a decision (H-2): no link on
  // "faz por 100 que eu levo", whichever reading said yes. "Por 116 eu levo" is the real
  // prepaid price and stays a decision.
  const couponCut = CONFIG.coupon.active ? 1 - CONFIG.coupon.percent / 100 : null;
  const shopPrices = [
    CONFIG.prices.codBrl,
    CONFIG.prices.prepayBrl,
    CONFIG.prices.anchorBrl,
    ...(CONFIG.kits ?? []).map((k) => k.priceBrl),
    // With the coupon on, the price after it is the shop's too (second review).
    ...(couponCut === null ? [] : [CONFIG.prices.codBrl * couponCut, CONFIG.prices.prepayBrl * couponCut]),
  ];
  const shopPercents = [
    CONFIG.prices.prepayDiscountPercent,
    // A kit's percentage only for more than one piece (third review): 30% on one piece is
    // a discount the shop does not give.
    ...((interpretation.units ?? 1) > 1 ? (CONFIG.kits ?? []).map((k) => k.discountPercent) : []),
    ...(CONFIG.coupon.active ? [CONFIG.coupon.percent] : []),
  ];
  if (namesOwnPrice(inbound.body ?? "", shopPrices, shopPercents)) interpretation = { ...interpretation, wants_to_buy: false };
  if (goodbyeParks(inbound.body ?? "", interpretation)) interpretation = { ...interpretation, wants_to_think: true };

  // The reply's retry budget starts here, after the interpreter, so a slow reading does
  // not eat into it; the interpreter's own timeout bounds what came before.
  const replyBudgetFrom = Date.now();

  // 4c. The only other doors to a person (R13.2): an order she wants cancelled, a
  // question about an order that exists, or a person asked for inside a longer message
  // — which needs the reading AND a person-word in her text. The exact phrases already
  // returned at 3b, hence `false` here.
  //
  // Cancel and post-sale need an order to be about: one on file for the lead (index
  // `orders_lead_idx`), or a checkout link already sent in this conversation (index
  // `messages_conversation_idx`, then a filter on the body). Only queried when the reading
  // asks — most turns never pay for it.
  //
  // She saying she already bought is context too (persona round 3, Lu and Vera) — in
  // this message or any recent one of hers (index `messages_conversation_idx`).
  let orderContext = false;
  if (interpretation.wants_cancel || interpretation.post_sale) {
    const mine = await db(
      `messages?conversation_id=eq.${conversation.id}&direction=eq.inbound&select=body&order=created_at.desc&limit=20`,
    ).catch(() => null);
    // The bare "comprei" counts only in THIS message; from the history, only the phrases
    // that can only mean an order with us (code review, 2026-09-24).
    orderContext =
      statesPastPurchase(inbound.body ?? "") ||
      (mine ?? []).some((m: { body: string }) => statesPastPurchase(m.body ?? "", false));
    const orders = orderContext ? [] : await db(`orders?lead_id=eq.${lead.id}&select=id&limit=1`).catch(() => null);
    orderContext = orderContext || (orders?.length ?? 0) > 0;
    for (const base of [CONFIG.checkout?.codUrl, CONFIG.checkout?.prepayUrl, ...(CONFIG.kits ?? []).map((k) => k.checkoutUrl)]) {
      if (orderContext || !base) continue;
      const sent = await db(
        `messages?conversation_id=eq.${conversation.id}&direction=eq.outbound` +
          `&body=like.${encodeURIComponent(`*${base}*`)}&select=id&limit=1`,
      ).catch(() => null);
      orderContext = (sent?.length ?? 0) > 0;
    }
  }
  const handoffKind = handoffFor(interpretation, inbound.body ?? "", orderContext);
  if (handoffKind !== null) {
    return await handOff(
      handoffKind === "human" ? HUMAN_HANDOFF_REPLY : ORDER_HANDOFF_REPLY,
      handoffKind === "cancel"
        ? "a cliente quer cancelar um pedido"
        : handoffKind === "post_sale"
        ? "a cliente pergunta sobre um pedido existente"
        : "a cliente pediu para falar com uma pessoa",
    );
  }

  // 5. (Until v32 a Gemini intent call ran here. Its answer decided nothing — it was
  // only echoed back as `intent`, which no n8n workflow reads — so it left the turn on
  // 2026-09-23, R12.1: Meta is the only model provider.)
  //
  // 5b. A size she stated is worth keeping: the post-order ruler reads it back,
  // and an empty column becomes a dash in a message a customer sees. What counts as
  // "stated" is decided by the text itself, not by the old intent classifier — it called
  // "tenho 44 anos" a sizing turn, which is fair, and would have made her a G.
  const stated = statedSize(inbound.body ?? "", interpretation);
  if (stated && stated.size !== lead.size) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ size: stated.size, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
  }

  // 5c. How many pieces (kits, 2026-09-25). The Coinzz checkout sells a fixed quantity,
  // so the quantity picks the link, and each piece has its own size. More than the biggest
  // kit has no link at all: a person builds that order (operator's decision).
  const kits = CONFIG.kits ?? [];
  const quantity = quantityOf(inbound.body ?? "", interpretation);
  // An abandoned kit expires (loop review, 2026-09-25): nothing closes a conversation, so
  // "quero 2, M e G" twelve days ago would turn today's "quero o M" into the kit-of-2 link.
  const unitsAt = typeof lead.units_at === "string" ? Date.parse(lead.units_at) : NaN;
  const kitStale = !Number.isFinite(unitsAt) || Date.now() - unitsAt > KIT_MEMORY_MS;
  const units: number = quantity?.units ?? (kitStale ? null : (lead.units as number | null)) ?? 1;
  const maxUnits = Math.max(1, ...kits.map((k) => k.units));
  if (units > maxUnits) {
    return await handOff(
      `Pra levar ${units} peças eu chamo uma pessoa do time pra montar seu pedido 💛`,
      `a cliente quer ${units} peças, mais que o maior kit (${maxUnits})`,
    );
  }
  const storedSizes = kitStale ? [] : ((lead.unit_sizes as string[] | null) ?? []);
  // Pants numbers go through the same deterministic table as one piece's: the model never
  // converts a size, and she should not have to guess her letter (kit round).
  const saidSizes: string[] = quantity?.sizes.length
    ? quantity.sizes
    : interpretation.unit_pants.length
      ? interpretation.unit_pants.map(sizeFromDressSize)
      : stated && units > 1
        ? [stated.size]
        : [];
  // A retry replays the same message: when the first attempt already merged it (the kit
  // was written after that message arrived), merging again would add a size she said once.
  // When it did not, the sizes count — read from the clock, never guessed from content.
  // A full list is idempotent, so only a partial one can be dropped as a replay (third review).
  const replayed =
    isRetry &&
    saidSizes.length < units &&
    retriedInboundAt !== null &&
    Number.isFinite(unitsAt) &&
    unitsAt >= Date.parse(retriedInboundAt);
  const unitSizes: string[] =
    units > 1
      ? mergeUnitSizes(
          storedSizes,
          replayed ? [] : saidSizes,
          units,
          saysOwnSize(inbound.body ?? "", interpretation),
        )
      : [];
  // Written on every turn that uses a kit, not only when it changes: the age is of the last
  // use, or a kit said on Monday expires mid-conversation on Friday (third review).
  if (quantity || units > 1) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ units, unit_sizes: unitSizes, units_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
  }

  // 5d. The address loop. It accumulates across turns because she says it in pieces,
  // and it is only ever *confirmed* by her saying so — a package sent to an address
  // nobody read back is the failed delivery this costs the most to fix.
  const storedAddress = (lead.address ?? {}) as Partial<Address> & { confirmedAt?: string };
  let addressConfirmed = Boolean(storedAddress.confirmedAt);
  let addressDraft: Partial<Address> = { ...storedAddress };
  delete (addressDraft as { confirmedAt?: string }).confirmedAt;

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
        const r = await fetch(url, {
          signal: AbortSignal.timeout(isRetry ? RETRY_REGION_TIMEOUT_MS : REGION_TIMEOUT_MS),
        });
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
  // The e-mail the interpreter read counts when the strict reader found none.
  const identityFound = {
    ...(interpretation.email ? { email: interpretation.email } : {}),
    ...foundIdentity.fields,
  };
  const identityDraft = mergeIdentity(storedIdentity, identityFound).fields;
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

  // 5f. The clarify ladder (R13.4): the agent asked her size and the answer is about
  // nothing — three fixed lines from the operator, then silence until a message makes
  // sense. The step is read back from the last outbound, so there is nothing to store.
  // It runs AFTER the address and identity readers: a CEP, a name or a CPF is data, and a
  // message carrying data is never answered with a size line or with silence.
  const lastAskedSize = asksForSize(lastOutbound);
  const clarify = decideClarify({
    interpreted,
    interpretation,
    lastOutbound,
    lastAskedSize,
    sizeFound: stated !== null,
    factsFound: Object.keys(foundAddress.fields).length > 0 || Object.keys(identityFound).length > 0,
    // She was just told "Sem problemas, estou aqui…": no fresh ladder right after it.
    parked: recentOutbound.slice(-3).some((m: string) => m.startsWith(THINK_REPLY)),
  });
  if (clarify.kind === "silent") {
    await db(`conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cost_brl: spent, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
    const reason = "escada do tamanho esgotada: sem resposta até a mensagem fazer sentido";
    await Promise.all([
      recordOutcome(conversation.id, "stopped", reason, 0, spent - spentBefore),
      persistStage(conversation.id, storedStage, reachedSoFar),
    ]);
    return json(200, { status: "stopped", reason, costBrl: spent });
  }
  if (clarify.kind === "reply") {
    const sent = await sendFixed(clarify.text, "escada do tamanho");
    if (sent) return sent;
  }
  // She asked her own question instead of the size: she gets the answer, and the size
  // comes back at the end of it.
  const backToSize =
    lastAskedSize && stated === null && interpretation.pending_answer === "other_question"
      ? `Ela fez outra pergunta em vez de dizer o tamanho: responda a pergunta dela primeiro` +
        ` e, no fim, volte a perguntar o tamanho, com outras palavras.`
      : null;

  /**
   * The link she finishes in, built before the model writes so the reply can carry it.
   *
   * Since R13.4 (2026-09-24) it no longer waits for name, e-mail and CPF: it goes out
   * with whatever is known as soon as she is ready — she wants to buy, she has no e-mail
   * or will not give it, or she let an ask for it pass — and the checkout form asks for
   * the rest. The identity ask became a directive for the agent to phrase, and it stops
   * once the link is in the chat.
   */
  // Her choice holds until she makes another (loop round, 2026-09-25): read per message, the
  // turn after "quero no pix" fell back to cash on delivery and sent the delivery checkout.
  // Stored only when her words make a choice, never from a question ("quanto economizo no
  // pix em vez de pagar na entrega?"), and forgotten like an abandoned kit (fourth review).
  const choiceAt = typeof lead.payment_choice_at === "string" ? Date.parse(lead.payment_choice_at) : NaN;
  const storedChoice =
    Number.isFinite(choiceAt) && Date.now() - choiceAt <= KIT_MEMORY_MS
      ? ((lead.payment_choice as "cod" | "prepay" | null) ?? null)
      : null;
  const paymentChoice = interpretation.payment_choice ?? storedChoice;
  // A choice in use is renewed like the kit, at most once a day (fifth review).
  const renewChoice = !interpretation.payment_choice && storedChoice !== null && Date.now() - choiceAt > 24 * 60 * 60 * 1000;
  if (renewChoice) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ payment_choice_at: new Date().toISOString() }),
    }).catch(() => undefined);
  }
  if (interpretation.payment_choice && choosesPath(inbound.body ?? "")) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_choice: interpretation.payment_choice,
        payment_choice_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  }
  const linkPath = linkPathFor(paymentChoice, region);
  // What the link carries: the name title-cased for the checkout (code review,
  // 2026-09-24 — "maria jose ferreira", "MARIA DA SILVA"); the stored value is untouched.
  const linkCustomer = {
    ...identityDraft,
    ...(identityDraft.name ? { name: titleCaseName(identityDraft.name) } : {}),
    phone: lead.phone,
  };
  const identityComplete = isIdentityComplete(identityDraft);
  // Kits: every piece needs its size before the link, and the link is the kit's own.
  const sizeKnown = units > 1 ? unitSizes.length >= units : (stated?.size ?? lead.size ?? null) !== null;
  const kitUrl = units > 1 ? kits.find((k) => k.path === linkPath && k.units === units)?.checkoutUrl : undefined;
  if (units > 1 && !kitUrl) {
    return await handOff(
      `Pra montar esse pedido de ${units} peças eu chamo uma pessoa do time 💛`,
      `a cliente quer ${units} peças no ${linkPath === "cod" ? "pagamento na entrega" : "antecipado"}, e não há kit de ${units} nesse caminho`,
    );
  }
  const linkCheckout = kitUrl ? { codUrl: kitUrl, prepayUrl: kitUrl } : (CONFIG.checkout ?? {});
  // The row of the linked facts this turn's link belongs to (H-2): told to the agent with
  // the link and written to `turn_outcomes.reason`, so the record says what was sent.
  const linkFact = linkFactLine(CONFIG, linkPath, units > 1 ? units : 1);
  const readiness = {
    identityComplete,
    interpretation,
    identityAsked: asksForIdentity(lastOutbound),
    identityGiven: Object.keys(identityFound).length > 0,
  };
  const checkoutBases = [CONFIG.checkout?.codUrl, CONFIG.checkout?.prepayUrl, ...kits.map((k) => k.checkoutUrl)].filter(
    (u): u is string => typeof u === "string" && u !== "",
  );
  // M-03: the link this turn would send, if it went out in the last three messages, is
  // not sent again. Only this path's checkout counts (code review, 2026-09-24): a switch
  // from the delivery checkout to the prepaid one is a different link and still goes out.
  const pathBase = kitUrl ?? (linkPath === "cod" ? CONFIG.checkout?.codUrl : CONFIG.checkout?.prepayUrl);
  const linkJustSent =
    !asksForLink(inbound.body ?? "") && linkSentRecently(recentOutbound, pathBase ? [pathBase] : []);
  const linkNow = !linkJustSent && sendLinkNow({ ...readiness, sizeKnown });
  // Ready for the link and the size still unknown: the size comes first, asked naturally.
  const sizeBeforeLink =
    !sizeKnown && readyForLink(readiness)
      ? units > 1
        ? `Ela quer ${units} peças e ${unitSizes.length === 0 ? "nenhum tamanho foi dito" : `só ${unitSizes.length} tamanho(s) foi dito (${unitSizes.join(", ")})`}:` +
          ` antes do link, pergunte o tamanho de cada peça que falta — podem ser diferentes.`
        : `Ela quer fechar, mas o tamanho ainda não foi definido: antes do link, pergunte com` +
          ` naturalidade que número de calça ela usa — o link só vai depois do tamanho.`
      : null;
  const linkAlreadySent = linkSentRecently(recentOutbound, checkoutBases, recentOutbound.length);
  let checkoutUrl: string | null = null;
  let checkoutBlocked: string[] = linkNow
    ? []
    : (["name", "email", "document"] as const).filter((f) => !identityDraft[f]).map((f) => `customer.${f}`);
  if (linkNow) {
    try {
      checkoutUrl = buildPrefilledCheckoutLink(linkCustomer, linkPath, linkCheckout);
    } catch (error) {
      checkoutBlocked =
        error instanceof CoinzzIncompleteError ? [...error.missing] : [String(error)];
    }
  }

  // "Vou pensar" (R13.4): the operator's line, then the link in a bubble of its own. No
  // model call — unless she also asked something, and then the model answers with the
  // link in its directive like any other turn.
  // A goodbye with the link already in the chat gets the operator's line without the link
  // again (persona round); "vou pensar" keeps the line either way (seventh review).
  const linkInChat = recentOutbound.some((m) => checkoutBases.some((base) => m.includes(base)));
  if (interpretation.wants_to_think && interpretation.pending_answer !== "other_question") {
    // Never a link without a size: without one she gets the line alone.
    let thinkLink: string | null = null;
    try {
      thinkLink = sizeKnown && !linkJustSent && !(linkInChat && closesConversation(inbound.body ?? ""))
        ? buildPrefilledCheckoutLink(linkCustomer, linkPath, linkCheckout)
        : null;
    } catch {
      thinkLink = null;
    }
    const sent = await sendFixed(
      thinkLink
        ? `${THINK_REPLY}\n\n${thinkLink}` +
            (units > 1 ? `\n\nNo complemento do endereço, escreva os tamanhos: ${unitSizes.join(" e ")}.` : ``)
        : THINK_REPLY,
      thinkLink && linkFact ? `ela vai pensar: resposta fixa e link — ${linkFact}` : "ela vai pensar: resposta fixa e link",
      linkPath,
      { checkoutUrl: thinkLink, linkFact: thinkLink ? linkFact : null },
    );
    if (sent) return sent;
  }

  const identityDirective = linkNow || linkAlreadySent ? null : identityDirectiveFor(identityDraft);
  // Once the link is in the chat the checkout collects the rest (persona round 3, Cleide
  // was asked her e-mail after it). Said outright, because the prompt's own flow asks.
  const afterLink = linkAlreadySent
    ? `O link do pedido já foi enviado nesta conversa: não peça e-mail, nome nem CPF — o` +
      ` checkout pede o que faltar.`
    : null;
  // Nothing answered for her region (no CEP, or the lookup failed): coverage is unknown,
  // and the `coverage_claim` gate refuses any sentence that affirms it.
  const coverageUnknown =
    region === null
      ? `A entrega na região dela ainda não foi confirmada${
          addressDraft.cep ? " (a consulta do CEP não respondeu)" : ""
        }: nunca diga que chega ou que atende a cidade ou o CEP dela. Se ela perguntar, diga que` +
        ` o checkout confirma quando ela digitar o CEP.`
      : null;
  const checkoutDirective = checkoutDirectiveFor(
    checkoutUrl,
    // A kit carries one size per piece, and she types them all in the complement.
    units > 1 ? unitSizes.join(" e ") : stated?.size ?? lead.size ?? null,
    linkPath,
    Object.keys(identityDraft).length > 0,
    linkFact,
  );
  // The kit: offered once when she decides (operator, 2026-09-25), and when the link is a
  // kit's, the sizes she gave go in the checkout complement — the only field she types.
  const kitsOnPath = kits.filter((k) => k.path === linkPath).sort((a, b) => a.units - b.units);
  const kitOffered = recentOutbound.some((m) =>
    /\b(?:[23]|duas|tr[eê]s)\s+pe[cç]as\b|\bkits?\b|\blevando\s+(?:[23]|duas|tr[eê]s)\b/i.test(m),
  );
  const kitDirective =
    units > 1 && checkoutUrl !== null
      ? `O link é do kit de ${units} peças, com os tamanhos ${unitSizes.join(" e ")}.`
      : units === 1 && interpretation.wants_to_buy && kitsOnPath.length > 0 && !kitOffered
      ? `Na mesma mensagem, ofereça uma vez só, numa frase curta, que levando mais peças o desconto` +
        ` sobe: ${kitsOnPath.map((k) => `${k.units} peças R$ ${k.priceBrl.toFixed(2).replace(".", ",")} (${k.discountPercent}%)`).join(", ")}.` +
        ` Se ela não quiser, siga com uma peça.`
      : null;
  const sizeDirective =
    [
      kitDirective,
      units > 1 ? null : sizeDirectiveFor(stated, lead.size ?? null, region, checkoutUrl !== null),
      backToSize,
      sizeBeforeLink,
      coverageUnknown,
      afterLink,
    ].filter(Boolean).join(" ") || null;

  // 7. Nothing reaches the customer without the chain — but a veto is not the end of
  // the turn. The chain knows exactly what was wrong, so the reason goes back to the
  // model and it writes the message again. Silence and "the operator will handle it"
  // are what this loop exists to avoid; both are last resorts, not first answers.
  let attempt: ModelCall;
  let gates: ReturnType<typeof runGates>;
  let rewritesUsed = 0;
  let correction: string | null = null;
  let outcome: NextAction = { kind: "send" };

  while (true) {
    try {
      // The correction rides in the system prompt, so the vetoed text never enters
      // the conversation history the customer's next turn is built from.
      const system = correction === null
        ? systemPrompt(sizeDirective, identityDirective, checkoutDirective)
        : `${systemPrompt(sizeDirective, identityDirective, checkoutDirective)} ${correction}`;
      attempt = await withNetworkRetry(
        (timeoutMs) => callConversationModel(system, turns, undefined, timeoutMs),
        replyBudgetFrom + (isRetry ? RETRY_TURN_BUDGET_MS : IN_CALL_RETRY_BUDGET_MS),
      );
    } catch (error) {
      // The network, still down after the in-call retries: one more try from the sweep
      // before anyone is called (R13.4). On that try, a call our own budget cut — slow,
      // not dead — is rescheduled rather than handed off, up to MAX_DEFERRED_RETRIES.
      if (isTransient(error)) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        const retries = internal.retry?.retries ?? -1;
        if (!isRetry || afterRetryFailure(timedOut, retries) === "reschedule") {
          const deferred = await deferRetry(error, retries + 1);
          if (deferred) return deferred;
        }
      }
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
      // The path the link opens (R13.4) — "cod" unless she chose prepaid or her region
      // has no cash on delivery, and then the prepaid rules are the ones that apply.
      paymentPath: linkPath,
      // The pieces in play: a kit price needs the kit, a 1-piece price the single piece.
      units,
      recentOutbound,
      // Social proof is a tool, and it was locked: nobody ever passed this list, so
      // every quote she attributed to a customer was read as invented and rewritten.
      knownTestimonials: CONFIG.testimonials,
      // The two the region unlocks. Without a postcode both stay undefined, and the
      // chain refuses a size and refuses "hoje" — which is the correct silence.
      ...(region ? { sizeChecked: stated?.size ?? lead.size ?? undefined } : {}),
      sameDayWindow: region?.sameDay ?? false,
      regionKnown: region !== null,
    });

    // Every attempt is traced, not just the last: a gate that keeps firing across
    // rewrites is a prompt problem, and the trace is what lets Hermes see it.
    await recordTraces(conversation.id, gates.traces);

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
      updated_at: new Date().toISOString(),
    }),
  });

  // Opt-out: the one veto that is never rewritten and never answered.
  if (outcome.kind === "stop") {
    await Promise.all([
      recordOutcome(conversation.id, "stopped", "opt-out detectado pela cadeia", rewritesUsed, spent - spentBefore),
      persistStage(conversation.id, storedStage, "bloqueado"),
    ]);
    return json(200, { status: "stopped", costBrl: spent });
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

  const gaveUp = await retryGaveUp(rewritesUsed);
  if (gaveUp) return gaveUp;

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
      fallbackReason ?? (checkoutUrl && linkFact && replyText.includes(checkoutUrl) ? `link — ${linkFact}` : null),
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
    linkFact: checkoutUrl && replyText.includes(checkoutUrl) ? linkFact : null,
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
};
