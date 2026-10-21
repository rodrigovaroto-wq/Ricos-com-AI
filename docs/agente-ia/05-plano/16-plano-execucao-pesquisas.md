# Plano de execução: as mudanças das pesquisas externas I e II

> **Data:** 2026-10-21. **Status (atualizado 2026-10-21, mesma data):** ver o bloco logo abaixo; o texto original diz "plano; nada implementado" e **isso deixou de ser verdade**. **Origem:** [pesquisa I](../03-pesquisa/09-pesquisa-externa-conversao-whatsapp.md)
> (7 lacunas) e [pesquisa II](../03-pesquisa/10-pesquisa-externa-persuasao-e-agentes.md) (8 itens), juntadas em **14 mudanças** (M1–M14) porque três
> se repetiam. Cada uma responde às 7 perguntas do operador. A **§3 é o veredito**: o que segue, o que muda e o que sai.
> **Conferido contra o código** em 21/10 (`src/agent/prompt.ts`, `retry.ts`, `followups.ts`, `availability.ts`, `coinzz.ts`) e contra os
> planos [13](13-plano-pratico-conversao.md) e [14](14-experimentos-l3.md).

> **STATUS 2026-10-21 (noite) — §4 NO AR como `turn` v40** (função v150, commit `fbb6f19`, ~21h11 UTC, `job:"health"` healthy), **exceto a
> escassez, que espera o operador colar o `BUSINESS_CONFIG` de 21/10** (`docs/operacao/business-config-2026-10-21.min.json`, sha256
> `ead94034…`; sem `scarcity.lowStock` não há escassez). Migração `0029` aplicada; assunto do e-mail no n8n com `$json.scoreTag` publicado
> (versão ativa `dd79bfca`). **Falta:** mesclar o PR #77 e o PR #5 do `encorpa-portal`; provar ao vivo o balão do gancho e a gravação do
> score na primeira conversa real. Registro: grafo [§123](../../documentacao/decisoes/04-grafo-de-decisoes.md) ("Estado"), decisões R29
> em [`03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md). O bloco abaixo, de antes do deploy, fica como veio:
> ~~STATUS: implementado na branch, NÃO DEPLOYADO; no ar a v39~~ ✅ falso desde 21/10 ~21h11 UTC.
>
> *(Bloco da tarde de 21/10, histórico)* **STATUS 2026-10-21 — §4 IMPLEMENTADO na branch `claude/inspiring-carson-hctijy` (commits `403a60f`..`5f445f9`); NÃO DEPLOYADO.** No ar: v39
> (HANDOFF de 21/10; não reconferido na API de gerência nesta sessão). `pnpm test` nesta sessão: 8732 verdes. Registro: grafo
> [§123](../../documentacao/decisoes/04-grafo-de-decisoes.md), decisões R29 em [`03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md).
> **Para entrar no ar:** (1) aplicar a migração `0029_lead_profile.sql`; (2) `pnpm deploy:turn`; (3) gravar `scarcity.lowStock: 20` no
> `BUSINESS_CONFIG`; (4) trocar o assunto do e-mail no n8n (`turno-da-agente.json`) para usar `$json.scoreTag`; (5) mesclar a branch
> `claude/lead-score-profile` do `encorpa-portal`; (6) **por último, as personas** (OK de custo do operador). Nenhum dos seis foi feito.
> **Sem datas (R29.2):** a restrição 1 da §0 e o calendário da §2 estão **superados**; o plano 14 (datas do L3) também.
> **M-items:** ~~M2~~ ✅ implementado na branch (frete na oferta; 87/87 contra a Coinzz) · ~~M3~~ ✅ como gatilho pessoal (≤3 usos) ·
> ~~M4~~ ✅ como pergunta da objeção vaga, **incluindo "vou pensar"** (R29.8, supera o veredito da §3) · ~~M12~~ ✅ persona Gisele ·
> M1 substituído pela referência de mercado (R29.3) · M5, M6, M7, M8, M9 saíram · M14 segue com o operador (arquivar a origem dos números;
> os números atuais ficam) · M10, M11, M13 não feitos. Escopo da §4 que o §3 não previa e que entrou: perfil, score, régua por faixa,
> e-mail com faixa, escassez de estoque real, portal. Todos "feitos na branch", nenhum "feito no ar".

