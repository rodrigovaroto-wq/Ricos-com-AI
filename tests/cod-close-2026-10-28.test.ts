/**
 * The pay-on-delivery sale closed in the conversation by the Logzz Order Import API (operator, 2026-10-28, grafo §135): the door
 * from the Logzz dates for HER package, the dates offered, her data, a summary, and the order created only on her explicit yes to
 * that very summary. Every wrong import is a real order and R$ 9,99 at the door.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "@/config/business.js";
import { runGates } from "@/agent/guardrails.js";
import { codOfferText } from "@/agent/funnel.js";
import {
  CLOSE_CPF_REFUSED,
  CLOSE_OPEN_ORDER,
  PHONE_ASK,
  SUMMARY_HEAD,
  asksDateChange,
  cachedCodDates,
  closeConfirmed,
  closeDirective,
  closeNoCodLine,
  closeOrderId,
  closeRetryLater,
  closeStep,
  codPackage,
  confirmsOrder,
  houseNumberIn,
  importPayload,
  importedTwin,
  isCloseMessage,
  lookupCodDates,
  nationalPhone,
  pickDate,
  placeOrder,
  readCodDates,
  readImport,
  type CloseFacts,
  type CodDate,
  type LogzzOrderConfig,
} from "@/agent/cod-close.js";
import { isOrderDead } from "@/agent/followups.js";
import { ctx } from "./fixtures.js";

const prod = loadBusinessConfig("docs/operacao/business-config-2026-10-27.min.json");
const next = loadBusinessConfig("docs/operacao/business-config-2026-10-28.min.json");
const turn = readFileSync("supabase/functions/turn/index.ts", "utf8");
// The Logzz variations of the parent `prow6pq0` (operator, verified by the coordinator on the live import, 2026-10-28).
const cfg: LogzzOrderConfig = next.logzzImport!;
// Wednesday 28/10, noon in São Paulo.
const NOW = new Date("2026-10-28T15:00:00Z");
const DATES: CodDate[] = [
  { date: "2026-10-29", typeCode: "det1pgz5" },
  { date: "2026-10-30", typeCode: "det1pgz5" },
  { date: "2026-10-31", typeCode: "det1pgz5" },
];
const ISO = DATES.map((d) => d.date);
const vetoes = (text: string, codDates?: readonly string[]) =>
  runGates(text, ctx({ config: prod, ...(codDates ? { codDates } : {}) })).traces.filter((t) => t.verdict === "block").map((t) => `${t.gate}: ${t.detail ?? ""}`);

/** The real answers of the public dates query (curl, 2026-10-28). */
const SP_G_200 = {
  type: "success",
  status: 200,
  serves_region: true,
  response: {
    zip_code: "04710090",
    city: "São Paulo",
    state: "SP",
    dates_available: [
      { date: "2026-10-29", type_code: "det1pgz5", type_name: "Padrão", price: 24.98, local_operation_code: "look6jp6", local_operation_name: "São Paulo" },
      { date: "2026-10-30", type_code: "det1pgz5", type_name: "Padrão", price: 24.98, local_operation_code: "look6jp6", local_operation_name: "São Paulo" },
      { date: "2026-10-31", type_code: "det1pgz5", type_name: "Padrão", price: 24.98, local_operation_code: "look6jp6", local_operation_name: "São Paulo" },
    ],
  },
};
const SP_GG_422 = { type: "error", status: 422, message: "Produto sem estoque disponível para agendamento nessa cidade.", errors: ["Produto sem estoque disponível para agendamento nessa cidade."], serves_region: false };

const facts = (over: Partial<CloseFacts> = {}): CloseFacts => ({
  dates: DATES,
  name: "Maria Aparecida Souza",
  cpf: "52998224725",
  cpfInvalid: false,
  cep: "04710090",
  cepStreet: "Rua Barão do Triunfo",
  cepNeighborhood: "Brooklin Paulista",
  city: "São Paulo",
  state: "SP",
  typed: {},
  stored: { number: "100" },
  phone: "11987654321",
  what: "Colete G",
  priceBrl: 109.9,
  freeShipping: true,
  ...over,
});
const step = (over: { facts?: Partial<CloseFacts>; state?: object; parts?: string[]; lastOutbound?: string; datesAsked?: boolean } = {}) =>
  closeStep({
    facts: facts(over.facts),
    state: over.state ?? {},
    parts: over.parts ?? [],
    lastOutbound: over.lastOutbound ?? "",
    datesAsked: over.datesAsked ?? true,
    now: NOW,
  });

