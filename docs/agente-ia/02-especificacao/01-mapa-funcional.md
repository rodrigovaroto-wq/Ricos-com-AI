# Mapa funcional do agente

O que o agente precisa fazer, em oito blocos. Cada item traz
**ENTRADA → PROCESSAMENTO → SAÍDA → DADOS → SISTEMA RESPONSÁVEL**.

"Sistema responsável" descreve o **papel**, nunca o produto que vai cumpri-lo — a escolha
de tecnologia está em [`../../documentacao/decisoes/02-decisoes-em-aberto.md`](../../documentacao/decisoes/02-decisoes-em-aberto.md).

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
Taxonomia de partida (herdada de uma versão anterior deste repositório para outro
canal, adaptada aqui para inbound): `interested`, `asked_info`, `asked_pricing`,
`wants_whatsapp` (n/a no inbound — já está no WhatsApp), `objection`,
`not_interested`, `opt_out`, `ambiguous`, `needs_human`.
Referência: DeskcommCRM → `intent-classifier.ts` :90.

**B5. Contexto do turno.** Lead + histórico + conhecimento → montar prompt com identidade,
oferta, claims permitidos, estado, últimas N mensagens e fatos duráveis → contexto →
perfil, estágio, notas, tamanho, endereço, pedido → *montador de contexto*.
Referências: Mastra → `memory/memory.ts` :82–100; DeskcommCRM → `compaction.ts` :113, :190.

**B6. Resposta.** Contexto → modelo decide texto e/ou tool → mensagem → *motor do agente*.
**Regra estrutural:** texto só sai por tool `send_message`; nada que o modelo escreva fora
dela chega à cliente. Referência: DeskcommCRM → `inbound-turn.ts` :154–161.

**B7. Ritmo humano — duas camadas na primeira resposta (revisado na rodada 4).**

**Camada 1 — mensagem automática, instantânea, 24h, todo lead:**

> *"Oii, tudo bem? Recebemos sua mensagem, assim que possível uma de nossas atendentes fará
> seu atendimento, aproveite para entender melhor sobre nosso produto acessando nosso site:
> encorpa-fashion.com.br"*

Envio imediato, **independente do horário**. Não usa o ritmo humano da camada 2 — é o texto
padrão de confirmação de recebimento. Não contradiz o guardrail de identidade: fala em
"atendentes", não afirma nem nega automação.

**Camada 2 — a resposta real da agente, com personalidade:**

| Regra | Valor |
|---|---|
| Atraso da primeira resposta real, dentro do horário (06:00–00:00) | **3 minutos** |
| Se a mensagem chegou fora do horário (00:00–06:00) | **a partir das 06:00** |
| Atraso das demais respostas | **0,2 s por palavra da mensagem** |
| "Digitando" | **visível enquanto a agente prepara a resposta** |

ENTRADA: resposta pronta → PROCESSAMENTO: quebrar em bolhas, calcular o atraso, manter a
presença durante a espera → SAÍDA: 1 a 3 mensagens no ritmo de gente → *adapter de canal*.

**A janela de atendimento (06:00–00:00) vale só para a camada 2.** A camada 1 roda 24/7.

**Duas notas técnicas que a implementação precisa respeitar:**

1. **A presença de "digitando" expira em ~20 s.** Espera maior tem que reenviar a presença
   em blocos (`presenceSubscribe → composing → espera → paused`, em laço). A 0,2 s por
   palavra, uma mensagem de 100 palavras já chega no limite. Evidência: Evolution →
   `whatsapp.baileys.service.ts` :2306–2330.
2. **O atraso é por bolha, não pela resposta inteira.** Senão uma resposta de três bolhas
   fica 20 s em silêncio e depois despeja tudo de uma vez — que é o oposto do efeito
   desejado. Cada bolha espera pelo seu próprio tamanho.

Referências: DeskcommCRM → `split-message.ts` :7, :99. Evolution também valida se o número
existe no WhatsApp antes de enviar (:2295).

