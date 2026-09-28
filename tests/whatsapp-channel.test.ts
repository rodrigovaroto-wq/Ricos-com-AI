import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sealInbound, sealIsValid } from "@/channel/inbound-signature.js";
import {
  deliveryErrors,
  marketingDeclines,
  marketingPreferences,
  parseWebhook,
  readAndTyping,
  replyButtonsMessage,
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
  it("texto: id, telefone, corpo e o horário da Meta", () => {
    expect(parseWebhook(hook(msg("text", { text: { body: "quanto custa?" } })))).toEqual([
      { externalId: "wamid.1", from: "5511987654321", body: "quanto custa?", sentAt: new Date(1790000000 * 1000).toISOString() },
    ]);
  });

  it("horário ausente ou inválido não inventa um", () => {
    expect(parseWebhook(hook({ ...msg("text", { text: { body: "oi" } }), timestamp: "x" }))[0]?.sentAt).toBeUndefined();
  });

  it("com o ID do nosso número, mensagem para outro número não entra no funil", () => {
    expect(parseWebhook(hook(msg("text", { text: { body: "oi" } })), "PNID")).toHaveLength(1);
    expect(parseWebhook(hook(msg("text", { text: { body: "oi" } })), "OUTRO")).toEqual([]);
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

  // 2026-09-28: a tap carries the id WE gave the button and the message it answered — the
  // only unambiguous yes/no the channel has. The title stays in `body` for the conversation.
  it("toque em botão guarda o id do botão e a mensagem respondida; o texto segue no corpo", () => {
    const [b, l, t, x] = parseWebhook(
      hook(
        msg("interactive", { context: { id: "wamid.q" }, interactive: { type: "button_reply", button_reply: { id: "optin:yes:n1", title: "Quero ofertas" } } }, "a"),
        msg("interactive", { interactive: { type: "list_reply", list_reply: { id: "size:M", title: "Tamanho M" } } }, "b"),
        msg("button", { context: { id: "wamid.t" }, button: { text: "Parar promoções", payload: "stop_promotions" } }, "c"),
        msg("text", { text: { body: "optin:yes:n1" } }, "d"),
      ),
    );
    expect(b).toMatchObject({ body: "Quero ofertas", reply: { id: "optin:yes:n1", contextId: "wamid.q" } });
    expect(l).toMatchObject({ body: "Tamanho M", reply: { id: "size:M" } });
    expect(l!.reply).not.toHaveProperty("contextId");
    expect(t).toMatchObject({ body: "Parar promoções", reply: { id: "stop_promotions", contextId: "wamid.t" } });
    // Typing the id is text, not a tap.
    expect(x).not.toHaveProperty("reply");
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

describe("preferência de marketing no próprio WhatsApp (user_preferences)", () => {
  // Meta's documented example, verbatim apart from the value.
  const prefs = (value: string, category = "marketing_messages", pnid = "106540352242922") => ({
    object: "whatsapp_business_account",
    entry: [{ id: "102290129340398", changes: [{ field: "user_preferences", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "15550783881", phone_number_id: pnid },
      contacts: [{ wa_id: "16505551234" }],
      user_preferences: [{ wa_id: "16505551234", detail: "User requested to stop marketing messages", category, value, timestamp: 1731705721 }],
    } }] }],
  });

  it("stop e resume, com telefone e horário", () => {
    expect(marketingPreferences(prefs("stop"))).toEqual([{ from: "16505551234", value: "stop", at: "2024-11-15T21:22:01.000Z" }]);
    expect(marketingPreferences(prefs("resume"))[0]!.value).toBe("resume");
  });

  it("outra categoria, valor desconhecido, outro número ou lixo não viram preferência", () => {
    expect(marketingPreferences(prefs("stop", "other"))).toEqual([]);
    expect(marketingPreferences(prefs("pause"))).toEqual([]);
    expect(marketingPreferences(prefs("stop"), "OUTRO")).toEqual([]);
    expect(marketingPreferences(null)).toEqual([]);
  });

  it("não é mensagem: parseWebhook ignora, e mensagens não viram preferência", () => {
    expect(parseWebhook(prefs("stop"))).toEqual([]);
    expect(marketingPreferences(hook(msg("text", { text: { body: "oi" } })))).toEqual([]);
  });
});

describe("o que sai pela Cloud API", () => {
  it("botões de resposta: o id é nosso e volta no toque", () => {
    expect(replyButtonsMessage("5511", "Pergunta?", [{ id: "a", title: "Sim" }, { id: "b", title: "Não" }])).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Pergunta?" },
        action: { buttons: [{ type: "reply", reply: { id: "a", title: "Sim" } }, { type: "reply", reply: { id: "b", title: "Não" } }] },
      },
    });
  });

  it("botões fora dos limites da Meta são erro de programa, não mensagem perdida", () => {
    const ok = { id: "a", title: "Sim" };
    expect(() => replyButtonsMessage("5511", "", [ok])).toThrow();
    expect(() => replyButtonsMessage("5511", "x", [])).toThrow();
    expect(() => replyButtonsMessage("5511", "x", [ok, { id: "b", title: "b" }, { id: "c", title: "c" }, { id: "d", title: "d" }])).toThrow();
    expect(() => replyButtonsMessage("5511", "x", [{ id: "a", title: "um título com mais de vinte" }])).toThrow();
    expect(() => replyButtonsMessage("5511", "x", [ok, ok])).toThrow();
    expect(() => replyButtonsMessage("5511", "x", [{ id: "a".repeat(257), title: "t" }])).toThrow();
    expect(replyButtonsMessage("5511", "x", [{ id: "a", title: "Não, obrigada 💛" }]).interactive.action.buttons[0]!.reply.title).toBe("Não, obrigada 💛");
  });

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

describe("erros de entrega que a Meta devolve", () => {
  it("id, código e o telefone só em dígitos, nunca texto", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PNID" },
                statuses: [
                  { id: "wamid.9", status: "failed", recipient_id: "5511", errors: [{ code: 131047, title: "Re-engagement message" }] },
                  { id: "wamid.8", status: "read" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(deliveryErrors(payload)).toEqual([{ id: "wamid.9", code: 131047, to: "5511" }]);
    expect(deliveryErrors(payload, "OUTRO")).toEqual([]);
  });
});

/**
 * PR #38 item 5 (2026-09-28): a recusa estruturada de marketing que chega pelo webhook —
 * o erro 131050 num envio e o `stop` em "Ofertas e novidades" — vira `declined_at`.
 */
describe("recusas de marketing que a Meta avisa pelo webhook", () => {
  // Status real de um template MARKETING a quem desligou marketing (documentação da Meta).
  const failed = (code: number, recipient = "5511987654321", pnid = "PNID") => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "551140000000", phone_number_id: pnid },
      statuses: [{
        id: "wamid.HBgNNTUxMTk4NzY1NDMyMRUCABEYEjQ5",
        status: "failed",
        timestamp: "1790000000",
        recipient_id: recipient,
        errors: [{
          code,
          title: "Unable to deliver the message. This recipient has chosen to stop receiving marketing messages on WhatsApp from your business.",
          message: "Unable to deliver the message. This recipient has chosen to stop receiving marketing messages on WhatsApp from your business.",
          error_data: { details: "Unable to deliver the message. This recipient has chosen to stop receiving marketing messages on WhatsApp from your business." },
        }],
      }],
    } }] }],
  });
  const prefs = (value: string, category = "marketing_messages", pnid = "PNID") => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "user_preferences", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "551140000000", phone_number_id: pnid },
      contacts: [{ wa_id: "5511912345678" }],
      user_preferences: [{ wa_id: "5511912345678", detail: "User requested to stop marketing messages", category, value, timestamp: 1790000000 }],
    } }] }],
  });

  it("131050 recusa, pelo telefone que o lead guarda", () => {
    expect(marketingDeclines(failed(131050), "PNID")).toEqual(["5511987654321"]);
    expect(marketingDeclines(failed(131050, "+55 11 98765-4321"))).toEqual(["5511987654321"]);
  });
  it("user_preferences stop recusa", () => {
    expect(marketingDeclines(prefs("stop"), "PNID")).toEqual(["5511912345678"]);
  });
  it("nega: outro erro de entrega, resume, outra categoria, outro número, nada lido", () => {
    expect(marketingDeclines(failed(131047))).toEqual([]);
    expect(marketingDeclines(failed(131026))).toEqual([]);
    expect(marketingDeclines(prefs("resume"))).toEqual([]);
    expect(marketingDeclines(prefs("stop", "other"))).toEqual([]);
    expect(marketingDeclines(failed(131050), "OUTRO")).toEqual([]);
    expect(marketingDeclines(prefs("stop"), "OUTRO")).toEqual([]);
    expect(marketingDeclines(failed(131050, ""))).toEqual([]);
    expect(marketingDeclines(hook(msg("text", { text: { body: "não quero mais promoção" } })))).toEqual([]);
    expect(marketingDeclines(null)).toEqual([]);
  });
  it("o mesmo telefone duas vezes no mesmo POST é uma escrita só", () => {
    const both = { entry: [...failed(131050, "5511912345678").entry, ...prefs("stop").entry] };
    expect(marketingDeclines(both)).toEqual(["5511912345678"]);
  });
});

