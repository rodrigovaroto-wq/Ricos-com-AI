import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geminiProvider } from "@/llm/providers/gemini.js";

/**
 * The Gemini key travelled in the query string (`?key=...`) until 2026-09-22. A network
 * error carries the whole URL in its message, and that message had already reached the
 * n8n execution log once. The key goes in the `x-goog-api-key` header now, in both the
 * dev provider and the Edge Function — and these tests keep it from drifting back.
 */
describe("a chave do Gemini não viaja na URL", () => {
  it("o provedor de dev manda a chave no header, e a URL sai sem ela", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "ok" }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const provider = geminiProvider({ apiKey: "segredo-de-teste", model: "m", fetchImpl: fakeFetch });
    await provider.complete({ purpose: "test", system: "s", messages: [{ role: "user", content: "oi" }] });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).not.toContain("key=");
    expect(calls[0]!.url).not.toContain("segredo-de-teste");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("segredo-de-teste");
  });

  it("a Edge Function não monta URL com ?key= — nem chama mais o Gemini (R12.1, 2026-09-23)", () => {
    // index.ts is Deno and cannot be imported here; the source is the only thing to read.
    const source = readFileSync("supabase/functions/turn/index.ts", "utf-8");
    expect(source).not.toMatch(/generateContent\?key=/);
    expect(source).not.toContain("generativelanguage.googleapis.com");
  });
});
