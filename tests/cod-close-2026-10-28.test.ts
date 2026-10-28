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
  closeProcessing,
  maskPii,
  SUMMARY_HEAD,
  asksDateChange,
  asksHowItWorks,
  bareDay,
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
  isPlausibleName,
  lookupCodDates,
  nameCandidates,
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
import { extractName } from "@/agent/identity.js";
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
const step = (over: { facts?: Partial<CloseFacts>; state?: object; parts?: string[]; lastOutbound?: string; lastList?: string; datesAsked?: boolean } = {}) =>
  closeStep({
    facts: facts(over.facts),
    state: over.state ?? {},
    parts: over.parts ?? [],
    lastOutbound: over.lastOutbound ?? "",
    ...(over.lastList !== undefined ? { lastList: over.lastList } : {}),
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
  it("a lista única com tudo; depois da resposta, só o que falta", () => {
    const s = step({ facts: { name: "Maria", cpf: null, stored: {} } });
    expect(s.kind).toBe("send");
    const text = (s as { text: string }).text;
    expect(text).toBe(
      "Pra eu agendar sua entrega, me manda:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)",
    );
    expect(isCloseMessage(text)).toBe(true);
    const data = (step({ facts: { name: "Maria", cpf: null, stored: {} }, parts: ["quinta"], lastOutbound: text }) as { text: string }).text;
    expect(data).toBe("Anotado! Só falta me mandar:\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)");
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
    expect((change as { text: string }).text).toBe("Anotado! Só falta me mandar:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)");
    // Another day picked over the summary: a new summary with it.
    const other = step({ state: { ...st, date: "2026-10-30" }, parts: ["pode ser sexta? não, quinta"], lastOutbound: summary.replace("quinta (29/10)", "sexta (30/10)") });
    expect((other as { text: string }).text).toContain("• Entrega: quinta (29/10)");
  });
  it("o dia que lotou entre o resumo e o sim é dito, e as datas voltam", () => {
    const s = step({ state: { date: "2026-10-29" }, facts: { dates: DATES.slice(1) }, parts: ["sim"] });
    expect(s.kind).toBe("send");
    expect((s as { text: string }).text).toBe("quinta (29/10) acabou de lotar 😕\nPra eu agendar sua entrega, me manda:\n📅 Dia: sexta (30/10) ou sábado (31/10)");
  });
  it("o dia que não existe é dito, e as datas voltam", () => {
    expect((step({ parts: ["segunda"] }) as { text: string }).text).toMatch(/^Segunda não tenho entrega aí 😕\nPra eu agendar sua entrega, me manda:\n📅 Dia: /);
  });
  it("CPF inválido: dito com gentileza e pedido de novo; CPF recusado pela Logzz nunca volta", () => {
    expect((step({ parts: ["quinta"], facts: { cpf: null, cpfInvalid: true } }) as { text: string }).text).toContain("Esse CPF não confere");
    expect((step({ parts: ["quinta"], state: { badCpf: "52998224725" } }) as { text: string }).text).toBe("Pra eu agendar sua entrega, me manda:\n🪪 CPF");
  });
  it("CEP geral da cidade: a rua é pedida, e entra no resumo quando ela manda", () => {
    const generic = { cepStreet: "", cepNeighborhood: "", stored: {} };
    expect((step({ parts: ["quinta"], facts: generic }) as { text: string }).text).toBe("Pra eu agendar sua entrega, me manda:\n📍 Rua e bairro\n🏠 Número da casa (e complemento, se tiver)");
    const s = step({ parts: ["quinta"], facts: { ...generic, typed: { street: "Rua das Flores", number: "45", neighborhood: "Centro" } } });
    expect((s as { text: string }).text).toContain("• Endereço: Rua das Flores, 45 – Centro, São Paulo/SP");
    expect(s.state).toMatchObject({ street: "Rua das Flores", number: "45", neighborhood: "Centro" });
  });
  it("o número da casa respondido sozinho, com complemento; CEP e CPF nunca viram número", () => {
    expect(houseNumberIn(["100"], true)).toEqual({ number: "100", complement: null });
    expect(houseNumberIn(["nº 45, apto 12"], true)).toEqual({ number: "45", complement: "apto 12" });
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
    expect(readImport(409, { status: "error", message: "Pedido em processamento. Tente novamente em instantes." }, "x").kind).toBe("processing");
    expect(readImport(409, { status: "error", message: "Integração desativada" }, "x").kind).toBe("config");
    expect(readImport(409, { status: "error", message: "Conflito" }, "x").kind).toBe("retry");
    expect(readImport(429, null, "x").kind).toBe("retry");
    expect(readImport(500, { status: "error", message: "Não foi possível criar o pedido agora" }, "x").kind).toBe("retry");
    expect(readImport(200, { status: "success" }, "x").kind).toBe("retry");
    // The same external_id again: 200 with the order it made, whatever the status field says.
    expect(readImport(200, { order_code: "LZ123", delivery_date: "2026-10-29" }, "x")).toMatchObject({ kind: "created", orderCode: "LZ123" });
    expect(readImport(200, { status: "error", order_code: "LZ123" }, "x").kind).not.toBe("created");
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
    expect(vetoes("Posso agendar sua entrega pra quinta (29/10).").join()).toContain("delivery_promise");
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
    expect(turn).toContain('if (close?.kind === "confirm" && closePkg && LOGZZ_TOKEN && holdsConversation)');
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

describe("11. revisão Opus do 844743b", () => {
  const datesAsk = (step() as { text: string }).text;
  const dataAsk = (step({ parts: ["quinta"], facts: { cpf: null, stored: {} }, lastOutbound: datesAsk }) as { text: string }).text;
  it("1. a data nunca vira o número da casa", () => {
    for (const p of [["29/10"], ["30 de outubro"], ["2 peças"], ["às 14:00"], ["dia 30"], ["14h"]]) expect(houseNumberIn(p, true), p.join()).toBeNull();
    expect(houseNumberIn(["45", "29/10"], true)).toEqual({ number: "45", complement: null });
    expect(houseNumberIn(["45 casa 2"], true)).toEqual({ number: "45", complement: "casa 2" });
    const s = step({ parts: ["45", "29/10"], state: { date: "2026-10-29" }, facts: { stored: {} }, lastOutbound: dataAsk });
    expect((s as { text: string }).text).toContain("Rua Barão do Triunfo, 45 ");
  });
  it("2. uma pergunta nunca é sim", () => {
    for (const q of ["confirmado?", "pode?", "tá certo?", "isso?", "sim?", "pode ser?", "Confirma? 🙂"]) expect(confirmsOrder([q]), q).toBe(false);
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    expect(step({ state: { date: "2026-10-29", number: "100" }, parts: ["confirmado?"], lastOutbound: summary }).kind).toBe("model");
  });
  it("3. 'pedido confirmado' antes da importação é vetado com o fechamento aberto, com e sem as datas", () => {
    const claims = (t: string, over: object = {}) =>
      runGates(t, ctx({ config: prod, closeOpen: true, ...over })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    for (const t of [
      "Prontinho, seu pedido está confirmado pra quinta (29/10)! 🎉",
      "Seu pedido foi agendado pra quinta (29/10).",
      "Seu pedido está registrado.",
      "Pronto, seu pedido foi feito!",
      "Já confirmei seu pedido 😊",
      "Pedido confirmado! Chega quinta.",
      "Prontinho, seu pedido está confirmado pra quinta, só falta você aguardar.",
    ]) {
      expect(claims(t), t).toContain("order_claim");
      expect(claims(t, { codDates: ISO }), t).toContain("order_claim");
    }
  });
  it("3. negação: o que é verdade passa; sem fechamento aberto o gate fica quieto", () => {
    const claims = (t: string, over: object = {}) =>
      runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO, ...over })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    for (const t of [
      "Seu pedido ainda não está confirmado: falta o seu SIM.",
      "Assim que você disser SIM eu confirmo o pedido 😊",
      "O pedido só fica confirmado quando você responder SIM.",
      "Seu pedido fica confirmado assim que você responder SIM.",
      "Posso confirmar o pedido?",
      (step({ parts: ["quinta"] }) as { text: string }).text,
      datesAsk,
      dataAsk,
      closeRetryLater((step({ parts: ["quinta"] }) as { text: string }).text),
      closeProcessing((step({ parts: ["quinta"] }) as { text: string }).text),
      CLOSE_OPEN_ORDER,
    ]) expect(claims(t), t).not.toContain("order_claim");
    expect(claims("Seu pedido está confirmado!", { closeOpen: undefined })).not.toContain("order_claim");
    // Only the real order's line, after the import: the turn closes the gate before sending it.
    expect(claims(closeConfirmed("LZ1", "2026-10-29", false, 109.9), { closeOpen: undefined, codDates: ["2026-10-29"] })).toEqual([]);
  });
  it("3. o prompt diz o que o gate cobra", () => {
    expect(closeDirective(DATES, [], true)).toContain("Nunca diga que o pedido está confirmado");
    expect(turn).toContain("gateCloseOpen = false;");
    expect(turn).toContain("    gateCloseOpen = true;\n");
    expect(turn.match(/\.\.\.\(gateCloseOpen \? \{ closeOpen: true \} : \{\}\)/g)?.length).toBe(3);
  });
  it("4. 409 'em processamento' espera e manda o MESMO id; duas vezes, a linha honesta com o resumo", async () => {
    const payload = { external_id: "malu-c1-abc", delivery_date: "2026-10-29" } as unknown as ReturnType<typeof importPayload>;
    const waits: number[] = [];
    const answers = [{ status: 409, body: { status: "error", message: "Pedido em processamento. Tente novamente em instantes." } }, { status: 200, body: { order_code: "LZ7" } }];
    const r = await placeOrder(async () => answers.shift()!, "u", "t", payload, async (ms) => waits.push(ms));
    expect(r).toMatchObject({ kind: "created", orderCode: "LZ7" });
    expect(waits).toEqual([4000]);
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    expect(closeProcessing(summary).endsWith(summary)).toBe(true);
    expect(closeProcessing(summary)).not.toMatch(/não consegui/i);
    expect(step({ state: { date: "2026-10-29", number: "100" }, parts: ["sim"], lastOutbound: closeProcessing(summary) }).kind).toBe("confirm");
  });
  it("4. só o turno que segura a conversa importa", () => {
    expect(turn).toContain("const holdsConversation = isRevise || (internal.claimed?.id === conversation.id && !claimFailed);");
    expect(turn).toContain('if (close?.kind === "confirm" && closePkg && LOGZZ_TOKEN && holdsConversation) {');
  });
  it("5. reagendado: o dia novo dito com clareza, ela pode pedir outro, e o operador avisado", () => {
    const text = closeConfirmed("LZ1", "2026-10-30", true, 109.9);
    expect(text).toContain("Sua entrega fica pra sexta (30/10): o dia que você escolheu lotou");
    expect(text).toContain("Se esse dia não der pra você, é só me falar aqui.");
    expect(vetoes(text, ["2026-10-30"])).toEqual([]);
    expect(turn).toContain("if (result.rescheduled) extraNotify = `pedido ${result.orderCode} reagendado pela Logzz");
  });
  it("6. negação no dia e na troca", () => {
    expect(pickDate(["quinta eu não posso"], DATES, NOW)).toBeNull();
    expect(pickDate(["quinta ou sexta"], DATES, NOW)).toBeNull();
    expect(pickDate(["sexta? não sei"], DATES, NOW)).toBeNull();
    expect(pickDate(["quinta, talvez"], DATES, NOW)).toBeNull();
    // Still read: a correction, and a day with a word of doubt about something else in another message.
    expect(pickDate(["pode ser sexta? não, quinta"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-29" });
    expect(pickDate(["sexta"], DATES, NOW)).toEqual({ kind: "pick", date: "2026-10-30" });
    for (const p of ["não quero mudar a data", "não precisa trocar o dia", "não muda o dia", "outro dia eu compro"]) expect(asksDateChange([p]), p).toBe(false);
    for (const p of ["muda a data", "sim, mas muda a data", "queria outro dia", "pode ser outra data?", "troca o dia pra mim"]) expect(asksDateChange([p]), p).toBe(true);
  });
  it("7. CPF e telefone mascarados no que é guardado e mandado por e-mail", () => {
    expect(maskPii("CPF 529.982.247-25 inválido; telefone (11) 98765-4321")).toBe("CPF ***CPF*** inválido; telefone ***TEL***");
    expect(readImport(422, { status: "error", message: "CPF 52998224725 do cliente inválido ou irregular." }, "x")).toEqual({ kind: "cpf", message: "CPF ***CPF*** do cliente inválido ou irregular." });
    const none = readCodDates(422, { message: "Área não disponível para entrega. 11987654321" });
    expect(none.kind).toBe("none");
    expect(JSON.stringify(none)).not.toMatch(/\d{8}/);
  });
});

describe("12. a lista única (operador, 2026-10-28) e a revisão Opus do c72b56e", () => {
  const LIST =
    "Pra eu agendar sua entrega, me manda:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)";
  const empty = { name: null, cpf: null, stored: {} };
  // What the turn passes as `typedName`: `nameCandidates` read by `extractName`, as in `handleTurn`.
  const typedName = (parts: string[], last: string) =>
    nameCandidates(parts, last, DATES, NOW).map((x) => extractName(x, true)).find((n) => (n ?? "").split(/\s+/).length >= 2) ?? null;
  it("A. a lista tem o dia com as datas reais, nome, CPF e número; a rua só no CEP geral", () => {
    expect((step({ facts: empty }) as { text: string }).text).toBe(LIST);
    expect((step({ facts: { ...empty, cepStreet: "", cepNeighborhood: "" } }) as { text: string }).text).toBe(
      LIST.replace("🪪 CPF\n", "🪪 CPF\n📍 Rua e bairro\n"),
    );
  });
  it("A. tudo numa mensagem, em qualquer ordem: só o resumo, e o sim importa", () => {
    const parts = ["quinta, Maria Souza, 529.982.247-25, 45 apto 12"];
    const name = typedName(parts, LIST);
    expect(name).toBe("Maria Souza");
    const s = step({ facts: { ...empty, cpf: "52998224725", typedName: name }, parts, lastOutbound: LIST });
    expect(s.kind).toBe("send");
    const summary = (s as { text: string }).text;
    expect(summary.startsWith("📝 Confere se está tudo certo:")).toBe(true);
    expect(summary).toContain("• Entrega: quinta (29/10)");
    expect(summary).toContain("Rua Barão do Triunfo, 45 (apto 12)");
    expect(summary).toContain("• Nome: Maria Souza");
    expect(summary.endsWith("Responda *SIM* pra eu confirmar o pedido.")).toBe(true);
    expect(s.state).toMatchObject({ date: "2026-10-29", number: "45", complement: "apto 12", name: "Maria Souza" });
    // The name kept in the state: the next turn, without it in her words, still has it.
    const yes = step({ facts: { ...empty, cpf: "52998224725" }, state: s.state, parts: ["sim"], lastOutbound: summary });
    expect(yes.kind).toBe("confirm");
    expect((yes as { order: { name: string } }).order.name).toBe("Maria Souza");
  });
  it("A. em várias mensagens: depois de cada uma só o que falta, nunca o que ela já deu", () => {
    const a = step({ facts: empty, parts: ["sexta"], lastOutbound: LIST });
    expect((a as { text: string }).text).toBe("Anotado! Só falta me mandar:\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)");
    const b = step({ facts: { ...empty, cpf: "52998224725" }, state: a.state, parts: ["529.982.247-25", "número 120"], lastOutbound: (a as { text: string }).text });
    expect((b as { text: string }).text).toBe("Anotado! Só falta me mandar:\n👤 Nome completo");
    const last = (b as { text: string }).text;
    const name = typedName(["Maria Aparecida Souza"], last);
    const c = step({ facts: { ...empty, cpf: "52998224725", typedName: name }, state: b.state, parts: ["Maria Aparecida Souza"], lastOutbound: last });
    expect((c as { text: string }).text.startsWith("📝 Confere se está tudo certo:")).toBe(true);
    expect((c as { text: string }).text).toContain("• Entrega: sexta (30/10)");
    expect((c as { text: string }).text).toContain(", 120 –");
  });
  it("A. negação: uma pergunta à lista não é 'Anotado!' — o modelo responde; nome nunca lido de dia, sim ou número", () => {
    const q = step({ facts: empty, parts: ["e se eu não estiver em casa?"], lastOutbound: LIST });
    expect(q.kind).toBe("model");
    const missing = "Anotado! Só falta me mandar:\n👤 Nome completo";
    expect(step({ facts: { ...empty, cpf: "52998224725" }, state: { date: "2026-10-29", number: "45" }, parts: ["tá bom"], lastOutbound: missing }).kind).toBe("model");
    for (const p of ["quinta", "dia 30", "sim", "45 apto 12", "529.982.247-25", "Sexta-feira", "sexta feira", "Bloco B", "Casa Verde"]) expect(typedName([p], LIST), p).toBeNull();
    expect(typedName(["45, Bloco B, Maria Souza"], LIST)).toBe("Maria Souza");
    // Not asked: no name read.
    expect(nameCandidates(["Maria Souza"], "Qual o seu CEP?", DATES, NOW)).toEqual([]);
  });
  it("A. a lista sai quando ela quer pagar na entrega ou pergunta como funciona", () => {
    for (const p of ["como funciona?", "Como funciona o pagamento na entrega?", "como faço pra pagar?", "e como que funciona", "como eu pago na entrega?"]) {
      expect(asksHowItWorks([p]), p).toBe(true);
    }
    for (const p of ["como funciona o tamanho?", "como faço pra lavar?", "já sei como funciona", "entendi como faz, obrigada", "como assim?"]) {
      expect(asksHowItWorks([p]), p).toBe(false);
    }
    expect(turn).toContain('|| pressed || interpretation.payment_choice === "cod" || asksHowItWorks(parts));');
  });
  it("B. o número lido junto do dia, do nome e do CPF; 45A e 45 B são número e complemento", () => {
    expect(houseNumberIn(["quinta, Maria Souza, 529.982.247-25, 45 apto 12"], true)).toEqual({ number: "45", complement: "apto 12" });
    expect(houseNumberIn(["29/10 número 45"], true)).toEqual({ number: "45", complement: null });
    expect(houseNumberIn(["dia 30, casa 120"], true)).toEqual({ number: "120", complement: null });
    expect(houseNumberIn(["45A"], true)).toEqual({ number: "45", complement: "A" });
    expect(houseNumberIn(["45 B"], true)).toEqual({ number: "45", complement: "B" });
    expect(houseNumberIn(["45 e apto 12"], true)).toEqual({ number: "45", complement: "apto 12" });
    expect(houseNumberIn(["45, casa 2"], true)).toEqual({ number: "45", complement: "casa 2" });
    expect(houseNumberIn(["45", "29/10"], true)).toEqual({ number: "45", complement: null });
  });
  it("B. negação: data, peças, hora e 'dia 30' sozinho nunca são o número", () => {
    for (const p of [["29/10"], ["30 de outubro"], ["2 peças"], ["14:00"], ["dia 30"], ["quinta, dia 30"], ["não vou estar em casa 2 dias"], ["14h"], ["2x"]]) {
      expect(houseNumberIn(p, true), p.join()).toBeNull();
    }
  });
  const claims = (t: string, over: object = {}) =>
    runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO, ...over })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
  it("C. order_claim veta o pedido dado como feito antes da importação, com a ressalva em outra oração", () => {
    for (const t of [
      "Agora é só aguardar, seu pedido está confirmado!",
      "Se precisar de algo me chama, seu pedido está agendado pra quinta (29/10).",
      "Seu pedido está confirmado, quando o entregador chegar você paga.",
      "Tudo certo, já agendei sua entrega pra quinta (29/10)!",
      "Fechado! Sua entrega é quinta (29/10).",
      "Combinado, sua entrega fica pra quinta (29/10) 💛",
      "Seu colete já está garantido pra quinta (29/10)!",
      "Seu pedido, que não tem frete, está confirmado!",
      "Seu pedido, que não tem frete, está confirmado pra quinta e chega cedo",
      "Seu pedido está confirmado, quer mais alguma coisa?",
      "Sua entrega fica pra quinta (29/10) 💛",
      "Ótimo, sua entrega é na quinta (29/10).",
      "Se você me responder depois, tudo bem: seu pedido está confirmado.",
    ]) {
      expect(claims(t), t).toContain("order_claim");
      expect(claims(t, { codDates: undefined }), t).toContain("order_claim");
    }
  });
  it("C. negação: a condição colada na afirmação, a lista, o resumo e as linhas fixas passam", () => {
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    for (const t of [
      "Assim que você confirmar eu agendo pra quinta (29/10)",
      "Seu pedido só fica confirmado quando você responder SIM.",
      "Ainda não está confirmado: me responde SIM?",
      "Seu pedido vai ser agendado assim que você responder SIM.",
      "Seu pedido ainda não está confirmado.",
      "Se você responder SIM, seu pedido fica agendado pra quinta (29/10).",
      "Assim que você responder SIM seu pedido fica confirmado.",
      "O pedido ficou confirmado?",
      LIST,
      "Anotado! Só falta me mandar:\n🪪 CPF",
      summary,
      closeRetryLater(summary),
      closeProcessing(summary),
      CLOSE_OPEN_ORDER,
      CLOSE_CPF_REFUSED,
      PHONE_ASK,
    ]) expect(claims(t), t).not.toContain("order_claim");
    // The real order's line, after the order_code: the turn closes the gate before sending it.
    expect(claims(closeConfirmed("LZ1", "2026-10-29", false, 109.9), { closeOpen: undefined, codDates: ["2026-10-29"] })).toEqual([]);
  });
  it("D. o sim num turno sem a trava: o resumo de novo, fixo, antes de qualquer resposta do modelo", () => {
    const noLock = turn.indexOf('if (close?.kind === "confirm" && closePkg && LOGZZ_TOKEN && !holdsConversation) {');
    expect(noLock).toBeGreaterThan(0);
    expect(turn.slice(noLock, noLock + 700)).toContain("await sendFixed(close.summary,");
    expect(noLock).toBeLessThan(turn.indexOf('if (close?.kind === "confirm" && closePkg && LOGZZ_TOKEN && holdsConversation) {'));
    // The summary sent again is the one her next "sim" confirms.
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    expect(step({ state: { date: "2026-10-29", number: "100" }, parts: ["sim"], lastOutbound: summary }).kind).toBe("confirm");
  });
});

describe("13. revisão Opus do 9d247f3", () => {
  const LIST =
    "Pra eu agendar sua entrega, me manda:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)";
  const empty = { name: null, cpf: null, stored: {} };
  const PLACES = ["Rua Barão do Triunfo", "Brooklin Paulista", "São Paulo"];
  const typed = (parts: string[], last: string, places: string[] = PLACES) =>
    nameCandidates(parts, last, DATES, NOW, places).map((x) => extractName(x, true)).find((n) => (n ?? "").split(/\s+/).length >= 2) ?? null;
  it("1. nome: lugar, pagamento, produto, cor e referência nunca viram o nome do pedido", () => {
    for (const p of ["Cartão de crédito", "Dinheiro mesmo", "Cor preta", "Kit duas", "Bela Vista", "Santa Cruz", "Cidade Nova", "Perto do mercado", "Portão azul", "Ao lado da padaria", "São José", "Nova Esperança", "Santa Rita"]) {
      expect(typed([p], LIST), p).toBeNull();
      expect(typed([`sexta, ${p}, 45`], LIST), p).toBeNull();
    }
    // Her CEP's own neighbourhood and town, as ViaCEP says them.
    expect(typed(["Brooklin Paulista"], LIST)).toBeNull();
    expect(typed(["Vila Mariana"], LIST, ["Vila Mariana"])).toBeNull();
  });
  it("1. negação: nomes de verdade passam, inclusive com sobrenome de lugar", () => {
    for (const p of ["Maria Souza", "Ana Paula Lima", "Maria da Cruz", "Joana Paulista Santos"]) expect(typed([p], LIST), p).not.toBeNull();
    expect(typed(["sexta, Maria Souza, 529.982.247-25, 45"], LIST)).toBe("Maria Souza");
  });
  it("1. a correção dela sempre vence o nome guardado e refaz o resumo; o sim seguinte leva o nome certo", () => {
    const wrong = { date: "2026-10-30", number: "45", name: "Ana Silva" };
    const old = (step({ facts: { ...empty, cpf: "52998224725" }, state: wrong }) as { text: string }).text;
    expect(old).toContain("• Nome: Ana Silva");
    const name = typed(["meu nome é Maria Souza"], old);
    expect(name).toBe("Maria Souza");
    const fix = step({ facts: { ...empty, cpf: "52998224725", typedName: name }, state: wrong, parts: ["meu nome é Maria Souza"], lastOutbound: old });
    expect(fix.kind).toBe("send");
    expect((fix as { text: string }).text).toContain("• Nome: Maria Souza");
    // Her yes to the OLD summary never imports the old name.
    expect(step({ facts: { ...empty, cpf: "52998224725", typedName: name }, state: wrong, parts: ["sim"], lastOutbound: old }).kind).not.toBe("confirm");
    const yes = step({ facts: { ...empty, cpf: "52998224725" }, state: fix.state, parts: ["sim"], lastOutbound: (fix as { text: string }).text });
    expect((yes as { order: { name: string } }).order.name).toBe("Maria Souza");
    for (const p of ["o nome é Maria Souza", "nome: Maria Souza", "Me chamo Maria Souza"]) expect(typed([p], "Qual o seu CEP?"), p).toBe("Maria Souza");
    // The turn title-cases it and passes her CEP's places.
    expect(turn).toContain("typedName: typedCloseName ? titleCaseName(typedCloseName) : null,");
  });
  it("2. order_claim: a explicação verdadeira passa durante todo o fechamento", () => {
    const claims = (t: string) =>
      runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    for (const t of [
      "Você paga ao entregador quando a entrega for realizada.",
      "No pagamento na entrega você só paga quando a entrega for feita 😊",
      "A entrega é feita pelo entregador da Logzz e você paga na hora",
      "A entrega fica marcada pro dia que você escolher",
      "O pagamento na entrega é fechado aqui na conversa, sem checkout e sem link.",
      "Entrega em 1 a 3 dias nas regiões com pagamento na entrega, agendada — quem escolhe o dia é ela.",
      "Depois do seu SIM o pedido fica confirmado",
      "O pedido é confirmado depois que você responder SIM",
      "Me responde SIM e seu pedido fica agendado pra quinta (29/10)",
      "Se você escolher quinta, sua entrega fica pra quinta (29/10)",
      "Sua entrega fica pra quinta (29/10) se você confirmar",
      "Feito! Anotei seu CPF.",
      "Nunca diga que o pedido está confirmado.",
    ]) expect(claims(t), t).not.toContain("order_claim");
  });
  it("2. order_claim: o pedido dela dado como já feito é vetado", () => {
    const claims = (t: string) =>
      runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    for (const t of [
      "Já está tudo agendado",
      "Agendei pra quinta (29/10)!",
      "Confirmado pra quinta (29/10)!",
      "Seu pedido foi gerado",
      "Seu pedido foi efetuado",
      "Já lancei seu pedido",
      "Pedido gerado!",
      "Tá agendado pra quinta (29/10)!",
      "Sua compra foi concluída",
      "Sua encomenda está agendada pra quinta",
      "Prontinho, agora tudo já está confirmado 😊",
    ]) expect(claims(t), t).toContain("order_claim");
  });
  it("3. 'como funciona?' → a lista, a resposta do modelo depois: a resposta dela inteira é lida contra a lista", () => {
    const answer = "Funciona assim: você escolhe o dia e paga ao entregador na hora, em dinheiro, pix ou cartão 😊";
    const parts = ["quinta, Maria Souza, 529.982.247-25, 45 apto 12"];
    const s = step({ facts: { ...empty, cpf: "52998224725", typedName: typed(parts, LIST) }, parts, lastOutbound: answer, lastList: LIST });
    expect(s.kind).toBe("send");
    expect((s as { text: string }).text.startsWith(SUMMARY_HEAD)).toBe(true);
    expect(s.state).toMatchObject({ date: "2026-10-29", number: "45", complement: "apto 12", name: "Maria Souza" });
    // A question after it: the model answers with the REAL missing items, never the whole list again.
    const q = step({ facts: { ...empty, cpf: "52998224725" }, state: { date: "2026-10-29" }, parts: ["e se eu não estiver em casa?"], lastOutbound: answer, lastList: "Anotado! Só falta me mandar:\n👤 Nome completo\n🏠 Número da casa (e complemento, se tiver)" });
    expect(q.kind).toBe("model");
    expect(q.directive).toContain("seu nome completo e o número da casa");
    expect(turn).toContain("const lastList: string = [...recentOutbound].reverse().find(isCloseMessage) ?? lastOutbound;");
    expect(turn).toContain("datesAsked: isCloseMessage(lastList) || lastOutbound === NAME_ASK");
    expect(turn).toContain("    ? close.directive\n");
  });
  it("3. negação: o sim só confirma com o resumo como ÚLTIMA mensagem, nunca pela lista de antes", () => {
    const summary = (step({ parts: ["quinta"] }) as { text: string }).text;
    expect(step({ state: { date: "2026-10-29", number: "100" }, parts: ["sim"], lastOutbound: "Qualquer dúvida me chama 😊", lastList: summary }).kind).not.toBe("confirm");
  });
  it("4. o número: os complementos juntados, a casa do lote, o andar; nunca um segundo número de complemento", () => {
    expect(houseNumberIn(["45", "casa 3"], true)).toEqual({ number: "45", complement: "casa 3" });
    expect(houseNumberIn(["45, 2 andar"], true)).toEqual({ number: "45", complement: "2 andar" });
    expect(houseNumberIn(["45, 2º andar"], true)).toEqual({ number: "45", complement: "2º andar" });
    expect(houseNumberIn(["45", "apto 12"], true)).toEqual({ number: "45", complement: "apto 12" });
    expect(houseNumberIn(["45, bloco 2, apto 31"], true)).toEqual({ number: "45", complement: "bloco 2 apto 31" });
    // Negation: a date or a count after the number is no complement and no number.
    expect(houseNumberIn(["45", "29/10", "2 peças"], true)).toEqual({ number: "45", complement: null });
  });
  it("5. sem a trava duas vezes seguidas: o operador avisado uma vez, o resumo segue", () => {
    expect(turn).toContain('if (resends >= 2) extraNotify = extraNotify ?? "pedido na entrega: o sim chegou sem a trava da conversa duas vezes seguidas";');
  });
  it("6. CEP geral: a rua basta (a Logzz exige CEP, rua, cidade e UF); o bairro vai quando lido (revisão do 96b8fc7, A)", () => {
    const generic = { cepStreet: "", cepNeighborhood: "", stored: {} };
    const noHood = step({ parts: ["quinta"], facts: { ...generic, typed: { street: "Rua das Flores", number: "45" } } });
    expect((noHood as { text: string }).text.startsWith(SUMMARY_HEAD)).toBe(true);
    expect((noHood as { text: string }).text).toContain("• Endereço: Rua das Flores, 45 – São Paulo/SP");
    const ok = step({ parts: ["quinta"], facts: { ...generic, typed: { street: "Rua das Flores", number: "45", neighborhood: "Centro" } } });
    expect((ok as { text: string }).text.startsWith(SUMMARY_HEAD)).toBe(true);
  });
});

describe("14. revisão Opus do 96b8fc7", () => {
  const LIST =
    "Pra eu agendar sua entrega, me manda:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)\n👤 Nome completo\n🪪 CPF\n📍 Rua e bairro\n🏠 Número da casa (e complemento, se tiver)";
  const generic = { cepStreet: "", cepNeighborhood: "", stored: {}, name: "Maria Souza" };
  it("A. CEP geral: 'Rua das Flores 45, Centro' completa com o bairro; sem bairro também fecha", () => {
    const s = step({ facts: { ...generic, typed: { street: "Rua das Flores", number: "45" } }, parts: ["quinta, Rua das Flores 45, Centro"], lastOutbound: LIST });
    expect((s as { text: string }).text).toContain("• Endereço: Rua das Flores, 45 – Centro, São Paulo/SP");
    const t = step({ facts: { ...generic, typed: { street: "Rua das Flores" } }, state: { date: "2026-10-29", number: "45" }, parts: ["Rua das Flores, Centro"], lastOutbound: LIST });
    expect((t as { text: string }).text).toContain("Rua das Flores, 45 – Centro, São Paulo/SP");
    // Negation: a day or her name after the street is never the neighbourhood.
    const u = step({ facts: { ...generic, typed: { street: "Rua das Flores", number: "45" }, typedName: "Maria Souza" }, parts: ["Rua das Flores 45, Maria Souza, quinta"], lastOutbound: LIST });
    expect((u as { text: string }).text).toContain("• Endereço: Rua das Flores, 45 – São Paulo/SP");
  });
  it("B. nenhum caminho põe lugar, pagamento, produto ou cor como nome: nem o da identidade (f.name) nem o guardado", () => {
    for (const n of ["Bela Vista", "Santa Cruz", "Cidade Nova", "Nova Esperança", "Portão azul", "Casa amarela", "Dinheiro mesmo", "Débito mesmo", "Pix mesmo", "Kit duas", "Cor preta"]) {
      expect(isPlausibleName(n), n).toBe(false);
      const s = step({ facts: { name: n }, state: { date: "2026-10-29", number: "45" }, lastOutbound: LIST });
      expect((s as { text: string }).text, n).toBe("Anotado! Só falta me mandar:\n👤 Nome completo");
      const kept = step({ facts: { name: null }, state: { date: "2026-10-29", number: "45", name: n }, lastOutbound: LIST });
      expect((kept as { text: string }).text, n).toBe("Anotado! Só falta me mandar:\n👤 Nome completo");
    }
    expect(isPlausibleName("Brooklin Paulista", ["Rua Barão do Triunfo", "Brooklin Paulista"])).toBe(false);
    expect(turn).toContain("...(typedName && isPlausibleName(typedName, addressPlaces) ? { name: typedName } : {})");
  });
  it("B. negação: sobrenomes de cor ou de lugar no meio ou no fim de um nome de verdade passam", () => {
    for (const n of ["Leticia Castelo Branco", "Ana Branco", "Maria Rosa Preto", "Lúcia Verde", "Paula Santa Rosa", "Maria da Cruz", "Juliana Posto"]) expect(isPlausibleName(n), n).toBe(true);
  });
  it("B. a correção sem 'meu nome é' vence o nome guardado", () => {
    const summary = (step({ state: { date: "2026-10-30", number: "45", name: "Ana Silva" }, facts: { name: null } }) as { text: string }).text;
    for (const parts of [["o nome tá errado, é Maria Souza"], ["nome errado", "Maria Souza"]]) {
      const name = nameCandidates(parts, summary, DATES, NOW).map((x) => extractName(x, true)).find((n) => (n ?? "").split(/\s+/).length >= 2) ?? null;
      expect(name, parts.join("|")).toBe("Maria Souza");
      const s = step({ state: { date: "2026-10-30", number: "45", name: "Ana Silva" }, facts: { name: null, typedName: name }, parts, lastOutbound: summary });
      expect((s as { text: string }).text, parts.join("|")).toContain("• Nome: Maria Souza");
    }
    // Negation: "nome errado" itself is never the name; away from the list and the summary a bare name is not read.
    expect(nameCandidates(["nome errado"], summary, DATES, NOW).map((x) => extractName(x, true)).filter(Boolean)).toEqual([]);
    expect(nameCandidates(["Maria Souza"], "Qual o seu CEP?", DATES, NOW)).toEqual([]);
  });
  it("C. o primeiro número vence; outro só com 'não, é', 'errei', 'número', 'nº'", () => {
    for (const p of [["45", "30"], ["45", "2"], ["45", "1"], ["45", "46"]]) expect(houseNumberIn(p, true)?.number, p.join()).toBe("45");
    expect(houseNumberIn(["45 apto 12", "13"], true)).toEqual({ number: "45", complement: "apto 12" });
    for (const p of [["45", "não, é 46"], ["45", "errei, 46"], ["45", "número 46"], ["45", "nº 46"]]) expect(houseNumberIn(p, true)?.number, p.join()).toBe("46");
  });
  it("C. '30' sozinho à lista que ofereceu sexta (30/10) é o dia, nunca o número", () => {
    expect(bareDay(["30"], DATES)).toEqual({ date: "2026-10-30", token: "30" });
    expect(bareDay(["45"], DATES)).toBeNull();
    const s = step({ facts: { stored: {} }, parts: ["30", "45"], lastOutbound: LIST });
    expect(s.state).toMatchObject({ date: "2026-10-30", number: "45" });
    // Negation: with the day already named, the bare number is not read as the day; without the day asked, never.
    const named = step({ facts: { stored: {} }, parts: ["quinta, 30"], lastOutbound: LIST });
    expect(named.state).toMatchObject({ date: "2026-10-29", number: "30" });
    expect(step({ facts: { stored: {} }, state: { date: "2026-10-29" }, parts: ["30"], lastOutbound: "Anotado! Só falta me mandar:\n🏠 Número da casa (e complemento, se tiver)" }).state).toMatchObject({ date: "2026-10-29", number: "30" });
  });
  const claims = (t: string) =>
    runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
  it("D. order_claim veta o 'já está' solto e o 'agendei' solto; um 'Sim,' na frente não é condição", () => {
    for (const t of ["Já está agendado!", "Tá agendado!", "Já tá confirmado!", "Pronto, agendei!", "Já agendei.", "Feito! Agendei pra você.", "Ficou agendado pra quinta (29/10)", "Deixei agendado pra quinta", "Sim, sua entrega fica pra quinta (29/10)!"]) {
      expect(claims(t), t).toContain("order_claim");
    }
  });
  it("D. negação: a condição dela e a explicação seguem passando", () => {
    for (const t of ["Respondendo SIM, tá agendado pra quinta (29/10)!", "É só responder SIM que eu deixo agendado pra quinta", "Com o seu SIM, deixo tudo agendado pra quinta (29/10)", "Ainda não agendei, preciso do seu SIM", "Me responde SIM e seu pedido fica agendado pra quinta (29/10)", "Com seu SIM, sua entrega fica pra quinta (29/10).", "Tá agendado?", "Depois que o pedido estiver confirmado, o entregador te chama"]) {
      expect(claims(t), t).not.toContain("order_claim");
    }
  });
});

describe("15. revisão Opus do 360625b", () => {
  const LIST =
    "Pra eu agendar sua entrega, me manda:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)\n👤 Nome completo\n🪪 CPF\n🏠 Número da casa (e complemento, se tiver)";
  const st = { date: "2026-10-30", number: "45", name: "Ana Silva" };
  const summary = (step({ state: st, facts: { name: null, stored: {} } }) as { text: string }).text;
  const typed = (parts: string[], last: string) =>
    nameCandidates(parts, last, DATES, NOW).map((x) => extractName(x, true)).find((n) => (n ?? "").split(/\s+/).length >= 2) ?? null;
  it("1. o número corrigido depois do resumo refaz o resumo; o sim ao antigo não importa", () => {
    expect(summary).toContain("Rua Barão do Triunfo, 45 –");
    for (const p of ["o número é 46", "errei, o número é 46", "errei o número, é 46", "não é 45, é 46", "nº 46"]) {
      const s = step({ state: st, facts: { name: null, stored: {} }, parts: [p], lastOutbound: summary });
      expect(s.kind, p).toBe("send");
      expect((s as { text: string }).text, p).toContain("Rua Barão do Triunfo, 46 –");
      expect(step({ state: s.state, facts: { name: null, stored: {} }, parts: ["sim"], lastOutbound: summary }).kind, p).not.toBe("confirm");
    }
  });
  it("1. negação: depois do resumo, um número sem marca de correção não muda nada", () => {
    for (const p of ["sim", "ok, obrigada", "pode ser às 14h?", "quero 2", "30", "2"]) {
      const s = step({ state: st, facts: { name: null, stored: {} }, parts: [p], lastOutbound: summary });
      expect(s.state.number, p).toBe("45");
    }
  });
  it("2. o dia solto só quando a mensagem é só o número; ao lado de outras respostas é o número da casa", () => {
    const s = step({ facts: { name: null, cpf: "52998224725", stored: {}, typedName: "Maria Souza" }, parts: ["Maria Souza, 529.982.247-25, 30"], lastOutbound: LIST });
    expect(s.state).toMatchObject({ number: "30" });
    expect(s.state.date).toBeUndefined();
    expect((s as { text: string }).text).toBe("Anotado! Só falta me mandar:\n📅 Dia: quinta (29/10), sexta (30/10) ou sábado (31/10)");
    expect(bareDay(["Maria Souza, 30"], DATES)).toBeNull();
    // A day named in another message of the burst wins over the bare number, which is then the door.
    const named = step({ facts: { stored: {} }, parts: ["quinta", "30"], lastOutbound: LIST });
    expect(named.state).toMatchObject({ date: "2026-10-29", number: "30" });
    expect(bareDay(["30"], DATES)).toMatchObject({ date: "2026-10-30" });
  });
  it("3. o bairro depois da rua nunca é o nome dela nem uma referência", () => {
    const STREET_LIST = LIST.replace("🪪 CPF\n", "🪪 CPF\n📍 Rua e bairro\n");
    const generic = { cepStreet: "", cepNeighborhood: "", stored: {}, name: "Maria Souza" };
    for (const after of ["Ana Souza", "perto do mercado", "ao lado da padaria", "em frente à escola"]) {
      const s = step({ facts: { ...generic, typed: { street: "Rua das Flores", number: "45" } }, parts: [`quinta, Rua das Flores 45, ${after}`], lastOutbound: STREET_LIST });
      expect((s as { text: string }).text, after).toContain("• Endereço: Rua das Flores, 45 – São Paulo/SP");
    }
    const ok = step({ facts: { ...generic, typed: { street: "Rua das Flores", number: "45" } }, parts: ["quinta, Rua das Flores 45, Centro"], lastOutbound: STREET_LIST });
    expect((ok as { text: string }).text).toContain("Rua das Flores, 45 – Centro, São Paulo/SP");
  });
  it("4. 'errei o nome', 'o nome certo é' e um nome completo solto depois do resumo corrigem; o mesmo nome não muda nada", () => {
    for (const parts of [["errei o nome, Maria Souza"], ["o nome certo é Maria Souza"], ["Maria Souza"]]) expect(typed(parts, summary), parts.join()).toBe("Maria Souza");
    // Away from the list and the summary, only her correction opens the name.
    expect(typed(["o nome tá errado, é Maria Souza"], "Qualquer dúvida me chama 😊")).toBe("Maria Souza");
    expect(typed(["Maria Souza"], "Qualquer dúvida me chama 😊")).toBeNull();
    const same = step({ state: st, facts: { name: null, stored: {}, typedName: typed(["Ana Silva"], summary) }, parts: ["Ana Silva"], lastOutbound: summary });
    expect(same.kind).toBe("model");
  });
  it("5. order_claim: confirmar a região ou o tamanho é verdade; o pedido feito segue vetado", () => {
    const claims = (t: string) =>
      runGates(t, ctx({ config: prod, closeOpen: true, codDates: ISO })).traces.filter((x) => x.verdict === "block").map((x) => x.gate);
    for (const t of ["Já confirmei aqui: tem entrega na sua região!", "Confirmei aqui, tem entrega sim na sua região 😊", "Pelo que você me falou, o G é o seu tamanho, tá confirmado!", "Conferi e confirmei, sua região tem entrega."]) {
      expect(claims(t), t).not.toContain("order_claim");
    }
    for (const t of ["Pronto, agendei!", "Já agendei.", "Tá agendado!", "Já tá confirmado!", "Já garanti!"]) expect(claims(t), t).toContain("order_claim");
  });
});