describe("1. o pacote dela, em códigos da Logzz", () => {
  it("uma peça, kit de tamanhos diferentes, kit do mesmo tamanho", () => {
    expect(codPackage(cfg, ["G"], 1)).toMatchObject({ offer: "sal0g3mo", productCode: "prow6pq0", items: [{ code: "projm2ov", quantity: 1 }] });
    expect(codPackage(cfg, ["G", "XGG"], 2)).toMatchObject({ offer: "salng30n", items: [{ code: "projm2ov", quantity: 1 }, { code: "prox1jxp", quantity: 1 }], key: "G+XGG" });
    expect(codPackage(cfg, ["M", "M", "G"], 3)).toMatchObject({ offer: "sal6gz39", items: [{ code: "pro37j6q", quantity: 2 }, { code: "projm2ov", quantity: 1 }] });
  });
  it("sem a chave, sem URL https, sem oferta para a quantidade, sem um tamanho, ou tamanhos que faltam: desligado", () => {
    expect(codPackage(undefined, ["G"], 1)).toBeNull();
    expect(codPackage(prod.logzzImport, ["G"], 1)).toBeNull();
    expect(codPackage({ ...cfg, productCode: "" }, ["G"], 1)).toBeNull();
    expect(codPackage({ ...cfg, importUrl: "http://x" }, ["G"], 1)).toBeNull();
    expect(codPackage({ ...cfg, offers: { "1": "sal0g3mo" } }, ["G", "G"], 2)).toBeNull();
    expect(codPackage({ ...cfg, variations: { G: "projm2ov" } }, ["M"], 1)).toBeNull();
    expect(codPackage(cfg, ["G"], 2)).toBeNull();
  });
});

describe("2. as datas da Logzz: falha nunca é 'sem entrega'", () => {
  it("lê o 200 real de São Paulo/G", () => {
    expect(readCodDates(200, SP_G_200)).toEqual({ kind: "dates", dates: DATES });
  });
  it("os três 'não entrega aí' da Logzz são 'none'", () => {
    expect(readCodDates(422, SP_GG_422).kind).toBe("none");
    expect(readCodDates(422, { type: "error", message: "CEP não encontrado." }).kind).toBe("none");
    expect(readCodDates(422, { type: "error", message: "Área não disponível para entrega." }).kind).toBe("none");
    expect(readCodDates(200, { ...SP_G_200, response: { ...SP_G_200.response, dates_available: [] } }).kind).toBe("none");
  });
  it("negação: erro inesperado, 429, 500, corpo ilegível e rede caída são 'failed'", () => {
    expect(readCodDates(422, { type: "error", message: "Erro ao buscar opções de entrega" }).kind).toBe("failed");
    expect(readCodDates(422, { type: "error", message: "O campo products é obrigatório." }).kind).toBe("failed");
    expect(readCodDates(429, { message: "Área não disponível para entrega." }).kind).toBe("failed");
    expect(readCodDates(500, null).kind).toBe("failed");
    expect(readCodDates(200, { type: "success", response: { dates_available: [{ date: "29/10" }] } }).kind).toBe("failed");
    expect(readCodDates(200, "<html>").kind).toBe("failed");
  });
  it("um dia, uma modalidade: a Padrão antes da Express", () => {
    const r = readCodDates(200, { type: "success", response: { dates_available: [{ date: "2026-10-29", type_code: "exp", type_name: "Express" }, { date: "2026-10-29", type_code: "pad", type_name: "Padrão" }] } });
    expect(r).toEqual({ kind: "dates", dates: [{ date: "2026-10-29", typeCode: "pad" }] });
  });
  it("a consulta manda o pacote dela e nunca lança", async () => {
    const seen: unknown[] = [];
    const ok = await lookupCodDates(async (url, body) => (seen.push(url, body), { status: 200, body: SP_G_200 }), "04710-090", codPackage(cfg, ["G"], 1)!, "Brooklin");
    expect(ok.kind).toBe("dates");
    expect(seen).toEqual(["https://app.logzz.com.br/api/delivery-day/options/zip-code/04710090", { products: [{ code: "prow6pq0", quantity: 1, variants: [{ code: "projm2ov", quantity: 1 }] }], neighborhood: "Brooklin" }]);
    expect(await lookupCodDates(async () => { throw new Error("fetch failed"); }, "04710090", codPackage(cfg, ["G"], 1)!)).toEqual({ kind: "failed" });
  });
  it("o cache vale dez minutos, no mesmo dia, para o mesmo CEP e o mesmo pacote", () => {
    const c = { cep: "04710090", key: "G", checkedAt: NOW.toISOString(), result: { kind: "dates" as const, dates: DATES } };
    expect(cachedCodDates(c, "04710-090", "G", NOW.getTime() + 9 * 60_000)).not.toBeNull();
    expect(cachedCodDates(c, "04710090", "G", NOW.getTime() + 11 * 60_000)).toBeNull();
    expect(cachedCodDates(c, "04710090", "GG", NOW.getTime())).toBeNull();
    expect(cachedCodDates(c, "30140071", "G", NOW.getTime())).toBeNull();
  });
});

