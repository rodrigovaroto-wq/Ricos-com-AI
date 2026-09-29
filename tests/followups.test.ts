import { describe, expect, it } from "vitest";
import {
  pickVariant,
  renderFollowup,
  onOrderConfirmed,
  orderTakeOver,
  orderTouchDue,
  reopensRefused,
  rulerFor,
  scheduleOrder,
  scheduleSilence,
  decideTouch,
  nextOpening,
  windowIsOpen,
  deliveryFor,
  type RenderContext,
  type ExistingFollowup,
  type Remedy as FollowupRemedy,
} from "@/agent/followups.js";
import { remedyFor, runGates, type Remedy as GateRemedy } from "@/agent/guardrails.js";
import { config, ctx as gateCtx } from "./fixtures.js";

/**
 * O que o relógio de São Paulo marca naquele instante, de 0 a 23. `hourCycle: "h23"` e
 * não `hour12: false`: no Node 20 (ICU 78.2) `hour12: false` resolve para `h24` e a
 * meia-noite sai "24" — o teste da meia-noite passava ou falhava conforme qual `node`
 * estava primeiro no PATH.
 */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );

const render = (over: Partial<RenderContext> = {}): RenderContext => ({
  leadId: "lead-abc",
  config,
  now: new Date("2026-09-10T10:00:00"), // uma quinta
  ...over,
});

describe("régua de silêncio", () => {
  const now = new Date("2026-09-06T14:00:00");

  it("são três toques, espaçados como decidido", () => {
    const [t1, t2, t3] = scheduleSilence(now);
    expect(t1!.runAt.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(horaEmSP(t2!.runAt)).toBe(9);
    expect(t2!.runAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t3!.runAt.getTime() - now.getTime()).toBe(3 * 24 * 60 * 60_000);
  });

  // O horário é o do negócio, não o do servidor: a Edge Function roda em UTC, onde
  // "9h" virava 6h da manhã em Brasília.
  it("o segundo toque cai às 9h de Brasília, venha o instante de onde vier", () => {
    for (let h = 0; h < 24; h++) {
      const at = scheduleSilence(new Date(`2026-09-06T${String(h).padStart(2, "0")}:40:00Z`));
      expect(horaEmSP(at[1]!.runAt), `entrada ${h}:40Z`).toBe(9);
    }
  });

  it("o primeiro toque retoma do ponto exato onde ela parou", () => {
    expect(renderFollowup("silence_1", render({ stopPoint: "before_size" }))).toMatch(/tamanho de calça/i);
    expect(renderFollowup("silence_1", render({ stopPoint: "after_price" }))).toMatch(/não paga nada agora|não sai nada do seu bolso/i);
    expect(renderFollowup("silence_1", render({ stopPoint: "link_sent" }))).toMatch(/pedido/i);
  });

  it("o segundo toque muda de ângulo — não repete a frase do primeiro", () => {
    const t1 = renderFollowup("silence_1", render({ stopPoint: "after_price" }))!;
    const t2 = renderFollowup("silence_2", render())!;
    expect(t2).not.toBe(t1);
    expect(t2).toMatch(/7 dias/);
  });

  it("o terceiro toque fica em silêncio enquanto o cupom não existe na Coinzz", () => {
    expect(renderFollowup("silence_3", render())).toBeNull();
  });

  it("com o cupom ativo, o terceiro toque sai com a moldura do dia da semana", () => {
    const ativo = { ...config, coupon: { ...config.coupon, active: true } };
    const texto = renderFollowup("silence_3", render({ config: ativo }))!;
    expect(texto).toContain("Super Quinta");
    expect(texto).toContain("20% de desconto");
    expect(texto).toMatch(/não te mando mais nada/i); // saída digna
  });
});

/**
 * O checkout enviado e parado não podia mais depender só do toque de silêncio
 * genérico de 30 minutos (§R10.4): ele ganha um toque próprio, mais cedo.
 */
describe("régua de checkout não finalizado (§R10.4)", () => {
  const now = new Date("2026-09-06T14:00:00");

  it("sem stopPoint, o comportamento continua o de sempre — três toques", () => {
    const touches = scheduleSilence(now);
    expect(touches.map((t) => t.kind)).toEqual(["silence_1", "silence_2", "silence_3"]);
  });

  it("com link_sent, ganha um quarto toque aos 15 minutos, antes do de 30", () => {
    const touches = scheduleSilence(now, "link_sent");
    expect(touches.map((t) => t.kind)).toEqual([
      "checkout_reminder",
      "silence_1",
      "silence_2",
      "silence_3",
    ]);
    expect(touches[0]!.runAt.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(touches[1]!.runAt.getTime() - now.getTime()).toBe(30 * 60_000);
  });

  it("o toque de 15 min pergunta por problema ou ajuda, não só lembra", () => {
    const texto = renderFollowup("checkout_reminder", render())!;
    expect(texto).toMatch(/ajuda|dúvida|travou/i);
  });

  it("o toque de 30 min (link_sent) pergunta se ela conseguiu finalizar", () => {
    const texto = renderFollowup("silence_1", render({ stopPoint: "link_sent" }))!;
    expect(texto).toMatch(/conseguiu finalizar|deu certo de fechar/i);
  });

  it("mesma cliente, mesma variante do toque de 15 min — sem chamar modelo", () => {
    const a = renderFollowup("checkout_reminder", render({ leadId: "lead-1" }));
    const b = renderFollowup("checkout_reminder", render({ leadId: "lead-1" }));
    expect(a).toBe(b);
  });

  it("o toque de 15 min também reancora na reabertura, como o de silêncio", () => {
    expect(decideTouch("checkout_reminder", "defer")).toEqual({ do: "postpone", restartRuler: true });
  });

  it("passa pelos onze guardrails, como qualquer outro toque da régua", () => {
    const texto = renderFollowup("checkout_reminder", render())!;
    const veredito = runGates(texto, gateCtx({ now: new Date("2026-09-10T10:00:00"), stage: "presale" }));
    expect(veredito.traces.filter((t) => t.verdict === "block")).toEqual([]);
  });
});

describe("variantes sem chamar modelo", () => {
  it("mesma cliente, mesma variante", () => {
    const a = renderFollowup("silence_2", render({ leadId: "lead-1" }));
    const b = renderFollowup("silence_2", render({ leadId: "lead-1" }));
    expect(a).toBe(b);
  });

  it("clientes diferentes não recebem todas a mesma frase literal", () => {
    const textos = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
        renderFollowup("silence_2", render({ leadId: id })),
      ),
    );
    expect(textos.size).toBeGreaterThan(1);
  });

  it("a escolha é estável e dentro da lista", () => {
    expect(pickVariant("qualquer", ["x"])).toBe("x");
    expect(["x", "y"]).toContain(pickVariant("outro", ["x", "y"]));
  });
});

