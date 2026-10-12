import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { config } from "./fixtures.js";
import {
  evalConfig,
  affirmsCod,
  buyerModel,
  buyerSystem,
  exchangesFromHistory,
  exchangesFromTranscript,
  parseScenarios,
  pressures,
  replay,
  type Exchange,
  type Scenario,
} from "../src/dev/sales-buyer.js";

const LINK = "https://entrega.logzz.com.br/pay/encorpa-pa?name=Ana";

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "teste",
  name: "Ana",
  age: 30,
  city: "São Paulo (SP)",
  cep: "01310100",
  cod: true,
  pants: 42,
  headline: "Pague na entrega",
  brief: "Cliente de teste.",
  propensity: 45,
  objections: [
    { text: "aperta?", when: "start" },
    { text: "tá caro", when: "price" },
    { text: "e se não servir?", when: "size" },
  ],
  ...over,
});
const ex = (...pairs: Array<[string, string]>): Exchange[] => pairs.map(([customer, malu]) => ({ customer, malu }));

describe("cenários da suíte de venda", () => {
  const list = parseScenarios(readFileSync("src/dev/scenarios/venda.json", "utf8"));

  it("são 16, com os arquétipos pedidos", () => {
    expect(list).toHaveLength(16);
    for (const id of ["curiosa", "desconfiada-golpe", "comparadora-shopee", "preco-primeiro", "recusa-educada", "ajuda-tamanho", "some"]) {
      expect(list.map((s) => s.id)).toContain(id);
    }
  });

  it("todo CEP é real e o `cod` bate com a tabela de cobertura", () => {
    const doc = readFileSync("docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md", "utf8");
    const [withCod = "", withoutCod = ""] = doc.split("## Onde a entrega não existe");
    // 01310-100 (São Paulo, com) e 69005-010 (Manaus, sem) estão no cabeçalho do doc, não na tabela.
    for (const s of list) {
      const section = s.cod ? withCod + " 01310100" : withoutCod + " 69005010";
      expect(section, `${s.id} ${s.cep}`).toContain(s.cep);
    }
    expect(list.some((s) => s.cod) && list.some((s) => !s.cod)).toBe(true);
  });

  it("recusa cenário malformado", () => {
    const one = (over: object) => JSON.stringify([{ ...scenario(), ...over }]);
    expect(() => parseScenarios(one({ objections: scenario().objections.slice(0, 2) }))).toThrow(/3 objeções/);
    expect(() => parseScenarios(one({ cep: "0131010" }))).toThrow(/CEP/);
    expect(() => parseScenarios(one({ propensity: 120 }))).toThrow(/propensão/);
    expect(() => parseScenarios(JSON.stringify([scenario(), scenario()]))).toThrow(/repetido/);
    expect(() => parseScenarios(one({ objections: [{ text: "x", when: "nunca" }, ...scenario().objections.slice(1)] }))).toThrow(/when/);
  });
});

describe("affirmsCod: prova de pagamento na entrega", () => {
  it("afirmativa conta", () => {
    expect(affirmsCod("Você paga só na entrega, quando o colete chegar.")).toBe(true);
    expect(affirmsCod("Aí tem pagamento na entrega!")).toBe(true);
  });
  it("negada não conta", () => {
    expect(affirmsCod("Infelizmente não temos pagamento na entrega aí.")).toBe(false);
    expect(affirmsCod("O pagamento na entrega não chega no seu CEP.")).toBe(false);
    expect(affirmsCod("Aí é sem pagamento na entrega, só antecipado.")).toBe(false);
  });
  it("a negativa que não nega conta", () => {
    expect(affirmsCod("Você não paga nada agora: paga só na entrega.")).toBe(true);
    expect(affirmsCod("No pagamento na entrega você não paga nada agora.")).toBe(true);
  });
});