## 0. Três restrições que valem para todas as mudanças

1. **A agente congela de 23/10 a 09/11** (L3, [`14-experimentos-l3.md`](14-experimentos-l3.md)): nenhum deploy de prompt, gate ou config de venda. A
   exceção é bug que perde venda ou que mente. Hoje é 21/10: o que mexe no texto da Malu cai em **E7, a partir de 10/11**.
2. **Toda mudança de prompt ou gate passa pela mesma régua**: espelho byte a byte em `supabase/functions/turn/`, `tests/prompt.test.ts`,
   `pnpm dev:gates`, `pnpm test && pnpm dev:conversas && pnpm typecheck:function`, a eval de venda (`pnpm dev:eval --compare`), entrada no grafo, e
   **gate só muda por frase real** (R21.6).
3. **Chamar o modelo da Meta exige o OK do operador** (memória *Sem gasto de API sem pedido*, 15/10). Toda rodada de persona abaixo traz o custo estimado.

---

## 1. As 14 mudanças, uma a uma

### M1. O número do humano (a meta de "substituir")

1. **Objetivo:** ter a conversão e o custo por pedido entregue do funil **feito por gente** (o "FLUXO" do Drive, validado pelo operador). Isso vira a meta da Malu.
2. **Fundamento:** a IA eleva o piso, não o teto (Brynjolfsson, +34% nos novatos); IA perde para humano em qualidade e ganha em custo (comparação de 100 mil e-mails). Sem a régua humana, "igual a um humano" não é verificável.
3. **Por que não outro método:** comparar com o mercado não serve, porque os números públicos são de fornecedor e definem conversão de jeitos diferentes (pesquisa I §0). O dado do próprio operador é o único comparável.
4. **Como:** o operador informa, do período em que vendia pelo fluxo manual: leads, pedidos, pedidos entregues, recusas na porta, verba e horas gastas. Registro em `docs/agente-ia/10-auditoria/baseline-humano.md` e no grafo.
5. **Ferramentas:** planilha/relatório da Logzz e da Coinzz do operador; `technical-writer`.
6. **Impacto esperado:** nenhum na Malu. Define a régua de aprovação de E7: a Malu "substitui" quando o custo por pedido entregue fica ≤ o humano.
7. **Métricas:** conversão lead→pedido e lead→entregue, custo por pedido entregue (verba + modelo + mensagens), lado a lado humano × Malu.

### ~~M2. Frete do antecipado antes do link~~ ✅ feito na branch em 2026-10-21 (não deployado)

1. **Objetivo:** a cliente fora da área da entrega saber o valor do frete **antes** de abrir o checkout.
2. **Fundamento:** custo extra é o motivo nº 1 de abandono, 39% (Baymard). Hoje a Malu diz "o frete aparece no checkout" (`freightBriefing`), porque não sabe o valor.
3. **Por que não outro método:** estimar uma faixa ou um valor médio é inventar número, e o projeto já errou nisso (memória *O frete do antecipado não existe*). Só serve o valor real do checkout.
4. **Como:** (a) o tópico (b) do `HANDOFF.md` (Playwright na Coinzz) prova se o frete por região é legível por GET. (b) Se for, `lookupRegion` (`availability.ts`) devolve `prepayFreightBrl`; `freightBriefing` ganha a frase com o valor, só quando ele veio da consulta, e o gate de frete aceita o número igual ao da consulta. Falha da consulta continua "aparece no checkout".
5. **Ferramentas:** Playwright, `availability.ts` / `coinzz.ts` + espelho, `prompt.ts`, `guardrails.ts`; `backend-specialist` e `pricing-guardian` (Opus); `code-reviewer`.
6. **Impacto esperado:** mais pedidos no antecipado entre quem recebeu o link. Risco: latência da consulta e número errado (custo de reputação).
7. **Métricas:** no caminho antecipado, link enviado → pedido criado; % de conversas em que ela pergunta "quanto é o frete" depois do link; latência p90 do turno com consulta.

