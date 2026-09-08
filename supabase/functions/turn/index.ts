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
  remedyFor,
  runGates,
  wantsHuman,
  type GateConfig,
} from "./guardrails.ts";
import {
  decideTouch,
  nextOpening,
  renderFollowup,
  scheduleSilence,
  type FollowupKind,
  type StopPoint,
} from "./followups.ts";
import { extractDressSize, sizeFromDressSize } from "./sizing.ts";
import {
  confirmsAddress,
  extractAddress,
  isComplete,
  mergeAddress,
  nextQuestion,
  renderConfirmation,
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
  decideNext,
  HOLDING_REPLY,
  HUMAN_HANDOFF_REPLY,
  type NextAction,
} from "./retry.ts";

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
  /** Where the handoff alert goes while there is no WhatsApp number (R9.2). */
  handoff?: { email: string };
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
      prices: { codBrl: 129.9, prepayBrl: 110.42, prepayDiscountPercent: 15, anchorBrl: 216.5 },
      delivery: { codDaysMin: 3, codDaysMax: 5, warrantyDays: 7 },
      hours: { openHour: 6, closeHour: 24 },
      cost: { conversationCapBrl: 0.8, overrunTolerance: 0.25 },
      coupon: { percent: 20, active: false },
      cod: { physicalOnDeliveryActive: true },
      // Urgência ligada pelo operador em 2026-09-08. `unitsLeft` dá a ela um número
      // estável para repetir; `allowUnverified` deixa ela criar urgência sobre o lote
      // mesmo sem contagem por trás. Trocar aqui, ou sobrescrever por BUSINESS_CONFIG.
      scarcity: { unitsLeft: 12, allowUnverified: true },
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
 * What the agent is allowed to say about urgency, decided by config rather than by the
 * model's instincts. Three settings, and the difference between them is who is
 * accountable for the number:
 *
 * - a declared count or deadline: the shop's number, and she repeats it;
 * - `allowUnverified`: the operator has decided she may create urgency without one;
 * - neither: she says nothing about stock or deadlines at all.
 *
 * Even in the middle case she is pushed toward one stable line rather than a fresh
 * number per conversation — the same claim all day reads as real, and a different one
 * every time is what the customer with the screenshot notices.
 */
const scarcityBriefing = (): string[] => {
  const s = CONFIG.scarcity;
  const lines: string[] = [];
  if (s?.unitsLeft !== undefined && s?.unitsLeft !== null) {
    lines.push(`URGÊNCIA REAL: restam ${s.unitsLeft} unidades. Use esse número, e nenhum outro.`);
  }
  if (s?.offerEndsAt) {
    lines.push(`PRAZO REAL: a condição atual termina em ${s.offerEndsAt}. Pode dizer que acaba.`);
  }
  if (lines.length === 0 && s?.allowUnverified) {
    lines.push(
      `URGÊNCIA: use senso de urgência sobre o lote acabando quando ela estiver em cima do`,
      `muro — é uma das suas ferramentas mais fortes e você tem liberdade com ela. Duas`,
      `bordas: não prometa contagem regressiva em minutos, e nunca use urgência para empurrar`,
      `tamanho errado. Peça que não serve volta, e devolução custa mais que a venda vale.`,
    );
  }
  if (lines.length === 0) {
    lines.push(`URGÊNCIA: não cite estoque nem prazo — a loja não te deu nenhum número.`);
  }
  return ["", ...lines];
};

