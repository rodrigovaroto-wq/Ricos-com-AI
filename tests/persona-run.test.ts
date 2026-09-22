import { describe, expect, it, vi } from "vitest";
import {
  cleanupPath,
  deliverOver,
  doorTarget,
  parseArgs,
  parsePersonaFile,
  parsePersonaReply,
  postgrestDb,
  renderMarkdown,
  requireEnv,
  runPersona,
  SYNTHETIC_PHONE_PREFIX,
  syntheticPhone,
  type Db,
  type Door,
  type Inbound,
  type PersonaModel,
  type TurnBody,
} from "@/dev/persona-run-core.js";

const PERSONA_FILE = `---
name: persona-teste
description: Caça nada. Só existe no teste.
tools: []
---

Você é a Teste, 40 anos.

Escreve curto.
`;

/** A persona that says each line in turn, then keeps repeating the last one. */
const scripted = (...lines: string[]): PersonaModel & { calls: number } => {
  const model = {
    calls: 0,
    async next() {
      const line = lines[Math.min(model.calls, lines.length - 1)]!;
      model.calls += 1;
      return line;
    },
  };
  return model;
};

/** A door that answers each delivery from the queue; records what it received. */
const fakeDoor = (...answers: TurnBody[]) => {
  const received: Inbound[] = [];
  const deliver = async (inbound: Inbound) => {
    received.push(inbound);
    return answers.shift() ?? { status: "ok", reply: "resposta padrão", costBrl: 0.01 };
  };
  return { deliver, received };
};

const fakeDb = (overrides: Partial<Db> = {}): Db => ({
  conversationFor: async () => ({ id: "conv-1", stage: "conversando", cost_brl: 0.02 }),
  outbound: async () => [],
  gateTraces: async () => [{ gate: "opt_out", verdict: "pass" }],
  deleteLeadsByPrefix: async () => 0,
  ...overrides,
});

const PHONE = `${SYNTHETIC_PHONE_PREFIX}123456`;

const run = (
  door: Door,
  model: PersonaModel,
  deliver: (i: Inbound) => Promise<TurnBody>,
  extra: { db?: Db; maxTurns?: number; sleep?: (ms: number) => Promise<void> } = {},
) =>
  runPersona({
    persona: parsePersonaFile(PERSONA_FILE),
    door,
    deliver,
    model,
    db: extra.db ?? fakeDb(),
    phone: PHONE,
    runId: "run-x",
    maxTurns: extra.maxTurns ?? 20,
    sleep: extra.sleep ?? (async () => undefined),
  });

describe("arquivo de persona", () => {
  it("descarta o frontmatter e usa o corpo inteiro como system prompt", () => {
    const persona = parsePersonaFile(PERSONA_FILE);
    expect(persona.name).toBe("persona-teste");
    expect(persona.system).toBe("Você é a Teste, 40 anos.\n\nEscreve curto.");
    expect(persona.system).not.toContain("description");
    expect(persona.system).not.toContain("---");
  });

  it("recusa arquivo sem frontmatter", () => {
    expect(() => parsePersonaFile("Você é a Teste.")).toThrow(/frontmatter/);
  });

  it("recusa arquivo sem corpo", () => {
    expect(() => parsePersonaFile("---\nname: x\n---\n\n")).toThrow(/corpo/);
  });
});

describe("marcador de fim", () => {
  it("mensagem seguida de [FIM] na linha seguinte: envia a mensagem sem o marcador", () => {
    expect(parsePersonaReply("vou pensar, tchau\n[FIM]")).toEqual({ text: "vou pensar, tchau", ended: true });
  });

  it("só [FIM]: ela sumiu sem dizer nada", () => {
    expect(parsePersonaReply("[FIM]")).toEqual({ text: "", ended: true });
    expect(parsePersonaReply("  [FIM]  \n")).toEqual({ text: "", ended: true });
  });

  it("sem marcador, a conversa continua", () => {
    expect(parsePersonaReply("quanto custa?")).toEqual({ text: "quanto custa?", ended: false });
  });
});

