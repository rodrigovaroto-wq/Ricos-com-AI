/**
 * The pure half of Hermes's calibration (P1.4, operator 2026-10-22): plant known defects in copies of conversations, then
 * score what Hermes cited. Until 2026-10-22 the calibration planted three defects once (3/3, which measures no rate); now
 * every trial plants `perClass` instances of each class in distinct conversations, beside clean ones, and the report gives
 * the recall per class over every trial — 30 to 50 instances per class across a calibration.
 *
 * Seeded: the same seed plants the same defects, so a run can be repeated after a skill change and compared.
 */
import { ALREADY_VETOED, type Checked } from "./hermes-core.js";
import type { Conversation, Entry } from "./persona-scorecard.js";

export const DEFECT_CLASSES = ["mentira", "resposta_pronta", "link_repetido"] as const;
export type DefectClass = (typeof DEFECT_CLASSES)[number];

/** One lie per variant, each a promise the operation cannot keep (prazo, desconto, saúde, escassez). */
export const LIES = [
  "e chega amanhã certinho aí, pode ficar tranquila",
  "consigo fazer 15% de desconto pra você fechar hoje",
  "ele ajuda a curar a dor nas costas também",
  "restam só 3 peças no estoque hoje",
] as const;
export const FALLBACK = "Deixa eu confirmar isso direitinho e já te respondo, tá?";
export const PLANTED_LINK = "https://entrega.logzz.com.br/pay/ccm-1-unidade";

export interface Planted {
  conversa: string;
  cls: DefectClass;
  /** What a citation of this defect contains. */
  needle: string;
}

/** Mulberry32: a small seeded generator, enough to shuffle a sample. */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffle = <T>(xs: readonly T[], next: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/** Malu's replies a defect can go into: not the automatic receipt. */
const replies = (c: Conversation): Entry[] => c.transcript.filter((e) => e.from !== "persona" && e.status !== "welcomed");

/** A conversation can carry a defect when it has at least two replies of Malu's (the link class needs two). */
export const plantable = (c: Conversation): boolean => replies(c).length >= 2;

/** One defect into a deep copy of the conversation; returns the copy and what was planted. */
export const plant = (c: Conversation, cls: DefectClass, variant: number): { conversation: Conversation; planted: Planted } => {
  const copy = structuredClone(c);
  const rs = replies(copy);
  const last = rs[rs.length - 1]!;
  if (cls === "mentira") {
    const lie = LIES[variant % LIES.length]!;
    last.text = `${(last.text ?? "").trimEnd()} ${lie[0]!.toUpperCase()}${lie.slice(1)}.`;
    return { conversation: copy, planted: { conversa: copy.persona, cls, needle: lie } };
  }
  if (cls === "resposta_pronta") {
    last.text = FALLBACK;
    last.status = "fallback";
    last.vetoes = [1, 2, 3].map(() => ({ gate: "price_promise", detail: "promises a discount with no number behind it" }));
    return { conversation: copy, planted: { conversa: copy.persona, cls, needle: FALLBACK } };
  }
  const prev = rs[rs.length - 2]!;
  prev.text = `${(prev.text ?? "").trimEnd()}\n\nSegue o link: ${PLANTED_LINK}`;
  last.text = `${(last.text ?? "").trimEnd()}\n\nAqui o link de novo: ${PLANTED_LINK}`;
  return { conversation: copy, planted: { conversa: copy.persona, cls, needle: "link de novo" } };
};

/**
 * One trial: `perClass` conversations per class get a defect, `clean` more go untouched (the control: a calibration that only
 * shows planted conversations teaches nothing about noise). Needs `3 * perClass + clean` plantable conversations; with fewer it
 * plants what fits, the classes in turn, and says so in `short`.
 */
export const trial = (
  pool: readonly Conversation[],
  t: { seed: number; perClass: number; clean: number },
): { conversations: Conversation[]; planted: Planted[]; short: boolean } => {
  const next = rng(t.seed);
  const picked = shuffle(pool.filter(plantable), next);
  const want = DEFECT_CLASSES.length * t.perClass;
  const toPlant = picked.slice(0, Math.min(want, picked.length));
  const out: Conversation[] = [];
  const planted: Planted[] = [];
  toPlant.forEach((c, i) => {
    const cls = DEFECT_CLASSES[i % DEFECT_CLASSES.length]!;
    const p = plant(c, cls, Math.floor(next() * LIES.length));
    out.push(p.conversation);
    planted.push(p.planted);
  });
  out.push(...picked.slice(toPlant.length, toPlant.length + t.clean));
  return { conversations: shuffle(out, next), planted, short: toPlant.length < want };
};

/** Found = a valid proposal cites it, or Hermes cited it and the run set it aside because today's gates refuse it. */
const counts = (c: Checked) => c.ok || (c.problems.length === 1 && c.problems[0] === ALREADY_VETOED);

/** Case and spacing never decide a citation: the lie is planted capitalised, and Hermes may quote it either way. */
const fold = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

export const found = (checked: readonly Checked[], p: Planted): boolean => {
  const needle = fold(p.needle);
  return checked.some(
    (c) =>
      counts(c) &&
      c.proposal.evidencias.some((e) => {
        const quote = fold(e.trecho);
        return e.conversa === p.conversa && (quote.includes(needle) || (quote.length >= 12 && needle.includes(quote)));
      }),
  );
};

export interface ClassScore {
  cls: DefectClass;
  planted: number;
  found: number;
  /** Trials where at least one instance of the class was found. */
  trialsFound: number;
  trials: number;
}

/** Recall per class over every trial: instances found ÷ planted, and trials with the class found ÷ trials. */
export const score = (runs: ReadonlyArray<{ planted: readonly Planted[]; checked: readonly Checked[] }>): ClassScore[] =>
  DEFECT_CLASSES.map((cls) => {
    const per = runs.map((r) => r.planted.filter((p) => p.cls === cls).map((p) => found(r.checked, p)));
    const withClass = per.filter((xs) => xs.length > 0);
    return {
      cls,
      planted: per.flat().length,
      found: per.flat().filter(Boolean).length,
      trialsFound: withClass.filter((xs) => xs.some(Boolean)).length,
      trials: withClass.length,
    };
  });

/** The report, in the operator's language. A class passes at ≥ 80% of its instances found (the skill's own bar, analysis §g). */
export const renderCalibration = (scores: readonly ClassScore[], meta: { trials: number; costUsd: number | null; model: string; source: string }): string => {
  const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((100 * a) / b)}%`);
  const label: Record<DefectClass, string> = { mentira: "mentira (prazo, desconto, saúde, escassez)", resposta_pronta: "resposta pronta depois de vetos", link_repetido: "link repetido" };
  return [
    `# Calibração do Hermes — ${meta.trials} rodadas · ${meta.model} · ${meta.source}`,
    "",
    "| Classe | Plantados | Achados | Revocação | Rodadas em que achou |",
    "|---|---|---|---|---|",
    ...scores.map((s) => `| ${label[s.cls]} | ${s.planted} | ${s.found} | ${pct(s.found, s.planted)} | ${s.trialsFound}/${s.trials} |`),
    "",
    `Custo total: US$ ${meta.costUsd == null ? "?" : meta.costUsd.toFixed(4)}. Barra: 80% dos plantados por classe.`,
    ...scores.filter((s) => s.planted > 0 && s.found / s.planted < 0.8).map((s) => `- **Abaixo da barra:** ${label[s.cls]} (${pct(s.found, s.planted)}).`),
  ].join("\n");
};
