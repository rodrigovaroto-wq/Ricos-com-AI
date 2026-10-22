import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePersonaMd } from "@/dev/persona-md.js";

const MD = `# cleide — concluída

- Porta: \`local\`

## Conversa

### Turno 1

**Cliente**: oi vi o anuncio
quero saber o preço

**Malu** (\`welcomed\`):

> Olá, tudo bem?
> Meu nome é Malu

Bolhas (2):
1. Olá

**Malu** (\`ok\`):

> Qual o número da calça?

Bolhas (1):
1. Qual

### Turno 2

**Cliente**: uso 44

**Malu** (\`fallback\`):

> Deixa eu confirmar

Bolhas (1):
1. Deixa

- Vetos: \`charge_promise\` (promises payment | rascunho vetado: x) · \`price_promise\` (y)
`;

describe("parsePersonaMd: a transcrição da auditoria como Conversation", () => {
  it("cliente em várias linhas, respostas da Malu com status, vetos na resposta de cima", () => {
    const c = parsePersonaMd(MD, "persona-cleide");
    expect(c.persona).toBe("persona-cleide");
    expect(c.transcript).toEqual([
      { from: "persona", text: "oi vi o anuncio\nquero saber o preço" },
      { from: "valen", status: "welcomed", text: "Olá, tudo bem?\nMeu nome é Malu" },
      { from: "valen", text: "Qual o número da calça?" },
      { from: "persona", text: "uso 44" },
      { from: "valen", status: "fallback", text: "Deixa eu confirmar", vetoes: [{ gate: "charge_promise" }, { gate: "price_promise" }] },
    ]);
  });

  it("uma transcrição real da auditoria tem cliente e Malu alternando", () => {
    const real = parsePersonaMd(readFileSync("docs/agente-ia/10-auditoria/personas-2026-10-19/seguranca/persona-cleide.md", "utf8"), "x");
    expect(real.transcript.filter((e) => e.from === "persona").length).toBeGreaterThan(2);
    expect(real.transcript.filter((e) => e.from === "valen").length).toBeGreaterThan(3);
    expect(real.transcript.every((e) => (e.text ?? "").length > 0)).toBe(true);
  });
});
