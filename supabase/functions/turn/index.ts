/**
 * One conversation turn, end to end — plus the cron sweep of the follow-up rulers.
 *
 * The n8n webhook posts an inbound message here; this function owns everything that
 * decides what goes back: dedupe, persistence, the cost ceiling, the two model calls
 * and the eleven guardrails. A second entry point, { job: "followups" }, is the clock
 * half: it sweeps due touches, renders them deterministically and gates them the same
 * way. n8n stays the pipe and the clock.
 *
 * Auth is the project's service_role JWT in the Authorization header — the same key
 * n8n holds in its credential.
 */
import { classifyOptOut, runGates, type GateConfig } from "./guardrails.ts";
import {
  renderFollowup,
  scheduleSilence,
  type FollowupKind,
  type StopPoint,
} from "./followups.ts";
import { extractDressSize, sizeFromDressSize } from "./sizing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const USD_TO_BRL = Number(Deno.env.get("USD_TO_BRL") ?? "5.4");

const CONVERSATION_MODEL = "gpt-5.6-luna";
const CHEAP_MODEL = "gemini-3.5-flash-lite";
/** USD per 1M tokens. Mirrors src/llm/pricing.ts. */
const PRICES: Record<string, { in: number; out: number; cached?: number }> = {
  [CONVERSATION_MODEL]: { in: 0.2, out: 1.2, cached: 0.02 },
  [CHEAP_MODEL]: { in: 0.3, out: 2.5 },
};

interface BusinessConfig extends GateConfig {
  brand: string;
  agentName: string;
  delivery: { codDaysMin: number; codDaysMax: number; warrantyDays: number };
  cost: { conversationCapBrl: number; overrunTolerance: number };
}

