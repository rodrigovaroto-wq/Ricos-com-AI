# Mapa funcional do agente

O que o agente precisa fazer, em oito blocos. Cada item traz
**ENTRADA → PROCESSAMENTO → SAÍDA → DADOS → SISTEMA RESPONSÁVEL**.

"Sistema responsável" descreve o **papel**, nunca o produto que vai cumpri-lo — a escolha
de tecnologia está em [`../04-decisoes/02-decisoes-em-aberto.md`](../04-decisoes/02-decisoes-em-aberto.md).

Onde houver referência de implementação em outro projeto, ela aparece como `repo →
arquivo :linha` e está detalhada em [`../03-pesquisa/`](../03-pesquisa/).

---

## A. Aquisição

**A1. Clique no anúncio.** Clique em anúncio Click-to-WhatsApp → o app da cliente anexa
`contextInfo.externalAdReplyInfo` à primeira mensagem → primeira mensagem com metadados
do anúncio → `ctwa_clid`, `sourceId`, `title`, `body`, `sourceUrl`, `sourceType` →
*transporte de WhatsApp + extrator de atribuição*.
Referência: DeskcommCRM → `lib/waha/atribuicao-de-anuncio.ts` :23–56.

**A2. Identificação de campanha.** Metadados de A1 → descartar `sourceType != 'ad'` (post
orgânico compartilhado **não** é anúncio pago) e casar `ctwa_clid` com campanha/anúncio →
lead carimbado com origem → campanha, conjunto, criativo → *extrator + tabela de leads*.
Regra: **primeiro toque grava uma vez e não é sobrescrito.**

**A3. Conversão de volta para o Meta.** Eventos do funil de conversa → enviar conversão
com `ctwa_clid` → campanha otimiza por evento real → evento, valor, `ctwa_clid` →
*integração de conversões*.
Sem isto, o Meta otimiza para "conversa iniciada" — e já sabemos o custo de medir a etapa
errada.

**A4. Origem quando não é o anúncio.** Botão flutuante da LP, página de obrigado ou
anúncio → reconhecer de onde veio e se já existe pedido → contexto de abertura diferente
para cada caso → origem, pedido preexistente → *extrator + tabela de leads*.
Hoje os dois links da LP não carregam identificador nenhum (`WhatsAppFloat.tsx` :4,
`ThankYou.tsx` :44).

## B. Conversação

**B1. Recepção.** Webhook de mensagem → verificar assinatura, deduplicar por id externo,
gravar evento, enfileirar → job de turno → `external_id`, telefone, corpo, mídia →
*webhook + fila*.
Referências: WAHA → `WebhookPlugin.sender.ts` :150–177 (HMAC); DeskcommCRM →
`lib/waha/ingest.ts` :256; idempotência por chave única + violação tratada.

**B2. Agregação de mensagens picadas.** 2 a 5 mensagens em segundos → janela de debounce
antes de acionar o modelo → **um** turno com o texto consolidado → janela em ms → *fila*.
Referência: Evolution → `base-chatbot.controller.ts` :23, :108 (`debounceTime`).
Sem isso o agente responde três vezes à mesma pessoa.

**B3. Áudio e imagem viram texto antes do turno.** Mensagem de áudio/imagem/documento →
transcrever ou descrever → texto no contexto → tipo de mídia, estado da derivação →
*worker de derivação + fila*.
Referências: DeskcommCRM → `lib/messaging/media/transcription.ts` (Whisper plugável) e
`derivable.ts` :2–19 — **uma lista só** de tipos deriváveis, compartilhada por quem deriva
e por quem decide esperar; duas listas divergem e o sintoma é o agente respondendo "não
consigo ouvir" só para um formato.
Nosso público manda áudio. Sem isto o agente fica cego para parte das mensagens.

**B4. Entendimento da intenção.** Turno consolidado + estado → classificador barato antes
do turno caro → rótulo de intenção → taxonomia → *classificador*.
Taxonomia de partida já escrita em `docs/PROMPT.md` :165, a adaptar para inbound.
Referência: DeskcommCRM → `intent-classifier.ts` :90.

**B5. Contexto do turno.** Lead + histórico + conhecimento → montar prompt com identidade,
oferta, claims permitidos, estado, últimas N mensagens e fatos duráveis → contexto →
perfil, estágio, notas, tamanho, endereço, pedido → *montador de contexto*.
Referências: Mastra → `memory/memory.ts` :82–100; DeskcommCRM → `compaction.ts` :113, :190.

**B6. Resposta.** Contexto → modelo decide texto e/ou tool → mensagem → *motor do agente*.
**Regra estrutural:** texto só sai por tool `send_message`; nada que o modelo escreva fora
dela chega à cliente. Referência: DeskcommCRM → `inbound-turn.ts` :154–161.

