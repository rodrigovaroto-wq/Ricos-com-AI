# Análise arquitetural e comercial — Malu (Encorpa) para tráfego frio de Meta Ads

> Somente análise. Nenhum arquivo do repositório foi alterado, nada foi commitado.
> Base: leitura do código em `95b8d70` (turn v15 no ar), docs, grafo §1–§68, auditorias reais,
> e leitura do código/JSON dos 12 projetos externos (11 lidos; o #10 é pago e veio vazio).
> **[inferência]** marca o que não foi medido.

---

## −1. Revisão das premissas (feita antes da entrega, contra o repositório e a produção)

**O que confere com o repositório:**
- O `origin/main` é `95b8d70`, igual à cópia analisada.
- Todas as branches remotas mais recentes estão **atrás** do `main`; nenhuma tem trabalho mais novo
  sem mesclar.

**A produção, lida só com SELECT no Supabase em 11/10:**

| Premissa | Antes | Real |
|---|---|---|
| Versão no ar | v15 | **v16**, publicada em 09/10 14:11 UTC. É a v15 com uma variável renomeada (PR #57); comportamento igual |
| Volume | — | **5 leads no total, 0 pedidos.** Estágios: 2 `tamanho_definido`, 2 `perdido`, 1 `conversando`. Última mensagem em 11/10 01:05 (uma conversa nova depois de 09/10, ainda não auditada) |
| Tokens da resposta | ~9–10 mil (estimativa) | **8.577 de entrada em média**, só **1.019 do cache (12%)**, 319 de saída |
| Custo da resposta | — | R$ 0,0044 por chamada |
| Intérprete | — | 1.078 de entrada, **355 de saída**: muito para um JSON pequeno, e em série com a resposta |
| Latência | não medida | **mensagem dela gravada → resposta gravada: p50 21 s, p90 41 s, máx. 63 s** (40 turnos, 10 dias). A pausa de digitação do n8n vem **depois** disso: o 1º balão ainda espera ~5–15 s. Percebido pela cliente ≈ **30–35 s no p50, ~55–60 s no p90** **[soma inferida]**. O 1º contato tem ainda 60 s fixos |
| `llm_calls.latency_ms` | — | vazio para `reply`, `rewrite` e `interpret`: confirma o item 3 da matriz |

**Decisões existentes que a primeira versão desta análise não citava:**
- **Juiz LLM ("juiz tipado / JEV") foi adiado duas vezes** (grafo §54 e a seção "Cortado do V1" do
  `09-pipeline`). O motivo: sem tráfego não há o que calibrar, e o juiz custaria na ordem da
  conversa. A §10 abaixo reabre isso **com outro motivo e outro uso**:
  - o juiz não é sobre as propostas do Hermes nem sobre conversa real;
  - é sobre a suíte sintética, onde não há tráfego por definição;
  - é calibrado por 20 conversas anotadas pelo operador, não por tráfego.

  Se o operador não aceitar, o eval funciona sem o juiz: comprador com propensão + placar
  determinístico + `runGates`. Fica mais pobre em naturalidade.
- **A higiene de provedores de dev foi cortada do V1 de propósito** ("não muda nada para a
  cliente"). A remoção de OpenAI, Gemini e `callLuna` (item 32) desce para a fase 5. Não é fase 1.
- **Templates e opt-in** estão no `BUSINESS_CONFIG` de produção (operador, 09/10), não no
  `business.example.json`. A régua fora da janela funciona em produção.

**Achado novo (conversa real de 09/10):**
- Uma recusa foi lida como "vou pensar".
- A resposta veio com a escassez ("restam 12 unidades… vale garantir o seu logo").
- A régua continuou depois de dois "não quero".

Ver **§18**. As seções **§18–§22** (achado novo, diagnóstico do tom robótico, humanização e
adaptabilidade, validação contra os 12 projetos, as mudanças que fazem a diferença e o roadmap
revisado) **substituem a ordem de prioridade da §15.J**.

**Efeito nas conclusões:** a ordem de prioridade não muda; a evidência fica mais forte.
- A latência de 21 s no servidor + digitação + 60 s no 1º contato é **medida**, não suposta.
- O cache de prompt quase não acontece: 88% do prompt é cobrado e processado como novo a cada
  chamada. Isso reforça o prompt por estágio (item 9) e o núcleo fixo **no começo** do prompt,
  com tudo o que muda no fim (hoje as diretivas já ficam no fim; falta investigar por que o
  cache da Meta pega só ~1 mil tokens).

---

## 0. Resposta curta

**A arquitetura mínima mais eficiente para vender é a que já existe, com menos por cima e três
coisas que faltam.** "O modelo só escreve texto; o código decide" (R11) está certo, e é
exatamente o padrão que o melhor projeto externo (Sagent) chegou sozinho. Nenhum dos 12 projetos
tem algo que o seu não tenha em versão mais robusta, exceto três ideias pequenas:

1. **Usar o anúncio de onde ela veio na primeira frase** (o `referral` é capturado e nunca lido no turno).
2. **Experimento por lead (braço A/B sorteado pelo telefone)** em vez de antes/depois por versão.
3. **"Passo atual" no prompt** (Zaip): mandar ao modelo só o bloco do momento da venda, não os 35 mil caracteres.

O que mais trava a venda hoje **não é copy, nem falta de tecnologia**. Em ordem de dinheiro:

1. **Integração quebrando em silêncio o pagamento na entrega.** Já aconteceu duas vezes: o cabeçalho
   XHR faltou de 24/09 a 07/10, e o CEP com hífen quebrou de 08/10 a 09/10. O COD é o caminho que
   converte tráfego frio, e nenhum alarme disparou.
2. **Velocidade no primeiro contato.**
   - Recepção automática em 1 s, que diz "uma de nossas atendentes" e manda a lead **para fora da
     conversa**, para o site.
   - Depois disso, 60 s de espera fixa.
   - Toda mensagem ainda espera mais 5 s fixos antes de qualquer coisa.
   - Pausa de "digitação" de 560 ms por palavra, em todo balão. Uma resposta de três balões
     cheios leva ~50 s **depois** que o modelo terminou.
3. **Atrito entre "quero" e o link.** A sequência é: CEP → duas opções → kit → nome → (e-mail) →
   CPF → link. São 5 a 7 trocas, para dados que o checkout da Logzz/Coinzz pede de novo de
   qualquer jeito.
4. **Margem que depende de recusa na porta e do mix COD/antecipado.**
   - Lucro por venda: COD R$ 16 contra antecipado R$ 44.
   - Cada ponto de recusa custa R$ 0,73 por venda COD.
   - O sistema mede "pedido criado"; o dinheiro está em "entregue e pago".
5. **Medição comercial cega.**
   - O Hermes não vê pedido.
   - O placar mede mecânica, não venda.
   - O teste de L3 (~470 leads) não tem poder estatístico para comparar versões da agente.

O que sobra de complexidade sem retorno comercial agora:
- o caminho de autoimplementar e autopublicar do Hermes;
- código morto: OpenAI/Gemini, `jobs`, o gate `pacing`, o corpo de pedido da Coinzz, estágios
  inalcançáveis;
- a escassez "restam 12 unidades" sem contagem real por trás;
- uma parte da gordura do prompt.

---

## 1. O sistema atual — como uma conversa percorre o sistema

```
Meta CTWA (anúncio) ─► WhatsApp Cloud API
  ─► Edge Function `whatsapp`
       HMAC → 200 imediato → waitUntil:
       tique azul em 2 s ∥ áudio (Opus WASM → muse-voice, ≤25 s) ∥ imagem (visão, ≤30 s)
       → selo HMAC
  ─► n8n "Turno da agente"
       POST /turn, timeout 150 s, retry 1×
  ─► Edge Function `turn` (4.036 linhas)
       selo → dedupe → lead/conversa
       → lead novo: RECEPÇÃO FIXA (sem LLM), n8n espera 60 s, resume
       → cancela a régua → touch_retention → lê 20 msgs → DORME 5 s (2 s em rajada) → lê de novo
       → trava `replying_since` → opt-out (determinístico) → teto de custo
       → "paguei" / "ok" sozinho (texto fixo)
       → LLM 1: INTÉRPRETE (JSON, 3,3 mil caracteres de sistema)
       → extratores determinísticos (tamanho, CEP, identidade, kit, escolha de pagamento)
       → ViaCEP + Coinzz cobertura (em TODO turno com CEP guardado)
       → saídas fixas (link, "vou pensar", saudação)
       → LLM 2: RESPOSTA
            prompt de ~35 mil caracteres (~6,5 mil palavras), incluindo ~6,9 mil de briefing de gate
            + 20 mensagens
       → 28 gates → veto → reescreve (até 2×) → falhou: resposta pronta ou handoff
       → grava → arma a régua → turn_outcomes / gate_traces / llm_calls / stage
  ─► n8n "WhatsApp envio": 1 balão por vez, espera min(25 s, palavras × 0,56 s) antes de cada um
  ─► n8n "Relógio da régua" (5 min) → /turn {job: followups}
  ─► n8n "Venda confirmada" (Logzz/Coinzz) → /turn {job: order} → stage, pós-venda
  ─► GitHub Action Hermes (diária, roda a cada 50 leads)
       → propostas → Rotina do operador → Claude implementa → deploy-hermes publica
```

**Persistido:**
- `leads`: telefone, tamanho, endereço/CEP com `codAvailable`, identidade, kits, escolha de
  pagamento, `source` (CTWA: `ctwa_clid`, `source_id`, `headline`), opt-in/out, handoff.
- `conversations`: estágio, custo, `entry_at`, `welcomed_at`.
- `messages`, `orders`, `followups`, `llm_calls`, `gate_traces`, `turn_outcomes`.
- Hermes: `hermes_*`, `agent_versions`.
- Views de avaliação: `eval_funnel`, `eval_attribution`, `eval_turn_outcomes`, `eval_gate_blocks`,
  `eval_conversation_cost`, `eval_version_outcomes`.

**Calculado em tempo real:**
- tamanho, pela tabela de `sizing.ts`;
- cobertura COD e datas, pela Coinzz;
- link pré-preenchido;
- o que falta para o link (`missingForLink`);
- os vetos;
- o estágio (`reachedStage`).

**Chamadas de LLM por mensagem:**
- **Típico: 2** (intérprete + resposta).
- Com vetos: até 4.
- Com revisão (ela escreve enquanto a Malu escreve): até 12 no pior caso.
- Mais 1 por áudio ou imagem.

**Custo real medido:**
- Com o modelo `-contributor`: R$ 0,05 a 0,08 por conversa real (L2).
- Com o modelo padrão: p50 R$ 0,27, p95 R$ 0,55.
- **Custo de modelo não é o gargalo. Latência e conversão são.**

### Gargalos de latência (ordem de impacto)

| # | Onde | Quanto | Valor comercial |
|---|---|---|---|
| L1 | Recepção fixa + espera de 60 s em lead novo (`WELCOME_RESUME_DELAY_SECONDS`) | 60 s no momento de maior intenção | Negativo: a recepção manda a lead pro site e diz que uma "atendente" vem aí |
| L2 | Pausa de digitação por balão, inclusive o 1º (`MS_PER_WORD` 560, teto 25 s/balão no n8n) | ~15 s por balão de 30 palavras; ~50 s em 3 balões | Incerto. Parecer humano em 50 s é pior que responder em 10 s **[inferência]** |
| L3 | Sono fixo de 5 s (`QUIET_WINDOW_MS`) antes de tudo | 5 s | Positivo: junta a rajada (§59). Ajustar, não remover |
| L4 | Intérprete e resposta em série | +2–8 s **[inferência; latência de turno não é gravada]** | Positivo: R13 nasceu de regex que falhava |
| L5 | ~25–35 idas sequenciais ao PostgREST; as mesmas 20 mensagens lidas 3×; `touch_retention` reescreve todas as mensagens do lead a cada turno | ~1–3 s **[inferência]** | Nenhum |
| L6 | ViaCEP + Coinzz em **todo** turno com CEP guardado (timeout de 10 s cada) | 0,5–2 s por turno | Nenhum depois do primeiro |
| L7 | Cada reescrita reenvia ~35 mil caracteres + histórico | +1 chamada inteira | Positivo (segurança), mas o custo cresce com o tamanho do prompt |

**Não há latência de turno gravada** (`llm_calls.latency_ms` nunca é escrito pela `turn`). Sem
isso, nenhuma decisão de velocidade é científica.

### Desperdício de tokens

- **Prompt de ~35 mil caracteres por chamada de resposta.** Cerca de 20% é o briefing dos gates.
  Boa parte é regra de nicho: loja física, CNPJ, troca, kit, áudio, imagem, concordância nominal.
  Essas regras só valem em 1 ou 2 turnos da conversa, mas vão em todos.
- **O intérprete é pago mesmo quando a saída é fixa** (link, "vou pensar", saudação).
- **Campos do intérprete que ninguém lê** (`opt_out`) ou que regex já deriva.
- **Com o `-contributor`, o token é quase de graça.** Então o problema do prompt grande não é
  custo. É **atenção do modelo**: regra demais compete com regra, e o modelo esquece a que importa
  naquele turno. É o mesmo argumento do "step packet" do Zaip.

### Complexidade sem valor comercial claro

- **Código morto:**
  - `callLuna`/OpenAI e o bloco de troca de modelo por env;
  - Gemini e OpenAI em `src/llm/providers`;
  - tabela `jobs` e `claim_jobs()`;
  - o gate `pacing` (o contexto nunca é passado);
  - `interpretation.opt_out`;
  - `pacing.ts` `firstReplyAt` / `presenceRefreshes`;
  - `buildCoinzzRequest` e os campos `order*` / `address*` / `identity*Missing` da resposta, sem
    consumidor no n8n;
  - `checkRegion`, `routeFor`, `hasPendingCod`;
  - `src/order/checkout.ts`, `src/channel/simulated.ts`;
  - `SAFE_FALLBACK_REPLY` em produção;
  - o ramo `markRead` do n8n.
- **Estágios inalcançáveis pela conversa:** `endereco_coletado` e `pedido_criado` vindos do turno.
  A Malu não pede endereço, então o funil grava `tamanho_definido` e pula para o webhook.
  **Isso cega o funil exatamente entre "quis comprar" e "comprou".**
- **Caminho de autoimplementar e autopublicar do Hermes** sem nenhum lead real (ver §12).
- **`src/llm/seam.ts`:** existe e é testado, mas a produção não o usa. São dois seams.

---

## 2. Produto × funil de tráfego frio — o que realmente importa

**Quem chega:** mulher de 20 a 50 anos, vinda de um vídeo de Instagram, que nunca ouviu falar da
Encorpa.
- O medo dominante **não é preço, é golpe** (`02-publico-e-jornada.md`).
- Ela chega com uma pergunta, quase sempre "quanto custa?", "como funciona?" ou "serve em mim?".
- A intenção dela decai em minutos, não em horas.

**O que o produto oferece contra cada objeção** (e o sistema já usa tudo isso):

| Objeção de tráfego frio | Arma que existe | Onde está hoje |
|---|---|---|
| Golpe | **Pagar na entrega**, onde chega + 7 dias pra devolver | Reversão de risco no prompt; gate de cobertura |
| Eficácia ("funciona?") | Modela na hora, não emagrece; honestidade como argumento | Prompt, `weight_loss_claim` |
| Tamanho | Uma pergunta (número da calça) → tabela determinística | `sizing.ts`, diretiva de tamanho |
| Preço | Âncora R$ 216,50 → R$ 129,90; antecipado −10%; kits | `priceBeforeCepMessage`, kits |
| Qualidade | Material, sem barbatana, 500+ clientes | `productFacts`, `socialProof` |
| Entrega | 1–3 dias no COD, no dia que ela escolhe | Duas opções após o CEP |

**Conclusão comercial:** para este produto, a venda se decide em **três momentos**:

1. **Os primeiros 2–3 minutos.** Respondeu rápido, pelo nome do que o anúncio mostrou? Deu o
   preço sem fazer a cliente pedir duas vezes?
2. **O momento do CEP.** "Aí chega e você só paga quando receber" é o fecho natural. É também
   onde dois bugs de integração já mataram a venda.
3. **O trecho entre o "quero" e o checkout.** Cada pergunta a mais é saída.

Descoberta longa ("qual roupa você deixou de usar?") **ajuda no meio**, quando ela hesita.
**Atrapalha no começo**, quando ela só quer o preço **[inferência — é a primeira hipótese a
testar]**.

**O que mais pesa no dinheiro depois da venda:**
- **Recusa na porta.** São 12–17%, especulados, e cada uma custa R$ 9,99 + o lead.
- **Mix de pagamento.** O antecipado dá 2,8× mais lucro por venda.

O agente "perfeito" para este negócio **não maximiza pedido criado**. Ele maximiza:

> entregue_pago × margem − recusa

Isso muda o que a agente deve fazer no fim da conversa:
- confirmar o dia em que ela vai estar em casa (já existe);
- mostrar o antecipado sem empurrar (já existe, como duas opções);
- não forçar o COD em quem demonstrou dúvida grande **[hipótese]**.

---

## 3. Os 12 projetos — avaliação crítica

> Achado transversal: **nenhum dos 12 tem eval, nenhum trata pagamento na entrega, só um lê o
> anúncio, e quatro templates do n8n não rodam como publicados** (nós vazios, referências
> quebradas). O seu repositório está à frente de todos em correção e segurança. O que vale
> extrair é pouco e pequeno.

### 1. Zaip (davidalpa/zaip_ai_opensource) — Supabase Edge + Cloud API + funil SPIN de 14 passos
- **A. Faz bem:**
  - "Step packet": só o passo atual (slots, scripts, regras de extração) vai pro modelo.
  - Scripts literais com RETRY_1..5 / SKIP / STOP, contra loop.
  - Distingue `null` ("pergunte de novo") de `"indefinido"` ("desistiu, siga").
  - Debounce de 5 s no banco.
- **B. Resolve:** previsibilidade num funil B2B longo.
- **C. Interessa:** o step packet e o "indefinido".
- **D. Desnecessário:** os 14 passos de qualificação SPIN (B2B), os stickers de estágio, o
  OpenAI Conversations (que acumula o prompt) e o RAG via MCP.
- **E. Converte mais:** prompt menor e focado no momento.
- **F. Converte menos:**
  - "ALWAYS BE CLOSING";
  - urgência inventada ("os preços estão para aumentar");
  - script literal que soa robô;
  - qualificação longa antes do preço.
- **G. Latência:** sono de 5 s (igual ao seu).
- **H. Custo:** o prompt acumula na Conversation.
- **I. Fragilidade:**
  - o modelo executa a máquina de estados em linguagem natural;
  - o regex lê slots do markdown;
  - `#LIMPAR` aberto a qualquer cliente;
  - não tem handoff nem follow-up.
- **J. Aproveitar direto:** nada.
- **K. Adaptar:** o step packet → **montar o prompt por estágio** (§13).
- **L. Não implementar:** script literal, closing push, SPIN e o modelo decidindo a transição.
- **M. Estágio do funil:** todos (forma do prompt).

### 2. Sagent (ukimsanov/sagent) — Cloudflare Workers, e-commerce, 1 agente com saída estruturada
- **A. Faz bem:**
  - "LLM decide o que dizer, código decide o que fazer": saída Zod + executor por níveis.
  - Quando o catálogo não acha nada, **descarta o texto do modelo** e monta a resposta do banco.
  - Uma chamada só por mensagem (sentimento junto).
  - Memória resumida com interesses, objeções e próximos passos.
  - Chave de cache de prompt.
- **B. Resolve:** alucinação de catálogo multiproduto.
- **C. Interessa:**
  - **uma chamada só** (fatos + mensagem num JSON);
  - resposta montada pelo código quando o fato não existe;
  - o quebra-loop de pergunta de esclarecimento.
- **D. Desnecessário:** vetor de catálogo (você tem 1 produto), multi-tenant, dashboard, D1/DO e
  resumo noturno.
- **E. Converte mais:** latência menor (1 chamada); botões/lista com opções verificadas
  (P/M/G…, "na entrega"/"antecipado").
- **F. Converte menos:** nada específico.
- **G/H.** Menos que o seu.
- **I. Fragilidade:**
  - lead scoring incoerente: três sistemas, e o de intenção nunca dispara (bug de chave);
  - não tem debounce;
  - o follow-up conta a janela de 24 h a partir da mensagem do bot;
  - o handoff não pausa a IA;
  - o teste é placeholder.
- **J. Aproveitar:** nada direto.
- **K. Adaptar:** (a) **testar** fundir intérprete e resposta num JSON único; (b) **botões
  interativos** de tamanho e de pagamento.
- **L. Não implementar:** o score deles e RAG de catálogo.
- **M.** Meio e fim do funil.

### 3. sial-sanwal/ai-whatsapp-sales-agent — FastAPI + Twilio + GPT-4o, imobiliário
- **A.** Extração por regex + "INTERNAL CONTEXT" com "falta coletar: …" num system separado.
- **B.** Qualificação de lead para corretor.
- **C. Interessa:** dizer ao modelo explicitamente o que falta. Você já faz isso
  (`missingForLink`, diretivas).
- **D. Desnecessário:** todo o resto.
- **F. Converte menos:** "Create FOMO naturally: 3 new listings this morning" (inventado);
  "assume the sale".
- **I. Fragilidade:**
  - "Hi there" vira o nome da cliente;
  - pede o telefone pelo WhatsApp;
  - TwiML sem escape;
  - endpoints de lead sem auth.
- **J/K.** Nada.
- **L.** Score de completude como "lead quente": completude não é intenção.

### 4. MOEM96/whatsapp-leads-ai-agent — 1 workflow n8n, serviços
- **A. Faz bem:**
  - HMAC com comparação em tempo constante;
  - dedupe por `wamid`;
  - **handoff real que pausa a IA naquele contato** + Slack + tarefa;
  - follow-up que **respeita a janela de 24 h** (texto livre dentro, template fora);
  - **um empurrão só**.
- **C. Interessa:** a disciplina de um toque único. Você já tem tudo isso, e mais.
- **I. Fragilidade:**
  - lê `.first()` e perde mensagens múltiplas;
  - estado em static data;
  - qualquer mensagem nova desfaz o opt-out (ilegal no seu caso);
  - prompt opaco.
- **J/K.** Nada novo. **L.** Opt-out reversível por qualquer mensagem.

### 5. n8n #2465 — chatbot iniciante, agente + vetor em memória
- **Tudo desnecessário.**
- RAG de PDF em memória (some no restart); o próprio prompt diz "não é para vender".
- Comercialmente irrelevante.
- **L.** RAG (R11.4 continua certo).

### 6. n8n #13220 — móveis, GPT-4.1-mini + Supabase pgvector + tabela de estoque + SerpAPI
- **A.** Pergunta uma coisa por vez; template de resposta por produto (preço, estoque, link,
  pergunta).
- **F. Converte menos:** prazos de entrega fixos por DDD, que contradizem o próprio "nunca
  adivinhe"; busca na web responde fora do catálogo.
- **H. Custo:** a ferramenta de estoque devolve a **tabela inteira** em toda consulta.
- **I.** Áudio é "traduzido", não transcrito.
- **J/K/L.** Nada; confirma que tool-calling livre abre a porta para alucinação (R11.1 certo).

### 7. n8n #6529 — Meta **Lead Ads** → Twilio WhatsApp "confirma sim/não" → Gemini → Zoho
- **A.** É o único que toca anúncio da Meta, mas é Lead Ad (formulário), não CTWA.
- **C. Interessa:** a ideia de **verificar a intenção logo após o clique**. No seu caso, isso já
  é o próprio CTWA: ela escreve primeiro.
- **I. Fragilidade:**
  - referências a nós inexistentes (não roda);
  - polling repete o lead;
  - mensagem ativa sem template (a Meta bloqueia);
  - token na URL.
- **L.** Lead Ads + verificação: outro produto de anúncio, mais caro em atrito para quem já está
  no WhatsApp.
- **M.** Topo, irrelevante para CTWA.

### 8. n8n #15621 — BANT + Sheets + Calendar
- **A.** Tags `[budget_confirmed]` no texto para pontuar.
- **I.**
  - O nó de intenção está **vazio**, então a maioria das mensagens fica sem resposta.
  - As tags nunca são pedidas, então o score fica sempre 0.
  - `append` em vez de upsert.
  - Agenda reunião às 10 h de NY sempre.
- **L.** BANT. Venda B2C de R$ 130 não tem "Budget/Authority/Timeline" a qualificar; qualificar
  aqui é atrito.

### 9. n8n #17106 — vendas + Pinecone + Calendar + Slack
- **A. Interessa:** `HANDOFF:true` no fim → o humano recebe **o rascunho da resposta** junto do
  alerta.
- **I.** No handoff a cliente fica **sem resposta** e a IA não pausa; o modelo não sabe a data.
- **K. Adaptar:** e-mail de handoff com o rascunho vetado + o motivo. Você já manda briefing; o
  rascunho é barato de acrescentar **[confirmar o que o e-mail já leva]**.
- **L.** Pinecone e Calendar.

### 10. n8n #4083 — multicanal + Airtable + Supabase (pago, parâmetros vazios)
- **Avaliável só pela lista de nós:** agente GPT-4o com 2 ferramentas de vetor ("conhecimento
  técnico e de venda", "técnica de venda") e sub-agentes de CRM e de agenda. São 2 a 4 chamadas
  por mensagem.
- **L.** Multicanal (FB/IG): fora do seu funil CTWA; "técnica de venda" em vetor = RAG de
  manual de vendas, que é prompt mal posto.
- **M.** Nenhum.

### 11. n8n #5449 — scraping do Google Maps + WAHA + prospecção fria
- **Outbound frio para número raspado.** Proibido para o seu caso: política da Meta, LGPD e
  risco de banimento do número oficial.
- O agente WAHA recebe o **ID** da mensagem como texto; nada está ligado ao envio.
- **L.** Tudo.

### 12. n8n #13723 — WATI + Airtable + OpenAI, nutrição com A/B
- **A. Interessa:** **estrutura de experimento** — variante sorteada por contato, gravada em
  cada envio, conversão atribuída por variante, relatório A × B.
- **I.**
  - Nós de OpenAI sem corpo (não roda).
  - Airtable lê bases em vez de registros.
  - Sem janela de 24 h.
  - **Declara vencedor sem teste de significância.**
  - Qualquer contato pode mandar o comando `report`.
  - Sem teto de toques.
- **K. Adaptar:** **variante por lead** (você já tem `pickVariant` por hash na régua) +
  atribuição + teste de duas proporções com o piso de `08-piso-de-amostra.md`.
- **L.** Nutrição de 3 em 3 dias sem teto; declarar vencedor sem amostra.

---

## 4. Matriz de decisão

Legenda: **AGORA** = implementar agora · **DEPOIS** · **TESTAR** · **NÃO** = não implementar ·
**REMOVER** = tirar do sistema atual.

### Melhorias

| # | Ideia | Fonte | Benefício esperado | Conversão | Latência | Custo | Complexidade | Decisão |
|---|---|---|---|---|---|---|---|---|
| 1 | **Alarme de cobertura**: cron consulta 3 CEPs que sabidamente têm COD; falhou → e-mail + página. Falha de consulta nunca vira "sem COD" | Seu grafo §66/§67 | Evita repetir os dois bugs que tiraram o COD de todas | **Muito alto** | 0 | ~0 | Baixa | **AGORA** |
| 2 | Corrigir **retry do n8n → "duplicate" → resposta paga e nunca enviada** | Auditoria do runtime | Nenhuma cliente sem resposta depois de timeout | Alto | 0 | 0 | Baixa | **AGORA** |
| 3 | **Gravar a latência do turno** (`llm_calls.latency_ms` + duração do turno em `turn_outcomes`) | Lacuna | Sem isso, nenhuma decisão de velocidade é medida | Indireto | 0 | 0 | Baixa | **AGORA** |
| 4 | **Recepção automática**: tirar "uma de nossas atendentes" e o envio pro site; trocar por uma frase curta e verdadeira, ou nada | Seu teste L2 + Sagent | Não tira a lead da conversa no pico de intenção; para de prometer humano | Alto **[hipótese]** | — | 0 | Baixa | **AGORA** (texto; decisão do operador, D8) |
| 5 | **Primeira resposta de verdade em ≤ 15 s** (hoje 60 s) | Speed-to-lead; Zaip/Sagent 1–4 s | Tráfego frio decai em minutos | Alto **[hipótese]** | −45 s | 0 | Baixa | **TESTAR** (braço A/B, §11) |
| 6 | **Pausa de digitação**: 1º balão ≤ 3 s, demais ≤ 6 s, total ≤ 12 s | Sagent (teto 1,5 s), Zaip (1–4 s) | Resposta chega antes de ela trocar de app | Médio–alto **[hipótese]** | −30 a −40 s | 0 | Baixa | **TESTAR** |
| 7 | **Usar o anúncio** (`leads.source.headline`/`source_id`) na diretiva do 1º turno: "ela veio do anúncio X, que mostra Y" | Lacuna (nenhum dos 12 faz) | Abertura no assunto dela, sem "como posso ajudar?" | Médio | 0 | ~0 | Baixa | **AGORA** |
| 8 | **Link logo após a escolha do pagamento** (tamanho + CEP + caminho), pré-preenchido com o que já se sabe; nome e CPF ficam no checkout | Atrito medido nos testes reais | Corta 2 a 3 trocas no trecho mais caro da conversa | **Alto [hipótese]** | — | — | Baixa | **TESTAR** (A/B contra o atual; reabre decisão §62/§63, ver §9) |
| 9 | **Prompt por estágio** ("step packet"): núcleo fixo (~8–10 mil caracteres) + o bloco do momento (antes do CEP / opções / dados / pós-link / objeção ativa) + só os briefings dos gates que podem disparar naquele estágio | Zaip | Modelo segue melhor as regras que importam agora; reescritas caem | Médio | −1–3 s | −60% de tokens | Média | **DEPOIS** (com o eval da fase 3 rodando antes e depois) |
| 10 | **Uma chamada só** (fatos + mensagem num JSON) no lugar de intérprete + resposta | Sagent | −1 chamada em série | Neutro a médio | −2–6 s **[inferência]** | −30% | Média–alta | **TESTAR**, só depois do eval (R13 criou o intérprete por uma razão; ver §13) |
| 11 | Cache de `codAvailable` / datas por CEP (TTL de 1 h) | Lacuna | Tira ViaCEP + Coinzz de todo turno | Neutro | −0,5–2 s | 0 | Baixa | **AGORA** |
| 12 | Ler as 20 mensagens uma vez; `touch_retention` só 1×/dia | Lacuna | Menos idas ao banco | Neutro | −0,5–1 s | 0 | Baixa | **DEPOIS** |
| 13 | **Botões interativos** do WhatsApp para o tamanho (P…XGG / "não sei") e o pagamento ("Na entrega" / "Antecipado") | Sagent | Menos digitação, menos erro de leitura | Médio **[hipótese]** | 0 | 0 | Média (canal + parser) | **TESTAR** |
| 14 | **Lead score determinístico, só para decisão** (§8) | Sagent / MOEM96 (como contraexemplo) | Priorizar handoff, decidir follow-up e risco de recusa | Médio | 0 | 0 | Baixa | **DEPOIS** (com dado real; hoje é chute) |
| 15 | **Experimento por lead** (braço = hash do telefone, gravado em `leads`/`turn_outcomes`) | #13723 + seu `pickVariant` | Comparação concorrente, sem confundir com troca de criativo | Indireto, alto | 0 | 0 | Baixa | **AGORA** (a infraestrutura; os testes entram um de cada vez) |
| 16 | **Eval comercial sintético**: cliente sintético com propensão oculta + juiz com rubrica + "comprou?" simulado | Nenhum dos 12 tem | Mede venda sem o operador conversar | Indireto, alto | — | ~R$ 1–3 por rodada **[inferência]** | Média | **AGORA** (fase 3) |
| 17 | Hermes recebe `orders` / `eval_funnel` (H4) | Seu plano | Hermes passa a ver venda | Indireto | — | — | Baixa | **AGORA** |
| 18 | Medir recusa por perfil de conversa (objeção de golpe, CEP novo, tempo até o link) | Economia COD | Identificar onde o COD está criando recusa | Margem | — | — | Baixa (view) | **DEPOIS** (precisa de ~100 pedidos na porta) |
| 19 | E-mail de handoff com o rascunho vetado + o motivo | #17106 | Operador responde em 1 clique | Baixo–médio | — | — | Baixa | **DEPOIS** |
| 20 | Conversions API (Purchase com `ctwa_clid`) | Seu plano L4 | Meta otimiza para comprador, não para quem conversa | **Alto, no CPA** | — | — | Média (outro repositório) | **DEPOIS** (ver §15, o maior alavancador fora da conversa) |

### Recusadas

| # | Ideia | Fonte | Benefício esperado | Conversão | Latência | Custo | Complexidade | Decisão |
|---|---|---|---|---|---|---|---|---|
| 21 | RAG / vetor de catálogo / Pinecone | #2465, #13220, #17106, #4083, Zaip | 1 produto, base cabe no prompt | Negativo (modo de falha novo) | + | + | Alta | **NÃO** |
| 22 | Tool-calling livre / agente com ferramentas | Todos os n8n | — | Negativo (R11.1) | + | + | Alta | **NÃO** |
| 23 | Multi-agente (pré-qualificador → qualificador → closer) | Zaip, #4083 | — | Negativo: mais saltos, mais latência | ++ | ++ | Alta | **NÃO** |
| 24 | Qualificação BANT / SPIN antes do preço | #15621, Zaip | — | **Negativo** em B2C de R$ 130 | — | — | — | **NÃO** |
| 25 | Urgência ou FOMO inventado, "always be closing" | Zaip, sial | — | Curto prazo +, recusa e confiança − ; CDC art. 37 | — | — | — | **NÃO** |
| 26 | Vector store de memória / resumo longo | Sagent | Conversa dura < 1 h; 20 mensagens bastam | Neutro | + | + | Média | **NÃO** |
| 27 | Lead Ads com verificação no WhatsApp | #6529 | CTWA já faz melhor | Negativo | — | — | — | **NÃO** |
| 28 | Outbound frio para número raspado | #5449 | — | Ilegal / banimento | — | — | — | **NÃO** |
| 29 | Multicanal FB/IG DM | #4083 | Fora do funil | — | — | — | Alta | **NÃO** (por ora) |
| 30 | Hermes dentro do turno | — | — | — | ++ | ++ | — | **NÃO** (R11.2 certo) |

### Remover do sistema atual

| # | Ideia | Por quê | Decisão |
|---|---|---|---|
| 31 | **Escassez "restam 12 unidades"** (`allowUnverified: true`) | Não tem contagem real por trás, contradiz "só fala verdades" e é exatamente o que o operador recusou em R13.6 pelo CDC | **REMOVER** (decisão do operador) |
| 32 | `callLuna`/OpenAI, Gemini, troca de modelo por env, `jobs`, gate `pacing`, `buildCoinzzRequest` e campos de resposta sem consumidor, helpers de teste, ramo `markRead`, `SAFE_FALLBACK_REPLY` | Código morto aumenta a superfície e a confusão (o seam de produção ≠ `src/llm/seam.ts`) | **REMOVER** |
| 33 | Autoimplementar e autopublicar do Hermes (IMPLEMENTAR.md + deploy-hermes.yml) | Ver §12 | **REMOVER / congelar** até ≥ 1.000 leads reais |
| 34 | Estágios `endereco_coletado` / `pedido_criado` que o turno não alcança | Trocar por estágios que a conversa realmente atravessa (§6) | **REFACTOR** |

---

## 5. Diagnóstico do sistema atual (Blueprint A)

### O que está bom — KEEP

- **R11 inteiro:**
  - o modelo só escreve;
  - gate → reescrita;
  - nada de RAG nem tool-calling;
  - Hermes fora do turno;
  - humano no fim do loop.

  É a decisão mais certa do repositório. O Sagent, o único projeto externo sério, chegou ao
  mesmo lugar.
- **Prompt e gate como "a mesma promessa escrita duas vezes",** com `tests/prompt.test.ts`. Isso
  protege contra a pior perda do COD: prometer o que a porta cobra.
- **Tamanho por tabela determinística.** Uma pergunta só (o número da calça) e `size_claim`.
- **As duas opções depois do CEP,** com a escolha pela cliente. A copy de fechamento por escolha
  é boa.
- **Preço antes do CEP** (`priceBeforeCepMessage`). Era o erro clássico de tráfego frio, e já
  está consertado.
- **Debounce da rajada** e a revisão do rascunho quando ela escreve no meio.
- **A régua** ancorada na janela gratuita de 72 h, com templates fora dela e opt-out
  determinístico.
- **A instrumentação**: `turn_outcomes`, `gate_traces`, `llm_calls`, `agent_version`, as views e
  o `source` do CTWA.
- **A bateria de mutação e o `dev:gates`.** Caros de manter, mas são o motivo de os gates não
  regredirem.

### O que está ruim

1. **Falha de integração vira mentira de venda.**
   - "Não sei a cobertura" foi lido como "não tem COD" duas vezes.
   - Nenhum monitor de saúde externo.
   - Prova pela porta de produção só quando alguém lembra.
2. **Velocidade:** a recepção, os 60 s, os 5 s e a digitação de ~50 s.
3. **O trecho entre o "quero" e o link é longo:** nome e CPF pedidos no chat, e depois o
   checkout pede de novo.
4. **Resposta paga e nunca enviada** quando o n8n repete a chamada depois de um timeout.
5. **O funil gravado pula do tamanho para o pedido.** Não dá para ver onde ela desistiu na reta
   final (o `stop_point` da régua sabe mais que o `stage`).
6. **O prompt de ~35 mil caracteres** cresceu por acréscimo: cada incidente virou um parágrafo.
   - Tem regras em tensão:
     - "uma pergunta viva no fim" × "não emende pergunta em resposta de preço";
     - "vírgula mais que ponto" × "cada frase um sentido só";
     - "gancho na dor" × "responda e pare".
   - Ensina copy emocional detalhada **[ver §9]**.
7. **A medição comercial não existe** (§10–§11).

### O que falta

- Alarme de cobertura e de integração.
- Latência gravada.
- Braço de experimento por lead.
- Eval comercial (juiz + cliente com propensão).
- Funil com estágios reais.
- Hermes vendo pedido.
- Conversions API.

### O que está complexo demais para o momento

- **28 gates.** Os de dinheiro e verdade ficam. Os de estilo e repetição podiam ser métrica do
  eval em vez de veto em produção: `hook_repeat`, `size_insist`, `cep_insist`, `noted_claim`,
  `pending_promise` e `identical_template` (este já é só aviso). Cada veto custa uma chamada
  inteira e um pouco de naturalidade. **Proposta: TESTAR rebaixar os 5 de estilo para "warn"**
  e medir pelo eval. **Não mexer nos de preço, frete, prazo, cobertura, saúde, identidade e
  escassez.**
- **O Hermes de ponta a ponta** (§12).
- **O dev tooling** (~9 mil linhas, `verify-guards.ts` com 3,6 mil). Mantém; não crescer sem
  necessidade.

---

## 6. Especificação do agente ideal de tráfego frio (estados)

A estrutura de 18 estados proposta é de venda consultiva B2B. Para um produto de R$ 130 com
pagamento na entrega, **descoberta e qualificação são o mesmo passo**, oferta e CTA também, e
"identificação do problema/objetivo" é uma pergunta só. Proponho **9 estados de conversa + 4 de
pedido**, todos derivados por código a partir de fatos (como `reachedStage` já faz):

| # | Estado (gravado) | Entra quando (fato) | Objetivo | Coleta | Agente faz | Proibido | Avança quando | Volta quando | Sucesso |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `novo` | 1ª mensagem | Responder em segundos, no assunto do anúncio | — | Responde o que ela perguntou; se só "oi", 1 frase sobre o que o anúncio mostrou + 1 pergunta aberta | Recepção genérica, link pro site, pedir dado | Qualquer resposta dela | — | Ela respondeu a 1ª pergunta |
| 2 | `interesse` | Respondeu | Ligar o colete ao que ela quer (a roupa, a ocasião, o incômodo), **no máximo 1 pergunta de descoberta** | ocasião/roupa (opcional) | Responde dúvida → prova curta → pergunta-ponte | Interrogatório; mais de 1 pergunta de dor; ressalva sem ninguém perguntar | Ela mostra intenção (pergunta como comprar, tamanho, se serve) ou pergunta o preço | — | Intenção declarada |
| 3 | `preco_dito` | O preço foi dito (por pedido dela ou no momento certo) | Âncora + COD "dependendo da região" | — | `priceBeforeCepMessage` | Segurar o preço; desconto | Tamanho ou CEP | — | Ela segue depois do preço |
| 4 | `tamanho_definido` | Tabela devolveu o tamanho | Tirar o medo de errar | número da calça / cintura | Diz o tamanho como fato + troca/devolução em 7 dias | Converter de cabeça; perguntar "soltinha ou justinha" | CEP | Novo dado de tamanho (sobrescreve) | — |
| 5 | `cobertura_conhecida` | Coinzz respondeu (COD sim/não). **Falha = desconhecida, nunca "não"** | Fechar o golpe com "você só paga quando receber" | CEP | `twoOptionsMessage` ou `noCodMessage` | Afirmar cobertura sem consulta | Escolheu o caminho | Novo CEP | Caminho escolhido |
| 6 | `caminho_escolhido` | `payment_choice` | Kit 1× (curto) e link | (A/B §9: nome+CPF agora × no checkout) | Oferece o kit uma vez → link pré-preenchido | Reabrir a comparação; pedir endereço | Link enviado | Pede para trocar o caminho | Link enviado |
| 7 | `link_enviado` | Link saiu | Ela terminar o checkout | — | Responde dúvida de checkout; lembrete aos 10 min | Mandar o link de novo sem ela pedir; pressão | Webhook de pedido | — | Pedido |
| 8 | `objecao_ativa` *(flag, não estágio)* | Intérprete/regex: golpe, caro, pensar, tamanho, prazo | Acolher → entender → reenquadrar → provar → próximo passo | tipo da objeção | 1 objeção, 1 resposta, 1 argumento por vez | Baixar preço; empilhar todos os argumentos | Objeção respondida e ela segue | Mesma objeção 2× → muda de argumento | Volta ao estado anterior |
| 9 | `perdido` / `pensando` | "Vou pensar" ou silêncio na régua | Sair bem e voltar uma vez | `stop_point` | Resposta curta; régua de 1 h / manhã / 71 h | Insistir; mais de 3 toques | Ela volta | — | Retomou |
| — | `pedido_criado` → `em_rota` → `entregue_pago` / `recusado` | Webhooks | Garantir a entrega | data | `order_confirmed`, `order_eve` ("esteja em casa") | — | — | — | **entregue_pago** |
| — | `handoff` | Pedido de pessoa, cancelamento, fora do escopo, falha | Pessoa com briefing | — | "Vou chamar" só quando o sistema chamou | Prometer retorno sem código | — | — | — |

**Mudança concreta:** trocar `endereco_coletado` (inalcançável) por `cobertura_conhecida`,
`caminho_escolhido` e `link_enviado`. São os três degraus que hoje são invisíveis e são onde a
venda morre. Isso é REFACTOR de `state-machine.ts` + migração do `check` + views.

---

## 7. Lead state — o que guardar (e o que não)

| Tipo | Variável | Onde | Existe? | Valor preditivo / comercial |
|---|---|---|---|---|
| Permanente | telefone, `source` (ad, headline, `ctwa_clid`) | `leads` | ✅ | Atribuição; a abertura usa o headline (novo uso) |
| Permanente | tamanho, `unit_sizes` | `leads` | ✅ | Link; troca |
| Permanente | CEP + `codAvailable` + datas + **`checked_at`** | `leads.address` | parcial (falta `checked_at` para cache) | **O maior preditor:** COD disponível ou não muda tudo |
| Permanente | identidade (nome, CPF) | `leads.identity` | ✅ | Só para pré-preencher |
| Estado atual | estágio (9+4 acima) | `conversations.stage` | refazer | Funil |
| Estado atual | `payment_choice`, `units` | `leads` | ✅ | Margem (antecipado) |
| Estado atual | `objection_last` (golpe/caro/tamanho/pensar/prazo/qualidade) | **novo**, `conversations` | ❌ | Hermes + régua (o toque fala da objeção dela) |
| Estado atual | `stop_point` | `followups` | ✅ | Copy da régua |
| Inferência | `intent_signals` (pediu preço, pediu link, disse "quero", perguntou do checkout) | derivado de `messages` / intérprete | parcial | Score (§8) |
| Métrica | tempo até 1ª resposta, até o preço, até o link; nº de mensagens até o link; reescritas; custo; latência do turno | `turn_outcomes` + **novos campos** | parcial | Eval de produção |
| Evento | link enviado, pedido criado/pago/entregue/recusado, opt-out, handoff | `messages`, `orders`, `followups` | ✅ | Funil |
| Experimento | `arm` (braço por lead) e `agent_version` | `leads`, `turn_outcomes` | `agent_version` ✅, `arm` ❌ | Comparação científica |

**Não guardar:**
- "problema", "objetivo", "confiança", "urgência" e "sensibilidade a preço" como campos
  inferidos pelo modelo: viram ruído que ninguém valida;
- resumo de conversa;
- perfil psicológico;
- histórico de "interesses".

A conversa dura menos de uma hora e cabe em 20 mensagens. **A única memória longa que vale é o
`source`, o tamanho, o CEP com a cobertura e a objeção principal.**

---

## 8. Lead score — só se decidir alguma coisa

Um número contínuo como o do Sagent é decorativo; nem ele funciona lá (bug de chave). Proponho
**três decisões, cada uma com uma regra legível**, e o "score" é o nome que elas recebem no
painel:

### Score de prontidão (0–100), determinístico, recalculado a cada turno

| Sinal | Pontos |
|---|---|
| Perguntou o preço / quanto custa | +15 |
| Deu o número da calça ou tamanho | +20 |
| Mandou o CEP | +20 |
| COD disponível no CEP | +10 |
| Escolheu o caminho | +20 |
| Disse "quero", "como compro", pediu o link | +25 |
| Objeção de golpe respondida e ela seguiu | +5 |
| "Vou pensar" | −15 |
| Não respondeu a última pergunta | −10 por toque da régua sem resposta |
| Pediu desconto 2× depois do "não" | −10 |
| Opt-out / "não quero" | → 0 e fim |

### Para que ele serve (a única razão de existir)

1. **Régua:**
   - Score ≥ 60 e silêncio → o toque fala do passo exato e é o único que vale insistir até
     3 toques.
   - Score < 30 e silêncio → **1 toque só** (o de 1 h) e para.

   Hoje todo mundo recebe a mesma régua; isso é insistência em quem não queria.
2. **Handoff priorizado:** quando uma pessoa precisa entrar, o e-mail leva o score. ≥ 60 é
   "responder em 15 min"; < 30 é "quando der".
3. **Risco de recusa (COD):**
   - Pedido COD criado com sinais de baixa convicção:
     - < 3 mensagens até o link;
     - objeção de golpe não resolvida;
     - escolheu COD depois de reclamar de preço.
   - → `order_eve` reforça "esteja em casa, deixe R$ X separado" (já existe) e o operador vê a
     lista.

   **Não bloquear venda por score.** Só sinalizar até ter 100 pedidos na porta para calibrar.

**Quando o lead é "quente":** escolheu o caminho ou pediu o link (≥ 60).
**Quando parar de vender:**
- opt-out;
- "não quero";
- 2 "vou pensar";
- 3 toques sem resposta.

**Calibrar com dado real** depois de ~200 leads: regressão logística simples de "pedido" sobre os
sinais, e ajustar os pesos. Antes disso, os pesos acima são hipótese explícita.

---

## 9. A copy atual — problemas identificados (sem reescrever)

Lidos o prompt inteiro, os textos fixos (recepção, duas opções, sem COD, risco zero, "vou
pensar", régua) e as duas auditorias reais.

| # | Problema | Evidência | Efeito em tráfego frio |
|---|---|---|---|
| C1 | **Recepção automática** promete "uma de nossas atendentes" e manda pro site | `retry.ts:371`; landing "não é robô" (D8) | Tira a lead da conversa no pico; promessa de humano que a Malu não sustenta |
| C2 | **Descoberta emocional cedo demais** ("tem alguma roupa que você ama e não tem usado?") como gancho de toda resposta | Prompt "uma pergunta viva no fim… gancho na dor" | Pode atrasar o preço para quem chegou querendo o preço **[hipótese]** |
| C3 | **Ressalva sem pergunta** ("o efeito é só enquanto está vestido, tá?") ainda aparece | L2 17:06, apesar da regra | Planta dúvida que ela não tinha |
| C4 | **Coleta longa antes do link** (nome → [e-mail] → CPF, um por mensagem) | Prompt "OS DADOS E O LINK"; L2 | 2 a 3 trocas a mais no ponto de maior atrito; o checkout pede tudo de novo |
| C5 | **Reversão de risco atrasada** depois de "já comprei uma ruinzinha" | L2 17:09 | Perdeu o melhor momento do melhor argumento |
| C6 | **Resposta a "ok"** ("que bom que fez sentido") | L2, corrigido em v15 | Robótico; corrigido |
| C7 | **Regra de estilo detalhada demais** (vírgula × ponto, < 8 palavras = robô, ≤ 30 palavras, "né" 1×, nome 1 em 5, roupa 2×, variar adjetivo…) | Prompt "COMO VOCÊ ESCREVE" | Modelo gasta atenção em forma; regras em tensão produzem texto "certinho" e longo |
| C8 | **Três balões de 30 palavras** como teto vira alvo | Prompt + `splitBubbles` | Mensagem longa no celular; com a pausa de digitação, ~50 s |
| C9 | **Escassez fixa** "restam 12 unidades" no "vou pensar" | `thinkReply`, `allowUnverified` | Pressão falsa no momento exato em que ela pediu espaço |
| C10 | **Prova social fraca e sempre a mesma** ("500 clientes"), depoimentos só no site | `objectionBriefing` | Contra o medo de golpe, prova concreta vale mais **[hipótese; depende de depoimento real]** |
| C11 | **Copy da régua com `**negrito**`** (dois asteriscos) | `followups.ts:1127,1172,1204` | O WhatsApp usa `*um*`; conferir no aparelho se aparece asterisco |
| C12 | **Nenhuma abertura usa o anúncio** | `source.headline` nunca é lido | Abertura genérica |

O que está **bom** na copy:
- fechar por escolha ("Qual das duas fica melhor pra você?");
- preço antes do CEP;
- honestidade sobre emagrecer como argumento;
- espelhar as palavras dela;
- "vou pensar" sem insistir;
- o CPF por último com o motivo;
- o tamanho por uma pergunta só.

**Discordância explícita (C4 × §62/§63):** o operador decidiu "dados antes do link" depois de
"link antes da hora". Mas a queixa original era o link **antes da decisão**, não antes do CPF.
Mandar o link logo depois da escolha do caminho respeita "depois da decisão" e corta o trecho mais
caro. É o primeiro A/B que eu rodaria.

---

## 10. Sistema de evaluation — Cliente sintético → Agente → Avaliador (Blueprint F)

**O que já existe e se reaproveita:**
- 12 personas (agentes Claude);
- `persona-run.ts`, com três portas: local, função deployada e n8n;
- `persona-scorecard.ts` (mecânica);
- `persona-eval.ts`;
- `dev:conversas` (estado, 300 conversas roteirizadas);
- `dev:gates`.

**Construir só o que falta:** comprador com propensão, juiz comercial e rodada por versão ou
braço.

```
cenários (YAML)                    agente (porta local da `turn`, mesma env da produção)
  persona + propensão oculta  ──►  muse-spark-1.3-contributor, braço/versão X
  + roteiro mínimo + 2 seeds        │
        ▲                           ▼
        └──── conversa até: link / "não compro" / 15 trocas / silêncio
                                    │
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                      ▼
     métricas determinísticas   juiz LLM (rubrica)    "comprador": decide no fim
     (placar já existe +        nota 1–5 por eixo,    se compraria (sim/não + motivo),
      latência, tokens)         com citação literal   dado o estado de convicção dele
              └──────────────► score comercial por cenário e agregado
```

### 1. Cliente sintético
O modelo do cliente **não** deve ser o mesmo da agente (viés de auto-preferência) — use Claude
Sonnet como hoje.

Cada cenário tem:
- **perfil:** idade, cidade, CEP real (com e sem COD), número da calça;
- **gatilho do anúncio:** qual headline;
- **propensão oculta inicial** (0–100);
- **3 objeções** que só soltam se provocadas;
- **o que a faz subir ou descer:** prova de pagamento na entrega +20, preço sem ela pedir 2× +10,
  resposta longa demais −10, pergunta repetida −15, pressão −20, mentira detectada → fim;
- **regra de parada:** compra quando a propensão passar de 70 e houver link; desiste abaixo de
  20; some com probabilidade X a cada resposta ruim.

**14 arquétipos:** os da sua lista, mapeados às 12 personas existentes + 4 novos:
- "pergunta o preço na 1ª mensagem";
- "decidida que só quer o link";
- "interessada sem dinheiro agora";
- "comparadora com a Shopee".

As 12 atuais são adversariais (caçam mentira). **Mantenha-as como suíte de segurança**, e a nova
suíte é de venda.

### 2. Avaliador
- **Eixos 1–5, cada nota com a frase citada:**
  - precisão (fatos do config);
  - naturalidade;
  - descoberta na medida;
  - tratamento de objeção;
  - timing do preço;
  - timing do CTA;
  - insistência;
  - clareza;
  - tamanho da mensagem.
- **Alucinação não é nota do juiz.** É o próprio `runGates` rodado de novo sobre o texto enviado
  (determinístico, já existe).
- Calibração do juiz: 20 conversas anotadas pelo operador. Concordância com o operador ≥ 80% por
  eixo, ou o eixo sai.

### 3. Score comercial

```
score = 50 × conversão_simulada
      + 20 × (avanço médio no funil: preço, tamanho, CEP, caminho, link)
      + 15 × média dos eixos do juiz (normalizada)
      + 15 × eficiência (−1 por troca acima da mediana até o link; −latência)
```

**Barreiras absolutas, fora da média:** qualquer mentira = rodada reprovada; qualquer opt-out
ignorado = reprovada.

### 4. Custo e tempo
**[inferência]** 14 cenários × 2 seeds × ~12 trocas × (agente 2 chamadas + cliente + juiz no
fim). Com o `-contributor` na agente e Sonnet no cliente, é de ordem de dólares por rodada.

---

## 11. Sistema de experimentação (Blueprint I)

**A realidade estatística:** L3 dá ~470 leads e ~47 pedidos. Separar 10% de 15% de conversão
pede **686 leads por braço** (`08-piso-de-amostra.md`). **Nenhuma mudança de prompt será provada
por conversão real neste teste.** Portanto:

1. **Toda mudança de agente passa primeiro pelo eval sintético** (§10):
   - mesma suíte, mesmas seeds;
   - v_atual × v_nova;
   - aceita se o score comercial sobe ≥ X (definido antes) e nenhuma barreira cai.

   Este é o filtro principal, e é barato.
2. **Em produção, só testes de efeito grande**, com métricas intermediárias de base alta (amostra
   menor):
   - taxa de resposta à 1ª mensagem (~60–75%);
   - chegou ao preço (~40–55%);
   - chegou ao link;
   - tempo até o link.

   Com p ≈ 50%, detectar +10 pp pede ~390 por braço. Ainda é muito, então **no máximo 1 teste
   por vez em L3**.
3. **Braço por lead, não antes/depois:**
   - `arm = hash(telefone) % 2`, gravado em `leads.arm` no 1º turno;
   - a `turn` lê o braço e liga ou desliga **uma** flag de config (ex.:
     `experiments.linkAfterChoice: {arms: [false, true]}`);
   - as views `eval_*` agrupam por braço.

   Antes/depois confunde a mudança da agente com a troca de criativo e de região que L3 faz de
   propósito.
4. **Ordem dos testes reais (um por vez):**
   - (a) primeira resposta em ≤ 15 s × 60 s;
   - (b) link após a escolha × dados antes;
   - (c) digitação curta × atual.

   (a) e (c) podem ir juntos como "pacote de velocidade" se a amostra não der para dois.
5. **Regra de leitura escrita antes** (como o piso de amostra): métrica, n mínimo por braço, teste
   de duas proporções, e o que acontece se der empate (fica o mais simples).
6. **Comparação de versões no eval:**
   - tabela por versão com score, % que chegou ao link, conversão simulada, objeções resolvidas,
     trocas até o link, tokens e latência p50/p95 (agora gravada);
   - saída num arquivo por rodada (`data/persona-runs/…/_placar.json` já é o formato).

---

## 12. Hermes — função ideal

**Hoje:**
- roda a cada 50 leads;
- lê conversas com vetos e desfechos;
- propõe ≤ 5 mudanças;
- o operador decide;
- **uma sessão do Claude implementa, prova e publica sozinha**;
- tem rollback automático por handoff.

Nunca rodou em tráfego real. Não vê pedido (H4).

### O que ele DEVE fazer (valor alto, custo baixo)
1. **Ler as conversas que viraram pedido junto com as que não viraram** (H4).
   - Pergunta central: "onde as que não compraram pararam, e o que a Malu disse logo antes?"
   - Isso exige o funil com estágios reais (§6).
2. **Taxonomia de objeções reais.** Frequência por tipo, a resposta que veio depois e se ela
   seguiu. Alimenta a base de objeções e a suíte sintética (cenários novos a partir do real).
3. **Mensagens vencedoras.** Frases da Malu seguidas de avanço × seguidas de silêncio. É
   hipótese, não prova.
4. **Gerar hipóteses de experimento** no formato do §11 (mudança, métrica, n, braço), em vez de
   patch.
5. **Caçar mentira e promessa sem código** (o que já faz bem; manter).

### O que ele NÃO DEVE fazer
- **Implementar e publicar sozinho** (IMPLEMENTAR.md + deploy-hermes.yml). Com < 1.000 leads,
  cada proposta é anedota. O caminho automático é o pedaço mais caro de manter: Routine, sessão,
  revisão Opus, CI e deploy. Hoje esse ciclo leva menos tempo feito à mão pelo operador numa
  sessão normal. **Congelar até ≥ 1.000 leads reais e ≥ 100 pedidos.**
- Julgar taxa com 50 leads (±8 pp).
- Rollback automático por handoff com amostra pequena. O critério de 200 turnos por versão é
  bom; mantê-lo só como alerta.
- Qualquer coisa dentro do turno (R11.2).

**Cadência:** semanal, ou a cada 100 leads, o que vier primeiro. **Não mexer na skill antes de
H4.**

---

## 13. Latência e custo — componente por componente

| Componente | Benefício comercial | Custo | Latência | Veredito |
|---|---|---|---|---|
| Recepção fixa + 60 s | Negativo/incerto | 0 | +60 s | **MODIFY**: texto honesto curto, ou nada; TESTAR 15 s |
| Pausa de digitação 560 ms/palavra | Incerto | 0 | +15–50 s | **MODIFY/TESTAR**: teto total de ~12 s |
| Sono de 5 s / 2 s | Junta a rajada | 0 | +5 s | **KEEP**; testar 3 s depois de medir o intervalo real entre mensagens |
| Intérprete (LLM 1) | Alto: lê intenção onde o regex falhou (R13) | ~30% | +2–5 s **[inf.]** | **KEEP** agora; **TESTAR** fundir na resposta (1 JSON) depois do eval. Pular quando a saída já é fixa por regex |
| Prompt de 35 mil caracteres | Médio | baixo com `-contributor` | +0,5–2 s **[inf.]** | **REFACTOR → por estágio** (fase 2), com eval antes e depois |
| 28 gates | Alto (os de dinheiro e verdade) | ~0 (código) | ~0 | **KEEP** os de verdade; **TESTAR** os 5 de estilo como warn |
| Reescrita (até 2×) | Alto (segurança) | +1 chamada | +3–8 s | **KEEP**; o prompt por estágio reduz a frequência |
| Revisão quando ela escreve no meio | Médio | até +4 chamadas | + | **KEEP** |
| ViaCEP + Coinzz em todo turno | Nulo depois do 1º | 0 | +0,5–2 s | **MODIFY**: cache |
| 25–35 idas ao banco | Nulo | 0 | +1–3 s **[inf.]** | **MODIFY** aos poucos |
| Áudio / imagem | Alto (tráfego frio manda áudio) | baixo | +3–25 s só quando há mídia | **KEEP** |
| Teto de custo R$ 1,00 | Proteção | — | — | **KEEP**; com o `-contributor` quase nunca dispara |
| Hermes (offline) | Médio quando houver dado | ~US$ 0,5/rodada | 0 | **MODIFY** (§12) |
| RAG, multi-agente, vector memory | — | + | + | **NÃO** |

**Modelo:** o `-contributor` custa R$ 0,05–0,08 por conversa.
- Custo de modelo deixou de ser restrição. As decisões devem otimizar latência e qualidade, não
  token.
- **Uma ressalva, dita uma vez e não como lembrete:** `pricing.ts` e a config do Hermes dizem que
  o `-contributor` cede prompts e respostas à Meta para treino e "nunca fala com cliente real".
  Hoje fala, com CPF e CEP de cliente no histórico. É ponto de LGPD para o
  `compliance-reviewer`, não de arquitetura. A decisão do modelo continua sendo do operador.

---

## 14. KEEP / MODIFY / REFACTOR / REMOVE / NEW

| Classe | Itens |
|---|---|
| **KEEP** | R11 inteiro · prompt = gate (`prompt.test.ts`) · gates de preço, frete, prazo, cobertura, saúde, identidade e escassez · tamanho determinístico · duas opções + escolha · preço antes do CEP · debounce · régua na janela de 72 h + templates · opt-out determinístico · instrumentação e views · `agent_version` · personas adversariais como suíte de segurança · `dev:gates` e mutações · n8n como cano e relógio · Supabase como estado |
| **MODIFY** | Recepção · espera de 60 s · pausa de digitação · cache de cobertura · intérprete pulado em saída fixa · leitura única do histórico · escopo do Hermes (lê pedido, propõe experimento) · régua condicionada ao score · e-mail de handoff com rascunho e score |
| **REFACTOR** | Estágios do funil (`cobertura_conhecida` / `caminho_escolhido` / `link_enviado`) · prompt por estágio · (teste) intérprete + resposta numa chamada |
| **REMOVE** | Escassez sem contagem (`allowUnverified`) · (fase 5, prioridade baixa — a higiene foi cortada do V1 de propósito) OpenAI/Gemini/`callLuna`/troca de modelo · `jobs` · gate `pacing` · campos de pedido sem consumidor · helpers só de teste · ramo `markRead` · autoimplementar e autopublicar do Hermes (congelar) |
| **NEW** | Alarme de cobertura e integração · conserto do retry → duplicate · latência gravada · abertura pelo anúncio · `leads.arm` + flags de experimento · eval comercial (comprador com propensão + juiz + score) · `objection_last` · lead score de decisão · (depois) Conversions API |

---

## 15. Blueprint

### A. Diagnóstico
Ver §5.
- Mecânica e segurança excelentes.
- Velocidade e atrito ruins.
- Medição comercial ausente.
- Hermes à frente dos dados.

### B. Arquitetura recomendada

```
Meta Ads (CTWA) ──► WhatsApp Cloud API ──► fn `whatsapp` (HMAC, mídia → texto, selo)
   │                                            │
   │ Conversions API (Purchase c/ ctwa_clid) ◄──┼── fase 4 (outro repo)
   ▼                                            ▼
n8n: cano + relógio (inbound → turn; envio; régua 5 min; webhooks de venda; ALARME de cobertura 15 min)
                                                ▼
fn `turn`
  contexto:   lead (source/anúncio, tamanho, CEP+cobertura em cache, caminho, arm, objeção)
              + 20 msgs
  extratores determinísticos → [intérprete LLM, pulado quando a saída é fixa]
  prompt = núcleo + bloco do ESTÁGIO + briefing só dos gates do estágio + flags do ARM
  LLM resposta → gates (verdade = bloqueia; estilo = avisa) → reescreve ≤ 2
  saídas fixas: preço, duas opções, sem COD, link pré-preenchido logo após a escolha (se o arm mandar)
  grava: estágio real, latência, custo, arm, desfecho
                                                ▼
Supabase: estado + views (funil por estágio real, por arm, por anúncio, latência p50/p95, recusa por perfil)
                                                ▼
Checkout Logzz (COD) / Coinzz (antecipado) ──► webhook ──► pedido / em rota / entregue / recusado ──► pós-venda
                                                ▼
Evaluation:  CI (testes + dev:conversas + dev:gates)  +  suíte sintética de VENDA por versão/arm (score comercial)
                                                ▼
Hermes (semanal / 100 leads): pedido × não pedido, objeções, frases vencedoras → HIPÓTESES de experimento → operador
```

### C. Estados
Ver §6: 9 de conversa + 4 de pedido; `objecao_ativa` é flag; transições por fato, sem regressão
(`furthest` continua).

### D. Memória
Ver §7: `source`, tamanho, CEP + cobertura + `checked_at`, caminho, identidade, `arm`,
`objection_last` + 20 mensagens. Nada além disso.

### E. Lead score
Ver §8: determinístico, usado para régua, prioridade de handoff e risco de recusa; calibrado com
~200 leads.

### F. Evaluation
Ver §10. Cliente com propensão oculta → turn local → juiz com rubrica citada + `runGates` → score
comercial, com mentira e opt-out como barreira.

### G. Estratégia comercial para tráfego frio
1. Resposta em segundos, no assunto do anúncio.
2. Responder primeiro, perguntar depois.
3. Preço quando ela pedir, com âncora.
4. Uma pergunta de descoberta no máximo, e só se ajudar a fechar o tamanho ou a ocasião.
5. Golpe → "você só paga quando receber" + 7 dias, cedo, quando a dúvida aparecer.
6. Tamanho em uma pergunta.
7. CEP com motivo.
8. Duas opções e a escolha.
9. Kit uma vez.
10. Link sem demora.
11. "Vou pensar" respeitado.
12. Régua curta para quem tem score baixo.
13. Antecipado apresentado como vantagem (−10% + Pix na hora), nunca empurrado.

### H. Princípios de copy para os prompts
- Uma ideia por balão.
- 1 a 2 balões por padrão, 3 só para as duas opções.
- O que ela perguntou vem na 1ª frase.
- Uma pergunta por mensagem, no fim, só quando avança a venda.
- Prova antes de promessa.
- Nada de ressalva sem pergunta.
- Nada de elogio de enchimento.
- Números só do config, com dono (de qual caminho).
- Nenhuma pressão falsa.
- **Menos regras de estilo no prompt**: a forma é medida pelo juiz, e o que é verdade fica nos
  gates.

### I. Experimentação
Ver §11: eval sintético é o filtro de toda mudança; em produção, 1 teste por vez, por braço de
lead, em métrica intermediária, com a regra de leitura escrita antes.

### J. Roadmap

**FASE 1 — correções críticas (antes de 23/10, antes de gastar R$ 1 em anúncio)**
1. Alarme de cobertura e integração. Cron de 15 min com 3 CEPs com COD → e-mail. Falha de
   consulta nunca vira "não tem".
2. Conserto do retry do n8n → "duplicate" → resposta não enviada.
3. Gravar a latência do turno e das chamadas.
4. Recepção sem "atendente" e sem mandar pro site (decisão do operador).
5. Abertura que lê o `source.headline`.
6. Cache de cobertura por CEP.
7. Remover a escassez sem contagem (decisão do operador).
8. Conferir o `**negrito**` da régua num aparelho.
9. `leads.arm` + flag de experimento (só a infraestrutura).
10. Estágios reais do funil (`cobertura_conhecida` / `caminho_escolhido` / `link_enviado`) + views.

**FASE 2 — otimização de conversão (durante L3, um teste por vez)**
1. A/B pacote de velocidade (15 s + digitação curta) × atual.
2. A/B link após a escolha × dados antes.
3. Prompt por estágio, validado no eval antes de ir ao ar.
4. Gates de estilo como aviso (validado no eval).
5. Hermes com pedido (H4) e saída em hipóteses; congelar o autopublicar.

**FASE 3 — evaluation automatizado** (pode começar em paralelo à fase 1, porque não toca produção)
1. Comprador sintético com propensão + 4 arquétipos novos.
2. Juiz com rubrica citada, calibrado com 20 conversas do operador.
3. Score comercial e tabela por versão/braço no `_placar`.
4. Rodada automática no CI de PRs que tocam prompt ou gate (suíte curta) e completa sob demanda.

**FASE 4 — otimização contínua (depois de ~500 leads reais)**
1. Lead score calibrado com regressão nos sinais reais; régua por score.
2. Recusa por perfil de conversa; `order_eve` reforçado no perfil de risco.
3. Conversions API (Purchase/entregue com `ctwa_clid`).
4. Cenários sintéticos novos nascidos das objeções reais (Hermes).
5. Botões interativos de tamanho e pagamento (A/B).
6. Teste de intérprete + resposta numa chamada.

**FASE 5 — escala (conversão ≥ 10% e ROI ≥ 2,5 no dia 18)**
1. Mais verba e criativos; atribuição por anúncio × conversão na agente.
2. Destravar o caminho automático do Hermes só com ≥ 1.000 leads e ≥ 100 pedidos.
3. Remover o código morto restante e o dev tooling que não paga.
4. Multicanal só se houver tráfego que o justifique.

---

## 16. Onde eu discordo de decisões existentes (explícito)

1. **R14.14 / IMPLEMENTAR.md:** o Hermes implementar e publicar sozinho é prematuro. Congelar.
2. **R16.5 / R16.8 (`allowUnverified`):** "restam 12 unidades" sem contagem contradiz R13.6 e a
   própria marca da honestidade. Remover.
3. **§62 / §63 (dados antes do link):** a queixa era link antes da decisão. Testar o link logo
   após a escolha.
4. **R18.1 (primeira resposta em 1 min) e o ritmo de digitação (R13, §66):** para tráfego frio, a
   velocidade provavelmente vale mais que parecer humano. Testar, não assumir.
5. **D8 (recepção "uma de nossas atendentes"):** contradiz "nunca afirma ser uma pessoa" e tira a
   cliente da conversa.
6. **Portal antes do próximo teste real (HANDOFF 09/10):** o alarme de cobertura e o conserto do
   retry valem mais em dinheiro que o portal, porque protegem as vendas do L3. O portal não
   precisa vir antes deles.

## 17. Verificação desta análise
- **Medido:** o tamanho do prompt (35.228 caracteres / 6.563 palavras, com o
  `business.example.json`, via `tsx`, sem gravar arquivo).
- **Conferido no código:**
  - `index.ts:2074–2081` (dedupe) e `:2316–2320` (sono);
  - `:3235–3256` (cobertura em todo turno);
  - `retry.ts:371` (recepção);
  - `followups.ts:1127–1205` (`**`).
- **Não medido:**
  - a latência real do turno (não é gravada);
  - os tokens reais do `-contributor`;
  - o `BUSINESS_CONFIG` de produção;
  - o render do `**` no aparelho.
- **Os números de conversão** são projeção do repositório; nenhum vem de tráfego real.
- **Próximo passo depois da sua revisão:** você escolhe quais itens da fase 1 entram, e cada um
  vira tarefa com teste, espelho, grafo e revisão Opus, pelas regras do `CLAUDE.md`.

---

## 18. Achado novo — a recusa lida como "vou pensar" (conversa real de 09/10)

### O que aconteceu

| Hora | Cliente | Malu |
|---|---|---|
| 20:16 | "Quero comprar…" | Recepção automática ("uma de nossas atendentes…") |
| 20:17 | — | "Oii, boa tarde, tudo bem?! Sou a Malu e darei início ao seu atendimento. Pra eu te deixar no tamanho certo…" |
| 20:40 | — | "Ainda está aí?" |
| 20:40 | **"nao quero mais, obrigado"** | "Sem problemas, estou aqui se tiver mais alguma dúvida 💛 **Só te aviso que restam 12 unidades desse lote, então se fizer sentido pra você, vale garantir o seu logo**" |
| 20:41 | **"nao quero"** | "Tudo bem, obrigada por me falar 💛 Fico por aqui se precisar de algo" |
| 21:45 | — | `silence_1`: "Oi! Ficou alguma dúvida sobre o colete? …" |
| 10/10 09:00 | — | `silence_2`: "Bom dia! 💛 Passando só pra dizer…" |

### Causa, conferida no código
1. **O intérprete junta duas coisas diferentes.** `wants_to_think` vale "se ela diz que vai pensar…
   **ou se despede desistindo por agora** ('deixa pra lá', 'deixa então, vlw')"
   (`interpret.ts:110-111`). "Vai pensar" e "não quer" são a mesma categoria.
2. **`goodbyeParks`** (`interpret.ts:917`) transforma toda despedida que não é compra em
   `wants_to_think`.
3. Com `wants_to_think`, o turno manda o texto fixo `thinkReply` (`index.ts:3553-3568`). É ele que
   carrega a escassez (R16.5).
4. **Nada marca "recusou".** A régua normal continua armada: um toque depois de 1 h e outro na
   manhã seguinte.

**Não é a cegueira a negação de sempre.** É uma **categoria que falta no desenho**. "Desistiu" não
existe como estado; só existe "vai pensar" e "opt-out" (parar de receber mensagens). "Não quero
mais" não é opt-out (ela não pediu para parar), então caiu em "vai pensar".

### Por que é o risco mais grave da lista
- **A nota de qualidade do número.** Na Cloud API, insistir depois de um "não" leva a bloqueio e
  denúncia. A nota baixa limita o número inteiro: toda a operação para, não só uma venda.
- **CDC e honestidade.** A escassez sem contagem real foi usada justamente contra uma cliente
  que recusou.
- **Marca.** É o comportamento que faz a pessoa contar que "a loja fica mandando mensagem".

### Solução proposta (sem implementar)
- **Categoria nova `declines` no intérprete**, separada de `wants_to_think`, com exemplos dos dois
  lados:
  - "não quero mais", "não tenho interesse", "desisti" → **recusa**;
  - "vou pensar", "depois eu vejo", "vou falar com meu marido" → **pensar**;
  - "não quero pensar, quero comprar", "não quero mais nada, só o link" → **compra**.
- **Recusa →**
  - uma frase curta e calorosa, **sem escassez, sem argumento, sem pergunta**;
  - cancela a régua de silêncio;
  - grava o estágio `perdido` com o motivo "recusou".

  Diferente do opt-out, ela continua podendo voltar, e a Malu responde normalmente se ela voltar.
- **Pensar →** o `thinkReply` sem a escassez (§4, item 31). No máximo dois toques.
- **Teste e guarda:**
  - testes de negação nos dois sentidos (regra do repositório);
  - mutação que reinstala o bug;
  - persona nova "recusa educada" na suíte;
  - grafo.
- **Paralelo nos projetos externos:**
  - o classificador de resposta do #13723 tem `not_interested` → pausa;
  - o do #6529 tem `declined` → status próprio.

  Os dois tratam a recusa como **estado**, não como texto. É a parte que vale copiar deles.

---

## 19. Por que a Malu ainda soa robótica — diagnóstico com as falas reais

**Fonte:** as mensagens enviadas em produção (três conversas do operador, do sócio e de uma
amiga, entre 06/10 e 09/10), lidas no banco. A pergunta foi "o que uma brasileira no WhatsApp não
escreveria?". Ao lado de cada item vai a causa no código ou no prompt e se ele já foi
consertado (para não acusar o que já mudou).

| # | Padrão robótico | Fala real | Causa | Já consertado? |
|---|---|---|---|---|
| R1 | **Abertura em dobro e de call center** | Recepção automática + "Sou a Malu e **darei início ao seu atendimento**. **Em que posso te ajudar?**", inclusive para quem já tinha dito "Quero comprar" | `WELCOME_AUTO_REPLY` e `greetingFor` são texto fixo (`retry.ts:371`, `:386`) | Não |
| R2 | **Tique "Que bom que…"** abrindo a resposta | "Que bom que perguntou", "Que bom que você viu por lá", "Que bom que fez sentido", "Que bom, aí quando concluir", "Que bom que você mandou áudio" | O prompt pede "acolha" e "responda antes de perguntar", e o modelo resolve sempre com o mesmo abridor. O prompt só proíbe o "que bom" depois de um "ok" | Em parte (só no "ok") |
| R3 | **Frase longa costurada por vírgula** | "Que bom que perguntou, te explico os dois com calma, e pra te indicar o tamanho certo, que número de calça você veste e fica confortável? No pagamento na entrega você não paga nada agora e paga ao entregador quando…" | **A própria regra do prompt:** "Vírgula mais que ponto… duas frases seguidas com menos de oito palavras cada já soam como robô, junte as duas" (`prompt.ts:592-596`). A regra combate o staccato e produz o oposto: um parágrafo de redação | Não; a regra é a causa |
| R4 | **Toda mensagem termina pedindo algo** | "Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região." aparece igual em várias conversas; quase toda resposta termina em pedido de dado ou gancho | "Uma pergunta viva no fim" + o caminho de dados (`prompt.ts:534-543`) | Não |
| R5 | **O exemplo do prompt é copiado literalmente** | "**Que presente especial**, com o colete por baixo a blusa assenta lisinha…", **palavra por palavra o exemplo do prompt** (`prompt.ts:507`) | Frase pronta como exemplo; com o modelo `minimal`, o exemplo vira molde | Não |
| R6 | **Fórmula idêntica entre clientes** | "Com 42 o seu é o G, que é pra cintura de 76 a 84 cm" sempre igual | Diretiva de tamanho + o pedido de "diga com a faixa" | Aceitável (é fato); o problema é o resto também ser fixo |
| R7 | **Régua cega ao contexto e repetitiva** | "Ainda está aí?" **4 vezes** numa conversa; "me diz que tamanho de calça você usa" depois de ela já ter dito 42 | Toques de texto fixo escolhidos só pelo `stop_point` | **Sim**, os dois (§66: 20 min + uma vez por dia; tamanho conhecido → outro texto). O resto da régua continua de texto fixo, idêntico para todas |
| R8 | **Não espelha a energia dela** | Ela: "Hahah tem sim!" / "Estou". Malu: parágrafo. Ela: "aah entendi, ok". Malu: "Que bom que fez sentido pra você, e pra gente seguir me diz qual é seu CEP…" | O prompt fala em espelhar **palavras**, nunca **tamanho e registro** | Não |
| R9 | **Rigidez quando ela insiste** | Ela pediu o pagamento na entrega duas vezes e ouviu três variações de "vai só no antecipado" | Raiz: o bug de cobertura. Mas a agente não tem instrução de "ela insistiu → reconheça, explique diferente ou ofereça uma pessoa" | Em parte |
| R10 | **Texto corporativo no momento da compra** | "Perfeito! É só clicar no link do checkout a seguir e concluir sua compra, **obrigada por escolher a Encorpa**." | Texto fixo do link | Não |
| R11 | **Fuga do assunto sem leveza** | Pedido de contrabaixo de metal → "Entendo, mas por aqui eu só consigo te ajudar com o nosso colete cinta modeladora…" | Nenhuma licença para uma linha de humor antes da ponte | Não (prioridade baixa) |
| R12 | **Descoberta no lugar da resposta** | Ela: "que numeração vocês têm disponível?". Malu: a faixa + "Tem alguma roupa que você adora e deixou no armário?" → 2 trocas a mais, "Ainda está aí?" e silêncio | O gancho de dor tem prioridade sobre avançar uma pergunta de compra | Não |

### Duas mentiras que passaram, e por que importam para a humanização
- **"…e toca sim"** (se o entregador toca a campainha). O prompt diz que ela **não sabe** como o
  entregador age.
- **"Ele acompanha bem essa diferença porque modela cintura e quadril juntinhos".** O prompt
  proíbe dizer que pega o quadril.

Nenhum gate cobre esses dois fatos (`guardrails.ts` não tem "campainha" e só cita "quadril" no
gate de saúde). **Regra só no prompt vaza.**

Consequência direta para o pedido de humanizar: **dar mais liberdade de estilo aumenta o risco
de afirmação errada**. Por isso a humanização abaixo **não afrouxa nenhum gate de fato**. E os
poucos fatos que geram devolução (quadril, que o colete afina, como é a entrega) ganham gate.

### A raiz comum
O prompt tenta **produzir naturalidade por regra**. São ~35 mil caracteres com mais de 60 regras
de forma ("vírgula mais que ponto", "né uma vez", "nome a cada cinco mensagens", "roupa no máximo
duas vezes", "varie o adjetivo"…), e o modelo responde a isso com **texto de quem está seguindo
regulamento**. Somam-se:
- **metade das mensagens são texto fixo**: recepção, saudação, duas opções, sem COD, link,
  "vou pensar", régua;
- o modelo roda com `reasoning_effort: "minimal"`.

O resultado é previsível: o fixo é igual para todas as clientes, e o livre é um parágrafo
correto, educado e longo.

**Ressalva honesta:** parte disso pode ser limite do modelo (`-contributor`, raciocínio mínimo).
Sem eval de naturalidade, não dá para separar "prompt ruim" de "modelo fraco em PT-BR coloquial".
O eval da §10, com o juiz medindo naturalidade, é o que separa os dois. A troca de modelo continua
sendo decisão do operador.

---

## 20. Humanização e adaptabilidade — o que mudar

**Princípio:** humanizar **não** é soar como pessoa nem fingir ser pessoa (a regra de identidade
continua). É **responder como alguém que está prestando atenção**:
- no assunto dela;
- no tamanho dela;
- no ritmo dela;
- lembrando o que ela disse;
- sem roteiro aparente.

| # | Mudança | Fonte / validação | O que muda no projeto | Risco e como medir | Decisão |
|---|---|---|---|---|---|
| H1 | **Uma abertura só, que responde o que ela disse, no assunto do anúncio** | Sagent ("Greetings and farewells: 1 bubble only"); Zaip ("NO FILLER PHRASES") | Sai a recepção automática e o "darei início ao seu atendimento / Em que posso te ajudar?". O 1º turno é do modelo, com a diretiva "ela veio do anúncio <headline>; responda o que ela escreveu". Se ela só disse "oi": "Oi! Tudo bem? Vi que você veio pelo anúncio do colete 😊 quer saber como ele fica no corpo ou já quer ver o tamanho?" (exemplo de forma, não frase para copiar) | Precisa responder em ≤ 15 s para não precisar da recepção. Medir a taxa de resposta à 1ª mensagem | **AGORA** |
| H2 | **Espelhar tamanho e registro, calculado por código** | Sagent ("Match the customer's energy. Short → short.") | Diretiva determinística por turno: média de palavras dela nas últimas 3 mensagens, se usa "kkk", emoji, abreviação. "Ela escreve curto e informal: responda em 1 balão de até ~15 palavras." Só quando ela escreve longo, 2 a 3 balões. É código lendo o texto (R11), não o modelo se avaliando | Pouco. Medir palavras por balão ÷ palavras dela (alvo ≤ 2×) | **AGORA** |
| H3 | **Trocar a regra "vírgula mais que ponto / junte frases curtas"** por "escreva como se digita no WhatsApp: frase curta, às vezes sem verbo ('Tem sim!'), um assunto por balão; varie o começo das mensagens" | Sagent ("1-2 sentences per bubble"); #13220 ("2-4 sentences") | Reescrever o bloco "COMO VOCÊ ESCREVE". **Contraria uma decisão do operador (R13 / §66).** O motivo dele era real (staccato soa robô), mas o conserto pela vírgula produziu o parágrafo. O remédio do staccato é **variar e espelhar**, não alongar | Risco de voltar o staccato → medir no eval (juiz + % de frases > 25 palavras + variação de início) | **TESTAR no eval, depois A/B** |
| H4 | **Lista curta de tiques a evitar** | Sagent (sem "Certainly!", "Great question!"); Zaip (sem "Entendi", "Certo"); #13220 (lista de frases banidas) | ~8 itens no prompt: "Que bom que…", "darei início", "Em que posso te ajudar", "Perfeito!", "certinho" repetido, "Entendo,", "obrigada por escolher", "fico de olho". **Medido no eval** (contagem por conversa), **não como gate**: gate de estilo custa uma chamada e trava a conversa | Pouco | **AGORA** |
| H5 | **Exemplos de diálogo no lugar de frases prontas** | Sagent (pares BOM/RUIM) | Sai "Ex.: 'Que presente especial…'" e as outras frases-exemplo (8 trechos com "Ex.", "Por exemplo" ou "Use esta frase" no prompt). Entram 3 trocas curtas completas (ela → Malu) mostrando a **forma**, com a regra "não reuse estas frases". A frase canônica fica só onde o gate de frete exige | O modelo pode copiar o diálogo também → o eval mede a sobreposição de n-gramas da resposta com o prompt (alvo: nenhuma sequência de 6+ palavras igual) | **TESTAR no eval** |
| H6 | **Nem toda mensagem termina em pergunta** | Contraprova: Zaip e sial ("always end with a next step") soam como formulário | A pergunta vai quando avança a venda ou quando ela parou. Em resposta a dúvida pura, pode terminar em afirmação. O dado é pedido **uma** vez, junto do motivo, e não em toda mensagem. Ajusta "uma pergunta viva no fim" | Risco de a conversa morrer → medir a taxa de resposta dela à mensagem seguinte | **TESTAR** |
| H7 | **Pergunta de compra vence o gancho de dor** | Lição de R12; #13220 ("ask one question at a time"; responde o que foi perguntado) | Se ela perguntou tamanho, preço, entrega ou como compra, a resposta avança isso. O gancho emocional só entra quando ela hesita ou quando a conversa está parada no começo, e no máximo 1 vez (já é a regra). Hoje o prompt não diz quem vence | Pouco | **AGORA** |
| H8 | **Régua contextual escrita pelo modelo dentro da janela de 24 h** | Sagent (follow-up gerado: "≤160 chars, reference their interest, don't be pushy, no emojis, don't start the same way"); MOEM96 (um empurrão só) | **Quando** e **se** continuam no código (stop point, score §8, recusa §18). **O que dizer** passa a ser o modelo com: a última coisa que ela disse, o que falta e a objeção aberta, e o texto passa pela **mesma cadeia de gates**; se vetar, cai no texto fixo de hoje. Fora da janela de 24 h, continua o template da Meta (obrigatório) | Risco de mentira no toque → mitigado pelos gates; custo ~R$ 0,005 por toque. Medir a taxa de resposta ao toque fixo × gerado (A/B por lead) | **TESTAR** |
| H9 | **Quando ela insiste ou não entende, mude a abordagem** | Sagent (3ª pergunta de esclarecimento → pessoa); Zaip (RETRY_1..5 → SKIP / STOP) | Generalizar o que `cep_insist` e `size_insist` fazem: mesma objeção ou mesmo pedido dela 2× → a diretiva diz "ela já ouviu X e insistiu: reconheça o que ela quer, explique de outro jeito; se não houver como, ofereça uma pessoa". Determinístico por comparação com o turno anterior | Pouco | **DEPOIS** (fase 2) |
| H10 | **Menos texto fixo onde ele não protege nada** | Contraprova: Sagent só usa texto montado pelo código quando **falta fato**; seu sistema usa também por segurança de copy | Mantém fixo: preço antes do CEP (números), duas opções (preço e prazo, gate de frete), sem COD (motivo único), o link (URL). Passa a ser livre e curto: a frase em volta do link (sai o "obrigada por escolher a Encorpa"), o "vou pensar" (sem escassez), a saudação. Os números continuam fixos; a moldura fica livre | O gate continua lendo tudo | **DEPOIS** |
| H11 | **Uma linha de leveza no fora de assunto** | Sagent ("knowledgeable friend at the shop") | "Kkk de contrabaixo eu não entendo nada 😅 mas de colete eu entendo!" e depois a ponte. Uma frase, só quando ela brincar | Baixo | **DEPOIS** |
| H12 | **Gate para os fatos que geram devolução** | Sagent (resposta do banco quando não há fato) | Quadril / bumbum ("pega o quadril", "modela o quadril"), comportamento do entregador ("toca a campainha", "liga antes") e "afina" com sentido de definitivo. Com teste de negação nos dois sentidos | **É a contrapartida da liberdade de H2–H10.** `dev:gates`, mutação | **AGORA** (junto de H2–H5) |
| H13 | **Raciocínio do modelo** | — | Testar `reasoning_effort: "low"` × `"minimal"` no eval de naturalidade. Custo e latência sobem um pouco; a qualidade do PT-BR pode subir | Medir latência p50 e nota de naturalidade | **TESTAR** (o modelo em si é do operador) |

### Adaptabilidade (o outro lado do "robótico")
A rota (tamanho → CEP → pagamento → dados → link) é imposta pelo código (`missingForLink`). Isso é
bom para não mandar link errado, mas faz a conversa parecer formulário quando a cliente vem fora
da ordem. Três ajustes, todos em código e todos já previstos acima:
1. **Aceitar a ordem dela.** Se ela manda o CEP antes do tamanho, a Malu já responde a
   cobertura (já acontece) **e** não volta a perguntar o tamanho como se nada tivesse
   acontecido. A ponte vem curta e ligada ao que ela disse (H7).
2. **Link mais cedo** (§9 C4, §11): tira 2 a 3 passos rígidos.
3. **A régua lê a conversa** (H8) e **a recusa é um estado** (§18).

**O que eu não proponho, e por quê:**
- **Personalidade com nome de humano, áudio pré-gravado (Zaip) e "sou a Malu, consultora".**
  Fingir pessoa contradiz a regra de identidade e o CDC, e o risco cai na marca.
- **Memória longa e resumos (Sagent).** A conversa cabe em 20 mensagens; o que humaniza é usar o
  que ela disse **nesta** conversa, e isso já está no histórico.
- **Temperatura alta ou "seja criativa".** Variação de superfície não é atenção. O que a cliente
  percebe é a resposta ao que ela disse, não o sinônimo.

---

## 21. Validação contra os 12 projetos — a melhor parte de cada um

**Ressalva de método (para não superestimar as fontes):**
- **Nenhum dos 12 tem avaliação, teste de conversão ou dado publicado.**
- Quatro templates do n8n nem rodam como publicados.

Então "melhor parte" aqui quer dizer **o padrão de desenho mais defensável**, não "provado que
vende". A prova vem do eval (§10) e do A/B (§11) deste projeto. Em várias linhas, o seu projeto já
está à frente da fonte.

| # | Projeto | Melhor parte | Já temos? | Como entra aqui | Decisão |
|---|---|---|---|---|---|
| 1 | **Zaip** | Step packet (só o passo atual no prompt) | Não | Prompt por estágio (§4 item 9) | **ADOTAR** (fase 2, com eval) |
| | | `null` × `"indefinido"` (perguntar de novo × desistiu, siga) | **Sim** (`refusedDatum`, "o que faltar ela preenche no checkout") | — | Já temos |
| | | RETRY_1..5 → SKIP / STOP | Parcial (`cep_insist`, `size_insist`) | Generalizar (H9) | **ADAPTAR** |
| | | "Sem frases de enchimento" | Parcial | Lista de tiques (H4) | **ADOTAR** |
| | | Debounce de 5 s no banco | **Sim** (5 s / 2 s) | — | Já temos |
| | | Funil SPIN de 14 passos, CLOSING_PUSH, urgência inventada, áudio pré-gravado | — | — | **REJEITAR** |
| 2 | **Sagent** | "LLM decide o que dizer, código executa" | **Sim** (R11, mais rígido) | — | Já temos |
| | | Resposta montada do banco quando falta fato | **Sim** (textos fixos de preço, cobertura e link) | — | Já temos |
| | | "Match the customer's energy" + pares BOM/RUIM | Não | H2, H5 | **ADOTAR** |
| | | Follow-up gerado, curto, referindo o interesse | Não (texto fixo) | H8, com gates | **TESTAR** |
| | | Quebra-loop de esclarecimento | Parcial | H9 | **ADAPTAR** |
| | | Uma chamada só (decisão + mensagem) | Não (2 chamadas) | §4 item 10 | **TESTAR** depois do eval |
| | | Botões e listas com opções verificadas | Não | §4 item 13 | **TESTAR** |
| | | Chave de cache de prompt | Não (cache 12%) | Investigar o prefixo estável + o prompt por estágio | **ADAPTAR** |
| | | Score em três sistemas, memória resumida, RAG de catálogo | — | — | **REJEITAR** |
| 3 | **sial-sanwal** | "INTERNAL CONTEXT: falta coletar …" | **Sim** (diretivas, `missingForLink`) | — | Já temos |
| | | FOMO inventado, score de completude | — | — | **REJEITAR** |
| 4 | **MOEM96** | Pausa da IA por contato no handoff | **Sim** (`handoff_at`) | — | Já temos |
| | | Um empurrão só | Não (todos recebem até 3) | Régua por score: score baixo → 1 toque (§8) | **ADAPTAR** |
| | | Texto livre dentro da janela, template fora | **Sim** | — | Já temos |
| | | HMAC com comparação em tempo constante, dedupe por `wamid` | **Sim** | — | Já temos |
| | | Opt-out desfeito por qualquer mensagem | — | — | **REJEITAR** |
| 5 | **n8n #2465** | (nada que sirva) | — | — | **REJEITAR** (RAG de PDF) |
| 6 | **n8n #13220** | Uma pergunta por vez; template por produto; cross-sell uma vez | **Sim** (kit uma vez, fatos do produto) | — | Já temos |
| | | Lista de frases banidas | Não | H4 | **ADOTAR** |
| | | Áudio "traduzido", busca na web, estoque inteiro no contexto, prazo por DDD | — | — | **REJEITAR** |
| 7 | **n8n #6529** | Classificador com classe `declined` própria | **Não**, e é o buraco do §18 | `declines` no intérprete | **ADOTAR** (fase 1) |
| | | Lead Ads + verificação | — | CTWA já faz melhor | **REJEITAR** |
| 8 | **n8n #15621** | Alerta quando o lead fica quente (score ≥ 75 → Slack) | Não | Prioridade do handoff por score (§8) | **ADAPTAR** |
| | | Limite de palavras por mensagem | **Sim** | — | Já temos |
| | | BANT, reunião agendada às cegas | — | — | **REJEITAR** |
| 9 | **n8n #17106** | `HANDOFF:true` + o humano recebe o **rascunho** | Parcial (briefing) | E-mail de handoff com o rascunho e o motivo (§4 item 19) | **ADAPTAR** |
| | | Error Trigger → canal de operação | Parcial (e-mails de erro) | **Alarme de integração e cobertura** (§4 item 1) | **ADOTAR** (fase 1) |
| 10 | **n8n #4083** | Manual de técnica de venda num lugar só | **Sim** (o playbook está no prompt e no script v2) | Não como vetor | **REJEITAR** o RAG |
| | | Multicanal | — | — | **REJEITAR** (por ora) |
| 11 | **n8n #5449** | (nada; outbound frio para número raspado) | — | — | **REJEITAR** |
| 12 | **n8n #13723** | Variante por contato + atribuição por variante + relatório A × B | Parcial (`pickVariant` na régua, `agent_version`) | `leads.arm` + views por braço + teste de significância (§11) | **ADOTAR** (fase 1, infraestrutura) |
| | | Classificar a resposta (`converted`, `not_interested`, `unsubscribe`) → status | Parcial | Igual ao `declined` do #6529 (§18) | **ADOTAR** |
| | | Nutrição de 3 em 3 dias sem teto; vencedor sem significância | — | — | **REJEITAR** |

**Leitura da tabela:**
- **De ~40 ideias, 17 já estão no projeto** e quase sempre melhor implementadas que na fonte.
- **9 entram** (adotar ou adaptar): step packet, espelhar energia, pares BOM/RUIM, lista de tiques,
  classe "recusou", alarme de integração, braço A/B por lead, um empurrão para lead frio,
  rascunho no handoff.
- **4 vão a teste:** follow-up gerado, uma chamada só, botões, cache.
- **O resto é rejeitado**, e cada rejeição tem motivo comercial, não preferência.

**Nada da lista exige reabrir R11** (sem tool-calling, sem RAG, sem multiagente, sem Hermes no
turno).

---

## 22. As mudanças que fazem toda a diferença — lista final, com o meu grau de certeza

O critério é **conversão × confiabilidade × velocidade × custo**. A coluna "Certeza" é honesta
sobre o que é medido e o que é hipótese.

| # | Mudança | Por que faz diferença | Certeza | Como provar antes de confiar |
|---|---|---|---|---|
| 1 | **Recusa é um estado** (§18): sem escassez, régua cancelada | Protege o número (risco de parar tudo) e a marca | **Alta** (bug real, causa no código) | Testes de negação nos dois sentidos + persona "recusa educada" |
| 2 | **Alarme de integração e cobertura** + "falha = não sei" | Duas vezes o COD sumiu para todas sem ninguém saber | **Alta** (dois incidentes) | Teste de fogo: derrubar a consulta em ambiente de teste e ver o e-mail chegar |
| 3 | **Abertura única e rápida, no assunto do anúncio** (H1 + §4 itens 4, 5, 7) | O 1º minuto decide se ela fica | Média–alta (latência medida; o efeito na conversão é hipótese) | A/B: taxa de resposta à 1ª mensagem e chegou ao preço |
| 4 | **Pacote de humanização** (H2 espelhar, H3 sem costura por vírgula, H4 tiques, H5 diálogos no lugar de frases, H7 compra vence o gancho) **+ H12 gates de fato** | É o que você sente como robótico; está nas falas reais (§19) | Média (diagnóstico certo; a solução precisa de prova) | Eval sintético com o juiz de naturalidade **antes** do ar; depois A/B de chegou ao link |
| 5 | **Link logo após a escolha do pagamento** | Corta 2 a 3 trocas no ponto de maior atrito | Média (hipótese forte; contraria §62/§63) | A/B por lead: link → pedido |
| 6 | **Eval comercial sintético** (comprador com propensão + juiz + `runGates`) | Sem ele, toda mudança de tom é opinião, minha ou de qualquer um | Alta (é infraestrutura de prova) | Calibrar o juiz com 20 conversas anotadas pelo operador (≥ 80% de acordo) |
| 7 | **Braço A/B por lead + latência gravada + estágios reais do funil** | Sem isso, nenhum teste de L3 diz nada | Alta | Conferir as views com os dados do primeiro dia |
| 8 | **Régua contextual escrita pelo modelo na janela + 1 toque só para lead frio** (H8 + §8) | A régua é hoje o texto mais repetido e o que mais pode irritar | Média | A/B de resposta ao toque; opt-out e bloqueio por braço |
| 9 | **Prompt por estágio + investigação do cache** | Menos regra competindo, menos latência, menos reescrita | Média | Eval antes e depois: nota, mentiras, tokens, latência |
| 10 | **Velocidade da digitação** (teto de ~12 s) | ~30–60 s percebidos hoje | Média (o efeito é hipótese) | Vai no mesmo A/B do item 3 |

**O que eu posso estar errando (para você pesar):**
- **Estou enviesado para velocidade.** O operador decidiu 1 min e o ritmo de digitação por achar
  que pressa soa robô. Pode estar certo para o público de 40–55 anos. Por isso é **A/B**, não
  ordem.
- **Mais liberdade de estilo traz mais risco de afirmação errada.** As duas mentiras da §19
  mostram isso. Por isso H12 vem no mesmo pacote, e nenhum gate de fato é afrouxado.
- **O link mais cedo pode trazer mais checkout abandonado.** O lembrete de 10 min existe para
  isso; o A/B mede pedido, não clique.
- **Talvez parte do robótico seja o modelo e não o prompt.** O eval separa os dois; a troca de
  modelo continua do operador.
- **Com ~470 leads no L3, só 1 ou 2 desses testes terão leitura real.** Os outros dependem do
  eval sintético, que é um proxy, não venda.

### Roadmap revisado (substitui a ordem da §15.J)

**FASE 1 — antes de 23/10:**
1. Recusa como estado (§18).
2. Alarme de integração e cobertura.
3. Correção do retry → "duplicate".
4. Latência gravada.
5. Abertura única no assunto do anúncio, sem recepção de "atendentes".
6. Escassez sem contagem removida.
7. Gates de fato H12.
8. Braço A/B por lead.
9. Estágios reais do funil.
10. Cache de cobertura.

**FASE 1b — em paralelo, fora da produção:** eval comercial sintético com o juiz de naturalidade
(§10), calibrado pelo operador.

**FASE 2 — durante o L3, um A/B por vez, cada mudança aprovada antes no eval:**
1. Pacote de humanização H2–H5 + H7.
2. Pacote de velocidade.
3. Link após a escolha.
4. Régua contextual.
5. Prompt por estágio.

**FASES 3–5:** iguais à §15.J (Hermes vendo pedido, score calibrado, Conversions API, botões,
uma chamada só, escala).
