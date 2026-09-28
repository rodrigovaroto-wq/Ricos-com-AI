import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryFor, pickVariant, type FollowupKind, type RenderContext, type TemplateBinding } from "../src/agent/followups.js";
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

/** The body as submitted, from the template's own section. */
const bodyOf = (kind: string): string => {
  const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith(`\`${kind}\``));
  if (!section) throw new Error(`template de ${kind} não está no documento`);
  const body = /\*\*Corpo:\*\*\s*```text\n([\s\S]*?)\n```/.exec(section)?.[1];
  if (!body) throw new Error(`template de ${kind} sem corpo`);
  return body;
};

/** The block the operator pastes into `BUSINESS_CONFIG` — names and placeholder order. */
const templates = (() => {
  const block = /```json\n("channel"[\s\S]*?)\n```/.exec(doc)?.[1];
  if (!block) throw new Error("bloco do BUSINESS_CONFIG não está no documento");
  return (JSON.parse(`{${block}}`) as { channel: { templates: Record<string, TemplateBinding> } }).channel.templates;
})();

const now = new Date("2026-09-10T12:00:00Z"); // quinta, 09:00 em São Paulo
const withTemplates = { ...config, coupon: { ...config.coupon, active: true }, channel: { templates } };
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-abc", config: withTemplates, now, ...over });

/**
 * Outside the window, through the production path: `deliveryFor` resolves the variables,
 * the document's body is filled with THEM (in the code's bold), and the result must be the
 * text the gate reads — `deliveryFor`'s own `body`, which is `renderFollowup`.
 */
const sentVsGated = (kind: FollowupKind, over: Partial<RenderContext> = {}) => {
  const d = deliveryFor(kind, ctx(over), null);
  if (d?.via !== "template") throw new Error(`${kind} não saiu por template: ${JSON.stringify(d)}`);
  const sent = bodyOf(kind)
    .replace(/\{\{(\d+)\}\}/g, (_, n: string) => d.variables[Number(n) - 1] ?? `{{${n}}}`)
    .replace(/\*([^*\n]+)\*/g, "**$1**");
  return { sent, gated: d.body };
};

/** A lead id whose `pickVariant` lands on the given index of a two-variant touch. */
const leadFor = (index: number): string => {
  for (let i = 0; ; i++) if (pickVariant(`lead-${i}`, [0, 1]) === index) return `lead-${i}`;
};

describe("template aprovado = texto que o gate leu", () => {
  it("o bloco do BUSINESS_CONFIG declara cada placeholder do corpo, na ordem da tabela", () => {
    for (const kind of ["silence_2", "silence_3", "order_eve"]) {
      const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith(`\`${kind}\``))!;
      const table = [...section.matchAll(/^\| `\{\{(\d+)\}\}` \| `(\w+)` \|/gm)]
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map((m) => m[2]);
      expect(templates[kind]?.variables, kind).toEqual(table);
      expect(new Set(bodyOf(kind).match(/\{\{\d+\}\}/g)).size, kind).toBe(table.length);
    }
  });

  it("silence_2, primeira variante", () => {
    const { sent, gated } = sentVsGated("silence_2", { leadId: leadFor(0) });
    expect(sent).toBe(gated);
  });

  it("silence_3, com o cupom ativo", () => {
    const { sent, gated } = sentVsGated("silence_3");
    expect(sent).toBe(gated);
  });

  it("order_eve, pagando na entrega", () => {
    const { sent, gated } = sentVsGated("order_eve");
    expect(sent).toBe(gated);
  });

  // The draft of the second eve template (section 4) is the prepaid free text already, so
  // the day `deliveryFor` picks it for a prepaid order the divergence below closes.
  it("rascunho da véspera do antecipado = texto livre do antecipado", () => {
    const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith("Véspera do pedido já pago"));
    const body = section && /\*\*Corpo:\*\*\s*```text\n([\s\S]*?)\n```/.exec(section)?.[1];
    expect(body, "seção 4 do documento").toBeTruthy();
    const { gated } = sentVsGated("order_eve", { prepaid: true });
    expect(body!.replace(/\*([^*\n]+)\*/g, "**$1**")).toBe(gated);
  });

  // KNOWN DIVERGENCES (2026-09-28), pinned with `it.fails` so they stay visible and turn
  // red the day they are fixed. Both need a code change in `deliveryFor` (the template's
  // own text is what must be gated) and one of them a second template at Meta.
  //
  // 1. Prepaid order: the free text drops "Deixa R$ X separado" (she already paid); the one
  //    template tells her to have the money ready at the door.
  it.fails("order_eve, antecipado (diverge: o template cobra quem já pagou)", () => {
    const { sent, gated } = sentVsGated("order_eve", { prepaid: true });
    expect(sent).toBe(gated);
  });
  // 2. Half the leads get `silence_2`'s second variant as free text, and the gate reads it;
  //    outside the window the template sends the first one.
  it.fails("silence_2, segunda variante (diverge: fora da janela sai a primeira)", () => {
    const { sent, gated } = sentVsGated("silence_2", { leadId: leadFor(1) });
    expect(sent).toBe(gated);
  });
});
