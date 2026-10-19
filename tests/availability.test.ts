import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_HEADERS,
  availabilityQuery,
  checkRegion,
  lookupRegion,
  toRegion,
  hasPendingCod,
  readAvailability,
  routeFor,
  SIZE_CODES,
} from "@/agent/availability.js";

/** A postcode where cash on delivery works, shape taken from a real response. */
const yes = {
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
          dates: [{ date: "2026-09-10" }, { date: "2026-09-11" }],
        },
      ],
    },
  },
};

/** The M in São Paulo: no window, no carrier quote — and 196 units in the warehouse. */
const no = {
  data: {
    products: [{ code: "proqvqmj", stock: "1", delivery_date: null }],
    has_local_operation_cash_on_delivery: false,
    has_pending_cash_on_delivery: false,
    local_operation: [],
    local_operation_cash_on_delivery: { delivery_days_available: [] },
  },
};

describe("disponibilidade", () => {
  it("lê a janela de entrega, não as flags", () => {
    const a = readAvailability("G", yes);
    // A flag do próprio corpo diz `false` — ler ela seria dizer "não" a uma praça que entrega.
    expect(a.cod).toBe(true);
    expect(a.codFreightBrl).toBe(24.98);
    expect(a.dates).toEqual(["2026-09-10", "2026-09-11"]);
    expect(a.labelBrl).toBe(19.345);
  });

  it("`stock: 1` não é disponibilidade", () => {
    // Os dois corpos trazem stock "1". Só um deles entrega.
    expect(readAvailability("M", no).cod).toBe(false);
    expect(readAvailability("G", yes).cod).toBe(true);
  });

  it("resposta ilegível lê como sem entrega, nunca como sim", () => {
    for (const body of [null, undefined, {}, { data: null }, "erro"]) {
      expect(readAvailability("G", body).cod).toBe(false);
    }
  });

  it("pendência de pagamento na entrega vem no mesmo corpo", () => {
    expect(hasPendingCod(yes)).toBe(false);
    expect(hasPendingCod({ data: { has_pending_cash_on_delivery: true } })).toBe(true);
  });

  it("a consulta manda o código do tamanho e o CEP, e nada de real da cliente", () => {
    const q = availabilityQuery("04710090", { city: "São Paulo", state: "SP", district: "Centro" }, SIZE_CODES.M);
    expect(q.get("products[0][code]")).toBe("proqvqmj");
    expect(q.get("zip_code")).toBe("04710090");
    expect(q.get("customer_document")).not.toBe("");
  });
});

describe("qual caminho oferecer", () => {
  const base = { size: "G", dates: [], codFreightBrl: null, windows: [], express: null } as const;

  it("entrega existindo, é a entrega", () => {
    expect(routeFor(readAvailability("G", yes)).path).toBe("cod");
  });

  it("sem entrega, o antecipado é sempre a resposta", () => {
    // Não existe recusar venda por praça cara: o excedente do teto vai para a cliente.
    expect(routeFor({ ...base, cod: false, labelBrl: 19.35 }).path).toBe("prepay");
    expect(routeFor({ ...base, cod: false, labelBrl: 84.05 }).path).toBe("prepay");
  });

  it("a cliente não paga frete em praça nenhuma", () => {
    // O teto com repasse durou um dia. A Logzz fixou o frete em R$ 15,00 pagos pelo
    // operador (suporte, 2026-09-09), então a cotação da transportadora deixou de
    // decidir qualquer coisa — o que varia entre regiões é o prazo, não o preço.
    for (const labelBrl of [13.79, 20, 84.05, null]) {
      expect(routeFor({ ...base, cod: false, labelBrl })).toEqual({ path: "prepay", labelBrl });
    }
  });

  it("etiqueta ausente não custa nada à cliente", () => {
    // O M em SP: sem cotação nenhuma, e o checkout antecipado abre mesmo assim. Cobrar
    // dela por uma cotação que ninguém deu é pior do que absorver.
    const r = routeFor(readAvailability("M", no));
    expect(r).toMatchObject({ path: "prepay" });
  });
});

