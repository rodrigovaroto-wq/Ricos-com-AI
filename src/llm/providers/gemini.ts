import type { LlmRequest, Provider, ProviderResult } from "../seam.js";

/**
 * Google Gemini generateContent. Verified against the key on 2026-09-06.
 * Used for the cheap work — intent, stage, address extraction — and for everything
 * during development, where the free tier covers the whole run.
 */
export const geminiProvider = (options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Provider => ({
  model: options.model,
  async complete(request: LlmRequest): Promise<ProviderResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${options.apiKey}`;

    const response = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { role: "user", parts: [{ text: request.system }] },
        contents: request.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: request.maxOutputTokens ?? 512 },
      }),
    });

    const body = (await response.json()) as {
      error?: { message: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

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
