/**
 * A conversation, run end to end, without a model.
 *
 * This mirrors the decision flow of `supabase/functions/turn/index.ts` — the order the
 * turn checks things in, what it persists, when it hands off, when it schedules the
 * rulers — with the two model calls replaced by whatever the scenario says the model
 * would have written. Everything else is the real code: the real chain, the real size
 * table, the real address reader, the real remedy ladder.
 *
 * Why it exists: single messages proved the gates, and a gate is not the product. What
 * breaks a sale is the fourth turn, not the first — the size she stated two messages
 * ago that got overwritten, the handoff that did not stop the follow-ups, the ceiling
 * that was crossed mid-conversation. None of that is visible one message at a time.
 *
 * Where it must stay honest: if the turn handler changes shape, this changes with it,
 * or it starts proving something production does not do. That is the standing risk of
 * a simulator, and it is worth it — the alternative is 300 conversations nobody runs.
 */
import {
  asksWhatSheIs,
  classifyOptOut,
  remedyFor,
  runGates,
  wantsHuman,
  type GateConfig,
} from "../agent/guardrails.js";
import { extractDressSize, sizeFromDressSize } from "../agent/sizing.js";
import { confirmsAddress, extractAddress, isComplete, mergeAddress, type Address } from "../agent/address.js";
import { extractIdentity, isIdentityComplete, mergeIdentity, type Identity } from "../agent/identity.js";
import {
  decideNext,
  HOLDING_REPLY,
  HUMAN_HANDOFF_REPLY,
  SAFE_FALLBACK_REPLY,
} from "../agent/retry.js";
import { scheduleSilence } from "../agent/followups.js";
import { canTransition, type Stage } from "../agent/state-machine.js";

/** What the model would have written for this turn, and what it costs to write it. */
export interface TurnScript {
  /** What the customer sends. */
  from: string;
  /**
   * The reply the model produces. A scenario that omits it gets a safe canned line —
   * most turns are not about the reply, they are about what the turn does around it.
   */
  reply?: string;
  /**
   * A first attempt the chain must veto, so the rewrite loop actually runs. The
   * `reply` above is then what the model writes on the second attempt.
   */
  vetoedFirst?: string;
}

export interface TurnOutcome {
  status:
    | "ok"
    /** The rewrite did not pass; she got the safe reply and the agent kept the conversation. */
    | "fallback"
    | "deferred"
    | "handoff"
    | "stopped"
    | "opted_out"
    | "already_opted_out"
    | "already_handed_off";
  reply: string | null;
  rewrites: number;
  blocked: string[];
}

export interface ConversationState {
  size: string | null;
  address: Partial<Address>;
  addressComplete: boolean;
  /** Complete is not enough: she has to have said the read-back is right. */
  addressConfirmed: boolean;
  identity: Partial<Identity>;
  identityComplete: boolean;
  /**
   * O sinal do caminho vigente: com nome, e-mail e CPF a agente já pode mandar o link, e
   * o resto — endereço, tamanho, dia — acontece dentro do checkout. `orderReady` continua
   * ao lado dele, exigindo endereço confirmado, porque é o sinal do caminho por API, que
   * ainda não está ligado.
   */
  checkoutReady: boolean;
  /** Everything the order needs is in hand: size, confirmed address, identity. */
  orderReady: boolean;
  optedOut: boolean;
  handoff: boolean;
  handoffReason: string | null;
  stage: Stage;
  costBrl: number;
  /** Outbound messages that actually reached the customer. */
  sent: string[];
  scheduledTouches: number;
  rewrites: number;
  outcomes: TurnOutcome[];
}

const SAFE_REPLY = "Claro! Me conta o que você quer saber que eu te explico 💛";

/** Flat per-call cost, close to what production measures (~R$ 0,001 a completed turn). */
const COST_PER_CALL = 0.001;

export interface EngineOptions {
  config: GateConfig & { cost: { conversationCapBrl: number; overrunTolerance: number } };
  now: Date;
}