/** O selo da entrada (revisão de segurança, 2026-09-25): a porta do n8n é pública. */
describe("selo da entrada entre a função whatsapp e o turno", () => {
  const m = { externalId: "wamid.1", from: "5511987654321", body: "oi", sentAt: "2026-09-25T12:00:00.000Z" };
  it("a mensagem selada passa", async () => {
    expect(await sealIsValid("s", m, await sealInbound("s", m))).toBe(true);
  });
  it("trocar telefone, texto, id ou horário quebra o selo", async () => {
    const sig = await sealInbound("s", m);
    for (const forged of [{ ...m, from: "5511000000000" }, { ...m, body: "para de me mandar" }, { ...m, externalId: "x" }, { ...m, sentAt: "2026-09-24T12:00:00.000Z" }]) {
      expect(await sealIsValid("s", forged, sig)).toBe(false);
    }
  });
  it("o texto assinado não tem duas leituras, e só string entra", async () => {
    const a = { externalId: "w", from: "55", body: "a\nb", sentAt: "c" };
    const b = { externalId: "w", from: "55", body: "a", sentAt: "b\nc" };
    expect(await sealIsValid("s", b, await sealInbound("s", a))).toBe(false);
    const arr = { ...m, body: ["oi"] as unknown as string };
    expect(await sealIsValid("s", arr, await sealInbound("s", { ...m, body: "oi" }))).toBe(false);
  });

  // R15.1: o id do botão decide o opt-in de marketing, então entra no selo — só quando existe,
  // para a mensagem sem toque manter o selo de sempre.
  it("o id do botão tocado é selado: acrescentar, tirar ou trocar quebra o selo", async () => {
    const tap = { ...m, body: "Quero ofertas", reply: { id: "optin:yes:n1" } };
    const sig = await sealInbound("s", tap);
    expect(await sealIsValid("s", tap, sig)).toBe(true);
    expect(await sealIsValid("s", { ...tap, reply: { id: "optin:yes:n1", contextId: "wamid.q" } } as typeof tap, sig)).toBe(true);
    expect(await sealIsValid("s", { ...tap, reply: { id: "optin:no:n1" } }, sig)).toBe(false);
    const { reply: _dropped, ...semToque } = tap;
    expect(await sealIsValid("s", semToque, sig)).toBe(false);
    expect(await sealIsValid("s", tap, await sealInbound("s", semToque))).toBe(false);
    expect(await sealIsValid("s", { ...tap, reply: { id: 1 as unknown as string } }, sig)).toBe(false);
    expect(await sealIsValid("s", { ...tap, reply: "optin:yes:n1" as unknown as { id: string } }, sig)).toBe(false);
  });
  it("sem toque, o selo é o mesmo de antes do id do botão entrar", async () => {
    // O valor que o código anterior produzia: mensagem em trânsito no deploy continua válida.
    const antes = "93a972d4608bd1bee67710b801614e1381e0a7e8fac4c99f477634a43bcb6055";
    expect(await sealInbound("s", m)).toBe(antes);
  });

  it("sem segredo, sem selo, ou selo de outro segredo: nada passa", async () => {
    expect(await sealIsValid("", m, await sealInbound("s", m))).toBe(false);
    expect(await sealIsValid("s", m, undefined)).toBe(false);
    expect(await sealIsValid("s", m, await sealInbound("outro", m))).toBe(false);
  });
});

/**
 * `marketingDeclines` is pure and tested above; the write is Deno I/O no test reaches. A line
 * deleted from `forward` left the refusal read and never recorded (2026-09-28 mutation run),
 * so the wiring is pinned by text, the way `function-drift.test.ts` pins the turn.
 */
describe("a recusa de marketing é gravada pela função do WhatsApp", () => {
  const source = readFileSync("supabase/functions/whatsapp/index.ts", "utf8");
  it("forward grava cada recusa e espera por ela", () => {
    expect(source).toContain("marketingDeclines(payload, PHONE_NUMBER_ID).map(declineMarketing)");
    expect(source).toContain("  await declines;\n");
  });
  it("a recusa é final: só o lead ainda não recusado, e o opt-in zera", () => {
    expect(source).toContain("&marketing_opt_in_declined_at=is.null`");
    expect(source).toContain("body: JSON.stringify({ marketing_opt_in_declined_at: new Date().toISOString(), marketing_opt_in_at: null }),");
  });
});
