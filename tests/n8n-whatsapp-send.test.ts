import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readReceipt, replyButtonsMessage, templateMessage, textMessage } from "@/channel/whatsapp.js";

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
// Live since 2026-10-06 (L1.5): the production node carries the number and the switch on.
const PHONE_NUMBER_ID = "1370670962794717";
const live = code;
const off = code.replace("const CANAL_ATIVO = true;", "const CANAL_ATIVO = false;");

describe("n8n: envio pela Cloud API", () => {
  it("produção está ligada, com o ID do número", () => {
    expect(code).toContain("const CANAL_ATIVO = true;");
    expect(code).toContain(`const PHONE_NUMBER_ID = '${PHONE_NUMBER_ID}';`);
  });

  it("com o canal desligado, nada sai — seja o que for que chamar", () => {
    expect(off).toContain("const CANAL_ATIVO = false;");
    expect(run(off, [{ to: "5511", bubbles: [{ text: "oi", delayMs: 0 }] }])).toEqual([]);
  });

  it("sem o ID do número preenchido, nada sai mesmo ligado", () => {
    const semId = code.replace(`'${PHONE_NUMBER_ID}'`, "'{{PHONE_NUMBER_ID}}'");
    expect(run(semId, [{ to: "5511", bubbles: [{ text: "oi", delayMs: 0 }] }])).toEqual([]);
  });

  it("balões do turno viram textos na ordem, com a pausa de digitação em segundos (teto 25)", () => {
    const out = run(live, [{ to: "+55 11 98765-4321", bubbles: [{ text: "Oi!", delayMs: 2400 }, { text: " ", delayMs: 0 }, { text: "Tudo bem?", delayMs: 90000 }] }]);
    expect(out.map((o) => o.json.delaySec)).toEqual([2, 25]);
    expect(out.map((o) => o.json.payload)).toEqual([textMessage("5511987654321", "Oi!"), textMessage("5511987654321", "Tudo bem?")]);
    expect(out[0]!.json.url).toBe(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`);
  });

  it("toque da régua como template leva o nome, o idioma e as variáveis", () => {
    const [o] = run(live, [{ to: "5511", via: "template", name: "encorpa_retomada", language: "pt_BR", variables: ["R$ 129,90", 7] }]);
    expect(o!.json.payload).toEqual(templateMessage("5511", "encorpa_retomada", "pt_BR", ["R$ 129,90", "7"]));
  });

  it("toque da régua como texto", () => {
    expect(run(live, [{ to: "5511", via: "text", body: "Oi de novo" }])[0]!.json.payload).toEqual(textMessage("5511", "Oi de novo"));
  });

  it("pergunta com botões sai com os botões, igual ao construtor do canal", () => {
    const list = [{ id: "optin:yes:n1", title: "Quero ofertas" }, { id: "optin:no:n1", title: "Não, obrigada" }];
    const [o] = run(live, [{ to: "5511", via: "buttons", body: "Posso te mandar ofertas?", buttons: list }]);
    expect(o!.json.payload).toEqual(replyButtonsMessage("5511", "Posso te mandar ofertas?", list));
  });

  it("botões fora do limite ou vazios: nada sai — nunca o texto sem os botões", () => {
    const b = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, title: `t${i}` }));
    for (const buttons of [[], b(4), [{ id: "", title: "x" }], "x"]) {
      expect(run(live, [{ to: "5511", via: "buttons", body: "Pergunta?", buttons }]), JSON.stringify(buttons)).toEqual([]);
    }
  });

  it("confirmação de leitura sem digitando", () => {
    expect(run(live, [{ to: "5511", markRead: "wamid.1" }])[0]!.json.payload).toEqual(readReceipt("wamid.1"));
  });

  it("sem telefone, nada", () => {
    expect(run(live, [{ to: "", bubbles: [{ text: "oi" }] }])).toEqual([]);
  });
});
