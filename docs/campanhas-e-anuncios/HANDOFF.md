# Handoff — MCP do Meta Ads conectado, campanha de teste em construção

> Documento de continuidade entre sessões do Claude Code. Escrito pra uma sessão
> nova retomar sem precisar reconstruir o contexto. Atualizado em 2026-09-05.

## Onde isso está registrado

Este arquivo é sobre **estado ao vivo numa conta de anúncio real** (via MCP),
não sobre código. As decisões de estratégia por trás de cada escolha abaixo
(público, horário, copy, evento de otimização) estão em
[`01-campanha-e-canais.md`](01-campanha-e-canais.md) e
[`02-analise-meta-ads-e-conversoes.md`](02-analise-meta-ads-e-conversoes.md).
Os 3 ganchos de copy usados vêm de
[`../agente-ia/01-conhecimento/01-base-de-conhecimento.md`](../agente-ia/01-conhecimento/01-base-de-conhecimento.md).

## Conexão MCP

- Servidor: **Meta Ads oficial da Meta**, conectado via Settings → Connectors
  (não CLI). Ferramentas aparecem como `mcp__Meta_MCP__*`.
- Toda chamada às ferramentas de Meta Ads exige `client_conversation_id` (20
  caracteres alfanuméricos, o mesmo valor em todas as chamadas de uma mesma
  conversa). **Uma sessão nova deve gerar um `client_conversation_id` próprio**
  — não reaproveitar o desta sessão.
- Segurança confirmada: toda campanha/conjunto/anúncio nasce **PAUSADO**.
  Tentativa de `status: DELETED` num teste anterior foi **silenciosamente
  convertida pra PAUSED** pelo próprio MCP (`status_forced_to_paused: true`) —
  exclusão real só funciona direto no Gerenciador de Anúncios, não pelo MCP.

## Conta usada — **é conta de teste, não a real da Encorpa**

| Campo | Valor |
|---|---|
| Ad account ID | `1086906627130123` |
| Nome | "Yuang Choo Anto" (nome genérico, não renomeado ainda) |
| Moeda | BRL |
| Método de pagamento | **Não tem** — bloqueia criação de Anúncio (nível Ad), mesmo pausado |
| Business Manager dono | Nenhum |
| Página vinculada | "Encorp co" — `page_id 1338730272653174` (administrada pelo usuário) |
| WhatsApp Business na Página | **Não conectado** — bloqueia `destination_type=WHATSAPP` |

O usuário confirmou (2026-09-05): essa conta é só pra estudo/estrutura, a real
da Encorpa entra depois.

## O que já foi criado nessa conta (tudo pausado)

1. **Campanha de teste de conexão** (primeiro teste, sem conteúdo real):
   `120251196044590354` — "[TESTE MCP] Verificação de conexão — OK, pode
   apagar" — PAUSED. Usuário pediu pra apagar, MCP recusou (virou PAUSED em
   vez de DELETED). **Ainda existe na conta**, sem risco (sem página, sem
   pagamento) — apagar manualmente no Gerenciador de Anúncios se quiser
   limpar.

2. **Campanha de teste com conteúdo real da Encorpa**:
   `120251196105020354` — "Encorpa — CTWA — Gancho Cabide — Teste"
   - Objetivo: `OUTCOME_SALES`
   - **CBO ligado**: `campaign_daily_budget = 30000` (R$300/dia) —
     ⚠️ **isso está desatualizado face à última decisão da conversa**, ver
     "Próximo passo pendente" abaixo.
   - Conjunto de anúncios: `120251196115240354` — "Encorpa — Mulheres 20-50
     BR — TEMP REACH (trocar p/ WhatsApp depois)"
     - `optimization_goal = REACH` **temporário** — o correto seria
       `CONVERSATIONS` + `destination_type = WHATSAPP`, mas falha hoje porque
       a Página não tem WhatsApp Business conectado (erro real da API:
       "Page With WhatsApp Business Account Required").
     - Segmentação: Brasil, mulheres, 20–50 anos como **sinal** do
       Advantage+ Audience (`targeting_automation.advantage_audience`), não
       teto rígido.
   - 3 criativos criados, um por gancho validado, imagem placeholder
     (`https://httpbin.org/image/jpeg` — `placehold.co` falhou com "Image
     Wasn't Downloaded", evitar):
     - `1066418569214893` — Gancho 1 — Cabide
     - `1662373412173821` — Gancho 2 — Ajeitar a roupa
     - `28265686259754463` — Gancho 3 — Foto que não postou
   - **3 anúncios falharam ao criar** — erro "No Payment Method". Esse é o
     bloqueio atual: sem cartão cadastrado na conta, não dá pra ir além de
     Campanha/Conjunto/Criativo.

## Bloqueios reais pendentes (não são bug do MCP, são pré-requisitos de conta)

1. **Adicionar método de pagamento** na conta de teste (Gerenciador de
   Anúncios → Configurações de pagamento) — necessário até pra criar Anúncio
   pausado.
2. **Conectar WhatsApp Business à Página "Encorp co"** — necessário pra usar
   `destination_type=WHATSAPP` de verdade (hoje substituído por `REACH`).
3. Imagem é placeholder — trocar pela arte real quando houver.

## Próximo passo pendente (explicado, ainda não executado)

Discussão em andamento sobre **CBO vs. ABO**:
- Estrutura atual (1 conjunto, 3 anúncios, CBO na campanha) deixa o leilão
  favorecer o anúncio que performa melhor cedo — **não é teste justo** entre
  os 3 ganchos.
- Decisão explicada ao usuário: pra comparar os ganchos igualmente, recriar
  como **3 conjuntos de anúncios separados** (um por gancho), **sem**
  `campaign_daily_budget` na campanha (desligar CBO), e `daily_budget` igual
  em cada conjunto (ex: R$100/dia cada = ABO). CBO só volta a fazer sentido
  depois, na fase de **escalar o gancho vencedor**.
- Alternativa mencionada e ainda não construída: o teste A/B nativo do Meta
  (`ads_experiment_abtest_create_test`), que faz divisão controlada e calcula
  significância — considerado melhor que simular com 3 conjuntos manuais.
- **Usuário ainda não confirmou qual das duas abordagens seguir** — próxima
  sessão deve perguntar antes de reestruturar.

## Marco de otimização futuro (não é bloqueio de hoje, é destino declarado)

Otimização por `CONVERSATIONS` (conversa iniciada) é o teto de hoje sem
Conversions API. `docs/campanhas-e-anuncios/02-analise-meta-ads-e-conversoes.md`
já documenta a rota pra migrar pra `MESSAGING_PURCHASE_CONVERSION` (otimizar
por venda real dentro da conversa) via `facebook-nodejs-business-sdk` — isso
ainda não foi implementado em código, só pesquisado.
