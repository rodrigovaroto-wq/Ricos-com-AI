import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickVariant, renderFollowup, type RenderContext, type TemplateVariable } from "../src/agent/followups.js";
import { config } from "./fixtures.js";

/**
 * The sweep gates the free text `renderFollowup` writes; outside the 24-hour window what
 * reaches her is the template Meta approved. If the two differ, she reads a text no gate
 * read (docs/agente-ia/06-script/03-templates-meta.md, "a regra que amarra os três").
 *
 * The template bodies are read from that document — the one the partner submits — so a
 * body edited there, or copy edited in `followups.ts`, turns this red. Once Meta approves,
 * the document must hold the approved text exactly (pipeline, phase 4, item 16).
 */
const doc = readFileSync("docs/agente-ia/06-script/03-templates-meta.md", "utf8");

interface Draft {
  body: string;
  variables: TemplateVariable[];
}

const draftOf = (kind: string): Draft => {
  const section = doc.split(/\n## \d+\. /).find((s) => s.startsWith(`\`${kind}\``));
  if (!section) throw new Error(`template de ${kind} não está no documento`);
  const body = /\*\*Corpo:\*\*\s*```text\n([\s\S]*?)\n```/.exec(section)?.[1];
  if (!body) throw new Error(`template de ${kind} sem corpo`);
  const variables = [...section.matchAll(/^\| `\{\{(\d+)\}\}` \| `(\w+)` \|/gm)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => m[2] as TemplateVariable);
  return { body, variables };
};

/** The template as Meta sends it, with the values the code resolves, in the code's bold. */
const filled = (draft: Draft, values: Record<string, string>): string =>
  draft.body
    .replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[draft.variables[Number(n) - 1]!]!)
    .replace(/\*([^*\n]+)\*/g, "**$1**");

const now = new Date("2026-09-10T12:00:00Z"); // quinta, 09:00 em São Paulo
const values = {
  price: `R$ ${config.prices.codBrl.toFixed(2).replace(".", ",")}`,
  warrantyDays: String(config.delivery.warrantyDays),
  couponPercent: String(config.coupon.percent),
  weekday: "Quinta",
};
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-abc", config, now, ...over });

/** A lead id whose `pickVariant` lands on the given index of a two-variant touch. */
const leadFor = (index: number): string => {
  for (let i = 0; ; i++) if (pickVariant(`lead-${i}`, [0, 1]) === index) return `lead-${i}`;
};

describe("template aprovado = texto que o gate leu", () => {
  it("os placeholders do documento são variáveis que o código resolve", () => {
    for (const kind of ["silence_2", "silence_3", "order_eve"]) {
      const d = draftOf(kind);
      expect(d.variables.length, kind).toBe(new Set(d.body.match(/\{\{\d+\}\}/g)).size);
      for (const v of d.variables) expect(Object.keys(values), `${kind}: ${v}`).toContain(v);
    }
  });

  it("silence_2, primeira variante", () => {
    expect(filled(draftOf("silence_2"), values)).toBe(renderFollowup("silence_2", ctx({ leadId: leadFor(0) })));
  });

  it("silence_3, com o cupom ativo", () => {
    const withCoupon = { ...config, coupon: { ...config.coupon, active: true } };
    expect(filled(draftOf("silence_3"), values)).toBe(renderFollowup("silence_3", ctx({ config: withCoupon })));
  });

  it("order_eve, pagando na entrega", () => {
    expect(filled(draftOf("order_eve"), values)).toBe(renderFollowup("order_eve", ctx()));
  });

  // KNOWN DIVERGENCES (2026-09-28), pinned with `it.fails` so they stay visible and turn
  // red the day they are fixed. Both need a code change in `deliveryFor` (the template's
  // own text is what must be gated) and one of them a second template at Meta.
  //
  // 1. Prepaid order: the free text drops "Deixa R$ X separado" (she already paid); the one
  //    template tells her to have the money ready at the door.
  it.fails("order_eve, antecipado (diverge: o template cobra quem já pagou)", () => {
    expect(filled(draftOf("order_eve"), values)).toBe(renderFollowup("order_eve", ctx({ prepaid: true })));
  });
  // 2. Half the leads get `silence_2`'s second variant as free text, and the gate reads it;
  //    outside the window the template sends the first one.
  it.fails("silence_2, segunda variante (diverge: fora da janela sai a primeira)", () => {
    expect(filled(draftOf("silence_2"), values)).toBe(renderFollowup("silence_2", ctx({ leadId: leadFor(1) })));
  });
});
