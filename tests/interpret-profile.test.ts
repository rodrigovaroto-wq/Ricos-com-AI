import { describe, expect, it } from "vitest";
import { INTERPRETER_SYSTEM, NEUTRAL_INTERPRETATION, readInterpretation } from "@/agent/interpret.js";

const read = (o: unknown) => readInterpretation(JSON.stringify(o)).interpretation;

/**
 * Os campos do perfil (plano 16 §4.1–§4.3) na leitura do JSON do intérprete. O leitor só
 * interpreta o JSON — quem entende a frase é o modelo, ensinado pelo `INTERPRETER_SYSTEM`; aqui se
 * prova que o formato certo passa e que todo formato errado vira o neutro.
 */
describe("leitura dos campos do perfil", () => {
  it("lê o formato declarado", () => {
    const i = read({
      occasion: "casamento",
      pain: "barriga marca no vestido",
      objections: ["preco", "entrega"],
      price_signal: "discount_ask",
      buying_question: true,
      hook: "Pro seu casamento ele vai deixar o vestido assentadinho 😍",
    });
    expect(i.occasion).toBe("casamento");
    expect(i.pain).toBe("barriga marca no vestido");
    expect(i.objections).toEqual(["preco", "entrega"]);
    expect(i.price_signal).toBe("discount_ask");
    expect(i.buying_question).toBe(true);
    expect(i.hook).toBe("Pro seu casamento ele vai deixar o vestido assentadinho 😍");
  });

  it("o neutro não traz nada do perfil", () => {
    expect(NEUTRAL_INTERPRETATION).toMatchObject({
      occasion: null, pain: null, objections: [], price_signal: null, buying_question: false, hook: null,
    });
    expect(read({})).toMatchObject({
      occasion: null, pain: null, objections: [], price_signal: null, buying_question: false, hook: null,
    });
  });

  it("tipo errado é neutro", () => {
    const i = read({ occasion: 1, pain: ["dor"], objections: "preco", price_signal: true, buying_question: "true", hook: {} });
    expect(i).toMatchObject({ occasion: null, pain: null, objections: [], price_signal: null, buying_question: false, hook: null });
  });

  it("texto vazio ou só espaço é null", () => {
    expect(read({ occasion: "   ", pain: "" })).toMatchObject({ occasion: null, pain: null });
  });

  it("corta cada texto no limite, sem quebrar emoji", () => {
    const i = read({ occasion: "a".repeat(60), pain: "b".repeat(100), hook: `${"c".repeat(89)}😍😍` });
    expect(i.occasion).toBe("a".repeat(40));
    expect(i.pain).toBe("b".repeat(80));
    expect(i.hook).toBe(`${"c".repeat(89)}😍`);
    expect([...(i.hook ?? "")].length).toBe(90);
  });

  it("hook sem ocasião nem dor é descartado", () => {
    expect(read({ hook: "Ele vai ficar lindo em você 😍" }).hook).toBeNull();
    expect(read({ pain: "dor nas costas", hook: "Ajuda a postura no dia a dia" }).hook).toBe("Ajuda a postura no dia a dia");
  });

  it("objeção fora da lista sai, repetida conta uma vez", () => {
    expect(read({ objections: ["preco", "golpe", "preco", 3, "outra", "PRECO"] }).objections).toEqual(["preco", "outra"]);
  });

  it("price_signal fora da lista é null", () => {
    for (const v of ["caro", "Complaint", "", "discount"]) expect(read({ price_signal: v }).price_signal, v).toBeNull();
    for (const v of ["complaint", "discount_ask", "installments", "discount_question"] as const) {
      expect(read({ price_signal: v }).price_signal).toBe(v);
    }
  });

  it("os campos de antes não mudam com os novos presentes", () => {
    const i = read({ wants_to_buy: true, size: { letter: "G" }, occasion: "trabalho", price_signal: "installments" });
    expect(i.wants_to_buy).toBe(true);
    expect(i.size.letter).toBe("G");
    expect(i.pending_answer).toBe("no_pending");
  });
});

/** O prompt do intérprete ensina cada campo, com as frases reais e as negações do §4.3. */
describe("o intérprete aprende os campos do perfil", () => {
  it.each([
    '"occasion"', '"pain"', '"objections"', '"price_signal"', '"buying_question"', '"hook"',
    // alta
    "tá caro", "achei mais barato", "faz por 100?", "não tenho esse dinheiro agora",
    // média
    "parcela?", "dá pra dividir?", "tem cupom?", "tem desconto no pix?",
    // negação
    "não achei caro",
    // o hook nunca promete
    "emagrecer", "reduzir medidas",
  ])("ensina %s", (frase) => {
    expect(INTERPRETER_SYSTEM).toContain(frase);
  });

  it("pedir desconto e perguntar se existe desconto são sinais diferentes", () => {
    expect(INTERPRETER_SYSTEM).toMatch(/"discount_ask" = pede um preço menor \("faz por 100\?"/);
    expect(INTERPRETER_SYSTEM).toMatch(/"discount_question" = só pergunta se existe desconto \("tem desconto\?"/);
  });
});
