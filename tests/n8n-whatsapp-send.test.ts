import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAndTyping, templateMessage, textMessage } from "@/channel/whatsapp.js";

/**
 * WA-3 (2026-09-25): runs the ACTUAL code of the n8n node "Monta os envios" (versioned
 * active workflow, pulled by `pnpm dev:n8n`) and holds its payloads to the ones in
 * src/channel/whatsapp.ts — the n8n node cannot import them, so the test ties the two.
 */
const wf = JSON.parse(readFileSync("n8n/workflows/whatsapp-envio.json", "utf8")) as {
  nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
};
const code = wf.nodes.find((n) => n.name === "Monta os envios")!.parameters.jsCode!;
type Out = Array<{ json: { url: string; to: string; delaySec: number; payload: unknown } }>;
const run = (src: string, items: unknown[]) =>
  new Function("$input", src)({ all: () => items.map((json) => ({ json })) }) as Out;
const live = code.replace("const CANAL_ATIVO = false;", "const CANAL_ATIVO = true;").replace("'{{PHONE_NUMBER_ID}}'", "'123456'");

describe("n8n: envio pela Cloud API", () => {
  it("com o canal desligado, nada sai — seja o que for que chamar", () => {
    expect(code).toContain("const CANAL_ATIVO = false;");
    expect(run(code, [{ to: "5511", bubbles: [{ text: "oi", delayMs: 0 }] }])).toEqual([]);
  });

  it("sem o ID do número preenchido, nada sai mesmo ligado", () => {
    const semId = code.replace("const CANAL_ATIVO = false;", "const CANAL_ATIVO = true;");
    expect(run(semId, [{ to: "5511", bubbles: [{ text: "oi", delayMs: 0 }] }])).toEqual([]);
  });

  it("balões do turno viram textos na ordem, com a pausa de digitação em segundos (teto 25)", () => {
    const out = run(live, [{ to: "+55 11 98765-4321", bubbles: [{ text: "Oi!", delayMs: 2400 }, { text: " ", delayMs: 0 }, { text: "Tudo bem?", delayMs: 90000 }] }]);
    expect(out.map((o) => o.json.delaySec)).toEqual([2, 25]);
    expect(out.map((o) => o.json.payload)).toEqual([textMessage("5511987654321", "Oi!"), textMessage("5511987654321", "Tudo bem?")]);
    expect(out[0]!.json.url).toBe("https://graph.facebook.com/v21.0/123456/messages");
  });

  it("toque da régua como template leva o nome, o idioma e as variáveis", () => {
    const [o] = run(live, [{ to: "5511", via: "template", name: "encorpa_retomada", language: "pt_BR", variables: ["R$ 129,90", 7] }]);
    expect(o!.json.payload).toEqual(templateMessage("5511", "encorpa_retomada", "pt_BR", ["R$ 129,90", "7"]));
  });

  it("toque da régua como texto", () => {
    expect(run(live, [{ to: "5511", via: "text", body: "Oi de novo" }])[0]!.json.payload).toEqual(textMessage("5511", "Oi de novo"));
  });

  it("confirmação de leitura com digitando", () => {
    expect(run(live, [{ to: "5511", markRead: "wamid.1" }])[0]!.json.payload).toEqual(readAndTyping("wamid.1"));
  });

  it("sem telefone, nada", () => {
    expect(run(live, [{ to: "", bubbles: [{ text: "oi" }] }])).toEqual([]);
  });
});
