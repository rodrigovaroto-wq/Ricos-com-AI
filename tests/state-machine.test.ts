import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  STAGES,
  canTransition,
  furthest,
  isLive,
  overwritableBy,
  rankOf,
  reachedStage,
  transition,
} from "@/agent/state-machine.js";
import { buildCoinzzRequest, type CoinzzConfig, type CoinzzRequest } from "@/agent/coinzz.js";
import { isIdentityComplete, type Identity } from "@/agent/identity.js";
import type { Address } from "@/agent/address.js";

describe("máquina de estados", () => {
  it("não regride: quem já tem pedido não volta a conversar", () => {
    expect(canTransition("pedido_criado", "conversando")).toBe(false);
    expect(() => transition("pedido_criado", "conversando", "mandou oi de novo")).toThrow(
      InvalidTransitionError,
    );
  });

  it("avança pelo caminho feliz", () => {
    expect(canTransition("novo", "conversando")).toBe(true);
    expect(canTransition("conversando", "tamanho_definido")).toBe(true);
    expect(canTransition("endereco_coletado", "pedido_criado")).toBe(true);
    expect(canTransition("em_rota", "entregue_pago")).toBe(true);
  });

  it("exige evidência para avançar", () => {
    expect(() => transition("novo", "conversando", "  ")).toThrow(/evidência/);
    expect(transition("novo", "conversando", "respondeu: quero sim").to).toBe("conversando");
  });

  it("bloqueado é terminal para o agente", () => {
    expect(canTransition("bloqueado", "conversando")).toBe(false);
    expect(canTransition("bloqueado", "perdido")).toBe(false);
  });

  it("perdido pode voltar sozinha", () => {
    expect(canTransition("perdido", "conversando")).toBe(true);
  });

  it("sabe onde ainda vale gastar modelo", () => {
    expect(isLive("conversando")).toBe(true);
    expect(isLive("entregue_pago")).toBe(false);
    expect(isLive("bloqueado")).toBe(false);
  });
});

/**
 * `furthest` existe porque a conversa não avança de um em um. Quem abre com "oi, uso 42,
 * meu CEP é 13010-100" pula três degraus numa mensagem só, e `canTransition` responde
 * `false` para um avanço que aconteceu de verdade. A regra da spec é sem regressão, não
 * sem salto.
 */
