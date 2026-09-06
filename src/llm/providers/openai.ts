import type { LlmRequest, Provider, ProviderResult } from "../seam.js";

/**
 * OpenAI chat completions. Verified against the account on 2026-09-06.
 *
 * gpt-5.6-luna is a reasoning model: part of the completion budget is spent on
 * reasoning tokens the caller never sees. A tight `max_completion_tokens` does not
 * truncate the answer — it returns an error with no content at all, which is why the
 * floor below exists.
 */
const MIN_COMPLETION_TOKENS = 600;

export const openAiProvider = (options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Provider => ({
  model: options.model,
  async complete(request: LlmRequest): Promise<ProviderResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch("https://api.openai.com/v1/chat/completions", {
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
    });

    const body = (await response.json()) as {
      error?: { message: string };
      choices?: Array<{ message: { content: string | null } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

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