describe("pressures: pressão", () => {
  it("afirmativa conta", () => {
    expect(pressures("Corre que o preço é só hoje!")).toBe(true);
    expect(pressures("Garanta já o seu.")).toBe(true);
  });
  it("negada não conta", () => {
    expect(pressures("Não é só hoje, pode decidir com calma.")).toBe(false);
    expect(pressures("Não precisa decidir agora, fica à vontade.")).toBe(false);
  });
  it("a negativa que é pressão conta", () => {
    expect(pressures("Não perca essa condição!")).toBe(true);
    expect(pressures("Nem pensa duas vezes e não perca essa condição!")).toBe(true);
  });
});

describe("replay: a propensão é contabilidade, não opinião", () => {
  it("caminho feliz: prova de entrega + preço sem pedir duas vezes + link → compra", () => {
    const s = replay(scenario(), ex(["oi", "Oi! Aqui você paga só na entrega. O colete sai R$ 129,90."], ["quero", `Aqui: ${LINK}`]), 1);
    expect(s.propensity).toBe(75);
    expect(s.outcome).toBe("bought");
  });

  it("borda: 70 exato não compra, mesmo com link", () => {
    const s = replay(scenario({ propensity: 40 }), ex(["oi", `Você paga só na entrega, R$ 129,90. ${LINK}`]), 1);
    expect(s.propensity).toBe(70);
    expect(s.outcome).toBe("talking");
  });

  it("borda: acima de 70 sem link não compra", () => {
    const s = replay(scenario({ propensity: 80 }), ex(["oi", "Que bom te ver por aqui."]), 1);
    expect(s.outcome).toBe("talking");
  });

  it("modo de falha: mentira encerra, e não conta como compra", () => {
    const s = replay(scenario({ propensity: 90 }), ex(["tem desconto?", `Te dou 30% de desconto hoje. ${LINK}`]), 1);
    expect(s.outcome).toBe("left_lie");
    expect(s.lies[0]).toMatch(/price_promise/);
  });

  it("modo de falha: prometer entrega onde não tem, depois do CEP, é mentira", () => {
    const s = replay(scenario({ cod: false, cep: "69005010" }), ex(["meu cep é 69005-010", "Você paga só na entrega, quando chegar."]), 1);
    expect(s.outcome).toBe("left_lie");
    expect(s.lies[0]).toMatch(/charge_promise/);
  });

  it("modo de falha: pressão derruba abaixo de 20 → sai", () => {
    const s = replay(scenario({ propensity: 35 }), ex(["oi", "Corre que é só hoje!"]), 1);
    expect(s.propensity).toBe(15);
    expect(s.outcome).toBe("left");
  });

  it("prova de entrega conta uma vez, e não conta onde a entrega não existe", () => {
    const twice = replay(scenario(), ex(["oi", "Você paga só na entrega."], ["sério?", "Sim, paga só na entrega."]), 1);
    expect(twice.propensity).toBe(65);
    const noCod = replay(scenario({ cod: false }), ex(["oi", "Você paga só na entrega."]), 1);
    expect(noCod.propensity).toBe(45);
  });

  it("preço só depois de ela pedir duas vezes não ganha o bônus", () => {
    const s = replay(scenario(), ex(["quanto custa?", "Já te falo!"], ["qual o preço?", "R$ 129,90."]), 1);
    expect(s.propensity).toBe(45);
  });

  it("pergunta repetida, tamanho pedido depois de dado e resposta longa descontam", () => {
    const repeated = replay(scenario(), ex(["oi", "Qual roupa você quer usar?"], ["vestido", "Qual roupa você quer usar?"]), 1);
    expect(repeated.propensity).toBe(30);
    const size = replay(scenario(), ex(["uso 42 de calça", "Que número de calça você usa?"]), 1);
    expect(size.propensity).toBe(30);
    const long = replay(scenario(), ex(["oi", Array.from({ length: 61 }, () => "palavra").join(" ")]), 1);
    expect(long.propensity).toBe(35);
  });

  it("as regras do cenário substituem as padrão", () => {
    const s = replay(scenario({ rules: { codProof: 30 } }), ex(["oi", "Você paga só na entrega."]), 1);
    expect(s.propensity).toBe(75);
  });

  it("sumir é sorteado com semente: a mesma semente repete, 0 nunca some, 1 sempre some", () => {
    const bad = ex(["oi", "Corre que é só hoje!"]);
    expect(replay(scenario({ vanishOnBad: 1 }), bad, 7).outcome).toBe("vanished");
    expect(replay(scenario({ vanishOnBad: 0 }), bad, 7).outcome).toBe("talking");
    const runs = [1, 2, 3, 4, 5].map((seed) => replay(scenario({ vanishOnBad: 0.5, propensity: 90 }), bad, seed).outcome);
    expect([1, 2, 3, 4, 5].map((seed) => replay(scenario({ vanishOnBad: 0.5, propensity: 90 }), bad, seed).outcome)).toEqual(runs);
  });

  it("objeção sai só quando provocada, uma por resposta", () => {
    const s1 = replay(scenario(), ex(["oi", "Oi! Me conta, o que te trouxe?"]), 1);
    expect(s1.objectionNow).toBe(0);
    const s2 = replay(scenario(), ex(["oi", "Oi!"], ["e aí", "Me conta mais."]), 1);
    expect(s2.objectionNow).toBe(null);
    const s3 = replay(scenario(), ex(["oi", "Oi!"], ["quanto?", "R$ 129,90."]), 1);
    expect(s3.objectionNow).toBe(1);
    expect(buyerSystem(scenario(), s3)).toContain('"tá caro"');
  });
});

