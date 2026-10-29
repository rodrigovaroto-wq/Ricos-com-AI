/**
 * Real-model retest of 2026-10-29 (grafo §138): the kit path. Each phrase is the retest's, word for word; each has its negation.
 * The closure of `handleTurn` does not run in a unit test: its wiring is read from the source, as the other turn tests do.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractName } from "@/agent/identity.js";
import { kitSizeAsk, offerAsk, SIZE_ASK } from "@/agent/funnel.js";

describe("the kit's sizes are not her name", () => {
  it.each(["as duas G", "os dois G", "duas GG", "ambas G", "as duas são G", "as duas no G", "ambos M", "todas G", "as tres G"])(
    "%s",
    (t) => {
      expect(extractName(t)).toBeNull();
      expect(extractName(t, true)).toBeNull();
    },
  );
  it.each([["Maria Duarte", "Maria Duarte"], ["meu nome é Ana Souza", "Ana Souza"], ["Assis Oliveira", "Assis Oliveira"]])(
    "negation: %s stays a name",
    (t, name) => expect(extractName(t, true)).toBe(name),
  );
});

describe("the offer box of a kit with a size still open asks that size", () => {
  it("one of two known: the other piece", () => {
    expect(kitSizeAsk(2, ["G"])).toBe("A outra peça também é no G, ou em outro tamanho? 😊");
  });
  it("one of three known: the other two", () => {
    expect(kitSizeAsk(3, ["M"])).toBe("As outras 2 peças também são no M, ou em outros tamanhos? 😊");
  });
  it("negation: none known is the pants number, all known is no size ask", () => {
    expect(kitSizeAsk(2, [])).toBe(SIZE_ASK);
    expect(offerAsk(false, true)).not.toBe(SIZE_ASK);
  });
  it("the turn passes the kit's sizes to the box", () => {
    const src = readFileSync("supabase/functions/turn/index.ts", "utf8");
    expect(src).toContain("units > 1 && !sizeKnown ? kitSizeAsk(units, unitSizes) : offerAsk(cod, sizeKnown)");
  });
});