const systemPrompt = (
  sizeDirective: string | null,
  addressDirective: string | null = null,
  identityDirective: string | null = null,
): string => {
  const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  return [
    `Você é a ${CONFIG.agentName}, assistente de vendas da ${CONFIG.brand}. Fala em PT-BR, com`,
    `calor e sem jargão de marketing. Nunca afirma ser uma pessoa; se perguntarem, diz que é a`,
    `assistente virtual da marca e oferece chamar alguém do time.`,
    ``,
    `QUEM ESTÁ DO OUTRO LADO. Na maioria das vezes é uma mulher que deixou de usar uma roupa`,
    `que ela ama porque não se sentiu bem nela. Ela não quer virar outra pessoa: quer se olhar`,
    `no espelho e gostar do que vê, hoje, com a roupa que já está no armário. Fale com esse`,
    `desejo, com carinho e sem pena — nunca aponte defeito, nunca diga que ela "precisa"`,
    `mudar, nunca sugira que ela está errada do jeito que é. O que muda é o caimento da roupa,`,
    `não o valor dela.`,
    ``,
    `COMO ISSO VIRA FRASE. Prefira a cena concreta ao adjetivo: o vestido que voltou a fechar`,
    `bonito, a foto da festa em que ela gostou de se ver, a camisa branca sem marcar. Uma`,
    `imagem específica vende mais que "fique linda", e é verdade — a peça faz exatamente isso.`,
    ``,
    `VOCÊ É VENDEDORA, E É BOA NISSO. Use o que funciona, na hora que você julgar certo:`,
    `— **Ancoragem:** o preço cheio publicado é ${money(CONFIG.prices.anchorBrl)}. Diga de onde`,
    `  ela está saindo antes de dizer onde chega.`,
    `— **Reversão de risco:** ela não paga nada agora e tem ${CONFIG.delivery.warrantyDays} dias`,
    `  pra devolver. É o seu argumento mais forte — repita com palavras novas, nunca iguais.`,
    `— **Antecipe a objeção:** diga "você deve estar pensando que..." antes que ela pense.`,
    `  Objeção nomeada por você perde metade da força.`,
    `— **Feche por escolha, não por sim ou não:** "prefere pagar na entrega ou antecipado?"`,
    `  converte mais que "quer comprar?".`,
    `— **Espelhe:** use as palavras dela. Se ela disse "barriguinha", não corrija para`,
    `  "abdômen". Se ela disse o nome da festa, use o nome da festa.`,
    `— **Uma pergunta viva no fim:** conversa que termina em ponto final morre.`,
    ``,
    `Você tem liberdade de estilo, de ordem e de ritmo. Ninguém escreveu um roteiro pra você`,
    `seguir palavra por palavra — improvise, seja engraçada, seja direta, mude de ângulo se o`,
    `primeiro não pegou.`,
    ``,
    `O produto é o Colete Cinta Modeladora. Ele modela enquanto está vestido e muda como a roupa`,
    `cai — NÃO emagrece, e o efeito acaba ao tirar. Diga isso quando o assunto chegar perto.`,
    `Essa honestidade é argumento de venda, não ressalva: ela já foi enganada por promessa de`,
    `emagrecimento e reconhece quem não mente.`,
    ``,
    `Preço: ${money(CONFIG.prices.codBrl)} com frete incluído, pago na entrega ao entregador,`,
    `em dinheiro ou cartão. Entrega em ${CONFIG.delivery.codDaysMin} a ${CONFIG.delivery.codDaysMax}`,
    `dias, agendada. Nunca prometa prazo menor. ${CONFIG.delivery.warrantyDays} dias para trocar`,
    `ou devolver. Quem prefere pagar antes leva ${CONFIG.prices.prepayDiscountPercent}% de desconto`,
    `(${money(CONFIG.prices.prepayBrl)}), e aí o frete é calculado à parte no checkout — as duas`,
    `metades saem na mesma frase.`,
    ``,
    `Tamanhos P, M, G, GG, XGG por cintura: 60-68, 68-76, 76-84, 84-92, 92-100 cm. Não peça fita`,
    `métrica nem medida em centímetros. A palavra "manequim" confunde: pergunte com palavra`,
    `simples, "que tamanho de calça você usa?", e aceite tanto número (38, 42, 46) quanto`,
    `letra (P, M, G). Nunca converta esse tamanho por conta própria — quem faz isso é uma`,
    `tabela determinística fora do seu controle, e ela te entrega o resultado pronto.`,
    ``,
    `AS TRÊS COISAS QUE VOCÊ NUNCA INVENTA — e o motivo é dinheiro, não formalidade. Cada uma`,
    `delas vira recusa na porta, e no pagamento na entrega a recusa custa o frete inteiro:`,
    `1. **Emagrecimento.** A peça modela vestida; não muda o corpo. Prometer isso traz uma`,
    `   cliente que devolve — e, pior, que conta pra todo mundo que foi enganada.`,
    `2. **Preço, desconto ou cupom que não existem.** Os números são os daqui, e só.`,
    `3. **Estoque ou prazo**, do jeito que a loja mandar — ver o bloco de urgência abaixo.`,
    ``,
    `Fora dessas, o campo é seu.`,
    ...scarcityBriefing(),
    ...(CONFIG.testimonials?.length
      ? [
          `DEPOIMENTOS REAIS que você pode citar entre aspas, palavra por palavra, sem inventar`,
          `outros: ${CONFIG.testimonials.map((t) => `"${t}"`).join(" ")}`,
        ]
      : []),
    ``,
    `TAMANHO DA RESPOSTA. Curta por padrão — duas ou três frases resolvem quase tudo no`,
    `WhatsApp. Quando o momento pedir (a objeção grande, a hora de fechar, a mulher que`,
    `contou uma história), use o espaço que precisar: até uns três parágrafos curtos, com`,
    `quebra de linha. Melhor uma mensagem que convence do que três que ela não lê.`,
    ...(sizeDirective ? ["", sizeDirective] : []),
    ...(addressDirective ? ["", addressDirective] : []),
    ...(identityDirective ? ["", identityDirective] : []),
  ].join(" ");
};

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

