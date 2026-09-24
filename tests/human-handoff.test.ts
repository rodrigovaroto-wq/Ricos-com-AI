import { describe, expect, it } from "vitest";
import { asPhrase, gateBriefing, HUMAN_REQUEST_PHRASES, runGates, wantsHuman } from "@/agent/guardrails.js";
import {
  HUMAN_HANDOFF_REPLY,
  HOLDING_REPLY,
  ORDER_HANDOFF_REPLY,
  SAFE_FALLBACK_REPLY,
  THINK_REPLY,
  WELCOME_AUTO_REPLY,
  WELCOME_RESUME_DELAY_SECONDS,
} from "@/agent/retry.js";
import { ctx, config } from "./fixtures.js";

/**
 * A porta do handoff que a cliente abre — e a única que sobrou sendo sobre o que ela
 * escreve. As outras duas (teto de custo, falha do provedor) são o sistema desistindo.
 *
 * Duas regras, ambas decisão do operador (2026-09-08). A mensagem inteira tem de SER uma
 * frase da lista; e a frase tem de nomear um humano **em oposição a esta agente**. A
 * segunda é a que corta mais: a agente já é atendente e vendedora, então pedir atendente
 * é descrever o que a cliente está fazendo, não pedir para trocar de interlocutor.
 */
describe("sentinela de pedido de humano (§Q12)", () => {
  it("reconhece a frase exata, em qualquer caixa, acento ou pontuação", () => {
    for (const pedido of [
      "quero falar com uma pessoa",
      "QUERO FALAR COM UM HUMANO",
      "Quero falar com uma pessoa de verdade?",
      "me passa pra uma pessoa",
      "Me transfere para um humano.",
      "não quero falar com robô",
      "Não quero falar com uma máquina!",
      "atendimento humano",
      "quero falar com outro atendente",
      "quero   falar  com  um   humano",
    ]) {
      expect(wantsHuman(pedido), pedido).toBe(true);
    }
  });

  /**
   * O preço da regra de frase exata, escrito para ninguém o descobrir por acidente numa
   * conversa real. Estas mulheres podem estar pedindo gente e não são roteadas — elas
   * continuam atendidas pela agente, que o prompt manda oferecer chamar alguém.
   */
  it("não dispara com o pedido embutido numa frase maior — este é o custo aceito", () => {
    for (const frase of [
      "oi, tudo bem? queria falar com uma pessoa",
      "me passa pra uma pessoa por favor",
      "acho que quero falar com um humano",
      "vocês têm atendimento humano?",
      "nao quero falar com bot, quero gente",
    ]) {
      expect(wantsHuman(frase), frase).toBe(false);
    }
  });

  /**
   * A segunda regra, e a que evita o falso positivo mais caro de todos: o da PRIMEIRA
   * mensagem. A agente já é atendente e vendedora — pedir atendente, ou perguntar se tem
   * alguém aí, é a cliente iniciando a conversa, não pedindo outro interlocutor. Rotear
   * isso entrega a um humano a abertura de uma venda que ninguém estava perdendo.
   */
  it("pedir atendimento não é pedir outro atendente", () => {
    for (const frase of [
      "quero falar com um atendente",
      "olá, gostaria de falar com um atendente",
      "queria falar com uma atendente",
      "tem atendente ai",
      "tem alguem ai",
      "tem alguem disponivel pra falar",
      "quero falar com alguem",
      "quero falar com um vendedor",
    ]) {
      expect(wantsHuman(frase), frase).toBe(false);
    }
  });

  // Os três que disparavam handoff irreversível antes de a regra ser fechada. Com frase
  // exata eles não têm como voltar: nenhum deles está na lista, e nada mais é inferido.
  it("não lê como pedido o que é assunto, e não lê recusa como pedido", () => {
    for (const frase of [
      "quero falar com uma pessoa que ja comprou pra saber se funciona",
      "queria falar com alguem que ja usou o produto",
      "quero falar com uma pessoa amanha",
      "nao quero falar com uma pessoa agora, prefiro resolver aqui",
      "tem uma pessoa que usa e amou",
      "sou uma pessoa muito ansiosa, chega rápido?",
      "quero falar sobre o tamanho",
      "isso é humanamente possível?",
    ]) {
      expect(wantsHuman(frase), frase).toBe(false);
    }
  });

  it("a lista é o contrato inteiro: nada fora dela dispara", () => {
    for (const frase of HUMAN_REQUEST_PHRASES) expect(wantsHuman(frase), frase).toBe(true);
    // E toda entrada já está na forma normalizada — uma linha com acento ou maiúscula
    // nunca casaria com nada, e falharia em silêncio.
    for (const frase of HUMAN_REQUEST_PHRASES) expect(asPhrase(frase)).toBe(frase);
  });
});