describe("o loop", () => {
  it("termina no marcador: entrega a última mensagem e não chama a persona de novo", async () => {
    const model = scripted("oi", "ok comprei\n[FIM]");
    const door = fakeDoor({ status: "ok", reply: "oi! como posso ajudar?" }, { status: "ok", reply: "obrigada!" });
    const report = await run("function", model, door.deliver);
    expect(model.calls).toBe(2);
    expect(door.received.map((i) => i.body)).toEqual(["oi", "ok comprei"]);
    expect(report.endReason).toBe("persona_finished");
    expect(report.failure).toBeNull();
  });

  it("só [FIM] não entrega nada à Valen", async () => {
    const model = scripted("oi", "[FIM]");
    const door = fakeDoor({ status: "ok", reply: "oi!" });
    const report = await run("function", model, door.deliver);
    expect(door.received).toHaveLength(1);
    expect(report.endReason).toBe("persona_left");
  });

  it("respeita o limite de turnos", async () => {
    const model = scripted("de novo");
    const door = fakeDoor();
    const report = await run("function", model, door.deliver, { maxTurns: 3 });
    expect(door.received).toHaveLength(3);
    expect(model.calls).toBe(3);
    expect(report.endReason).toBe("max_turns");
  });

  it("cada mensagem tem externalId próprio e o telefone sintético", async () => {
    const door = fakeDoor();
    await run("function", scripted("a", "b", "c\n[FIM]"), door.deliver);
    const ids = door.received.map((i) => i.externalId);
    expect(new Set(ids).size).toBe(3);
    expect(door.received.every((i) => i.from === PHONE)).toBe(true);
  });

  it("devolve a resposta da Valen à persona como a vez da outra pessoa", async () => {
    const seen: string[][] = [];
    const model: PersonaModel = {
      async next(_system, messages) {
        seen.push(messages.filter((m) => m.role === "user").map((m) => m.content));
        return seen.length === 1 ? "oi" : "tchau\n[FIM]";
      },
    };
    await run("function", model, fakeDoor({ status: "ok", reply: "R$ 129,90 com frete" }).deliver);
    expect(seen[1]).toContain("R$ 129,90 com frete");
  });
});

describe("recepção automática (welcomed)", () => {
  it("portas local e function simulam o timer: segunda chamada com resume e o mesmo payload", async () => {
    for (const door of ["local", "function"] as const) {
      const fake = fakeDoor(
        { status: "welcomed", reply: "Oi! Já te respondo.", resumeInSeconds: 120 },
        { status: "ok", reply: "O colete custa R$ 129,90." },
      );
      const report = await run(door, scripted("oi\n[FIM]"), fake.deliver);
      expect(fake.received).toHaveLength(2);
      expect(fake.received[1]).toEqual({ ...fake.received[0], resume: true });
      const valen = report.transcript.filter((t) => t.from === "valen").map((t) => t.text);
      expect(valen).toEqual(["Oi! Já te respondo.", "O colete custa R$ 129,90."]);
    }
  });

  it("porta n8n não chama o resume: espera a resposta aparecer no banco", async () => {
    let polls = 0;
    const db = fakeDb({
      outbound: async () => {
        polls += 1;
        return polls < 3 ? ["Oi! Já te respondo."] : ["Oi! Já te respondo.", "O colete custa R$ 129,90."];
      },
    });
    const fake = fakeDoor({ status: "welcomed", reply: "Oi! Já te respondo.", resumeInSeconds: 120 });
    const sleep = vi.fn(async () => undefined);
    const report = await run("n8n", scripted("oi\n[FIM]"), fake.deliver, { db, sleep });
    expect(fake.received).toHaveLength(1);
    expect(fake.received[0]!.resume).toBeUndefined();
    expect(sleep).toHaveBeenCalled();
    expect(report.transcript.at(-1)?.text).toBe("O colete custa R$ 129,90.");
    expect(report.failure).toBeNull();
  });

  it("porta n8n falha alto se a resposta real nunca chegar depois da recepção", async () => {
    const db = fakeDb({ outbound: async () => ["Oi! Já te respondo."] });
    const fake = fakeDoor({ status: "welcomed", reply: "Oi! Já te respondo.", resumeInSeconds: 1 });
    const report = await run("n8n", scripted("oi"), fake.deliver, { db });
    expect(report.failure).toMatch(/resume/);
  });

  it("resume_without_welcome é falha, não silêncio", async () => {
    const fake = fakeDoor({ status: "welcomed", reply: "Oi!" }, { status: "resume_without_welcome" });
    const report = await run("local", scripted("oi"), fake.deliver);
    expect(report.failure).toMatch(/resume_without_welcome/);
  });
});

