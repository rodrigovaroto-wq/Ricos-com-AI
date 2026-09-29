# Auditoria do repositório — 2026-09-29

Varredura completa: `main` em `29ab243` (PRs #32–#41 mergeados), mais os PRs abertos #42 (troca de
tamanho, R17.1) e #43 (Hermes v1). Baseline: `pnpm lint`, `pnpm typecheck` e `pnpm test`
(49 arquivos, 5.679 casos) verdes. `typecheck:function` não rodou aqui (sem Deno no container); o
CI roda.

**Como ler:** **A** = muda o que a agente diz ou faz em produção · **B** = número ou regra que
dois documentos dizem diferente · **C** = documento desatualizado ou difícil de achar. Coluna
"Situação": *corrigido aqui* (nesta branch), *PR #42/#43* (o PR aberto resolve), ou *pipeline*
(item de [`05-plano/09-pipeline-ate-producao.md`](../05-plano/09-pipeline-ate-producao.md)).

## A — o que a agente diz ou faz

| # | Achado | Onde | Situação |
|---|---|---|---|
| A1 | **Produção está 6 PRs atrás.** A `turn` no ar é a v41 (PR #35, 25/09). Frete grátis no COD com frase canônica (R15.3), fim da régua depois da compra, os consertos das revisões de 28–29/09 e a varredura de `perdido` estão só no `main`. Toda avaliação "a agente faz X" vale para o repositório, não para o que responde cliente. | `HANDOFF.md:54`, `:444`, `:468` | pipeline F1 |
| A2 | **Troca de tamanho: o `main` pode dizer "a troca é grátis"; a operação cobra R$ 27,00 da cliente** (operador, 2026-09-29). O `main` trata a troca grátis como verdade (`guardrails.ts:488`, comentário "the operation's truth"); a política pública da Logzz citava R$ 20 (`03-decisoes-tomadas.md:1872`); o PR #42 veta "troca grátis" mas deixa o valor "pendente, provavelmente regional". O valor agora é **fixo, R$ 27,00**. | `src/agent/guardrails.ts:483–494`; PR #42 | **resolvido no código pelo PR #42 (mergeado em 29/09)**: "troca grátis" vetada, resposta fixa com valor e link. Falta `exchange.feeBrl: 27` + `checkoutUrl` no secret (pipeline L0.4) |
| A3 | **Teto de custo de R$ 0,50 não está em produção.** R15.4 baixou `conversationCapBrl` de 1,5 para 0,5 no repositório; o secret `BUSINESS_CONFIG` sobrescreve o fallback inteiro. O operador colou um `BUSINESS_CONFIG` novo em 29/09, mas nada registra se ele já tinha `cost.conversationCapBrl: 0.5`. | `03-decisoes-tomadas.md:1789–1793` | pipeline F0 (conferir) |
| A4 | **A troca por link precisa de um link que ainda não existe.** Com `exchange` ausente, a troca de um pedido vai para uma pessoa (seguro). Com `feeBrl` e sem `checkoutUrl` em `https://`, também não sai. O link do Mercado Pago de R$ 27,00 é do operador. | PR #42, `03-decisoes-tomadas` R17.1 | pipeline F0 |
| A5 | **A base de conhecimento ainda traz a copy "Não é robô. … gente de verdade"** (objeção 4). O prompt não ensina isso e o script manda honestidade (Estágio 10), mas o arquivo que se apresenta como "o que a agente pode dizer" contém uma frase que a agente não pode dizer. A decisão de disclosure (#9 em `02-decisoes-em-aberto.md`) marca "copy do site ainda pendente". | `01-conhecimento/01-base-de-conhecimento.md:22` | pipeline F2 (decisão do operador sobre a copy do site) |

## B — números e regras que dois documentos dizem diferente

| # | Achado | Onde | Situação |
|---|---|---|---|
| B1 | **Custo da recusa em três valores.** R15.4 fixou **R$ 9,90**. Continuam: R$ 9,99 em `03-economia-cod.md` (corpo inteiro) e na caixa P5 de `06-modelo-economico.md`; **R$ 14,98** em `05-decisoes-firmes.md` (pendências) — o arquivo "não reabrir" tem o valor mais velho. | `03-economia-cod.md:11–36`; `06-modelo-economico.md:119`; `05-decisoes-firmes.md` §Pendências | corrigido aqui (nota de supersessão nos três) |
| B2 | **Premissas gerais do modelo econômico contradizem a tabela de 29/09:** "1 unidade por pedido" (há kits de 2 e 3), antecipado com "a mesma estrutura do COD entregue… + entrega" (R15.4: entrega concluída só no COD), contribuição do antecipado R$ 51,27 (hoje R$ 77,93 de margem se entregue). | `06-modelo-economico.md` §Premissas gerais e §Contribuição por pedido | corrigido aqui (nota) |
| B3 | **`Físico na entrega` "na Coinzz"** em `03-economia-cod.md` e `05-decisoes-firmes.md` — o checkout da entrega é a Logzz desde 25/09. | idem | corrigido aqui (nota) |
| B4 | **Decisões "em aberto" com resposta velha:** "Onde o sistema roda: VPS 24/7" (é Supabase Edge Function + n8n no PikaPods, R5); "COD sem checkout" (há checkout Logzz por kit, 25/09); título "Status em 2026-09-04" com linha de 21/09. | `02-decisoes-em-aberto.md:25–41` | corrigido aqui (nota no quadro) |
| B5 | **Comentário do `business.example.json` diz o contrário do valor ao lado:** o `_comment` afirma `conversationCapBrl` 1,5 e "o secret tem `freeShipping: true` escrito"; o valor é 0,5 e o operador colou um secret novo em 29/09. O JSON inteiro de decisões vive numa string de uma linha. | `config/business.example.json:112` | pipeline F0 (o PR #42 edita este arquivo; corrigir depois do merge) |
| B6 | **CLAUDE.md diz que o eval da Muse "ainda não foi rodado"**; `05-plano/06-eval-muse-2026-09-25.md` registra que rodou (na variante `-contributor`). | `CLAUDE.md` §Provedor | PR #43 corrige a linha |

## C — documentação desatualizada ou difícil de achar

| # | Achado | Onde | Situação |
|---|---|---|---|
| C1 | **README da raiz descreve o repositório de 05/09:** "os scripts ainda não existem", "nenhuma arquitetura foi escolhida", "o índice de memória começa vazio". | `README.md` | corrigido aqui |
| C2 | **README do agente diz "nada aqui é código, e nada aqui é decisão de arquitetura tomada"** e a tabela de leitura para em `06-script/` (faltam `07-cobertura`, `08-mudancas`, `09-cruzamento`). | `docs/agente-ia/README.md` | corrigido aqui |
| C3 | **Não havia índice do `docs/`.** Informação espalhada entre `HANDOFF.md` (2.750 linhas, cinco seções "COMECE AQUI" de datas diferentes), decisões, grafo e memória. | — | corrigido aqui: [`docs/README.md`](../../README.md) |
| C4 | **HANDOFF: a fila do topo aponta para um branch já mergeado** (`claude/happy-planck-izq7jt`, PR #40) e o texto de 25/09 ("COMECE AQUI") segue no meio do arquivo sem marca de histórico. | `HANDOFF.md:14`, `:375`, `:1188` | pipeline F0 (os PRs abertos reescrevem o topo; arquivar o histórico depois do merge) |
| C5 | **CLAUDE.md: "Playwright (CDP)" na stack** — não há Playwright no `package.json` nem uso em `src/`; e "a v32 no ar ainda usa os dois até o deploy da v33" — no ar é a v41. | `CLAUDE.md:20`, `:85` | pipeline F0 (o PR #43 edita o `CLAUDE.md`; corrigir depois do merge) |
| C6 | **Memórias com "não deployado até a v33"** (`stage-nunca-e-escrito`, `desfecho-do-turno-nao-persistido`). A v33 foi publicada em 25/09; a frase já não diz o estado. Conferir o que a v41 grava antes de reescrever. | `.claude/memory/*.md` | pipeline F1 |
| C7 | **Provedores OpenAI e Gemini continuam em `src/llm/providers/`** (usados só por `src/dev/smoke.ts` e `persona-run.ts`), embora R12.1 tire os dois do escopo. Não é bug — é código de ferramenta de dev que parece de produção. | `src/llm/providers/openai.ts`, `gemini.ts` | pipeline F7 (decidir: manter como ferramenta ou apagar) |
| C8 | **`@types/node` ^22 com `engines.node >= 24`** e CI em Node 24. | `package.json` | pipeline F7 |
| C9 | **Instantâneos de prompt sem teste de frescor:** `09-cruzamento/prompt.txt` e `gate-briefing.txt` foram gerados à mão; a próxima mudança de prompt os deixa falsos sem aviso. | `docs/agente-ia/09-cruzamento/` | pipeline F7 (regerar por script ou marcar como foto datada) |
| C10 | **Numeração com buracos e duplicata:** `agente-ia/` sem `04-`, `05-plano/` sem `01-`, `contexto-negocio/` sem `04-`, dois `04-` em `decisoes/`. Três "planos" convivem (`00-plano-simples`, `02-plano-de-execucao…`, `README` com o desenho original). | `docs/` | registrado no mapa; renumerar quebraria links — não se renumera. O plano vigente passa a ser `09-pipeline-ate-producao.md` |

## Revisão 2 — PR #43 e o que trava a operação (2026-09-29, noite)

Base: `main` em `75c22c8` (PR #42 mergeado), PR #43 aberto (`c698830`). Pergunta desta revisão:
o que impede a operação de rodar com lead real, e o que impede o Hermes de fazer a melhoria
contínua depois. Numerados em sequência com a seção A.

| # | Achado | Evidência | Situação |
|---|---|---|---|
| A6 | **O Hermes de produção nunca rodou.** As 5 execuções diárias da Action `Hermes` (25/09 a 29/09) falharam na instalação: `uv tool install "hermes-agent @ git+…"` quebra com *"Building wheels or sdists for hermes-agent is not supported. Hermes is distributed via the shell installer, Docker image, or Nix."* O PR #43 não mexe nesse passo, e o `hermes/README.md` dele ensina o mesmo comando. Tudo o que o #43 conserta na leitura só vale depois que a instalação funcionar. | Action `hermes.yml`, execução 36602138056, passo "Install Hermes Agent" | pipeline L0.7 |
| A7 | **Não existe por onde uma pessoa responder a cliente depois do handoff.** A agente grava `handoff_at`, para de responder para sempre e manda e-mail. Os cinco workflows do n8n não têm envio manual; não há Chatwoot (a Q12 decidiu "(a) + (b) Chatwoot", nunca construído); o número da Cloud API não abre no app do celular. Vão para pessoa: pedido explícito, cancelamento, pergunta sobre pedido existente, troca (R17.1), teto de custo e falha de modelo. | `n8n/workflows/*.json`; `supabase/functions/turn/index.ts` (`handoff_at`); `03-decisoes-tomadas.md` Q12, R13.2 | pipeline L0.3 (decisão do operador) |
| A8 | **O custo com o modelo padrão nunca foi medido, e a estimativa bate no teto.** Toda rodada rodou no `-contributor` (US$ 0,10/0,20 por milhão; o padrão é US$ 1,25/4,25, ~15× mais caro no perfil de uma chamada: ~2,9 mil tokens de entrada, ~500 de saída). O eval deu R$ 0,013 por conversa em média e R$ 0,036 na mais longa (Jussara, 11 respostas) — no padrão, ~R$ 0,19 e ~R$ 0,53. O teto é R$ 0,50, efetivo R$ 0,625: a cliente desconfiada que conversa mais que isso vira handoff, e o handoff cai no A7. Além disso, `src/llm/pricing.ts` não tem preço de cache para o `muse-spark-1.3`: se a API devolver tokens em cache, o contador cobra preço cheio e o teto chega antes. A premissa de "IA R$ 0,10 por lead" do modelo econômico fica ~2× baixa (efeito pequeno no lucro por venda; grande no handoff). | `06-eval-muse-2026-09-25.md`; `src/llm/pricing.ts:22`; `config/business.example.json` (`cost`) | pipeline L0.5 (medir, depois o operador fixa o teto) |
| A9 | **A rotina que implementa a proposta aprovada não foi encontrada.** R14.14 diz "rotina agendada" (`hermes/IMPLEMENTAR.md`); não há rotina nesta conta do Claude Code (pode existir em outra — conferir). Sem ela, o clique em "Aprovar" grava a decisão e nada é implementado. | `03-decisoes-tomadas.md` R14.14 item 3; listagem de rotinas vazia em 29/09 | pipeline L4 (H3) |
| A10 | **O Hermes não vê conversão.** O pacote leva conversas, vetos, desfechos do turno, `eval_turn_outcomes` e `eval_gate_blocks`; não leva `eval_funnel`, `eval_conversation_cost` nem o pedido/entrega/recusa de cada conversa. Ele acha mentira, resposta pronta, "venda perdida" pelo texto e tom — não sabe qual conversa virou pedido nem qual foi recusada na porta. Para "otimizar o resultado", precisa desse dado. | `src/dev/hermes-run.ts:172–173` no PR #43; `0018_evaluation_views.sql` | pipeline L4 (H4) |
| A11 | **O pipeline da revisão 1 punha no caminho crítico o que não trava a operação:** bateria completa de personas contra a produção, aquecimento do número (risco do WAHA, não da Cloud API com conversa aberta pela cliente) e os três templates. Só o `order_eve` mexe em dinheiro no V1. | revisão 1 deste pipeline | pipeline reescrito (versão 80/20) |

**Confirmado sem problema nesta revisão:** atribuição CTWA gravada (`referral` → `leads.source`,
lida por `eval_attribution`); webhooks de venda da Logzz e da Coinzz no ar; tamanho do kit pelo
complemento do checkout ensinado pela agente e lido pelo n8n; migração `0020` já aplicada em
produção (o banco está à frente do `main` até o merge do #43, sem efeito na `turn`).

## O que esta auditoria não achou

- **Espelho `src/agent/` ↔ `supabase/functions/turn/`:** íntegro (`function-drift.test.ts` verde).
- **Preços e kits:** config, oferta, modelo econômico e prompt batem (129,90 / 116,91; kits 233,82 /
  311,76 / 207,84 / 272,79).
- **Frete:** grátis só no COD, antecipado por região — consistente em config, oferta, decisões e
  memória desde R15.3.
- **Devolução:** sem custo para ela (R16.3) e R$ 25,00 para o operador (R15.4) — não é
  contradição, são os dois lados da mesma regra.