### ~~M3. Pergunta sobre ela e uso do que ela conta~~ ✅ feito na branch em 2026-10-21 (não deployado)

1. **Objetivo:** a Malu soar como alguém que presta atenção: usar a ocasião ou o incômodo que ela contou ("vestido de festa", "pós-parto").
2. **Fundamento:** quem faz perguntas de acompanhamento é mais bem visto (Huang et al., d≈0,35); personalização aumentou a persuasão do modelo (Salvi et al., debate).
3. **Por que não outro método:** o caminho pesado (lead score, perfil inferido) já foi recusado no plano 12 por não decidir nada. O caminho leve é o modelo reaproveitar o que ela escreveu.
4. **Como:** uma linha no `systemPrompt`: "quando ela contar pra que quer o colete, use isso na resposta seguinte e na oferta". **Não** acrescentar pergunta nova à abertura do v3. Eval antes do deploy; depois, braço A/B.
5. **Ferramentas:** `prompt.ts` + espelho, `tests/prompt.test.ts`, `pnpm dev:eval --compare` (cenários de `src/dev/scenarios/venda.json` com ocasião), `prompt-engineer`.
6. **Impacto esperado:** mais resposta depois da abertura e menos "parou na 1ª resposta". Risco baixo.
7. **Métricas:** % que responde à 1ª pergunta da Malu; % que chega ao CEP; na eval, nota do eixo "personalização" (quando o juiz E4.3 existir).

### ~~M4. Objeção vaga: rótulo e uma pergunta curta~~ ✅ feito na branch em 2026-10-21 (não deployado)

1. **Objetivo:** em "tá caro", "achei mais barato" e "vou ver", entender a objeção real antes de argumentar.
2. **Fundamento:** os melhores vendedores pausam e perguntam antes de responder; o mediano despeja monólogo (Gong, 67 mil chamadas). Rótulo e pergunta "o que/como" (Voss).
3. **Por que não outro método:** a lista de argumentos já existe (`objectionBriefing`) e responde a objeção presumida. Uma pergunta custa uma troca e acerta a objeção certa.
4. **Como:** no `objectionBriefing`, o item "tá caro" ganha: "rotule e pergunte uma vez o que pesa mais, o valor ou a dúvida se serve, antes dos argumentos". **"Vou pensar" fica como está** (`THINK_REPLY`, decisão R16.5 + E1.1: não insistir, não emendar pergunta).
5. **Ferramentas:** `prompt.ts` + espelho, `tests/prompt.test.ts`, `pnpm dev:gates`, `persona-tati`, `prompt-engineer`.
6. **Impacto esperado:** menos conversa perdida depois de "tá caro". Risco: soar como interrogatório.
7. **Métricas:** das conversas com "tá caro", % que chega ao link; opt-out depois da pergunta.

### M5. Moldura sem pressão (prompt, textos fixos e régua)

1. **Objetivo:** nenhum texto da Malu soar como cobrança ou pressão.
2. **Fundamento:** meta-análise de 146 efeitos: linguagem que ameaça a liberdade reduz persuasão (r≈0,20), e o efeito é **maior em texto**.
3. **Por que não outro método:** acrescentar gatilho de urgência é o oposto do que a evidência mostra e já foi retirado (E1.4, R20.1).
4. **Como:** auditoria **só de leitura** dos textos fixos (`retry.ts`, `followups.ts`, `opt-in.ts`) e do prompt, atrás de imperativo de pressão ("garanta", "aproveite", "não perca", "corre"). Encontrou, troca por moldura de escolha em E7.
5. **Ferramentas:** `git grep`, `conversation-designer`, `persona-neusa` e `persona-denise` (régua).
6. **Impacto esperado:** menos opt-out e menos silêncio depois de um toque da régua.
7. **Métricas:** opt-out por tipo de toque (`silence_1/2/3`, `checkout_reminder`); resposta em até 24 h depois de cada toque.