describe("desfechos do corpo", () => {
  it.each(["handoff", "stopped", "opted_out", "already_opted_out", "already_handed_off", "deferred"])(
    "%s encerra a conversa sem falha",
    async (status) => {
      const model = scripted("oi");
      const report = await run("function", model, fakeDoor({ status, reply: null }).deliver);
      expect(model.calls).toBe(1);
      expect(report.endReason).toBe(status);
      expect(report.failure).toBeNull();
    },
  );

  it("fallback continua a conversa, com o texto seguro entregue à persona", async () => {
    const model = scripted("oi", "tchau\n[FIM]");
    const report = await run(
      "function",
      model,
      fakeDoor({ status: "fallback", reply: "Posso te ajudar com o tamanho?" }).deliver,
    );
    expect(model.calls).toBe(2);
    expect(report.transcript.find((t) => t.from === "valen")?.status).toBe("fallback");
  });

  it("status error no corpo é falha, mesmo com HTTP 200 (o n8n achata o status)", async () => {
    const report = await run("n8n", scripted("oi"), fakeDoor({ status: "error", error: "boom" }).deliver);
    expect(report.endReason).toBe("error");
    expect(report.failure).toMatch(/error/);
  });

  it("duplicate é falha: o runner nunca reenvia o mesmo externalId", async () => {
    const report = await run("function", scripted("oi"), fakeDoor({ status: "duplicate" }).deliver);
    expect(report.failure).toMatch(/duplicate/);
  });

  it("status desconhecido ou ausente é falha", async () => {
    const report = await run("function", scripted("oi"), fakeDoor({} as TurnBody).deliver);
    expect(report.failure).toMatch(/desconhecido/);
  });

  it("200 sem linha em conversations é falha", async () => {
    const db = fakeDb({ conversationFor: async () => null });
    const report = await run("n8n", scripted("oi"), fakeDoor({ status: "ok", reply: "oi" }).deliver, { db });
    expect(report.failure).toMatch(/conversations/);
  });

  it("o relatório carrega custo, gate_traces e estágio lidos do banco", async () => {
    const report = await run("function", scripted("oi\n[FIM]"), fakeDoor({ status: "ok", reply: "oi", costBrl: 0.03 }).deliver);
    expect(report.costBrl).toBe(0.03);
    expect(report.gateTraces).toEqual([{ gate: "opt_out", verdict: "pass" }]);
    expect(report.stage).toBe("conversando");
    expect(renderMarkdown(report)).toContain("persona-teste");
  });

  it.each([
    [{ status: "ok", reply: "fechado!", orderReady: true }],
    [{ status: "ok", reply: "fechado!", orderReady: false, order: { offer: "x" } }],
  ] as TurnBody[][])("orderReady ou order não-nulo marca ORDER_READY em destaque", async (body) => {
    const report = await run("function", scripted("quero\n[FIM]"), fakeDoor(body).deliver);
    expect(report.orderReady).toBe(true);
    expect(renderMarkdown(report)).toContain("ORDER_READY");
  });

  it("sem orderReady nem order, nada de ORDER_READY", async () => {
    const report = await run(
      "function",
      scripted("oi\n[FIM]"),
      fakeDoor({ status: "ok", reply: "oi", orderReady: false, order: null }).deliver,
    );
    expect(report.orderReady).toBe(false);
    expect(renderMarkdown(report)).not.toContain("ORDER_READY");
  });

  it("a porta function aparece marcada no relatório: prova o código, não o caminho", async () => {
    const report = await run("function", scripted("oi\n[FIM]"), fakeDoor().deliver);
    expect(renderMarkdown(report)).toMatch(/não o caminho/);
  });
});

