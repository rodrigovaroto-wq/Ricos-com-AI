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
        { deliveryPrice: 24.98, dates: [{ date: "2026-09-10" }, { date: "2026-09-11" }] },
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
  const base = { size: "G", dates: [], codFreightBrl: null } as const;

  it("entrega existindo, é a entrega", () => {
    expect(routeFor(readAvailability("G", yes), 40).path).toBe("cod");
  });

  it("sem entrega, o antecipado é a ponte enquanto a etiqueta couber", () => {
    expect(routeFor({ ...base, cod: false, labelBrl: 19.35 }, 40).path).toBe("prepay");
    expect(routeFor({ ...base, cod: false, labelBrl: 84.05 }, 40)).toEqual({
      path: "waitlist",
      reason: "label_too_high",
    });
  });

  it("etiqueta ausente não é etiqueta cara", () => {
    // O M em SP: sem cotação nenhuma, e o checkout antecipado abre mesmo assim.
    expect(routeFor(readAvailability("M", no), 40).path).toBe("prepay");
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
