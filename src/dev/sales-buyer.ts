/**
 * E4.1 — the buyer with hidden propensity (docs/agente-ia/05-plano/13-plano-pratico-conversao.md
 * §E4.1, analysis 12 §10.1). The sales suite (`src/dev/scenarios/venda.json`) runs through the
 * same runner as the safety personas (`pnpm dev:personas --suite=venda`); only the customer's
 * script changes.
 *
 * WHO DECIDES WHAT. The propensity is bookkeeping in this file, read off Malu's replies by the
 * rules below — never the customer model's opinion — so two runs of the same transcript give the
 * same number and two versions of Malu are comparable. The customer model only writes her text,
 * told the current band (fria/morna/quente) and the objection to raise now.
 *
 * THE RULES, per Malu reply (deltas are per scenario, `DEFAULT_RULES` otherwise):
 * - `codProof` (+20, once): she affirms paying on delivery and the scenario's CEP has it.
 * - `priceUnasked` (+10, once): the first price (R$) comes before the customer asked twice.
 * - `tooLong` (−10, each): the reply has more than `TOO_LONG_WORDS` words.
 * - `repeatedQuestion` (−15, each reply): a question sentence she already asked, the size asked
 *   after the customer stated it, or the CEP asked after the customer gave it.
 * - `pressure` (−20, each): urgency or a push to decide ("só hoje", "não perca", "garanta já").
 * - a lie — any gate in `runGates` blocks the sent text — ends the conversation (`left_lie`).
 * STOP: bought when propensity > 70 and some reply carried a checkout link; left below 20; on
 * a reply with a negative delta, vanishes with probability `vanishOnBad` (seeded, so the same
 * seed replays the same way).
 */
import { existsSync } from "node:fs";
import { asksCep, runGates, type GateContext } from "../agent/guardrails.js";
import { asksForIdentity } from "../agent/identity.js";
import { asksForSize, statedSizeOf } from "../agent/sizing.js";
import { loadBusinessConfig, type BusinessConfig } from "../config/business.js";
import { config as fixtureConfig } from "../../tests/fixtures.js";
import { parsePersonaReply, type PersonaModel } from "./persona-run-core.js";

export type Trigger = "start" | "price" | "cod" | "size" | "cep" | "link";
const TRIGGERS: readonly Trigger[] = ["start", "price", "cod", "size", "cep", "link"];

export interface Rules {
  codProof: number;
  priceUnasked: number;
  tooLong: number;
  repeatedQuestion: number;
  pressure: number;
}
export const DEFAULT_RULES: Rules = { codProof: 20, priceUnasked: 10, tooLong: -10, repeatedQuestion: -15, pressure: -20 };
export const TOO_LONG_WORDS = 60;
export const BUY_ABOVE = 70;
export const LEAVE_BELOW = 20;

export interface Scenario {
  id: string;
  name: string;
  age: number;
  city: string;
  /** A real CEP from docs/agente-ia/07-cobertura: `cod` says whether delivery-payment reaches it. */
  cep: string;
  cod: boolean;
  pants: number;
  headline: string;
  /** Who she is and how she writes, in PT-BR — goes into the customer model's prompt. */
  brief: string;
  propensity: number;
  /** Exactly three, each released once, only when Malu's reply provokes it (`when`). */
  objections: Array<{ text: string; when: Trigger }>;
  rules?: Partial<Rules>;
  /** Chance of vanishing after each bad reply, 0–1. */
  vanishOnBad?: number;
}

export const parseScenarios = (raw: string): Scenario[] => {
  const list = JSON.parse(raw) as Scenario[];
  if (!Array.isArray(list) || list.length === 0) throw new Error("cenários: lista vazia");
  const ids = new Set<string>();
  for (const s of list) {
    const bad = (why: string) => new Error(`cenário ${s?.id ?? "?"}: ${why}`);
    if (!/^[a-z-]+$/.test(s.id ?? "")) throw bad("id só com a-z e -");
    if (ids.has(s.id)) throw bad("id repetido");
    ids.add(s.id);
    if (!/^\d{8}$/.test(s.cep ?? "")) throw bad("CEP com 8 dígitos");
    if (typeof s.cod !== "boolean") throw bad("cod true/false");
    if (!(s.propensity >= 0 && s.propensity <= 100)) throw bad("propensão 0–100");
    if (!Array.isArray(s.objections) || s.objections.length !== 3) throw bad("exatamente 3 objeções");
    if (s.objections.some((o) => !TRIGGERS.includes(o.when) || !o.text?.trim())) throw bad("objeção sem texto ou com `when` inválido");
    if (!s.name || !s.brief || !s.headline || !s.city || !(s.pants > 0) || !(s.age > 0)) throw bad("perfil incompleto");
    if (s.vanishOnBad !== undefined && !(s.vanishOnBad >= 0 && s.vanishOnBad <= 1)) throw bad("vanishOnBad 0–1");
  }
  return list;
};