describe("régua de pós-pedido", () => {
  const ordered = new Date("2026-09-06T12:00:00");

  it("são quatro mensagens entre o pedido e a porta", () => {
    const plano = scheduleOrder(ordered, config.delivery.codDaysMin);
    expect(plano.map((p) => p.kind)).toEqual([
      "order_confirmed",
      "order_shipped",
      "order_eve",
      "order_delivered",
    ]);
  });

  it("a confirmação sai no mesmo dia e a véspera antes da entrega", () => {
    const [confirmado, , vespera] = scheduleOrder(ordered, 3);
    expect(confirmado!.runAt.getDate()).toBe(ordered.getDate());
    expect(vespera!.runAt.getTime()).toBeLessThan(ordered.getTime() + 3 * 24 * 60 * 60_000);
  });

  it("a véspera nunca sai antes do pedido existir, nem junto com o envio", () => {
    // Com a janela de 1 dia, `codDaysMin - 1` dava ZERO: "sua entrega é amanhã, separe
    // R$ 129,90" saía na hora do pedido, antes da própria confirmação.
    const [confirmado, envio, vespera] = scheduleOrder(ordered, 1);
    expect(vespera!.runAt.getTime()).toBeGreaterThan(confirmado!.runAt.getTime());
    expect(vespera!.runAt.getTime()).toBeGreaterThan(envio!.runAt.getTime());
  });

  it("a véspera manda separar o valor certo — é a mensagem que evita a recusa", () => {
    const texto = renderFollowup("order_eve", render())!;
    expect(texto).toContain("R$ 129,90");
    expect(texto).toMatch(/amanhã/i);
    expect(texto).toMatch(/maquininha/i);
  });

  it("num kit, a véspera e a confirmação falam do pedido, não do preço de 1 peça (quinta revisão)", () => {
    const vespera = renderFollowup("order_eve", render({ amountBrl: 233.82, units: 2, size: "M,G" }))!;
    expect(vespera).toContain("R$ 233,82");
    expect(vespera).not.toContain("129,90");
    const confirmado = renderFollowup("order_confirmed", render({ amountBrl: 233.82, units: 2, size: "M,G" }))!;
    expect(confirmado).toContain("Kit de 2 coletes, tamanhos **M e G**");
    expect(confirmado).toContain("R$ 233,82");
    expect(confirmado).not.toContain("129,90");
  });

  it("pedido antecipado: confirmação diz já pago e a véspera não manda separar dinheiro (sexta revisão)", () => {
    const confirmado = renderFollowup("order_confirmed", render({ amountBrl: 116.91, prepaid: true, size: "M" }))!;
    expect(confirmado).toContain("R$ 116,91, já pago");
    expect(confirmado).not.toContain("na entrega");
    const vespera = renderFollowup("order_eve", render({ amountBrl: 116.91, prepaid: true }))!;
    expect(vespera).not.toMatch(/separado|maquininha/);
    expect(vespera).toMatch(/amanhã/);
  });

  it("a confirmação repete tamanho e endereço", () => {
    const texto = renderFollowup("order_confirmed", render({ size: "G", address: "Rua das Flores, 120" }))!;
    expect(texto).toContain("G");
    expect(texto).toContain("Rua das Flores, 120");
  });
});

describe("toda mensagem da régua passa pelos onze guardrails", () => {
  const kinds = ["silence_1", "silence_2", "order_confirmed", "order_shipped", "order_eve", "order_delivered"] as const;

  it("nenhuma delas viola guardrail", () => {
    for (const kind of kinds) {
      const texto = renderFollowup(kind, render({ stopPoint: "after_price", size: "G" }))!;
      const veredito = runGates(texto, gateCtx({
        now: new Date("2026-09-10T10:00:00"),
        // Post-order messages report what logistics scheduled; they do not promise it.
        stage: kind.startsWith("order_") ? "logistics" : "presale",
      }));
      expect({ kind, blocked: veredito.traces.filter((t) => t.verdict === "block") }).toEqual({
        kind,
        blocked: [],
      });
    }
  });

  it("o toque do cupom é vetado pelo gate se escapar com o cupom inativo", () => {
    const ativo = { ...config, coupon: { ...config.coupon, active: true } };
    const texto = renderFollowup("silence_3", render({ config: ativo }))!;
    // Mesmo texto, agora julgado com o cupom desligado: o gate tem que barrar.
    const veredito = runGates(texto, gateCtx({ now: new Date("2026-09-10T10:00:00") }));
    expect(veredito.traces.filter((t) => t.verdict === "block").map((t) => t.gate)).toContain(
      "coupon_exists",
    );
  });
});