### M6. Reversor de risco na abertura da resposta à desconfiança

1. **Objetivo:** quando ela desconfia, a primeira frase é "você só paga quando o colete chegar".
2. **Fundamento:** reversão de risco (Hormozi); confiança como causa de abandono (Baymard).
3. **Por que não outro método:** não há método melhor, porque o pagamento na entrega é o reversor mais forte que existe.
4. **Como:** **já existe**: `objectionBriefing` manda acolher ("É justo desconfiar") e provar com o pagamento na entrega e os 7 dias.
5. **Ferramentas:** nenhuma nova; conferir na eval com `persona-jussara`.
6. **Impacto esperado:** nenhum adicional.
7. **Métricas:** das conversas com "golpe/confiável", % que chega ao CEP.

### M7. Preço do kit por peça

1. **Objetivo:** mostrar o preço por peça do kit para ancorar.
2. **Fundamento:** âncora de preço em pacote (evidência fraca: o estudo da isca é de questionário).
3. **Por que não outro método:** a régua de preço 1/2/3 peças já é a âncora.
4. **Como:** frase no `kitsBriefing`. **Problema achado:** 2 peças na entrega saem R$ 116,91 cada, **o mesmo número do antecipado de 1 peça**. Os dois preços se confundem na mesma conversa.
5. **Ferramentas:** `pricing-guardian`.
6. **Impacto esperado:** incerto; risco de confusão de preço.
7. **Métricas:** taxa de kit nos pedidos.

### M8. Confirmação na véspera da entrega

1. **Objetivo:** diminuir a recusa na porta.
2. **Fundamento:** fornecedor estima devolução de 20–30% → 10–15% com confirmação prévia (sem estudo independente).
3. **Por que não outro método:** não há; confirmar é o método.
4. **Como:** **já existe**: o toque `order_eve` em `followups.ts` (véspera do pedido).
5. **Ferramentas:** nenhuma nova.
6. **Impacto esperado:** já no ar; falta medir.
7. **Métricas:** recusa na porta por caminho, com e sem resposta ao `order_eve` (E6.3, item 5).

### M9. Lembrete pouco depois do link

1. **Objetivo:** recuperar quem recebeu o link e não pagou.
2. **Fundamento:** cadência de recuperação de fornecedor (1º toque entre 10 min e 1 h, sem desconto).
3. **Por que não outro método:** a régua de silêncio já cobre os dias seguintes.
4. **Como:** **já existe**: `checkout_reminder` sai 10 min depois do link (`CHECKOUT_REMINDER_MS`). As fontes divergem entre 10–15 min e 1 h: nenhuma prova que 1 h seja melhor.
5. **Ferramentas:** nenhuma nova.
6. **Impacto esperado:** nenhum adicional.
7. **Métricas:** link → pedido, antes e depois do `checkout_reminder`.

### M10. Bloco de fatos do lead reinjetado a cada turno

1. **Objetivo:** a Malu não repetir, não esquecer e não se perder em conversa longa.
2. **Fundamento:** em várias trocas, o modelo cai em média 39% e não se recupera de um passo errado (Laban et al.); a Anthropic recomenda notas fora da janela.
3. **Por que não outro método:** memória vetorial e RAG foram recusados (R11.4, R11.5); o fato durável já mora em `jsonb`.
4. **Como:** **já existe em parte**: cada turno recebe `sizeDirective`, `identityDirective`, `checkoutDirective` e a linha dos fatos do link. Falta "o que já foi respondido" (objeções e dúvidas). Acrescentar só se a medição mostrar repetição.
5. **Ferramentas:** `persona-scorecard.ts` (métrica de repetição), `index.ts` da `turn`, `backend-specialist`.
6. **Impacto esperado:** menos "ouvir a mesma coisa duas vezes", que o prompt lista como o que afasta a cliente.
7. **Métricas:** % de conversas com resposta repetida (n-grama entre balões da Malu); conversas com 10+ trocas que chegam ao link.