**B7. Ritmo humano.** Resposta longa → quebrar em bolhas, mostrar "digitando", espaçar →
1 a 3 mensagens → *adapter de canal*.
Referências: DeskcommCRM → `split-message.ts` :7, :99; Evolution →
`whatsapp.baileys.service.ts` :2306–2330, que fatia a digitação em blocos de 20 s porque a
presença expira; e valida se o número existe no WhatsApp antes de enviar (:2295).

## C. Venda

**C1. Descoberta.** Primeiras mensagens → identificar o momento dela → necessidade nomeada
→ motivo declarado → *agente + memória*.
Taxonomia pronta: os três momentos em
[`../01-conhecimento/01-base-de-conhecimento.md`](../01-conhecimento/01-base-de-conhecimento.md).

**C2. Apresentação.** Necessidade → apresentar o que o produto faz **e o que não faz** →
mensagem → claims verificados → *agente + guardrail*.
Restrição dura: não emagrece; o efeito acaba ao tirar.

**C3. Recomendação de tamanho.** Medida, manequim ou descrição → mapear para P–XGG, com
"na dúvida, o maior" → tamanho recomendado → tabela de medidas → *função determinística*,
não o modelo chutando.
Ver [`../01-conhecimento/02-tabela-de-medidas.md`](../01-conhecimento/02-tabela-de-medidas.md).

**C4. Objeções.** Objeção → responder com o argumento já validado → mensagem → as 4
objeções + 4 FAQ → *base de conhecimento acionada por matcher determinístico*.
Referência de mecanismo: DeskcommCRM → `agent/skills.ts` :2–22 — só `name + description`
no prefixo cacheável do prompt; o corpo entra apenas quando o matcher dispara.
**A objeção dominante é golpe, não preço.**

**C5. Preço.** Pergunta de preço ou momento de fechar → R$ 129,90 com frete embutido,
**depois** de o medo ser nomeado → mensagem → preço de fonte única → *agente + guardrail
de promessa*.

**C6. Fechamento.** Sinal de compra → transição de estado + início da coleta → *máquina de
estados* (ver [`03-maquina-de-estados.md`](03-maquina-de-estados.md)).

## D. Conversão

**D1. Nome.** Texto → extrair e confirmar → campo → *tool de coleta com schema*.

**D2. Endereço.** Texto livre → extrair CEP, rua, número, complemento, bairro, cidade, UF;
validar CEP; **confirmar repetindo de volta** → endereço estruturado → área de entrega da
Logzz → *tool + validação*.
Referência de mecanismo: n8n → `InformationExtractor` e `OutputParserAutofixing` (quando o
JSON vem quebrado, o modelo conserta em vez de o fluxo morrer).
A lista de exclusão geográfica, hoje inexistente, entra aqui.

**D3. Modalidade de pagamento.** Escolha → **enquanto `Físico na entrega` não estiver
ativo na Coinzz, o agente não pode afirmar que não haverá cobrança antes da entrega** →
modalidade → *guardrail executável, não instrução no prompt*.

**D4. Pagamento.** Modalidade → COD: nada agora; dinheiro, cartão ou maquininha na porta →
expectativa correta → R$ 129,90 → *agente*.
**Nenhuma das 8 referências implementa COD** — confirmado por varredura mecânica.

**D5. Confirmação.** Dados completos → repetir tamanho, endereço, valor e forma, e pedir
confirmação explícita → aceite → *agente + registro*.
Referência de mecanismo: escolha por botão em vez de texto livre — WAHA →
`chatting.controller.ts` :209 (`sendButtons`), :222 (`sendList`); n8n → `sendAndWait`
(`nodes/WhatsApp/GenericFunctions.ts` :110–133), que pausa até a resposta.

## E. Pedido

**E1. Criação.** Dados confirmados → criar o pedido no sistema da operação (Coinzz/Logzz)
→ `order_id` → *integração*.
**Maior lacuna do projeto.** Nenhuma das 8 referências cria pedido; DeskcommCRM só lê
(`lib/mcp/tools/comercio.ts` :27). Existe um objeto de pedido **nativo do WhatsApp**
(Baileys → `src/Socket/business.ts` :254 `getOrderDetails`, `Types/Product.ts` :55–73), e
o Evolution monta um pedido nativo dentro do botão de PIX
(`whatsapp.baileys.service.ts` :3258–3295). **[HIPÓTESE]** serve para COD — a validar.

**E2. Registro local.** `order_id` → gravar vínculo lead↔pedido com idempotência → linha
durável → *banco*.

**E3. Status.** Webhook ou polling da Coinzz → atualizar estado → estado do pedido →
*worker*.

