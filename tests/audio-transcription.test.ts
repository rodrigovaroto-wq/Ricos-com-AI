/**
 * Her voice messages, transcribed (operator, 2026-10-07, caminho 1): the webhook finds the audio's media
 * id, the function decodes the Ogg/Opus and sends a 16 kHz WAV to Meta's transcription, and the turn reads
 * the transcript marked as one. The pure pieces are tested here; the wiring is read from the source.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { oggOpus, parseWebhook, toWav16k, transcribedBody } from "@/channel/whatsapp.js";
import { systemPrompt } from "@/agent/prompt.js";
import { spoken, TRANSCRIBED } from "@/agent/retry.js";
import { asksForLink } from "@/agent/interpret.js";
import { extractName } from "@/agent/identity.js";
import { wantsHuman } from "@/agent/guardrails.js";
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
    expect(fn).toContain('import OpusDecoder from "./vendor/OpusDecoder.js";');
    expect(fn).not.toContain("https://esm.sh/");
    // Teto antes de ler, um prazo para tudo, nada de seguir redirecionamento com o token, e o decoder solto.
    expect(fn).toContain("const MAX_AUDIO_BYTES = 2 * 1024 * 1024;");
    expect(fn).toContain('Number(file.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES');
    // The audio's two fetches to Meta and the image's two (2026-10-09), every one with no redirect.
    expect(fn.match(/redirect: "error", signal: deadline/g)).toHaveLength(4);
    expect(fn.match(/signal: deadline/g)).toHaveLength(8);
    expect(fn).toContain("    try {\n      decoder?.free();\n    } catch {");
    // Pacote a pacote, com o teto de 5 minutos: um arquivo forjado não estoura a memória do worker.
    expect(fn).toContain("const MAX_AUDIO_SAMPLES = 300 * 16000;");
    expect(fn).toContain("if (samples > MAX_AUDIO_SAMPLES) return null;");
    expect(fn).not.toContain("decodeFrames(");
    expect(fn).toContain("parseWebhook(payload, PHONE_NUMBER_ID).map(async ({ audioId, imageId, ...parsed }) => {");
    expect(fn).toContain("const heard = audioId ? await transcribe(audioId) : null;");
    expect(fn).toContain("const message = heard ? { ...parsed, body: heard } : seen ? { ...parsed, body: seen } : parsed;");
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

/** One Ogg page (RFC 3533) holding these segments, with a correct-enough header for the demuxer. */
const page = (lacing: number[], body: number[]): number[] => [
  ...[0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  lacing.length,
  ...lacing,
  ...body,
];
const opusHead = [..."OpusHead"].map((c) => c.charCodeAt(0)).concat([1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
const opusTags = [..."OpusTags"].map((c) => c.charCodeAt(0));

describe("o Ogg dela vira pacotes Opus", () => {
  it("lê canais e pre-skip do OpusHead e pula OpusHead e OpusTags", () => {
    const ogg = oggOpus(Uint8Array.from([...page([19], opusHead), ...page([8], opusTags), ...page([3, 2], [1, 2, 3, 4, 5])]));
    expect(ogg).toEqual({ channels: 2, preSkip: 312, packets: [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])] });
  });

  it("um pacote de 255+ bytes continua no segmento seguinte, e na página seguinte", () => {
    const big = Array.from({ length: 300 }, (_, i) => i % 256);
    const ogg = oggOpus(Uint8Array.from([...page([19], opusHead), ...page([8], opusTags), ...page([255], big.slice(0, 255)), ...page([45], big.slice(255))]));
    expect(ogg?.packets).toEqual([Uint8Array.from(big)]);
  });

  it("não é Ogg/Opus, ou está cortado: nada", () => {
    expect(oggOpus(new TextEncoder().encode("ID3 isto é um mp3 qualquer, não um ogg"))).toBeNull();
    expect(oggOpus(Uint8Array.from([...page([8], opusTags)]))).toBeNull();
    expect(oggOpus(Uint8Array.from(page([19], opusHead).slice(0, 30)))).toBeNull();
    expect(oggOpus(new Uint8Array(0))).toBeNull();
    // Nem 3+ canais nem outra família de mapeamento: nota de voz é mono ou estéreo.
    const head = (channels: number, family: number) => opusHead.map((b, i) => (i === 9 ? channels : i === 18 ? family : b));
    expect(oggOpus(Uint8Array.from([...page([19], head(3, 0)), ...page([8], opusTags)]))).toBeNull();
    expect(oggOpus(Uint8Array.from([...page([19], head(2, 1)), ...page([8], opusTags)]))).toBeNull();
    expect(oggOpus(Uint8Array.from([...page([19], head(0, 0)), ...page([8], opusTags)]))).toBeNull();
  });

  it("o decoder é exatamente o que foi revisado: o arquivo copiado pelo hash, os do jsDelivr pela versão", () => {
    const opus = readFileSync("supabase/functions/whatsapp/vendor/OpusDecoder.js");
    expect(createHash("sha256").update(opus).digest("hex")).toBe("2585c59bba07b99fc82c5f72282ad5218ae3cc25d28ceac5b7863a04a83da633");
    expect(opus.toString()).toContain('from "https://cdn.jsdelivr.net/npm/opus-decoder@0.7.12/src/EmscriptenWasm.js"');
    expect(opus.toString()).toContain('from "https://cdn.jsdelivr.net/npm/@wasm-audio-decoders/common@9.0.7/src/WASMAudioDecoderCommon.js"');
    expect(JSON.parse(readFileSync("supabase/functions/whatsapp/deno.json", "utf8"))).toEqual({
      imports: { "simple-yenc": "https://cdn.jsdelivr.net/npm/simple-yenc@1.0.4/dist/esm.js" },
    });
    // O deno.lock prende o sha256 de cada arquivo do jsDelivr: arquivo trocado lá, carga recusada aqui.
    expect(JSON.parse(readFileSync("supabase/functions/whatsapp/deno.lock", "utf8")).remote).toEqual({
      "https://cdn.jsdelivr.net/npm/@wasm-audio-decoders/common@9.0.7/src/WASMAudioDecoderCommon.js": "9eb713858e7c98dcb2da9a3121ba10b2f0e69bf9f32151eb705569c68e1f33ce",
      "https://cdn.jsdelivr.net/npm/opus-decoder@0.7.12/src/EmscriptenWasm.js": "278768f829703b8b443dfc64b8c5d0e29e73f5012ba7edc641b4c211390a1a72",
      "https://cdn.jsdelivr.net/npm/simple-yenc@1.0.4/dist/esm.js": "14680ab2c8dec870ceffc05e79967b7358d31fd96eee6481388f06347a53ac3e",
    });
  });

});

describe("o que ela disse por áudio chega às regras fixas como texto (revisão do §66)", () => {
  it("o marcador do turno é o mesmo que a função whatsapp põe", () => {
    expect(transcribedBody("oi")).toBe(`${TRANSCRIBED}oi`);
    expect(spoken("me manda o link")).toBe("me manda o link");
  });
  it.each([
    ["pedido de pessoa", (t: string) => wantsHuman(t), "Quero falar com uma pessoa.", true],
    ["negação do pedido de pessoa", (t: string) => wantsHuman(t), "Não quero falar com uma pessoa.", false],
    ["pedido de link", (t: string) => asksForLink(t), "Me manda o link.", true],
    ["negação do link", (t: string) => asksForLink(t), "Não me manda o link.", false],
    ["nome pedido", (t: string) => extractName(t, true), "Maria da Silva Souza.", "Maria da Silva Souza"],
  ])("%s", (_, read, fala, esperado) => {
    expect(read(spoken(transcribedBody(fala)!))).toEqual(esperado);
  });
  it("o turno passa o texto falado às regras e guarda a mensagem marcada", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain('unanswered.map((m) => spoken(m.body ?? "")) : [spoken(inbound.body ?? "")]');
    expect(turn).toContain('        body: inbound.body ?? "",');
    expect(turn.match(/[^(]inbound\.body \?\? ""/g)).toHaveLength(1);
  });
});
