# Varredura profunda — terceira passagem

> Complementa [`02-analise-dos-8-repositorios.md`](02-analise-dos-8-repositorios.md) e [`03-extracao-por-necessidade.md`](03-extracao-por-necessidade.md).
> Nada implementado. Nada escolhido.

## Método, dito com honestidade

O corpus dos 8 repositórios tem **7.440.566 linhas de código** em 47.834 arquivos:

| Repo | Arquivos | Linhas de código |
|---|---:|---:|
| n8n | 24.538 | 3.861.381 |
| mastra | 12.833 | 2.528.782 |
| deskcomm | 2.921 | 433.603 |
| chatwoot | 5.357 | 229.885 |
| mem0 | 1.170 | 203.823 |
| waha | 650 | 81.935 |
| Baileys | 155 | 67.479 |
| evolution-api | 210 | 32.678 |

Ler isso linha a linha com atenção humana não é possível — e ninguém deveria acreditar em
quem disser que leu. O que foi feito: **varredura mecânica que passa por todas as linhas**
(busca por dezenas de conceitos aplicada ao corpus inteiro), seguida de leitura dirigida de
cada acerto relevante. Os conceitos varridos: catálogo, produto, pedido, carrinho, pagamento,
PIX, pagamento na entrega, endereço, CEP, opt-out/STOP, transcrição/áudio, imagem, template,
janela de 24h, etiqueta, presença/digitando, cache de prompt, orçamento/custo, retry,
idempotência, deduplicação, fila, handoff, agendamento, classificação, extração estruturada,
sentimento, merge de contato, e as variações em português de cada um.

---

# Peças novas encontradas nesta passagem

## 1. O protocolo do WhatsApp tem catálogo e pedido nativos — e dois repositórios os implementam

Isso muda a lacuna que eu tinha declarado como "não resolvida por ninguém" (criação de pedido).

| Repo | Peça | Localização |
|---|---|---|
| Baileys | `getCatalog` | `src/Socket/business.ts` :157 (`xmlns: 'w:biz:catalog'`, tag `product_catalog`) |
| Baileys | `getCollections` | `src/Socket/business.ts` :208 |
| Baileys | **`getOrderDetails(orderId, tokenBase64)`** | `src/Socket/business.ts` :254 (tag `order`) |
| Baileys | `productCreate` / `productUpdate` | `src/Socket/business.ts` :338 / :300 |
| Baileys | Tipos do pedido | `src/Types/Product.ts` :55–73 → `OrderPrice{currency,total}`, `OrderProduct{id,imageUrl,name,quantity,currency,price}`, `OrderDetails{price,products}` |
| Baileys | Tipos de mensagem | `src/Types/Message.ts` :67 `productMessage`, :69 `orderMessage` |

**[INFERÊNCIA]** Existe um objeto "pedido" nativo do WhatsApp que a cliente vê dentro da
conversa, com itens e valores. Não é o pedido da Coinzz/Logzz, mas é uma superfície que hoje
não está no nosso desenho.
**[HIPÓTESE]** Se serve para COD é outra questão — não verifiquei se `order.status` aceita um
fluxo sem pagamento antecipado.

## 2. Botão de PIX nativo dentro da conversa — com objeto de pedido embutido

| Repo | Peça | Localização |
|---|---|---|
| Evolution | Tipos de botão | `src/api/dto/sendMessage.dto.ts` :98 → `TypeButton = 'reply' \| 'copy' \| 'url' \| 'call' \| 'pix'` |
| Evolution | Montagem do botão PIX | `whatsapp.baileys.service.ts` :3258–3295 → JSON com `order{status:'pending', order_type:'ORDER', items[], subtotal}` + `payment_settings[{type:'pix_static_code', pix_static_code:{merchant_name, key, key_type}}]` |
| Evolution | Regras de uso | mesmo arquivo :3320–3335 → só **um** botão PIX por mensagem, e ele não se mistura com botões que não sejam `reply` |
| Evolution | Mapa de tipos | :3298–3302 → `reply→quick_reply`, `copy→cta_copy`, `url→cta_url`, `pix→payment_info` |