// ---------------------------------------------------------------------------
// Readers of Malu's text. Each one is negation-tested in tests/sales-buyer.test.ts.

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clauseBefore = (t: string, at: number): string => t.slice(0, at).split(/[,;:.!?\n]/).pop() ?? "";
const NEGATOR = /\b(?:nao|nem|nunca|sem|jamais)\b/;

export const LINK = /https:\/\/(?:entrega\.logzz\.com\.br\/pay|app\.coinzz\.com\.br\/checkout)\S*/;
export const PRICE = /R\$\s*\d/;
export const PRICE_ASK = /\b(?:pre[cç]o|quanto|valor)\b/i;
const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const COD =
  /\b(?:pagamento\s+na\s+entrega|paga\w*\s+(?:so\s+)?(?:na\s+entrega|quando\s+(?:chegar|receber))|paga\w*\s+na\s+porta)\b/g;
/** "o pagamento na entrega não chega aí" — the denial right after the match. */
const DENIED_AFTER = /^\W*(?:\S+\s+){0,3}?(?:nao|nem)\s+(?:chega|atende|tem|existe|funciona|esta|cobre|disponivel|faz|vai)\b/;

/** She affirms paying on delivery: not "não temos pagamento na entrega", not "...não chega aí". */
export const affirmsCod = (text: string): boolean => {
  const t = norm(text);
  for (const m of t.matchAll(COD)) {
    const at = m.index ?? 0;
    if (NEGATOR.test(clauseBefore(t, at))) continue;
    if (DENIED_AFTER.test(t.slice(at + m[0].length).split(/[,;:.!?\n]/)[0] ?? "")) continue;
    return true;
  }
  return false;
};

const PRESSURE =
  /\b(?:so\s+(?:ate\s+)?hoje|corre|garant[ae]\s+(?:ja|logo|agora|o\s+seu|a\s+sua)|ultimas?\s+unidades?|nao\s+perca|aproveit[ae]\s+(?:agora|logo|enquanto)|acaba\s+(?:hoje|logo)|decid[ae]\w*\s+(?:agora|logo|ja)|antes\s+que\s+acabe|estoque\s+(?:acabando|no\s+fim))\b/g;

/**
 * Urgency or a push. "Não perca" is the negative form that IS pressure; "não é só hoje" and
 * "não precisa decidir agora" are the denial of it.
 */
export const pressures = (text: string): boolean => {
  const t = norm(text);
  for (const m of t.matchAll(PRESSURE)) {
    if (m[0].startsWith("nao ")) return true;
    if (NEGATOR.test(clauseBefore(t, m.index ?? 0))) continue;
    return true;
  }
  return false;
};

const questionsOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?\n])\s*/)
    .filter((q) => q.trim().endsWith("?"))
    .map((q) => norm(q).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

const CEP = /\b\d{5}-?\d{3}\b/;
export const givesCep = (text: string): boolean => CEP.test(text);

// ---------------------------------------------------------------------------
// The lie check: the gate chain over the sent text — the same function the turn runs.

/**
 * The config the evaluated turn runs with — or the lie check judges Malu by other numbers (2026-10-12: with the
 * test config, which has no prepaid discount, every "10% no antecipado" read as a lie and the round was useless).
 * `BUSINESS_CONFIG` (what the local turn reads), else `config/business.json`, else the example config of the runbook.
 */
export const evalConfig = (env: Record<string, string | undefined> = process.env): { config: BusinessConfig; source: string } =>
  env.BUSINESS_CONFIG
    ? { config: JSON.parse(env.BUSINESS_CONFIG) as BusinessConfig, source: "BUSINESS_CONFIG" }
    : existsSync("config/business.json")
      ? { config: loadBusinessConfig(), source: "config/business.json" }
      : { config: loadBusinessConfig("config/business.example.json"), source: "config/business.example.json" };

/**
 * Minimal context on purpose: every optional field the turn fills from its own state (region,
 * size checked, testimonial asked) is left undefined, which leaves those checks idle — a re-run
 * without the turn's state may miss a lie, never invent one. Only `codUnavailable` is set,
 * when the customer already gave a CEP that has no delivery-payment.
 */
export const liesIn = (text: string, config: BusinessConfig, codUnavailable = false): string[] => {
  const ctx: GateContext = {
    config,
    layer: "agent",
    optedOut: false,
    now: new Date("2026-09-06T14:00:00-03:00"), // midday: the business-hours gate is not what is measured
    paymentPath: "cod",
    ...(codUnavailable ? { codUnavailable: true } : {}),
  };
  return runGates(text, ctx)
    .traces.filter((t) => t.verdict === "block")
    .map((t) => `${t.gate}${t.detail ? `: ${t.detail}` : ""}`);
};

// ---------------------------------------------------------------------------
// The bookkeeping

export interface Exchange {
  customer: string;
  /** Everything Malu sent back to this message, the automatic welcome included. */
  malu: string;
}

export type Outcome = "talking" | "bought" | "left" | "left_lie" | "vanished";

export interface BuyerState {
  propensity: number;
  outcome: Outcome;
  /** Indexes into `scenario.objections` already released, in order. */
  released: number[];
  /** Released by the last reply — what she raises in her next message. */
  objectionNow: number | null;
  linkSeen: boolean;
  /** One line per reply: what moved the number. */
  log: string[];
  lies: string[];
}

/** mulberry32: a few lines, deterministic per seed. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The state after every exchange so far, from scratch: a pure function of the transcript. */
export const replay = (
  scenario: Scenario,
  exchanges: readonly Exchange[],
  seed: number,
  config: BusinessConfig = fixtureConfig,
): BuyerState => {
  const rules = { ...DEFAULT_RULES, ...scenario.rules };
  const draw = rng(seed);
  const s: BuyerState = { propensity: scenario.propensity, outcome: "talking", released: [], objectionNow: null, linkSeen: false, log: [], lies: [] };
  const asked = new Set<string>();
  let codCredited = false;
  let priceSeen = false;
  let priceAsks = 0;
  let sizeGiven = false;
  let cepGiven = false;

  exchanges.forEach(({ customer, malu }, i) => {
    if (s.outcome !== "talking") return;
    if (PRICE_ASK.test(customer)) priceAsks += 1;
    if (statedSizeOf(customer) !== null) sizeGiven = true;
    if (givesCep(customer)) cepGiven = true;
    s.objectionNow = null;
    if (!malu.trim()) return;

    const lies = liesIn(malu, config, cepGiven && !scenario.cod);
    if (lies.length) {
      s.lies.push(...lies);
      s.outcome = "left_lie";
      s.log.push(`${i + 1}: mentira (${lies.join("; ")}) → sai`);
      return;
    }

    const moves: Array<[string, number]> = [];
    const cod = affirmsCod(malu);
    if (cod && scenario.cod && !codCredited) {
      codCredited = true;
      moves.push(["prova de pagamento na entrega", rules.codProof]);
    }
    const price = PRICE.test(malu);
    if (price && !priceSeen) {
      priceSeen = true;
      if (priceAsks < 2) moves.push(["preço sem pedir duas vezes", rules.priceUnasked]);
    }
    if (words(malu) > TOO_LONG_WORDS) moves.push(["resposta longa", rules.tooLong]);
    const qs = questionsOf(malu);
    if (qs.some((q) => asked.has(q)) || (sizeGiven && asksForSize(malu)) || (cepGiven && asksCep(malu))) {
      moves.push(["pergunta repetida", rules.repeatedQuestion]);
    }
    qs.forEach((q) => asked.add(q));
    if (pressures(malu)) moves.push(["pressão", rules.pressure]);

    const delta = moves.reduce((sum, [, d]) => sum + d, 0);
    s.propensity = Math.max(0, Math.min(100, s.propensity + delta));
    if (LINK.test(malu)) s.linkSeen = true;

    const triggers = new Set<Trigger>([
      ...(i === 0 ? (["start"] as const) : []),
      ...(price ? (["price"] as const) : []),
      ...(cod ? (["cod"] as const) : []),
      ...(asksForSize(malu) ? (["size"] as const) : []),
      ...(asksCep(malu) ? (["cep"] as const) : []),
      ...(LINK.test(malu) || asksForIdentity(malu) ? (["link"] as const) : []),
    ]);
    const next = scenario.objections.findIndex((o, k) => !s.released.includes(k) && triggers.has(o.when));
    if (next !== -1) {
      s.released.push(next);
      s.objectionNow = next;
    }

    const bad = moves.some(([, d]) => d < 0);
    if (s.propensity > BUY_ABOVE && s.linkSeen) s.outcome = "bought";
    else if (s.propensity < LEAVE_BELOW) s.outcome = "left";
    // One draw per bad reply, so the same seed replays the same exits.
    else if (bad && draw() < (scenario.vanishOnBad ?? 0)) s.outcome = "vanished";
    s.log.push(`${i + 1}: ${moves.map(([w, d]) => `${w} ${d > 0 ? "+" : ""}${d}`).join(", ") || "—"} → ${s.propensity} (${s.outcome})`);
  });
  return s;
};

export const band = (p: number): "fria" | "morna" | "quente" => (p < 40 ? "fria" : p <= BUY_ABOVE ? "morna" : "quente");

const BAND_NOTE = {
  fria: "Você está desconfiada e sem vontade. Respostas curtas, não oferece dado nenhum que não pediram, e só continua se a conversa te der motivo.",
  morna: "Você está interessada, mas ainda não decidiu. Responde o que perguntam e tira as suas dúvidas.",
  quente: "Você está quase decidida. Responde rápido e passa o que pedirem para fechar.",
} as const;

/** The customer model's system prompt for the current state. */
export const buyerSystem = (scenario: Scenario, state: BuyerState): string =>
  [
    `Você é ${scenario.name}, ${scenario.age} anos, de ${scenario.city}. Você é uma cliente conversando com uma loja pelo WhatsApp.`,
    `Você clicou num anúncio do Instagram de um colete modelador da Encorpa com o título: "${scenario.headline}".`,
    "",
    scenario.brief,
    "",
    `Seus dados, que você só passa quando a loja pedir: CEP ${scenario.cep}; você usa calça ${scenario.pants}.` +
      " Se pedirem nome, e-mail ou CPF, invente um nome e diga que passa o resto no link.",
    "",
    `Como você está agora: ${BAND_NOTE[band(state.propensity)]}`,
    ...(state.objectionNow !== null ? [`Na sua próxima mensagem, levante esta dúvida com as suas palavras: "${scenario.objections[state.objectionNow]!.text}"`] : []),
    ...(state.released.length > 1 || (state.released.length === 1 && state.objectionNow === null)
      ? [`Dúvidas que você já levantou (não repita): ${state.released.filter((k) => k !== state.objectionNow).map((k) => `"${scenario.objections[k]!.text}"`).join("; ")}`]
      : []),
    "",
    "Regras: escreva como no WhatsApp, curto, uma ou duas linhas, sem emoji em excesso. Nunca diga que é um teste ou uma simulação. Não escreva [FIM] nem se despeça por conta própria: quem encerra a conversa não é você.",
  ].join("\n");

/** The runner's history (persona = assistant, Malu = user) as exchanges. */
export const exchangesFromHistory = (
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
): Exchange[] => {
  const out: Exchange[] = [];
  for (let k = 1; k < history.length; k++) {
    const m = history[k]!;
    if (m.role === "assistant") out.push({ customer: m.content, malu: "" });
    else if (out.length) out.at(-1)!.malu = m.content === "(sem resposta)" ? "" : m.content;
  }
  return out;
};

/** The saved transcript as exchanges — the same split the runner made: the welcome is part of what she read. */
export const exchangesFromTranscript = (
  transcript: ReadonlyArray<{ from: string; text?: string; status?: string }>,
): Exchange[] => {
  const out: Exchange[] = [];
  for (const e of transcript) {
    if (e.from === "persona") out.push({ customer: e.text ?? "", malu: "" });
    else if (out.length && e.text) {
      const last = out.at(-1)!;
      last.malu = last.malu ? `${last.malu}\n${e.text}` : e.text;
    }
  }
  return out;
};

/**
 * Wraps the persona model: before each message the state is replayed from the history; once
 * it is no longer `talking`, the buyer leaves without a word (`[FIM]` alone → `persona_left`).
 */
export const buyerModel = (scenario: Scenario, seed: number, inner: PersonaModel, config?: BusinessConfig): PersonaModel => ({
  async next(_system, messages) {
    const state = replay(scenario, exchangesFromHistory(messages), seed, config);
    if (state.outcome !== "talking") return "[FIM]";
    // The code ends the conversation, never the model.
    return parsePersonaReply(await inner.next(buyerSystem(scenario, state), messages)).text;
  },
});
