/**
 * Operator, 2026-10-19: São Paulo has 180 G on the Logzz while the Coinzz query said "no delivery" for it. The coverage lookup
 * now asks the Logzz scheduling checkout's own two public queries (stock per size and operation, then the delivery days).
 * Fixtures are real answers of that day; the 400s are what the Logzz really sends for a city it does not serve.
 */
import { describe, expect, it } from "vitest";
import { AVAILABILITY_ENDPOINT, checkCoverage, logzzIdsOf, lookupRegion, readLogzzStock } from "@/agent/availability.js";

const IDS = { productId: "165378", saleId: "75567" };
const prod = (name: string, qty: number, op = 9) => ({ product_name: `Cinta Colete Modeladora-${name}`, stock_per_operations: [{ operation_id: op, quantity: qty }] });
const SP_STOCK = { status: "success", data: { products: [prod("P", 0), prod("M", 0), prod("G", 180), prod("GG", 12), prod("XG", 73)] } };
const DAYS = {
  status: "success",
  data: [{ deliveryTypeCode: "det1pgz5", deliverySameDay: 0, dates: [{ date: "2026-10-20" }, { date: "2026-10-21" }, { date: "2026-10-22" }] }],
};
/** What the production fetcher throws on a non-2xx: the status and the parsed body. */
const http = (status: number, body: unknown) => Object.assign(new Error(`HTTP ${status}`), { status, body });
const NOT_SERVED = { status: "error", msg: "O endereço informado está bloqueado para entrega nessa cidade. Informe outro CEP ou bairro para agendar." };
const NOT_IN_LIST = { status: "error", msg: "Essa cidade não faz parte da lista de disponibilidade de entregas. Contacte o vendedor." };
const NO_STOCK = { status: "error", msg: "Produto sem estoque disponível para agendamento nessa cidade." };

/** A fetcher over canned answers by endpoint; every URL it was asked is recorded. */
const world = (over: { viacep?: unknown; brasil?: unknown; stock?: unknown; days?: unknown } = {}) => {
  const asked: string[] = [];
  const answer = (v: unknown) => { if (v instanceof Error) throw v; return v; };
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.includes("viacep")) return answer(over.viacep ?? { localidade: "São Paulo", uf: "SP", bairro: "Brooklin" });
    if (url.includes("brasilapi")) return answer(over.brasil ?? null);
    if (url.includes("get-available-stock")) return answer(over.stock ?? SP_STOCK);
    if (url.includes("get-delivery-days")) return answer(over.days ?? DAYS);
    throw new Error(`unexpected ${url}`);
  };
  return { fetcher, asked };
};

describe("Logzz: a região pelo estoque e pelos dias do próprio checkout", () => {
  it("o G dela em São Paulo tem estoque: entrega, com a primeira data", async () => {
    const { fetcher } = world();
    const l = await lookupRegion(fetcher, "04710-090", "G", IDS);
    expect(l.kind).toBe("found");
    if (l.kind === "found") expect(l).toMatchObject({ region: { cod: true, dates: ["2026-10-20", "2026-10-21", "2026-10-22"], size: "G", sameDay: false } });
  });

  it("o tamanho dela sem estoque onde ela mora é sem entrega, mesmo com outros tamanhos em estoque", async () => {
    const l = await lookupRegion(world().fetcher, "04710090", "M", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(false);
  });

  it("sem tamanho ainda, qualquer tamanho em estoque basta", async () => {
    const l = await lookupRegion(world().fetcher, "04710090", null, IDS);
    expect(l.kind === "found" && l.region.cod).toBe(true);
  });

  it("o XG do checkout é o XGG da tabela", async () => {
    const l = await lookupRegion(world().fetcher, "04710090", "XGG", IDS);
    expect(l.kind === "found" && l.region.cod).toBe(true);
    expect(readLogzzStock(SP_STOCK)).toMatchObject({ cod: true, bySize: { G: [9], GG: [9], XGG: [9] } });
  });

  it("pergunta o que o checkout pergunta: produto, oferta, CEP só com dígitos, bairro, e as operações do tamanho dela", async () => {
    const { fetcher, asked } = world();
    await lookupRegion(fetcher, "04710-090", "G", IDS);
    const stock = new URL(asked.find((u) => u.includes("get-available-stock"))!);
    expect(Object.fromEntries(stock.searchParams)).toMatchObject({ product_id: "165378", sale_id: "75567", cep: "04710090", city: "São Paulo", uf: "SP", neighborhood: "Brooklin" });
    const days = new URL(asked.find((u) => u.includes("get-delivery-days"))!);
    expect(days.searchParams.getAll("operation_ids[]")).toEqual(["9"]);
    // Never the Coinzz query that said "no delivery" in São Paulo.
    expect(asked.some((u) => u.startsWith(AVAILABILITY_ENDPOINT))).toBe(false);
  });

  it.each([["bloqueado", NOT_SERVED], ["fora da lista", NOT_IN_LIST], ["sem estoque na cidade", NO_STOCK]])(
    "o 400 da Logzz '%s' é a resposta da região (sem entrega), não uma falha",
    async (_, body) => {
      const l = await lookupRegion(world({ stock: http(400, body) }).fetcher, "69005010", "G", IDS);
      expect(l).toMatchObject({ kind: "found", region: { cod: false } });
    },
  );

  // Negations: anything that is not a known "we do not serve" is a failed lookup with the place kept — never "no delivery".
  it.each([
    ["400 de validação", http(400, { message: "O campo cep é obrigatório.", errors: {} })],
    ["400 sem corpo legível", http(400, null)],
    ["mensagem de erro desconhecida", http(400, { status: "error", msg: "Erro interno ao consultar o estoque." })],
    ["503", http(503, null)],
    ["403 do Cloudflare (HTML)", http(403, null)],
    ["rede caída", new TypeError("fetch failed")],
    ["resposta sem a lista de produtos", { status: "success", data: {} }],
    ["sucesso sem status", { data: { products: [] } }],
  ])("negação — %s é consulta que falhou, com a cidade guardada", async (_, stock) => {
    const l = await lookupRegion(world({ stock }).fetcher, "04710090", "G", IDS);
    expect(l).toMatchObject({ kind: "failed", place: { city: "São Paulo", state: "SP" } });
  });

  it("estoque confirmado e os dias falhando: há entrega, sem data pra prometer", async () => {
    for (const days of [new TypeError("fetch failed"), http(500, null), { status: "error" }, { status: "success", data: [] }]) {
      const l = await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS);
      expect(l).toMatchObject({ kind: "found", region: { cod: true, dates: [] } });
    }
  });

  it("o expresso do dia só vale quando a Logzz diz que é do mesmo dia", async () => {
    const days = { status: "success", data: [{ deliverySameDay: 1, dates: [{ date: "2026-10-19" }] }] };
    const l = await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS);
    expect(l).toMatchObject({ kind: "found", region: { cod: true, sameDay: true } });
  });

  it("estoque em mais de uma operação: as duas vão na pergunta dos dias", async () => {
    const stock = { status: "success", data: { products: [{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: 2, quantity: 10 }, { operation_id: 9, quantity: 3 }, { operation_id: 4, quantity: 0 }] }] } };
    const { fetcher, asked } = world({ stock });
    await lookupRegion(fetcher, "30140071", "G", IDS);
    expect(new URL(asked.find((u) => u.includes("get-delivery-days"))!).searchParams.getAll("operation_ids[]")).toEqual(["2", "9"]);
  });
});

