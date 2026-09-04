# Decisões em aberto

Escolhas de rota que dependem do operador. **Nenhuma está tomada.** Este arquivo é a pauta
da rodada de perguntas.

Formato: **decisão → opções encontradas → vantagens → desvantagens → impacto.**

---

## 1. Transporte de WhatsApp

**Opções:** (a) WAHA · (b) Baileys embutido no nosso processo · (c) Evolution ·
(d) Cloud API oficial da Meta.

| | Vantagem | Desvantagem |
|---|---|---|
| WAHA | 4 engines intercambiáveis, retry e HMAC prontos, app de números brasileiros, manutenção viva (commit em 2026-09-01) | Exige Docker e VPS |
| Baileys | Zero serviço extra; casa com "app Node.js local" da nossa stack declarada | Reimplementar sessão, mídia, reconexão, pacing |
| Evolution | Ecossistema BR, integrações prontas, botão PIX nativo | `main` sem commit desde 2026-05-06 |
| Cloud API | Sem risco de banimento; suporta anúncio CTWA nativamente | Custo por conversa, janela de 24h, templates aprovados, **verificação de negócio** |

**Impacto:** define infraestrutura, risco de banimento e se a operação é legalizável.
**[HIPÓTESE] a ausência de CNPJ (decisão firme §1) provavelmente elimina (d)** — a validar
contra as exigências atuais da Meta antes de descartar.

## 2. Onde o sistema roda

**Opções:** (a) app Node local com SQLite, como `CLAUDE.md` declara · (b) VPS 24/7 ·
(c) serverless com Postgres gerenciado.

**O conflito é real e precisa de decisão explícita:** o `CLAUDE.md` deste repositório diz
"roda como app Node.js local — SQLite não vai para serverless com disco efêmero". Mas o
WhatsApp exige **sessão viva** e o follow-up exige **relógio**. Máquina desligada é cliente
sem resposta e véspera de entrega não avisada.

**Impacto:** é a primeira decisão, porque as outras dependem dela.

## 3. Runtime do agente

**Opções:** (a) SDK da OpenAI direto, como `CLAUDE.md` declara · (b) Vercel AI SDK ·
(c) Mastra · (d) n8n.

| | Vantagem | Desvantagem |
|---|---|---|
| SDK direto | Menos dependência | Reimplementar loop, tools, retry, cache |
| AI SDK | Troca de provedor sem reescrever | Ainda escrevemos o loop |
| Mastra | Memória, workflows, `suspend/resume`, processadores e scorers prontos | Framework opinativo, churn de versão |
| n8n | Visual, rápido de prototipar, `sendAndWait` pronto | Lógica em JSON: difícil versionar, testar e revisar — colide com `CLAUDE.md` |

## 4. Memória

**Opções:** (a) colunas estruturadas · (b) working memory (bloco editável pelo agente) ·
(c) mem0.

Nosso "fato" é majoritariamente estruturado — tamanho, endereço, status do pedido, medo
declarado. **[INFERÊNCIA]** um vector store para lembrar oito campos é infra que não se
paga, e a extração custa uma chamada de LLM por evento.

## 5. Onde o pedido nasce

**Opções:** (a) API da Coinzz · (b) automação de navegador com Playwright · (c) **pedido
nativo do WhatsApp** · (d) link de checkout pré-preenchido · (e) direto na Logzz.

A opção (c) apareceu na terceira passagem de pesquisa: o protocolo do WhatsApp tem objeto
de pedido (Baileys → `src/Socket/business.ts` :254; `Types/Product.ts` :55–73) e o Evolution
monta um pedido dentro do botão de PIX (`whatsapp.baileys.service.ts` :3258–3295).
**[HIPÓTESE]** serve para COD — não verificado.

**Impacto:** define se o agente **vende** ou apenas **encaminha**.

## 6. PIX na conversa e o desconto de 5%