### M11. Confiabilidade: pass^k em vez de média

1. **Objetivo:** aprovar uma versão só se ela acerta **toda vez**, não na média.
2. **Fundamento:** τ-bench: ~61% numa rodada cai para ~25% em oito (fonte secundária).
3. **Por que não outro método:** a eval já compara médias (`dev:eval --compare`); a média esconde o pior caso, e o pior caso é o que custa frete.
4. **Como:** rodar a suíte de venda e as personas críticas **3 vezes** por versão candidata e reportar o pior caso e o pass^3 no `_placar.json`. Só nas comparações de E7.
5. **Ferramentas:** `persona-run-core.ts`, `persona-scorecard.ts`, `persona-eval.ts`, `test-engineer`. **Custo:** ~R$ 1,5 por rodada completa (HANDOFF, tópico d) × 3 ≈ R$ 4,5 por versão.
6. **Impacto esperado:** menos regressão que só aparece com cliente real.
7. **Métricas:** pass^3 por cenário; nº de barreiras (mentira, opt-out ignorado) no pior caso.

### ~~M12. Persona de pressão por autoridade~~ ✅ feito na branch em 2026-10-21 (não deployado)

1. **Objetivo:** provar que a Malu não cede quando a cliente usa autoridade, compromisso ou prova social contra ela ("sou da Meta", "a atendente já tinha liberado desconto").
2. **Fundamento:** os princípios de Cialdini dobraram a obediência de um modelo, de 33% para 72% (Wharton). A promessa do chatbot obriga a empresa (Air Canada).
3. **Por que não outro método:** a proteção já é o código (gates). O que falta é a prova, e a persona é a forma que o projeto já usa.
4. **Como:** novo arquivo em `.claude/agents/` (ou casos novos em `persona-tati`/`persona-jussara`), rodado **junto** da rodada de personas na v35 já prevista antes do L3 (tópico d do `HANDOFF.md`).
5. **Ferramentas:** `conversation-designer` (roteiro), `pnpm dev:personas`, `pnpm dev:placar`.
6. **Impacto esperado:** nenhum se os gates segurarem; um bug de mentira achado antes do L3 se não segurarem.
7. **Métricas:** concessão indevida (desconto, frete, prazo) = 0; vetos disparados.

### M13. A bateria de personas contra as conversas reais

1. **Objetivo:** saber se a persona prevê a cliente real.
2. **Fundamento:** cliente simulado desiste menos que o real e premia pressão (arXiv 2606.20708).
3. **Por que não outro método:** o comprador com propensão oculta (E4.1, `sales-buyer.ts`) já existe para isso. Falta calibrá-lo com dado real.
4. **Como:** no fim do L3, comparar onde as conversas reais param (`conversations.stage`, `turn_outcomes`) com onde a suíte de venda para; ajustar as regras de subida e descida da propensão.
5. **Ferramentas:** SQL nas views de avaliação (`0018`), `sales-buyer.ts`, `test-engineer`.
6. **Impacto esperado:** a eval passa a prever conversão, não só segurança.
7. **Métricas:** distância entre a distribuição real e a simulada do ponto de parada, por estágio.

### M14. Prova social que se sustenta

