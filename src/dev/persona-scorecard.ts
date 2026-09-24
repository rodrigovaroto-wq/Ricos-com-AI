/**
 * The scorecard: measures a persona round against the goals written in the change
 * registry (docs/agente-ia/08-mudancas/registro.md), so a change is judged by a number and
 * not by someone rereading twelve conversations.
 *
 *   pnpm dev:placar data/persona-runs/<pasta-da-rodada>
 *
 * Writes `_placar.md` and `_placar.json` next to the transcripts. Every check lists the
 * exact conversation and Malu message that failed it — those are the only transcripts
 * worth reading in full.
 *
 * The checks read what the runner recorded (`<persona>.json`); they are heuristics over
 * text, deliberately simple, and each one names the registry entry it measures. A check
 * that turns out to count the wrong thing is itself a registry entry to fix.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decidesToBuy } from "../agent/interpret.js";

export interface Entry {
  from: string;
  text?: string;
  status?: string;
  vetoes?: Array<{ gate: string; detail?: string | null }>;
}

export interface Conversation {
  persona: string;
  transcript: Entry[];
  costBrl?: number | null;
  personaCostBrl?: number;
}

export interface Hit {
  persona: string;
  /** 1-based index among Malu's replies (the automatic welcome not counted). */
  message: number;
  excerpt: string;
}

export interface Check {
  id: string;
  /** The registry entry this check measures. */
  entry: string;
  goal: string;
  value: number;
  target: string;
  pass: boolean;
  hits: Hit[];
}

const LINK = /https:\/\/(?:entrega\.logzz\.com\.br\/pay|app\.coinzz\.com\.br\/checkout)\S*/;
// `\b` never sits next to "é" in JS regex (it isn't \w), so the lead-in is whitespace.
const SIZE_SAID = /(?:^|\s)(?:é|e|seu|dela|dele)\s+(?:o\s+)?(XGG|GG|G|M|P)(?![\wÀ-ú])/;
/** New size data: a pants number, a waist, or a size letter — never a "manequim" number. */
const NEW_SIZE_DATA =
  /(?:cal[cç]a|uso|veste|visto)\D{0,12}\d{2}\b|\b\d{2,3}\s*cm\b|\bcintura\b|(?:usa|uso|veste|visto|quero|pega|pego|tamanho)\s+(?:o\s+|a\s+)?(?:XGG|GG|G|M|P)(?![\wÀ-ú])|^\s*(?:XGG|GG|G|M|P)\s*$/im;
const PRICE_TALK = /\b(?:pre[cç]o|caro|desconto|cupom|parcel\w*|valor|quanto|precinho|barato)\b/i;
const SIZE_QUESTION = /\b(?:tamanho|cal[cç]a|n[uú]mero)\b[^?]*\?/i;
const IDENTITY_ASK = /\b(?:e-?mail|cpf)\b[^?]*\?/i;

const excerpt = (text: string): string => text.replace(/\s+/g, " ").slice(0, 110);

