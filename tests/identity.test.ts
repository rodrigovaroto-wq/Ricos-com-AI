import { describe, expect, it } from "vitest";
import {
  extractCpf,
  extractEmail,
  extractIdentity,
  extractName,
  isIdentityComplete,
  isValidCpf,
  mergeIdentity,
  nextIdentityQuestion,
} from "@/agent/identity.js";

/**
 * O CPF é conferido pelos próprios dígitos, não pelo formato. `111.111.111-11` tem
 * onze dígitos e não é CPF — e é exatamente o que alguém digita para passar de um
 * formulário. Pedido com documento errado é recusado do lado do pagamento, depois de
 * a cliente já ter dito sim.
 */
describe("CPF", () => {
  it("aceita um CPF válido, com ou sem pontuação", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });

  it("recusa os repetidos, que passam na aritmética", () => {
    for (const t of ["111.111.111-11", "000.000.000-00", "99999999999"]) {
      expect(isValidCpf(t)).toBe(false);
    }
  });

  it("recusa o que não tem onze dígitos", () => {
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("529982247250")).toBe(false);
  });

  it("acha o CPF no meio da frase", () => {
    expect(extractCpf("meu cpf é 529.982.247-25 tá?")).toBe("52998224725");
    expect(extractCpf("52998224725")).toBe("52998224725");
  });

  it("e não confunde outro número de onze dígitos", () => {
    expect(extractCpf("meu telefone é 11999998888")).toBeNull();
    expect(extractCpf("cep 13010-100")).toBeNull();
  });
});

describe("e-mail", () => {
  it("lê o e-mail da mensagem", () => {
    expect(extractEmail("pode mandar pra Ana.Silva+loja@gmail.com")).toBe("ana.silva+loja@gmail.com");
  });

  it("recusa o que ficou pela metade", () => {
    expect(extractEmail("meu email é joao@gmail")).toBeNull();
    expect(extractEmail("arroba gmail")).toBeNull();
  });
});

describe("nome", () => {
  it("lê o nome quando ela se apresenta", () => {
    expect(extractName("meu nome é Ana Paula Souza")).toBe("Ana Paula Souza");
    expect(extractName("me chamo Cida")).toBe("Cida");
  });

  it("lê a mensagem que é só o nome", () => {
    expect(extractName("Maria Aparecida")).toBe("Maria Aparecida");
  });

  it("não lê endereço, pergunta ou saudação como nome", () => {
    expect(extractName("Rua das Flores")).toBeNull();
    expect(extractName("quanto custa")).toBeNull();
    expect(extractName("oi")).toBeNull();
  });
});

describe("a coleta acumula e vira uma pergunta por vez", () => {
  it("junta o que veio em mensagens diferentes", () => {
    let known = extractIdentity("meu nome é Ana Paula").fields;
    expect(nextIdentityQuestion(extractIdentity("").missing)).toMatch(/nome completo/i);

    known = mergeIdentity(known, extractIdentity("ana@gmail.com").fields).fields;
    known = mergeIdentity(known, extractIdentity("529.982.247-25").fields).fields;
    expect(isIdentityComplete(known)).toBe(true);
    expect(nextIdentityQuestion(mergeIdentity(known, {}).missing)).toBeNull();
  });

  it("pergunta o CPF por último, que é o que trava", () => {
    const r = extractIdentity("meu nome é Ana Paula, ana@gmail.com");
    expect(nextIdentityQuestion(r.missing)).toMatch(/CPF/);
  });
});

/**
 * O achado mais constrangedor do review: duas palavras de letras viravam o nome
 * PERMANENTE da cliente — gravado no lead, levado no link do checkout e no corpo do
 * pedido, endereçado a ela no pacote.
 */
describe("mensagem comum não é nome", () => {
  it("cumprimento e intenção não viram nome", () => {
    for (const t of [
      "boa tarde",
      "bom dia",
      "quero comprar",
      "muito obrigada",
      "tudo bem",
      "pode ser",
      "qual o preco",
      "vou querer",
    ]) {
      expect(extractName(t)).toBeNull();
    }
  });

  it("nome de gente continua passando", () => {
    expect(extractName("Maria Aparecida Souza")).toBe("Maria Aparecida Souza");
    expect(extractName("Ana Beatriz")).toBe("Ana Beatriz");
  });

  it("quando ela apresenta, a frase diz que é nome — e aí vale", () => {
    // "meu nome é Boa" é estranho, mas ela disse que é o nome dela. Duvidar disso é
    // pior do que aceitar: quem se apresenta espera ser chamada assim.
    expect(extractName("meu nome é Bom Jesus da Silva")).toBe("Bom Jesus da Silva");
  });
});