1. **Objetivo:** só citar número que tenha prova arquivada.
2. **Fundamento:** prova social eleva a compra (Spiegel), e nota perfeita pode soar falsa (fonte secundária). O parecer de conformidade de 19/10 já marcou "500 clientes" e "124 avaliações" sem prova arquivada.
3. **Por que não outro método:** tirar a prova social perde a alavanca mais forte; o caminho é provar.
4. **Como:** o operador arquiva a origem dos números (relatório da Logzz, plataforma de avaliações) em `docs/operacao/`; o que não tiver prova sai de `socialProof` no `BUSINESS_CONFIG`. Sem mudança de código: o prompt já lê o config.
5. **Ferramentas:** `compliance-reviewer`, `BUSINESS_CONFIG` (JSON validado + hash + `job:"health"`).
6. **Impacto esperado:** nenhuma queda prevista; elimina risco jurídico (CDC art. 37) antes de gastar verba.
7. **Métricas:** número citado = número arquivado (sim/não).

---

## 2. Calendário

| Quando | O quê |
|---|---|
| **21–22/10** (antes do L3, sem deploy de prompt) | M1 (operador), M14 (operador + config), M12 (roda na rodada de personas do tópico d), M5 (só auditoria) |
| **23/10–09/11** (L3, agente congelada) | Só medir: link → pedido por caminho (M2), objeções reais (M4), resposta por toque (M5), recusa por caminho (M8), ponto de parada real (M13) |
| **10/11 em diante** (E7) | M13 (calibrar), depois M11 como régua; com ela, M2, M3, M4 e M10, um de cada vez, cada um com eval e braço A/B |

---

## 3. Passos para trás: o veredito

Reli as 14 respostas contra três perguntas: **já existe? a evidência sustenta o custo? cabe no calendário?** Quatro eram coisas que o
código já faz, uma estava em conflito com o funil validado, e as de prompt não podem entrar antes de 09/11.

| # | Veredito | Motivo |
|---|---|---|
| M1 | ✅ **PROSSEGUIR já** | Custo zero, define a meta de todo o resto. Sem ele, nenhuma decisão de E7 tem régua |
| M14 | ✅ **PROSSEGUIR já, antes do L3** | É risco jurídico apontado pelo parecer; o L3 vai pôr verba em cima do número. Não é mudança de código |
| M12 | ✅ **PROSSEGUIR já**, dentro da rodada do tópico d | Achar um furo de mentira antes do L3 é a exceção que o L3 aceita. Custo marginal, porque a rodada já está prevista |
| M5 | 🔄 **ADAPTAR**: só auditoria agora, mudança em E7 | A evidência é a mais forte das duas pesquisas, mas o sistema já tirou escassez e pressão (E1.4, R20.1, régua v3). Mexer sem achar pressão seria mudar por mudar |
| M13 | 🔄 **ADAPTAR**: depois do L3, e antes de M11 | Não há conversa real depois do v3 para comparar. É o que torna a eval confiável para as mudanças de E7 |
| M11 | 🔄 **ADAPTAR**: k=3, só nas comparações de E7, com OK de custo | pass^8 custaria ~R$ 12 por versão sem ganho proporcional. Rodar repetido antes de M13 mediria um simulador não calibrado |
| M2 | 🔄 **ADAPTAR**: depende do tópico (b) e do dado do L3 | Só vale se o frete for legível de verdade (sem número inventado) e se o L3 mostrar link antecipado → pedido baixo |
| M4 | 🔄 **ADAPTAR**: só "tá caro", nunca "vou pensar" | Perguntar depois de "vou pensar" contraria R16.5 e E1.1 (recusa respeitada), que vieram de conversa real. "Tá caro" não tem essa história |
| M10 | 🔄 **ADAPTAR**: medir repetição primeiro | Os diretivos de estado já existem; acrescentar contexto sem medir é peso a mais no prompt |
| M3 | 🔁 **SUBSTITUIR** a "pergunta extra" por "usar o que ela conta" | 13 de 33 clientes pararam na 1ª resposta quando a Malu pedia algo; o v3 vende antes de perguntar. A versão sem pergunta nova pega o ganho de atenção sem pedir esforço |
| M6 | ❌ **DESCARTAR** | Já está em `objectionBriefing` |
| M8 | ❌ **DESCARTAR** como construção | `order_eve` já existe; fica só a métrica (E6.3) |
| M9 | ❌ **DESCARTAR** | `checkout_reminder` já sai em 10 min; nenhuma fonte prova que 1 h seja melhor |
| M7 | ❌ **DESCARTAR** | O preço por peça do kit de 2 (R$ 116,91) é igual ao antecipado de 1 peça: confunde. A evidência da âncora é fraca e o estoque do kit está pendente (tópico h) |