/**
 * `availability.ts` re-declares the size ladder so it can be mirrored byte for byte
 * into the Edge Function. This is the test that stops the copy from rotting.
 */
describe("a escada de tamanhos não pode divergir", () => {
  it("as chaves de SIZE_CODES são exatamente SIZES", async () => {
    const { SIZES } = await import("@/agent/sizing.js");
    expect(Object.keys(SIZE_CODES)).toEqual([...SIZES]);
  });
});

/**
 * A oferta tem duas modalidades — "Padrão", agendada em três datas, e "Express — receba
 * hoje em até 4 horas". O leitor pegava só a primeira janela e jogava a Express fora,
 * que é justamente a frase mais forte que este funil tem para dizer.
 */
describe("Express", () => {
  const comExpress = {
    data: {
      local_operation: [{ price: 19.345 }],
      local_operation_cash_on_delivery: {
        delivery_days_available: [
          {
            deliveryTypeCode: "det1pgz5",
            deliveryTypeName: "Padrão",
            deliveryPrice: 24.98,
            deliverySameDay: 0,
            dates: [{ date: "2026-09-10" }],
          },
          {
            deliveryTypeCode: "detexp01",
            deliveryTypeName: "Express",
            deliveryPrice: 29.98,
            deliverySameDay: 1,
            dates: [{ date: "2026-09-09" }],
          },
        ],
      },
    },
  };

  it("lê as duas modalidades, não só a primeira", () => {
    const a = readAvailability("G", comExpress);
    expect(a.windows.map((w) => w.name)).toEqual(["Padrão", "Express"]);
  });

  it("a Express é a janela do mesmo dia, e custa mais", () => {
    const a = readAvailability("G", comExpress);
    expect(a.express?.name).toBe("Express");
    expect(a.express?.sameDay).toBe(true);
    expect(a.express?.priceBrl).toBe(29.98);
  });

  it("sem Express na resposta, não há Express para prometer", () => {
    expect(readAvailability("G", yes).express).toBeNull();
    expect(readAvailability("M", no).express).toBeNull();
  });

  it("o frete e as datas continuam sendo os da modalidade padrão", () => {
    const a = readAvailability("G", comExpress);
    expect(a.codFreightBrl).toBe(24.98);
    expect(a.dates).toEqual(["2026-09-10"]);
  });
});

/**
 * A consulta por região. É o que a onda 3 liga na conversa: uma pergunta só — o CEP —
 * e a agente sabe se a entrega chega ali, em que dias, e se tem Express. O tamanho não
 * é vetado por ela: quem decide isso é o checkout da Logzz, onde o M funciona.
 */
