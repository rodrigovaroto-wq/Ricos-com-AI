import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import { THINK_REPLY, thinkReply } from "@/agent/retry.js";
import type { BusinessConfig } from "@/config/business.js";
import { ctx } from "./fixtures.js";

/**
 * R16.5 (operator, 2026-09-29): the declared stock is said only when she puts the purchase off,
 * in a reply written to convert — and the conversation itself never cites it.
 */
const example = JSON.parse(readFileSync(new URL("../config/business.example.json", import.meta.url), "utf8")) as BusinessConfig;
const { scarcity: _stock, ...noStock } = example;
const blocked = (text: string, config: Omit<BusinessConfig, "scarcity"> & Partial<Pick<BusinessConfig, "scarcity">>, path: "cod" | "prepay", extra = {}) =>
  runGates(text, ctx({ config, paymentPath: path, codUnavailable: path === "prepay", ...extra }))
    .traces.filter((t) => t.verdict === "block").map((t) => t.gate);

describe("thinkReply", () => {
  for (const path of ["cod", "prepay"] as const) {
    for (const withLink of [true, false]) {
      it(`${path}, ${withLink ? "com" : "sem"} link: abre com a linha do operador e passa a cadeia no adiamento`, () => {
        const text = thinkReply(example, path, withLink);
        expect(text.startsWith(THINK_REPLY)).toBe(true);
        expect(text).toContain("restam 12 unidades");
        expect(blocked(text, example, path, { postponing: true })).toEqual([]);
        // Outside the postpone reply the same stock is refused.
        expect(blocked(text, example, path)).toContain("scarcity_claim");
      });
    }
  }
  it("na entrega: nada agora e a devolução sem custo; no antecipado: desconto e prazo médio, nunca pagar na porta", () => {
    const cod = thinkReply(example, "cod", true);
    expect(cod).toMatch(/não paga nada agora/);
    expect(cod).toMatch(/7 dias pra devolver sem custo nenhum/);
    const prepay = thinkReply(example, "prepay", true);
    expect(prepay).toMatch(/10% de desconto: R\$ 116,91/);
    expect(prepay).toMatch(/varia por região, em média 5 dias úteis/);
    expect(prepay).not.toMatch(/não paga nada agora|na entrega|entregador/);
  });
  it("sem estoque declarado, a frase do estoque some e o resto passa fora do adiamento também", () => {
    const text = thinkReply(noStock, "cod", true);
    expect(text).not.toMatch(/restam|unidades/);
    expect(blocked(text, noStock, "cod")).toEqual([]);
  });
  it("sem link, pede o tamanho em vez de apontar um link que não existe", () => {
    expect(thinkReply(example, "cod", false)).toMatch(/tamanho de calça/);
    expect(thinkReply(example, "cod", false)).not.toMatch(/aqui embaixo/);
  });
});

describe("o prompt não ensina mais o estoque", () => {
  it("nem o número, e diz que o aviso sai pronto", () => {
    const prompt = systemPrompt(example, gateBriefing(example), null);
    expect(prompt).not.toMatch(/restam 12/);
    expect(prompt).toMatch(/o sistema manda o aviso de estoque numa mensagem pronta/);
  });
  it.each(["Só restam 12 unidades!", "Restam 12 unidades.", "São as últimas unidades do lote.", "A promoção acaba hoje!"])(
    "a conversa não cita estoque: %s",
    (text) => {
      expect(blocked(text, example, "cod")).toContain("scarcity_claim");
    },
  );
  it.each(["Restam dúvidas? Me conta.", "Resta alguma dúvida sobre o tamanho?", "Tem 5 tamanhos: P, M, G, GG e XGG."])(
    "frase honesta sem estoque passa: %s",
    (text) => {
      expect(blocked(text, example, "cod")).not.toContain("scarcity_claim");
    },
  );
});

describe("garantir o seu não é garantia (R16.5)", () => {
  it.each(["Você tem 30 dias garantidos pra trocar.", "Garantimos 30 dias de devolução.", "A garantia é de 30 dias.", "Pode garantir o seu, e são 30 dias pra devolver."])(
    "prazo de garantia errado continua vetado: %s",
    (text) => {
      expect(blocked(text, example, "cod")).toContain("warranty_promise");
    },
  );
  it("o verbo garantir perto do prazo médio do antecipado não vira garantia", () => {
    const text = "No antecipado o prazo varia por região, em média 5 dias úteis. O link pra garantir o seu está aqui embaixo.";
    expect(blocked(text, example, "prepay")).not.toContain("warranty_promise");
  });
});

describe("a porta de produção usa a resposta nova (index.ts)", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  it("o 'vou pensar' sai por thinkReply, no caminho do link, e só ele leva postponing", () => {
    expect(source).toContain("const think = thinkReply(CONFIG, linkPath, thinkLink !== null, units);");
    expect(source.match(/postponing/g)?.length).toBe(3);
    expect(source).toContain("      true,\n      units,\n    );\n    if (sent) return sent;");
    // The gate knows the pieces: a kit's price is judged as the kit's (independent review, finding 9).
    expect(source).toContain("      postponing,\n      units: pieces,\n    });");
  });
});

describe("kit no 'vou pensar' (revisão independente, achado 9)", () => {
  it("no antecipado, o preço e o desconto são os do kit, e a cadeia com units passa", () => {
    for (const pieces of [2, 3]) {
      const kit = example.kits!.find((k) => k.path === "prepay" && k.units === pieces)!;
      const text = thinkReply(example, "prepay", true, pieces);
      expect(text).toContain(`${kit.discountPercent}% de desconto: R$ ${kit.priceBrl.toFixed(2).replace(".", ",")}`);
      expect(text).not.toContain("R$ 116,91");
      expect(blocked(text, example, "prepay", { postponing: true, units: pieces })).toEqual([]);
    }
  });
  it("kit que o config não tem: nenhum preço, em vez do preço errado", () => {
    const text = thinkReply(example, "prepay", true, 5);
    expect(text).not.toMatch(/R\$/);
  });
});

describe("média do antecipado: prompt, resposta fixa e gate leem igual", () => {
  const fixed: BusinessConfig = { ...example, delivery: { ...example.delivery, prepayVariesByRegion: false } };
  it("com prepayVariesByRegion desligado, nenhum dos textos ensina a média que o gate vetaria", () => {
    expect(systemPrompt(fixed, gateBriefing(fixed), null)).not.toMatch(/em média 5 dias úteis/);
    expect(thinkReply(fixed, "prepay", true)).not.toMatch(/em média/);
  });
  it("ligado, a média aparece nos dois e passa a cadeia", () => {
    expect(systemPrompt(example, gateBriefing(example), null)).toMatch(/em média 5 dias úteis/);
    const text = thinkReply(example, "prepay", true);
    expect(text).toMatch(/em média 5 dias úteis/);
    expect(blocked(text, example, "prepay", { postponing: true })).toEqual([]);
  });
});