describe("furthest — o estágio que fica gravado", () => {
  it("avança quando o turno chegou mais longe", () => {
    expect(furthest("novo", "conversando")).toBe("conversando");
    expect(furthest("conversando", "pedido_criado")).toBe("pedido_criado");
  });

  it("permite salto de mais de um degrau", () => {
    // "oi, uso 42, meu CEP é 13010-100" numa mensagem só.
    expect(furthest("novo", "endereco_coletado")).toBe("endereco_coletado");
    expect(canTransition("novo", "endereco_coletado")).toBe(false);
  });

  it("nunca regride", () => {
    // Ela manda "oi" de novo depois do pedido; o estágio não volta.
    expect(furthest("pedido_criado", "conversando")).toBe("pedido_criado");
    expect(furthest("entregue_pago", "novo")).toBe("entregue_pago");
  });

  it("terminal chegando só entra se TRANSITIONS permite", () => {
    expect(furthest("conversando", "bloqueado")).toBe("bloqueado");
    expect(furthest("pedido_criado", "bloqueado")).toBe("bloqueado");
    expect(furthest("em_rota", "recusado")).toBe("recusado");
    // pedido_criado → perdido is not an edge: an order placed is not a lost lead.
    expect(furthest("pedido_criado", "perdido")).toBe("pedido_criado");
    expect(furthest("entregue_pago", "bloqueado")).toBe("entregue_pago");
    expect(furthest("recusado", "bloqueado")).toBe("recusado");
  });

  /**
   * Grafo §27, N3c/N3e: o "Cancelado" chegando primeiro (sem "created" antes, ou numa venda
   * pelo link, em que o turno não grava pedido_criado) deixava o estágio em
   * endereco_coletado ou perdido — o pedido existiu e morreu, e o funil não contava a recusa.
   * `recusado` vem do webhook de venda, que é a prova de que houve pedido.
   */
  it.each(["novo", "conversando", "tamanho_definido", "endereco_coletado", "pedido_criado", "em_rota", "perdido"] as const)(
    "pedido morto chegando primeiro: %s → recusado",
    (stored) => {
      expect(furthest(stored, "recusado")).toBe("recusado");
    },
  );

  it("pedido morto não tira de entregue_pago, bloqueado nem recusado", () => {
    expect(furthest("entregue_pago", "recusado")).toBe("entregue_pago");
    expect(furthest("bloqueado", "recusado")).toBe("bloqueado");
    expect(furthest("recusado", "recusado")).toBe("recusado");
  });

  it("o salto até recusado não abre salto até perdido nem até bloqueado fora das arestas", () => {
    expect(furthest("pedido_criado", "perdido")).toBe("pedido_criado");
    expect(furthest("em_rota", "perdido")).toBe("em_rota");
    expect(furthest("entregue_pago", "bloqueado")).toBe("entregue_pago");
  });

  it("perdido é reentrável: ela voltou", () => {
    expect(furthest("perdido", "conversando")).toBe("conversando");
    expect(furthest("perdido", "endereco_coletado")).toBe("endereco_coletado");
    expect(furthest("perdido", "bloqueado")).toBe("bloqueado");
  });

  it("de bloqueado, recusado e entregue_pago não se sai", () => {
    // `bloqueado` é opt-out: irreversível pelo agente, só uma pessoa desfaz.
    expect(furthest("bloqueado", "conversando")).toBe("bloqueado");
    expect(furthest("bloqueado", "pedido_criado")).toBe("bloqueado");
    expect(furthest("recusado", "conversando")).toBe("recusado");
    expect(furthest("entregue_pago", "conversando")).toBe("entregue_pago");
  });

  it("todo estágio terminal tem rank -1, e todo linear tem rank >= 0", () => {
    for (const s of ["recusado", "perdido", "bloqueado"] as const) expect(rankOf(s)).toBe(-1);
    for (const s of ["novo", "conversando", "pedido_criado", "entregue_pago"] as const) {
      expect(rankOf(s)).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * `overwritableBy` is the database half of `furthest`: the PATCH only lands on a row whose
 * CURRENT stage is in this list, so a turn that read a stale stage cannot regress one that
 * an overlapping turn already advanced.
 */
describe("overwritableBy — os estágios que o PATCH pode sobrescrever", () => {
  it("é exatamente o conjunto em que furthest escolhe o novo estágio", () => {
    for (const next of STAGES) {
      const expected = STAGES.filter((s) => s !== next && furthest(s, next) === next);
      expect(overwritableBy(next)).toEqual(expected);
    }
  });

  it("pedido_criado não é sobrescrito por endereco_coletado atrasado", () => {
    expect(overwritableBy("endereco_coletado")).not.toContain("pedido_criado");
    expect(overwritableBy("endereco_coletado")).toEqual(
      expect.arrayContaining(["novo", "conversando", "tamanho_definido", "perdido"]),
    );
  });

  it("recusado sobrescreve todo estágio de antes da entrega, e perdido (N3c/N3e)", () => {
    expect(overwritableBy("recusado")).toEqual([
      "novo",
      "conversando",
      "tamanho_definido",
      "endereco_coletado",
      "pedido_criado",
      "em_rota",
      "perdido",
    ]);
  });

  it("bloqueado sobrescreve o que TRANSITIONS permite e nada terminal fechado", () => {
    expect(overwritableBy("bloqueado")).toEqual([
      "novo",
      "conversando",
      "tamanho_definido",
      "endereco_coletado",
      "pedido_criado",
      "em_rota",
      "perdido",
    ]);
  });

  it("nunca inclui o próprio estágio nem bloqueado", () => {
    for (const next of STAGES) {
      expect(overwritableBy(next)).not.toContain(next);
      expect(overwritableBy(next)).not.toContain("bloqueado");
    }
  });
});

/**
 * `reachedStage` é o degrau que os fatos do turno sustentam — o mesmo cálculo em todas
 * as saídas do turno. `pedido_criado` exige o pedido MONTADO, não a vontade de comprar.
 */
describe("reachedStage — onde o turno chegou", () => {
  const none = { size: null, addressConfirmed: false, addressComplete: false, orderBuilt: false };

  it("sem fato nenhum, está conversando", () => {
    expect(reachedStage(none)).toBe("conversando");
  });

  it("tamanho sozinho é tamanho_definido", () => {
    expect(reachedStage({ ...none, size: "G" })).toBe("tamanho_definido");
  });

  it("endereço só conta completo E confirmado", () => {
    expect(reachedStage({ ...none, size: "G", addressComplete: true })).toBe("tamanho_definido");
    expect(reachedStage({ ...none, size: "G", addressConfirmed: true })).toBe("tamanho_definido");
    expect(reachedStage({ ...none, size: "G", addressComplete: true, addressConfirmed: true })).toBe(
      "endereco_coletado",
    );
  });

  it("pedido_criado só com o pedido montado", () => {
    const ready = { size: "G", addressConfirmed: true, addressComplete: true };
    expect(reachedStage({ ...ready, orderBuilt: false })).toBe("endereco_coletado");
    expect(reachedStage({ ...ready, orderBuilt: true })).toBe("pedido_criado");
  });

  /**
   * Os dois casos do achado 3, montados como o `index.ts` monta: identidade que passa em
   * `isIdentityComplete` e um `buildCoinzzRequest` que ainda assim recusa.
   */
  describe("identidade completa não é pedido montado", () => {
    const address: Address = {
      cep: "13010-100",
      street: "Rua das Flores",
      number: "123",
      neighborhood: "Centro",
      city: "Campinas",
      state: "SP",
    };
    const build = (identity: Identity, config: Partial<CoinzzConfig>): CoinzzRequest | null => {
      try {
        return buildCoinzzRequest(
          { leadId: "l", phone: "5519999998888", address, size: "G", paymentMethod: "cod", ...identity },
          config as CoinzzConfig,
          "k",
        );
      } catch {
        return null;
      }
    };
    const stageFor = (identity: Identity, config: Partial<CoinzzConfig>) => {
      expect(isIdentityComplete(identity)).toBe(true);
      return reachedStage({
        size: "G",
        addressConfirmed: true,
        addressComplete: true,
        orderBuilt: build(identity, config) !== null,
      });
    };
    const identity: Identity = { name: "Ana Souza", email: "ana@x.com", document: "529.982.247-25" };
    const config: CoinzzConfig = { offerHash: "off123", codPaymentMethod: "afterpay" };

    it("com tudo certo, o pedido nasce", () => {
      expect(stageFor(identity, config)).toBe("pedido_criado");
    });

    it("config sem offerHash (o fallback do index.ts) nunca é pedido_criado", () => {
      expect(stageFor(identity, { codPaymentMethod: "afterpay" })).toBe("endereco_coletado");
    });

    it("CPF com menos de 11 dígitos nunca é pedido_criado", () => {
      expect(stageFor({ ...identity, document: "529.982" }, config)).toBe("endereco_coletado");
    });
  });
});