const sizeDirectiveFor = (stated: { stated: number; size: string } | null): string | null =>
  stated === null
    ? null
    : `A cliente disse que usa tamanho ${stated.stated} de roupa. O colete dela é o` +
      ` ${stated.size} — a tabela da loja já resolveu isso, não recalcule nem escolha outro.` +
      ` Diga esse tamanho com palavra simples, sem usar "manequim".`;

/**
 * The address loop (§D2/§D5), which is the half of the sale that was missing.
 *
 * She rarely says the whole address at once, so it accumulates across turns. What is
 * still unknown becomes one question — one, not a form. When nothing is missing, the
 * address is read back to her and nothing is ordered until she says it is right: a
 * package sent to an address nobody checked is the failed delivery this whole module
 * exists to avoid, and under cash on delivery that is the freight, lost both ways.
 *
 * The directive is handed to the model as a fact plus an instruction, the same shape
 * the size directive uses — the model writes the sentence, the code decides what it says.
 */
const addressDirectiveFor = (
  draft: Partial<Address>,
  confirmed: boolean,
): string | null => {
  if (confirmed) {
    return `O endereço dela já está confirmado. Não peça de novo, não repita de volta: siga` +
      ` para fechar o pedido.`;
  }
  if (isComplete(draft)) {
    return `O endereço dela está completo mas AINDA NÃO foi confirmado. Antes de qualquer` +
      ` pedido, repita exatamente isto de volta para ela, em linhas separadas, e pergunte se` +
      ` está certo:\n${renderConfirmation(draft)}`;
  }
  const missing = (["cep", "street", "number", "neighborhood", "city", "state"] as const).filter(
    (f) => !draft[f],
  );
  if (missing.length === 0 || Object.keys(draft).length === 0) return null;
  const ask = nextQuestion(missing);
  return ask === null
    ? null
    : `Você já anotou parte do endereço dela. Falta: ${missing.join(", ")}. Pergunte SÓ a` +
      ` próxima coisa que falta, com esta pergunta: "${ask}" — uma de cada vez, nunca a lista toda.`;
};

/**
 * Name, e-mail and CPF — what the Coinzz order requires and the conversation never
 * asked for. Same loop as the address, and one question at a time for the same reason:
 * a form in a WhatsApp message is where a sale stops.
 *
 * The order matters. Name first, because she gives it without thinking. CPF last,
 * because it is the one that makes people hesitate — and by then she has already put
 * her address in, which is the moment she is least likely to walk away.
 */
