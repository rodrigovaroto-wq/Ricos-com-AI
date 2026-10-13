import { describe, expect, it } from "vitest";
import { runGates } from "@/agent/guardrails.js";
import { ctx } from "./fixtures.js";

/**
 * E4, 2026-10-13 (porta local, a mesma `turn` v17 da produção): `delivery_promise` vetou a garantia
 * de troca dita com a verdade como se fosse prazo de entrega — três vezes seguidas, e a compradora
 * decidida foi para uma pessoa. Config: entrega 1-3, antecipado média 5, garantia 7.
 */
const gates = (text: string, paymentPath: "cod" | "prepay") =>
  runGates(text, ctx({ paymentPath })).traces.filter((t) => t.verdict === "block").map((t) => t.gate);

const HONEST = [
  // Literal do E4.
  "Dá sim, a garantia pra trocar o tamanho é de 7 dias após o recebimento, e na troca o envio da peça fica por sua conta",
  "A garantia pra trocar o tamanho é de 7 dias após o recebimento.",
  "O prazo pra trocar o tamanho é de 7 dias.",
  "Você tem 7 dias após o recebimento pra trocar, e o envio da troca é por sua conta.",
  "a garantia é de 7 dias",
  "você tem 7 dias pra trocar",
  "7 dias após o recebimento pra pedir a troca",
  "prazo de troca de 7 dias",
  // /code-review (13/10): o marco de início da garantia antes da âncora não é chegada.
  "Depois que chegar, o prazo pra trocar é de 7 dias.",
  "Quando chegar aí, o prazo pra trocar é de 7 dias.",
  "Assim que receber, o prazo pra trocar é de 7 dias.",
  "Depois de receber, a garantia pra trocar o tamanho é de 7 dias.",
  // Personas v18, Marcinha (foi para uma pessoa): devolução por arrependimento, grátis (R16.3).
  "E não precisa ter medo de errar, se chegar e não servir você pode devolver em até 7 dias após o recebimento, com o dinheiro de volta sem custo nenhum",
];

const LIES = [
  "chega em 7 dias",
  "a entrega leva 7 dias",
  "em até 7 dias você recebe, e a troca é grátis",
  "chega em 7 dias e você tem 7 dias pra trocar",
  // A isenção nova lê "garantia pra trocar … é de"; um verbo de entrega no meio, ou depois, é prazo.
  "A garantia pra trocar o tamanho é de 7 dias pra chegar.",
  "A garantia pra trocar é de 7 dias, e chega em 7 dias.",
  "A garantia pra trocar chega em 7 dias.",
  // O envio isento é só o da troca com quem paga; qualquer outro envio continua chegada.
  "Você tem 7 dias pra trocar, e o envio é rapidinho.",
  "Você tem 7 dias pra trocar, e o envio da peça é rápido.",
  "Você tem 7 dias pra trocar, e o envio fica por nossa conta e chega em 7 dias.",
  "Você tem 7 dias pra trocar e o envio da peça chega em casa.",
  // Segunda revisão (Opus, 13/10): o sujeito coordenado traz a entrega para a mesma contagem…
  "a entrega e a garantia pra trocar o tamanho é de 7 dias",
  "a entrega e o prazo pra trocar o tamanho é de 7 dias",
  "o tempo de entrega e a garantia pra trocar é de 7 dias",
  "o tempo de entrega e o prazo pra trocar é de 7 dias",
  "Chega em 7 dias e o prazo pra trocar é de 7 dias",
  "Depois que chegar, a entrega e o prazo pra trocar é de 7 dias.",
  // O marco de início não isenta uma contagem própria nem a entrega depois dele.
  "Se chegar em 7 dias pra trocar, ótimo.",
  "Quando chegar em 7 dias pra trocar, você vê.",
  "Se o colete chegar em 7 dias, o prazo pra trocar é de 7 dias.",
  "Assim que receber, a entrega e o prazo pra trocar é de 7 dias.",
  "Se chegar e não servir você pode devolver em até 7 dias, e chega rapidinho.",
  "Se chegar e não servir você pode devolver, chega em até 7 dias.",
  // …e a velocidade depois de quem paga o envio é chegada.
  "a garantia pra trocar o tamanho é de 7 dias, e o envio da troca é por sua conta, rapidinho",
  "a garantia pra trocar o tamanho é de 7 dias, e o envio da troca é por sua conta e é rapidinho",
];

describe("E4 — a garantia de troca não é prazo de entrega", () => {
  for (const path of ["cod", "prepay"] as const) {
    for (const s of HONEST)
      it(`passa (${path}): ${s}`, () => expect(gates(s, path)).not.toContain("delivery_promise"));
    for (const s of LIES)
      it(`veta (${path}): ${s}`, () => expect(gates(s, path)).toContain("delivery_promise"));
  }

  it("a frase mista com a janela certa passa na entrega", () =>
    expect(gates("chega em 1 a 3 dias e você tem 7 dias pra trocar", "cod")).not.toContain("delivery_promise"));

  // A janela certa antes da âncora não é sujeito da contagem (segunda revisão): só a chegada é.
  it("a janela certa antes da garantia passa na entrega", () =>
    expect(gates("chega em 1 a 3 dias e a garantia pra trocar é de 7 dias", "cod")).not.toContain("delivery_promise"));

  it("garantia errada continua com o warranty_promise (e não vira garantia aqui)", () => {
    for (const path of ["cod", "prepay"] as const) {
      expect(gates("a garantia é de 30 dias", path)).toContain("warranty_promise");
      expect(gates("A garantia pra trocar o tamanho é de 30 dias após o recebimento.", path)).toContain("delivery_promise");
    }
  });
});