**Relação direta com o nosso código:** `colet/src/lib/checkout.ts` :42–49 tem
`PREPAY_DISCOUNT` desligado, esperando a Coinzz configurar 5% de desconto no pagamento
antecipado. Um botão de PIX dentro da conversa é uma rota para esse desconto **sem o salto
para o checkout** — a rota que ninguém tinha colocado na mesa. Não estou propondo: estou
registrando que existe.

## 3. "Digitando" tem timeout de 20 segundos, e quase todo mundo erra isso

| Repo | Peça | Localização | O que ensina |
|---|---|---|---|
| Evolution | `sendMessageWithTyping` | `whatsapp.baileys.service.ts` :2289–2340 | Antes de enviar, **valida se o número existe no WhatsApp** (`whatsappNumber`, :2295). Depois, para simular digitação por mais de 20 s, **fatia em blocos de 20 s** com `presenceSubscribe` → `composing` → `delay(20000)` → `paused`, em laço (:2306–2330) |
| Baileys | `sendPresenceUpdate` | `src/Socket/chats.ts` :809, :843 | A primitiva por baixo |

Validar o número antes de enviar também evita gravar lead com número que não tem WhatsApp —
erro barato de cometer com tráfego pago.

## 4. Detector de opt-out em português, com o incidente de produção documentado

| Repo | Peça | Localização |
|---|---|---|
| DeskcommCRM | `lib/opt-out/deteccao.ts` | Cabeçalho :1–42 (a regra e o porquê); `PALAVRAS_DE_OPT_OUT` :58; `ehPalavraIsolada` :307; **`ehPedidoDeOptOut`** :319; **`ehOptOutProvavel`** :332 |

O arquivo documenta o que a regex ingênua causou numa instalação real:

> `"tem como parar a dor?"` → paciente BLOQUEADO
> `"posso sair antes das 15h?"` → paciente BLOQUEADO
> `"não quero mais receber nada"` → **não** bloqueava

