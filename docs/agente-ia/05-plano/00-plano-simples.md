# O plano em uma página

> Escrito em 2026-09-23. É o resumo do
> [plano de execução v2](02-plano-de-execucao-ate-os-testes-reais.md), que continua
> sendo o detalhe: cada item com o número dele e a linha **Fechou quando**. Os números
> entre parênteses (O1, 2.8, fase 6...) apontam para lá.

---

## 1. Onde queremos chegar

**A Valen vende o colete da Encorpa sozinha pelo WhatsApp, para clientes reais, com
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
| ⏳ **Falta** | Rodar as 12 clientes de verdade · comparar os dois modelos · testar pedido real nas duas plataformas · subir a v33 · ligar o WhatsApp oficial · aquecer o número. |

**O banco de produção está vazio.** Tudo o que foi "verificado em produção" antes foi com
teste que já foi apagado. Não temos nenhuma conversa real ainda.

**O gargalo hoje não é código. É acesso.** Quase tudo que falta depende de algo que só você
consegue fazer.

---

## 3. O que só você destrava — nesta ordem

| # | O quê | Onde | Tempo | Destrava |
|---|---|---|---|---|
| 1 | **Apagar a chave `freeShipping`** do secret `BUSINESS_CONFIG` — o painel não edita o secret, só substitui: colar o JSON inteiro, já sem a chave | Supabase → Edge Functions → Secrets | 5 min | subir a v33 sem prometer frete grátis (O1) |
| 2 | ✅ **Acesso ao n8n recuperado** (23/09 — a API key responde e lista os 3 workflows ativos) | — | feito | a espera de 2 min (O2) e a proteção dos webhooks (O10) — o agente faz os dois |
| 3 | **Credenciais no ambiente da nuvem** (23/09): n8n ✅ e Supabase ✅ respondendo; **Meta ❌ devolve 401** — conferir o site `api.llama.com`, o cabeçalho `Authorization` com prefixo `Bearer`, e que a chave é a da Llama API (não o token do WhatsApp). OpenAI e Gemini **não entram** — só Meta (§R12.1) | menu do ambiente na barra da sessão → Edit | 5 min | as 12 clientes de teste e o eval (O3) |
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

## 5. O que fica para depois das vendas reais

Nada disto começa antes de haver conversas suficientes para uma taxa significar algo:

- **Hermes** lendo as conversas em lote e propondo melhorias — que **você aprova**, nunca
  aplicadas sozinhas.
- Mandar a venda confirmada de volta ao Meta Ads (Conversions API).
- Cupom do terceiro lembrete, depoimentos, tamanho M fora de Minas.

## 6. O que decidimos não fazer

Não vamos: deixar o modelo tomar ações sozinho · buscar documentos por similaridade (RAG)
· pôr o Hermes dentro da conversa · aplicar melhoria em produção sem você. Motivos na
[rodada 11](../../documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22).