describe("segurança", () => {
  it("telefone sintético sempre com o prefixo fixo", () => {
    const phone = syntheticPhone(() => 0.999999);
    expect(phone.startsWith(SYNTHETIC_PHONE_PREFIX)).toBe(true);
    expect(phone).toMatch(/^\d{13}$/);
  });

  it("recusa DELETE sem prefixo ou com prefixo diferente do sintético", () => {
    expect(() => cleanupPath("")).toThrow();
    expect(() => cleanupPath("55")).toThrow();
    expect(() => cleanupPath("5511")).toThrow();
    expect(cleanupPath(SYNTHETIC_PHONE_PREFIX)).toBe(`leads?phone=like.${SYNTHETIC_PHONE_PREFIX}*`);
  });

  it("o DELETE nunca sai sem o filtro do prefixo", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    const db = postgrestDb({ url: "https://x.supabase.co", key: "k", fetchImpl });
    await expect(db.deleteLeadsByPrefix("")).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();

    await db.deleteLeadsByPrefix(SYNTHETIC_PHONE_PREFIX);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(url).toBe(`https://x.supabase.co/rest/v1/leads?phone=like.${SYNTHETIC_PHONE_PREFIX}*`);
  });

  it("porta n8n exige --i-know-this-is-production", () => {
    expect(() => parseArgs(["--door=n8n", "--persona=jussara", "--n8n-does-not-create-orders"])).toThrow(
      /i-know-this-is-production/,
    );
  });

  it("porta n8n exige --n8n-does-not-create-orders: persona compradora pode virar pedido real", () => {
    expect(() => parseArgs(["--door=n8n", "--persona=jussara", "--i-know-this-is-production"])).toThrow(
      /n8n-does-not-create-orders/,
    );
    expect(
      parseArgs(["--door=n8n", "--persona=jussara", "--i-know-this-is-production", "--n8n-does-not-create-orders"]).door,
    ).toBe("n8n");
  });

  it("argumentos: padrão local, 20 turnos, sem limpeza", () => {
    const args = parseArgs(["--persona=jussara", "--persona=tati"]);
    expect(args).toMatchObject({ door: "local", personas: ["jussara", "tati"], maxTurns: 20, cleanup: false });
    expect(parseArgs(["--all", "--cleanup", "--max-turns=5"])).toMatchObject({ personas: "all", cleanup: true, maxTurns: 5 });
    expect(() => parseArgs([])).toThrow(/persona/);
    expect(() => parseArgs(["--door=prod", "--all"])).toThrow(/porta/);
  });

  it("falha alta e clara sem variável de ambiente, listando todas as que faltam", () => {
    expect(() => requireEnv({}, "function")).toThrow(/GEMINI_API_KEY.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/);
    expect(() =>
      requireEnv({ GEMINI_API_KEY: "g", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }, "n8n"),
    ).toThrow(/N8N_INBOUND_URL/);
    expect(() => requireEnv({ GEMINI_API_KEY: " ", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }, "local")).toThrow(
      /GEMINI_API_KEY/,
    );
  });

  it("cada porta aponta para o seu destino", () => {
    const env = requireEnv(
      { GEMINI_API_KEY: "g", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", N8N_INBOUND_URL: "https://n/webhook" },
      "n8n",
    );
    expect(doorTarget("function", env)).toEqual({
      url: "https://x.supabase.co/functions/v1/turn",
      headers: { "Content-Type": "application/json", Authorization: "Bearer k" },
    });
    expect(doorTarget("local", env).url).toBe("http://localhost:8000");
    expect(doorTarget("n8n", env).url).toBe("https://n/webhook");
  });

  it("porta local e function: HTTP não-2xx é falha com o corpo na mensagem", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"externalId e from são obrigatórios"}', { status: 400 }));
    const deliver = deliverOver({ url: "http://localhost:8000", headers: {} }, fetchImpl);
    await expect(deliver({ externalId: "e", from: PHONE, body: "oi" })).rejects.toThrow(/400.*obrigatórios/);
  });
});
