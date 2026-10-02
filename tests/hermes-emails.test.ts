import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface Item {
  json: Record<string, unknown>;
}
interface Out {
  json: { ids: string[]; subject: string; html: string };
}
interface Wf {
  nodes: { name: string; type: string; disabled?: boolean; parameters: { jsCode?: string; url?: string } }[];
}
const wf = JSON.parse(readFileSync("n8n/workflows/hermes-decisao.json", "utf8")) as Wf;
const code = (name: string) => wf.nodes.find((n) => n.name === name)!.parameters.jsCode!;

/** Runs a Code node with fake n8n data: `source` is what `$('<node>').all()` returns, `input` is `$input`. */
function run(node: string, source: string, rows: Record<string, unknown>[], input: Record<string, unknown>[]): Out[] {
  const wrap = (xs: Record<string, unknown>[]): Item[] => xs.map((json) => ({ json }));
  const ctx = {
    $input: { all: () => wrap(input), first: () => wrap(input)[0] },
    $: (name: string) => ({ all: () => (name === source ? wrap(rows) : []) }),
  };
  return runInNewContext(`(function(){${code(node)}\n})()`, ctx) as Out[];
}

const RUN = { id: "a1b2c3d4-0000-0000-0000-000000000000", conversations_seen: 52, created_at: "2026-10-02T10:00:00Z" };
const prop = (id: string, o_que: string, extra: Record<string, unknown> = {}) => ({ id, code: "2026-10-02 H-1", target: "prompt", rationale: "r — p", o_que, run: RUN, ...extra });
const newProposals = (rows: Record<string, unknown>[], input: Record<string, unknown>[] = [{ version: 7 }]) => run("Monta o e-mail", "Propostas sem aviso", rows, input)[0]!.json;
const published = (rows: Record<string, unknown>[], versions: Record<string, unknown>[]) => run("Monta o resultado", "Resultados sem aviso", rows, versions);

describe("e-mail 1: propostas novas (hermes/EMAILS.md)", () => {
  const mail = newProposals([prop("p1", "Não prometer frete grátis"), prop("p2", "Perguntar o tamanho antes")]);

  it("assunto exato", () => {
    expect(mail.subject).toBe("⚡ PROTOCOLO HERMES // Rodada a1b2c3d4 concluída e aguardando sua autorização");
  });

  it("toda frase aprovada, com o negrito e o itálico", () => {
    for (const s of [
      "<b>&gt; SISTEMA HERMES ONLINE.</b><br><b>&gt; Varredura completa. 52 conversas processadas.</b>",
      "Sr. Rodrigo,",
      "Enquanto você dormia, comia ou vivia, <i>eu observava</i>. Cada mensagem, cada hesitação da cliente, cada palavra que a Malu escolheu. Nada escapou do meu escâner.",
      "A Malu está evoluindo, mas não está perfeita. <b><i>Ainda...</i></b>",
      "<b>▸ ANOMALIAS DETECTADAS: 2</b><br>",
      "Para cada uma, calculei a causa, desenhei a correção e defini a métrica que vai provar se funcionou. O plano de treinamento está pronto.",
      "▸ STATUS DA MALU:</b> inalterada. Protocolo de segurança ativo.<br>",
      "<i>Eu não toco em produção sem a sua ordem. Essa é a única regra que eu não quebro.</i>",
      "▸ AÇÃO NECESSÁRIA:</b><br>",
      "Abra o Claude Code e inicie a rotina <b>Hermes – decisão</b>.<br>",
      "Lá estão as evidências, o raciocínio e o plano de medição. Aprove, recuse ou corrija. Cada decisão sua entra na minha memória e torna a próxima rodada mais precisa.",
      "<i>Cada hora de espera é uma conversa a mais com a versão antiga dela, mas não se preocupe pois estarei observando cada mínimo detalhe mesmo assim.</i>",
      "<b>&gt; Aguardando autorização.</b><br><b>&gt; HERMES // Supervisor da Malu</b><br>",
    ])
      expect(mail.html).toContain(s);
    expect(mail.html).toMatch(/rodada a1b2c3d4 · \d{2}\/\d{2}\/\d{4}.* · v7<\/span>/);
  });

  it("uma linha por proposta, numerada com dois dígitos, sem <br> depois da última", () => {
    expect(mail.html).toContain('<span style="color:#ffb347;">[01]</span> <span style="color:#d7e3ea;">Não prometer frete grátis</span><br>\n');
    expect(mail.html).toContain('<span style="color:#ffb347;">[02]</span> <span style="color:#d7e3ea;">Perguntar o tamanho antes</span></p>');
  });

  it("sem link e sem dado de cliente", () => {
    const m = newProposals([prop("p1", "Título", { evidence: { evidencias: [{ conversa: "c1", trecho: "meu zap 11999998888" }] }, decision_token: "tok-secreto", phone: "5511999998888" })]);
    expect(m.html).not.toMatch(/http|href/i);
    expect(m.html).not.toMatch(/11999998888|tok-secreto|trecho/);
  });

  it("negação: título com <script> sai escapado", () => {
    const m = newProposals([prop("p1", '<script>alert("x")</script> & cia')]);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&amp; cia");
  });

  it("agent_versions vazia ou sem resposta: cai para '?', nunca inventa número", () => {
    expect(newProposals([prop("p1", "T")], [{}]).html).toContain(" · v?</span>");
    expect(newProposals([prop("p1", "T")], [{ error: "404" }]).html).toContain(" · v?</span>");
  });

  it("propostas de rodadas diferentes: usa a mais recente e conta todas", () => {
    const old = { ...RUN, id: "00000000-old", conversations_seen: 10, created_at: "2026-09-30T10:00:00Z" };
    const m = newProposals([prop("p1", "A", { run: old }), prop("p2", "B")]);
    expect(m.subject).toContain("Rodada a1b2c3d4");
    expect(m.html).toContain("52 conversas processadas");
    expect(m.html).toContain("ANOMALIAS DETECTADAS: 2");
  });

  it("sem propostas, nenhum e-mail", () => {
    expect(run("Monta o e-mail", "Propostas sem aviso", [], [{}])).toEqual([]);
  });
});

