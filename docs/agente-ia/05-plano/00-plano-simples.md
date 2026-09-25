# O plano em uma página

> Escrito em 2026-09-23. É o resumo do
> [plano de execução v2](02-plano-de-execucao-ate-os-testes-reais.md), que continua
> sendo o detalhe: cada item com o número dele e a linha **Fechou quando**. Os números
> entre parênteses (O1, 2.8, fase 6...) apontam para lá.

---

## 1. Onde queremos chegar

**A Malu vende o colete da Encorpa sozinha pelo WhatsApp, para clientes reais, com
pagamento na entrega.**

A cliente clica no anúncio, conversa, recebe o link, compra, recebe em casa e paga na porta.
A agente não promete o que a operação não cumpre. O que não sabe resolver, passa para uma
pessoa com o resumo da conversa.

Chegamos lá quando estas cinco coisas forem verdade ao mesmo tempo:

1. A versão nova da agente (**v33**) está no ar e **não promete frete grátis**.
2. As **12 clientes de teste** conversaram com ela pelo caminho de produção e nenhuma
   pegou mentira.
3. Um **pedido de teste fechou nos dois caminhos** (pagamento na entrega e antecipado).
4. O **WhatsApp oficial está ligado**, com os 3 modelos de mensagem aprovados pela Meta.
5. O **número foi aquecido** pelos dois testes de 14 dias (etapa 5).

---

## 2. Onde estamos

| | O quê |
|---|---|
| ✅ **Pronto e no ar** | A conversa inteira, do "oi" ao link de checkout, com 19 travas de segurança (gates), teto de custo e passagem para humano por e-mail. A venda confirmada volta pelo webhook e para a cobrança. É a versão **v32**. |
| ✅ **Pronto, mas só no repositório** | A **v33**: modelo novo (Muse Spark), sem frete grátis, desconto do antecipado só em "10%", recepção automática com espera de 2 min, funil e desfecho de cada turno gravados no banco. Mais as 12 clientes de teste e o programa que as roda. 3049 testes verdes. |
| ✅ **Pronto em 25/09** | **Hermes** instalado, configurado e calibrado: lê as conversas em lote, mascara dado pessoal, propõe mudanças no formato do registro, cada proposta validada (trecho literal, nada da lista do "não fazer") e testada contra os gates de hoje. Achou 3 de 3 defeitos plantados. Roda sozinho a cada 50 leads (GitHub Action) e abre um PR para você decidir. **Régua do n8n funcionando** (a credencial errada a travava desde o início). Ferramentas que impedem os erros de voltar: `dev:gates` (CI barra gate afrouxado), fuzz de 3500 mentiras, `dev:n8n` (confere o n8n que está no ar). |
| ⏳ **Falta** | Rodar as 12 clientes de verdade · comparar os dois modelos · testar pedido real nas duas plataformas · subir a v33 · ligar o WhatsApp oficial · aquecer o número. |

**O banco de produção está vazio.** Tudo o que foi "verificado em produção" antes foi com
teste que já foi apagado. Não temos nenhuma conversa real ainda.

**O gargalo hoje não é código. É acesso.** Quase tudo que falta depende de algo que só você
consegue fazer.

---

## 3. O que só você destrava — nesta ordem