describe("3. o dia que ela escolhe, com negação", () => {
  it("dia da semana, data, 'dia N', amanhã, a primeira", () => {
    expect(pickDate(["quinta"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-29" });
    expect(pickDate(["pode ser na sexta-feira"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-30" });
    expect(pickDate(["31/10"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-31" });
    expect(pickDate(["06/11"], DATES, NOW)).toEqual({ kind: "unavailable", said: "dia 06/11" });
    expect(pickDate(["dia 30 tá ótimo"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-30" });
    expect(pickDate(["amanhã"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-29" });
    expect(pickDate(["a primeira"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-29" });
    expect(pickDate(["sábado"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-31" });
  });
  it("negação: o último dia não negado vence; dia negado e expediente não são escolha", () => {
    expect(pickDate(["pode ser sexta? não, quinta"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-29" });
    expect(pickDate(["quinta não posso, sexta"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-30" });
    expect(pickDate(["sexta", "não, melhor sábado"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-31" });
    expect(pickDate(["não estou em casa na quinta"], DATES, NOW)).toBeNull();
    expect(pickDate(["trabalho de segunda a sexta"], DATES, NOW)).toBeNull();
    expect(pickDate(["quinta nem pensar"], DATES, NOW)).toBeNull();
  });
  it("um dia que a Logzz não tem volta como indisponível, com o que ela disse", () => {
    expect(pickDate(["segunda"], DATES, NOW)).toEqual({ kind: "unavailable", said: "segunda" });
    expect(pickDate(["terça"], DATES, NOW)).toEqual({ kind: "unavailable", said: "terça" });
    expect(pickDate(["dia 5/11"], DATES, NOW)).toEqual({ kind: "unavailable", said: "dia 5/11" });
  });
  it("pedido de mudar a data", () => {
    expect(asksDateChange(["sim, mas muda a data"])).toBe(true);
    expect(asksDateChange(["queria outro dia"])).toBe(true);
    expect(asksDateChange(["sim"])).toBe(false);
    expect(asksDateChange(["o dia tá ótimo"])).toBe(false);
  });
});

describe("4. o sim explícito: a mensagem inteira, cada uma da rajada", () => {
  it("sim, confirmo, pode confirmar, isso mesmo, ok obrigada", () => {
    for (const yes of ["sim", "Sim!", "SIM 👍", "confirmo", "pode confirmar", "sim, pode", "isso mesmo", "ok obrigada", "Sim sim", "pode sim", "tá certo"]) {
      expect(confirmsOrder([yes]), yes).toBe(true);
    }
    expect(confirmsOrder(["sim", "confirmo"])).toBe(true);
  });
  it("negação: não, sim com ressalva, sim ao lado de uma pergunta, nada", () => {
    for (const no of ["não, ainda não confirmo", "sim, mas muda a data", "ok, vou ver", "sim mas e o frete?", "nao", "simone", "pode ser sexta? não, quinta", "confirmo depois", "não sei", "sim não"]) {
      expect(confirmsOrder([no]), no).toBe(false);
    }
    expect(confirmsOrder(["sim", "e o tamanho, tá certo o G?"])).toBe(false);
    expect(confirmsOrder([])).toBe(false);
    expect(confirmsOrder([""])).toBe(false);
  });
});

describe("5. os passos do fechamento", () => {
  it("sem dia e sem dados: as datas reais e o que falta, numa mensagem", () => {
    const s = step({ facts: { name: "Maria", cpf: null, stored: {} } });
    expect(s.kind).toBe("send");
    const text = (s as { text: string }).text;
    expect(text).toContain("📅 Posso agendar sua entrega pra quinta (29/10), sexta (30/10) ou sábado (31/10).");
    expect(text).toContain("seu nome completo, seu CPF e o número da casa");
    expect(isCloseMessage(text)).toBe(true);
  });
  it("com o dia e os dados: o resumo, com o CPF mascarado e a pergunta do SIM", () => {
    const s = step({ parts: ["quinta"] });
    expect(s.kind).toBe("send");
    const text = (s as { text: string }).text;
    expect(text.startsWith(SUMMARY_HEAD)).toBe(true);
    expect(text).toContain("• Colete G: R$ 109,90 pra pagar na entrega, com frete grátis");
    expect(text).toContain("• Entrega: quinta (29/10)");
    expect(text).toContain("• Endereço: Rua Barão do Triunfo, 100 – Brooklin Paulista, São Paulo/SP, CEP 04710-090");
    expect(text).toContain("• CPF: ***.***.**7-25");
    expect(text).not.toContain("52998224725");
    expect(text).toContain("Responda *SIM*");
    expect(s.state.date).toBe("2026-10-29");
  });
  it("o sim ao resumo que está acima é o único caminho para o pedido", () => {
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    const st = { date: "2026-10-29", number: "100" };
    expect(step({ state: st, parts: ["sim"], lastOutbound: summary }).kind).toBe("confirm");
    expect(step({ state: st, parts: ["Sim, pode confirmar"], lastOutbound: summary }).kind).toBe("confirm");
    // The summary under the retry line ("Não consegui registrar…") is still the one she says yes to.
    expect(step({ state: st, parts: ["sim"], lastOutbound: closeRetryLater(summary) }).kind).toBe("confirm");
  });
  it("negação: não confirma, sim sem resumo, sim a outra pergunta, sim depois de mudar algo", () => {
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    const st = { date: "2026-10-29", number: "100" };
    expect(step({ state: st, parts: ["não, ainda não confirmo"], lastOutbound: summary }).kind).toBe("model");
    expect(step({ state: st, parts: ["sim"], lastOutbound: "Quer que eu te mande a tabela?" }).kind).not.toBe("confirm");
    // The number changed after the summary: a new summary, never the order.
    const moved = step({ state: st, parts: ["sim"], lastOutbound: summary, facts: { typed: { number: "120" } } });
    expect(moved.kind).toBe("send");
    expect((moved as { text: string }).text).toContain("Rua Barão do Triunfo, 120");
    // "sim, mas muda a data": the dates again.
    const change = step({ state: st, parts: ["sim, mas muda a data"], lastOutbound: summary });
    expect(change.kind).toBe("send");
    expect((change as { text: string }).text).toContain("📅 Posso agendar");
    // Another day picked over the summary: a new summary with it.
    const other = step({ state: { ...st, date: "2026-10-30" }, parts: ["pode ser sexta? não, quinta"], lastOutbound: summary.replace("quinta (29/10)", "sexta (30/10)") });
    expect((other as { text: string }).text).toContain("• Entrega: quinta (29/10)");
  });
  it("o dia que lotou entre o resumo e o sim é dito, e as datas voltam", () => {
    const s = step({ state: { date: "2026-10-29" }, facts: { dates: DATES.slice(1) }, parts: ["sim"] });
    expect(s.kind).toBe("send");
    expect((s as { text: string }).text).toMatch(/^quinta \(29\/10\) acabou de lotar 😕 📅 Posso agendar sua entrega pra sexta \(30\/10\) ou sábado \(31\/10\)/);
  });
  it("o dia que não existe é dito, e as datas voltam", () => {
    expect((step({ parts: ["segunda"] }) as { text: string }).text).toMatch(/^Segunda não tenho entrega aí 😕 📅 Posso agendar/);
  });
  it("CPF inválido: dito com gentileza e pedido de novo; CPF recusado pela Logzz nunca volta", () => {
    expect((step({ parts: ["quinta"], facts: { cpf: null, cpfInvalid: true } }) as { text: string }).text).toContain("Esse CPF não confere");
    expect((step({ parts: ["quinta"], state: { badCpf: "52998224725" } }) as { text: string }).text).toContain("me manda seu CPF");
  });
  it("CEP geral da cidade: a rua é pedida, e entra no resumo quando ela manda", () => {
    const generic = { cepStreet: "", cepNeighborhood: "", stored: {} };
    expect((step({ parts: ["quinta"], facts: generic }) as { text: string }).text).toContain("o nome da sua rua e o bairro e o número da casa");
    const s = step({ parts: ["quinta"], facts: { ...generic, typed: { street: "Rua das Flores", number: "45", neighborhood: "Centro" } } });
    expect((s as { text: string }).text).toContain("• Endereço: Rua das Flores, 45 – Centro, São Paulo/SP");
    expect(s.state).toMatchObject({ street: "Rua das Flores", number: "45", neighborhood: "Centro" });
  });
  it("o número da casa respondido sozinho, com complemento; CEP e CPF nunca viram número", () => {
    expect(houseNumberIn(["100"], true)).toEqual({ number: "100", complement: null });
    expect(houseNumberIn(["nº 45, apto 12"], true)).toEqual({ number: "45", complement: null });
    expect(houseNumberIn(["45 apto 12"], true)).toEqual({ number: "45", complement: "apto 12" });
    expect(houseNumberIn(["o número é 100"], true)).toEqual({ number: "100", complement: null });
    expect(houseNumberIn(["s/n"], true)).toEqual({ number: "s/n", complement: null });
    expect(houseNumberIn(["04710-090"], true)).toBeNull();
    expect(houseNumberIn(["529.982.247-25"], true)).toBeNull();
    expect(houseNumberIn(["100"], false)).toBeNull();
  });
  it("telefone recusado pela Logzz: o celular é pedido, lido e entra no resumo", () => {
    expect(step({ parts: ["quinta"], state: { badPhone: "1133334444" }, facts: { phone: "1133334444" } })).toMatchObject({ kind: "send", text: PHONE_ASK });
    const s = step({ parts: ["(11) 98888-7777"], state: { date: "2026-10-29", badPhone: "1133334444" }, facts: { phone: "1133334444" }, lastOutbound: PHONE_ASK, datesAsked: false });
    expect((s as { text: string }).text).toContain("• Celular: (11) 98888-7777");
    expect(nationalPhone("5511987654321")).toBe("11987654321");
    expect(nationalPhone("551133334444")).toBe("1133334444");
    expect(nationalPhone("12345")).toBeNull();
  });
  it("um dia no meio de outra resposta não é escolha quando o dia não foi perguntado", () => {
    expect(step({ state: { date: "2026-10-29" }, parts: ["dia 5 cai meu salário"], datesAsked: false }).state.date).toBe("2026-10-29");
  });
  it("o mesmo pedido sem mudança e sem resposta: o modelo responde, com a diretiva", () => {
    const first = step({ facts: { cpf: null } }) as { text: string };
    const again = step({ facts: { cpf: null }, parts: ["e se eu não estiver em casa?"], lastOutbound: first.text });
    expect(again.kind).toBe("model");
    expect((again as { directive: string }).directive).toContain("quinta (29/10), sexta (30/10) ou sábado (31/10)");
  });
});

describe("6. a importação: o mesmo resumo, o mesmo pedido", () => {
  it("o id é estável por conversa e resumo, e muda com o resumo", async () => {
    const a = await closeOrderId("c1", "resumo A");
    expect(a).toBe(await closeOrderId("c1", "resumo A"));
    expect(a).not.toBe(await closeOrderId("c1", "resumo B"));
    expect(a).not.toBe(await closeOrderId("c2", "resumo A"));
    expect(a.length).toBeLessThanOrEqual(128);
  });
  it("o corpo leva exatamente as chaves mapeadas, com a data ISO e as variações", () => {
    const s = step({ parts: ["quinta"] }) as { text: string };
    const ok = step({ state: { date: "2026-10-29", number: "100" }, parts: ["sim"], lastOutbound: s.text });
    if (ok.kind !== "confirm") throw new Error("esperava confirm");
    const body = importPayload({
      externalId: "malu-x",
      order: ok.order,
      email: null,
      cep: "04710-090",
      city: "São Paulo",
      state: "SP",
      pkg: codPackage(cfg, ["G"], 1)!,
      utm: { source: "whatsapp", medium: "malu", campaign: "", content: "", term: "", id: "" },
    });
    expect(Object.keys(body)).toEqual([
      "external_id", "full_name", "phone", "customer_document", "email", "postal_code", "street", "neighborhood", "city", "state", "house_number",
      "complement", "delivery_date", "delivery_type", "delivery_period", "offer", "variations", "utm_source", "utm_medium", "utm_campaign",
      "utm_content", "utm_term", "utm_id",
    ]);
    expect(body).toMatchObject({ phone: "11987654321", customer_document: "52998224725", postal_code: "04710090", delivery_date: "2026-10-29", delivery_type: "det1pgz5", offer: "sal0g3mo", variations: [{ hash: "projm2ov", quantity: 1 }], house_number: "100" });
  });
  it("cada resposta da importação vira o próximo passo certo", () => {
    expect(readImport(200, { status: "success", order_code: "LZ123", delivery_date: "2026-10-30", rescheduled: true }, "2026-10-29")).toEqual({ kind: "created", orderCode: "LZ123", deliveryDate: "2026-10-30", rescheduled: true });
    expect(readImport(200, { status: "success", order_code: "LZ1" }, "2026-10-29")).toMatchObject({ deliveryDate: "2026-10-29", rescheduled: false });
    expect(readImport(422, { status: "error", message: "Data de entrega indisponível." }, "x").kind).toBe("date_gone");
    expect(readImport(422, { status: "error", message: "Sem estoque." }, "x").kind).toBe("no_cod");
    expect(readImport(422, { status: "error", message: "Estoque insuficiente." }, "x").kind).toBe("no_cod");
    expect(readImport(422, { status: "error", message: "Sem cobertura de entrega." }, "x").kind).toBe("no_cod");
    expect(readImport(422, { status: "error", message: "CPF do cliente inválido ou irregular." }, "x").kind).toBe("cpf");
    expect(readImport(422, { status: "error", message: "Número de telefone inválido" }, "x").kind).toBe("phone");
    expect(readImport(422, { status: "error", message: "Já existe um pedido principal sem finalização em nome desse(a) cliente." }, "x").kind).toBe("open_order");
    expect(readImport(409, { status: "error", message: "Pedido em processamento…" }, "x").kind).toBe("retry");
    expect(readImport(429, null, "x").kind).toBe("retry");
    expect(readImport(500, { status: "error", message: "Não foi possível criar o pedido agora" }, "x").kind).toBe("retry");
    expect(readImport(200, { status: "success" }, "x").kind).toBe("retry");
    expect(readImport(401, { message: "Unauthenticated." }, "x").kind).toBe("config");
    expect(readImport(404, null, "x").kind).toBe("config");
    expect(readImport(422, { status: "error", message: "O campo offer é obrigatório." }, "x").kind).toBe("rejected");
  });
  it("409/500 tenta mais uma vez com o MESMO external_id; a segunda falha volta como retry; nunca lança", async () => {
    const payload = { external_id: "malu-c1-abc", delivery_date: "2026-10-29" } as unknown as ReturnType<typeof importPayload>;
    const sent: unknown[] = [];
    const answers = [{ status: 409, body: { status: "error", message: "Pedido em processamento" } }, { status: 200, body: { status: "success", order_code: "LZ9" } }];
    const r = await placeOrder(async (_u, b, h) => (sent.push([b, h]), answers.shift()!), "https://x/import", "tok", payload, async () => undefined);
    expect(r).toMatchObject({ kind: "created", orderCode: "LZ9" });
    expect(sent).toEqual([[payload, { Authorization: "Bearer tok" }], [payload, { Authorization: "Bearer tok" }]]);
    const twice = await placeOrder(async () => ({ status: 500, body: null }), "u", "t", payload, async () => undefined);
    expect(twice.kind).toBe("retry");
    let calls = 0;
    const thrown = await placeOrder(async () => { calls += 1; throw new Error("network"); }, "u", "t", payload, async () => undefined);
    expect([thrown.kind, calls]).toEqual(["retry", 2]);
    // A real answer is not sent again.
    let n = 0;
    await placeOrder(async () => (n += 1, { status: 422, body: { message: "CPF do cliente inválido ou irregular." } }), "u", "t", payload, async () => undefined);
    expect(n).toBe(1);
  });
});

describe("7. o webhook da venda que chega depois da importação não duplica a linha", () => {
  const rows = [{ external_id: "malu-c1-abc", status: "Agendado", created_at: NOW.toISOString(), details: { importId: "malu-c1-abc", orderNumber: "LZ123" } }];
  it("pelo nosso id, pelo código do pedido, ou pelo único pedido importado em aberto dela", () => {
    expect(importedTwin(rows, { externalId: "malu-c1-abc", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBe("malu-c1-abc");
    expect(importedTwin(rows, { externalId: "venq000x10", orderNumber: "LZ123", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBe("malu-c1-abc");
    expect(importedTwin(rows, { externalId: "venq000x10", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBe("malu-c1-abc");
  });
  it("negação: um pedido antecipado, um importado já reclamado por outro webhook, um morto, dois em aberto", () => {
    expect(importedTwin(rows, { externalId: "coinzz-1", paymentMethod: "prepay" }, isOrderDead, NOW.getTime())).toBeNull();
    expect(importedTwin([{ ...rows[0]!, details: { ...rows[0]!.details, webhookId: "venq1" } }], { externalId: "venq2", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBeNull();
    expect(importedTwin([{ ...rows[0]!, status: "Cancelado" }], { externalId: "venq2", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBeNull();
    expect(importedTwin([rows[0]!, { ...rows[0]!, external_id: "malu-c1-def", details: { importId: "malu-c1-def" } }], { externalId: "venq2", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBeNull();
    expect(importedTwin([{ ...rows[0]!, details: null }], { externalId: "venq2", paymentMethod: "cod" }, isOrderDead, NOW.getTime())).toBeNull();
  });
});

describe("8. prompt e gate são a mesma promessa: só as datas da consulta", () => {
  const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
  const ask = (step({ facts: { cpf: null } }) as { text: string }).text;
  it("as linhas fixas do fechamento passam a cadeia com as datas da consulta", () => {
    for (const text of [
      ask,
      summary,
      (step({ parts: ["segunda"] }) as { text: string }).text,
      (step({ state: { date: "2026-10-29" }, facts: { dates: DATES.slice(1) } }) as { text: string }).text,
      PHONE_ASK,
      CLOSE_CPF_REFUSED,
      CLOSE_OPEN_ORDER,
      closeRetryLater(summary),
    ]) expect(vetoes(text, ISO), text).toEqual([]);
    expect(vetoes(closeConfirmed("LZ123", "2026-10-30", true, 109.9), ["2026-10-30"])).toEqual([]);
  });
  it("a linha sem entrega com o link do antecipado passa no caminho do antecipado", () => {
    const text = closeNoCodLine("https://app.coinzz.com.br/checkout/encorpa-0?document=52998224725");
    expect(runGates(text, ctx({ config: prod, paymentPath: "prepay", codUnavailable: true })).traces.filter((t) => t.verdict === "block")).toEqual([]);
  });
  it("negação: sem as datas da consulta o dia é vetado como antes; um dia fora delas também", () => {
    expect(vetoes(ask).join()).toContain("delivery_promise");
    expect(vetoes("Posso agendar sua entrega pra sexta (06/11).", ISO).join()).toContain("delivery_promise");
    expect(vetoes("Consigo entregar na terça.", ISO).join()).toContain("delivery_promise");
    // The weekday offered beside a date not offered: no single date is both.
    expect(vetoes("Posso agendar sua entrega pra quinta (30/10).", ISO).join()).toContain("delivery_promise");
    expect(vetoes(closeConfirmed("LZ123", "2026-10-30", false, 109.9), ["2026-10-29"]).join()).toContain("delivery_promise");
  });
  it("a diretiva ensina só as datas da consulta e nenhum link", () => {
    const d = closeDirective(DATES, ["seu CPF"], false);
    expect(d).toContain("quinta (29/10), sexta (30/10) ou sábado (31/10)");
    expect(d).toContain("sem checkout e sem link");
    expect(closeDirective(DATES, [], true)).toContain("só é criado quando ela responder SIM");
  });
  it("a oferta da entrega não manda ao checkout quando o pedido fecha aqui", () => {
    expect(codOfferText(prod, "2026-10-30", NOW, true)).toContain("é só me falar");
    expect(codOfferText(prod, "2026-10-30", NOW, true)).not.toContain("checkout");
    expect(codOfferText(prod, "2026-10-30", NOW)).toContain("lá no checkout");
  });
});

describe("9. config: campo novo opcional; o arquivo de 28/10 é o de 27/10 mais o logzzImport", () => {
  it("o de 28/10 só acrescenta logzzImport, com as variações da Logzz", () => {
    const { logzzImport, ...rest } = next as typeof next & { logzzImport?: unknown };
    expect(rest).toEqual(prod);
    expect(logzzImport).toEqual({
      importUrl: "https://app.logzz.com.br/api/importacao-de-pedidos/webhook/orivd974",
      productCode: "prow6pq0",
      offers: { "1": "sal0g3mo", "2": "salng30n", "3": "sal6gz39" },
      variations: { P: "progm9w6", M: "pro37j6q", G: "projm2ov", GG: "prolm313", XGG: "prox1jxp" },
    });
    // Never the Coinzz product codes as Logzz variations.
    expect(JSON.stringify(next)).not.toMatch(/pro4gpo2|proqvqmj|pro7ml00|pro66jdm|proe50v0/);
  });
});

describe("10. o turno: fiação do fechamento", () => {
  it("o pedido só é criado no confirm, com o token e o id do resumo, e a confirmação da régua não sai duas vezes", () => {
    expect(turn).toContain('if (close?.kind === "confirm" && closePkg && LOGZZ_TOKEN)');
    expect(turn).toContain("const importId = await closeOrderId(conversation.id, close.summary);");
    expect(turn).toContain("placeOrder(logzzPoster(IMPORT_TIMEOUT_MS), CONFIG.logzzImport!.importUrl!, LOGZZ_TOKEN,");
    expect(turn).toContain('kind=eq.order_confirmed&status=eq.scheduled');
  });
  it("sem o fechamento ligado, nada muda: o link da entrega segue", () => {
    expect(turn).toContain("const linkNow = linkUnheld && !kitFirst && !closeOn;");
    expect(turn).toContain('const LOGZZ_TOKEN = Deno.env.get("LOGZZ_API_TOKEN") ?? "";');
  });
  it("a cadeia de gates recebe as datas da consulta", () => {
    expect(turn.match(/\.\.\.\(gateCodDates \? \{ codDates: gateCodDates \} : \{\}\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("o webhook da venda acha a linha importada antes de gravar", () => {
    expect(turn).toContain("const twin = importedTwin(");
    expect(turn).toContain("    if (twin !== null && twin !== order.externalId) {");
  });
});