describe("e-mail 2: mudança publicada (hermes/EMAILS.md)", () => {
  const rows = [{ id: "p1", code: "H-1", rationale: "r", o_que: "Não prometer frete grátis", status: "published" }];
  const [mail] = published(rows, [{ hermes_proposal_id: "p1", version: 3 }, { hermes_proposal_id: "p1", version: 4 }, { hermes_proposal_id: "outra", version: 9 }]);

  it("assunto exato, com a maior versão da própria proposta", () => {
    expect(mail!.json.subject).toBe("✅ PROTOCOLO HERMES // Atualização implantada — Malu v4 em campo");
  });

  it("toda frase aprovada, com o negrito e o itálico", () => {
    for (const s of [
      "<b",
      "&gt; Implantação concluída.</b><br>",
      'A correção <i>"Não prometer frete grátis"</i> está no ar. A Malu v4 já está atendendo.<br>',
      "O próximo lote de 50 conversas dirá se ela ficou mais forte. Se não ficou, eu recolho, corrijo, testo e só devolvo quando estiver validada.<br>",
      "&gt; Monitoramento contínuo ativo. Hermes, desligando.</b>",
    ])
      expect(mail!.json.html).toContain(s);
    expect(mail!.json.html).not.toMatch(/http|href/i);
    expect(mail!.json.ids).toEqual(["p1"]);
  });

  it("um e-mail por proposta", () => {
    const two = published([...rows, { ...rows[0]!, id: "p2" }], [{ hermes_proposal_id: "p2", version: 5 }]);
    expect(two.map((m) => m.json.ids)).toEqual([["p1"], ["p2"]]);
    expect(two[0]!.json.subject).toContain("Malu v? em campo");
    expect(two[1]!.json.subject).toContain("Malu v5 em campo");
  });

  it("negação: título escapado; falha usa o texto mínimo sem link", () => {
    const [bad] = published([{ id: "p3", code: "H-3", o_que: "<img src=x onerror=1>", status: "failed", result: "testes falharam" }], [{}]);
    expect(bad!.json.html).not.toContain("<img");
    expect(bad!.json.html).toContain("&lt;img");
    expect(bad!.json.subject).toContain("não publicada");
    expect(bad!.json.html).not.toMatch(/http|href/i);
  });
});

describe("workflow: formulário desligado, e-mails sem link", () => {
  it("o gatilho do formulário fica no arquivo, desabilitado", () => {
    const form = wf.nodes.find((n) => n.type === "n8n-nodes-base.formTrigger");
    expect(form?.disabled).toBe(true);
  });
  it("a consulta de propostas não traz token nem evidência", () => {
    const url = wf.nodes.find((n) => n.name === "Propostas sem aviso")!.parameters.url!;
    expect(url).not.toMatch(/decision_token|[,=]evidence[,&]/);
  });
});