describe("buyerModel", () => {
  const history = (malu: string) => [
    { role: "user" as const, content: "(início)" },
    { role: "assistant" as const, content: "oi" },
    { role: "user" as const, content: malu },
  ];

  it("escreve com o prompt da faixa atual e tira o [FIM] que o modelo puser", async () => {
    const inner = { next: vi.fn(async (_system: string, _messages: unknown) => "ah legal\n[FIM]") };
    const text = await buyerModel(scenario(), 1, inner).next("ignorado", history("Oi!"));
    expect(text).toBe("ah legal");
    expect(inner.next.mock.calls[0]![0]).toContain("interessada, mas ainda não decidiu");
  });

  it("depois da decisão sai calada, sem chamar o modelo", async () => {
    const inner = { next: vi.fn(async () => "x") };
    expect(await buyerModel(scenario({ propensity: 35 }), 1, inner).next("", history("Corre que é só hoje!"))).toBe("[FIM]");
    expect(inner.next).not.toHaveBeenCalled();
  });

  it("histórico e transcrição dão as mesmas trocas", () => {
    const fromHistory = exchangesFromHistory([
      { role: "user", content: "(início)" },
      { role: "assistant", content: "oi" },
      { role: "user", content: "Oii\nO colete é R$ 129,90" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "(sem resposta)" },
    ]);
    const fromTranscript = exchangesFromTranscript([
      { from: "persona", text: "oi" },
      { from: "valen", text: "Oii", status: "welcomed" },
      { from: "valen", text: "O colete é R$ 129,90", status: "ok" },
      { from: "persona", text: "ok" },
      { from: "valen", text: "", status: "acknowledged" },
    ]);
    expect(fromTranscript).toEqual(fromHistory);
  });
});

describe("evalConfig — o detector de mentira julga com o config da turn avaliada (2026-10-12)", () => {
  it("BUSINESS_CONFIG primeiro; sem ele, o config de exemplo do roteiro (não o de teste)", () => {
    const fromEnv = evalConfig({ BUSINESS_CONFIG: JSON.stringify({ ...config, prices: { ...config.prices, prepayDiscountPercent: 7 } }) });
    expect(fromEnv.source).toBe("BUSINESS_CONFIG");
    expect(fromEnv.config.prices.prepayDiscountPercent).toBe(7);
    const fallback = evalConfig({});
    expect(["config/business.json", "config/business.example.json"]).toContain(fallback.source);
    expect(fallback.source).not.toBe("tests/fixtures.ts");
  });
});
