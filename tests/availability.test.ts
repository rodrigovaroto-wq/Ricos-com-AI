import { describe, expect, it } from "vitest";
import {
  availabilityQuery,
  checkRegion,
  REFERENCE_SIZE,
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

  it("pergunta com o tamanho que está mapeado certo", async () => {
    let asked = "";
    await checkRegion(async (url) => {
      asked = url;
      return url.includes("viacep")
        ? { localidade: "São Paulo", uf: "SP", bairro: "Centro" }
        : yes;
    }, "04710-090");
    expect(asked).toContain(SIZE_CODES[REFERENCE_SIZE]);
    // O M é justamente o que não pode ser usado: a Coinzz responde por ele como se a
    // praça inteira estivesse fechada.
    expect(asked).not.toContain(SIZE_CODES.M);
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
});
