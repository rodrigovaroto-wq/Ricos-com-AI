/**
 * Operator (2026-10-19): a CEP the Correios do not know got "confere o CEP" four times (card idosa-desabafo). The way
 * out: her street and city find the CEP by the ViaCEP street search, and her house number picks the street's range.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickStreetCep, streetQueries, ufOfCep } from "@/agent/address.js";
import { cepsByStreet } from "@/agent/availability.js";

const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");

// Real ViaCEP answer for RS / Cruz Alta / Rua Marechal Floriano (2026-10-19).
const MARECHAL = [
  { cep: "98005-060", complement: "de 229/230 a 1524/1525" },
  { cep: "98025-680", complement: "até 227/228" },
  { cep: "98010-470", complement: "de 1526/1527 ao fim" },
];

describe("o estado pelo CEP", () => {
  it.each([["98005020", "RS"], ["01310-100", "SP"], ["69301000", "RR"], ["70040-010", "DF"], ["30140071", "MG"]])("%s → %s", (cep, uf) =>
    expect(ufOfCep(cep)).toBe(uf));
  it.each(["123", "", "abcdefgh"])("negação — não é CEP: %s", (cep) => expect(ufOfCep(cep)).toBeNull());
});

describe("a rua e a cidade dela", () => {
  it("com vírgula, a cidade é o último pedaço", () =>
    expect(streetQueries("rua marechal floriano, cruz alta")).toEqual([{ street: "rua marechal floriano", city: "cruz alta", number: null, state: null }]));
  it("com número e estado", () =>
    expect(streetQueries("moro na rua marechal floriano 120 cruz alta rs")).toEqual([{ street: "rua marechal floriano", city: "cruz alta", number: "120", state: "RS" }]));
  it("abreviação vira o nome da busca", () => expect(streetQueries("Av Paulista 1000, São Paulo - SP")[0]).toMatchObject({ street: "avenida Paulista", city: "São Paulo", state: "SP" }));
  it("sem separador, cada divisão é uma candidata", () =>
    expect(streetQueries("rua marechal floriano cruz alta").map((q) => q.city)).toContain("cruz alta"));
  it.each(["meu cep é 98005020", "tá bom", "uso 42", ""])("negação — sem rua: %s", (t) => expect(streetQueries(t)).toEqual([]));
});

describe("o CEP da casa dela pela faixa de número", () => {
  it.each([["120", "98025-680"], ["227", "98025-680"], ["229", "98005-060"], ["1525", "98005-060"], ["1526", "98010-470"], ["9000", "98010-470"]])(
    "número %s → %s",
    (n, cep) => expect(pickStreetCep(MARECHAL, n)).toBe(cep),
  );
  it("negação — sem número, uma rua de vários CEPs não vira CEP nenhum", () => expect(pickStreetCep(MARECHAL, null)).toBeNull());
  it("uma rua de um CEP só não precisa de número", () => expect(pickStreetCep([{ cep: "98005-200", complement: "" }], null)).toBe("98005-200"));
  it("negação — prédio com CEP próprio só pelo número exato", () =>
    expect(pickStreetCep([{ cep: "01311-921", complement: "1159" }, { cep: "01311-925", complement: "1415" }], "1000")).toBeNull());
});

describe("a busca no ViaCEP", () => {
  it("a primeira divisão que acha a rua vence, com o estado e a cidade na URL", async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return url.includes("/cruz%20alta/") ? [{ cep: "98005-060", complemento: "de 229/230 a 1524/1525", logradouro: "Rua Marechal Floriano Peixoto", localidade: "Cruz Alta" }] : [];
    };
    const found = await cepsByStreet(fetcher, "RS", streetQueries("rua marechal floriano cruz alta"));
    expect(found).toEqual([{ cep: "98005-060", complement: "de 229/230 a 1524/1525", street: "Rua Marechal Floriano Peixoto", city: "Cruz Alta" }]);
    expect(asked.some((u) => u.startsWith("https://viacep.com.br/ws/RS/cruz%20alta/rua%20marechal%20floriano/json/"))).toBe(true);
  });
  it("negação — busca que falha é lista vazia, nunca CEP inventado", async () => {
    expect(await cepsByStreet(async () => { throw new Error("down"); }, "RS", streetQueries("rua x, cruz alta"))).toEqual([]);
  });
});

describe("a turn (index.ts lido como fonte)", () => {
  it("só busca respondendo à conversa de CEP ou rua, e o CEP achado vira o dela", () => {
    expect(turn).toContain('const streetAsk = addressDraft.cep || !/\\b(?:cep|rua)\\b/i.test(lastOutbound)');
    expect(turn).toContain("const streetCep = streetFound ? pickStreetCep(streetFound, streetAsk[0]!.number) : null;");
    expect(turn).toContain("foundAddress.fields.cep = streetCep;");
  });
  it("o mesmo CEP não achado de novo pede a rua e a cidade, não 'confere'", () => {
    expect(turn).toContain("cepNotFound && herEarlier.filter((m: string) => parseCep(m) === badCep).length >= 2");
    expect(turn).toContain("não peça pra ela conferir de novo. Peça só o nome");
  });
});