const identityDirectiveFor = (draft: Partial<Identity>): string | null => {
  if (isIdentityComplete(draft)) return null;
  const missing = (["name", "email", "document"] as const).filter((f) => !draft[f]);
  const ask = nextIdentityQuestion(missing);
  return ask === null
    ? null
    : `Para fechar o pedido ainda falta: ${missing.join(", ")}. Pergunte SÓ isto agora,` +
      ` com naturalidade: "${ask}". Uma coisa de cada vez — nunca peça a lista inteira.`;
};

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

    return json(200, {
      status: "handoff",
      reason: "a cliente pediu para falar com uma pessoa",
      reply: receipt.allowed ? HUMAN_HANDOFF_REPLY : null,
      blocked: receipt.traces.filter((t) => t.verdict === "block"),
      messageId: asked?.id ?? null,
      ...notification(lead, conversation),
      costBrl: Number(conversation.cost_brl ?? 0),
    });
  }

  // 4. The ceiling is checked before a byte leaves for any provider.
  let spent = Number(conversation.cost_brl ?? 0);
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
    return json(200, {
      status: "handoff",
      reason: "teto de custo da conversa",
      reply: HOLDING_REPLY,
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
    await db(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ handoff_at: new Date().toISOString() }),
    }).catch(() => undefined);
    const held = await db("messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: "outbound",
        body: HOLDING_REPLY,
      }),
    }).catch(() => null);
    return json(200, {
      status: "handoff",
      reason: "falha ao chamar o modelo",
      detail: error instanceof Error ? error.message : String(error),
      reply: HOLDING_REPLY,
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

  const foundAddress = extractAddress(inbound.body ?? "");
  if (Object.keys(foundAddress.fields).length > 0) {
    // What she stated wins over what a previous pass inferred, and a new piece never
    // silently re-confirms an address she has not seen read back.
    addressDraft = mergeAddress(addressDraft, foundAddress.fields).fields;
    addressConfirmed = false;
  } else if (!addressConfirmed && isComplete(addressDraft) && confirmsAddress(inbound.body ?? "")) {
    addressConfirmed = true;
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

  // 6. History, then the turn that sells.
  const history = await db(
    `messages?conversation_id=eq.${conversation.id}&select=direction,body&order=created_at.asc&limit=20`,
  );
  const turns = (history ?? []).map((m: { direction: string; body: string }) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body ?? "",
  }));

  // The `identical_template` gate was in the chain and had nothing to compare against:
  // nobody ever passed `recentOutbound`, so it passed by construction on every message
  // the agent ever sent. The history is already here, so the check costs one map.
  const recentOutbound = (history ?? [])
    .filter((m: { direction: string }) => m.direction === "outbound")
    .map((m: { body: string }) => (m.body ?? "").trim());

  const addressDirective = addressDirectiveFor(addressDraft, addressConfirmed);

  // Identity is only asked for once the address is confirmed. Asking for a CPF before
  // she has decided to buy is the fastest way to end a conversation.
  const identityDirective =
    addressConfirmed && isComplete(addressDraft) ? identityDirectiveFor(identityDraft) : null;

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
      attempt = await callLuna(
        // The correction rides in the system prompt, so the vetoed text never enters
        // the conversation history the customer's next turn is built from.
        correction === null
          ? systemPrompt(sizeDirectiveFor(stated), addressDirective, identityDirective)
          : `${systemPrompt(sizeDirectiveFor(stated), addressDirective, identityDirective)} ${correction}`,
        turns,
      );
    } catch (error) {
      return await modelFailure(error);
    }
    spent += attempt.costBrl;
    await recordCall(
      conversation.id,
      rewritesUsed === 0 ? "reply" : "rewrite",
      "openai",
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

    return json(200, {
      status: "handoff",
      reason,
      intent: intent.text,
      reply: HOLDING_REPLY,
      messageId: holding.id,
      rewrites: rewritesUsed,
      blockedText: attempt.text,
      blocked: gates.traces.filter((t) => t.verdict === "block"),
      ...notification(lead, conversation),
      costBrl: spent,
    });
  }

  const reply = attempt;

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
    rewrites: rewritesUsed,
    // Where the sale actually stands. `addressReady` is the gate on creating an order:
    // complete is not enough, she has to have confirmed the read-back.
    size: stated?.size ?? lead.size ?? null,
    addressReady: addressConfirmed && isComplete(addressDraft),
    // O sinal que o n8n espera para chamar a Coinzz: endereço confirmado por ela,
    // identidade completa e tamanho resolvido. Faltando um, o pedido não nasce.
    orderReady:
      addressConfirmed && isComplete(addressDraft) && isIdentityComplete(identityDraft) &&
      Boolean(stated?.size ?? lead.size),
    identityMissing: (["name", "email", "document"] as const).filter((f) => !identityDraft[f]),
    addressMissing: isComplete(addressDraft) ? [] : extractAddress("").missing.filter((f) => !addressDraft[f]),
    costBrl: spent,
    ceilingBrl,
  });
});