/**
 * A régua de silêncio se destruía de madrugada, e este é o motivo: quem para de
 * responder às 23:30 tem o `silence_1` vencendo à meia-noite, fora da janela 6-24.
 * A varredura tratava todo bloqueio como cancelamento, então o toque mais valioso da
 * régua — o de 30 minutos depois — era jogado fora em vez de sair ao amanhecer.
 */
describe("o relógio adia o toque, não o destrói", () => {
  it("o silence_1 de quem sumiu às 23:30 vence à meia-noite, fora da janela", () => {
    const [first] = scheduleSilence(new Date("2026-09-08T02:30:00Z")); // 23:30 BRT
    expect(horaEmSP(first!.runAt)).toBe(0);
  });

  it("e o veto que ele leva ali é de adiar, não de cancelar", () => {
    const text = renderFollowup("silence_1", {
      leadId: "l1",
      config,
      stopPoint: "before_size",
    })!;
    const gates = runGates(
      text,
      gateCtx({ now: new Date("2026-09-08T03:00:00Z"), stage: "presale" }), // 00:00 BRT
    );
    expect(gates.allowed).toBe(false);
    expect(remedyFor(gates)).toBe("defer");
  });

  it("a reabertura cai dentro da janela configurada", () => {
    const runAt = nextOpening(new Date("2026-09-08T03:00:00Z"), config.hours.openHour);
    expect(horaEmSP(runAt)).toBe(config.hours.openHour);
  });
});

/**
 * A decisão que a varredura consulta. Ela vive aqui, e não dentro da Edge Function,
 * porque ali nenhum teste alcança: a versão anterior desta correção podia ser apagada
 * inteira sem que um único teste falhasse.
 */
describe("decideTouch — o que a varredura faz com um toque barrado", () => {
  it("sem veto, manda", () => {
    expect(decideTouch("silence_1", null)).toEqual({ do: "send" });
  });

  it("veto de conteúdo cancela: reescrever copy determinística não faz sentido", () => {
    expect(decideTouch("silence_1", "rewrite")).toEqual({ do: "cancel" });
    expect(decideTouch("order_eve", "stop")).toEqual({ do: "cancel" });
  });

  it("veto de relógio adia, e a régua de silêncio é reancorada na reabertura", () => {
    expect(decideTouch("silence_1", "defer")).toEqual({ do: "postpone", restartRuler: true });
    expect(decideTouch("silence_3", "defer")).toEqual({ do: "postpone", restartRuler: true });
  });

  it("mas o pós-pedido e a resposta adiada só se movem — a hora deles é a própria mensagem", () => {
    expect(decideTouch("order_eve", "defer")).toEqual({ do: "postpone", restartRuler: false });
    expect(decideTouch("deferred_reply", "defer")).toEqual({ do: "postpone", restartRuler: false });
  });

  it("reancorar preserva o espaçamento que arrastar um toque só destruiria", () => {
    // Sumiu às 23:30; a janela reabre às 06:00. Arrastar só o silence_1 deixaria ele
    // às 06:00 e o silence_2 às 09:00 — três horas, não nove.
    const opening = nextOpening(new Date("2026-09-08T03:00:00Z"), config.hours.openHour);
    const [um, dois] = scheduleSilence(opening);
    const horas = (dois!.runAt.getTime() - um!.runAt.getTime()) / 3_600_000;
    expect(horas).toBeGreaterThan(6);
  });
});

/**
 * `Remedy` é declarado três vezes de propósito — `guardrails.ts`, `retry.ts` e
 * `followups.ts` têm zero imports para espelhar byte a byte na Edge Function. Isto
 * falha se alguém acrescentar uma classe em um lado só.
 */
describe("as três declarações de Remedy continuam a mesma coisa", () => {
  it("uma é atribuível à outra", () => {
    const daCadeia: GateRemedy = "defer";
    const daRegua: FollowupRemedy = daCadeia;
    expect(daRegua).toBe("defer");
  });
});

/**
 * O que uma venda confirmada faz com a régua. A metade que faltava não era armar o
 * pós-pedido — era cancelar o silêncio: até 2026-09-09 nada aqui sabia que uma venda
 * tinha acontecido, e quem pagava na porta recebia "ainda tá pensando?" três dias depois.
 */
describe("venda confirmada", () => {
  const quando = new Date("2026-09-09T15:00:00Z");

  const agendado = (...kinds: string[]) =>
    kinds.map((kind) => ({ kind, status: "scheduled" }) as never);

  it("cancela todo toque de silêncio ainda agendado", () => {
    const efeito = onOrderConfirmed(agendado("silence_1", "silence_2", "silence_3"), quando, 1);
    expect(efeito.cancel).toEqual(["silence_1", "silence_2", "silence_3"]);
  });

  it("arma a régua de pós-pedido inteira", () => {
    const efeito = onOrderConfirmed([], quando, 1);
    expect(efeito.arm.map((f) => f.kind)).toEqual([
      "order_confirmed",
      "order_shipped",
      "order_eve",
      "order_delivered",
    ]);
  });

  it("um segundo webhook do mesmo pedido não mexe no que já está agendado", () => {
    // Retry e mudança de status chegam de novo. Rearmar arrastaria a véspera da entrega
    // para outra data, que é a mensagem que evita a recusa na porta.
    const efeito = onOrderConfirmed(agendado("order_confirmed", "order_shipped"), quando, 1);
    expect(efeito.arm.map((f) => f.kind)).toEqual(["order_eve", "order_delivered"]);
    expect(efeito.cancel).toEqual([]);
  });

  it("não cancela um toque de pós-pedido junto", () => {
    const efeito = onOrderConfirmed(agendado("silence_2", "order_confirmed"), quando, 1);
    expect(efeito.cancel).toEqual(["silence_2"]);
  });
});

