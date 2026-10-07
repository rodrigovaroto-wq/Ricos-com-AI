/**
 * Her voice messages, transcribed (operator, 2026-10-07, caminho 1): the webhook finds the audio's media
 * id, the function decodes the Ogg/Opus and sends a 16 kHz WAV to Meta's transcription, and the turn reads
 * the transcript marked as one. The pure pieces are tested here; the wiring is read from the source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWebhook, toWav16k, transcribedBody } from "@/channel/whatsapp.js";
import { systemPrompt } from "@/agent/prompt.js";
import { gateBriefing } from "@/agent/guardrails.js";
import { config } from "./fixtures.js";

const webhook = (message: Record<string, unknown>) => ({
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, messages: [message] } }] }],
});

describe("o áudio dela vira texto", () => {
  it("a mensagem de voz traz o id da mídia, e o texto de reserva continua", () => {
    const [m] = parseWebhook(webhook({ id: "wamid.1", from: "5511999990000", type: "audio", audio: { id: "MEDIA123", mime_type: "audio/ogg; codecs=opus", voice: true } }), "1");
    expect(m?.audioId).toBe("MEDIA123");
    expect(m?.body).toBe("[a cliente mandou um áudio, que você não consegue ouvir]");
  });

  it("texto, imagem e figurinha não trazem id de áudio", () => {
    for (const msg of [
      { id: "w2", from: "55", type: "text", text: { body: "oi" } },
      { id: "w3", from: "55", type: "image", image: { id: "IMG" } },
      { id: "w4", from: "55", type: "sticker", sticker: { id: "STK" } },
    ])
      expect(parseWebhook(webhook(msg), "1")[0]?.audioId).toBeUndefined();
  });

  it("a transcrição chega marcada, sem espaços sobrando; vazia, nada", () => {
    expect(transcribedBody("  quero o colete   tamanho M.. ")).toBe(
      "[áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] quero o colete tamanho M.",
    );
    expect(transcribedBody("   ")).toBeNull();
  });

  it("o WAV é mono, 16 kHz, 16 bits, do tamanho certo", () => {
    const second48k = new Float32Array(48_000).map((_, i) => Math.sin(i / 10) * 0.5);
    const wav = toWav16k([second48k, second48k], 48_000);
    const dv = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(16_000);
    expect(dv.getUint16(34, true)).toBe(16);
    expect(dv.getUint32(40, true)).toBe(16_000 * 2);
    expect(wav.length).toBe(44 + 16_000 * 2);
  });

  it("o sinal sai sem estourar: amostra no limite vira o máximo do PCM", () => {
    const wav = toWav16k([new Float32Array(3).fill(1.5)], 48_000);
    expect(new DataView(wav.buffer).getInt16(44, true)).toBe(0x7fff);
  });

  it("a função baixa, decodifica, transcreve e troca o texto antes de selar; o id nunca sai dela", () => {
    const fn = readFileSync("supabase/functions/whatsapp/index.ts", "utf8");
    expect(fn).toContain('import { OggOpusDecoder } from "https://esm.sh/ogg-opus-decoder@1.7.5";');
    expect(fn).toContain("parseWebhook(payload, PHONE_NUMBER_ID).map(async ({ audioId, ...parsed }) => {");
    expect(fn).toContain("const heard = audioId ? await transcribe(audioId) : null;");
    expect(fn).toContain("const message = heard ? { ...parsed, body: heard } : parsed;");
    expect(fn.indexOf("const heard =")).toBeLessThan(fn.indexOf("await sealInbound(SIGNING_SECRET, message)"));
    expect(fn).toContain('purpose: "transcribe"');
    // O token do WhatsApp só vai para os domínios da Meta.
    const host = /\/\^https:\\\/\\\/(.+?)\/i\.test\(url\)/.exec(fn)?.[0] ?? "";
    expect(host).toContain("fbsbx");
  });

  it("o prompt ensina a ler a transcrição e confirmar o que parecer estranho", () => {
    const p = systemPrompt(config, gateBriefing(config), null).replace(/\s+/g, " ");
    expect(p).toContain("[áudio da cliente, transcrito automaticamente");
    expect(p).toContain("confirme com ela com naturalidade");
  });
});