A regra correta: verbo de cessação **+ objeto de comunicação** ("parar de me mandar", "sair
da lista"), ou a palavra **isolada** como mensagem inteira. E dois níveis: o inequívoco grava
bloqueio permanente; o ambíguo ("me deixa em paz", "chega") apenas **para de responder e
escala ao humano** — porque quem silencia alguém para sempre deveria ser uma pessoa.

No nosso caso isso é ainda mais sensível: "para" e "sair" são vocabulário normal numa venda
("para qual tamanho?", "sai quanto?").

## 5. Cache de prompt — o item de custo com maior alavanca

| Repo | Peça | Localização | O que faz |
|---|---|---|---|
| DeskcommCRM | `edge/llm/stable-prefix.ts` | :6–15, :29–45 | Marca `cacheControl: {type:'ephemeral', ttl}` no fim do prefixo estável (playbook) e na última tool; **as tools são reordenadas por nome** para o prefixo não mudar entre chamadas. O que varia por lead entra **depois** do breakpoint |
| DeskcommCRM | `edge/llm/run-model-call.ts` | :2–16, :404–417 | **Seam único**: toda chamada de LLM do sistema — agente, classificadores e compactação — passa por uma função só. Ela resolve config, **checa o orçamento antes de sair byte para o provedor**, e grava uso e custo incluindo `cacheReadTokens` / `cacheWriteTokens` |
| Mastra | `response-cache.ts` | `packages/core/src/processors/processors/response-cache.ts` :1–12 | Cache por hash estável do prompt |
| DeskcommCRM | Skills com disclosure progressivo | `agent/skills.ts` :9–13 | O índice das skills fica no prefixo cacheável; o corpo entra no sufixo por lead — cache preservado |

**[INFERÊNCIA]** Com margem de R$ 63,35 por entrega paga, a diferença entre um prompt
cacheado e um prompt remontado a cada mensagem é diretamente lucro.

## 6. Variação de mensagem sem custo de LLM

| Repo | Peça | Localização |
|---|---|---|
| DeskcommCRM | `agent/reentry-template.ts` | :2–11 |

Cada versão de template de re-entrada guarda **N variantes em pt-BR**, e a escolha por lead é
**determinística**: `hash(lead_id) % nº de variantes`. Mesmo lead, sempre a mesma variante;
leads diferentes, variantes diferentes. É o anti-template-idêntico **no caminho de custo
zero**, sem chamar modelo. Versões imutáveis, deploy e rollback movendo um ponteiro.

Para a nossa sequência pós-pedido — a mesma mensagem para centenas de clientes — isso resolve
o risco de banimento sem gastar um token.

## 7. Áudio e imagem: o cliente não escreve só texto

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| DeskcommCRM | `lib/messaging/media/transcription.ts` | :7–30 → interface `TranscriptionProvider` + provedor Whisper/OpenAI-compatível | Áudio vira texto antes do agente responder |
| DeskcommCRM | `lib/messaging/media/derivable.ts` | :2–19 → `TIPOS_DERIVAVEIS`, `DERIVACAO_TERMINADA` | **Uma lista só**, compartilhada pelo worker que deriva e pelo drain que decide se espera a derivação antes de despachar o turno. O cabeçalho explica o sintoma de ter duas listas: "o agente respondendo 'não consigo ouvir' só para um formato" |
| DeskcommCRM | `agent/media-parts.ts` | :2–22 | Imagem nativa para o modelo, **capability-gated** por provedor+modelo; manda **bytes**, não URL assinada, porque o fetch do provedor tem allowlist e não baixaria do nosso bucket |
| n8n | Tipos de mensagem | `packages/nodes-base/nodes/WhatsApp/MessagesDescription.ts` :163–187 → `audio`, `contacts`, `document`, `image`, `location`, `text`, `video` | Inventário do que pode chegar e sair |

Nosso público manda áudio. Sem transcrição, o agente fica cego para uma fração alta das
mensagens — e a coordenação "espera a derivação antes de responder" é o tipo de bug que só
aparece em produção.

## 8. Decompor o agente em tarefas pequenas em vez de um só prompt gigante

| Repo | Peça | Localização | Para quê |
|---|---|---|---|
| n8n | `InformationExtractor` | `packages/@n8n/nodes-langchain/nodes/chains/InformationExtractor` | Extrair endereço estruturado de texto livre |
| n8n | `TextClassifier` | `.../chains/TextClassifier` | Classificar intenção |
| n8n | `SentimentAnalysis` | `.../chains/SentimentAnalysis` | Detectar irritação → handoff |
| n8n | `OutputParserStructured` | `.../output_parser/OutputParserStructured` | Saída em JSON validado |
| n8n | **`OutputParserAutofixing`** | `.../output_parser/OutputParserAutofixing` | Quando o JSON vem quebrado, o próprio modelo conserta em vez de o fluxo morrer |
| Mastra | `TokenLimiterProcessor` | `packages/core/src/processors/processors/token-limiter.ts` :99 | Cortar contexto por orçamento de tokens |
| Mastra | `ToolCallFilter` | `.../processors/tool-call-filter.ts` :30 | Esconder do histórico chamadas de tool que não interessam mais |
| Mastra | Processadores de memória | `packages/core/src/processors/memory/{working-memory,semantic-recall,message-history,embedding-cache}.ts` | Camadas de memória como processadores plugáveis |

## 9. Vocabulário de operações sobre uma conversa

| Repo | Peça | Localização |
|---|---|---|
| Chatwoot | `ActionService` | `app/services/action_service.rb` :9–84 → `mute_conversation`, `snooze_conversation`, `resolve_conversation`, `open_conversation`, `pending_conversation`, `change_status`, `change_priority`, `add_label`, `remove_label`, `assign_agent`, `assign_team`, `remove_assigned_agent`, `remove_assigned_team`, `send_email_transcript` |
| Chatwoot | Ações de automação | `app/services/automation_rules/action_service.rb` :25–57 → `send_attachment`, `send_webhook_event`, `send_message`, `add_private_note`, `send_email_to_team` |
| Chatwoot | Identificação de contato | `app/builders/contact_inbox_with_contact_builder.rb` :8–68 → `find_or_create_contact_and_contact_inbox`, busca por `identifier` e por `phone_number` |
| Chatwoot | Fusão de contato | `app/actions/contact_merge_action.rb` :5; `contact_identify_action.rb` |
| Chatwoot | Variáveis em mensagem | `app/services/whatsapp/liquid_template_processor_service.rb` :12–31 → Liquid com filtro de escape JSON e checagem de render vazio (:46–61) |
| WAHA | Etiquetas do WhatsApp Business | `src/api/labels.controller.ts` :43–151 → CRUD de etiqueta, etiquetas de um chat, chats de uma etiqueta |

As etiquetas do WAHA merecem atenção: são as **mesmas etiquetas que o operador vê no app do
WhatsApp Business no celular dele**. Marcar "aguardando endereço" ou "pedido criado" ali
aparece no telefone sem precisar de painel nenhum.

## 10. Quando o sistema quebra, o que a pessoa lê

| Repo | Peça | Localização |
|---|---|---|
| DeskcommCRM | `lib/channels/frases-de-falha.ts` | :17–43 |

Cada código de erro do canal vira uma frase que diz **o que fazer**, não o que falhou:
*"O número escolhido não está conectado no momento. Reconecte em Conexões — a mensagem sai
sozinha quando ele voltar."* O cabeçalho registra a regra: uma frase genérica apagaria a
mensagem original do provedor, que às vezes é a única pista.

## 11. Memória procedural — para o follow-up que acontece dias depois

| Repo | Peça | Localização |
|---|---|---|
| mem0 | `PROCEDURAL_MEMORY_SYSTEM_PROMPT` | `mem0/configs/prompts.py` :326+ |

Resume a **própria execução do agente** (objetivo, progresso, ações numeradas com parâmetros)
para que ele continue a tarefa sem ambiguidade depois. Diferente da memória de fatos do lead:
é a memória do que o agente já fez. Encaixa no nosso caso em que o agente volta 3 dias depois
e precisa saber onde parou e o que já prometeu.

---

# Confirmação mecânica da lacuna central

Varredura por `cash on delivery`, `contra-entrega`, `pagamento na entrega`, `COD` em
`deskcomm/lib`, `deskcomm/docs`, `waha/src`, `evolution-api/src`, `Baileys/src`,
`chatwoot/app`, `chatwoot/enterprise`, `mem0/mem0`, `mastra/packages/core/src`,
`n8n/packages/nodes-base/nodes`:

**Zero acertos reais.** Os únicos retornos foram um cabeçalho de planilha em
`deskcomm/lib/catalogo/planilha.ts`, arquivos de fonte binários do Chatwoot, traduções em
romeno e gravações de teste de voz do Mastra — todos falsos positivos por substring.

Isto **confirma mecanicamente**, e não por impressão, a conclusão das passagens anteriores:
**pagamento na entrega não existe em nenhuma das 8 referências.** O modelo econômico que
define se ganhamos ou perdemos dinheiro — +R$ 63,35 na entrega paga, −R$ 14,98 ou −R$ 54,98
na recusa — é território sem mapa. Tudo que os repositórios oferecem vale para a conversa;
nada vale para a porta.

---

# Estado da cobertura, depois de três passagens

| Repo | Cobertura estimada do que é relevante para nós | O que continua sem leitura |
|---|---|---|
| DeskcommCRM | alta | 230 route handlers, 190 migrations, `app/`, frontend |
| WAHA | alta | interior das engines, dashboard |
| Evolution | média-alta | cache, filas internas, canal Meta |
| Baileys | média-alta | `Signal/`, `WABinary/`, envio de mídia por dentro |
| Chatwoot | média | controllers, jobs, listeners, frontend Vue |
| mem0 | média | `mem0-ts` a fundo, `server/`, grafos |
| Mastra | média-baixa | deployer, cli, auth, observability, `di`, `channels` |
| n8n | baixa | ~1.500 nós, editor, motor de execução, expressões |

Mastra e n8n seguem com a menor cobertura proporcional — são 6,4 milhões de linhas dos 7,4
milhões do corpus, e a maior parte é irrelevante para um agente de vendas de um produto só.
**[INFERÊNCIA]** o retorno de continuar varrendo esses dois é decrescente; o que faltava de
alto valor neles já apareceu.
