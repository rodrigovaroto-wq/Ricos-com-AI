import { describe, expect, it } from "vitest";
import { metaProvider } from "@/llm/providers/meta.js";

/**
 * Rodada completa de 25/09, persona Tati: a API da Meta devolveu um 5xx com corpo em texto
 * ("upstream request timeout") e o provedor fez `response.json()` sem olhar o status — a
 * conversa morreu com "Unexpected token 'u'". O turno de produção já tratava 5xx/429 como
 * transitório; os três provedores de `src/llm` não.
 */
const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
const upstream = () => new Response("upstream request timeout", { status: 504 });
const request = { purpose: "teste", system: "s", messages: [{ role: "user" as const, content: "oi" }] };

describe("provedores: 5xx com corpo em texto", () => {
  it("tenta de novo e segue quando a Meta volta", async () => {
    const replies = [upstream(), ok()];
    const p = metaProvider({ apiKey: "k", model: "m", fetchImpl: async () => replies.shift()!, retryDelaysMs: [0] });
    await expect(p.complete(request)).resolves.toMatchObject({ text: "oi" });
  });

  it("desiste com erro legível, não com JSON quebrado", async () => {
    const p = metaProvider({ apiKey: "k", model: "m", fetchImpl: async () => upstream(), retryDelaysMs: [0, 0] });
    await expect(p.complete(request)).rejects.toThrow("meta: HTTP 504 — upstream request timeout");
  });

  it("4xx não é repetido", async () => {
    let calls = 0;
    const p = metaProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: async () => (calls++, new Response("forbidden", { status: 403 })),
      retryDelaysMs: [0, 0],
    });
    await expect(p.complete(request)).rejects.toThrow("meta: HTTP 403 — forbidden");
    expect(calls).toBe(1);
  });
});
