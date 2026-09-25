import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkWorkflow, type N8nWorkflow } from "../src/dev/n8n-rules.js";

const load = (file: string) => JSON.parse(readFileSync(`n8n/workflows/${file}.json`, "utf8")) as N8nWorkflow;

/**
 * O-04 e 2026-09-08: a chamada à Edge Function com a credencial errada, escondida por
 * `neverError`, parou a régua por semanas e o turno por um dia. `pnpm dev:n8n` baixa a
 * versão ATIVA e roda estas regras contra produção; este teste roda as mesmas regras
 * contra a cópia versionada.
 */
describe("n8n: a versão ativa versionada respeita as regras", () => {
  it.each(["turno-da-agente", "relogio-da-regua", "venda-confirmada", "hermes-decisao", "whatsapp-envio"])("%s", (file) => {
    expect(checkWorkflow(load(file))).toEqual([]);
  });
});

describe("n8n: as regras pegam as falhas que já aconteceram", () => {
  const sweep = (over: Partial<Record<string, unknown>>, cred = "Supabase service_role", disabled = false): N8nWorkflow => ({
    id: "x",
    name: "Relógio",
    active: true,
    nodes: [
      { name: "A cada 5 minutos", type: "n8n-nodes-base.scheduleTrigger", disabled },
      {
        name: "Varre a regua",
        type: "n8n-nodes-base.httpRequest",
        parameters: {
          url: "https://ref.supabase.co/functions/v1/turn",
          jsonBody: '{"job":"followups"}',
          options: { timeout: 120000, ...over },
        },
        credentials: { httpHeaderAuth: { name: cred } },
      },
    ],
  });

  it("credencial de modelo chamando a Edge Function (O-04)", () => {
    expect(checkWorkflow(sweep({}, "Gemini API")).join()).toContain('credential "Gemini API"');
    expect(checkWorkflow(sweep({}, "Meta API")).join()).toContain('credential "Meta API"');
  });
  it("neverError ligado", () => {
    expect(checkWorkflow(sweep({ response: { response: { neverError: true } } })).join()).toContain("neverError");
  });
  it("gatilho desligado num workflow ativo", () => {
    expect(checkWorkflow(sweep({}, "Supabase service_role", true)).join()).toContain("disabled");
  });
  it("turno da conversa com timeout abaixo de 150 s", () => {
    const wf = sweep({ timeout: 60000 });
    wf.nodes[1]!.parameters!.jsonBody = "={{ JSON.stringify($json.body) }}";
    expect(checkWorkflow(wf).join()).toContain("timeout 60000");
  });
  it("turno sem o Wait e a retomada da recepção (O2)", () => {
    const turno = load("turno-da-agente");
    const semWait = { ...turno, nodes: turno.nodes.filter((n) => n.type !== "n8n-nodes-base.wait") };
    expect(checkWorkflow(semWait).join()).toContain("no Wait node");
    const semResume = { ...turno, nodes: turno.nodes.filter((n) => !String(n.parameters?.jsonBody ?? "").includes("resume")) };
    expect(checkWorkflow(semResume).join()).toContain("resume: true");
  });
  it("venda sem repassar o token (O10)", () => {
    const venda = load("venda-confirmada");
    const semToken = {
      ...venda,
      nodes: venda.nodes.map((n) =>
        n.name === "Grava o pedido"
          ? { ...n, parameters: { ...n.parameters, jsonBody: '={{ JSON.stringify({ job: "order", order: $json.order }) }}' } }
          : n,
      ),
    };
    expect(checkWorkflow(semToken).join()).toContain("token");
  });
  it("a régua correta passa", () => {
    expect(checkWorkflow(sweep({}))).toEqual([]);
  });

  // Hermes (2026-09-25): o formulário é uma URL pública; sem o token e o status=proposed no
  // filtro, qualquer link aprova uma mudança que se implementa e se publica sozinha.
  it("formulário do Hermes que grava sem exigir o token", () => {
    const wf = load("hermes-decisao");
    const loose = {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.name === "Grava a decisão"
          ? { ...n, parameters: { ...n.parameters, url: String(n.parameters?.url).replace(/&decision_token=eq\.[^&]*/, "") } }
          : n,
      ),
    };
    expect(checkWorkflow(loose).join()).toContain("does not require the token");
  });

  // Revisão de segurança (2026-09-25): a porta encorpa-inbound é pública.
  it("Turno que repassa o corpo inteiro do webhook para o turno", () => {
    const wf = load("turno-da-agente");
    const loose = {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.name === "Cerebro do turno" ? { ...n, parameters: { ...n.parameters, jsonBody: "={{ JSON.stringify($json.body) }}" } } : n,
      ),
    };
    expect(checkWorkflow(loose).join()).toContain("forwards the public webhook's body whole");
  });
});