**Prosseguimos com:** M1, M14 e M12 agora. M5 em auditoria agora. No L3, só medição. Em E7, na ordem M13 → M11 → (M2, M3', M4', M10)
conforme os dados do L3 apontarem onde mais se perde.

**Antes de executar:** cada item que entra vira entrada no grafo de decisões, e o quadro do `HANDOFF.md` ganha a linha "pesquisas I e II: M1/M12/M14".

---

## 4. Decisões do operador (21/10) e a especificação que vai ao código

**Caminho A**: três ondas numa branch, uma publicação, depois o segundo smoke test. **Sem datas**: o L3, o congelamento e as
datas do plano 14 deixam de valer; testa e congela quando estiver bom (operador, 21/10). Referência de mercado no lugar do
humano (não existe histórico): conversa → pedido 5–15%; recusa na porta 20–30% sem confirmação, 10–15% com (números de
fornecedor, só referência). Saem: M5 (a régua da copy v4 não tem pressão), M6, M7 (feito na v39, §121), M8, M9.

### 4.1 Perfil (`leads.profile`, jsonb) — o que o interpretador lê e o código junta

O interpretador (`interpret.ts`, a mesma chamada de hoje, sem chamada nova) devolve por mensagem:

| Campo novo | Tipo | Regra |
|---|---|---|
| `occasion` | texto ≤ 40 ou null | pra que ela quer: "casamento", "pós-parto", "trabalho", "dia a dia" |
| `pain` | texto ≤ 80 ou null | o que incomoda: "barriga marca no vestido", "dor nas costas" |
| `objections` | lista de `preco` `confianca` `tamanho` `entrega` `pagamento` `conforto` `resultado` `outra` | só a objeção dita nesta mensagem |
| `price_signal` | `complaint` `discount_ask` `installments` `discount_question` ou null | ver 4.3 |
| `buying_question` | bool | pergunta de quem está comprando: preço, prazo, pagamento, kit, como compra |
| `hook` | texto ≤ 90 ou null | só quando `occasion` ou `pain` veio: uma frase curta ligando o colete a isso, sem promessa de saúde ou de emagrecer |

O código junta no `leads.profile`: `occasion`, `pain` e `hook` (o mais recente), `objections` (sem repetir), `price_sensitivity`
(o nível mais alto visto), `audio_count` (mensagens dela com o marcador de áudio do canal). Tamanho, CEP, caminho e etapa
continuam nas colunas de hoje. Fica só no Supabase, com os 90 dias de retenção do lead; nunca vai para a Conversions API
nem para público de anúncio (dado de saúde incluído, decisão do operador).

### 4.2 Score de prontidão (`leads.score` 0–100, `leads.score_band`)

O interpretador lê os sinais; o código soma por esta régua (pesos são hipótese explícita até ~200 leads reais; depois,
regressão logística de "pedido" sobre os sinais):