/**
 * O achado do code review: `arm` só olhava o que estava `scheduled`. Um segundo webhook
 * chegando depois que o `order_confirmed` já saiu rearmava um kind que a tabela guarda
 * como `sent` — e `unique (conversation_id, kind)` transforma isso num throw que derruba
 * a chamada inteira, perde o status e faz o n8n bater de novo na mesma parede.
 */
describe("segundo webhook depois que um toque já saiu", () => {
  it("não rearma um kind já enviado", () => {
    const efeito = onOrderConfirmed(
      [
        { kind: "order_confirmed", status: "sent" },
        { kind: "silence_1", status: "sent" },
        { kind: "silence_2", status: "scheduled" },
      ],
      new Date("2026-09-09T15:00:00Z"),
      1,
    );
    expect(efeito.arm.map((f) => f.kind)).toEqual(["order_shipped", "order_eve", "order_delivered"]);
    // O toque de silêncio que já saiu não tem o que cancelar; o que ainda espera, sim.
    expect(efeito.cancel).toEqual(["silence_2"]);
  });
});

describe("janela de 24h da Cloud API", () => {
  const seteDaManha = new Date("2026-09-10T10:00:00Z");

  it("dentro de 24h desde a última mensagem dela, texto livre", () => {
    const ontem = new Date(seteDaManha.getTime() - 23 * 60 * 60 * 1000);
    expect(windowIsOpen(seteDaManha, ontem)).toBe(true);
  });

  it("24h cravadas já está fora — o limite é o toque que a Meta recusa", () => {
    const exatas = new Date(seteDaManha.getTime() - 24 * 60 * 60 * 1000);
    expect(windowIsOpen(seteDaManha, exatas)).toBe(false);
  });

  it("sem nenhuma mensagem dela, a janela nunca abriu", () => {
    expect(windowIsOpen(seteDaManha, null)).toBe(false);
  });

  // Revisão de segurança (2026-09-25): a varredura decide agora e o envio sai depois; a
  // Meta julga na hora do envio. Os últimos 10 minutos já contam como fechados.
  it("nos últimos 10 minutos da janela já é template, não texto livre", () => {
    const quase = new Date(seteDaManha.getTime() - (24 * 60 - 5) * 60 * 1000);
    const antes = new Date(seteDaManha.getTime() - (24 * 60 - 11) * 60 * 1000);
    expect(windowIsOpen(seteDaManha, quase)).toBe(false);
    expect(windowIsOpen(seteDaManha, antes)).toBe(true);
  });
});

