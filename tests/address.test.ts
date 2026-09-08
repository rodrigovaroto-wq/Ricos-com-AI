import { describe, expect, it } from "vitest";
import {
  confirmsAddress,
  extractAddress,
  isComplete,
  mergeAddress,
  nextQuestion,
  parseCep,
  renderConfirmation,
  type Address,
} from "@/agent/address.js";

describe("extração de endereço", () => {
  it("lê o endereço inteiro escrito de uma vez, como a cliente manda", () => {
    const { fields, missing } = extractAddress(
      "Rua das Flores, 123, apto 42, bairro Jardim Paulista, São Paulo/SP, CEP 01310-100",
    );
    expect(missing).toEqual([]);
    expect(fields).toMatchObject({
      cep: "01310-100",
      street: "Rua das Flores",
      number: "123",
      complement: "apto 42",
      neighborhood: "Jardim Paulista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("aceita CEP sem hífen e abreviação de avenida", () => {
    const { fields } = extractAddress(
      "Av. Paulista 1578, bairro Bela Vista, São Paulo - SP, 01310200",
    );
    expect(fields.cep).toBe("01310-200");
    expect(fields.street).toBe("Av. Paulista");
    expect(fields.number).toBe("1578");
  });

  it("guarda 's/n' em vez de inventar um número", () => {
    const { fields } = extractAddress("Estrada do Coco, s/n, bairro Centro, Camaçari/BA");
    expect(fields.number).toBe("s/n");
  });

  it("não inventa o que a mensagem não diz", () => {
    const { fields, missing } = extractAddress("moro em São Paulo");
    expect(fields.street).toBeUndefined();
    expect(fields.number).toBeUndefined();
    expect(missing).toContain("street");
    expect(missing).toContain("cep");
  });

  it("recusa CEP de dígito repetido, que é o que se digita sem saber o próprio", () => {
    expect(parseCep("meu cep é 00000-000")).toBeNull();
    expect(parseCep("11111111")).toBeNull();
    expect(parseCep("cep 04538-133")).toBe("04538-133");
  });

  it("não confunde sigla que não é estado com UF", () => {
    const { fields } = extractAddress("comprei na loja XY - AB, entrega em casa");
    expect(fields.state).toBeUndefined();
  });
});

describe("endereço reunido em várias mensagens", () => {
  it("junta o que veio depois sem sobrescrever o que já estava certo", () => {
    const primeira = extractAddress("Rua Bahia, 300, bairro Centro");
    expect(primeira.missing).toEqual(["cep", "city", "state"]);

    const segunda = extractAddress("é em Belo Horizonte/MG, CEP 30160-011");
    const juntos = mergeAddress(primeira.fields, segunda.fields);

    expect(juntos.missing).toEqual([]);
    expect(juntos.fields.street).toBe("Rua Bahia");
    expect(juntos.fields.city).toBe("Belo Horizonte");
    expect(juntos.fields.cep).toBe("30160-011");
  });

  it("o que a cliente já disse vence o que a segunda leitura acha", () => {
    const juntos = mergeAddress({ number: "123" }, { number: "456", city: "Recife" });
    expect(juntos.fields.number).toBe("123");
    expect(juntos.fields.city).toBe("Recife");
  });

  it("pergunta uma coisa por vez, na ordem em que se fala", () => {
    expect(nextQuestion(["city", "cep", "number"])).toBe("Qual é o seu CEP?");
    expect(nextQuestion([])).toBeNull();
  });
});

describe("confirmação repetida de volta (§D2)", () => {
  const endereco: Address = {
    cep: "01310-100",
    street: "Rua das Flores",
    number: "123",
    complement: "apto 42",
    neighborhood: "Jardim Paulista",
    city: "São Paulo",
    state: "SP",
  };

  it("repete o endereço em linhas separadas, para ser lido de verdade", () => {
    expect(renderConfirmation(endereco)).toBe(
      "Rua das Flores, 123 — apto 42\nJardim Paulista, São Paulo/SP\nCEP 01310-100",
    );
  });

  it("omite o complemento quando não existe", () => {
    const { complement: _complement, ...semComplemento } = endereco;
    expect(renderConfirmation(semComplemento)).not.toContain("—");
  });

  it("só é completo quando todo campo obrigatório existe", () => {
    expect(isComplete(endereco)).toBe(true);
    const { cep: _cep, ...semCep } = endereco;
    expect(isComplete(semCep)).toBe(false);
  });
});

/**
 * O CEP mora numa linha que parece a linha da rua, e o número da casa era lido de
 * dentro dele. Número errado em COD é o pacote que viaja, falha e volta.
 */
describe("o CEP não é o número da casa", () => {
  it("não inventa número quando só o CEP acompanha a rua", () => {
    expect(extractAddress("Rua das Flores, 13010-100").fields.number).toBeUndefined();
  });

  it("e continua lendo o número real quando ele existe", () => {
    const f = extractAddress("Rua das Flores 123, Campinas/SP, CEP 13010-100").fields;
    expect(f.number).toBe("123");
    expect(f.cep).toBe("13010-100");
  });
});

/**
 * O endereço lido de volta só vale se alguém conferir a resposta. Ler uma correção
 * como "sim" é como o pacote vai para o endereço antigo.
 */
describe("confirmação do endereço", () => {
  it("aceita o sim curto que vem depois da leitura", () => {
    for (const t of ["sim", "isso mesmo", "correto", "pode mandar", "ok", "perfeito", "é isso"]) {
      expect(confirmsAddress(t)).toBe(true);
    }
  });

  it("recusa qualquer coisa que carregue correção", () => {
    for (const t of ["não", "isso está errado", "mudou o número", "na verdade é 125", "trocar o bairro"]) {
      expect(confirmsAddress(t)).toBe(false);
    }
  });

  it("e recusa uma mensagem que não é resposta à pergunta", () => {
    expect(confirmsAddress("quanto custa?")).toBe(false);
    expect(confirmsAddress("uso 42 de calça")).toBe(false);
  });
});

/**
 * O que a produção da v16 gravou num lead real: `{"complement": "Ap arecida"}`, tirado do
 * nome "Maria Aparecida Souza". O `\b` abria a palavra e nada fechava, então toda
 * abreviação curta casava dentro de uma palavra maior.
 */
describe("complemento não se esconde dentro de outra palavra", () => {
  const complemento = (texto: string) => extractAddress(texto).fields.complement;

  it("nome próprio não vira complemento", () => {
    expect(complemento("meu nome é Maria Aparecida Souza")).toBeUndefined();
    expect(complemento("sou o Aparecido")).toBeUndefined();
    expect(complemento("foi no casamento da minha irmã")).toBeUndefined();
    expect(complemento("blusa tamanho 40")).toBeUndefined();
  });

  it("e o complemento de verdade continua sendo lido", () => {
    expect(complemento("Rua das Flores 123, apto 32")).toBe("apto 32");
    expect(complemento("Rua das Flores 123, ap 12")).toBe("ap 12");
    expect(complemento("Rua das Flores 123, bloco B")).toBe("bloco B");
    expect(complemento("Rua das Flores 123, casa")).toBe("casa");
    expect(complemento("Rua das Flores 123, fundos")).toBe("fundos");
  });
});
