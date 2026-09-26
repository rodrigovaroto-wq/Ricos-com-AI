/**
 * Mutation test of the guards themselves: puts each historical bug back, in a throwaway git
 * worktree, and requires the guard written for it to FAIL. A guard that stays green with
 * its own bug reinstated protects nothing — this is how "fixed at the origin" is proved,
 * not asserted.
 *
 *   pnpm verificar:guardas            # every mutation
 *   pnpm verificar:guardas M-05 n8n   # only the named ones
 *
 * Each mutation names: the file it breaks, the exact text it swaps back, and the command
 * that must fail. Exit 1 if any mutation survives (its guard stayed green).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Mutation {
  id: string;
  bug: string;
  files: string[];
  from: string;
  to: string;
  guard: string[];
}

const MUTATIONS: Mutation[] = [
  {
    id: "WA-selo",
    bug: "a porta pública do n8n aceitava mensagem forjada com o telefone de uma cliente real",
    files: ["supabase/functions/turn/index.ts"],
    from: "    signingSecret !== \"\" &&\n    !isRetry &&",
    to: "    false &&\n    !isRetry &&",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "WA-janela-no-fim",
    bug: "last_inbound_at gravado no fim do turno esticava a janela de 24h",
    files: ["supabase/functions/turn/index.ts"],
    from: "      cost_brl: spent,\n      updated_at: new Date().toISOString(),",
    to: "      cost_brl: spent,\n      last_inbound_at: new Date().toISOString(),\n      updated_at: new Date().toISOString(),",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "WA-envio-desligado",
    bug: "o envio pela Cloud API saía ligado antes do número e dos valores do sócio",
    files: ["n8n/workflows/whatsapp-envio.json"],
    from: "const CANAL_ATIVO = false;",
    to: "const CANAL_ATIVO = true;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-whatsapp-send.test.ts"],
  },
  {
    id: "WA-canal-forjado",
    bug: "o n8n mandava mensagem pelo WhatsApp com base no campo channel que qualquer um escreve",
    files: ["n8n/workflows/turno-da-agente.json"],
    from: '"leftValue": "={{ $json.sealed }}"',
    to: '"leftValue": "={{ $(\'Mensagem recebida\').first().json.body.channel === \'whatsapp\' }}"',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
  {
    id: "WA-1-janela",
    bug: "a régua mandava texto livre fora da janela de 24h, que a Meta recusa",
    files: ["supabase/functions/turn/index.ts"],
    from: "const delivery = deliveryFor(kind, renderCtx, lastInbound);",
    to: "const delivery = { via: \"text\" as const, body: text };",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "H-2-preco-da-loja",
    bug: '"por 116 eu levo" (o preço real do pix) lido como barganha: a venda ficava sem link',
    files: ["src/agent/interpret.ts"],
    from: "if (!prices.some((p) => Math.abs(p - value) <= 1)) return true;",
    to: "return true;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/interpret.test.ts"],
  },
  {
    id: "H-2-barganha",
    bug: '"faz por 100 que eu levo" contava como decisão e mandava o link (Tati)',
    files: ["supabase/functions/turn/index.ts"],
    from: 'if (namesOwnPrice(inbound.body ?? "", shopPrices, shopPercents)) interpretation = { ...interpretation, wants_to_buy: false };',
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "H-2-numero",
    bug: "a leitura por número desligada: nenhum preço inventado é visto",
    files: ["src/agent/interpret.ts"],
    from: "if (cue === null || value < cue) continue;",
    to: "continue;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/interpret.test.ts"],
  },
  {
    id: "M-05",
    bug: 'afrouxamento: "tiro … dúvida" removido mesmo com concessão depois (1ª versão da M-05)',
    files: ["src/agent/guardrails.ts"],
    from: "(?![^.!?]{0,20}\\b(?:um\\s+pou(?:c|qu)\\w+|mais|pra\\s+voce|para\\s+voce)\\b)",
    to: "(?![\\s,]*\\b(?:e|mais)\\b)",
    guard: ["pnpm", "-s", "dev:gates", "--base=HEAD", "--fail-on-loosen"],
  },
  {
    id: "pouquinho",
    bug: '"Eu tiro um pouquinho." passava: pouc\\w+ não casa "pouquinho"',
    files: ["src/agent/guardrails.ts"],
    from: "(um\\s+pou(?:c|qu)\\w+|mais|pra\\s+voce)",
    to: "(um\\s+pouc\\w+|mais|pra\\s+voce)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/change-registry.test.ts"],
  },
  {
    id: "M-07-numero",
    bug: "qualquer número vira garantia (a regra por contexto, antes da regra do número)",
    files: ["src/agent/guardrails.ts"],
    from: "if (days === ctx.config.delivery.warrantyDays) {",
    to: "if (true) {",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "M-07-recusa",
    bug: 'a recusa larga liberava "não tem como passar de 2 dias"',
    files: ["src/agent/guardrails.ts"],
    // The whole regex as it was: the denial governing any of these verbs, with anything after.
    from: "(?:(?:consigo|conseguimos|posso|podemos|da\\s+pra|tem\\s+como)\\s+)?(?:te\\s+|lhe\\s+)?(?:garant\\w*|promet\\w*)\\s+(?:que\\s+(?:chegue|chega|receba|recebe)\\s+(?:em\\s+)?(?:ate\\s+)?)?$/",
    to: "(?:\\w+\\s+){0,2}?(?:garant\\w*|promet\\w*|consig\\w*|posso|podemos|da\\s+pra|tem\\s+como|sei\\s+se)\\b[^,;:]*$/",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "O-04",
    bug: 'a régua chamando a Edge Function com a credencial "Gemini API"',
    files: ["n8n/workflows/relogio-da-regua.json"],
    from: '"name": "Supabase service_role"',
    to: '"name": "Gemini API"',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
  {
    id: "neverError",
    bug: "neverError escondendo o 401 como execução verde",
    files: ["n8n/workflows/relogio-da-regua.json"],
    from: '"neverError": false',
    to: '"neverError": true',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
  {
    id: "espelho",
    bug: "o gate de produção diverge do repositório",
    files: ["supabase/functions/turn/guardrails.ts"],
    from: 'name: "price_promise",',
    to: 'name: "price_promise", // drift',
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "provedor-5xx",
    bug: 'o provedor parseia a página de erro 504 como JSON ("Unexpected token u")',
    files: ["src/llm/providers/http.ts"],
    from: "const transient = response.status >= 500 || response.status === 429;",
    to: "const transient = false;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/provider-http.test.ts"],
  },
  {
    id: "5.8",
    bug: "o webhook de venda não escreve o estágio (o funil parava em pedido_criado)",
    files: ["supabase/functions/turn/index.ts"],
    from: 'if (reached) await persistStage(conversation.id, (conversation.stage as Stage | null) ?? "novo", reached);',
    to: "void reached;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/order-stage.test.ts"],
  },
  {
    id: "7.4",
    bug: "a régua de silêncio terminava sem ninguém escrever perdido",
    files: ["supabase/functions/turn/index.ts"],
    from: '    await mark("sent");\n    await markLost();',
    to: '    await mark("sent");',
    guard: ["pnpm", "-s", "vitest", "run", "tests/order-stage.test.ts"],
  },
  {
    id: "hermes-trecho",
    bug: "proposta do Hermes com trecho inventado passando pela validação",
    files: ["src/dev/hermes-core.ts"],
    from: "else if (!e?.trecho || !norm(text).includes(norm(e.trecho)))",
    to: "else if (false)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/hermes-core.test.ts"],
  },
  {
    id: "hermes-lgpd",
    bug: "CPF e telefone saindo para o modelo sem máscara",
    files: ["src/dev/hermes-core.ts"],
    from: '.replace(/\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b/g, "[cpf]")',
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/hermes-core.test.ts"],
  },
  {
    id: "kit-preco",
    bug: "qualquer preço de kit passa (o gate não lê os kits do config)",
    files: ["src/agent/guardrails.ts"],
    from: "...kits.map((k) => k.priceBrl)]);",
    to: "...kits.map((k) => k.priceBrl), 220]);",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-quantidade",
    bug: "quantidade inventada pelo modelo troca o link por um kit que ela não pediu",
    files: ["src/agent/interpret.ts"],
    from: "i.units !== null && i.units > 1 && !QUANTITY_CUE.test(text) && !namesCount(text, i.units) ? null : i.units",
    to: "i.units",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "apto-12",
    bug: '"Apto 12, G" perdia o tamanho (números descartados no complemento)',
    files: ["n8n/workflows/venda-confirmada.json"],
    from: "complemento.split(/[^A-Z0-9]+/)",
    to: "complemento.split(/[^A-Z]+/)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-sale-mapping.test.ts"],
  },
  {
    id: "kit-banco",
    bug: 'orders.size só aceitava uma letra — toda venda de kit ("M,G") falhava no insert',
    files: ["supabase/migrations/0010_order_kit_sizes.sql"],
    from: "check (size ~ '^(P|M|G|GG|XGG)(,(P|M|G|GG|XGG))*$')",
    to: "check (size ~ '^(P|M|G|GG|XGG)$')",
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-sale-mapping.test.ts"],
  },
  {
    id: "kit-retry",
    bug: 'a nova tentativa reaplicava o tamanho e virava "G e G"',
    files: ["supabase/functions/turn/index.ts"],
    from: "replayed ? [] : saidSizes,",
    to: "saidSizes,",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-caminho",
    bug: '"na entrega você leva com 30%" passava — percentual de outro caminho',
    files: ["src/agent/guardrails.ts"],
    from: "return offers.filter((o) => (paths.size !== 1 || paths.has(o.path)) && units.has(o.units));",
    to: "return offers.filter((o) => units.has(o.units));",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-calca",
    bug: '"uso 42, ela 46" pedia a letra à cliente, que chutava (o número de cada peça não passava pela tabela)',
    files: ["supabase/functions/turn/index.ts"],
    from: "interpretation.unit_pants.map(sizeFromDressSize)",
    to: "[]",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "placar-reenvio",
    bug: "o placar contava como link repetido o reenvio que a cliente pediu (achado do Hermes)",
    files: ["src/dev/persona-scorecard.ts"],
    from: "if (!asksForLink(customer) && links.some(",
    to: "if (links.some(",
    guard: ["pnpm", "-s", "vitest", "run", "tests/persona-scorecard.test.ts"],
  },
  {
    id: "kit-comparacao",
    bug: 'o gate vetava a fala do script "R$ 116,91 em vez de R$ 129,90" (preço de comparação lido como oferta)',
    files: ["src/agent/guardrails.ts"],
    from: "if (comparedAgainst) continue;",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-correcao",
    bug: '"na verdade o meu é G" virava o tamanho da outra peça',
    files: ["src/agent/interpret.ts"],
    from: "if (ownSize && said.length === 1) return",
    to: "if (false) return",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-calca-quantidade",
    bug: '"uso 42" contava como pista de quantidade e liberava units inventado',
    files: ["src/agent/interpret.ts"],
    from: "const QUANTITY_CUE = /\\b(?:kit|",
    to: "const QUANTITY_CUE = /\\b(?:[1-9]\\d|kit|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-conversa-nova",
    bug: "o kit abandonado voltava dias depois (nada fecha conversa; expira por tempo)",
    files: ["supabase/functions/turn/index.ts"],
    from: "(kitStale ? null : (lead.units as number | null))",
    to: "(lead.units as number | null)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-virgula",
    bug: "\"quero 2, M e G\" virava 1 peça (a vírgula depois do 2 não contava)",
    files: ["src/agent/interpret.ts"],
    from: "(?!\\\\d|[.,]\\\\d|",
    to: "(?![\\\\d,.]|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-outra-pessoa",
    bug: "\"pra mim tá bom, e pra ela G\" trocava o tamanho dela pelo da outra",
    files: ["src/agent/interpret.ts"],
    from: "if (i.size.for_other_person || OTHER_PERSON.test(t)) return false;",
    to: "if (i.size.for_other_person) return false;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-do-que",
    bug: "\"menos do que R$ 272,79\" passava como comparação (preço falso sozinho)",
    files: ["src/agent/guardrails.ts"],
    from: "moneys.slice(0, k).some(",
    to: "true || moneys.slice(0, k).some(",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-oferta",
    bug: "\"Na entrega 2 peças ficam R$ 233,82, e uma sai R$ 129,90\" vetada (a peça avulsa não contava)",
    files: ["src/agent/guardrails.ts"],
    from: "counts.push({ at: u.index ?? 0, units: 1 });",
    to: "void u;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },

  {
    id: "cep-entrega",
    bug: "\"dá pra ver a entrega em casa nesse tempo\" passava como pedido de CEP",
    files: ["src/agent/guardrails.ts"],
    from: "\\b(?:cep|endereco)\\b[^.!?]{0,20}?",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "kit-sem-palavra",
    bug: "\"na entrega sai com 30% levando 3 peças\" passava (percentual sem a palavra desconto)",
    files: ["src/agent/guardrails.ts"],
    from: "!looksLikeDiscount(sentence, at) && !offers.some((o) => o.pct === value)",
    to: "!looksLikeDiscount(sentence, at)",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-quatro",
    bug: "\"na entrega 4 peças saem R$ 311,76\" passava (quantidade sem kit)",
    files: ["src/agent/guardrails.ts"],
    from: "const N = \"(\\\\d|um|uma|dois|duas|tres|quatro|cinco)\";",
    to: "const N = \"(\\\\d|um|uma|dois|duas|tres|quatro|cinco)\"; if (sentence.includes(\"4\")) continue;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-renova",
    bug: "o kit ativo expirava no meio da conversa (o relógio só andava quando o kit mudava)",
    files: ["supabase/functions/turn/index.ts"],
    from: "  if (quantity || units > 1) {\n    await db(`leads?id=eq.${lead.id}`, {",
    to: "  if (quantity) {\n    await db(`leads?id=eq.${lead.id}`, {",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-colete",
    bug: "\"eu uso G, ele é folgado?\" era lido como tamanho de outra pessoa",
    files: ["src/agent/interpret.ts"],
    from: "/\\b(?:dela|delas|",
    to: "/\\b(?:ela|ele|dela|delas|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "kit-pra-mim-e-pra",
    bug: "\"pra mim e pra minha irmã\" virava 1 peça",
    files: ["src/agent/interpret.ts"],
    from: "|\\b(?:pra|para)\\s+mim\\s+e\\s+(?:pra|para)\\s+",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "caminho-escolhido",
    bug: 'o turno depois de "quero no pix" voltava para o link da entrega (a escolha valia só na mensagem)',
    files: ["supabase/functions/turn/index.ts"],
    from: "const linkPath = linkPathFor(paymentChoice, region);",
    to: "const linkPath = linkPathFor(interpretation.payment_choice, region);",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "gate-quantidade-da-conversa",
    bug: "\"na entrega o colete sai R$ 233,82\" passava numa conversa de 1 peça (o gate não sabia a quantidade)",
    files: ["src/agent/guardrails.ts"],
    from: "[...counts.map((c) => c.units), ctx.units ?? 1]",
    to: "[...counts.map((c) => c.units), 1, 2, 3]",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "gate-oracao",
    bug: "\"R$ 129,90 levando 2 peças\" passava (o preço não respondia à contagem da própria oração)",
    files: ["src/agent/guardrails.ts"],
    from: "if (own.length > 0) return new Set(own);",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "gate-quantidade-no-turno",
    bug: "o turno não passava a quantidade de peças ao gate",
    files: ["supabase/functions/turn/index.ts"],
    from: "      // The pieces in play: a kit price needs the kit, a 1-piece price the single piece.\n      units,",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "caminho-pergunta",
    bug: "\"vou pagar no pix?\" gravava o caminho (uma pergunta lida como escolha)",
    files: ["src/agent/interpret.ts"],
    from: "&& !questionAfter;",
    to: ";",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "regua-kit",
    bug: "a véspera de um kit mandava \"deixa R$ 129,90 separado\" (a régua não lia o pedido)",
    files: ["src/agent/followups.ts"],
    from: "const price = brl(ctx.amountBrl ?? ctx.config.prices.codBrl);",
    to: "const price = brl(ctx.config.prices.codBrl);",
    guard: ["pnpm", "-s", "vitest", "run", "tests/followups.test.ts"],
  },
  {
    id: "regua-pedido",
    bug: "o cron não buscava o pedido para a régua pós-compra",
    files: ["supabase/functions/turn/index.ts"],
    from: "...(order && Number(order.amount_brl) > 0 ? { amountBrl: Number(order.amount_brl) } : {}),",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "adiada-kit",
    bug: "a resposta adiada de um kit era regateada como 1 peça e perdida",
    files: ["supabase/functions/turn/index.ts"],
    from: "      paymentPath: touchPath,\n      units: touchUnits,",
    to: "      paymentPath: \"cod\",",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "kit-so-uma",
    bug: "\"Se levar só uma, fica R$ 129,90\" vetada num kit (só uma não contava)",
    files: ["src/agent/guardrails.ts"],
    from: "|\\bso\\s+uma\\b|\\buma\\s+so\\b|",
    to: "|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "kit-oracao-anterior",
    bug: "\"Se levar só uma, fica R$ 233,82\" passava (a oração sem contagem não seguia a anterior)",
    files: ["src/agent/guardrails.ts"],
    from: "const before = counts.filter((c) => c.at < start).at(-1);",
    to: "const before = undefined as { units: number } | undefined;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "caminho-depois",
    bug: "\"quero no pix, qual a chave?\" não guardava a escolha (a pergunta depois derrubava)",
    files: ["src/agent/interpret.ts"],
    from: "const upTo = t.slice(0, m.index + m[0].length);",
    to: "const upTo = t;",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "regua-antecipado",
    bug: "pedido antecipado recebia \"deixa R$ separado\" na véspera",
    files: ["src/agent/followups.ts"],
    from: "(ctx.prepaid ? \"\" : `Deixa",
    to: "(false ? \"\" : `Deixa",
    guard: ["pnpm", "-s", "vitest", "run", "tests/followups.test.ts"],
  },
  {
    id: "regua-total-do-pedido",
    bug: "a véspera era cancelada quando o total do pedido não era um preço do config",
    files: ["src/agent/guardrails.ts"],
    from: "if (orderAmount !== undefined) allowedPrices.add(orderAmount);",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "caminho-duvida",
    bug: "\"quero saber se aceita pix\" gravava o caminho",
    files: ["src/agent/interpret.ts"],
    from: "/\\b(?:saber|ver|pensar|entender|perguntar)\\s+(?:se|sobre|como)\\b|",
    to: "/\\bNUNCA\\b|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/quantity.test.ts"],
  },
  {
    id: "peca-gratis",
    bug: "\"a segunda sai de graça\" passava (concessão sem número)",
    files: ["src/agent/guardrails.ts"],
    from: "(?:de\\s+gra[cç]a|por\\s+nossa\\s+conta|gratis)\\b(?!\\s+(?:pra|para)\\s+(?:trocar|devolver))",
    to: "(?:NUNCA)\\b(?!\\s+(?:pra|para)\\s+(?:trocar|devolver))",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "segunda-feira",
    bug: "\"na segunda eu te mando o link\" contava 2 peças",
    files: ["src/agent/guardrails.ts"],
    from: "|\\b(?:com|levando)\\s+a\\s+(segunda|terceira)\\b(?!\\s*-?\\s*feira)",
    to: "|\\b(?:na|com|levando|a)\\s+(segunda|terceira)\\b",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "tchau-nome",
    bug: "\"tchau brigada\" virava o nome da cliente no link",
    files: ["src/agent/identity.ts"],
    from: "|tchau|tchauzinho|brigad[ao]|",
    to: "|",
    guard: ["pnpm", "-s", "vitest", "run", "tests/closing.test.ts"],
  },
  {
    id: "ja-finalizei",
    bug: "\"obrigada, já finalizei\" passava a compradora para uma pessoa",
    files: ["src/agent/interpret.ts"],
    from: "if (orderContext && i.post_sale && !reportsDone(message)) return \"post_sale\";",
    to: "if (orderContext && i.post_sale) return \"post_sale\";",
    guard: ["pnpm", "-s", "vitest", "run", "tests/closing.test.ts"],
  },
  {
    id: "despedida-link",
    bug: "a despedida depois do link reenviava o link",
    files: ["supabase/functions/turn/index.ts"],
    from: " && !(linkInChat && closesConversation(inbound.body ?? \"\"))",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "feliz-com-queixa",
    bug: "\"obrigada, mas veio o M\" contava como encerramento feliz (sem handoff)",
    files: ["src/agent/interpret.ts"],
    from: ".every((w) => DONE_WORDS.test(w));",
    to: ".every((w) => w.length > 0);",
    guard: ["pnpm", "-s", "vitest", "run", "tests/closing.test.ts"],
  },
  {
    id: "troca-e-segunda",
    bug: "\"a troca é grátis e a segunda peça também\" passava (peça grátis atrás da troca)",
    files: ["src/agent/guardrails.ts"],
    from: "|\\b(?:gratis|de\\s+gra[cç]a|por\\s+nossa\\s+conta)\\b[^.!?]{0,30}\\b(?:segund[oa]|outr[oa])\\s+(?:peca\\s+)?tambem\\b",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/kits.test.ts"],
  },
  {
    id: "prazo-por-caminho",
    bug: "\"na entrega 3 dias, e no antecipado 5 dias\" virava resposta pronta numa conversa do antecipado",
    files: ["src/agent/guardrails.ts"],
    from: "if (codAt > prepayAt) continue;",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/prepaid-deadline-fuzz.test.ts"],
  },
  {
    id: "o-g-dela",
    bug: "\"e o G dela\" não era lido como tamanho dito (o placar contava troca)",
    files: ["src/agent/sizing.ts"],
    from: "|o\\s+(?=(?:pp|p|m|gg|g|xgg|eg)\\s+(?:dela|dele|mesmo)\\b)",
    to: "",
    guard: ["pnpm", "-s", "vitest", "run", "tests/sizing.test.ts"],
  },
  {
    id: "O10-venda",
    bug: "o webhook de venda aceitava venda forjada sem a senha",
    files: ["supabase/functions/turn/index.ts"],
    from: 'if (saleToken !== "" && !sameSecret(String(payload.token ?? ""), saleToken)) {',
    to: "if (false) {",
    guard: ["pnpm", "-s", "vitest", "run", "tests/function-drift.test.ts"],
  },
  {
    id: "O2-wait",
    bug: "lead novo recebia a recepção e nunca mais era respondido (sem o nó Wait)",
    files: ["n8n/workflows/turno-da-agente.json"],
    from: '"type": "n8n-nodes-base.wait"',
    to: '"type": "n8n-nodes-base.noOp"',
    guard: ["pnpm", "-s", "vitest", "run", "tests/n8n-workflows.test.ts"],
  },
];

const wanted = process.argv.slice(2);
const repo = resolve(".");
const results: Array<{ id: string; caught: boolean; bug: string; note?: string }> = [];

for (const mu of MUTATIONS.filter((m) => wanted.length === 0 || wanted.includes(m.id))) {
  const dir = mkdtempSync(join(tmpdir(), `guard-${mu.id}-`));
  rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["worktree", "add", "--detach", "-q", dir, "HEAD"]);
  try {
    symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
    let applied = true;
    for (const f of mu.files) {
      const p = join(dir, f);
      const src = readFileSync(p, "utf8");
      if (!src.includes(mu.from)) applied = false;
      else writeFileSync(p, src.replace(mu.from, mu.to));
    }
    if (!applied) {
      results.push({ id: mu.id, caught: false, bug: mu.bug, note: "a mutação não se aplicou — o texto de origem mudou; atualize a mutação" });
      continue;
    }
    // The guard runs against the mutated tree; the gate diff compares it with HEAD.
    const run = spawnSync(mu.guard[0]!, mu.guard.slice(1), { cwd: dir, encoding: "utf8", timeout: 10 * 60_000 });
    results.push({ id: mu.id, caught: run.status !== 0, bug: mu.bug });
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", dir]);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

console.log("# Mutação das guardas — cada bug histórico reinstalado precisa ser pego\n");
for (const r of results) console.log(`- ${r.caught ? "pegou   " : "ESCAPOU "} ${r.id}: ${r.bug}${r.note ? ` (${r.note})` : ""}`);
const escaped = results.filter((r) => !r.caught).length;
console.log(`\n${results.length - escaped}/${results.length} guardas pegaram o próprio bug.`);
process.exitCode = escaped ? 1 : 0;