describe("entrega do toque — texto livre ou template aprovado", () => {
  const agora = new Date("2026-09-10T10:00:00Z");
  const dentro = new Date(agora.getTime() - 60 * 60 * 1000);
  const fora = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000);

  const comTemplate = (over: Partial<RenderContext> = {}): RenderContext =>
    render({
      now: agora,
      config: {
        ...config,
        channel: {
          templates: {
            silence_2: {
              name: "encorpa_silencio_2",
              language: "pt_BR",
              variables: ["warrantyDays"],
            },
            order_eve: {
              name: "encorpa_vespera",
              language: "pt_BR",
              variables: ["price", "size"],
            },
          },
        },
      },
      ...over,
    });

  it("dentro da janela vai como texto, e o texto é o mesmo de sempre", () => {
    const entrega = deliveryFor("silence_2", comTemplate(), dentro);
    expect(entrega).toEqual({
      via: "text",
      body: renderFollowup("silence_2", comTemplate()),
    });
  });

  it("fora da janela vira template, com as variáveis na ordem aprovada", () => {
    const entrega = deliveryFor("order_eve", comTemplate({ size: "GG" }), fora);
    expect(entrega).toMatchObject({
      via: "template",
      name: "encorpa_vespera",
      language: "pt_BR",
      variables: ["R$ 129,90", "GG"],
    });
  });

  it("o corpo renderizado viaja junto com o template — é o que os gates leem e o que ela lê", () => {
    const entrega = deliveryFor("order_eve", comTemplate({ size: "GG" }), fora);
    expect(entrega).toMatchObject({
      body: renderFollowup("order_eve", comTemplate({ size: "GG" })),
    });
  });

  it("fora da janela sem template aprovado, o toque não sai", () => {
    const entrega = deliveryFor("silence_3", comTemplate({ config: { ...config, coupon: { ...config.coupon, active: true } }, marketingOptIn: true }), fora);
    expect(entrega).toEqual({ via: "blocked", reason: "no_template" });
  });

  it("variável vazia é template recusado pela Meta — barra antes de tentar", () => {
    const entrega = deliveryFor("order_eve", comTemplate(), fora);
    expect(entrega).toEqual({ via: "blocked", reason: "empty_variable" });
  });

  it("nada a dizer continua sendo nada a dizer, dentro ou fora da janela", () => {
    expect(deliveryFor("silence_3", comTemplate(), dentro)).toBeNull();
    expect(deliveryFor("silence_3", comTemplate(), fora)).toBeNull();
  });

  it("config sem a chave `channel` bloqueia todo toque fora da janela, e nenhum dentro", () => {
    expect(deliveryFor("silence_2", render({ now: agora, marketingOptIn: true }), fora)).toEqual({
      via: "blocked",
      reason: "no_template",
    });
    expect(deliveryFor("silence_2", render({ now: agora }), dentro)).toMatchObject({ via: "text" });
  });

  // R15.1: `silence_2` e `silence_3` fora da janela são template MARKETING — só com opt-in.
  it("marketing fora da janela sem opt-in não sai, mesmo com template aprovado", () => {
    const ativo = { ...config, coupon: { ...config.coupon, active: true } };
    const todos = {
      ...ativo,
      channel: { templates: { silence_2: { name: "s2", language: "pt_BR", variables: [] }, silence_3: { name: "s3", language: "pt_BR", variables: [] } } },
    };
    for (const kind of ["silence_2", "silence_3"] as const) {
      expect(deliveryFor(kind, render({ now: agora, config: todos }), fora), kind).toEqual({ via: "blocked", reason: "no_opt_in" });
      expect(deliveryFor(kind, render({ now: agora, config: todos, marketingOptIn: false }), fora), kind).toEqual({ via: "blocked", reason: "no_opt_in" });
      expect(deliveryFor(kind, render({ now: agora, config: todos, marketingOptIn: true }), fora), kind).toMatchObject({ via: "template", name: kind === "silence_2" ? "s2" : "s3" });
      // Dentro da janela é conversa que ela abriu: texto livre, sem depender de opt-in.
      expect(deliveryFor(kind, render({ now: agora, config: todos }), dentro), kind).toMatchObject({ via: "text" });
    }
  });

  it("toque UTILITY não depende de opt-in", () => {
    expect(deliveryFor("order_eve", comTemplate({ size: "GG" }), fora)).toMatchObject({ via: "template", name: "encorpa_vespera" });
  });

  // 03-templates-meta.md §4: o template da véspera cobra "Deixa R$ X separado"; a quem já pagou,
  // só o dela, ou nada.
  it("véspera do antecipado fora da janela: o template dela, ou bloqueado — nunca o que cobra", () => {
    expect(deliveryFor("order_eve", comTemplate({ size: "GG", prepaid: true }), fora)).toEqual({ via: "blocked", reason: "no_template" });
    const pago = comTemplate({ size: "GG", prepaid: true });
    const comPago = {
      ...pago,
      config: { ...pago.config, channel: { templates: { ...pago.config.channel!.templates, order_eve_pago: { name: "encorpa_vespera_entrega_pago", language: "pt_BR", variables: [] } } } },
    };
    expect(deliveryFor("order_eve", comPago, fora)).toEqual({
      via: "template",
      name: "encorpa_vespera_entrega_pago",
      language: "pt_BR",
      variables: [],
      body: renderFollowup("order_eve", comPago),
    });
    expect(renderFollowup("order_eve", comPago)).not.toContain("separado");
  });

  // R15.2: fora da janela vai sempre a primeira variante, e o corpo é ela — é o que o gate lê.
  it("silence_2 fora da janela é a primeira variante em todo lead; dentro, alterna como sempre", () => {
    const corpos = new Set<string>();
    const dentroCorpos = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const c = comTemplate({ leadId: `lead-${i}`, marketingOptIn: true });
      const d = deliveryFor("silence_2", c, fora);
      if (d?.via !== "template") throw new Error(JSON.stringify(d));
      corpos.add(d.body);
      dentroCorpos.add((deliveryFor("silence_2", c, dentro) as { body: string }).body);
    }
    expect([...corpos]).toHaveLength(1);
    expect([...corpos][0]).toMatch(/^Bom dia! 💛 Passando só pra dizer/);
    expect(dentroCorpos.size).toBe(2);
  });
});

describe("pedido morto — cancelado, recusado, devolvido", () => {
  const orderedAt = new Date("2026-09-09T12:00:00Z");
  const armada: ExistingFollowup[] = [
    { kind: "order_confirmed", status: "sent" },
    { kind: "order_shipped", status: "scheduled" },
    { kind: "order_eve", status: "scheduled" },
    { kind: "order_delivered", status: "scheduled" },
    { kind: "silence_3", status: "scheduled" },
  ];

  it.each([
    "Cancelado",
    "cancelado pelo cliente",
    "Recusado na entrega",
    "Devolvido",
    "Estornado",
    "Reembolsado",
    "refunded",
  ])("«%s» desarma a régua inteira e não arma nada", (status) => {
    const efeito = onOrderConfirmed(armada, orderedAt, 1, status);
    expect(efeito.arm).toEqual([]);
    expect(efeito.cancel).toEqual(
      expect.arrayContaining(["order_shipped", "order_eve", "order_delivered", "silence_3"]),
    );
  });

  it("o que já saiu não é cancelado — não dá para desfazer uma mensagem entregue", () => {
    expect(onOrderConfirmed(armada, orderedAt, 1, "Cancelado").cancel).not.toContain(
      "order_confirmed",
    );
  });

  // "Entregue" saiu desta lista: ela armava a véspera de uma entrega que já aconteceu (ver
  // "pedido entregue" abaixo).
  it.each(["Agendado", "Em separação", "Enviado", "Pago", undefined])(
    "«%s» não é morte: a régua segue de pé",
    (status) => {
      const efeito = onOrderConfirmed([], orderedAt, 1, status);
      expect(efeito.arm.map((f) => f.kind)).toEqual([
        "order_confirmed",
        "order_shipped",
        "order_eve",
        "order_delivered",
      ]);
    },
  );

  it("a véspera é o toque que isso existe para não mandar", () => {
    // "Sua entrega está marcada pra amanhã, deixa R$ 129,90 separado" para quem cancelou
    // é a mensagem que queima o número e a marca de uma vez.
    const efeito = onOrderConfirmed(armada, orderedAt, 1, "Cancelado");
    expect(efeito.cancel).toContain("order_eve");
  });
});