**E4. Logística.** Status Logzz (7 a 14 dias, entrega agendada) → traduzir para a
linguagem da cliente → aviso → *worker + agente*.

**E5. Atualização à cliente.** Mudança de status → decidir se merece mensagem → mensagem →
*follow-up*. **É a alavanca contra a recusa na porta.**

## F. Recuperação

**F1. Não respondeu a primeira.** Silêncio após entrada do anúncio → varredura por tempo →
reengajamento → *sweep + fila*.
Referência: DeskcommCRM → `lib/followup/agent-followup-gate.ts` (gatilho `silence`).

**F2. Abandono no meio da venda.** Silêncio com estágio avançado → retomar do ponto exato
→ estágio + última pergunta → *sweep + estado*.

**F3. Abandono na coleta.** Dados incompletos → pedir só o que falta → *estado + agente*.

**F4. Cadência.** Enrollment → N tentativas espaçadas, respeitando opt-out e janela de
horário → mensagens → *agendador + gates*.
Referência de custo zero: DeskcommCRM → `reentry-template.ts` :2–11 — N variantes em
pt-BR por versão, escolha determinística por `hash(lead_id) % n`. Mesma cliente, mesma
variante; clientes diferentes, variantes diferentes, **sem chamar modelo**.

## G. Pós-venda

**G1. Confirmação pós-pedido.** Pedido criado → mensagem no mesmo dia confirmando tamanho
e endereço e apresentando a pessoa do outro lado → contato salvo → *follow-up*.
É a função nº 3, a mais valiosa das quatro.

**G2. Sinal de vida no trajeto.** Pedido em rota → mensagem curta para ela não esquecer →
*follow-up*.

**G3. Véspera da entrega.** Data prevista → avisar dia, valor e formas de pagamento →
mensagem. **É a mensagem que evita a recusa por surpresa** — e já está prometida no site
(`WhatsInBox.tsx` :8).

**G4. Depois de receber.** Entrega confirmada → perguntar se serviu, ensinar o primeiro
uso, pedir foto/depoimento → prova social → *fecha o buraco da prova social do funil*.

**G5. Suporte e troca.** Problema → 7 dias a partir do recebimento → *agente + handoff*.

**G6. Recompra.** Cliente satisfeita → segunda peça ou indicação → *campanha*.
NÃO IDENTIFICADO em qualquer referência com implementação madura.

## H. Inteligência

**H1. Memória.** Fatos ditos na conversa → gravar fato durável (tamanho, medo declarado,
evento, endereço) → recall no turno seguinte → *tabela + tool*.
Referências: DeskcommCRM → `save_lead_note` / `get_lead_note`; mem0 →
`configs/prompts.py` :15 (extração) e :176–185 (reconciliação ADD/UPDATE/DELETE/NONE).
**[INFERÊNCIA]** no nosso caso a maioria dos fatos são campos estruturados, não texto
semântico.

**H2. Contexto.** Histórico → janela + compactação por orçamento → *montador*.
Referências: DeskcommCRM → `compaction.ts` :113; Mastra → `TokenLimiterProcessor` :99.

**H3. Conhecimento.** Perguntas da cliente → responder a partir de fonte controlada →
*base de conhecimento*. Fonte já existe:
[`../01-conhecimento/`](../01-conhecimento/).

**H4. Ferramentas.** Ver [`02-tools-do-agente.md`](02-tools-do-agente.md).

**H5. Estado.** Ver [`03-maquina-de-estados.md`](03-maquina-de-estados.md).

**H6. Histórico e custo.** Toda mensagem, decisão e chamada de tool persistidas com custo.
Referências: DeskcommCRM → `edge/llm/run-model-call.ts` :2–16 — **seam único**: toda
chamada de LLM passa por uma função só, que confere o orçamento **antes** de sair byte
para o provedor e grava uso e custo, inclusive tokens lidos e escritos em cache; e
`inbound-turn.ts` :432 — teto de gasto por conversa **vira handoff humano** em vez de
degradar em silêncio. Nossa própria spec já pede o equivalente (`docs/PROMPT.md` :173).

**H7. Decisões do agente.** Cada envio registra quais verificações passaram e quais
vetaram → *trace persistido*.
Referência: DeskcommCRM → `before-send.ts` :694–701 (`GateTraceEntry`).

**H8. Cache de prompt.** Prefixo estável (identidade + índice de skills + tools ordenadas
por nome) antes do breakpoint; o que varia por lead depois dele.
Referência: DeskcommCRM → `edge/llm/stable-prefix.ts` :29–45.
**[INFERÊNCIA]** com margem de R$ 63,35, isto é lucro, não elegância.
