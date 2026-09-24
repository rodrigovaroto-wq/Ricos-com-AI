import type { LlmRequest, Provider, ProviderResult } from "../seam.js";

/**
 * Meta Model API (api.meta.ai; api.llama.com until 2026-09-24) — serves Muse Spark 1.3, decided 2026-09-10 to
 * replace gpt-5.6-luna as the conversation model (see HANDOFF.md §Frente 5). The
 * request and response shape is OpenAI-compatible, so this file mirrors
 * `providers/openai.ts` closely; what differs is the host, the credential, and that
 * Muse Spark is not documented as a reasoning model, so it carries none of
 * `openai.ts`'s completion-token floor.
 */
export const metaProvider = (options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Provider => ({
  model: options.model,
  async complete(request: LlmRequest): Promise<ProviderResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch("https://api.meta.ai/v1/chat/completions", {
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
        max_tokens: request.maxOutputTokens ?? 900,
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