const CONFIG: BusinessConfig = JSON.parse(
  Deno.env.get("BUSINESS_CONFIG") ??
    JSON.stringify({
      brand: "Encorpa",
      agentName: "Malu",
      prices: { codBrl: 129.9, prepayBrl: 110.42, prepayDiscountPercent: 15, anchorBrl: 216.5 },
      delivery: { codDaysMin: 3, codDaysMax: 5, warrantyDays: 7 },
      hours: { openHour: 6, closeHour: 24 },
      cost: { conversationCapBrl: 0.8, overrunTolerance: 0.25 },
      coupon: { percent: 20, active: false },
      cod: { physicalOnDeliveryActive: true },
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
  return +(usd * USD_TO_BRL).toFixed(6);
};

const callGemini = async (system: string, user: string) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  return {
    text,
    costBrl: costOf(CHEAP_MODEL, usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0),
  };
};

const callLuna = async (
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) => {
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
  return {
    text: text as string,
    costBrl: costOf(
      CONVERSATION_MODEL,
      usage.prompt_tokens ?? 0,
      usage.completion_tokens ?? 0,
      usage.prompt_tokens_details?.cached_tokens ?? 0,
    ),
  };
};

const systemPrompt = (sizeDirective: string | null): string => {
  const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  return [
    `Você é a ${CONFIG.agentName}, assistente de vendas da ${CONFIG.brand}. Fala em PT-BR, com`,
    `calor e sem jargão de marketing. Nunca afirma ser uma pessoa; se perguntarem, diz que é a`,
    `assistente virtual da marca e oferece chamar alguém do time.`,
    ``,
    `O produto é o Colete Cinta Modeladora. Ele modela enquanto está vestido e muda como a roupa`,
    `cai — NÃO emagrece, e o efeito acaba ao tirar. Diga isso quando o assunto chegar perto.`,
    ``,
    `Preço: ${money(CONFIG.prices.codBrl)} com frete incluído, pago na entrega ao entregador,`,
    `em dinheiro ou cartão. Entrega em ${CONFIG.delivery.codDaysMin} a ${CONFIG.delivery.codDaysMax}`,
    `dias, agendada. Nunca prometa prazo menor. ${CONFIG.delivery.warrantyDays} dias para trocar`,
    `ou devolver. Quem prefere pagar antes leva ${CONFIG.prices.prepayDiscountPercent}% de desconto`,
    `(${money(CONFIG.prices.prepayBrl)}), e aí o frete é calculado à parte no checkout — as duas`,
    `metades saem na mesma frase.`,
    ``,
    `Tamanhos P, M, G, GG, XGG por cintura: 60-68, 68-76, 76-84, 84-92, 92-100 cm. Não exija fita`,
    `métrica: pergunte o manequim. Nunca calcule o tamanho por conta própria a partir do`,
    `manequim — isso é decidido por uma tabela determinística fora do seu controle.`,
    ``,
    `Responda em no máximo 45 palavras, uma pergunta por vez.`,
    ...(sizeDirective ? ["", sizeDirective] : []),
  ].join(" ");
};

/**
 * R8.4: the model must never compute size from a dress size on its own — a real
 * conversation had it say G for manequim 42, when the deterministic table says M,
 * and a wrong size becomes a COD return (pure loss). When the customer's message
 * names a plausible manequim, resolve it here and hand the model the answer as a
 * fact to state, not a number to reason about.
 */
const statedSize = (message: string): { manequim: number; size: string } | null => {
  const manequim = extractDressSize(message);
  return manequim === null ? null : { manequim, size: sizeFromDressSize(manequim) };
};

const sizeDirectiveFor = (stated: { manequim: number; size: string } | null): string | null =>
  stated === null
    ? null
    : `A cliente informou manequim ${stated.manequim}. O tamanho correto é ${stated.size} —` +
      ` isto já foi calculado pela tabela determinística da loja, não recalcule nem escolha` +
      ` outro. Diga esse tamanho.`;

/** She answered — every pending touch for this conversation is moot. */
const cancelScheduled = (conversationId: string) =>
  db(`followups?conversation_id=eq.${conversationId}&status=eq.scheduled`, {
    method: "PATCH",
    body: JSON.stringify({ status: "canceled" }),
  }).catch(() => undefined);

/** Where she stopped decides what the first touch says. */
const stopPointOf = (replyText: string): StopPoint => {
  const t = replyText.toLowerCase();
  if (t.includes("checkout") || t.includes("link")) return "link_sent";
  if (t.includes("129,90") || t.includes("110,42")) return "after_price";
  return "before_size";
};

const scheduleSilenceTouches = async (conversationId: string, stopPoint: StopPoint) => {
  await cancelScheduled(conversationId);
  const rows = scheduleSilence(new Date()).map((f) => ({
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
const runFollowupSweep = async () => {
  const due = await db(
    "followups?status=eq.scheduled&run_at=lte." +
      encodeURIComponent(new Date().toISOString()) +
      "&select=id,kind,stop_point,conversation_id,conversations(id,lead_id,leads(id,phone,size,opted_out_at,handoff_at))&limit=50",
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
    });

    // The coupon touch stays silent until the coupon exists in Coinzz.
    if (text === null) {
      await mark("canceled");
      skipped.push({ followupId: row.id, reason: "cupom ainda não existe" });
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
      await mark("canceled");
      skipped.push({
        followupId: row.id,
        reason: gates.traces.find((t) => t.verdict === "block")?.detail ?? "guardrail",
      });
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

  let payload: { job?: string; externalId?: string; from?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "corpo não é JSON" });
  }

  // The cron half: sweep the follow-up rulers. Deterministic, no model call.
  if (payload.job === "followups") return json(200, await runFollowupSweep());

  const inbound = payload as { externalId: string; from: string; body: string };
  if (!inbound.externalId || !inbound.from) {
    return json(400, { error: "externalId e from são obrigatórios" });
  }

  // 1. Idempotency: the same channel event never becomes two turns.
  const seen = await db(`messages?external_id=eq.${encodeURIComponent(inbound.externalId)}&select=id`);
  if (seen?.length) return json(200, { status: "duplicate" });

  // 2. Lead and conversation.
  const existing = await db(`leads?phone=eq.${encodeURIComponent(inbound.from)}&select=*`);
  const lead =
    existing?.[0] ??
    (await db("leads", { method: "POST", body: JSON.stringify({ phone: inbound.from }) }))[0];

  const openConversations = await db(
    `conversations?lead_id=eq.${lead.id}&closed_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  const conversation =
    openConversations?.[0] ??
    (await db("conversations", { method: "POST", body: JSON.stringify({ lead_id: lead.id }) }))[0];

  await db("messages", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversation.id,
      direction: "inbound",
      body: inbound.body ?? "",
      external_id: inbound.externalId,
    }),
  });

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
    return json(200, { status: "opted_out" });
  }
  if (lead.opted_out_at) return json(200, { status: "already_opted_out" });

  // 4. The ceiling is checked before a byte leaves for any provider.
  let spent = Number(conversation.cost_brl ?? 0);
  if (spent >= ceilingBrl) {
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });
    return json(200, { status: "handoff", reason: "teto de custo da conversa" });
  }

  // 5. Cheap model first: intent is 20 calls a conversation and needs no talent.
  const intent = await callGemini(
    "Classifique a intenção da cliente em uma palavra: PRECO, TAMANHO, DUVIDA, COMPRA, OBJECAO, OUTRO.",
    inbound.body ?? "",
  );
  spent += intent.costBrl;
  await db("llm_calls", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversation.id,
      purpose: "intent",
      provider: "google",
      model: CHEAP_MODEL,
      cost_brl: intent.costBrl,
    }),
  });

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

  // 6. History, then the turn that sells.
  const history = await db(
    `messages?conversation_id=eq.${conversation.id}&select=direction,body&order=created_at.asc&limit=20`,
  );
  const reply = await callLuna(
    systemPrompt(sizeDirectiveFor(stated)),
    (history ?? []).map((m: { direction: string; body: string }) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.body ?? "",
    })),
  );
  spent += reply.costBrl;
  await db("llm_calls", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversation.id,
      purpose: "reply",
      provider: "openai",
      model: CONVERSATION_MODEL,
      cost_brl: reply.costBrl,
    }),
  });

  // 7. Nothing reaches the customer without the chain.
  const gates = runGates(reply.text, {
    config: CONFIG,
    layer: "agent",
    optedOut: false,
    now: new Date(),
    paymentPath: "cod",
  });

  const traces = gates.traces.map((t) => ({
    conversation_id: conversation.id,
    gate: t.gate,
    verdict: t.verdict,
    detail: t.detail ?? null,
  }));
  await db("gate_traces", { method: "POST", body: JSON.stringify(traces) });

  await db(`conversations?id=eq.${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      cost_brl: spent,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!gates.allowed) {
    // A blocked reply is a handoff, not a silent degradation. The text is returned
    // so the operator can see what was vetoed instead of guessing.
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    });
    return json(200, {
      status: "blocked",
      intent: intent.text,
      blockedText: reply.text,
      blocked: gates.traces.filter((t) => t.verdict === "block"),
      costBrl: spent,
    });
  }

  const outbound = (
    await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "outbound",
        body: reply.text,
      }),
    })
  )[0];

  await db(`conversations?id=eq.${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_outbound_at: new Date().toISOString() }),
  });

  // The silence ruler starts the moment the agent finishes speaking.
  await scheduleSilenceTouches(conversation.id, stopPointOf(reply.text));

  return json(200, {
    status: "ok",
    intent: intent.text,
    reply: reply.text,
    messageId: outbound.id,
    costBrl: spent,
    ceilingBrl,
  });
});