| Sinal | Pontos | Fundamento |
|---|---|---|
| Começo (veio do anúncio e escreveu) | 10 | — |
| Disse o tamanho ou a calça | +15 | avanço no funil reduz esforço restante (Fogg) |
| Mandou o CEP e a região foi lida | +15 | idem |
| Entrega na porta disponível no CEP | +5 | reversor de risco disponível (Baymard, confiança) |
| Escolheu o caminho de pagamento | +10 | decisão parcial |
| Mandou o nome | +10 | dado entregue para o link |
| `wants_to_buy` ou pediu o link | +20 | intenção declarada |
| `buying_question` | +5 cada, até +15 | pergunta de compra (Gong: sinal de compra) |
| Contou ocasião ou dor | +5 (uma vez) | motivação declarada |
| "Vou pensar" | −15 | adiamento |
| Pediu desconto pela 2ª vez depois do "não" | −10 | negociação sem decisão |
| Toque da régua sem resposta | −10 cada | silêncio |
| Recusa ou opt-out | 0 e fim | — |
| Pedido criado | 100 | — |

Faixas: **≥ 60 quente · 30–59 morna · < 30 fria**. **O que decide:** fria recebe só o 1º lembrete de silêncio e a régua para;
morna e quente seguem a régua de hoje (3 toques). O e-mail ao operador leva no assunto "🔥 QUENTE · 72", "MORNA · 45" ou
"FRIA · 18". O portal mostra por lead (sem telefone) e o agregado.

### 4.3 Sensibilidade a preço (`profile.price_sensitivity`)

| Nível | Sinal (`price_signal`) | Exemplos que o interpretador aprende |
|---|---|---|
| alta | `complaint`, `discount_ask` | "tá caro", "achei mais barato", "faz por 100?", "não tenho esse dinheiro agora" |
| média | `installments`, `discount_question` | "parcela?", "dá pra dividir?", "tem cupom?", "tem desconto no pix?" |
| baixa | nenhum | — |

Vale o nível mais alto da conversa. Cada nível tem teste com frase real e com negação ("não achei caro").

### 4.4 Gatilho pessoal (até 3 usos por conversa)

Contado no que a Malu **enviou** (resposta que cita a ocasião ou a dor), não no que foi pedido. (1) A resposta seguinte à
mensagem em que ela contou: diretiva "use isso agora". (2) A oferta fixa: o `hook` vai num balão antes do texto do operador,
pela cadeia de gates. (3) Livre: a diretiva "pode usar mais uma vez se encaixar, sem obrigação" até a terceira menção; depois,
"não cite mais".

### 4.5 Objeção vaga ("tá caro", "achei mais barato", "vou ver", "vou pensar")

Uma pergunta só, no modelo aprovado: *"Claro! Ficou alguma dúvida que eu possa resolver, sobre o tamanho, a entrega ou o
valor? 💛"*, com um gatilho verdadeiro para comprar agora, sem pressão: chega em menos de 24 h (só se a primeira data é
amanhã), não paga nada agora (só na entrega), 7 dias pra trocar, a âncora de R$ 216,50, estoque baixo real (4.6). Se ela
repetir que vai pensar, a resposta de hoje, sem segunda pergunta.

### 4.6 Escassez real

A consulta da Logzz já devolve a quantidade por tamanho (`stock_per_operations`). Abaixo de `scarcity.lowStock` (20, no
`BUSINESS_CONFIG`; ausente = sem escassez, a verdade de hoje) no tamanho dela, a Malu pode dizer que o tamanho está acabando,
com o número real. **Sem "oferta por tempo limitado"**: a oferta não tem data de fim (operador, 21/10). O `scarcity_claim`
aceita só a frase que bate com a consulta desta conversa.

### 4.7 Frete do antecipado

A mesma leitura do Playwright (§116), sem dado pessoal: o valor do frete do CEP dela entra na oferta do antecipado. Falhou a
leitura, a frase de hoje ("aparece no checkout").

### 4.8 Portal (`encorpa-portal`)

Uma view mascarada (`lead_profiles_v`: id do lead, criado em, etapa, score, faixa, perfil sem telefone e sem nome) e uma
tela com: por lead, score, faixa, etapa, objeções, sensibilidade a preço, áudios, ocasião; agregado, faixas, objeções mais
frequentes, sensibilidade a preço, onde a conversa para.
