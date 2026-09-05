# Plano de construção — do MVP ao início dos testes

> **Status deste documento:** plano de execução, não decisão de negócio nova.
> Tudo aqui deriva do que já está registrado em [`../00-contexto/`](../00-contexto/),
> [`../02-especificacao/`](../02-especificacao/), [`../03-pesquisa/`](../03-pesquisa/) e
> [`../04-decisoes/03-decisoes-tomadas.md`](../04-decisoes/03-decisoes-tomadas.md).
> Onde este plano precisa de algo que ainda não foi decidido, isso está marcado como
> **pergunta aberta**, não como suposição.

## Como ler este documento

1. [**Onde estamos**](#1-onde-estamos) — o que já existe, em uma imagem
2. [**O que o agente vai fazer**](#2-o-que-o-agente-vai-fazer) — a árvore de funções e peças
3. [**As cinco ondas de construção**](#3-as-cinco-ondas-de-construção) — o trabalho, em ordem
4. [**Perguntas que preciso te fazer**](#4-perguntas-que-preciso-te-fazer-antes-de-cada-onda) — por onda, para você responder quando chegar a vez
5. [**Critério de saída do MVP**](#5-critério-de-saída-do-mvp) — como saber que terminou
6. [**Riscos**](#6-riscos-que-o-plano-não-resolve-sozinho)

---

## 1. Onde estamos

![Linha do tempo: do contexto ao MVP](img/caminhada.svg)

**Já feito** (documentação e decisão, zero código do agente):

- Contexto completo do negócio: oferta, economia do COD, público, os dois caminhos de venda
- Pesquisa em 8 repositórios open source, lida em código, com padrões extraídos por necessidade
- Quatro rodadas de decisão com o operador — praticamente todas as perguntas de negócio resolvidas
- O site (`colet-cinta-modeladora`) já tem as duas ofertas de checkout (COD e antecipado) implementadas, testadas com 11 personas no navegador, e em PR aberto

**Ainda não existe:** nenhuma linha de código do agente. Nenhum banco de dados. Nenhuma conexão com WhatsApp. Isso é o que este plano cobre.

---

## 2. O que o agente vai fazer

![Árvore de funções e sub-agentes](img/arvore-do-agente.svg)

Um único **orquestrador** decide o que fazer a cada turno de conversa. Ele aciona três funções — na ordem de prioridade já decidida ([`03-decisoes-tomadas.md`](../04-decisoes/03-decisoes-tomadas.md) §Q5) — e duas camadas de apoio, compartilhadas pelas três.

### As três funções (o que a cliente sente)

| # | Função | Cobre |
|---|---|---|
| 1 | **Pré-venda** | Do clique no anúncio até o pedido criado — a conversa que vende |
| 2 | **Pós-pedido** | Confirmação no mesmo dia, sinal de vida na rota, aviso na véspera, pergunta pós-entrega |
| 3 | **Recuperação** | Três toques para quem parou de responder, com cupom de 20% no terceiro |

A recuperação de carrinho abandonado **no site** (função 2 da lista original do operador) é onda 3 deste plano — depende de o site avisar o agente, o que ainda não existe.

### A camada compartilhada (como ele decide)

**Sub-agentes que usam modelo de linguagem** — cada chamada custa dinheiro, então só entram quando precisam: classificador de intenção, classificador de estágio do funil, extrator de endereço a partir de texto livre, transcrição de áudio.

**Peças determinísticas, sem modelo** — rodam em toda mensagem, custo zero: sentinela de opt-out (dois níveis, ver [`04-guardrails.md`](../02-especificacao/04-guardrails.md)), sentinela de pedido de humano, recomendador de tamanho (tabela + regra do maior), a cadeia de 11 guardrails antes de qualquer envio, pacing anti-banimento, agendador de follow-up.

Essa divisão não é estética: é a decisão de arquitetura mais repetida na pesquisa (`03-pesquisa/03-extracao-por-necessidade.md` §N3, N4) — o que pode ser regra determinística nunca deveria custar uma chamada de modelo.

---

## 3. As cinco ondas de construção

Cada onda entrega algo que dá para testar sozinho, antes de seguir para a próxima. Nenhuma onda espera a anterior estar "perfeita" — espera ela estar **verificável**.

### Onda 0 — Fundação técnica

O que precisa existir antes de qualquer conversa acontecer.

| Item | Decisão já tomada | Trabalho desta onda |
|---|---|---|
| Onde roda | VPS 24/7 (`03-decisoes-tomadas.md` §Q2) | Provisionar a VPS, subir o processo Node |
| Banco | SQLite, sem serverless (`CLAUDE.md`) | Schema inicial: leads, conversas, mensagens, pedidos, follow-ups |
| Transporte WhatsApp | WAHA (`03-decisoes-tomadas.md` §Q3) | Subir o WAHA, conectar o número novo (§Q4), configurar webhook de entrada |
| Fila de trabalho | Tabela SQL, sem Redis (`02-lacunas.md` #10) | Implementar enqueue/claim/complete |
| Runtime do agente | **Em aberto** (`02-decisoes-em-aberto.md` §3) | Escolher e montar o loop de chamada ao modelo |

**Critério de saída:** uma mensagem mandada para o número novo chega no banco de dados, e uma resposta escrita à mão no banco sai pelo WhatsApp. Ainda sem inteligência nenhuma — só o cano funcionando.

### Onda 1 — Pré-venda

A conversa que leva do anúncio ao pedido criado. **Inclui a régua de silêncio dentro da
própria conversa** — a decisão que fixou esta ordem (`03-decisoes-tomadas.md` §Q5) já avisa
que os três toques de retomada (Q9) *"são intrínsecos à pré-venda e não dá para separar
dela"*: quem some no meio de uma conversa ainda está dentro da função 1, não é uma função à
parte.

| Peça | Onde está especificada |
|---|---|
| Recepção com camada dupla (mensagem automática + resposta real) | `03-decisoes-tomadas.md` §R4.4 |
| Debounce de mensagens picadas | `01-mapa-funcional.md` §B2 |
| Transcrição de áudio | `01-mapa-funcional.md` §B3, `03-decisoes-tomadas.md` §R3.5 (só boas-vindas e explicação do produto no MVP) |
| Classificação de intenção | `01-mapa-funcional.md` §B4 |
| Base de conhecimento (objeções, FAQ) | `01-conhecimento/01-base-de-conhecimento.md` |
| Recomendação de tamanho | `01-conhecimento/02-tabela-de-medidas.md` |
| Máquina de estados | `02-especificacao/03-maquina-de-estados.md` |
| Guardrails antes do envio | `02-especificacao/04-guardrails.md` |
| Geração do link de checkout | `03-decisoes-tomadas.md` §R3.1, §R4.1 |
| **Régua de silêncio na conversa** — 3 toques, cupom de 20% no terceiro | `01-mapa-funcional.md` §F1–F4, `03-decisoes-tomadas.md` §Q9, §R4.3 |
| Moldura do cupom "Super + dia da semana" | `03-decisoes-tomadas.md` §R4.3 |
| Gate de cupom inexistente | `02-especificacao/04-guardrails.md` |
| Handoff humano (para e notifica) | `03-decisoes-tomadas.md` §Q12 |
| Teto de custo por conversa | `01-mapa-funcional.md` §H6 |

As duas últimas linhas — handoff e teto de custo — são requisitos **transversais**: valem
para toda função, não só a pré-venda, mas precisam existir já nesta onda porque é aqui que a
conversa aberta primeiro acontece, e é conversa aberta que mais precisa de rede de segurança.

**Critério de saída:** o time interno consegue conversar com o agente do zero até receber um
link de checkout válido, com tamanho certo e endereço confirmado; uma conversa que silencia
recebe os três toques no tempo certo, com o cupom só mencionado se já existir na Coinzz; e um
caso forçado fora de escopo escala para humano em vez de inventar resposta.

### Onda 2 — Pós-pedido

A régua que ataca o evento mais caro da operação: a recusa na porta.

| Peça | Onde está especificada |
|---|---|
| Webhook da Coinzz para status do pedido | `01-mapa-funcional.md` §E3 |
| Confirmação no mesmo dia | `00-contexto/05-decisoes-firmes.md` §8 |
| Sinal de vida na rota, aviso na véspera | `01-mapa-funcional.md` §G2, §G3 |
| Pergunta pós-entrega, pedido de foto/depoimento | `01-mapa-funcional.md` §G4 |
| Trace de guardrail por mensagem (auditoria) | `02-especificacao/04-guardrails.md` |

**Critério de saída:** um pedido de teste criado manualmente no banco recebe as quatro
mensagens da régua nos momentos certos, sem intervenção humana.

### Onda 3 — Testes internos

| Etapa | O que é |
|---|---|
| Personas internas | Igual ao que já foi feito no site: um roteiro por perfil de cliente (decidida, indecisa, que erra o tamanho, que pergunta se é robô, que pede para parar), rodado por gente da equipe fingindo ser cliente |
| Ensaio com número de teste | Time interno mandando mensagens reais para o WhatsApp do agente, sem tráfego pago ainda |

**Critério de saída:** pelo menos três das personas de teste rodam limpo, sem violar
nenhum guardrail — ver seção 5.

### Onda 4 — Piloto pago

| Etapa | O que é |
|---|---|
| Piloto com verba baixa | Uma fração pequena do orçamento diário, só para medir CPL e conversão real contra o [modelo econômico](../00-contexto/06-modelo-economico.md) |

**Critério de saída — o fim deste plano:** ver a seção 5.

### Fora das cinco ondas: o que fica para depois do MVP

Dois itens da ordem de prioridade do Q5 **não** entram no caminho crítico acima, porque a
própria decisão os coloca como prioridade 3 e 4 — abaixo de pré-venda e pós-pedido:

- **Recuperação de carrinho do site** (abandono no checkout, não na conversa — outro
  gatilho, outra fonte de dado: o pixel `InitiateCheckout` do site sem conversão em N
  minutos). Fica como próxima onda **depois** do MVP, a menos que você prefira antecipar —
  ver pergunta 8 na seção 4.
- **Recompra e demais follow-ups de longo prazo** (`01-mapa-funcional.md` §G6). O item
  "Follow-up" que fecha a lista do Q5 é ambíguo no texto da decisão — **minha leitura** é que
  ele se refere a isso, não à régua de silêncio (que já mora na onda 1). Sinalizo esta leitura
  como interpretação, não como fato — confirme ou corrija na pergunta 8.

---

## 4. Perguntas que preciso te fazer antes de cada onda

Nem tudo foi decidido nas quatro rodadas anteriores. O que falta está listado aqui, amarrado à onda em que vai fazer falta — não precisa responder tudo agora, só antes de a onda correspondente começar.

### Antes da onda 0 (fundação)

1. **Runtime do agente.** A pauta (`02-decisoes-em-aberto.md` §3) lista SDK direto da OpenAI, Vercel AI SDK, Mastra ou n8n. Isso decide quanto código escrevemos contra quanto herdamos pronto. Preciso da sua preferência, ou de autorização para eu recomendar uma e seguir.
2. **Provedor de modelo.** O `CLAUDE.md` do `ricos-com-ai` cita "SDK oficial da OpenAI" — isso é uma decisão herdada de outro contexto (Instagram) ou vale também para o agente de WhatsApp? Se vale, é OpenAI mesmo para redigir a conversa, ou só para as tarefas baratas de classificação?
3. **Acesso à VPS.** Preciso que você (ou quem for provisionar) me dê acesso, ou vamos combinar um passo a passo para você mesmo subir enquanto eu acompanho?

### Antes da onda 1 (pré-venda — inclui régua de silêncio, handoff e teto de custo)

4. **Confirmação técnica da API da Coinzz.** Você confirmou que existe integração via API (`03-decisoes-tomadas.md` §R4.1). Preciso das credenciais e da documentação de endpoint para implementar `build_prefilled_checkout_link` de verdade, não como mock.
5. **Botões vs. texto livre.** Você decidiu texto livre sempre (`03-decisoes-tomadas.md` §R2.4). Isso está fechado — só cito aqui porque é a onda em que passa a valer.
6. **O cupom de 20%.** Você disse que vai criar (`03-decisoes-tomadas.md` §R2.7). Preciso do código antes de a régua de silêncio poder ser testada de ponta a ponta — sem ele, o teste para no gate que impede a agente de mencionar cupom inexistente, o que é o comportamento certo, mas não deixa testar o toque 3 inteiro.
7. **Canal de notificação do handoff.** "Para e notifica" (`03-decisoes-tomadas.md` §Q12) — notifica onde? WhatsApp pessoal seu, e-mail, um número interno? Preciso do destino real antes de implementar o alerta.
8. **Teto de custo por conversa.** Ficou decidido que existe um teto (`03-decisoes-tomadas.md` §Q11), mas não o valor em reais. Sugestão minha, a confirmar: **R$ 0,80**, o mesmo número que o [modelo econômico](../00-contexto/06-modelo-economico.md) usa como premissa de custo médio **por lead** — aqui eu o reaproveito como teto rígido por conversa individual, não como média, e "lead" e "conversa" são o mesmo evento neste funil. Concorda, ou prefere outro valor?

### Antes da onda 2 (pós-pedido)

9. **Webhook da Coinzz.** Preciso do formato exato do payload que a Coinzz manda (nome dos campos de status, ex.: `pedido_criado`, `saiu_para_entrega`) para desenhar o parser. Você tem acesso a um exemplo de payload, ou preciso pedir isso ao suporte deles?
10. **Integração com a Logzz para status de entrega.** O aviso de véspera depende de saber a data prevista. Isso vem pela própria Coinzz (que já integra Logzz), ou preciso de uma chamada separada à Logzz?

### Antes da onda 3 (testes internos)

11. **Quem faz os testes internos.** Você mesmo, alguém da sua equipe, ou peço para eu simular com um script (como fiz no site, com personas automatizadas)? Provavelmente as duas coisas se complementam — automatizado pega erro estrutural, humano pega o que soa errado.

### Antes da onda 4 (piloto pago)

12. **Orçamento do piloto.** O modelo econômico assume R$ 300/dia de mídia nos três cenários. Para o piloto inicial, você já tem um valor menor em mente, ou começamos com uma fração disso a definir juntos quando chegar a hora?

### Sem onda fixa — decide quando você quiser antecipar ou não

13. **Recuperação de carrinho do site — antecipar ou deixar para depois do MVP?** Não tem especificação nenhuma ainda no projeto: depende de um evento que o site hoje não emite (abandono de checkout). O `colet/src/lib/pixel.ts` já dispara `InitiateCheckout`, então dá para construir em cima disso — mas preciso da sua confirmação de que essa é a fonte certa, e de saber se você quer isso dentro do MVP ou como próxima onda depois dele. A própria ordem que você definiu (Q5) coloca isso como prioridade 3, abaixo de pré-venda e pós-pedido — meu plano segue essa ordem à risca, mas se você preferir adiantar, me avise.
14. **O item "Follow-up" da ordem do Q5.** Registrei minha leitura de que ele se refere a recompra e reengajamento de longo prazo (`01-mapa-funcional.md` §G6), separado da régua de silêncio (que já é parte da onda 1). Confirma essa leitura, ou você quis dizer outra coisa com esse item?

---

## 5. Critério de saída do MVP

O MVP está pronto para começar os testes reais (fim da onda 3, começo da onda 4) quando,
**todos ao mesmo tempo**:

1. Uma mensagem para o número novo do WhatsApp recebe resposta dentro do ritmo definido (mensagem automática instantânea + resposta real em 3 minutos ou às 06:00).
2. Uma conversa completa — do "oi" ao link de checkout — funciona sem intervenção humana, para pelo menos os três casos centrais: cliente decidida, cliente com dúvida de tamanho, cliente com objeção de golpe.
3. Uma conversa que silencia recebe os três toques de retomada no tempo certo, com o cupom só mencionado se já existir na Coinzz.
4. Um caso forçado de fora de escopo escala para humano em vez de inventar resposta, e o teto de custo por conversa é respeitado.
5. Um pedido de teste recebe a régua completa de pós-venda (confirmação, sinal de vida, véspera, pós-entrega) nos momentos certos.
6. Pelo menos três das personas de teste (onda 3) rodam limpo, sem violar nenhum guardrail.
7. Todas as perguntas da seção 4 marcadas como necessárias **até a onda em curso** estão respondidas — não é preciso ter as da onda 4 resolvidas para começar a onda 0.

**Fora do critério de saída do MVP, de propósito:** recuperação de carrinho do site e
recompra/reengajamento de longo prazo (pergunta 13 e 14) — são prioridade 3 e 4 na sua
própria ordem (Q5), abaixo das duas funções que definem este MVP.

Depois do critério acima: piloto com verba baixa (onda 4), medindo contra os cenários do
[modelo econômico](../00-contexto/06-modelo-economico.md), com a meta declarada de **10% de
conversa para pedido criado** como o piso, não o teto.

---

## 6. Riscos que o plano não resolve sozinho

Registrados para não serem esquecidos, não para serem resolvidos aqui:

- **Banimento do número.** É por isso que a onda 0 inclui pacing desde o primeiro dia, não como refinamento posterior.
- **Custo de IA fugir do controle.** É por isso que o teto de custo está na onda 1, junto com a primeira conversa aberta, não deixado para depois.
- **A API da Coinzz não ser exatamente como esperado.** Ainda não foi testada de verdade — é a primeira coisa a verificar tecnicamente na onda 1, e o plano tem um caminho alternativo já registrado (`03-decisoes-tomadas.md` §R3.1) caso o formato programático não funcione como o esperado.
- **Recusa na porta continuar acontecendo mesmo com a régua de pós-venda.** É risco de negócio, não de construção — só o piloto real mede isso.
