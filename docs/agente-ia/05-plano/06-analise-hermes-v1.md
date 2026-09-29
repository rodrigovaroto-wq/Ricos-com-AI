# Hermes v1 com ideias do JEV — análise de viabilidade

> 2026-09-29. Só análise: nenhum código, migração, deploy ou commit. Consolidado de seis
> especialistas (backend, prompt, custo, segurança, LGPD, teste), com revisão do
> `code-reviewer`. Marcas: **[C]** fato no código · **[D]** fato em documento ·
> **[I]** inferência · **[H]** hipótese.
>
> Nota de arquivo: já existe `06-eval-muse-2026-09-25.md` com o mesmo prefixo; este nome foi o
> pedido.

## 0. Três premissas do pedido que o repositório corrige

1. **"Não há código do Hermes" é falso.** Existe o ciclo inteiro: runner
   (`src/dev/hermes-run.ts`), parte pura e testada (`src/dev/hermes-core.ts`,
   `tests/hermes-core.test.ts`), skill (`hermes/skills/encorpa-supervisor/SKILL.md`),
   calibração com 3 defeitos plantados (`src/dev/hermes-calibrate.ts`), `hermes_runs` e
   `hermes_backlog` (`0008`), o histórico de decisões (`0014`–`0016`), as views de
   avaliação (`0018`), a Action diária (`.github/workflows/hermes.yml`) e a publicação
   após o clique (`deploy-hermes.yml`, R14.14) **[C]**. A pergunta não é "construir o
   Hermes v1", e sim **o que acrescentar ao Hermes que já roda**.
