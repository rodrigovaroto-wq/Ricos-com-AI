import { describe, expect, it } from "vitest";
import { wantsHuman, runGates } from "@/agent/guardrails.js";
import { HUMAN_HANDOFF_REPLY, HOLDING_REPLY } from "@/agent/retry.js";
import { ctx } from "./fixtures.js";

/**
 * A terceira porta do handoff — a única que a cliente abre. As outras duas são o
 * sistema desistindo; esta é ela pedindo. Falso negativo deixa alguém falando com
 * robô contra a vontade; falso positivo mata uma venda que a agente ia fechar.
 */
describe("sentinela de pedido de humano (§Q12)", () => {
  it("reconhece o pedido nas formas em que ele é realmente escrito", () => {
    for (const pedido of [
      "quero falar com uma pessoa",
      "queria conversar com um atendente",
      "posso falar com alguém?",
      "me passa pra uma pessoa por favor",
      "me transfere para o suporte",
      "tem algum atendente aí?",
      "não quero falar com robô",
      "quero atendimento humano",
      "gostaria de falar com um vendedor",
    ]) {
      expect(wantsHuman(pedido), pedido).toBe(true);
    }
  });

  it("ignora acento e caixa, como toda a cadeia", () => {
    expect(wantsHuman("QUERO FALAR COM UM ATENDENTE")).toBe(true);
    expect(wantsHuman("quero falar com alguem")).toBe(true);
  });

  // Confirmados ao vivo antes da correção: os três disparavam um handoff irreversível.
  it("não lê como pedido o que é assunto, e não lê recusa como pedido", () => {
    for (const frase of [
      "quero falar com uma pessoa que ja comprou pra saber se funciona",
      "queria falar com alguem que ja usou o produto",
      "queria conversar com uma cliente que ja recebeu",
      "nao quero falar com uma pessoa agora, prefiro resolver aqui",
      "nao queria falar com um atendente, so tirar uma duvida",
    ]) {
      expect(wantsHuman(frase), frase).toBe(false);
    }
  });

  // Recusar robô É pedir gente, e começa com "não" — a guarda de negação não pode
  // engolir justamente o caso que ela mais parece.
  it("recusar robô continua sendo pedido de humano", () => {
    expect(wantsHuman("não quero falar com robô")).toBe(true);
    expect(wantsHuman("nao quero falar com bot, quero gente")).toBe(true);
  });

  it("não confunde conversa normal com pedido de humano", () => {
    for (const frase of [
      "tem uma pessoa que usa e amou",
      "sou uma pessoa muito ansiosa, chega rápido?",
      "quero falar sobre o tamanho",
      "uma amiga minha comprou com um atendente muito legal",
      "isso é humanamente possível?",
    ]) {
      expect(wantsHuman(frase), frase).toBe(false);
    }
  });
});

describe("as duas respostas que o sistema precisa sempre conseguir mandar", () => {
  // Se estas fossem vetadas, o último recurso do agente seria silêncio.
  it("passam na cadeia inteira", () => {
    expect(runGates(HUMAN_HANDOFF_REPLY, ctx()).allowed).toBe(true);
    expect(runGates(HOLDING_REPLY, ctx()).allowed).toBe(true);
  });

  it("não prometem prazo, preço nem cupom", () => {
    for (const texto of [HUMAN_HANDOFF_REPLY, HOLDING_REPLY]) {
      expect(texto).not.toMatch(/R\$|dias|cupom|desconto/i);
    }
  });

  it("não afirmam ser gente, que é o guardrail vizinho", () => {
    expect(runGates(HUMAN_HANDOFF_REPLY, ctx()).traces.find((t) => t.gate === "humanity_claim")?.verdict).toBe("pass");
  });
});