`PREPAY_DISCOUNT` está desligado esperando a Coinzz. Existe uma rota alternativa: **botão
de PIX nativo dentro da conversa** (Evolution → `sendMessage.dto.ts` :98,
`whatsapp.baileys.service.ts` :3258–3295), que dispensaria o salto para o checkout — que é
exatamente onde a promessa hoje se desfaz.

**Vantagem:** paga adiantado com desconto, sem sair da conversa; elimina o PIX expirado.
**Desvantagem:** exige chave PIX no nome de quem recebe, muda a natureza da oferta (deixa
de ser "não paga nada agora") e **[HIPÓTESE]** pode reintroduzir o medo de golpe, que é a
objeção dominante.
**Impacto:** mexe na promessa central da oferta. Decisão de negócio, não técnica.

## 7. Número de telefone

**Opções:** (a) o mesmo do site (`5511916616348`) · (b) número novo.

| | Vantagem | Desvantagem |
|---|---|---|
| Mesmo número | Já está no ar, já tem contatos salvos | Banimento derruba o atendimento da LP junto |
| Número novo | Isola o risco, permite aquecer | Começa do zero, com teto de aquecimento |

## 8. Handoff humano

**Opções:** (a) estado `pausado` próprio + notificação · (b) Chatwoot como caixa de
entrada · (c) detectar que o operador respondeu pelo celular.

**Impacto:** define se o operador vive dentro ou fora do sistema. Sem decisão, agente e
operador falam por cima um do outro com a mesma cliente.

## 9. Disclosure — o conflito com a promessa publicada

A LP promete, em `Objection.tsx` :13: *"WhatsApp com gente de verdade. **Não é robô.** Se
der qualquer problema, tem alguém do outro lado."*

Um agente de IA atendendo torna essa frase falsa como está escrita.

**Opções:** (a) o agente se identifica como assistente e garante humano alcançável — e a
copy da LP muda · (b) muda só a copy da LP e o agente não se identifica **[não
recomendado]** · (c) humano atende a primeira mensagem e o agente assume depois.

**Impacto:** é regra de confiança com um público cuja objeção nº 1 é golpe. Também é a
única decisão desta lista que **mexe no site**.

## 10. Base de conhecimento

**Opções:** (a) JSON/Markdown injetado no prompt · (b) RAG com embeddings · (c) skills com
matcher determinístico e disclosure progressivo (DeskcommCRM → `agent/skills.ts` :2–22).

Com ~8 fatos e 4 objeções, (b) é provavelmente desproporcional. A (c) tem a vantagem de
manter o prefixo do prompt cacheável.

## 11. Orquestração de follow-up

**Opções:** (a) tabela + worker próprios · (b) n8n · (c) cron simples.

**Impacto:** define onde mora a regra mais valiosa da operação — a confirmação pós-pedido,
função nº 3.

## 12. Escopo do primeiro corte

**Opções:** (a) só a função 3 (confirmação e acompanhamento pós-pedido) · (b) só a função 1
(atendimento inbound da campanha nova) · (c) as duas.

| | Vantagem | Desvantagem |
|---|---|---|
| (a) | Ataca o evento mais caro com o menor risco: mensagens previsíveis, sem conversa aberta | Não atende a campanha nova |
| (b) | É o que a campanha exige | Deixa o dinheiro maior na mesa |
| (c) | Completo | Dobra o escopo e o risco do primeiro corte |

## 13. Recomendação de tamanho quando as medidas divergem

Cintura aponta M, quadril aponta G. A LP não trata esse caso e ele vai acontecer.
NÃO IDENTIFICADO em qualquer referência.

## 14. Cobrança de quem não pagou (função 4)

Definida pelo operador como uma das quatro funções, mas sem nenhuma regra escrita: quantas
tentativas, em que tom, e até quando antes de virar prejuízo aceito. Nenhuma das 8
referências trata cobrança pós-recusa.