/**
 * Pedido entregue (HANDOFF, "obrigatório antes de leads reais"): `onOrderConfirmed` só olhava
 * a morte do pedido; qualquer outro status cancelava o silêncio e deixava a régua pós-pedido
 * inteira. A véspera ("sua entrega está marcada pra amanhã, deixa R$ 129,90 separado") é
 * armada a orderedAt+30h e saía depois do "Entregue" — e o primeiro webhook já "Entregue"
 * armava a régua inteira. Entregue, só o "Chegou?!" ainda tem o que dizer.
 */
describe("pedido entregue: véspera, envio e confirmação não saem depois da entrega", () => {
  const orderedAt = new Date("2026-09-28T12:00:00Z");
  const armada: ExistingFollowup[] = [
    { kind: "order_confirmed", status: "sent", orderId: "A" },
    { kind: "order_shipped", status: "scheduled", orderId: "A" },
    { kind: "order_eve", status: "scheduled", orderId: "A" },
    { kind: "order_delivered", status: "scheduled", orderId: "A" },
  ];

  it.each(["Entregue", "delivered", "Concluído", "Aprovado / Entregue"])("«%s» cancela véspera e envio pendentes", (status) => {
    const efeito = onOrderConfirmed(armada, orderedAt, 1, status, "A");
    expect(efeito.cancel).toEqual(["order_shipped", "order_eve"]);
    expect(efeito.arm).toEqual([]);
  });

  it("o primeiro webhook já entregue arma só o toque de depois da entrega", () => {
    expect(onOrderConfirmed([], orderedAt, 1, "Entregue", "A").arm.map((f) => f.kind)).toEqual(["order_delivered"]);
  });

  it("a entrega do pedido A não cala a véspera do pedido B", () => {
    const deB: ExistingFollowup[] = [{ kind: "order_eve", status: "scheduled", orderId: "B" }];
    expect(onOrderConfirmed(deB, orderedAt, 1, "Entregue", "A").cancel).toEqual([]);
  });

  it("em rota, a véspera segue de pé", () => {
    expect(onOrderConfirmed(armada, orderedAt, 1, "Em rota de entrega", "A").cancel).toEqual([]);
  });

  it("o pedido vivo que herda do morto já entregue não herda a véspera", () => {
    const h = 3_600_000;
    const doMorto: ExistingFollowup[] = (["order_shipped", "order_eve", "order_delivered"] as const).map((kind) => ({
      kind,
      status: "canceled",
      orderId: "A",
    }));
    const r = orderTakeOver(
      doMorto,
      { id: "B", status: "Entregue", orderedAt },
      [{ id: "A", status: "Cancelado", orderedAt }],
      new Date(orderedAt.getTime() + h),
      1,
    );
    expect(r?.arm.map((f) => f.kind)).toEqual(["order_delivered"]);
  });

  it.each([
    ["order_eve", "Entregue", false],
    ["order_shipped", "Entregue", false],
    ["order_confirmed", "Entregue", false],
    ["order_delivered", "Entregue", true],
    ["order_eve", "Cancelado", false],
    ["order_delivered", "Recusado na entrega", false],
    ["order_eve", "Em rota de entrega", true],
    ["order_eve", "Não entregue", true],
    ["order_eve", "created", true],
  ] as const)("a varredura: %s com o pedido «%s» ainda sai? %s", (kind, status, esperado) => {
    expect(orderTouchDue(kind, status)).toBe(esperado);
  });
});

/**
 * Dois pedidos no mesmo lead (pendência do HANDOFF, 2026-09-26). O toque pós-pedido guarda o
 * pedido que o armou (`followups.order_id`); a morte de um pedido não cala a entrega do outro.
 * Linha sem pedido (anterior à migração 0017) segue a regra antiga: morre com qualquer pedido.
 */
describe("dois pedidos no mesmo lead", () => {
  const orderedAt = new Date("2026-09-26T15:00:00Z");
  const doPedidoA = [
    { kind: "order_eve", status: "scheduled", orderId: "A" },
    { kind: "order_delivered", status: "scheduled", orderId: "A" },
    { kind: "silence_3", status: "scheduled", orderId: null },
  ] as never;

  it("o cancelamento do pedido B não cala a véspera do pedido A", () => {
    const efeito = onOrderConfirmed(doPedidoA, orderedAt, 1, "Cancelado", "B");
    expect(efeito.cancel).toEqual(["silence_3"]);
    expect(efeito.arm).toEqual([]);
  });

  it("o cancelamento do próprio pedido A cala os toques dele", () => {
    const efeito = onOrderConfirmed(doPedidoA, orderedAt, 1, "Cancelado", "A");
    expect(efeito.cancel).toEqual(["order_eve", "order_delivered", "silence_3"]);
  });

  it("linha sem pedido guardado morre com qualquer pedido, como antes", () => {
    const antigas = [{ kind: "order_eve", status: "scheduled", orderId: null }] as never;
    expect(onOrderConfirmed(antigas, orderedAt, 1, "Cancelado", "B").cancel).toEqual(["order_eve"]);
  });

  it("sem o id do pedido que morreu, tudo morre, como antes", () => {
    expect(onOrderConfirmed(doPedidoA, orderedAt, 1, "Cancelado").cancel).toEqual([
      "order_eve",
      "order_delivered",
      "silence_3",
    ]);
  });
});

/**
 * Segunda revisão (2026-09-28), provada antes por execução da Edge Function contra um
 * PostgREST falso. Duas falhas da régua de silêncio e duas do pós-pedido com dois pedidos.
 */