2. **"500+" não é meta de vendas.** É o número de prova social usado no site ("Número
   único, usado no site inteiro", `docs/documentacao/contexto-negocio/05-decisoes-firmes.md:32-34`)
   **[D]**. A meta de 10% (conversa → pedido) está em `06-modelo-economico.md` **[D]**.
   "5.000 conversas" é cenário, não meta.
3. **"O eval da Muse ainda não foi rodado"** (`CLAUDE.md:86`) está desatualizado: foi
   rodado em 25/09 (`06-eval-muse-2026-09-25.md`: 61 respostas, 0 respostas prontas) **[D]**, mas no
   `muse-spark-1.3-contributor` (`:4`). Contra o modelo padrão, que vai para a cliente real, a frase
   continua verdadeira.

E um fato que pesa sobre tudo: **não existe conversa real.** O canal do WhatsApp está
pronto e desligado (`CANAL_ATIVO=false`, R14.16; `HANDOFF.md`) **[D]**. O caminho de
produção do Hermes nunca rodou com cliente de verdade.

## a. O menor Hermes v1 que entrega valor, e o que ele não mede

**O v1 mínimo não precisa de juiz novo. Precisa consertar o caminho de produção que já
existe**, que hoje mede errado em silêncio:

- A fonte Supabase monta as respostas sem `status` nem custo:
  `{ from: "valen", text, vetoes }` (`hermes-run.ts:79`) **[C]**. O placar decide
  fallback por `reply.status === "fallback"` (`persona-scorecard.ts:140`), pula as
  boas-vindas por `status === "welcomed"` (`:75`) e soma `c.costBrl ?? 0` (`:125`) **[C]**.
  **Em produção, "respostas prontas" e "handoffs" dão sempre 0, a boas-vindas vira a
  resposta 1 da Malu, e o custo lê 0.** O placar diria "8/8 atingidas" sobre uma rodada
  cheia de respostas prontas. Nenhum teste chama `fromSupabase` **[C]**.
- O desfecho existe no banco: `turn_outcomes` guarda `fallback` e `handoff` por conversa,
  com horário (`0006:38-55`) **[C]**. Só não está ligado a uma mensagem. Dá para
  associar pelo horário, como já se faz com os vetos (`hermes-run.ts:75-78`) **[I]**.
- `gate_traces.message_id` existe (`0001:108`), mas `recordTraces` nunca o escreve
  (`supabase/functions/turn/index.ts:615-629`); o comentário em `hermes-run.ts:76`
  ("carry no message id") descreve o efeito, não a causa **[C]**. A fonte também ignora os
  `warn` (`:68`) **[C]**.
- A leitura pega as 50 conversas mais recentes (`:64`), inclusive as que estão em curso e
  as de rodadas de personas com dados mantidos. O prefixo sintético `5500099` existe
  (`src/dev/persona-run-core.ts:16`), mas não é filtrado **[C]**. Pelo mesmo motivo, `hermes_backlog`
  (`0008:22-31`) conta esses leads: uma rodada de personas com dados mantidos pode disparar
  sozinha a passada de produção **[I]**.

**v1 = (1) a fonte Supabase com desfecho, boas-vindas, custo e sem conversa sintética;
(2) contagens do SQL no pacote; (3) as salvaguardas de §e; (4) versão e auditoria em
`evidence`.** A skill livre continua sendo quem propõe.

**Limite da prova:** o banco de produção não tem conversa real. O conserto de `fromSupabase`
só se prova, hoje, como função pura com fixture e com conversas sintéticas gravadas nas
tabelas reais (e apagadas depois); não há dado de cliente para confirmar **[I]**.

**O que ele não consegue medir hoje, com os dados gravados:**

| Não mede | Por quê | Como passaria a medir |
|---|---|---|
| Se o **rascunho vetado** era honesto (classe 2 da skill) | O texto vetado não é gravado; `detail` guarda só o motivo **[C]** | Gravar o rascunho: é dado de cliente novo, então entra na decisão LGPD |
| Veto → resposta com certeza | `message_id` vazio **[C]** | Escrever `message_id` em `recordTraces` (mexe na função no ar) |
| Recusa na porta por conversa | `entregue_pago`/`recusado` só em `stage`, e não entra no pacote | Levar `stage` e `orders` ao pacote |
| Qualquer taxa com significância | 50 conversas dão ±8,3 pp em p = 10% (`08-piso-de-amostra.md`) **[D]** | Os pisos da §4 desse documento, que ainda não foram assinados |
| Sumiço, régua e horário | As personas não têm relógio (`03-personas…md`, fim) **[D]** | Só com toque real (fase 8) |

## b. As cinco ideias do JEV

| # | Ideia | Veredito | Por quê |
|---|---|---|---|
| 1 | Perguntas fixas, tipadas e atômicas | **Adaptar: poucas, e depois** | Metade da rubrica é contagem e já está no placar ou nas views: resposta pronta, link repetido, tamanho trocado, decidiu sem link, custo acima do teto, opt-out ignorado (`persona-scorecard.ts:184-192`, `0018`) **[C]**. Só a **mentira que passou** precisa de modelo, porque se fosse computável já seria gate **[I]**. Candidatas no máximo: Q1 mentira (o trecho da Malu **e** a linha do config que ele contradiz), Q2 decidiu e ficou sem link (contraprova do regex `decidesToBuy`), Q4 teve de repetir ou corrigir. Perguntar pela ação observável, nunca pela polaridade ("recusou?"). Hoje, com 12 personas, a taxa de erro do juiz não é medível **[I]**. **O passo barato, já:** a skill passa a exigir, em toda "mentira", a linha do config contradita (a skill já proíbe preço ou prazo fora do config, `SKILL.md:97-99`, mas não exige citar a linha que a frase contradiz, `:50-51,86-87`) **[I]** |
| 2 | Confiança por julgamento e roteamento por limiar | **Descartar no v1** | A confiança que a Muse declara sobre si não está calibrada [H], e não se sabe se a API devolve logprobs (não sei). Toda proposta já vai a um humano, então não há o que rotear. Se um dia valer: concordância em k amostras (k = 3), a ~3× o custo (§f) |
| 3 | Veredito do operador como rótulo, com holdout | **Adaptar ao que existe** | O rótulo por proposta já existe: `status` + `decision_reason`, lidos antes de propor (`0014`, `renderLedger`) **[C]**. Falta o **holdout**, e ele não pode sair de conversa real (§d) |
| 4 | Versão fixada e auditoria em `evidence` | **Adotar** | O binário e o modelo já estão fixados (`hermes.yml:57`, `config.yaml`) **[C]**. Faltam o hash da skill e da lista de perguntas, o commit e os ids das conversas lidas: cabem em `evidence jsonb` sem migração **[I]** |
| 5 | Contagem, data e % em SQL; texto da cliente como dado | **Adotar** | Já é meio caminho: o placar é código, e a 0018 é SQL **[C]**. Faltam o pacote carregar os números das views e a skill proibir o modelo de reportar taxa. O texto da cliente como dado é a mitigação da §e |

## c. Schema

**Para medir, o v1 não precisa de migração**: a auditoria cabe em `evidence jsonb`; desfecho e
boas-vindas saem de `turn_outcomes` e `conversations.welcomed_at` (`0005:14`), que já existem **[I]**.

Se as perguntas tipadas entrarem (depois), a tabela seria **nova**, `hermes_judgments`, com:
`run_id` → `hermes_runs`; `conversation_id` → `conversations` **on delete cascade**;
`question_id`, `question_version`, `model`, `kind` (`bool|choice|score`), `value jsonb`,
`quote`, `operator_label` nulo e `split` nulo. RLS ligada e sem policy, como as demais.

**Quebra a regra "campo novo é opcional e nasce ausente"?** Não. A regra é do
`BusinessConfig` (o `??` sobre o secret inteiro, `.claude/memory/business-config-sobrescreve.md`) **[D]**.
Em SQL, o equivalente é tabela nova ou coluna nula, com o leitor tratando nulo como a
verdade de hoje. **O espelho `src/agent` ↔ `supabase/functions/turn` não é afetado**: o
turno não lê nenhuma `hermes_*` **[C]**, e o Hermes mora em `src/dev`. A exceção seria
escrever `message_id` nos traces, que mexe na função no ar e passa por deploy manual (R14.8).

**Mas o v1 inteiro precisa de uma migração, por LGPD** (as salvaguardas de §e estão no v1): ver
§e, G1. É aditiva: coluna nova com default em `hermes_proposals` e uma linha a mais em
`purge_expired`.

## d. Operador critica → rótulo → calibração, sem treinar modelo

"Calibrar" aqui é mudar **texto versionado e limiares**, nunca pesos:

1. O operador decide cada proposta pelo link (R14.14); o motivo vai para
   `decision_reason` **[C]**.
2. Na rodada seguinte, o Hermes lê `decisoes.md` e não repete o que foi recusado **[C]**.
   Isso é aprendizado por contexto, e já existe.
3. Mudança na skill ou nas perguntas é commit, com `pnpm hermes:calibrar` antes e depois
   (hoje é regra do README, não do CI) **[D]**.
4. **O holdout mora no repositório, e é sintético.** Conversa real expira em 90 dias
   (`0001:139-153`, R6.3), e o `maskPii` não anonimiza (§e), então não existe holdout
   durável feito de cliente real **[I]**. Receita (test-engineer):
   - defeitos plantados em rodadas de personas, com texto novo a cada leva;
   - pelo menos 100 positivos por pergunta, para medir revocação, e 300 negativos
     (negações incluídas), para medir falso alarme até ~1% pela regra de três;
   - separação por `sha256(id) mod 5 == 0`, gravada num arquivo congelado com o hash
     registrado;
   - um check de CI falha se a skill ou a calibração citarem um id do holdout.
5. **Goodhart:** a calibração é rejeitada se a diferença entre o placar de ajuste e o do
   holdout passar de 10 pp, ou se o holdout cair entre versões. O holdout nunca entra
   em `decisoes.md`.
6. Os rótulos sobre conversa real (quando existirem) ficam em `hermes_judgments`, com cascade:
   duram o que dura a conversa. O que precisar durar mais guarda só o veredito e a
   categoria, sem texto.

## e. Riscos novos, e os que já existem e pioram

| Risco | Fato | Gravidade | Mitigação mais barata |
|---|---|---|---|
| **G1 · Citação de cliente fica para sempre** | `evidence: { ...p, source }` (`hermes-run.ts:212`) guarda trechos literais; `hermes_proposals`/`hermes_runs` não têm `expires_at` nem FK para `conversations` (a única FK é `run_id`, `0008:18`); `purge_expired` não os toca (`0001:116-153`) **[C]** | **Alta: já existe** | Migração: `expires_at` e, no purge, `evidence = null` depois de 90 dias. O registro da decisão fica, a citação some |
| **G2 · Citação de cliente no git** | A Action commita `propostas/*` (`.md` e `.json` com as evidências) via PR (`hermes.yml:79`) **[C]**. O histórico do git não expira | **Alta: já existe** (quando houver tráfego) | Documento de produção sem trechos no PR, ou fora do git |
| **G3 · Máscara incompleta** | `maskPii` cobre e-mail, CPF, CEP e telefone (`hermes-core.ts:14-19`) **[C]**; rua, número, nome e **dado de saúde** (pós-parto, hérnia) passam. Saúde pode ser dado sensível (LGPD art. 11) **[I]** | Média | Mascarar endereço e nome; pergunta a um advogado sobre saúde |
| **G4 · Termos da Meta no modelo padrão** | O `-contributor` é recusado em dado real (`hermes-run.ts:46-47`) **[C]**; retenção e DPA do modelo padrão não estão no repositório | **Não sei** | Obter os termos de dados da Meta Model API e a cláusula de transferência internacional (art. 33) |
| **Injeção → clique → deploy** | A cliente é autora do trecho citado, então a checagem de trecho literal não a barra (`hermes-core.ts:116`). O detector de afrouxar só casa `afrouxa\|liberar\|deixar passar` (`:118`). O e-mail mostra `o_que`/`por_que`/`objetivo`, sem trechos nem anotação "hoje" (`n8n/workflows/hermes-decisao.json`). A sessão que implementa lê `evidence` sem delimitador (`IMPLEMENTAR.md` §3). `tests/gate-loosen-accepted.txt` pode ser editado pela própria sessão, e não há CODEOWNERS **[C]** | **Alta** (com auto-implementação) | E-mail com trechos e "hoje"; `evidence` tratada como dado não confiável no `IMPLEMENTAR.md`; `failed` automático se o diff tocar `gate-loosen-accepted.txt` |
| **O deploy não confere a aprovação** | `deploy-hermes.yml:41` publica qualquer commit no `main` com `hermes:<uuid>` na mensagem, sem conferir `status = 'accepted'` **[C]** | Média | Consultar o status antes de publicar |
| **Credencial ao alcance do Hermes** | `execFileSync` sem `cwd` roda na raiz do checkout, com o env inteiro menos o service role (`hermes-run.ts:150-151`) **[C]**; o `checkout@v4` persiste o token por padrão [I]; se `--in` confina o toolset `file` → **não sei** [H]. O `resumo` vai sem validação ao PR (`hermes-core.ts:183`) **[C]** | Alta até verificar | `persist-credentials: false`, `cwd: bundle`, env mínimo, recusar `resumo` com cara de token |
| **"Hoje passa nos gates" com config de teste** | `fixtureCtx`, não o `BUSINESS_CONFIG` de produção (`hermes-run.ts:167`) **[C]** | Média | Rotular "com a config de teste" no documento |
| **Barreira do `BUSINESS_CONFIG`** | Intacta: `config:*` vira `failed` (`IMPLEMENTAR.md` §2) e o deploy não mexe em secret **[C/D]**. Mas quem obedece o §2 é o modelo, e mudar a leitura (`!== false` ↔ `=== true`) muda o comportamento sem tocar no secret [I] | Média | Barrar no CI o diff que muda o default de leitura do config |
| **Custo sem freio** | O Hermes chama o binário, fora de `src/llm/seam.ts`; sem `llm_calls` e sem teto; o custo só é calculado depois (`hermes-run.ts:150,180`) **[C]** | Baixa hoje, alta com k amostras | Teto por passada lido pela Action (variável do repositório), não pelo `BUSINESS_CONFIG`, que a Action não lê |
| **Goodhart** | Ainda sem holdout: `hermes:calibrar` tem 3 casos, e 3/3 não mede taxa **[C]** | Média | §d |
| **Drift** | Modelo e binário fixados **[C]**; a skill muda sem nova calibração obrigatória | Baixa | Hash da skill em `evidence`; calibração no CI quando a skill mudar |

## f. Custo por passada e por mês

**Premissas** (todas explícitas):
- preço de `pricing.ts:22`: US$ 1,25 / 4,25 por 1M, "conferido em 2026-09-06" contra uma
  página que o arquivo não cita, e **sem preço de cache**, então o cache é cobrado cheio
  (`:48`) **[C]**;
- câmbio 5,4 (`smoke.ts:46`) **[C]**;
- tokens das rodadas medidas, **todas no `-contributor`**: 1 conversa, 60k; 12 conversas,
  101k; 15 conversas, 185k **[D]**;
- juiz: ~4k de entrada e ~300 de saída por conversa **[H]**;
- 5.000 conversas por mês ≈ 167 leads por dia **[H]**.

Fórmula: `US$ = (entrada × 1,25 + saída × 4,25) / 1e6`. 5.000 conversas = 100 passadas de 50.

Método de A **[I]**: base de ~60k tokens por passada (a rodada de 1 conversa) mais 2,5k a 9k
por conversa (a faixa entre as rodadas medidas), o que dá 185k a 510k tokens por passada de
50. O total medido não cresce de forma linear com o número de conversas, então a faixa é larga.

| Desenho | Por passada (50 conversas) | 5.000 conversas (= mês, no cenário) | Por conversa |
|---|---|---|---|
| A · Hermes de hoje (agente, em lote) **[I]** | US$ 0,23–0,64 | US$ 23–64 (R$ 124–346) | R$ 0,025–0,069 |
| B · juiz, k = 1 | US$ 0,31 | US$ 31 (R$ 169) | R$ 0,034 |
| B · juiz, k = 3 | US$ 0,94 | US$ 94 (R$ 508) | R$ 0,10 |

Leitura:
- É 2–7% do teto de R$ 1,50 por conversa. O dinheiro não é o problema; a falta de freio é.
- O juiz não sai mais barato que o agente sem preço de cache.
- Não dá para comparar com o custo da conversa: os R$ 0,013 por conversa sintética
  (`08-piso…md`) **[D]** foram pagos no `-contributor` (US$ 0,10/0,20), e o juiz está no
  preço do padrão. O custo da conversa no modelo padrão não foi medido: **não sei**.
- O "~US$ 0,05 por passada, ≈120k tokens" do `hermes/README.md` e o "≈ US$ 0,04" do
  `HANDOFF.md` **não fecham com a tabela de preços**: só a entrada daria US$ 0,15 **[I]**.

**Falta para virar fato:** a fonte oficial do preço da Muse padrão e do cache; uma passada
real de 50 conversas no modelo padrão (lendo o `usage.json`); tokens por conversa real
(média de `llm_calls`).

## g. O que precisaria ser verdade para reabrir o JEV como dependência

Todas, não uma:

1. **Volume**: um piso assinado (`08-piso-de-amostra.md` §4), atingido, e o
   Hermes com juiz próprio **medido** abaixo da barra do holdout (revocação ≥ 95% em
   mentira plantada) depois de duas iterações de skill.
2. **Contrato de dados**: DPA, retenção zero ou ≤ 90 dias, sem treino sobre o dado,
   região aceitável para a transferência internacional. Um segundo fornecedor recebendo
   conversa de cliente é mais uma linha de LGPD **[I]**.
3. **Fora do turno e fora do seam de conversa**, com teto e trace próprios. Não reabre
   R11.2.
4. **Vence o próprio holdout sintético** do repositório, com custo por conversa menor que o
   do juiz na Muse ou com ganho de revocação que o pague.
5. **Resistente às fraquezas que ele mesmo declara**: a bateria de negação e de injeção
   do repositório, com zero falso positivo em frase negada.

## Veredito

**Adiar o juiz tipado (ideias 1, 2 e 3 completas). Fazer já as salvaguardas e o conserto
do caminho de produção, sem juiz novo (ideias 4 e 5, e o passo barato da 1).**

Por quê: sem tráfego real não há o que calibrar, e o Hermes de hoje tem dois defeitos que
valem mais que qualquer ideia do JEV:
- ele **mediria errado em produção sem avisar**: fallback sempre 0;
- ele **guarda e publica citação de cliente sem prazo**, no banco e no git.

O JEV contribui a forma (perguntas atômicas, holdout, versão, número fora do modelo), não
a dependência.

## O que ainda não sei

- O preço oficial da Muse padrão e se há preço de cache; se a API devolve logprobs.
- Os termos de dados da Meta Model API no modelo padrão (retenção, DPA, transferência).
- Se o `--in` do `hermes-agent@ac4181f` confina o toolset `file`, e se `--ignore-rules`
  afrouxa algo.
- A visibilidade do repositório (muda a exposição de G2, não a retenção).
- Tokens e custo reais de uma passada de 50 conversas; leads por dia.
- Se dado de saúde dito pela cliente exige base legal do art. 11 (pergunta a um advogado).

## Próximo passo concreto

> **Feito em 2026-09-29, sem PR** (operador: "corrija os 3 itens, mas ainda não abra nenhum
> PR"), grafo §35. Na branch `claude/cool-brahmagupta-hccc4p`: migração `0020` (não aplicada),
> `hermes.yml` sem citação e com `persist-credentials: false`, `rowsToConversations` testada.
> A lista abaixo fica como o registro do que foi pedido.


Decisão do operador sobre **G1 e G2**, que já valem hoje e não dependem do JEV. Proposta
de uma PR só:

1. migração com `expires_at` em `hermes_proposals` e `evidence = null` no `purge_expired`;
2. `hermes.yml` sem citação de cliente no PR, com `persist-credentials: false`;
3. `fromSupabase` extraída como função pura, com teste de desfecho, boas-vindas e filtro
   sintético.

Os três **começam** o v1 da §a; não o fecham. Ficam para uma segunda PR:
- os números das views no pacote e a auditoria em `evidence` (itens 2 e 4 da §a);
- as mitigações de injeção: trechos e "hoje" no e-mail, `evidence` como dado não confiável,
  `failed` automático em diff que toque `gate-loosen-accepted.txt`;
- a consulta de `accepted` no `deploy-hermes.yml`;
- `cwd: bundle`, env mínimo e recusa de `resumo` com cara de token;
- a verificação do `--in` no `hermes-agent@ac4181f`.

Nada disso é feito antes do "sim" do operador.