describe("a segunda base de CEP", () => {
  it("o ViaCEP não acha e a BrasilAPI acha (62930000): segue com a cidade dela", async () => {
    const brasil = { cep: "62930000", state: "CE", city: "Limoeiro do Norte", neighborhood: "" };
    const l = await lookupRegion(world({ viacep: { erro: true }, brasil, stock: http(400, NOT_IN_LIST) }).fetcher, "62930000", "G", IDS);
    expect(l).toMatchObject({ kind: "found", region: { cod: false, place: { city: "Limoeiro do Norte", state: "CE" } } });
  });

  it("negação — nenhuma das duas acha: o CEP não existe", async () => {
    expect(await lookupRegion(world({ viacep: { erro: true }, brasil: null }).fetcher, "98005020", "G", IDS)).toEqual({ kind: "not_found" });
  });

  it("negação — o ViaCEP cai e a BrasilAPI também: consulta que falhou, nunca 'não existe'", async () => {
    const down = new TypeError("fetch failed");
    expect(await lookupRegion(world({ viacep: down, brasil: down }).fetcher, "04710090", "G", IDS)).toEqual({ kind: "failed" });
  });

  it("o ViaCEP cai e a BrasilAPI acha: segue", async () => {
    const brasil = { cep: "04710090", state: "SP", city: "São Paulo", neighborhood: "Brooklin" };
    expect((await lookupRegion(world({ viacep: new TypeError("fetch failed"), brasil }).fetcher, "04710090", "G", IDS)).kind).toBe("found");
  });
});

describe("a sonda de saúde pela Logzz", () => {
  it("o CEP de São Paulo com estoque é cod; sem os ids, o caminho da Coinzz de antes", async () => {
    expect(await checkCoverage(world().fetcher, ["04710090"], IDS)).toEqual([{ cep: "04710090", result: "cod" }]);
  });
  it("negação — a Logzz fora do ar é failed, e a sonda não cai", async () => {
    expect(await checkCoverage(world({ stock: http(503, null) }).fetcher, ["04710090"], IDS)).toEqual([{ cep: "04710090", result: "failed" }]);
  });
});

describe("os ids da oferta da Logzz", () => {
  const COD = "https://entrega.logzz.com.br/pay/ccm-1-unidade";
  it("a chave do config vence", () => expect(logzzIdsOf({ codUrl: COD, logzz: { productId: "1", saleId: "2" } })).toEqual({ productId: "1", saleId: "2" }));
  it("sem a chave, a oferta conhecida pelo slug do checkout (o secret não precisa mudar)", () => {
    expect(logzzIdsOf({ codUrl: COD })).toEqual(IDS);
    expect(logzzIdsOf({ codUrl: `${COD}/?phone=5511999999999` })).toEqual(IDS);
  });
  it.each([["outra oferta", "https://entrega.logzz.com.br/pay/outra-oferta"], ["sem checkout", ""]])("negação — %s: sem ids, a Coinzz como antes", (_, codUrl) =>
    expect(logzzIdsOf(codUrl ? { codUrl } : undefined)).toBeNull());
});