**Novo na rodada 3 — áudios gravados por pessoas reais.** Além de texto, o agente pode
enviar áudios pré-gravados por humanos em pontos do funil (boas-vindas, confirmação de
pedido, véspera de entrega). Isso é mídia **estática e versionada**, não texto-para-fala
gerado na hora — o mesmo padrão de "conteúdo imutável, seleção determinística" das variantes
de re-entrada (rodada 1). Consequências de projeto:

- O áudio não pode conter dado variável (nome, valor, endereço) — precisa ser genérico ou
  existir em poucas variantes por situação.
- A seleção de qual áudio toca em qual momento é decisão do agente; o conteúdo do áudio em
  si não é.
- Ainda em definição: quais mensagens recebem áudio, quantas variantes cada uma, e quem
  grava — ver [`../../documentacao/decisoes/03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md) §R3.5.

## C. Venda

**C1. Descoberta.** Primeiras mensagens → identificar o momento dela → necessidade nomeada
→ motivo declarado → *agente + memória*.
Taxonomia pronta: os três momentos em
[`../01-conhecimento/01-base-de-conhecimento.md`](../01-conhecimento/01-base-de-conhecimento.md).

**C2. Apresentação.** Necessidade → apresentar o que o produto faz **e o que não faz** →
mensagem → claims verificados → *agente + guardrail*.
Restrição dura: não emagrece; o efeito acaba ao tirar.

**C3. Recomendação de tamanho.** Manequim declarado (caminho principal) ou medida em cm
(caminho opcional) → **enviar a tabela e deixar a cliente escolher**, com "na dúvida, o
maior" → tamanho definido → tabela de medidas → *agente conduz, função valida*.
Decidido na rodada 1: medir com fita não é requisito.
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
A lista de exclusão geográfica **não precisa ser construída**: Coinzz/Logzz recusam a
criação de pedido COD fora da área coberta. O que falta é o agente tratar essa recusa como
caminho de conversa — ver §D3.

**D3. Modalidade de pagamento.** Escolha → COD é o padrão e o fechamento; o **antecipado
com 15% de desconto (R$ 110,42) é oferecido antes de finalizar**, nunca como condição →
modalidade → *agente + guardrail de preço*.

**A frase tem duas metades, e as duas são obrigatórias:** a economia de **R$ 19,48 no
produto** é real e pode ser dita; e **o frete no antecipado é calculado à parte no
checkout** — isso vai na mesma mensagem. No COD o frete está embutido nos R$ 129,90. Ver
[`04-guardrails.md`](04-guardrails.md).

**Caminho de exceção — COD indisponível para a região.** Coinzz/Logzz recusam a criação de
pedido COD fora da área coberta. Quando isso acontecer: tratar como **caminho de conversa,
não como erro**, e oferecer o antecipado **com o máximo de reforço de segurança** — é
exatamente o momento em que a oferta perde o argumento que dissolve o medo de golpe, e a
cliente precisa de mais prova, não de menos. Ver
[`../../documentacao/decisoes/03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md) §Q8 e §Q14.

**D4. Pagamento.** Modalidade → COD: nada agora, R$ 129,90 com frete embutido, em dinheiro,
cartão ou maquininha na porta. Antecipado: R$ 110,42 mais frete, por link de checkout
pré-preenchido → expectativa correta → *agente*.
**Nenhuma das 8 referências implementa COD** — confirmado por varredura mecânica.

**D5. Confirmação.** Dados completos → repetir tamanho, endereço, valor e forma, e pedir
confirmação explícita → aceite → *agente + registro*.
Referência de mecanismo: escolha por botão em vez de texto livre — WAHA →
`chatting.controller.ts` :209 (`sendButtons`), :222 (`sendList`); n8n → `sendAndWait`
(`nodes/WhatsApp/GenericFunctions.ts` :110–133), que pausa até a resposta.

## E. Pedido

**E1. Criação — confirmado na rodada 3: sempre por checkout personalizado, nunca por API de
pedido.**

| Forma de pagamento | Como o pedido nasce |
|---|---|
| **COD** (padrão) | A agente monta o **checkout personalizado pré-preenchido** (nome, telefone, endereço, tamanho, COD selecionado) e envia o link. A cliente **confirma**, sem preencher nada e sem informar pagamento |
| **Antecipado** | Mesmo mecanismo, com pagamento antecipado selecionado. A cliente **nunca envia dado de pagamento pelo chat** — só confirma no ambiente da Coinzz |