describe("régua reancorada recomeça no toque adiado", () => {
  const reabertura = new Date("2026-09-29T09:00:00Z"); // 06:00 em São Paulo
  const kinds = (postponed?: Parameters<typeof rulerFor>[2]) =>
    rulerFor(reabertura, "after_price", postponed).map((f) => f.kind);

  it("silence_2 adiado não rearma o silence_1 que já saiu", () => {
    expect(kinds("silence_2")).toEqual(["silence_2", "silence_3"]);
  });
  it("silence_3 adiado não rearma o silence_1 nem o silence_2", () => {
    expect(kinds("silence_3")).toEqual(["silence_3"]);
  });
  it("silence_1 adiado e régua nova seguem inteiras", () => {
    expect(kinds("silence_1")).toEqual(["silence_1", "silence_2", "silence_3"]);
    expect(kinds()).toEqual(["silence_1", "silence_2", "silence_3"]);
  });
});

describe("o lembrete de 15 min só no turno que mandou o link", () => {
  const agora = new Date("2026-09-28T15:00:00Z");
  it("o turno depois do link segue em link_sent, sem lembrete novo", () => {
    const regua = rulerFor(agora, "link_sent", undefined, false);
    expect(regua.map((f) => f.kind)).toEqual(["silence_1", "silence_2", "silence_3"]);
  });
  it("o turno que mandou o link arma o lembrete aos 15 minutos", () => {
    const [primeiro] = rulerFor(agora, "link_sent", undefined, true);
    expect(primeiro).toEqual({ kind: "checkout_reminder", runAt: new Date(agora.getTime() + 15 * 60_000) });
  });
  it("reancorada, a régua ignora o link desta resposta: só o lembrete adiado volta", () => {
    expect(rulerFor(agora, "link_sent", "silence_1", true).map((f) => f.kind)[0]).toBe("silence_1");
    expect(rulerFor(agora, "link_sent", "checkout_reminder", false).map((f) => f.kind)[0]).toBe("checkout_reminder");
  });
});

describe("dois pedidos: o vivo herda os toques do morto", () => {
  const h = 3_600_000;
  const criadoA = new Date("2026-09-28T15:00:00Z");
  const criadoB = new Date("2026-09-28T16:00:00Z");
  const agora = new Date("2026-09-28T17:00:00Z");
  const dosA = (status: "scheduled" | "canceled" | "sent" = "scheduled"): ExistingFollowup[] =>
    (["order_confirmed", "order_shipped", "order_eve", "order_delivered"] as const).map((kind) => ({
      kind,
      status: kind === "order_confirmed" ? "sent" : status,
      orderId: "A",
    }));

  it("A e B criados, A cancelado: véspera e entrega passam para B, nas datas de B", () => {
    const r = orderTakeOver(
      dosA(),
      { id: "A", status: "Cancelado", orderedAt: criadoA },
      [{ id: "B", status: "created", orderedAt: criadoB }],
      agora,
      1,
    );
    expect(r?.orderId).toBe("B");
    expect(r?.arm).toEqual([
      { kind: "order_shipped", runAt: new Date(criadoB.getTime() + 24 * h) },
      { kind: "order_eve", runAt: new Date(criadoB.getTime() + 30 * h) },
      { kind: "order_delivered", runAt: new Date(criadoB.getTime() + 48 * h) },
    ]);
  });
  it("o que já saiu não muda de pedido, e hora que já passou não sai atrasada", () => {
    const r = orderTakeOver(
      dosA(),
      { id: "A", status: "Cancelado", orderedAt: criadoA },
      [{ id: "B", status: "created", orderedAt: criadoB }],
      new Date(criadoB.getTime() + 25 * h),
      1,
    );
    expect(r?.arm.map((f) => f.kind)).toEqual(["order_eve", "order_delivered"]);
  });
  it("A cancelado antes, B criado depois: B toma as linhas canceladas de A", () => {
    const r = orderTakeOver(
      dosA("canceled"),
      { id: "B", status: "created", orderedAt: agora },
      [{ id: "A", status: "Cancelado", orderedAt: criadoA }],
      agora,
      1,
    );
    expect(r?.orderId).toBe("B");
    expect(r?.arm.map((f) => f.kind)).toEqual(["order_shipped", "order_eve", "order_delivered"]);
  });
  it("webhook atrasado do MESMO pedido cancelado não traz os toques dele de volta", () => {
    expect(
      orderTakeOver(dosA("canceled"), { id: "A", status: "Enviado", orderedAt: criadoA }, [], agora, 1),
    ).toBeNull();
  });
  it("sem pedido vivo, ninguém herda; pedido vivo dono das linhas, nada muda", () => {
    expect(
      orderTakeOver(dosA(), { id: "A", status: "Cancelado", orderedAt: criadoA }, [{ id: "B", status: "Cancelado", orderedAt: criadoB }], agora, 1),
    ).toBeNull();
    expect(
      orderTakeOver(dosA(), { id: "B", status: "Cancelado", orderedAt: criadoB }, [{ id: "A", status: "created", orderedAt: criadoA }], agora, 1),
    ).toBeNull();
  });
  it("linha sem pedido guardado (antes da 0017) não muda de dono", () => {
    const antigas: ExistingFollowup[] = [{ kind: "order_eve", status: "canceled", orderId: null }];
    expect(
      orderTakeOver(antigas, { id: "B", status: "created", orderedAt: agora }, [{ id: "A", status: "Cancelado", orderedAt: criadoA }], agora, 1),
    ).toBeNull();
  });
});

