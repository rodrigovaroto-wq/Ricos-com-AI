import type { LlmRequest, Provider, ProviderResult } from "../seam.js";
import { postJson } from "./http.js";

/**
 * Meta Model API (api.meta.ai; api.llama.com until 2026-09-24) — serves Muse Spark 1.3, decided 2026-09-10 to
 * replace gpt-5.6-luna as the conversation model (see HANDOFF.md §Frente 5). The
 * request and response shape is OpenAI-compatible, so this file mirrors
 * `providers/openai.ts` closely; what differs is the host, the credential, and the
 * reasoning controls below — Muse Spark always reasons (measured 2026-09-24).
 */
export const metaProvider = (options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** Waits between retries of a 5xx/429; tests pass zeros. */
  retryDelaysMs?: readonly number[];
}): Provider => ({
  model: options.model,
  async complete(request: LlmRequest): Promise<ProviderResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const body = await postJson<{
      error?: { message: string };
      choices?: Array<{ message: { content: string | null } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    }>("meta", () => doFetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: request.system },
          ...request.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        // Muse always reasons inside this budget; 900 returned empty answers on
        // 2026-09-24 (see `callMuse` in the Edge Function for the measurement).
        max_completion_tokens: Math.max(request.maxOutputTokens ?? 0, 4000),
        reasoning_effort: "minimal",
      }),
    }), options.retryDelaysMs);

    if (body.error) throw new Error(`meta: ${body.error.message}`);
    const text = body.choices?.[0]?.message.content;
    if (!text) throw new Error("meta: resposta sem conteúdo");

    return {
      text,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  },
});
