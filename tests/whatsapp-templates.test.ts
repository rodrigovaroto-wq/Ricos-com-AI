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

/** The body as submitted, from the template's own section (or the one whose title starts so). */
const bodyOf = (kind: string): string => {
  const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith(`\`${kind}\``) || sec.startsWith(kind));
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

/** The prepaid eve's declaration, from the draft in section 4 (not yet in the block above). */
const PREPAID_EVE = "Véspera do pedido já pago";
const evePago = (() => {
  const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith(PREPAID_EVE));
  const decl = section && /"order_eve_pago":\s*(\{[^}]*\})/.exec(section)?.[1];
  if (!decl) throw new Error("declaração de order_eve_pago não está na seção 4");
  return JSON.parse(decl) as TemplateBinding;
})();

/**
 * `silence_2` left the block on 2026-10-02 (month 1, §4a): the ruler keeps it inside her 24 hours,
 * as free text. Its old declaration stays in section 1, and the code still honours one if declared.
 */
const silence2 = (() => {
  const section = doc.split(/\n## \d+\. /).find((sec) => sec.startsWith("`silence_2`"));
  const decl = section && /"silence_2":\s*(\{[^}]*\})/.exec(section)?.[1];
  if (!decl) throw new Error("declaração antiga de silence_2 não está na seção 1");
  return JSON.parse(decl) as TemplateBinding;
})();

const now = new Date("2026-09-10T12:00:00Z"); // quinta, 09:00 em São Paulo
const withTemplates = {
  ...config,
  coupon: { ...config.coupon, active: true },
  channel: { templates: { ...templates, silence_2: silence2, order_eve_pago: evePago } },
};
// With her consent (R15.1): without it `silence_2`/`silence_3` never leave as a template.
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ leadId: "lead-abc", config: withTemplates, now, marketingOptIn: true, ...over });

/**
 * Outside the window, through the production path: `deliveryFor` resolves the variables,
 * the document's body is filled with THEM (in the code's bold), and the result must be the
 * text the gate reads — `deliveryFor`'s own `body`, which is `renderFollowup`.
 */
const sentVsGated = (kind: FollowupKind, over: Partial<RenderContext> = {}) => {
  const d = deliveryFor(kind, ctx(over), null);
  if (d?.via !== "template") throw new Error(`${kind} não saiu por template: ${JSON.stringify(d)}`);
  const sent = bodyOf(kind === "order_eve" && over.prepaid ? PREPAID_EVE : kind)
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
      expect((withTemplates.channel.templates as Record<string, TemplateBinding>)[kind]?.variables, kind).toEqual(table);
      expect(new Set(bodyOf(kind).match(/\{\{\d+\}\}/g)).size, kind).toBe(table.length);
    }
  });

  it("o bloco do BUSINESS_CONFIG não declara mais o silence_2 (§4a: texto livre dentro das 24 h)", () => {
    expect(templates.silence_2).toBeUndefined();
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

  // The two divergences pinned with `it.fails` until 2026-09-28, closed in `deliveryFor`.
  // 1. Prepaid order: its own template (section 4), without "Deixa R$ X separado" — the one
  //    template told her to have the money ready at the door after she paid.
  it("order_eve, antecipado: o template dele (seção 4), sem cobrar quem já pagou", () => {
    const d = deliveryFor("order_eve", ctx({ prepaid: true }), null);
    expect(d).toMatchObject({ via: "template", name: "encorpa_vespera_entrega_pago", variables: [] });
    const { sent, gated } = sentVsGated("order_eve", { prepaid: true });
    expect(sent).toBe(gated);
    expect(sent).not.toContain("separado");
  });
  // 2. Operator's decision (2026-09-28), option (a): outside the window, always the first
  //    variant, and that is the text the gate reads — for the lead on the second one too.
  it("silence_2, segunda variante: fora da janela sai a primeira, e é ela que o gate lê", () => {
    const { sent, gated } = sentVsGated("silence_2", { leadId: leadFor(1) });
    expect(sent).toBe(gated);
  });
});