describe("região", () => {
  const place = { city: "São Paulo", state: "SP", district: "Centro" };

  // R28 (2026-10-19): stock split by warehouse — G only in Belo Horizonte, GG and XGG in São Paulo — and the G
  // alone told every São Paulo customer there was no delivery. All five sizes are asked; any one with delivery counts.
  it("pergunta os cinco tamanhos", async () => {
    const asked: string[] = [];
    await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Centro" };
      asked.push(new URL(url).searchParams.get("products[0][code]") ?? "");
      return yes;
    }, "04710-090");
    expect(asked.sort()).toEqual(Object.values(SIZE_CODES).sort());
  });

  it("o G sem entrega e o GG com entrega: a região tem entrega, com as datas do GG", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
      return url.includes(SIZE_CODES.GG) ? yes : no;
    }, "01310-100");
    expect(r?.cod).toBe(true);
    expect(r?.dates).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("negação: nenhum tamanho com entrega é região sem entrega", async () => {
    const r = await checkRegion(async (url) =>
      url.includes("viacep") ? { localidade: "Abaeté", uf: "MG", bairro: "Centro" } : no, "35620-000");
    expect(r?.cod).toBe(false);
  });

  it("o M, que a Coinzz não reconhece (404), não apaga a resposta dos outros tamanhos", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      return url.includes(SIZE_CODES.M) ? { type: "error", status: 404 } : yes;
    }, "30130-010");
    expect(r?.cod).toBe(true);
  });

  // R28 review: one size that throws (timeout, network, HTML) is one size unanswered, never the whole region.
  it("um tamanho que lança não derruba a região", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      if (url.includes(SIZE_CODES.XGG)) throw new Error("TimeoutError");
      return url.includes(SIZE_CODES.G) ? yes : no;
    }, "30130-010");
    expect(r?.cod).toBe(true);
  });

  it("todos os tamanhos lançando é região desconhecida, nunca região sem entrega", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      throw new Error("fetch failed");
    }, "30130-010");
    expect(r).toBeNull();
  });

  // R28 review: she wears G in São Paulo, where only the GG and the XGG have delivery. Her size decides.
  it("o tamanho dela decide: G sem entrega em SP, mesmo com o GG entregando", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
      return url.includes(SIZE_CODES.GG) || url.includes(SIZE_CODES.XGG) ? yes : no;
    }, "01310-100", "G");
    expect(r?.cod).toBe(false);
    expect(r?.size).toBe("G");
  });

  it("negação: o GG dela em SP tem entrega, e a resposta é do GG", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
      return url.includes(SIZE_CODES.GG) ? yes : no;
    }, "01310-100", "GG");
    expect(r?.cod).toBe(true);
    expect(r?.size).toBe("GG");
  });

  it("o M dela sem resposta: vale qualquer tamanho, e a resposta não fala pelo M", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      return url.includes(SIZE_CODES.M) ? null : yes;
    }, "30130-010", "M");
    expect(r?.cod).toBe(true);
    expect(r?.size).toBeNull();
  });

  it("o M dela sem resposta não promete o Express de outro tamanho", async () => {
    const express = structuredClone(yes);
    express.data.local_operation_cash_on_delivery.delivery_days_available[0]!.deliverySameDay = 1;
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
      return url.includes(SIZE_CODES.M) ? null : express;
    }, "01310-100", "M");
    expect(r?.sameDay).toBe(false);
    expect(r?.askedSize).toBe("M");
  });

  it("negação: sem tamanho conhecido, o Express da região continua valendo", async () => {
    const express = structuredClone(yes);
    express.data.local_operation_cash_on_delivery.delivery_days_available[0]!.deliverySameDay = 1;
    const r = await checkRegion(async (url) =>
      url.includes("viacep") ? { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" } : express, "01310-100");
    expect(r?.sameDay).toBe(true);
  });

  it("o G dela que estoura o tempo é região desconhecida, nunca a entrega do GG", async () => {
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista" };
      if (url.includes(SIZE_CODES.G)) throw new Error("TimeoutError");
      return yes;
    }, "01310-100", "G");
    expect(r).toBeNull();
  });

  // Operator, 2026-10-19: a failed lookup in a city where the Logzz delivers still sends both checkouts — the city is kept.
  it("a consulta que falha guarda a cidade do ViaCEP", async () => {
    const r = await lookupRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Campinas", uf: "SP", bairro: "Centro" };
      throw new Error("fetch failed");
    }, "13060-789");
    expect(r).toEqual({ kind: "failed", place: { city: "Campinas", state: "SP", district: "Centro" } });
  });

  it("negação: sem o ViaCEP, a falha não inventa cidade", async () => {
    const r = await lookupRegion(async () => null, "13060-789");
    expect(r).toEqual({ kind: "failed" });
  });

  it("sem tamanho, o G decide primeiro quando G e GG entregam em datas diferentes", async () => {
    const later = structuredClone(yes);
    later.data.local_operation_cash_on_delivery.delivery_days_available[0]!.dates = [{ date: "2026-09-20" }];
    const r = await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "Belo Horizonte", uf: "MG", bairro: "Centro" };
      return url.includes(SIZE_CODES.G) ? yes : later;
    }, "30130-010");
    expect(r?.dates).toEqual(["2026-09-10", "2026-09-11"]);
    expect(r?.size).toBeNull();
  });

  it("traz cobertura, datas e Express, e o custo da etiqueta", () => {
    const r = toRegion("04710-090", place, readAvailability("G", yes));
    expect(r).toMatchObject({ cod: true, sameDay: false, labelBrl: 19.345 });
    expect(r.dates).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("CEP que o ViaCEP não conhece devolve nada, e não um palpite de cidade", async () => {
    const r = await checkRegion(async () => ({ erro: true }), "00000-000");
    expect(r).toBeNull();
  });

  it("o CEP vai só com dígitos para o ViaCEP", async () => {
    let asked = "";
    await checkRegion(async (url) => {
      if (url.includes("viacep")) { asked = url; return { localidade: "X", uf: "SP" }; }
      return yes;
    }, "04710-090");
    expect(asked).toContain("/04710090/");
  });

  // Grafo §66 (C1): since 2026-09-24 the endpoint answers 302 to the home page without the
  // checkout's XHR header, and production read every region as unknown for two weeks.
  it("a consulta da Coinzz vai com o cabeçalho de XHR do checkout", async () => {
    const sent: Array<Readonly<Record<string, string>> | undefined> = [];
    await checkRegion(async (url, headers) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Centro" };
      sent.push(headers);
      return yes;
    }, "04662-002");
    expect(sent).toHaveLength(5);
    expect(sent.every((h) => h?.["X-Requested-With"] === "XMLHttpRequest")).toBe(true);
    expect(AVAILABILITY_HEADERS["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  // L2 (2026-10-08, grafo §67): the turn sent "04710-090" and Coinzz answered 422 "O CEP não foi
  // encontrado"; the fetcher's null was read as "no cash on delivery", and both real buyers in São
  // Paulo were told their region had no delivery. Digits only, and a failed lookup is unknown.
  it("o CEP vai só com dígitos para a Coinzz (com hífen ela responde 422)", async () => {
    let asked = "";
    await checkRegion(async (url) => {
      if (url.includes("viacep")) return { localidade: "São Paulo", uf: "SP", bairro: "Santo Amaro" };
      asked = url;
      return yes;
    }, "04710-090");
    expect(new URL(asked).searchParams.get("zip_code")).toBe("04710090");
  });

  it("consulta da Coinzz que falha é região desconhecida, nunca região sem entrega", async () => {
    const unprocessable = { message: "O CEP não foi encontrado. Por favor, recarregue a página e tente novamente." };
    for (const body of [null, undefined, unprocessable, {}, { data: null }, "erro"]) {
      const r = await checkRegion(async (url) =>
        url.includes("viacep") ? { localidade: "São Paulo", uf: "SP", bairro: "Santo Amaro" } : body, "04710-090");
      expect(r).toBeNull();
    }
  });

  it("negação: resposta de sucesso sem entrega continua sendo região sem entrega", async () => {
    const r = await checkRegion(async (url) =>
      url.includes("viacep") ? { localidade: "Manaus", uf: "AM", bairro: "Centro" } : no, "69005-010");
    expect(r).not.toBeNull();
    expect(r?.cod).toBe(false);
  });

  it("a função de produção repassa o cabeçalho ao fetch, e a varredura de dev também", () => {
    const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(turn).toMatch(/const lookup = await lookupRegion\(\s*regionFetcher\(/);
    expect(turn).toContain("const regionFetcher = (timeoutMs: number): Fetcher => async (url, headers) => {\n  const r = await fetch(url, { headers,");
    const sweep = readFileSync("src/dev/availability.ts", "utf8");
    expect(sweep).toContain("{ headers: AVAILABILITY_HEADERS }");
  });
});
