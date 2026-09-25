import type { LlmRequest, Provider, ProviderResult } from "../seam.js";
import { postJson } from "./http.js";

/**
 * Google Gemini generateContent. Verified against the key on 2026-09-06.
 * Used for the cheap work — intent, stage, address extraction — and for everything
 * during development, where the free tier covers the whole run.
 */
export const geminiProvider = (options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** Waits between retries of a 5xx/429; tests pass zeros. */
  retryDelaysMs?: readonly number[];
}): Provider => ({
  model: options.model,
  async complete(request: LlmRequest): Promise<ProviderResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`;

    const body = await postJson<{
      error?: { message: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }>("gemini", () => doFetch(url, {
      method: "POST",
      // Header, not query string: a network error carries the URL in its message.
      headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        system_instruction: { role: "user", parts: [{ text: request.system }] },
        contents: request.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: request.maxOutputTokens ?? 512 },
      }),
    }), options.retryDelaysMs);

    if (body.error) throw new Error(`gemini: ${body.error.message}`);
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error(`gemini: resposta vazia (finishReason=${candidate?.finishReason})`);

    return {
      text,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },
});