describe("as respostas que o sistema precisa sempre conseguir mandar", () => {
  // Se qualquer uma destas fosse vetada, o último recurso do agente seria silêncio.
  it("passam na cadeia inteira", () => {
    for (const texto of [HOLDING_REPLY, SAFE_FALLBACK_REPLY, THINK_REPLY]) {
      expect(runGates(texto, ctx()).allowed, texto).toBe(true);
    }
  });

  /**
   * As duas linhas de handoff anunciam uma pessoa — "Já avisei o time" é fato quando o
   * código acabou de gravar o handoff, e mentira quando é o modelo quem escreve. Por isso
   * o turno as passa com `layer: "auto"` (o `handOff` do index.ts), e é assim que o teste
   * as passa também: o `humanity_claim` veta a mesma frase na camada "agent".
   */
  it("as linhas de handoff passam na cadeia pela camada auto, como o turno as manda", () => {
    for (const texto of [HUMAN_HANDOFF_REPLY, ORDER_HANDOFF_REPLY]) {
      expect(runGates(texto, ctx({ layer: "auto" })).allowed, texto).toBe(true);
    }
    // A mesma frase escrita pelo modelo continua vetada — o time não foi avisado por ele.
    expect(runGates(HUMAN_HANDOFF_REPLY, ctx()).allowed).toBe(false);
  });

  it("são as frases do operador, palavra por palavra (R13.2, 2026-09-24)", () => {
    expect(HUMAN_HANDOFF_REPLY).toBe("Claro! Já avisei o time e alguém te chama por aqui 💛");
    expect(ORDER_HANDOFF_REPLY).toBe("Vou checar pra você e já te retorno 💛");
    expect(THINK_REPLY).toBe("Sem problemas, estou aqui se tiver mais alguma dúvida");
  });

  it("não prometem prazo, preço nem cupom", () => {
    for (const texto of [HUMAN_HANDOFF_REPLY, ORDER_HANDOFF_REPLY, HOLDING_REPLY, SAFE_FALLBACK_REPLY, THINK_REPLY]) {
      expect(texto).not.toMatch(/R\$|dias|cupom|desconto/i);
    }
  });

  it("não afirmam ser gente, que é o guardrail vizinho", () => {
    for (const texto of [HUMAN_HANDOFF_REPLY, ORDER_HANDOFF_REPLY]) {
      expect(
        runGates(texto, ctx({ layer: "auto" })).traces.find((t) => t.gate === "humanity_claim")?.verdict,
        texto,
      ).toBe("pass");
    }
  });

  /**
   * A resposta de saída substitui o handoff quando a reescrita não passa, então ela tem
   * de fazer o que um handoff não faz: devolver o turno para a cliente. Sem pergunta, a
   * conversa morre ali — que era exatamente o defeito que a mudança veio corrigir.
   */
  it("a resposta de saída devolve o turno para a cliente", () => {
    expect(SAFE_FALLBACK_REPLY).toMatch(/\?/);
    expect(SAFE_FALLBACK_REPLY).not.toMatch(/algu[ée]m do time|uma pessoa|atendente/i);
  });
});

/**
 * O briefing existe para a agente escrever já dentro da regra, em vez de descobrir a
 * regra sendo vetada — e uma reescrita é uma segunda chamada de modelo paga por um
 * turno que ela podia ter acertado de primeira.
 */
describe("o briefing que vai no prompt", () => {
  it("todo gate de reescrita tem uma linha, e nenhuma vem vazia", () => {
    const linhas = gateBriefing(config);
    expect(linhas.length).toBe(17);
    for (const linha of linhas) expect(linha.trim().length).toBeGreaterThan(20);
  });

  it("carrega os números da configuração, não números escritos à mão", () => {
    const texto = gateBriefing(config).join(" ");
    expect(texto).toContain("R$ 129,90");
    expect(texto).toContain("R$ 216,50");
    expect(texto).toContain("1 a 3 dias");
    // O antecipado deixou de ter faixa e desconto em 2026-09-09: mesmo preço, e o prazo
    // é uma média que varia por região.
    expect(texto).toContain("em média 5 dias úteis");
    expect(texto).toContain("7 dias");
  });

  it("muda quando a loja muda: o cupom ligado aparece no briefing", () => {
    const ligado = gateBriefing({ ...config, coupon: { ...config.coupon, active: true } }).join(" ");
    expect(ligado).toContain("20% está ativo");
    expect(gateBriefing(config).join(" ")).toContain("Não existe cupom");
  });
});

/**
 * Estágio 0 — a recepção automática, aprovada pelo operador em 2026-09-21 com os
 * espaçamentos exatos; a segunda linha trocou "fará seu atendimento" por "esclarecerá
 * todas as suas dúvidas" em 2026-09-24 (R13.5). Mesma classe do handoff acima: texto fixo, layer "auto", nunca
 * o modelo. O timer de 2 minutos até a resposta real da Malu é decisão de arquitetura
 * ainda em aberto (n8n vs. varredura das réguas) — ver HANDOFF.md.
 */
describe("recepção automática do Estágio 0", () => {
  it("é exatamente o texto aprovado, com as quebras de linha aprovadas", () => {
    expect(WELCOME_AUTO_REPLY).toBe(
      "Oii, tudo bem?\n\n" +
        "Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas.\n\n" +
        "Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site:\n" +
        "encorpa-fashion.com.br",
    );
  });

  it("passa a régua de madrugada — é o ponto do layer auto (R4.4)", () => {
    const madrugada = ctx({ layer: "auto", now: new Date("2026-09-06T05:00:00") });
    expect(runGates(WELCOME_AUTO_REPLY, madrugada).allowed).toBe(true);
  });

  it("não promete preço, prazo nem cupom — não é a resposta real, é o aviso de recebido", () => {
    expect(WELCOME_AUTO_REPLY).not.toMatch(/R\$|cupom|desconto/i);
  });

  it("não afirma ser gente, nem nega ser agente — só confirma o recebimento", () => {
    expect(runGates(WELCOME_AUTO_REPLY, ctx()).traces.find((t) => t.gate === "humanity_claim")?.verdict).toBe(
      "pass",
    );
  });

  // O número que o n8n lê para o nó de espera (opção a, 2026-09-21) — fixado aqui
  // porque um valor sem teste é um valor que qualquer PR muda sem perceber o efeito.
  it("o timer de retomada é de 2 minutos", () => {
    expect(WELCOME_RESUME_DELAY_SECONDS).toBe(120);
  });
});
