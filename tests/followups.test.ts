import { describe, expect, it } from "vitest";
import {
  pickVariant,
  renderFollowup,
  onOrderConfirmed,
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

/** O que o relógio de São Paulo marca naquele instante. */
const horaEmSP = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
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
    const entrega = deliveryFor("silence_3", comTemplate({ config: { ...config, coupon: { ...config.coupon, active: true } } }), fora);
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
    expect(deliveryFor("silence_2", render({ now: agora }), fora)).toEqual({
      via: "blocked",
      reason: "no_template",
    });
    expect(deliveryFor("silence_2", render({ now: agora }), dentro)).toMatchObject({ via: "text" });
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

  it.each(["Agendado", "Em separação", "Enviado", "Entregue", "Pago", undefined])(
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
