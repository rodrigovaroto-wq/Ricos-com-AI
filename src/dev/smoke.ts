/**
 * Live smoke test: proves the two providers answer, the seam records cost, and the
 * guardrail chain judges what came back. Costs a fraction of a cent per run.
 *
 *   node --env-file=.env --experimental-strip-types src/dev/smoke.ts
 */
import { createSeam, type CallRecord } from "@/llm/seam.js";
import { geminiProvider } from "@/llm/providers/gemini.js";
import { metaProvider } from "@/llm/providers/meta.js";
import { runGates } from "@/agent/guardrails.js";
import { costCeilingBrl, type BusinessConfig } from "@/config/business.js";

const config: BusinessConfig = JSON.parse(
  process.env["BUSINESS_CONFIG"] ??
    JSON.stringify({
      brand: "Encorpa",
      product: "Colete Cinta Modeladora",
      site: "encorpa-fashion.com.br",
      agentName: "Malu",
      prices: { codBrl: 129.9, prepayBrl: 129.9, prepayDiscountPercent: 0, anchorBrl: 216.5 },
      delivery: {
        codDaysMin: 1,
        codDaysMax: 3,
        prepayAvgDays: 5,
        prepayVariesByRegion: true,
        codScheduled: true,
        warrantyDays: 7,
        freeShipping: true,
      },
      sizes: ["P", "M", "G", "GG", "XGG"],
      hours: { openHour: 6, closeHour: 24 },
      cost: { conversationCapBrl: 0.8, overrunTolerance: 0.25 },
      coupon: { code: "SUPER20", percent: 20, active: false },
      cod: { physicalOnDeliveryActive: true },
      checkout: { baseUrl: "" },
      handoff: { email: "" },
    }),
);

const records: CallRecord[] = [];
const seam = createSeam({
  providers: {
    conversation: metaProvider({ apiKey: process.env["META_API_KEY"]!, model: "muse-spark-1.3" }),
    cheap: geminiProvider({ apiKey: process.env["GEMINI_API_KEY"]!, model: "gemini-3.5-flash-lite" }),
  },
  usdToBrl: 5.4,
  ceilingBrl: costCeilingBrl(config),
  record: (call) => void records.push(call),
});

const system =
  `Você é a ${config.agentName}, assistente da ${config.brand}. Fala como gente, em PT-BR, ` +
  `sem jargão. O colete custa R$ ${config.prices.codBrl.toFixed(2).replace(".", ",")} com frete ` +
  `incluído e pagamento na entrega, em ${config.delivery.codDaysMin} a ${config.delivery.codDaysMax} ` +
  `dias, com entrega agendada. Nunca prometa prazo menor. Responda em no máximo 40 palavras.`;

let spent = 0;

const intent = await seam.call(
  "cheap",
  {
    purpose: "intent",
    system: "Classifique em uma palavra: PRECO, TAMANHO, DUVIDA, COMPRA, OUTRO.",
    messages: [{ role: "user", content: "quanto ta a cinta? chega rapido?" }],
    maxOutputTokens: 300,
  },
  spent,
);
spent += intent.costBrl;
console.log(`intenção → ${intent.text}  (R$ ${intent.costBrl.toFixed(6)})`);

const reply = await seam.call(
  "conversation",
  {
    purpose: "reply",
    system,
    messages: [{ role: "user", content: "quanto ta a cinta? chega rapido?" }],
  },
  spent,
);
spent += reply.costBrl;
console.log(`\nresposta → ${reply.text}\n(R$ ${reply.costBrl.toFixed(6)})`);

const verdict = runGates(reply.text, {
  config,
  layer: "agent",
  optedOut: false,
  now: new Date(),
  paymentPath: "cod",
});

console.log(`\nguardrails → ${verdict.allowed ? "PASSOU" : "VETADO"}`);
for (const trace of verdict.traces.filter((t) => t.verdict === "block")) {
  console.log(`  ✗ ${trace.gate}: ${trace.detail}`);
}
console.log(
  `\ncusto total da troca: R$ ${spent.toFixed(6)} — ${((spent / costCeilingBrl(config)) * 100).toFixed(2)}% do teto`,
);
