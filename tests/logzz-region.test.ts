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
const world = (over: { viacep?: unknown; brasil?: unknown; stock?: unknown; days?: unknown; coinzz?: unknown } = {}) => {
  const asked: string[] = [];
  const answer = (v: unknown) => { if (v instanceof Error) throw v; return v; };
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.includes("viacep")) return answer(over.viacep ?? { localidade: "São Paulo", uf: "SP", bairro: "Brooklin" });
    if (url.includes("brasilapi")) return answer(over.brasil ?? null);
    if (url.includes("get-available-stock")) return answer(over.stock ?? SP_STOCK);
    if (url.includes("get-delivery-days")) return answer(over.days ?? DAYS);
    if (url.startsWith(AVAILABILITY_ENDPOINT) && over.coinzz !== undefined) return answer(over.coinzz);
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

  // Stock without a confirmed window is no promise and no denial: an unknown is a failed lookup, with the place kept.
  it.each([
    ["rede caída", new TypeError("fetch failed")],
    ["500", http(500, null)],
    ["erro desconhecido", { status: "error", msg: "Erro interno." }],
    ["dados como objeto (array PHP sem array_values)", { status: "success", data: { "0": { dates: [{ date: "2026-10-20" }] } } }],
    ["dados sem status", { data: [] }],
  ])("negação — estoque confirmado e os dias com '%s': consulta que falhou", async (_, days) => {
    const l = await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS);
    expect(l).toMatchObject({ kind: "failed", place: { city: "São Paulo" } });
  });

  it("os dias: janela fechada ou o 'não atende' da Logzz é sem entrega", async () => {
    for (const days of [{ status: "success", data: [] }, http(400, NOT_IN_LIST)]) {
      expect(await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS)).toMatchObject({ kind: "found", region: { cod: false } });
    }
  });

  it.each([
    ["janela nula", { status: "success", data: [null] }],
    ["datas que não são lista", { status: "success", data: [{ dates: "2026-10-20" }] }],
    ["datas nulas", { status: "success", data: [{ dates: [null, { date: 5 }] }] }],
  ])("negação — resposta torta dos dias (%s) nunca lança", async (_, days) => {
    const l = await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS);
    expect(["found", "failed"]).toContain(l.kind);
  });

  it("o tamanho vem da variação quando o nome do produto muda", async () => {
    const stock = {
      status: "success",
      data: {
        groups: [{ variations: [{ variation_id: 1, variation_name: "G" }, { variation_id: 2, variation_name: "GG" }] }],
        products: [
          { product_name: "Colete Tamanho G", variations_combination: [1], stock_per_operations: [{ operation_id: 9, quantity: 5 }] },
          { product_name: "Colete Tamanho GG", variations_combination: [2], stock_per_operations: [{ operation_id: 9, quantity: 0 }] },
        ],
      },
    };
    expect(await lookupRegion(world({ stock }).fetcher, "04710090", "G", IDS)).toMatchObject({ kind: "found", region: { cod: true } });
    expect(await lookupRegion(world({ stock }).fetcher, "04710090", "GG", IDS)).toMatchObject({ kind: "found", region: { cod: false } });
  });

  it.each([
    ["nenhum produto reconhecido", { status: "success", data: { products: [{ product_name: "Colete Modelador", stock_per_operations: [{ operation_id: 9, quantity: 9 }] }] } }],
    ["lista de produtos vazia", { status: "success", data: { products: [] } }],
    ["produtos nulos", { status: "success", data: { products: [null, 5] } }],
  ])("negação — estoque que não deu pra entender (%s) é consulta que falhou, nunca 'sem entrega'", async (_, stock) => {
    for (const size of ["G", null] as const) {
      expect(await lookupRegion(world({ stock }).fetcher, "04710090", size, IDS)).toMatchObject({ kind: "failed", place: { city: "São Paulo" } });
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

describe("a garantia: o que a Logzz mandar, a consulta resolve e nunca lança", () => {
  // Garbage in every slot of both answers, deterministic: strings, numbers, nulls, lists, objects, PHP-style index objects.
  const junk = (n: number): unknown[] => [
    null, undefined, 0, 1, -1, NaN, "", "x", "<html>403</html>", true, [], [null], [{}], {}, { status: "success" }, { status: "error" },
    { status: "success", data: null }, { status: "success", data: "x" }, { status: "success", data: { products: "x" } },
    { status: "success", data: { products: [{ product_name: 5, stock_per_operations: "x" }] } },
    { status: "success", data: { groups: "x", products: [{ variations_combination: "x", stock_per_operations: [null, { quantity: "9" }] }] } },
    { status: "success", data: { products: [{ product_name: "x-G", stock_per_operations: [{ operation_id: "9", quantity: 5 }] }] } },
    { status: "success", data: [{ dates: [{}] }, 7] }, { status: "error", msg: 5 }, { status: "error", msg: { a: 1 } },
    http(400, "x"), http(400, { status: "error" }), http(0, null), new Error("x"), new DOMException("t", "TimeoutError"),
  ].slice(n % 3, undefined);
  it("estoque e dias com lixo: sempre found ou failed, nunca exceção", async () => {
    for (const stock of junk(0)) {
      for (const days of junk(1)) {
        for (const viacep of [{ localidade: "São Paulo", uf: "SP" }, { erro: true }, "x", null, 5, [], new Error("x")]) {
          for (const size of [null, "G", "XGG"] as const) {
            const w = world({ stock: stock instanceof Error ? stock : stock ?? { status: "success", data: { products: [] } }, days, viacep, brasil: stock });
            const l = await lookupRegion(w.fetcher, "04710090", size, IDS);
            expect(["found", "failed", "not_found"]).toContain(l.kind);
          }
        }
      }
    }
  });
});

describe("o caminho que não deixa a consulta falhar: Logzz, depois a Coinzz, depois o estado seguro", () => {
  const COINZZ_COD = { data: { local_operation_cash_on_delivery: { delivery_days_available: [{ deliveryTypeCode: "x", deliveryTypeName: "Padrão", deliveryPrice: 0, deliverySameDay: 0, dates: [{ date: "2026-10-20" }] }] } } };
  const COINZZ_NO = { data: { local_operation: [], local_operation_cash_on_delivery: { delivery_days_available: [] } } };
  const down = http(503, null);

  it("a Logzz não responde e a Coinzz confirma a entrega: segue com a entrega (a segunda fonte)", async () => {
    const l = await lookupRegion(world({ stock: down, coinzz: COINZZ_COD }).fetcher, "30140071", "G", IDS);
    expect(l).toMatchObject({ kind: "found", region: { cod: true, dates: ["2026-10-20"] } });
  });

  it("negação — a Logzz não responde e a Coinzz diz 'não': nunca vira 'sem entrega' (a Coinzz errou em São Paulo)", async () => {
    const l = await lookupRegion(world({ stock: down, coinzz: COINZZ_NO }).fetcher, "04710090", "G", IDS);
    expect(l).toMatchObject({ kind: "failed", place: { city: "São Paulo" } });
  });

  it("negação — as duas fontes fora: consulta que falhou, com a cidade guardada", async () => {
    const l = await lookupRegion(world({ stock: down, coinzz: down }).fetcher, "04710090", "G", IDS);
    expect(l).toMatchObject({ kind: "failed", place: { city: "São Paulo" } });
  });

  it("a Logzz responde: a Coinzz nem é perguntada", async () => {
    const { fetcher, asked } = world({ coinzz: COINZZ_NO });
    await lookupRegion(fetcher, "04710090", "G", IDS);
    expect(asked.some((u) => u.startsWith(AVAILABILITY_ENDPOINT))).toBe(false);
  });

  it("nunca lança, nem com um corpo que lança ao ser lido", async () => {
    const poisoned = { localidade: "São Paulo", uf: "SP", get bairro(): string { throw new Error("boom"); } };
    expect(await lookupRegion(world({ viacep: poisoned }).fetcher, "04710090", "G", IDS)).toEqual({ kind: "failed" });
    expect(await lookupRegion(world({ viacep: poisoned }).fetcher, "04710090", "G", null)).toEqual({ kind: "failed" });
  });
});

describe("só se nega o que se entendeu (2ª revisão Opus)", () => {
  const stockOf = (products: unknown[]) => ({ status: "success", data: { products } });
  const failedSP = { kind: "failed", place: { city: "São Paulo" } };

  it.each([
    ["operation_id como texto vira número", stockOf([{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: "9", quantity: "180" }] }]), { kind: "found", region: { cod: true } }],
    ["campo de estoque renomeado", stockOf([{ product_name: "Cinta-G", stocks: [{ operation_id: 9, quantity: 180 }] }]), failedSP],
    ["operation_id que não é número", stockOf([{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: "x", quantity: 180 }] }]), failedSP],
    ["quantidade ilegível", stockOf([{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: 9, quantity: "muito" }] }]), failedSP],
    ["o tamanho dela renomeado e os outros lidos (XGG → EXG)", stockOf([{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: 9, quantity: 5 }] }, { product_name: "Cinta-EXG", stock_per_operations: [{ operation_id: 9, quantity: 5 }] }]), { kind: "failed" }],
  ])("estoque: %s", async (name, stock, want) => {
    const size = name.startsWith("o tamanho dela") ? "XGG" : "G";
    expect(await lookupRegion(world({ stock }).fetcher, "04710090", size, IDS)).toMatchObject(want);
  });

  it("estoque zero lido com clareza é sem entrega, e é o único jeito de dizer isso pelo estoque", async () => {
    const stock = stockOf([{ product_name: "Cinta-G", stock_per_operations: [{ operation_id: 9, quantity: 0 }] }]);
    expect(await lookupRegion(world({ stock }).fetcher, "04710090", "G", IDS)).toMatchObject({ kind: "found", region: { cod: false } });
  });

  it.each([
    ["datas como texto", { status: "success", data: [{ dates: "2026-10-20" }] }],
    ["campo de datas renomeado", { status: "success", data: [{ deliveryTypeCode: "x", available_dates: ["2026-10-20"] }] }],
    ["uma janela torta e a outra vazia", { status: "success", data: [{ dates: "x" }, { dates: [] }] }],
  ])("dias: %s é consulta que falhou, nunca 'janela fechada'", async (_, days) => {
    expect(await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS)).toMatchObject(failedSP);
  });

  it("dias: o expresso sem datas e o padrão com datas — vale o padrão, sem 'hoje'", async () => {
    const days = { status: "success", data: [{ deliverySameDay: 1, dates: [] }, { deliverySameDay: 0, dates: [{ date: "2026-10-20" }] }] };
    expect(await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS)).toMatchObject({ kind: "found", region: { cod: true, dates: ["2026-10-20"], sameDay: false } });
  });

  it("dias: toda janela com lista vazia é janela fechada, dita com clareza", async () => {
    const days = { status: "success", data: [{ dates: [] }, { dates: [] }] };
    expect(await lookupRegion(world({ days }).fetcher, "04710090", "G", IDS)).toMatchObject({ kind: "found", region: { cod: false } });
  });

  // The second source: evidence for HER size, with a day.
  const down = http(503, null);
  const COINZZ = (dates: string[]) => ({ data: { local_operation_cash_on_delivery: { delivery_days_available: [{ deliveryTypeCode: "x", deliveryTypeName: "Padrão", deliveryPrice: 0, deliverySameDay: 0, dates: dates.map((date) => ({ date })) }] } } });
  it("negação — a Coinzz 'sim' sem nenhum dia não é evidência", async () => {
    expect(await lookupRegion(world({ stock: down, coinzz: COINZZ([]) }).fetcher, "30140071", "G", IDS)).toMatchObject({ kind: "failed" });
  });
  it("negação — o tamanho dela (M) sem resposta da Coinzz não empresta a entrega de outro tamanho", async () => {
    const coinzz = (url: string) => (url.includes("65ptrlc") ? null : COINZZ(["2026-10-20"]));
    const fetcher = async (url: string) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      if (url.includes("entrega.logzz")) throw down;
      // M's code is the one that answers 404 in production: null for it, a yes for the others.
      return url.includes("products%5B0%5D%5Bcode%5D=proqvqmj") ? null : coinzz("x");
    };
    expect(await lookupRegion(fetcher, "30140071", "M", IDS)).toMatchObject({ kind: "failed" });
  });
});
