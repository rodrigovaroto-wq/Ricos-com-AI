import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVAILABILITY_HEADERS, checkCoverage, type CoverageCheck, healthOf } from "@/agent/availability.js";

/**
 * E1.2: the cash-on-delivery path vanished twice for every customer with nobody told (no XHR
 * header 24/09–07/10, hyphenated CEP → 422 on 08/10, grafo §66/§67). The `health` job asks the
 * same lookup the conversation asks, for three São Paulo CEPs that have COD, and is red otherwise.
 */
const place = { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
/** Shape of a real Coinzz answer with a "Padrão" COD window (L2 probe, 2026-10-08). */
const codOk = {
  data: {
    products: [{ code: "pro7ml00", stock: "1", delivery_date: null }],
    has_local_operation_cash_on_delivery: false,
    has_pending_cash_on_delivery: false,
    local_operation: [{ price: 19.345 }],
    local_operation_cash_on_delivery: {
      delivery_days_available: [
        {
          deliveryTypeCode: "det1pgz5",
          deliveryTypeName: "Padrão",
          deliveryPrice: 24.98,
          deliverySameDay: 0,
          dates: [{ date: "2026-10-09" }, { date: "2026-10-10" }],
        },
      ],
    },
  },
};
const noCod = { data: { products: [], local_operation_cash_on_delivery: { delivery_days_available: [] } } };

const coinzz = (answer: () => unknown) => async (url: string) => (url.includes("viacep") ? place : answer());

describe("healthOf — o alarme de cobertura", () => {
  const all = (result: CoverageCheck["result"], at = -1): CoverageCheck[] =>
    ["01310100", "04710090", "04662002"].map((cep, i) => ({ cep, result: i === at ? result : "cod" }));

  it("os três com pagamento na entrega → saudável", () => {
    expect(healthOf(all("cod"))).toBe("healthy");
  });

  it("um que falhou, sem entrega ou não encontrado → doente", () => {
    for (const r of ["failed", "no_cod", "not_found"] as const) expect(healthOf(all(r, 1))).toBe("unhealthy");
  });

  it("nenhum CEP conferido não é saúde", () => {
    expect(healthOf([])).toBe("unhealthy");
  });

  it("diz qual CEP caiu", async () => {
    const checks = await checkCoverage(
      async (url) => (url.includes("viacep") ? place : url.includes("04710090") ? null : codOk),
      ["01310100", "04710090", "04662002"],
    );
    expect(checks).toEqual([
      { cep: "01310100", result: "cod" },
      { cep: "04710090", result: "failed" },
      { cep: "04662002", result: "cod" },
    ]);
    expect(healthOf(checks)).toBe("unhealthy");
  });
});

describe("checkCoverage — o mesmo caminho da conversa", () => {
  it("uma resposta real com janela de entrega → cod", async () => {
    expect(await checkCoverage(coinzz(() => codOk), ["01310100"])).toEqual([{ cep: "01310100", result: "cod" }]);
  });

  it("422 (o fetcher devolve null) → failed, nunca no_cod", async () => {
    expect((await checkCoverage(coinzz(() => null), ["04710090"]))[0]?.result).toBe("failed");
  });

  it("302 com HTML (o json() lança) → failed, sem derrubar o job", async () => {
    const html = coinzz(() => {
      throw new SyntaxError("Unexpected token '<'");
    });
    expect(await checkCoverage(html, ["04710090", "04662002"])).toEqual([
      { cep: "04710090", result: "failed" },
      { cep: "04662002", result: "failed" },
    ]);
  });

  it("timeout → failed", async () => {
    const slow = async () => {
      throw new DOMException("signal timed out", "TimeoutError");
    };
    expect((await checkCoverage(slow, ["01310100"]))[0]?.result).toBe("failed");
  });

  it("região sem entrega → no_cod; CEP inexistente → not_found", async () => {
    expect((await checkCoverage(coinzz(() => noCod), ["01310100"]))[0]?.result).toBe("no_cod");
    expect((await checkCoverage(async () => ({ erro: true }), ["99999999"]))[0]?.result).toBe("not_found");
  });

  it("CEP com hífen vai só com dígitos, com os cabeçalhos da conversa", async () => {
    const seen: Array<{ url: string; headers: Readonly<Record<string, string>> | undefined }> = [];
    await checkCoverage(async (url, headers) => {
      seen.push({ url, headers });
      return url.includes("viacep") ? place : codOk;
    }, ["04710-090"]);
    const ask = seen.find((s) => !s.url.includes("viacep"));
    expect(ask?.url).toContain("zip_code=04710090");
    expect(ask?.headers).toEqual(AVAILABILITY_HEADERS);
  });
});

describe("R28: o fetcher da região", () => {
  it("só o 404 é 'nada aqui'; 429 e 5xx lançam e viram consulta que falhou", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toContain("if (!r.ok && r.status !== 404) throw Object.assign(new Error(`region lookup HTTP ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });");
  });
});

describe("o job health na turn", () => {
  const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

  it("a conversa e o alarme usam o mesmo fetcher, e não há segundo fetch de região", () => {
    // Grafo §136: the conversation's lookups go through `cepFetcher`, the same `regionFetcher` with the turn's ViaCEP answers reused.
    expect(turn).toContain("const cepFetcher = (timeoutMs: number): Fetcher => reuseViaCep(viaCepBodies, regionFetcher(timeoutMs));");
    expect(turn).toMatch(/lookupRegion\(\s*cepFetcher\(/);
    expect(turn).toMatch(/checkCoverage\(\s*regionFetcher\(/);
    // R26.3: the second, short try of the same lookup; §117: each other size of a kit — all through the same fetcher.
    expect(turn.match(/lookupRegion\(/g)).toHaveLength(3);
    expect(turn.match(/lookupRegion\(\s*cepFetcher\(/g)).toHaveLength(3);
    // The only fetch that reads `headers` from its caller is the extracted one.
    expect(turn.match(/fetch\(url, \{\s*headers,/g)).toHaveLength(1);
  });

  it("os três CEPs de São Paulo com entrega na auditoria L2", () => {
    expect(turn).toMatch(/COVERAGE_ALARM_CEPS = \["01310100", "04710090", "04662002"\]/);
  });

  it("o job health é atendido antes do caminho da conversa", () => {
    const health = turn.indexOf('payload.job === "health"');
    expect(health).toBeGreaterThan(0);
    expect(health).toBeLessThan(turn.indexOf("let inbound = payload as"));
    expect(turn).toMatch(/if \(payload\.job === "health"\) return json\(200, await runHealthCheck\(\)\);/);
  });
});
