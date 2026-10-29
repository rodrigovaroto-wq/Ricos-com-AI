import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conversationCoupon, deliveryFor, renderFollowup, type RenderContext } from "@/agent/followups.js";
import { gateBriefing, runGates } from "@/agent/guardrails.js";
import { systemPrompt } from "@/agent/prompt.js";
import { config, ctx } from "./fixtures.js";

/**
 * R17.4 (operator, 2026-09-30): the coupon is the `silence_3` touch's offer to someone who did
 * not buy the first time. The conversation may cite it only after that touch reached her; the
 * ruler keeps reading the operator's config, so the touch itself still goes out.
 */
const ativo = { ...config, coupon: { ...config.coupon, active: true } };

describe("cupom só no follow-up (R17.4)", () => {
  it("cupom ativo e toque não enviado: a conversa lê o cupom desligado", () => {
    expect(conversationCoupon(ativo, false).coupon.active).toBe(false);
    expect(conversationCoupon(ativo, false).coupon.percent).toBe(20);
    // The operator's config is not mutated: the ruler still sees the coupon on.
    expect(ativo.coupon.active).toBe(true);
  });

  it("depois do toque do cupom, a conversa pode citá-lo", () => {
    expect(conversationCoupon(ativo, true).coupon.active).toBe(true);
  });

  it("cupom desligado pelo operador continua desligado, com ou sem toque", () => {
    expect(conversationCoupon(config, true).coupon.active).toBe(false);
    expect(conversationCoupon(config, false).coupon.active).toBe(false);
  });

  it("antes do toque, anunciar o cupom é vetado e o desconto de 20% também", () => {
    const reservado = conversationCoupon(ativo, false);
    expect(runGates("Separei um cupom de 20% de desconto pra você!", ctx({ config: reservado })).allowed).toBe(false);
    expect(runGates("Consigo 20% de desconto pra você hoje.", ctx({ config: reservado })).allowed).toBe(false);
  });

  it("antes do toque, dizer que não há cupom continua permitido (negação)", () => {
    const reservado = conversationCoupon(ativo, false);
    expect(runGates("Não temos cupom de desconto no momento.", ctx({ config: reservado })).allowed).toBe(true);
  });

  it("depois do toque, o cupom de 20% passa a cadeia", () => {
    const liberado = conversationCoupon(ativo, true);
    expect(runGates("Separei um cupom de 20% de desconto pra você!", ctx({ config: liberado })).allowed).toBe(true);
  });

  it("o prompt da conversa não ensina o cupom antes do toque", () => {
    const reservado = conversationCoupon(ativo, false);
    const prompt = systemPrompt(reservado, gateBriefing(reservado), null).replace(/\s+/g, " ");
    expect(prompt).not.toContain("do cupom");
    expect(prompt).not.toContain("está ativo e você pode citá-lo");
  });

  it("o toque do cupom (silence_3) continua saindo com o config do operador", () => {
    const render: RenderContext = { leadId: "lead-1", config: ativo, now: new Date("2026-09-10T10:00:00") };
    expect(renderFollowup("silence_3", render)).toContain("20% de desconto");
  });
});

describe("o marcador do toque sobrevive ao reagendamento (R17.4, revisão)", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");

  it("só o envio grava sent_at; cancelar não grava", () => {
    expect(source).toContain(
      'body: JSON.stringify(status === "sent" ? { status, sent_at: new Date().toISOString() } : { status }),',
    );
    expect(source).not.toContain("body: JSON.stringify({ status, sent_at: new Date().toISOString() }),");
  });

  it("o upsert da régua de silêncio não escreve sent_at (merge-duplicates preserva o do envio)", () => {
    const upsert = source.slice(source.indexOf("const ruler = oncePerDay(rulerFor("), source.indexOf('await db("followups?on_conflict=conversation_id,kind"'));
    expect(upsert).toContain('status: "scheduled",');
    expect(upsert).not.toContain("sent_at");
  });
});

describe("o turno liga o cupom ao toque (R17.4)", () => {
  const source = readFileSync(new URL("../supabase/functions/turn/index.ts", import.meta.url), "utf8");
  const turn = source.slice(source.indexOf("const handleTurn = async"));

  it("lê o silence_3 enviado a ela e monta o config do turno uma vez", () => {
    // `sent_at`, not `status`: the end-of-turn re-arm turns the row back into `scheduled`.
    expect(turn).toContain("kind=eq.silence_3&sent_at=not.is.null");
    expect(turn).not.toContain("kind=eq.silence_3&status=eq.sent");
    expect(turn).toContain("const turnConfig = conversationCoupon(CONFIG, couponTouchSent);");
  });

  it("nenhum gate nem prompt do turno lê o CONFIG cru, e a leitura de preço próprio usa o cupom do turno", () => {
    expect(turn).not.toContain("config: CONFIG,");
    expect(turn).not.toMatch(/systemPrompt\((?!turnConfig)/);
    expect(turn).toContain("const couponCut = turnConfig.coupon.active ? 1 - turnConfig.coupon.percent / 100 : null;");
    expect(turn).toContain("...(turnConfig.coupon.active ? [turnConfig.coupon.percent] : []),");
  });
});

/**
 * R17.4 (a), operator 2026-09-30: Logzz and Coinzz accept the coupon at checkout, so the touch
 * gives her the code to type. It used to promise "eu monto o pedido com o desconto já aplicado",
 * which nothing did.
 */
describe("o toque do cupom dá o código (R17.4 a)", () => {
  const render = (over: Partial<RenderContext> = {}): RenderContext => ({
    leadId: "lead-1",
    config: ativo,
    now: new Date("2026-09-10T10:00:00"),
    ...over,
  });

  it("diz o código e onde usar, sem prometer desconto aplicado por alguém", () => {
    const texto = renderFollowup("silence_3", render())!;
    expect(texto).toContain("**SUPER20**");
    expect(texto).toMatch(/no checkout/);
    expect(texto).not.toMatch(/já aplicado/);
    expect(texto).toMatch(/não te mando mais nada/);
  });

  it("sem código no config, o toque não sai (nada de cupom sem código)", () => {
    const semCodigo = { ...ativo, coupon: { percent: 20, active: true } };
    expect(renderFollowup("silence_3", render({ config: semCodigo }))).toBeNull();
    expect(renderFollowup("silence_3", render({ config: { ...ativo, coupon: { ...ativo.coupon, code: " " } } }))).toBeNull();
  });

  it("o texto do toque passa a cadeia de gates com o cupom do operador", () => {
    const texto = renderFollowup("silence_3", render())!;
    expect(runGates(texto, ctx({ config: ativo })).allowed).toBe(true);
  });

  it("o template pode levar o código como variável", () => {
    const comTemplate = render({
      config: {
        ...ativo,
        channel: { templates: { silence_3: { name: "s3", language: "pt_BR", variables: ["weekday", "couponPercent", "couponCode"] } } },
      } as RenderContext["config"],
      marketingOptIn: true,
    });
    const entrega = deliveryFor("silence_3", comTemplate, new Date("2026-09-01T10:00:00"));
    expect(entrega).toMatchObject({ via: "template", variables: ["Quinta", "20", "SUPER20"] });
  });

  it("depois do toque, o briefing da conversa traz o código; antes, não", () => {
    expect(gateBriefing(conversationCoupon(ativo, true)).join(" ")).toContain("SUPER20");
    expect(gateBriefing(conversationCoupon(ativo, false)).join(" ")).not.toContain("SUPER20");
  });
});