ENTRADA: dados confirmados → PROCESSAMENTO: **chamar a API da Coinzz para gerar o checkout
personalizado** com os campos pré-preenchidos → SAÍDA: link enviado à cliente → *API da
Coinzz para gerar o checkout; webhook da Coinzz para status do pedido depois*.

**Confirmado pelo operador (rodada 4): a Coinzz tem integração via API, além do webhook.**
O mecanismo deixa de ser hipótese: a API gera o checkout com os dados da cliente já
embutidos, o link volta para o agente, o agente envia, a cliente confirma.

**Por que este caminho, e não pular direto para "API cria o pedido" — decisão explícita do
operador, mantida mesmo com a API disponível:** confirmar no checkout é **mais seguro**, não
uma alternativa inferior por falta de mecanismo melhor. No COD, a cliente vê o resumo antes
de confirmar — reduz erro de tamanho/endereço e dá sensação de controle a uma audiência
desconfiada de golpe. No antecipado, o argumento é mais forte ainda: dado de pagamento nunca
trafega em texto de WhatsApp, o que evita uma exposição de segurança que qualquer auditoria
reprovaria. A API é usada para **gerar o link**, não para pular a confirmação da cliente.

**Contexto da pesquisa, mantido por referência:** nenhuma das 8 referências cria pedido via
API própria; DeskcommCRM só lê pedidos existentes (`lib/mcp/tools/comercio.ts` :27) — o
mecanismo de checkout-com-confirmação é decisão nossa, não copiado de nenhuma referência.

**E2. Registro local.** `order_id` → gravar vínculo lead↔pedido com idempotência → linha
durável → *banco*.

**E3. Status.** Webhook ou polling da Coinzz → atualizar estado → estado do pedido →
*worker*.

**E4. Logística.** Status Logzz (3 a 5 dias no COD, entrega agendada) → traduzir para a
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

**F4. Cadência — três toques, decididos na rodada 1.**

| Toque | Quando | O quê |
|---|---|---|
| 1 | 30 min de silêncio | Retomada curta, do ponto exato onde parou |
| 2 | Manhã do dia seguinte | Ângulo diferente — não repetir a frase do toque 1 |
| 3 | 3 dias depois | **Cupom de 20%, moldura "Super + dia da semana"** (rodada 4) — ex.: "Super Quinta! Você ganhou um cupom de 20%...". Último toque, com saída digna |

ENTRADA: enrollment por silêncio → PROCESSAMENTO: três toques espaçados, respeitando
opt-out e janela de horário → SAÍDA: mensagens → *agendador + gates*.

**Guardrail obrigatório:** o cupom não pode ser mencionado antes de existir na Coinzz, e o
desconto **não vaza** para quem compraria a preço cheio — ver
[`04-guardrails.md`](04-guardrails.md).

Referência de custo zero: DeskcommCRM → `reentry-template.ts` :2–11 — N variantes em
pt-BR por versão, escolha determinística por `hash(lead_id) % n`. Mesma cliente, mesma
variante; clientes diferentes, variantes diferentes, **sem chamar modelo**. É o que impede
a mesma mensagem literal de sair para centenas de números.

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
degradar em silêncio — o mesmo padrão (orçamento mensal, custo por chamada) que
[`../../documentacao/03-padroes-de-engenharia.md`](../../documentacao/03-padroes-de-engenharia.md)
registra como convenção herdada.

**H7. Decisões do agente.** Cada envio registra quais verificações passaram e quais
vetaram → *trace persistido*.
Referência: DeskcommCRM → `before-send.ts` :694–701 (`GateTraceEntry`).

**H8. Cache de prompt.** Prefixo estável (identidade + índice de skills + tools ordenadas
por nome) antes do breakpoint; o que varia por lead depois dele.
Referência: DeskcommCRM → `edge/llm/stable-prefix.ts` :29–45.
**[INFERÊNCIA]** com margem de R$ 63,35, isto é lucro, não elegância.