/**
 * Runs one conversation. Each customer message is a turn, in order, and the state
 * carried between them is the state production carries in `leads` and `conversations`.
 */
export const runConversation = (turns: readonly TurnScript[], options: EngineOptions): ConversationState => {
  const { config, now } = options;
  const ceilingBrl = config.cost.conversationCapBrl * (1 + config.cost.overrunTolerance);

  const state: ConversationState = {
    size: null,
    address: {},
    addressComplete: false,
    addressConfirmed: false,
    identity: {},
    identityComplete: false,
    checkoutReady: false,
    orderReady: false,
    optedOut: false,
    handoff: false,
    handoffReason: null,
    stage: "novo",
    costBrl: 0,
    sent: [],
    scheduledTouches: 0,
    rewrites: 0,
    outcomes: [],
  };

  const advance = (to: Stage) => {
    if (canTransition(state.stage, to)) state.stage = to;
  };

  const send = (text: string) => {
    state.sent.push(text);
    // The silence ruler starts the moment the agent finishes speaking, and it replaces
    // whatever was pending — the same cancel-then-upsert the handler does.
    state.scheduledTouches = scheduleSilence(now).length;
  };

  const record = (o: TurnOutcome) => {
    state.outcomes.push(o);
    state.rewrites += o.rewrites;
  };

  for (const turn of turns) {
    // She answered: every touch waiting on her silence is moot.
    state.scheduledTouches = 0;

    // 1. Opt-out is irrevocable and costs nothing to check.
    if (state.optedOut) {
      record({ status: "already_opted_out", reply: null, rewrites: 0, blocked: [] });
      continue;
    }
    if (classifyOptOut(turn.from) === "explicit") {
      state.optedOut = true;
      advance("bloqueado");
      record({ status: "opted_out", reply: null, rewrites: 0, blocked: [] });
      continue;
    }

    // 2. A conversation handed to a person stays with that person.
    if (state.handoff) {
      record({ status: "already_handed_off", reply: null, rewrites: 0, blocked: [] });
      continue;
    }

    // 3. She asked for a person (§Q12) — deterministic, before any model call.
    if (wantsHuman(turn.from)) {
      state.handoff = true;
      state.handoffReason = "a cliente pediu para falar com uma pessoa";
      const receipt = runGates(HUMAN_HANDOFF_REPLY, {
        config,
        layer: "auto",
        optedOut: false,
        now,
        paymentPath: "cod",
      });
      if (receipt.allowed) send(HUMAN_HANDOFF_REPLY);
      // The handoff cancels the rulers: a person owns the conversation now.
      state.scheduledTouches = 0;
      record({
        status: "handoff",
        reply: receipt.allowed ? HUMAN_HANDOFF_REPLY : null,
        rewrites: 0,
        blocked: receipt.traces.filter((t) => t.verdict === "block").map((t) => t.gate),
      });
      continue;
    }

    // 4. The ceiling is checked before a byte leaves for any provider.
    if (state.costBrl >= ceilingBrl) {
      state.handoff = true;
      state.handoffReason = "teto de custo da conversa";
      send(HOLDING_REPLY);
      state.scheduledTouches = 0;
      record({ status: "handoff", reply: HOLDING_REPLY, rewrites: 0, blocked: [] });
      continue;
    }

    // 5. The cheap classification call happens whatever else the turn decides.
    state.costBrl += COST_PER_CALL;

    // 5b. A size she stated is worth keeping. What counts as stated is decided by the
    // text, not by the classifier — and a later message never silently unsets it.
    const stated = extractDressSize(turn.from);
    if (stated !== null) {
      state.size = sizeFromDressSize(stated);
      advance("conversando");
      advance("tamanho_definido");
    }

    // 5c. Address accumulates across turns: she rarely says all of it at once, and a
    // new piece un-confirms whatever she had confirmed before — she has not seen the
    // corrected version read back yet.
    const found = extractAddress(turn.from);
    if (Object.keys(found.fields).length > 0) {
      const merged = mergeAddress(state.address, found.fields);
      state.address = merged.fields;
      state.addressComplete = isComplete(merged.fields);
      state.addressConfirmed = false;
    } else if (!state.addressConfirmed && state.addressComplete && confirmsAddress(turn.from)) {
      state.addressConfirmed = true;
      advance("conversando");
      advance("tamanho_definido");
      advance("endereco_coletado");
    }
    advance("conversando");

    // 5d. Identity accumulates the same way the address does.
    const foundIdentity = extractIdentity(turn.from);
    if (Object.keys(foundIdentity.fields).length > 0) {
      state.identity = mergeIdentity(state.identity, foundIdentity.fields).fields;
      state.identityComplete = isIdentityComplete(state.identity);
    }
    state.checkoutReady = state.identityComplete;
    state.orderReady =
      state.addressConfirmed && state.addressComplete && state.identityComplete && state.size !== null;

    // 6. The reply, and the chain around it.
    let candidate = turn.vetoedFirst ?? turn.reply ?? SAFE_REPLY;
    let rewrites = 0;
    let gates = runGates(candidate, {
      config,
      layer: "agent",
      optedOut: false,
      now,
      paymentPath: "cod",
      recentOutbound: state.sent,
      askedIdentity: asksWhatSheIs(turn.from),
    });
    state.costBrl += COST_PER_CALL;

    let action = decideNext({
      remedy: remedyFor(gates),
      rewritesUsed: rewrites,
      spentBrl: state.costBrl,
      ceilingBrl,
      reasons: gates.traces.filter((t) => t.verdict === "block").map((t) => t.detail ?? t.gate),
      vetoedText: candidate,
    });

    while (action.kind === "rewrite") {
      rewrites += 1;
      // The rewrite is the corrected text the scenario supplies; a scenario that does
      // not supply one keeps failing, which is what exhausts the attempts on purpose.
      candidate = turn.reply ?? candidate;
      state.costBrl += COST_PER_CALL;
      gates = runGates(candidate, {
        config,
        layer: "agent",
        optedOut: false,
        now,
        paymentPath: "cod",
        recentOutbound: state.sent,
        askedIdentity: asksWhatSheIs(turn.from),
      });
      action = decideNext({
        remedy: remedyFor(gates),
        rewritesUsed: rewrites,
        spentBrl: state.costBrl,
        ceilingBrl,
        reasons: gates.traces.filter((t) => t.verdict === "block").map((t) => t.detail ?? t.gate),
        vetoedText: candidate,
      });
    }

    const blocked = gates.traces.filter((t) => t.verdict === "block").map((t) => t.gate);

    if (action.kind === "stop") {
      record({ status: "stopped", reply: null, rewrites, blocked });
      continue;
    }
    if (action.kind === "defer") {
      // Held for the window to reopen. Nothing goes out now, and the rulers wait too.
      record({ status: "deferred", reply: null, rewrites, blocked });
      continue;
    }
    if (action.kind === "handoff") {
      state.handoff = true;
      state.handoffReason = action.reason;
      send(HOLDING_REPLY);
      state.scheduledTouches = 0;
      record({ status: "handoff", reply: HOLDING_REPLY, rewrites, blocked });
      continue;
    }

    // The rewrite did not pass. She still gets a real answer with a live question in it,
    // and nobody is called: a reply the agent phrased badly was never her problem. The
    // rulers are armed as on any other turn, because the conversation is still running.
    if (action.kind === "fallback") {
      send(SAFE_FALLBACK_REPLY);
      record({ status: "fallback", reply: SAFE_FALLBACK_REPLY, rewrites, blocked });
      continue;
    }

    send(candidate);
    record({ status: "ok", reply: candidate, rewrites, blocked: [] });
  }

  return state;
};
