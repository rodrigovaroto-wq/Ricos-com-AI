import { describe, expect, it } from "vitest";
import {
  availabilityQuery,
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
    expect(routeFor(readAvailability("G", yes), 40).path).toBe("cod");
  });

  it("sem entrega, o antecipado é sempre a resposta", () => {
    // Não existe recusar venda por praça cara: o excedente do teto vai para a cliente.
    expect(routeFor({ ...base, cod: false, labelBrl: 19.35 }).path).toBe("prepay");
    expect(routeFor({ ...base, cod: false, labelBrl: 84.05 }).path).toBe("prepay");
  });

  it("o operador absorve até R$ 20; o que passa disso é da cliente", () => {
    expect(routeFor({ ...base, cod: false, labelBrl: 13.79 })).toMatchObject({ excessBrl: 0 });
    expect(routeFor({ ...base, cod: false, labelBrl: 20 })).toMatchObject({ excessBrl: 0 });
    expect(routeFor({ ...base, cod: false, labelBrl: 84.05 })).toMatchObject({ excessBrl: 64.05 });
  });

  it("etiqueta ausente não custa nada à cliente", () => {
    // O M em SP: sem cotação nenhuma, e o checkout antecipado abre mesmo assim. Cobrar
    // dela por uma cotação que ninguém deu é pior do que absorver.
    const r = routeFor(readAvailability("M", no));
    expect(r).toMatchObject({ path: "prepay", excessBrl: 0 });
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
