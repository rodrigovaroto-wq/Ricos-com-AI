import type { LlmRequest, Provider, ProviderResult } from "../seam.js";
import { postJson } from "./http.js";

/**
 * OpenAI chat completions. Verified against the account on 2026-09-06, when
 * gpt-5.6-luna was the conversation model — replaced 2026-09-10 by muse-spark-1.3
 * (`src/llm/providers/meta.ts`, called from `src/dev/smoke.ts`), so nothing calls this
 * file on the live dev path today. Kept because it is a working, generic
 * OpenAI-compatible provider, not because anything still uses it.
 *
 * gpt-5.6-luna — and any other reasoning model plugged in here — spends part of the
 * completion budget on reasoning tokens the caller never sees. A tight
 * `max_completion_tokens` does not truncate the answer — it returns an error with no
 * content at all, which is why the floor below exists.
 */
const MIN_COMPLETION_TOKENS = 600;

export const openAiProvider = (options: {
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
    }>("openai", () => doFetch("https://api.openai.com/v1/chat/completions", {
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
        max_completion_tokens: Math.max(request.maxOutputTokens ?? 0, MIN_COMPLETION_TOKENS),
      }),
    }), options.retryDelaysMs);

    if (body.error) throw new Error(`openai: ${body.error.message}`);
    const text = body.choices?.[0]?.message.content;
    if (!text) throw new Error("openai: resposta sem conteúdo");

    return {
      text,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        // Reasoning tokens are billed as output and are already inside completion_tokens.
        cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  },
});
