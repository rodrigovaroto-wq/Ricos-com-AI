/**
 * The one place the providers read a model API's answer (rodada completa de 2026-09-25:
 * a 504 with a text body, "upstream request timeout", reached `response.json()` and the
 * conversation died with "Unexpected token 'u'"). Same rule the Edge Function's turn
 * already follows: 5xx and 429 are transient and retried; any other non-2xx, or a body
 * that is not JSON, fails with the status and the start of the body — never a parse error.
 */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000];

export async function postJson<T>(
  label: string,
  send: () => Promise<Response>,
  retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    const raw = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new Error(`${label}: resposta não é JSON — ${raw.slice(0, 120)}`);
      }
    }
    const transient = response.status >= 500 || response.status === 429;
    if (!transient || attempt >= retryDelaysMs.length)
      throw new Error(`${label}: HTTP ${response.status} — ${raw.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
  }
}