describe("recusado reabre com uma venda nova", () => {
  it.each([
    ["created", ["Cancelado"], true],
    ["Entregue", ["Recusado na entrega"], true],
    ["Enviado", [], false],
    ["Cancelado", ["Cancelado"], false],
    ["Entregue", ["Entregue"], false],
  ] as const)("«%s» com os outros %j → %s", (status, outros, esperado) => {
    expect(reopensRefused(status, outros)).toBe(esperado);
  });
});

// A Edge Function roda em UTC: entre 21h e 23h59 de São Paulo o servidor já está no
// dia seguinte. Instantes UTC explícitos, para o teste quebrar onde o bug mora.
describe("dia da semana do terceiro toque — o de São Paulo, não o do servidor", () => {
  const ativo = { ...config, coupon: { ...config.coupon, active: true } };
  const quintaNoite = new Date("2026-09-25T01:00:00Z"); // quinta 22h em SP, sexta em UTC
  const sextaManha = new Date("2026-09-25T13:00:00Z"); // sexta 10h em SP
  const comWeekday = (now: Date): RenderContext =>
    render({
      now,
      config: {
        ...ativo,
        channel: {
          templates: {
            silence_3: { name: "encorpa_silencio_3", language: "pt_BR", variables: ["weekday"] },
          },
        },
      },
      marketingOptIn: true,
    });
  const fora = (now: Date) => new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  it("quinta 22h em São Paulo é quinta no texto", () => {
    expect(renderFollowup("silence_3", render({ config: ativo, now: quintaNoite }))).toContain("Super Quinta");
  });

  it("quinta 22h em São Paulo é quinta na variável do template", () => {
    expect(deliveryFor("silence_3", comWeekday(quintaNoite), fora(quintaNoite))).toMatchObject({
      via: "template",
      variables: ["Quinta"],
    });
  });

  it("sexta 10h em São Paulo é sexta, nos dois lugares", () => {
    expect(renderFollowup("silence_3", render({ config: ativo, now: sextaManha }))).toContain("Super Sexta");
    expect(deliveryFor("silence_3", comWeekday(sextaManha), fora(sextaManha))).toMatchObject({
      via: "template",
      variables: ["Sexta"],
    });
  });
});

/**
 * Toda variante de todo toque, pela cadeia inteira, com o contexto que a varredura monta
 * (index.ts: layer "agent", paymentPath do pedido ou da escolha fresca, units,
 * orderAmountBrl do pedido, stage "logistics" nos order_* e "presale" nos demais). Um veto
 * de reescrita aqui é um toque que decideTouch CANCELA em silêncio — foi assim que o
 * silence_1 "…esperando um dia bom" morreu no caminho antecipado (M-08, revisão de integração).
 * deferred_reply fica de fora: o corpo é o texto do modelo, já julgado no turno.
 */
describe("todo toque da régua passa pelos gates, em toda variante", () => {
  const kinds = [
    "checkout_reminder",
    "silence_1",
    "silence_2",
    "silence_3",
    "order_confirmed",
    "order_shipped",
    "order_eve",
    "order_delivered",
  ] as const;
  const leadIds = ["a", "b", "c", "d", "e", "f", "g", "h", "lead-abc", "lead-1"];
  // Os sete dias da semana, às 10h de São Paulo — o silence_3 escreve o dia.
  const nows = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 8, 7 + i, 13)));
  const casos: { rotulo: string; texto: string; ctx: ReturnType<typeof gateCtx> }[] = [];
  for (const kind of kinds)
    for (const stopPoint of ["before_size", "after_price", "link_sent"] as const)
      for (const paymentPath of ["cod", "prepay"] as const)
        for (const units of [1, 2])
          for (const prepaid of [false, true])
            for (const active of [false, true])
              for (const leadId of leadIds)
                for (const now of kind === "silence_3" ? nows : [nows[3]!]) {
                  const order = kind.startsWith("order_");
                  // Fora do pós-pedido não há pedido: prepaid só existe com ele.
                  if (!order && prepaid) continue;
                  const amountBrl = units > 1 ? 233.82 : undefined;
                  const texto = renderFollowup(kind, {
                    leadId,
                    config: { ...config, coupon: { ...config.coupon, active } },
                    stopPoint,
                    now,
                    size: units > 1 ? "M,G" : "M",
                    address: "Rua das Flores, 10",
                    units,
                    prepaid,
                    ...(order && amountBrl ? { amountBrl } : {}),
                  });
                  if (texto === null) continue;
                  casos.push({
                    rotulo: [kind, stopPoint, paymentPath, "u" + units, prepaid ? "pago" : "na-entrega", leadId].join("/"),
                    texto,
                    ctx: gateCtx({
                      config: { ...config, coupon: { ...config.coupon, active } },
                      now,
                      paymentPath: order ? (prepaid ? "prepay" : "cod") : paymentPath,
                      units,
                      ...(order && amountBrl ? { orderAmountBrl: amountBrl } : {}),
                      stage: order ? "logistics" : "presale",
                    }),
                  });
                }

  it("cobre as duas variantes sorteadas de cada toque que sorteia", () => {
    for (const [kind, n] of [["checkout_reminder", 2], ["silence_1", 6], ["silence_2", 2]] as const)
      expect(new Set(casos.filter((c) => c.rotulo.startsWith(kind + "/")).map((c) => c.texto)).size).toBe(n);
  });

  it("zero vetos, em qualquer caminho", () => {
    const vetos = casos.flatMap((c) =>
      runGates(c.texto, c.ctx)
        .traces.filter((t) => t.verdict === "block")
        .map((t) => c.rotulo + ": " + t.gate + " — " + t.detail),
    );
    expect([...new Set(vetos)]).toEqual([]);
  });
});