| # | O quê | Onde | Tempo | Destrava |
|---|---|---|---|---|
| 1 | ✅ **Chave `freeShipping` apagada** do secret `BUSINESS_CONFIG` (operador, 23/09 — JSON inteiro substituído). O secret não é legível: a prova é a sonda 6.5 no deploy | Supabase → Edge Functions → Secrets | feito | subir a v33 sem prometer frete grátis (O1) |
| 2 | ✅ **Acesso ao n8n recuperado** (23/09 — a API key responde e lista os 3 workflows ativos) | — | feito | a espera de 2 min (O2) e a proteção dos webhooks (O10) — o agente faz os dois |
| 3 | **Credenciais no ambiente da nuvem** (23/09): n8n ✅ e Supabase ✅. **Meta ❌** — a Muse Spark 1.3 é servida pela **Meta Model API** ([dev.meta.ai](https://dev.meta.ai/docs/protocols/chat-completions)), em **`api.meta.ai`**. A credencial precisa ter **Sites permitidos = `api.meta.ai`**, cabeçalho `Authorization`, prefixo `Bearer`, e a chave criada em dev.meta.ai. Hoje `api.meta.ai` responde `invalid_api_key` | menu do ambiente na barra da sessão → Edit | 5 min | as 12 clientes de teste e o eval (O3) |
| 4 | **Coinzz:** ✅ forma de pagamento respondida (ver O5 no plano v2 — achado sem efeito hoje) · ✅ páginas de obrigado configuradas · ⏳ o payload real do webhook, no próximo pedido | e-mail do n8n | 10 min | o mapeamento da venda (O6) |

Mais adiante, e já em andamento: **token do WhatsApp Cloud API** e **aprovação dos 3
modelos de mensagem** na Meta (O8), e um **token de acesso do Supabase** no dia do deploy,
revogado depois (O4).

Duas decisões rápidas suas, sem pressa: se Coinzz e Logzz conseguem mandar um cabeçalho
customizado no webhook (decide onde vai a senha dos webhooks), e se revoga a permissão
da função `rls_auto_enable` (a revisão de segurança recomenda revogar — item 1.6).

---

## 4. O caminho em 5 etapas

Cada etapa só começa quando a anterior fecha.

### Etapa 1 — Destravar (você)

Os itens da seção 3. **Pronto quando:** as credenciais aparecem numa sessão nova e o
agente consegue abrir o n8n pela API.

Enquanto isso, o agente faz sozinho o que não depende de você: tira o Gemini do turno e
do runner (só Meta — item 2.10), e o turno passa a avisar as
travas quando a conversa é sobre o **antecipado** (hoje elas sempre acham que é pagamento
na entrega — item 2.8).

### Etapa 2 — Testar por dentro (agente)

1. **Rodar as 12 clientes de teste** contra a v33, sem ela estar no ar. Cada uma tenta
   arrancar uma mentira diferente: frete grátis, prazo inventado, desconto sem número,
   promessa de saúde, "é golpe?". Duas rodadas: achar, consertar, conferir (3.4, 3.5).
2. **Avaliar a Muse Spark** com as mesmas 12, contra a rubrica: taxa de erro, custo por
   conversa, turnos até o link. Só a API da Meta — OpenAI e Gemini saíram (§R12.1). **Você
   aprova** com a tabela na mão (fase 4).
3. **Mapear o webhook da Coinzz** contra o payload real, e fazer o webhook de venda
   marcar a conversa como "em rota", "entregue e paga" ou "recusada" (5.1, 5.8).

**Pronto quando:** as 12 passam sem mentira e você aprovou a Muse Spark.

### Etapa 3 — Subir a v33 (agente, com você no deploy)

1. Espera de 2 min no n8n e senha nos dois webhooks (O2, O10). **Os dois antes do deploy**:
   sem a espera, lead novo recebe a recepção e nunca mais é respondido; sem a senha,
   qualquer um com a URL pode escrever na conversa de uma cliente ou forjar um pedido.
2. Deploy da v33 e teste com um lead falso pelo caminho real (fase 6).
3. Pedido de teste nos **dois caminhos**, depois cancelado — e conferir que as mensagens
   de acompanhamento param (5.3 a 5.6).
4. Relatórios simples no banco: onde as conversas travam, quanto custa cada uma (fase 7).

**Pronto quando:** a v33 está no ar, o lead falso recebeu as duas mensagens no tempo certo
e os dois pedidos de teste fecharam.

### Etapa 4 — Ligar o WhatsApp (depende da Meta)

Token, 3 modelos aprovados, mensagem saindo em bolhas, limite de mensagens por dia,
origem do anúncio gravada no lead, e só mandar mensagem de marketing a quem autorizou
(fase 8). Os 3 modelos já estão escritos e aprovados pelas travas.

**Pronto quando:** uma mensagem de acompanhamento fora da janela de 24 h sai como modelo
aprovado.

### Etapa 5 — Ensaio geral e os dois testes de 14 dias

Decisão do operador (23/09): **o aquecimento do número acontece dentro destes dois testes**,
não antes. Tráfego só nas **22 cidades** onde existe pagamento na entrega.

1. **Antes:** as 12 clientes de teste **pelo WhatsApp de verdade**, no celular (9.1).
2. **Teste 1:** 5 criativos · oferta · funil · logística · a primeira versão da agente
   com clientes reais. Sai dele: os 2 criativos vencedores e a lista de correções da
   agente, lida em `turn_outcomes` e nas conversas.
3. **Teste 2:** 1 dos 2 criativos vencedores · validar o que mudou na oferta e no funil
   (se mudou) · validar as correções e otimizações da agente.

**Pronto quando:** o primeiro pedido real foi entregue e pago, e o teste 2 confirmou as
correções do teste 1.


---

## 5. O Hermes em cada etapa

O Hermes é o que faz a Malu melhorar com as conversas — com o mesmo peso de n8n e Supabase:

- **Etapa 2 (agora):** roda sobre cada rodada de personas e é calibrado com defeitos
  plantados (`pnpm hermes:calibrar`) — prova que acha o problema quando ele existe.
- **Etapa 3:** três segredos no GitHub (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `META_API_KEY`) ligam a execução automática.
- **Etapas 4 e 5:** a cada 50 leads reais ele lê as conversas e abre um PR com as propostas.
  Você aceita (vira entrada do registro, medida pelo placar) ou fecha o PR. Nunca aplica
  nada sozinho (R11.6).

## 6. O que fica para depois das vendas reais

Nada disto começa antes de haver conversas suficientes para uma taxa significar algo:

- Mandar a venda confirmada de volta ao Meta Ads (Conversions API).
- Cupom do terceiro lembrete, depoimentos, tamanho M fora de Minas.

## 7. O que decidimos não fazer

Não vamos: deixar o modelo tomar ações sozinho · buscar documentos por similaridade (RAG)
· pôr o Hermes dentro da conversa · aplicar melhoria em produção sem você. Motivos na
[rodada 11](../../documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22).

---

## Pendências do operador — lembrar quando ele perguntar o que falta

| Desde | O quê | Onde |
|---|---|---|
| 23/09 | **Payload real do webhook da Coinzz** (O6), com CPF, telefone e nome trocados por `XXX` — no próximo pedido | e-mail de aviso do n8n |
| 23/09 | **Credencial da Meta** com site `api.meta.ai` (item 3 acima) | ambiente da nuvem → Edit |
| 24/09 | **Voltar da variante `-contributor` para `muse-spark-1.3`** antes da operação real (apagar os secrets `CONVERSATION_MODEL` e `CONVERSATION_MODEL_PRICE`) — a contributor cede as conversas para treino da Meta | Supabase → Edge Functions → Secrets |
| 24/09 | **Quatro decisões da rodada de personas** ([relatório](05-rodada-personas-2026-09-24.md)): o link de compra sai sem e-mail? · texto da recepção automática (hoje promete "atendentes") · desligar a escassez "restam 12 unidades" sem contagem real · CNPJ e texto aprovado sobre o CPF | resposta no chat |
