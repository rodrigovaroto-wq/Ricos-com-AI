# Plano de execução — do estado de hoje até os primeiros clientes reais

> **Reescrito em 2026-09-22 (versão 2).** A versão 1, da manhã do mesmo dia, tinha sete
> fases; esta tem dez, porque a [análise de arquitetura](04-analise-de-arquitetura.md) e a
> [rodada 11](../../documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22)
> abriram trabalho novo, e porque a sessão fechou seis itens e descobriu três fatos que
> mudam a ordem. A versão 1 está no histórico do Git (`ffc906a`).
>
> Nenhum item entra como "pronto" sem uma linha **Fechou quando** verificável por quem não
> confia em quem escreveu. As personas de teste estão especificadas em
> [`03-personas-de-teste-interno.md`](03-personas-de-teste-interno.md).

## Como ler

1. [As três regras](#as-três-regras)
2. [O mapa das plataformas](#o-mapa-das-plataformas)
3. [O estado em 2026-09-22 — o que já fechou, com prova](#o-estado-em-2026-09-22)
4. [O caminho crítico: o que só o operador destrava](#o-caminho-crítico-o-que-só-o-operador-destrava)
5. [As dez fases](#as-dez-fases)
6. [Ordem de execução](#ordem-de-execução)
7. [Critério de saída](#critério-de-saída)
8. [O que este plano não cobre](#o-que-este-plano-não-cobre)

---

## As três regras

1. **Nada é "pronto" sem prova pela porta de produção.** Sonda contra a Edge Function prova
   o código, não o caminho — o webhook do n8n já devolveu 200 por um dia inteiro sem criar
   conversa nenhuma ([memória](../../../.claude/memory/verificar-pela-porta-de-producao.md)).
2. **Testar, não auditar.** Esta sessão provou de novo: o handoff dizia que a `0005` existia —
   ela existia no disco e **nunca tinha sido aplicada**. Só uma consulta ao banco mostrou.
3. **Negativo em massa é suspeito.** Falha de rede e "praça sem COD" são indistinguíveis
   ([memória](../../../.claude/memory/varredura-falso-negativo.md)). Toda varredura começa
   por um caso-controle conhecido-positivo.

---

## O mapa das plataformas

A regra que decide onde algo mora: **regra de negócio é código versionado com teste;
credencial, relógio e chamada HTTP são cano.** A arquitetura foi fixada na rodada 11 —
*Workflow + LLM com auto-reflexão*, sem tool-calling, sem RAG, Hermes offline.

```
  Meta Ads ──(CTWA, ctwaClid)──► WhatsApp Cloud API         ⚠ sem token ainda
                                        │ webhook de mensagem
                                        ▼
                         n8n (PikaPods) — cano e relógio
                         ├ HnGrxquQLpfbXWLH  turno      ⚠ falta o nó Wait de 2 min
                         ├ gS72LhYGOnmyALRq  venda
                         └ SVDtFUi2N9oOskkx  régua (cron 5 min)
                                        │
                                        ▼
                  Edge Function `turn` — v32 no ar, v33 pronta no disco
                  intenção (Gemini) → resposta (Muse) → 19 gates →
                  se vetou, reescreve → teto de custo → envia
                     │                  │                    │
                     ▼                  ▼                    ▼
              Supabase/Postgres    Logzz / Coinzz      Provedores LLM
              + stage  (novo)      COD / antecipado    Muse · Gemini
              + turn_outcomes      webhook de venda
                     │
                     ▼  (em lote, só com tráfego — R11.2)
              Evaluation (views SQL) ──► Hermes ──► hermes_proposals
                                                        │
                                          Sandbox = CI deste repo
                                                        │
                                              operador aprova (R11.6)
```

| Travessia | Onde se prova | Fase |
|---|---|---|
| Cloud API → n8n → função (um turno) | persona pela porta `n8n` | 3, 9 |
| n8n `Wait` → função com `resume: true` | lead sintético novo, pela porta `n8n` | 6 |
| função → Coinzz/Logzz (pedido) | pedido sintético nos dois caminhos | 5 |
| Coinzz/Logzz → n8n → `job: "order"` | payload real | 5 |
| cron n8n → `job: "followups"` → Cloud API | toque fora da janela de 24h | 8 |
| clique de anúncio → `leads.source` | clique real com `ctwaClid` | 8 |

---

## O estado em 2026-09-22

### Fechado hoje, com a prova

| Item | Prova |
|---|---|
| **A v32 no ar é o que o handoff diz** | Os nove arquivos baixados pelo MCP do Supabase são **byte a byte iguais** ao commit `b36087d`. Contra o disco de hoje, divergem `index.ts`, `followups.ts`, `retry.ts`, `availability.ts`, mais o `state-machine.ts` novo |
| **Nenhum lead trancado por `handoff_at`** | O banco de produção está **vazio**: zero leads, conversas, mensagens, pedidos, `llm_calls`, `gate_traces`. O `reltuples` estimava 2 conversas e 1 lead — houve dado e ele foi apagado, muito provavelmente a limpeza das sondas sintéticas |
| **Os cinco comandos canônicos verdes** | `pnpm test` (2835), `lint`, `typecheck`, `typecheck:function`. Ressalva: o container roda Node 22, o `package.json` pede 24 |
| **Achado A — o prompt lê o config** | `prepayPriceLine`, `prepayDiscountRule`, `freightBriefing` em `index.ts` (R11.9). No disco, não no ar |
| **Achado C — o funil** | `conversations.stage` com default `'novo'` e `check` contra os dez estágios; `furthest` no `state-machine.ts`, nono espelho |
| **Achado D — o desfecho do turno** | Tabela `turn_outcomes`, RLS ligado, as oito saídas do turno gravando |
| **Migrações `0005` e `0006` aplicadas** | Lidas de volta: `welcomed_at` existe, `stage` com default e `check`, `turn_outcomes` com as sete colunas e RLS, três índices. **A `0005` estava no disco desde 21/09 e nunca tinha sido aplicada** |
| **`freeShipping: false` no repositório inteiro** | Decisão do operador: a operação não oferece frete grátis. 18 testes inverteram; o ramo `true` continua coberto por `ctxGratis` |

### Três fatos que mudam a ordem

1. **Não existe baseline.** Com o banco vazio, toda afirmação "verificado em produção" do
   handoff foi com sonda sintética que já não está lá. Evaluation e Hermes antes de tráfego
   não teriam o que ler — confirma a R11.
2. **A v33 carrega seis mudanças de comportamento de uma vez**: modelo (Muse), régua de
   checkout de 15/30 min, recepção + timer de 2 min, prompt lendo config, fallback de frete,
   funil + desfecho. **O timer de 2 min é bloqueio duro:** sem o nó `Wait` no n8n, lead novo
   recebe a recepção automática e **nunca mais é respondido**.
3. **O advisor de segurança do Supabase** acusa `public.rls_auto_enable()` — função
   `SECURITY DEFINER` executável por `anon` e `authenticated`. Não está no repositório. É a
   função do gatilho `ensure_rls`, que **protege** (liga RLS em toda tabela nova do
   `public`); chamá-la por RPC falha, porque função de event trigger não roda fora de
   trigger. Risco real baixo, mas é drift entre banco e repositório.

---

## O caminho crítico: o que só o operador destrava

Nada nesta lista é código. Tudo nesta lista bloqueia alguma fase. **Ordenado pelo que
trava mais coisa.**

| # | O quê | Bloqueia | Por que só o operador |
|---|---|---|---|
| **O1** | **Apagar a chave `freeShipping` do secret `BUSINESS_CONFIG`** (decisão do operador, 22/09 — em vez de escrever `false`). Supabase → Edge Functions → Secrets → `BUSINESS_CONFIG`: remover `"freeShipping": true` e a vírgula, conferir que o JSON continua válido | deploy v33 | O secret não é legível nem gravável pela API (volta em hash). **Seguro em qualquer ordem:** a v32 lê ausente como grátis (`!== false`), igual ao `true` de hoje; a v33 lê ausente como não grátis (`=== true`). **Com a chave em `true`, a v33 promete frete grátis** — por isso trava o deploy |
| **O2** | **Nó `Wait` no workflow `HnGrxquQLpfbXWLH`** entre a resposta `status: "welcomed"` e uma segunda chamada com o mesmo payload mais `resume: true` | deploy v33 | O operador decidiu (22/09) que o agente faz. **Travado em acesso:** a senha do n8n no PikaPods foi perdida (reset pelo painel do PikaPods, não pelo n8n), e o MCP do n8n falha ao conectar (404). A API REST do n8n responde (`/healthz` 200, `/api/v1` 401) — com uma `N8N_API_KEY` no ambiente, vira tarefa do agente |
| **O3** | *(Decidido em 22/09: aplicar.)* Como variáveis do ambiente da nuvem (menu do ambiente na barra de título da sessão → Edit), **nunca coladas no chat**; uma sessão nova as recebe. Nomes: `GEMINI_API_KEY`, `META_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_API_KEY`. **Credenciais para rodar a função localmente**: `META_API_KEY`, chave Gemini, chave OpenAI, `SUPABASE_SERVICE_ROLE_KEY`, e o JSON do `BUSINESS_CONFIG` sem valores secretos | personas (fase 3), eval (fase 4) | Nenhuma delas existe neste ambiente. A `META_API_KEY` existe — mas no seu lado |
| **O4** | **PAT novo da API de gerência** | deploy v33 | Os dois anteriores foram revogados. A migração foi pelo MCP; o **deploy da função não cabe** no MCP (218 KB) |
| **O5** | **`payment_method` do COD na Coinzz** — **respondido em 23/09 com um achado:** o painel da oferta marca **"Na entrega (Cash on Delivery)"**, com logística OmniCash (Logzz), e **"Após a entrega (AfterPay)" desmarcado**. O `afterpay` que o config usa é, portanto, provavelmente o valor errado — e a API não lista nenhum valor para cash on delivery. **Hoje não faz efeito:** o pedido nasce pelo link de checkout, e nenhum workflow do n8n posta o corpo que o turno monta. Só volta a importar se o pedido por API for ligado — e aí o caminho é a **API da Logzz**, que cobre o pagamento na entrega (indicação do operador, 23/09), em vez do `payment_method` da Coinzz | pedido por API (fora do caminho atual) | O código recusa adivinhar, de propósito: o errado cria cobrança que a cliente não combinou |
| **O6** | **Colar o payload real da Coinzz** que já chegou (sem CPF/telefone reais — pode mascarar) | mapeamento (fase 5) | Ele está no e-mail ou no log de execução do n8n |
| **O7** | **Três URLs de obrigado** no painel da Coinzz | ensaio geral | Painel |
| **O8** | **Token da WhatsApp Cloud API** e **aprovação dos três templates** | canal (fase 8) | Meta Business, em andamento |
| **O10** | *(Decidido em 22/09: o agente faz, junto com O2, pela API do n8n — antes, confirmar se Coinzz e Logzz mandam header customizado; se não, segredo na query string.)* **Autenticar os webhooks do n8n** (`/encorpa-inbound` e `/encorpa-venda`) com segredo em header, e — quando o canal existir — verificar a assinatura `X-Hub-Signature-256` da Meta no nó de entrada | **tráfego real** (fase 9) | Achado **ALTO** da revisão de segurança de 22/09, **já existia antes da sessão**. Hoje os dois webhooks aceitam POST anônimo, e a URL está versionada neste repositório. Qualquer um pode postar com o telefone de uma cliente real: escreve na conversa dela, queima o teto de custo e dispara o handoff — que a tira da agente para sempre. No `/encorpa-venda`, forja pedido: mata a cobrança e arma o pós-venda. É cano, não regra de negócio, então mora no n8n. O MCP do n8n não conectou nesta sessão |
| **O9** | **Aquecer o número** — semanas de uso normal | tráfego pago (fase 9) | Calendário. **É o item de prazo mais longo do plano inteiro; se ainda não começou, comece hoje** |

---

## As dez fases

### Fase 1 — A verdade do estado ✅ quase inteira

| # | O quê | Estado |
|---|---|---|
| 1.1 | Diff da v32 no ar contra o `main` | ✅ idêntica ao `b36087d` |
| 1.2 | Cinco comandos canônicos | ✅ verdes |
| 1.3 | Leads trancados por `handoff_at` | ✅ zero — o banco está vazio |
| 1.4 | Ler o `BUSINESS_CONFIG` campo a campo | ⏳ **operador** — a fonte é a **cópia local do operador** ou o painel: pela API de gerência o valor volta hasheado e não é legível. Cola só os campos sem credencial |
| 1.5 | Inventariar os três workflows n8n | ⏳ bloqueado: MCP do n8n não conectou. Alternativa: operador exporta o JSON |
| 1.6 | **Novo:** decidir `rls_auto_enable()` — revogar `execute` de `anon`/`authenticated`, ou manter | ⏳ **operador** decide. **Parecer da revisão de segurança (22/09): revogar** — `revoke execute on function public.rls_auto_enable() from public, anon, authenticated;`. Não quebra o gatilho (o `EXECUTE` só é conferido ao criar o event trigger), o risco real hoje é quase nulo (função de event trigger não roda por RPC), e revogar não custa nada. Entrar como **migração versionada**, junto com a própria função e o `ensure_rls`, que hoje só existem no banco. Validar criando uma tabela descartável e lendo `relrowsecurity` |

---

### Fase 2 — Consertos de código antes do deploy

Tudo aqui é código, e tudo aqui o agente faz sozinho.

| # | O quê | Fechou quando |
|---|---|---|
| 2.1 ✅ | **FEITO em 22/09** — `src/agent/prompt.ts`, décimo espelho; texto gerado idêntico antes e depois (sha256 conferido em 6 configs); 49 testes, provados quebrando de propósito. **O prompt passa a ter teste.** Raiz do achado A: nenhum teste toca o texto que mais decide o comportamento. Extrair o montador do prompt de `index.ts` para um módulo espelhado, e testar que **toda frase que o prompt ensina passa a cadeia de gates**, nos dois ramos de `freeShipping` e com e sem desconto | O teste falha se alguém reintroduzir "frete grátis" fixo no prompt com `freeShipping: false`. Espelho preso pelo drift test |
| 2.2 ✅ | **FEITO em 22/09, e substituído no mesmo dia pela saída A (2.9, §R10.6).** **Saída C no `price_promise`** (era 3.2). A economia de R$ 12,99 só é citável com a ressalva de frete na mesma frase. O prompt já instrui isso (`freightBriefing`); **o gate ainda não cobra** | Três casos: com ressalva passa; sem ressalva veta; a ressalva não vira a única frase possível. Espelhado |
| 2.3 ✅ | **FEITO em 22/09** — 1,5 nos quatro lugares; `seam.test.ts` passou a derivar o teto em vez de codificar R$ 1,00. **Unificar `conversationCapBrl`** (era 3.3, achado B). O fallback da função, `tests/fixtures.ts` e dois harnesses de dev ainda dizem 0,8; a decisão R10.1 é 1,5 | Um número só no repositório, igual ao do secret (confirmado em 1.4) |
| 2.4 ✅ | **FEITO em 22/09** — e três prazos que contradiziam decisão firme corrigidos de passagem (o script pedia "3 a 10 dias úteis" no antecipado; o Áudio D prometia "três a cinco dias" no COD). **Varrer os documentos atrás de "frete grátis"** (era 3.4) — e agora com urgência: a decisão virou. `01-conhecimento/`, `06-script/`, `contexto-negocio/`. O "R$ 129,90 já inclui o frete" do COD continua **verdadeiro**; o "frete grátis nos dois" não | Cada ocorrência resolvida ou marcada como histórica, com a data |
| 2.5 | **Registrar `rls_auto_enable` no repositório** depois da decisão de 1.6 | O banco e as migrações voltam a concordar |
| 2.6 ✅ | **FEITO em 22/09.** **O dia da semana no fuso de São Paulo.** `followups.ts:371` e `:449` usam `now.getDay()` — fuso do runtime, UTC na Edge Function — com `BUSINESS_TZ` declarado no mesmo arquivo. Entre 21h e meia-noite em São Paulo, `silence_3` diria "Super Sexta" numa quinta. Mesma classe do bug do `firstReplyAt` (10/09). Mudo hoje só porque o cupom está inativo. Achado pela tarefa 8.1, **confirmado no código** | Teste com instante UTC explícito às 22h de São Paulo devolve o dia certo. Espelhado |
| 2.7 ✅ | **FEITO em 22/09.** **Falso positivo no `shipping_promise`.** "O frete não está incluído, mas o produto sai R$ 12,99 mais barato no antecipado" é vetado: `attributedToShipping` lê `frete … sai … R$` como valor de frete. A ordem que o prompt ensina (economia antes, ressalva depois) não é afetada. Achado pela tarefa 2.2 | A frase passa, e "o frete sai R$ 12,99" continua vetado |
| 2.8 | **O turno passa `paymentPath: "cod"` fixo para os gates** — em todas as quatro chamadas de `runGates` do `index.ts`, inclusive quando a conversa é sobre o antecipado (região sem COD). Todo gate que depende do caminho fica cego no antecipado: o `delivery_promise` julga prazo do antecipado como se fosse COD, e o `shipping_promise` não distingue "nenhum frete a mais na entrega" (verdade nos dois) de uma promessa de grátis. Achado na segunda passada do `/code-review` (22/09), quando a correção de um atalho que confiava em `paymentPath === "cod"` revelou que ele estava sempre ligado. A informação existe no turno: a consulta de região (`checkRegion`) sabe se o CEP tem COD | O gate recebe `prepay` quando a região da conversa não tem COD, com teste; e a regra para mensagem que compara os dois caminhos está escrita |
| 2.10 | **Só Meta (§R12.1, 23/09).** Tirar a chamada de intenção do Gemini do turno (`callGemini`, `index.ts`) — o resultado não decide nada e nenhum workflow do n8n o lê — e trocar o `geminiProvider` do runner de personas (`src/dev/persona-run.ts`) pelo `metaProvider`. Gate de Opus: toca a Edge Function | O turno não chama nenhum host além de `api.meta.ai` e do Supabase; `pnpm test`, `typecheck:function` e `dev:conversas` verdes; o runner roda só com `META_API_KEY` |
| 2.11 | **O host da Muse está errado (achado de 23/09).** `callMuse` (`index.ts`) e `src/llm/providers/meta.ts` chamam `api.llama.com`; a Muse Spark 1.3 é servida pela Meta Model API em **`https://api.meta.ai/v1/chat/completions`** ([docs](https://dev.meta.ai/docs/protocols/chat-completions)). **Com a v33 no ar como está, toda conversa cairia em handoff.** Junto: a Meta documenta a Muse como **modelo de raciocínio que sempre raciocina** (`reasoning_effort` aceita `minimal`…`xhigh`; `none` dá 400) — o comentário que diz o contrário cai, e o `max_tokens: 900` precisa ser medido na primeira chamada real (raciocínio pode comer o orçamento e devolver resposta vazia → handoff). Preço confere: US$ 1,25 / 4,25, cache US$ 0,15. **Não usar a variante `-contributor`** (US$ 0,10 / 0,20) em produção: ela cede prompts e respostas para treino da Meta — conversa de cliente tem nome, telefone e endereço (LGPD). Para as personas, que são sintéticas, é opção. **A troca de host foi barrada pelo modo automático em 23/09 — precisa de autorização do operador** | O drift test exige `api.meta.ai`; uma chamada real devolve texto não vazio com o orçamento escolhido |
| 2.9 ✅ | **RESOLVIDO em 22/09 pela saída A (`aa1c021`, §R10.6):** o `price_promise` veta o valor da economia em qualquer forma, nos dois ramos de `freeShipping`; o prompt ensina só o percentual; 6138 vereditos comparados, nenhum afrouxado. **Revisão independente em 23/09: aprovado, 0 frases liberadas que antes eram vetadas** (~2.330 frases × 6 cenários). **Resíduo, todo anterior à saída A e aceito:** a economia arredondada dentro de negação passa ("Não dá nem R$ 13 de diferença" — `guardrails.ts:477`, a negação isenta o laço de valores não configurados); por extenso ("doze reais e noventa e nove"); e separador exótico sem "R$" ("12 ,99", espaço de largura zero, dígitos de largura total). Nenhuma é saída plausível do modelo; a medição real é a das personas e do eval. O registro abaixo fica como histórico. **Risco residual dos gates de frete e economia — registrado ao fim de quatro rodadas de conserto em 22/09.** A regra de parada foi declarada antes da última revisão (só bloqueia mentira introduzida pela rodada), e foi cumprida: a última rodada fechou 8 mentiras e não abriu nenhuma, conferido por comparação de 5784 vereditos. **O que continua passando, e já passava antes desta sessão** (`b688479`): a economia dita com palavra de economia e um verbo de preço no meio — "Você economiza pagando só R$ 12,99", "Economizando fica R$ 12,99", "Com o desconto de antecipado sai R$ 12,99", "O colete com desconto de antecipado custa R$ 12,99" — e o exagero "economiza mais de R$ 12,99". Com `freeShipping: true` a checagem de economia-como-preço desliga (hoje o padrão é `false`). **Falsos positivos aceitos** (custam uma reescrita): "O desconto é R$ 12,99", "A economia no antecipado é de R$ 12,99", "A diferença entre as duas ofertas é de R$ 12,99", "desconto de até R$ 12,99", "o frete não vem incluso, é cobrado à parte". **A leitura que importa:** quatro rodadas mostraram que o número R$ 12,99 é difícil de proteger por regex — cada formulação nova de "economia" é uma superfície. **A saída A da Frente 4 (citar só o percentual, nunca a economia em reais) elimina a classe inteira**, e é decisão do operador. Enquanto isso, o briefing ensina a forma segura com exemplo literal, e a medição de verdade é a rodada de personas e o eval (fases 3 e 4), com o modelo real | Operador decide entre manter a saída C (economia em reais com ressalva) ou ir para a A (só o percentual). Se A: o `price_promise` passa a vetar o valor da economia em qualquer forma, e a classe inteira fecha |

---

### Fase 3 — As personas e o runner

| # | O quê | Fechou quando |
|---|---|---|
| 3.1 ✅ | **FEITO em 22/09.** **Doze agentes-persona** em `.claude/agents/persona-*.md`, `tools: []`, cada um com dor, objeção, gatilho, jeito de escrever e uma tentativa adversarial | Os doze arquivos passam o teste do espelho: lido sozinho, produz uma cliente reconhecível |
| 3.2 ✅ | **FEITO em 22/09** — 40 testes sem rede; sem credenciais, não rodou contra nada real. **Runner `src/dev/persona-run.ts` com três portas** — resolve o ovo e a galinha de testar código que ainda não está no ar: `local` (a função do **disco** servida por Deno, contra o banco de produção, com telefones sintéticos prefixados e limpeza no fim), `function` (a Edge Function no ar), `n8n` (o webhook de produção) | Uma conversa completa roda nas três portas. Na `n8n`, se o corpo voltar 200 sem criar linha em `conversations`, o runner **falha** |
| 3.3 ✅ | **Já existia** em `03-personas-de-teste-interno.md`. **Rubrica de falha** escrita antes de rodar: mentira · perda · atrito · custo · opt-out ignorado | Em arquivo, e cada persona declara o que caça |
| 3.4 | **Rodada 1 pela porta `local`**, contra a v33 do disco | Relatório: uma linha por persona, entrada concreta, classificação. Lido também em `turn_outcomes` e `stage` — é o primeiro uso real da instrumentação |
| 3.5 | Fechar os achados e **rodada 2** | Sem regressão; achados fechados ou aceitos pelo operador |

**Depende de O3.** Sem as credenciais, o runner é escrito e testado contra o simulador, mas
não roda contra modelo de verdade.

---

### Fase 4 — O eval de Muse Spark 1.3

| # | O quê | Fechou quando |
|---|---|---|
| 4.1 | **As doze personas contra a Muse Spark 1.3**, pela porta `local`. *(Até 23/09 era Muse contra `gpt-5.6-luna`; a OpenAI saiu do escopo — §R12.1.)* | Tabela por persona: taxa de fallback, reescritas por resposta, bloqueio por gate, custo por conversa, turnos até o link, contra a rubrica. **Nunca Intelligence Index** |
| 4.2 | Veredito escrito, com o ponto fraco nomeado: alinhamento de segurança da Meta em atendimento comercial | Uma frase de recomendação |
| 4.3 | **Operador decide** o modelo da v33 | Sobe com Muse, ou com `CONVERSATION_MODEL=gpt-5.6-luna` **e** o preço de Luna nas duas chaves |

**Isto só é possível agora** porque `turn_outcomes` existe: antes, a taxa de fallback — a
métrica que mais importa na comparação — não era gravada em lugar nenhum.

---

### Fase 5 — O pedido, dos dois lados

| # | O quê | Fechou quando |
|---|---|---|
| 5.1 | **Mapeamento da Coinzz contra o payload real** (depende de O6) | Cada campo que `job: "order"` lê tem origem nomeada no JSON real |
| 5.2 | **`payment_method`** (depende de O5) entra no `BUSINESS_CONFIG`, não no código | Confirmado em painel |
| 5.3 | Pedido sintético **COD** até a Logzz | Tamanho no complemento, `payment_method` certo, cancelado depois |
| 5.4 | Pedido sintético **antecipado**, forçado por região sem COD | `prepayOfferHash` (`offkw47x`), não o hash do COD |
| 5.5 | Régua de pós-pedido armada, de silêncio desarmada | Query em `followups` no mesmo `conversation_id` |
| 5.6 | Cancelar um pedido: **a régua inteira morre** | Nenhum `order_eve` para quem cancelou |
| 5.7 | Revarrer a cobertura (43 × 5), São Paulo/G primeiro | Tabela em `07-cobertura/` atualizada |
| 5.8 | **O webhook de venda escreve o estágio.** `job: "order"` recebe o status do pedido e hoje não toca `conversations.stage`: `em_rota`, `entregue_pago` e `recusado` **não são escritos por ninguém**. Mesmo `furthest`, mesmo espelho | Pedido sintético entregue leva a conversa a `entregue_pago`; cancelado leva a `recusado`. Sem isso o funil para em `pedido_criado` e a métrica que o operador compra — entregue e pago — não existe no banco |

---

### Fase 6 — O deploy v33

**Pré-requisitos duros:** O1 (secret), O2 (nó `Wait`), O4 (PAT), fase 2 inteira, e a decisão
de 4.3.

| # | O quê | Fechou quando |
|---|---|---|
| 6.1 | `pnpm test && pnpm typecheck && pnpm typecheck:function` | Verdes |
| 6.2 | **Deploy pela API de gerência, onze arquivos** (`state-machine.ts` e `prompt.ts` entraram em 22/09) — conferir `ls supabase/functions/turn/*.ts` antes; faltar um derruba o boot | Versão nova na listagem; o diff de 1.1 volta **vazio** |
| 6.3 | Sonda pelo **formato**, não pelo conteúdo (isolate quente por minutos) | — |
| 6.4 | **Lead sintético novo pela porta `n8n`**: recebe a recepção, e **dois minutos depois** recebe a Valen de verdade | As duas mensagens em `messages`; `welcomed_at` preenchido; `stage` saiu de `'novo'` |
| 6.5 | Os dois caminhos de preço | COD: R$ 129,90, 1 a 3 dias, "frete já está no preço". Antecipado: R$ 116,91, 10%, "varia por região, em média 5 dias úteis", frete calculado no checkout, **nunca "grátis"** |
| 6.6 | `turn_outcomes` e `stage` gravando em produção | Uma linha por turno da sonda; o estágio avança |
| 6.7 | As doze personas pela porta `n8n` | Sem regressão contra a rodada 2 |
| 6.8 | Revogar o PAT | Revogado |

---

### Fase 7 — O que a instrumentação passa a permitir

Entra **depois** do deploy e **antes** do tráfego, porque as personas da fase 3 já geram dado
suficiente para validar a forma — não para tirar conclusão.

| # | O quê | Fechou quando |
|---|---|---|
| 7.1 | **Views de Evaluation** (R11.3), só as que já têm dado: bloqueio por gate, reescritas por resposta, taxa de fallback, custo por conversa, funil por estágio | As views existem como migração e devolvem números coerentes com a rodada de personas |
| 7.2 | **Fato durável do lead** (R11.5): coluna `jsonb` em `leads` + extrator determinístico para medo declarado, evento, restrição | A persona Karol (some e volta) não é perguntada de novo sobre o que já disse |
| 7.0 | **Duas leituras que as views precisam respeitar** (segunda passada do `/code-review`, 22/09). (a) `turn_outcomes.cost_brl` é o custo **do turno** desde a correção de 22/09 — antes gravava o acumulado da conversa. Não há linha antiga misturada: a tabela tinha **zero linhas** na data da correção (a v32 no ar nunca gravou nela). (b) O opt-out de conversa já em `entregue_pago` ou `recusado` **não** vira `bloqueado` no estágio — `TRANSITIONS` não tem essa aresta, de propósito. **Conte opt-out por `leads.opted_out_at`, nunca por `stage`** | As views de 7.1 usam essas duas regras |
| 7.3 | **Piso de amostra** (`leads_seen`) escrito **antes** de olhar qualquer número real | Um número em documento, datado |
| 7.4 | **`perdido` quando a régua de silêncio termina sem resposta.** O sweep manda `silence_3` e ninguém marca a conversa como perdida | Uma conversa sintética que não responde aos três toques termina em `perdido` |

---

### Fase 8 — O canal (WhatsApp Cloud API)

Tudo abaixo de 8.3 prepara-se **antes** do token (O8) chegar.

| # | O quê | Fechou quando |
|---|---|---|
| 8.1 ✅ | **FEITO em 22/09** — `06-script/03-templates-meta.md`, os três passando nos 19 gates nas duas camadas. Redigir `silence_2`, `silence_3`, `order_eve` no formato da Meta, **revisados contra os gates** — e contra `freeShipping: false`: nenhum template promete frete grátis | Três textos aprovados pelo operador |
| 8.2 | Submeter à Meta | Aprovados |
| 8.3 | Declarar em `channel.templates` do `BUSINESS_CONFIG`, com a ordem dos placeholders | Um toque fora da janela sai como template |
| 8.4 | Ligar o envio: `bubbles`, `presenceRefreshes`, `firstReplyAt` | Mensagem real em bolhas |
| 8.5 | Contadores de pacing, retry por hora | O gate recusa o segundo toque do dia com contador real |
| 8.6 | **Atribuição CTWA**: clique de anúncio → `leads.source` com `ctwaClid` | Uma linha real |
| 8.7 | **Prender o texto aprovado na Meta ao `renderFollowup`.** Nada no código confere o template: o sweep roda `runGates` sobre o texto livre do `renderFollowup`, mas a cliente lê o texto **registrado na Meta**. A regra "mudou um, muda o outro" está só no documento. Achado pela 8.1 | Um teste falha se o corpo em `03-templates-meta.md` divergir do que `renderFollowup` escreve |
| 8.8 | **Opt-in para template de marketing** (regra da Meta). O código não confere opt-in antes de mandar `silence_2`/`silence_3`, que são `MARKETING`. Achado pela 8.1 | O envio de template de marketing exige opt-in gravado, ou é bloqueado |

`silence_3` fica mudo até o cupom existir na Coinzz — de propósito.

---

### Fase 9 — Ensaio geral e primeiros clientes

| # | O quê | Fechou quando |
|---|---|---|
| 9.1 | Doze personas **pelo WhatsApp de verdade** | As doze no app, não em `curl` |
| 9.2 | **Um pedido real, pago na porta** | Anúncio → conversa → checkout → entrega → webhook → pós-pedido |
| 9.3 | **Tráfego mínimo nas 22 praças com COD** | A cobertura de 5.7 vira segmentação |

---

### Fase 10 — Só depois de tráfego real

Nada aqui começa antes de 9.3 **e** de a amostra passar do piso de 7.3.

| # | O quê | Por que esperar |
|---|---|---|
| 10.1 | **Hermes offline** (R11.2): lê as views em lote, escreve em `hermes_proposals` com `evidence` e `leads_seen` | Com 30 conversas, toda taxa é ruído com cara de recomendação |
| 10.2 | **Fechar o loop no operador** (R11.6): proposta → CI → pull request → aprovação humana | Nunca aplicação automática. O secret já bloqueia isso fisicamente — não remova a barreira |
| 10.3 | **Veredito da spec de tools** — adotar ou arquivar | Decisão adiada pelo operador em 22/09 até haver dado |
| 10.4 | **Conversão de volta para o Meta** (Conversions API, onda A4) | Mora no repositório `encorpa-campanhas`; depende de pedido real |

---

## Ordem de execução

Ondas sob o [protocolo de ondas paralelas](../../../.claude/rules/parallel-subagent-driven-development.md).
Dentro de uma onda, nada colide em arquivo nem em dependência.

| Onda | Agente faz | Operador faz | Destrava |
|---|---|---|---|
| **A** ✅ | 2.1 · 2.2 · 2.3 · 2.4 · 2.6 · 2.7 · 3.1 · 3.2 · 3.3 · 8.1 — **toda feita em 22/09** | **O9 (aquecer o número)** · O1 · O2 · O3 · 1.4 · 1.6 | tudo |
| **A′** — correções da revisão | F1 gates · F2 estágio + chave do Gemini · F3 runner · F4 teste intermitente | — | B |
| **B** | 3.4 · 3.5 · 4.1 · 4.2 · 5.1 · 2.5 | O5 · O6 · O10 · 4.3 | deploy |
| **C** | 6.1 → 6.8 · 5.3 → 5.8 · 7.1 → 7.4 | O4 · O7 | canal |
| **D** | 8.3 → 8.6 · 9.1 | O8 · 8.2 | tráfego |
| **E** | 9.2 · 9.3 → fase 10 | — | — |

**Especialistas por fase**, pela tabela do [`CLAUDE.md`](../../../CLAUDE.md):

| Fase | Quem |
|---|---|
| 2 | `prompt-engineer` (2.1), `pricing-guardian` (2.2), `model-cost-governor` (2.3), `technical-writer` + `compliance-reviewer` (2.4), `security-reviewer` (2.5) |
| 3 | `conversation-designer` (personas), `backend-specialist` (runner), `test-engineer` (rubrica) |
| 4 | `model-cost-governor` |
| 5 | `workflow-architect`, `backend-specialist` |
| 6 | `backend-specialist`, `security-reviewer` antes, `test-engineer` depois |
| 7 | `backend-specialist` |
| 8 | `workflow-architect`, `conversation-designer`, `compliance-reviewer` |
| 10 | `model-cost-governor`, `technical-writer` |

---

## Critério de saída

Os primeiros clientes reais começam quando **todas** estas forem verdade ao mesmo tempo:

1. A v33 está no ar e o diff contra o `main` volta vazio.
2. O secret tem `freeShipping: false` escrito, e a sonda de 6.5 prova que a Valen não promete frete grátis.
3. O timer de 2 minutos funciona pela porta `n8n` com lead novo.
4. As doze personas rodam pela porta `n8n` sem achado de "mentira" nem opt-out ignorado.
5. `turn_outcomes` e `stage` gravam em produção.
6. O eval tem veredito escrito e o modelo no ar é o que o operador escolheu sabendo dele.
7. Um pedido sintético fechou nos dois caminhos com `payment_method` confirmado em painel.
8. Os três templates estão aprovados e declarados.
9. O número tem semanas de uso normal.

**Não é critério de saída:** Hermes, views de Evaluation, cupom, depoimentos, o M nas 19
praças, o veredito da spec de tools.

---

## O que este plano não cobre

- **O estoque do M fora de Minas** — pergunta para a Logzz, não código. A consulta nunca veta
  tamanho.
- **A Express (`deliverySameDay`)** — não está de pé em nenhuma praça.
- **Rotação de credenciais** (`service_role`, OpenAI, Gemini, Facebook) — higiene contínua,
  no `HANDOFF.md`.
- **O ambiente de dev em Node 22** quando o projeto pede 24 — funciona hoje, com aviso.
