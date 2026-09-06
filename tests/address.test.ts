import { describe, expect, it } from "vitest";
import {
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