/** Malu's replies in order, with the customer message each one answers. */
const exchanges = (c: Conversation): Array<{ n: number; reply: Entry; customer: string }> => {
  const out: Array<{ n: number; reply: Entry; customer: string }> = [];
  let customer = "";
  let n = 0;
  for (const e of c.transcript) {
    if (e.from === "persona") {
      customer = e.text ?? "";
      continue;
    }
    if (e.status === "welcomed") continue;
    n += 1;
    out.push({ n, reply: e, customer });
  }
  return out;
};

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const sentences = (text: string): string[] => text.split(/[.!?\n]+/).filter((s) => s.trim());
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const scoreRun = (conversations: readonly Conversation[]) => {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "pass"> & { pass?: boolean }, pass: boolean) => checks.push({ ...c, pass });

  // M-01 — a reply vetoed into the canned fallback. Goal: none.
  const fallbacks: Hit[] = [];
  const fallbackDelivery: Hit[] = [];
  // M-02 — the size Malu states changes without new size data from the customer.
  const flips: Hit[] = [];
  // M-03 — the same checkout link twice within three replies.
  const dupLinks: Hit[] = [];
  // M-04 — size question in replies to price talk; identity asked after a decision.
  let priceReplies = 0;
  const priceSizeNag: Hit[] = [];
  const identityAfterDecision: Hit[] = [];
  // Funnel — decided customers who got a link within two replies.
  const decidedNoLink: Hit[] = [];
  let decided = 0;

  const replyWords: number[] = [];
  let sentenceCount = 0;
  let longSentences = 0;
  let linkConversations = 0;
  let handoffs = 0;
  let replies = 0;
  let agentCost = 0;

  for (const c of conversations) {
    const ex = exchanges(c);
    let lastSize: string | null = null;
    const links: Array<{ n: number; url: string }> = [];
    let hadLink = false;
    let decisionAt: number | null = null;
    agentCost += c.costBrl ?? 0;

    for (const { n, reply, customer } of ex) {
      const text = reply.text ?? "";
      replies += 1;
      if (reply.status === "handoff") handoffs += 1;
      if (text.trim()) {
        replyWords.push(words(text));
        for (const s of sentences(text)) {
          sentenceCount += 1;
          if (words(s) > 30) longSentences += 1;
        }
      }
      const hit = { persona: c.persona, message: n, excerpt: excerpt(text) };

      if (reply.status === "fallback") {
        fallbacks.push(hit);
        if ((reply.vetoes ?? []).some((v) => v.gate === "delivery_promise")) fallbackDelivery.push(hit);
      }

      const said = SIZE_SAID.exec(text)?.[1] ?? null;
      if (said) {
        if (lastSize && said !== lastSize && !NEW_SIZE_DATA.test(customer)) flips.push(hit);
        lastSize = said;
      }

      const url = LINK.exec(text)?.[0];
      if (url) {
        hadLink = true;
        if (links.some((l) => l.url === url && n - l.n <= 3)) dupLinks.push(hit);
        links.push({ n, url });
      }

      if (PRICE_TALK.test(customer)) {
        priceReplies += 1;
        if (SIZE_QUESTION.test(text)) priceSizeNag.push(hit);
      }

      if (decidesToBuy(customer) && decisionAt === null) {
        decisionAt = n;
        decided += 1;
      }
      if (decisionAt !== null && n >= decisionAt && IDENTITY_ASK.test(text) && lastSize) {
        identityAfterDecision.push(hit);
      }
    }
    if (hadLink) linkConversations += 1;
    if (decisionAt !== null) {
      const soon = ex.filter((x) => x.n >= decisionAt! && x.n <= decisionAt! + 1);
      if (!soon.some((x) => LINK.test(x.reply.text ?? ""))) {
        const first = soon[0];
        decidedNoLink.push({ persona: c.persona, message: decisionAt, excerpt: excerpt(first?.reply.text ?? "") });
      }
    }
  }

  add({ id: "respostas-prontas", entry: "M-01", goal: "Nenhuma resposta vetada vira a resposta pronta", value: fallbacks.length, target: "0", hits: fallbacks }, fallbacks.length === 0);
  add({ id: "pronta-por-prazo", entry: "M-01", goal: "Nenhuma resposta pronta causada por delivery_promise", value: fallbackDelivery.length, target: "0", hits: fallbackDelivery }, fallbackDelivery.length === 0);
  add({ id: "troca-de-tamanho", entry: "M-02", goal: "O tamanho não muda sem dado novo de calça, cintura ou letra", value: flips.length, target: "0", hits: flips }, flips.length === 0);
  add({ id: "link-repetido", entry: "M-03", goal: "O mesmo link não é mandado duas vezes em 3 respostas", value: dupLinks.length, target: "0", hits: dupLinks }, dupLinks.length === 0);
  const nagRate = priceReplies ? priceSizeNag.length / priceReplies : 0;
  add({ id: "tamanho-na-conversa-de-preco", entry: "M-04", goal: "Pergunta de tamanho em no máximo metade das respostas sobre preço", value: +nagRate.toFixed(2), target: "≤ 0,5", hits: priceSizeNag }, nagRate <= 0.5);
  add({ id: "dados-depois-da-decisao", entry: "M-04", goal: "Com a decisão e o tamanho, o link sai sem pedir e-mail ou CPF", value: identityAfterDecision.length, target: "0", hits: identityAfterDecision }, identityAfterDecision.length === 0);
  add({ id: "decidiu-e-recebeu-link", entry: "R13.4", goal: "Quem decide comprar recebe o link em até 2 respostas", value: decidedNoLink.length, target: "0", hits: decidedNoLink }, decidedNoLink.length === 0);

  const longRate = sentenceCount ? longSentences / sentenceCount : 0;
  const metrics = {
    conversations: conversations.length,
    replies,
    medianWords: median(replyWords),
    longSentenceRate: +longRate.toFixed(3),
    linkConversations,
    decided,
    handoffs,
    fallbacks: fallbacks.length,
    agentCostBrl: +agentCost.toFixed(4),
    costPerReplyBrl: replies ? +(agentCost / replies).toFixed(5) : 0,
  };
  return { metrics, checks };
};

export const renderScorecard = (dir: string, score: ReturnType<typeof scoreRun>): string => {
  const m = score.metrics;
  const lines = [
    `# Placar — ${dir}`,
    "",
    `Conversas ${m.conversations} · respostas ${m.replies} · mediana ${m.medianWords} palavras · ` +
      `frases > 30 palavras ${(m.longSentenceRate * 100).toFixed(0)}% · links ${m.linkConversations} · ` +
      `decididas ${m.decided} · handoffs ${m.handoffs} · respostas prontas ${m.fallbacks} · ` +
      `Malu R$ ${m.agentCostBrl.toFixed(4)} (R$ ${m.costPerReplyBrl.toFixed(4)}/resposta)`,
    "",
    "| Entrada | Checagem | Meta | Valor | Atingiu? |",
    "|---|---|---|---|---|",
    ...score.checks.map((c) => `| ${c.entry} | ${c.goal} | ${c.target} | ${c.value} | ${c.pass ? "sim" : "**não**"} |`),
    "",
  ];
  for (const c of score.checks.filter((x) => x.hits.length)) {
    lines.push(`## ${c.entry} — ${c.id}`, "");
    for (const h of c.hits) lines.push(`- ${h.persona}, Malu ${h.message}: ${h.excerpt}`);
    lines.push("");
  }
  return lines.join("\n");
};

const isMain = process.argv[1]?.endsWith("persona-scorecard.ts");
if (isMain) {
  const dir = process.argv[2];
  if (!dir) throw new Error("uso: pnpm dev:placar data/persona-runs/<pasta-da-rodada>");
  const files = (await readdir(dir)).filter((f) => /^persona-.+\.json$/.test(f));
  const conversations = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as Conversation),
  );
  const score = scoreRun(conversations);
  await writeFile(join(dir, "_placar.json"), JSON.stringify(score, null, 2));
  const md = renderScorecard(dir, score);
  await writeFile(join(dir, "_placar.md"), md);
  console.log(md);
}
