import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseWebhook,
  readAndTyping,
  templateMessage,
  textMessage,
  verifyChallenge,
  verifySignature,
} from "@/channel/whatsapp.js";

/**
 * WA-2 (2026-09-25): the Cloud API webhook is a public URL, so the signature is checked
 * before anything is read, and what Meta sends is mapped to the turn's own shape.
 */
const SECRET = "app-secret-de-teste";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const hook = (...messages: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, messages },
        },
      ],
    },
  ],
});
const msg = (type: string, extra: Record<string, unknown>, id = "wamid.1") => ({
  from: "5511987654321",
  id,
  timestamp: "1790000000",
  type,
  ...extra,
});

describe("assinatura da Meta (X-Hub-Signature-256)", () => {
  const body = JSON.stringify(hook(msg("text", { text: { body: "oi" } })));

  it("aceita o corpo assinado com o app secret", async () => {
    expect(await verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("recusa corpo adulterado, outro segredo, cabeçalho ausente ou sem o prefixo", async () => {
    expect(await verifySignature(body.replace("oi", "ola"), sign(body), SECRET)).toBe(false);
    expect(await verifySignature(body, sign(body, "outro"), SECRET)).toBe(false);
    expect(await verifySignature(body, null, SECRET)).toBe(false);
    expect(await verifySignature(body, sign(body).slice("sha256=".length), SECRET)).toBe(false);
  });

  it("sem segredo configurado, nada passa: falha fechada", async () => {
    expect(await verifySignature(body, sign(body, ""), "")).toBe(false);
  });

  it("aceita o hex em maiúsculas", async () => {
    expect(await verifySignature(body, `sha256=${sign(body).slice(7).toUpperCase()}`, SECRET)).toBe(true);
  });
});

describe("handshake de inscrição do webhook", () => {
  const q = (mode: string, token: string) =>
    new URLSearchParams({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": "12345" });
  it("devolve o challenge só com o token certo", () => {
    expect(verifyChallenge(q("subscribe", "tok"), "tok")).toBe("12345");
    expect(verifyChallenge(q("subscribe", "errado"), "tok")).toBeNull();
    expect(verifyChallenge(q("unsubscribe", "tok"), "tok")).toBeNull();
  });
  it("sem token configurado, nunca responde", () => {
    expect(verifyChallenge(q("subscribe", ""), "")).toBeNull();
  });
});

describe("o que chega vira o turno de sempre", () => {
  it("texto: id, telefone e corpo", () => {
    expect(parseWebhook(hook(msg("text", { text: { body: "quanto custa?" } })))).toEqual([
      { externalId: "wamid.1", from: "5511987654321", body: "quanto custa?" },
    ]);
  });

  it("legenda de imagem, botão e resposta de lista viram o texto", () => {
    const got = parseWebhook(
      hook(
        msg("image", { image: { id: "m", caption: "esse serve?" } }, "a"),
        msg("button", { button: { text: "Quero comprar", payload: "x" } }, "b"),
        msg("interactive", { interactive: { type: "list_reply", list_reply: { id: "1", title: "Tamanho M" } } }, "c"),
      ),
    ).map((m) => m.body);
    expect(got).toEqual(["esse serve?", "Quero comprar", "Tamanho M"]);
  });

  it("áudio, figurinha e imagem sem legenda chegam como frase dizendo o que veio", () => {
    const got = parseWebhook(
      hook(msg("audio", { audio: { id: "x" } }, "a"), msg("sticker", { sticker: { id: "y" } }, "b"), msg("image", { image: { id: "z" } }, "c")),
    ).map((m) => m.body);
    expect(got[0]).toContain("áudio");
    expect(got[1]).toContain("figurinha");
    expect(got[2]).toContain("imagem sem texto");
  });

  it("tipo desconhecido não some: vira frase com o tipo", () => {
    expect(parseWebhook(hook(msg("order", { order: {} })))[0]?.body).toContain("order");
  });

  it("reação não é turno", () => {
    expect(parseWebhook(hook(msg("reaction", { reaction: { emoji: "❤️", message_id: "w" } })))).toEqual([]);
  });

  it("status de entrega e leitura não é mensagem", () => {
    const statuses = {
      entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.9", status: "read" }] } }] }],
    };
    expect(parseWebhook(statuses)).toEqual([]);
  });

  it("origem do anúncio (CTWA) vai junto, só os campos conhecidos", () => {
    const [m] = parseWebhook(
      hook(
        msg("text", {
          text: { body: "vi o anúncio" },
          referral: { ctwa_clid: "clid", source_id: "ad1", source_type: "ad", source_url: "u", headline: "h", body: "texto longo", media_type: "image" },
        }),
      ),
    );
    expect(m?.source).toEqual({ ctwa_clid: "clid", source_id: "ad1", source_type: "ad", source_url: "u", headline: "h" });
  });

  it("lixo, formato errado ou sem id/telefone não derruba: devolve vazio", () => {
    for (const bad of [null, "x", 42, {}, { entry: "x" }, { entry: [{ changes: [{ field: "other", value: {} }] }] }]) {
      expect(parseWebhook(bad)).toEqual([]);
    }
    expect(parseWebhook(hook({ type: "text", text: { body: "sem id" }, from: "55" }))).toEqual([]);
    expect(parseWebhook(hook({ id: "w", type: "text", text: { body: "sem telefone" } }))).toEqual([]);
  });

  it("telefone só com dígitos", () => {
    expect(parseWebhook(hook({ ...msg("text", { text: { body: "oi" } }), from: "+55 (11) 98765-4321" }))[0]?.from).toBe(
      "5511987654321",
    );
  });
});

describe("o que sai pela Cloud API", () => {
  it("texto sem prévia de link", () => {
    expect(textMessage("5511", "oi")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511",
      type: "text",
      text: { preview_url: false, body: "oi" },
    });
  });

  it("template com as variáveis do corpo, na ordem", () => {
    expect(templateMessage("5511", "encorpa_retomada", "pt_BR", ["R$ 129,90", "7"]).template).toEqual({
      name: "encorpa_retomada",
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: "R$ 129,90" }, { type: "text", text: "7" }] }],
    });
  });

  it("template sem variáveis não manda componente vazio", () => {
    expect(templateMessage("5511", "t", "pt_BR", []).template).toEqual({ name: "t", language: { code: "pt_BR" } });
  });

  it("marca como lida e mostra digitando", () => {
    expect(readAndTyping("wamid.1")).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.1",
      typing_indicator: { type: "text" },
    });
  });
});
