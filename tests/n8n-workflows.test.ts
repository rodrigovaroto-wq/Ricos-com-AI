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
  it.each(["turno-da-agente", "relogio-da-regua", "venda-confirmada", "hermes-decisao", "whatsapp-envio", "responder-cliente"])("%s", (file) => {
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
        onError: "continueErrorOutput",
      },
      { name: "Avisa a falha", type: "n8n-nodes-base.emailSend" },
    ],
    connections: { "Varre a regua": { main: [[], [{ node: "Avisa a falha" }]] } },
  });

  it("credencial de modelo chamando a Edge Function (O-04)", () => {
    expect(checkWorkflow(sweep({}, "Gemini API")).join()).toContain('credential "Gemini API"');
    expect(checkWorkflow(sweep({}, "Meta API")).join()).toContain('credential "Meta API"');
  });
  it("envio do WhatsApp sem a credencial da Cloud API (2026-10-06)", () => {
    const envio = load("whatsapp-envio");
    const sem = { ...envio, nodes: envio.nodes.map((n) => (n.name === "Envia pela Cloud API" ? (({ credentials: _, ...rest }) => rest)(n) : n)) };
    expect(checkWorkflow(sem).join()).toContain('credential "none"');
    const tipo = { ...envio, nodes: envio.nodes.map((n) => (n.name === "Envia pela Cloud API" ? { ...n, parameters: { ...n.parameters, genericAuthType: "httpTemplatedCustomAuth" } } : n)) };
    expect(checkWorkflow(tipo).join()).toContain("Header Auth");
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
  it("turno que responde ao webhook só depois do Wait (2026-09-30)", () => {
    const turno = load("turno-da-agente");
    const embaixo = {
      ...turno,
      nodes: turno.nodes.map((n) => (n.name === "Devolve a resposta" ? { ...n, position: [432, 0] as [number, number] } : n)),
    };
    expect(checkWorkflow(embaixo).join()).toContain("Devolve a resposta: runs after");
    const semPosicao = { ...turno, nodes: turno.nodes.map(({ position: _p, ...n }) => n) };
    expect(checkWorkflow(semPosicao).join()).toContain("Devolve a resposta: runs after");
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
  // L0.3: o formulário que escreve para a cliente real é URL pública.
  it("formulário de resposta humana sem senha", () => {
    const wf = load("responder-cliente");
    expect(checkWorkflow(wf)).toEqual([]);
    const semSenha = {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.type === "n8n-nodes-base.formTrigger" ? { ...n, parameters: { ...n.parameters, authentication: "none" } } : n,
      ),
    };
    expect(checkWorkflow(semSenha).join()).toContain("no password");
    // O mesmo corpo escrito como JSON com a chave entre aspas, o outro estilo do repositório.
    const aspas = {
      ...semSenha,
      nodes: semSenha.nodes.map((n) =>
        n.name === "Grava a resposta" ? { ...n, parameters: { ...n.parameters, jsonBody: '{"job":"human_reply","phone":"5511"}' } } : n,
      ),
    };
    expect(checkWorkflow(aspas).join()).toContain("no password");
    // Negação: o formulário do Hermes não manda nada para cliente e não é pego por esta regra.
    expect(checkWorkflow(load("hermes-decisao"))).toEqual([]);
  });
  it("formulário de resposta humana repassa telefone e texto no job certo", () => {
    const body = String(load("responder-cliente").nodes.find((n) => n.name === "Grava a resposta")!.parameters!.jsonBody);
    expect(body).toMatch(/job: "human_reply", phone: \$json\.telefone, text: \$json\.mensagem/);
  });
  // 2026-09-28: a varredura sem saída de erro falhava a cada 5 minutos sem avisar ninguém.
  it("chamada à Edge Function sem saída de erro ligada", () => {
    const semOnError = sweep({});
    delete semOnError.nodes[1]!.onError;
    expect(checkWorkflow(semOnError).join()).toContain("no wired error output");
    const desligada = { ...sweep({}), connections: { "Varre a regua": { main: [[], []] } } };
    expect(checkWorkflow(desligada).join()).toContain("no wired error output");
  });
  it("a régua correta passa", () => {
    expect(checkWorkflow(sweep({}))).toEqual([]);
  });

  // Hermes (2026-09-25): o formulário é uma URL pública; sem o token e o status=proposed no
  // filtro, qualquer link aprova uma mudança que se implementa e se publica sozinha.
  it("formulário do Hermes que grava sem exigir o token", () => {
    const wf = load("hermes-decisao");
    // The form is disabled in the file since 2026-10-02; the rule only guards an enabled one.
    const loose = {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.name === "Formulário de decisão"
          ? { ...n, disabled: false }
          : n.name === "Grava a decisão"
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

  // 2026-09-28: o selo cobre `reply.id` desde 6d838b2; um nó que monta o corpo sem `reply`
  // faz todo toque de botão voltar 401 com INBOUND_SIGNING_SECRET setado.
  it.each(["Cerebro do turno", "Resposta de verdade"])("Turno cujo nó %s não repassa o reply selado", (name) => {
    const wf = load("turno-da-agente");
    const loose = {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.name === name
          ? { ...n, parameters: { ...n.parameters, jsonBody: String(n.parameters?.jsonBody).replace(/,\s*reply:[^,}]*/, "") } }
          : n,
      ),
    };
    expect(String(loose.nodes.find((n) => n.name === name)?.parameters?.jsonBody)).not.toMatch(/reply/);
    expect(checkWorkflow(loose).join()).toContain(`${name}: does not forward sealed field reply`);
  });
});

// The e-mail tests of the old approval link moved to tests/hermes-emails.test.ts (2026-10-02):
// the e-mails carry titles only and no link; the decision happens in the Routine.
