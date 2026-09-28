# Grafo de decisões — kits, checkout e o loop de verificação (2026-09-25)

Para não repetir erro: cada problema do dia, o caminho que **não** funcionou e por quê, a
correção que ficou e a guarda que impede a volta. Decisões de negócio em
[`03-decisoes-tomadas.md` §Rodada 14](03-decisoes-tomadas.md); detalhe técnico em
[`registro.md` M-09](../../agente-ia/08-mudancas/registro.md). Cada "guarda" é um teste e
uma mutação em `pnpm verificar:guardas` (o bug reinstalado tem de deixar o teste vermelho).

Legenda: 🟥 sintoma · 🟧 tentativa que falhou · 🟩 correção que ficou · 🛡️ guarda.

## Como ler antes de mexer

1. Vai mexer num **gate de preço ou prazo**? Leia os grafos 1, 2 e 8 — todos os atalhos
   óbvios já foram tentados e abriram mentira ou vetaram frase honesta.
2. Vai mexer em **estado da conversa** (kit, caminho, retry)? Grafos 3, 4 e 5.
3. Vai mexer em **handoff, despedida ou pós-venda**? Grafos 6 e 7.
4. As **lições** no fim valem para qualquer heurística de texto.

---

## 1. De quantas peças fala um preço?

```mermaid
flowchart TD
  S1["🟥 '3 peças na entrega saem R$ 272,79'<br/>preço de outro caminho/quantidade passava"]
  A1["🟧 1ª: frase com UM caminho ou UMA quantidade<br/>→ todo preço tem de ser dela"]
  F1["🟥 vetava a fala 7.1 do script<br/>'R$ 116,91 em vez de R$ 129,90'"]
  A2["🟧 2ª: ligar cada preço à contagem<br/>mais próxima antes dele"]
  F2["🟥 vetava comparações honestas<br/>'kit de 2 R$ 233,82, e o de 3 R$ 311,76'"]
  A3["🟧 3ª: conjunto — o preço pertence a UMA<br/>das quantidades da frase; 'seu M' = 1"]
  F3["🟥 vetava o link do kit<br/>'Seu M e o G saem R$ 233,82'<br/>e liberava 2 peças pelo preço de 1"]
  C1["🟩 o turno JÁ SABE a quantidade: ctx.units<br/>número numa oração com contagem → essa contagem<br/>oração sem contagem → a contagem anterior<br/>sem nenhuma → frase + conversa"]
  G1["🛡️ kits.test.ts · gate-quantidade-da-conversa<br/>gate-oracao · kit-oracao-anterior · kit-quatro"]
  R1["Resíduo aceito: dois kits na mesma frase<br/>com os preços trocados entre si"]
  S1 --> A1 --> F1 --> A2 --> F2 --> A3 --> F3 --> C1 --> G1
  C1 -.-> R1
```

**Por que o conserto definitivo foi sair do texto:** três tentativas adivinhavam a
quantidade pelas palavras, e cada uma quebrou num formato novo. O turno determina a
quantidade de forma determinística (`quantityOf` + `leads.units`); o gate passou a
recebê-la em vez de inferir.

## 2. O preço de comparação ("em vez de R$ 129,90")

```mermaid
flowchart TD
  S["🟥 fala do script vetada:<br/>'R$ 116,91 em vez de R$ 129,90'"]
  A["🟧 isentar preço depois de<br/>'em vez de / contra / sobre os / do que'"]
  F["🟥 liberou mentira:<br/>'na entrega 3 peças: menos do que R$ 272,79'"]
  C["🟩 isenta só se um preço de oferta<br/>que CASA com a frase veio antes<br/>e nunca depois de 'do que'"]
  G["🛡️ kit-comparacao · kit-do-que"]
  S --> A --> F --> C --> G
```

## 3. Qual caminho ela escolheu?

```mermaid
flowchart TD
  S["🟥 rodada de personas: 'prefiro pagar no pix'<br/>e o turno seguinte mandou o link da ENTREGA"]
  K["causa: payment_choice era lido<br/>só na mensagem em que foi dito"]
  A1["🟧 guardar no lead o que o intérprete leu"]
  F1["🟥 guardava pergunta como escolha:<br/>'quanto economizo no pix em vez da entrega?'"]
  A2["🟧 choosesPath: verbo de decisão + caminho,<br/>sem '?' na mensagem"]
  F2["🟥 recusava escolhas comuns ('pix mesmo',<br/>'quero no pix, qual a chave?')"]
  A3["🟧 ampliar; pergunta só antes da escolha"]
  F3["🟥 aceitava dúvida:<br/>'quero saber se aceita pix'"]
  C["🟩 escolha = forma de decisão E sem dúvida<br/>ATÉ a escolha; motivo depois não é dúvida<br/>expira em 7 dias sem uso, renova com uso"]
  G["🛡️ caminho-escolhido · caminho-pergunta<br/>caminho-duvida · caminho-depois"]
  S --> K --> A1 --> F1 --> A2 --> F2 --> A3 --> F3 --> C --> G
```

**Efeito colateral que o loop pegou:** guardar o caminho deixou conversas no antecipado
por mais tempo, e isso expôs o grafo 8 (prazo da entrega lido como prazo do antecipado).

## 4. Quando o kit é esquecido?

```mermaid
flowchart TD
  S["🟥 'quero 2, M e G' e 12 dias depois<br/>'quero o M' recebia o link do kit de 2"]
  A1["🟧 zerar o kit quando nasce conversa nova"]
  F1["🟥 código morto: NADA fecha conversa<br/>(closed_at nunca é escrito)"]
  A2["🟧 expirar 72 h depois de gravado"]
  F2["🟥 kit ativo expirava no meio da conversa<br/>(só regravava quando mudava)"]
  C["🟩 units_at renovado em todo turno que usa o kit<br/>expira após 7 dias SEM USO<br/>zera após a compra"]
  G["🛡️ kit-conversa-nova · kit-renova"]
  S --> A1 --> F1 --> A2 --> F2 --> C --> G
```

## 5. A nova tentativa (retry) duplica tamanhos?

```mermaid
flowchart TD
  S["🟥 retry reaplicava 'G' e virava 'G e G'"]
  A1["🟧 no retry, ignorar o que ela disse"]
  F1["🟥 perdia os tamanhos quando a 1ª<br/>tentativa falhou antes de gravar"]
  A2["🟧 comparar com o fim da lista guardada"]
  F2["🟥 'M também' (2ª peça igual) era descartado"]
  C["🟩 ler o relógio: units_at ≥ chegada da mensagem<br/>= já gravado; e só lista PARCIAL pode ser descartada"]
  G["🛡️ kit-retry"]
  S --> A1 --> F1 --> A2 --> F2 --> C --> G
```

## 6. Pós-venda: quando passar para uma pessoa?

```mermaid
flowchart TD
  S["🟥 'obrigada, já finalizei' virou handoff<br/>(tira a compradora da Malu)"]
  A1["🟧 exigir pergunta/palavra de problema"]
  F1["🟥 reclamações reais sem handoff:<br/>'ficou pequeno', 'me cobraram frete'"]
  A2["🟧 inverter: excluir só despedida feliz,<br/>lista de palavras de PROBLEMA"]
  F2["🟥 'obrigada, MAS veio o M' passava<br/>(nenhuma lista enumera queixa)"]
  C["🟩 lista de PERMISSÃO (DONE_WORDS): feliz só se<br/>toda palavra é agradecimento/despedida/'chegou, amei'"]
  G["🛡️ ja-finalizei · feliz-com-queixa"]
  S --> A1 --> F1 --> A2 --> F2 --> C --> G
```

## 7. Despedida depois do link

```mermaid
flowchart TD
  S1["🟥 'tchau brigada' virou o NOME no link"]
  C1["🟩 despedidas em COMMON_WORDS<br/>🛡️ tchau-nome"]
  S2["🟥 toda despedida reenviava o link<br/>(lida como 'vou pensar')"]
  A2["🟧 pular o 'vou pensar' se já há link"]
  F2["🟥 apagava a frase fixa do operador<br/>em 'obrigada, vou pensar'"]
  C2["🟩 mantém a frase; só o LINK não sai de novo<br/>🛡️ despedida-link"]
  S1 --> C1
  S2 --> A2 --> F2 --> C2
```

## 8. Prazo: de qual caminho é o número?

```mermaid
flowchart TD
  S["🟥 frase VERDADEIRA virou resposta pronta:<br/>'na entrega em até 3 dias, e no antecipado<br/>em média 5 dias úteis'"]
  K["causa: regra M-07 lê como antecipado TODO<br/>número de uma frase que cita o antecipado"]
  C["🟩 cada número responde ao caminho<br/>citado por último antes dele"]
  G["🛡️ prazo-por-caminho · fuzz de 3600 mentiras<br/>+ 'no antecipado chega em 3 dias, na entrega também' vetada"]
  S --> K --> C --> G
```

## 9. Peça grátis sem número

```mermaid
flowchart TD
  S["🟥 'a segunda sai de graça', 'leve 2 pague 1' passavam"]
  A1["🟧 vetar '… sai de graça / por nossa conta'"]
  F1["🟥 vetava verdade: 'a troca do colete é grátis'"]
  A2["🟧 isentar se 'troca/devolução' aparece antes na frase"]
  F2["🟥 liberou: 'a troca é grátis e a segunda também'"]
  C["🟩 isenção só para 'troca/devolução DO colete'<br/>logo antes; 'e a segunda também' é concessão"]
  G["🛡️ peca-gratis · troca-e-segunda"]
  S --> A1 --> F1 --> A2 --> F2 --> C --> G
```

## 10. Régua pós-compra num kit

```mermaid
flowchart TD
  S["🟥 véspera de kit: 'deixa R$ 129,90 separado'<br/>num pedido de R$ 233,82 = recusa na porta"]
  C1["🟩 a régua lê o PEDIDO: total, peças, tamanhos"]
  S2["🟥 pedido antecipado: 'deixa separado' pra quem já pagou<br/>e o gate cancelava a mensagem"]
  C2["🟩 antecipado = 'já pago', sem 'separado'"]
  S3["🟥 total fora da tabela (cupom, plataforma)<br/>cancelava a véspera"]
  C3["🟩 na logística o total do próprio pedido é permitido"]
  G["🛡️ regua-kit · regua-antecipado · regua-total-do-pedido"]
  S --> C1 --> S2 --> C2 --> S3 --> C3 --> G
```

## 11. Checkout e integrações

```mermaid
flowchart TD
  D1["entrega na Coinzz"] --> P1["🟥 Coinzz cobrava frete na entrega, sem opção"] --> C1["🟩 entrega volta para a Logzz (frete R$ 0,00)<br/>CPF no link: Logzz 'cpf', Coinzz 'document'"]
  D2["O10: webhook de venda anônimo"] --> P2["Coinzz e Logzz não mandam header"] --> C2["🟩 senha na URL (&token=), n8n repassa,<br/>função compara (tempo constante) → 401<br/>🛡️ O10-venda · dev:n8n"]
  D5["taxa do antecipado na Coinzz"] --> C5["🟩 Mercado Pago processa o antecipado (R14.15)<br/>sem mudança de código; margem a refazer"]
  D3["O2: lead novo só recebia a recepção"] --> C3["🟩 nó Wait + chamada com resume:true<br/>🛡️ O2-wait · dev:n8n"]
  D4["deploy v33 (versão 38)"] --> P4["🟥 sonda: 'meta: Unauthorized'<br/>META_API_KEY do Supabase recusada"] --> C4["⏳ operador colou uma chave; 07:05 UTC<br/>ainda recusada — conferir chave e secret"]
  C4 --> T4["17:50 UTC: a credencial 'Meta API' do n8n responde 200<br/>→ a chave existe; o erro é o valor no Supabase<br/>(provável 'Bearer ' colado junto: o código já prefixa)"]
  T4 --> F4["🟥 operador perdeu a chave; o n8n não devolve segredo<br/>→ chave nova em dev.meta.ai: Supabase + GitHub (Hermes)"]
  F4 --> OK4["🟩 19:34 UTC: sonda pela porta do n8n responde pela Meta<br/>(interpret + reply, desfecho send) — função v41"]
```

## 12. Quando o link sai? (H-2)

```mermaid
flowchart TD
  S["🟥 Tati: 'faz por 100 que eu levo agora' → link da entrega (R$ 129,90)<br/>logo depois do preço do antecipado (R$ 116,91) → 'continua 116?'"]
  H["Hermes H-2: todo link sai com o preço do caminho"]
  X["❌ recusada pelo operador: preço junto com o link<br/>apressa quem ainda pergunta e perde a venda"]
  C0["🟩 link só com confirmação de compra: preço que a loja não tem<br/>('faz por 100 que eu levo') não é decisão"]
  F1["❌ barganha por FRASE (regex de 'faz por … que eu levo'):<br/>vetou 'por 116 eu levo' (o preço real) e liberou<br/>'não dá pra fazer por 100? quero o G' — cegueira a negação"]
  F2["❌ pedido do nome ignorado para perguntar segurava o link:<br/>'pra que o CPF?' ficava sem link depois de decidir"]
  F3["❌ todo número 60–999 era preço: 'cintura 80', 'apto 102' sem link"]
  F4["❌ 'por' a partir de 20: 'troco por 44' sem link;<br/>palavra de endereço em qualquer ponto: 'no pix por 100' liberado"]
  C1["🟩 barganha pelo NÚMERO: valor em contexto de preço que não é<br/>nenhum preço do config (±R$ 1), nem colado a medida/endereço;<br/>'por' e gatilhos fracos a partir de 60, centavos a partir de 20;<br/>% de kit só com mais de uma peça"]
  R1["ressalvas aceitas: 'por 50' inteiro (faixa de tamanho),<br/>'tenho uns 70', 'n dá 100?'"]
  C2["🟩 FATOS LIGADOS no prompt: preço · caminho · peças · prazo · link,<br/>do config, só referência interna; a instrução do link cita a linha dele"]
  C3["🟩 turn_outcomes.reason = 'link — linha' só quando a mensagem leva o link"]
  K["mantido: 'vou pensar' segue mandando o link (R13.4, operador)"]
  G["🛡️ H-2-preco-da-loja · H-2-barganha · H-2-numero ·<br/>gerador frase × preço real × preço inventado × medida<br/>(5 passadas de revisão até 'aprovado com ressalvas')"]
  S --> H --> X --> C0 --> F1 --> F2 --> F3 --> F4 --> C1 --> C2 --> C3 --> G
  C1 -.- K
  C1 -.- R1
```

## 13. Ligar o WhatsApp sem abrir uma porta (R14.16)

```mermaid
flowchart TD
  S["Canal oficial precisa entrar antes do número existir"]
  G1["🟥 deliveryFor testado mas NÃO ligado à varredura:<br/>régua mandaria texto livre fora das 24h"]
  C1["🟩 varredura decide texto, template ou bloqueado (WA-1)"]
  R1["🟥 revisão: encorpa-inbound e a função turn são portas públicas<br/>(chave anon abre a função; o n8n repassava o corpo inteiro)"]
  C2["🟩 selo da entrada (HMAC) + lista fechada no n8n<br/>+ TURN_REQUIRE_SERVICE_ROLE"]
  R2["🟥 revisão: last_inbound_at gravado no fim do turno,<br/>na retomada e na nova tentativa: janela esticada"]
  C3["🟩 gravado uma vez, na mensagem dela, com o horário da Meta;<br/>janela fecha 10 min antes"]
  R3["🟥 revisão: mensagem perdida depois do 200 sem rastro;<br/>toque bloqueado cancelado em silêncio"]
  C4["🟩 envio em paralelo com log por id; e-mail dos toques bloqueados"]
  R4["🟥 2ª revisão: n8n enviava pelo campo channel, que o chamador escreve;<br/>recibo de leitura disparava em qualquer POST; 401 de selo virava e-mail"]
  C5["🟩 turno devolve sealed; n8n só envia com ele;<br/>recibo sai da função whatsapp (assinatura da Meta conferida)"]
  OFF["🟩 envio desligado (CANAL_ATIVO=false) até os valores do sócio"]
  GD["🛡️ WA-1-janela · WA-selo · WA-janela-no-fim · WA-envio-desligado · WA-canal-forjado ·<br/>regras n8n (corpo inteiro, channel, sealed) · teste do nó de envio contra src/channel"]
  S --> G1 --> C1 --> R1 --> C2 --> R2 --> C3 --> R3 --> C4 --> R4 --> C5 --> OFF --> GD
```

## 14. Margem do antecipado com o Mercado Pago (R14.15)

```mermaid
flowchart TD
  S["🟥 06-modelo-economico dizia antecipado R$ 51,27 ≈ COD R$ 52,35<br/>com a taxa da Coinzz (6,99% + R$ 2,49), que deixou de valer"]
  K["causa: R14.15 trocou o processador; a conta de margem<br/>não lê o config, então nada ficou vermelho"]
  A1["🟧 atalho: 'o MP é mais barato, sobra margem → aumentar o desconto'"]
  F1["🟥 a folga depende de premissas não confirmadas:<br/>antifraude R$ 2,49 continua? mix Pix/cartão? juros do 12x com quem?<br/>no kit de 3, 100% cartão à vista (4,98%) já fica abaixo do COD"]
  C1["🟩 conta refeita com premissas marcadas (P1–P5):<br/>R$ 57,94 / 116,16 / 149,17 vs COD 52,35 / 109,01 / 145,12<br/>+ sensibilidade: mix, antifraude, parcelado, recusa de empate"]
  D["preço e desconto não mudam: opções vão ao operador;<br/>nenhuma é aplicada antes de P1 e P4 confirmados"]
  G["🛡️ sem teste: conta de margem é doc. Mudança de preço passa por<br/>BUSINESS_CONFIG + tests/prompt.test.ts + pnpm dev:gates, nos dois caminhos"]
  S --> K --> A1 --> F1 --> C1 --> D --> G
```

**Fechado em 2026-09-26:** P1 confirmado (antifraude não é cobrado) e o operador manteve
preços e descontos.

**Resíduo:** o número vale enquanto P4 (parcelado) não for confirmado
no painel do Mercado Pago/Coinzz. Trocou taxa, processador ou mix, refaça a tabela da caixa
de 2026-09-25 em [`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md).

## 15. `perdido` sem dono (plano v2, 7.4)

```mermaid
flowchart TD
  S["🟥 o funil não tinha fim sem compra: a régua de silêncio terminava<br/>e a conversa ficava para sempre no último estágio vivo"]
  K["causa: ninguém escrevia perdido; em_rota / entregue_pago / recusado<br/>já eram escritos desde a v38 (stageForOrder no webhook de venda)"]
  A1["🟧 1ª versão: markLost só depois de 'sent' e dos dois 'canceled' do gate e da janela"]
  F1["🟥 revisão Opus: com o cupom inativo (produção hoje) o silence_3 renderiza null<br/>e sai pelo ramo vazio — o único caminho real ficava sem perdido;<br/>o teste contava chamadas e passou verde"]
  F2["🟥 corrida: turno re-arma a mesma linha (conversation_id, kind) enquanto a varredura<br/>segura a antiga; mark sem condição fechava a nova e gravaria perdido numa conversa viva"]
  C1["🟩 decisão do operador (a): silence_3 saiu da fila, por qualquer motivo, sem venda → perdido.<br/>toda saída depois de const kind passa por leave; mark só fecha a linha<br/>com status scheduled e o run_at lido; perdido só se a linha voltou"]
  G["🛡️ tests/order-stage.test.ts: nenhum mark() cru depois de leave, 4 saídas,<br/>ramo vazio coberto; mutação 7.4 reinstala o ramo vazio sem leave"]
  S --> K --> A1 --> F1 --> C1
  A1 --> F2 --> C1
  C1 --> G
```

Ela volta sozinha: `furthest(perdido, x)` devolve o estágio que o próximo turno alcança.
Opt-out e handoff saem antes e não marcam; toque adiado não saiu da fila.

**Limites conhecidos:**
- **Venda que o webhook não casou** (`unknown_lead`, `ambiguous_phone`) deixa a régua viva.
  Três dias depois a conversa vira `perdido` sobre uma compra real. Isso se corrige sozinho
  se o webhook chegar depois (`furthest(perdido, pedido_criado)`).
- **Envio depois da resposta dela:** fechado em 2026-09-26, na segunda revisão. O toque só
  é gravado e enviado depois que a varredura fecha a linha. Se a cliente respondeu no
  intervalo, a linha já foi reagendada pelo turno dela e o toque velho não sai. A nova
  tentativa de turno segue a mesma regra. O custo é que o envio passa a ser no máximo uma
  vez: uma falha depois de fechar a linha perde um toque, em vez de enviar dois.
- **Sem conversa sintética:** não há conversa sintética de ponta a ponta; o teste lê a
  estrutura da varredura, que roda só no Deno.

## 16. Dois pedidos no mesmo lead

```mermaid
flowchart TD
  S["🟥 o toque pós-pedido lia o ÚLTIMO pedido do lead: com dois pedidos,<br/>a véspera do pedido A falava do total e dos tamanhos do pedido B"]
  S2["🟥 o cancelamento do pedido B cancelava todo toque agendado,<br/>inclusive a véspera e a entrega do pedido A, que segue de pé"]
  K["causa: followups não sabia qual pedido o armou"]
  C1["🟩 migração 0017: followups.order_id (nula, on delete set null).<br/>recordOrder arma com o id da linha gravada; a varredura lê o pedido do toque;<br/>onOrderConfirmed com pedido morto cancela só silêncio + toques daquele pedido"]
  G["🛡️ tests/followups.test.ts 'dois pedidos no mesmo lead';<br/>tests/order-stage.test.ts; mutação dois-pedidos"]
  S --> K
  S2 --> K
  K --> C1 --> G
```

**Ordem de deploy:** aplicar a 0017 **antes** de publicar a `turn`. A varredura seleciona
`order_id`, e sem a coluna o PostgREST recusa a leitura: nenhum toque sai.

**Limites conhecidos:**
- **O segundo pedido não ganha régua própria**, porque `unique (conversation_id, kind)` já
  está ocupado pelos toques do primeiro. Mudar isso é mudar a chave da tabela, e fica fora
  deste passo.
- **Estágio por lead (revisão Opus, corrigido no mesmo dia):** o cancelamento do pedido B
  gravava `recusado`, que é terminal, enquanto o pedido A estava em rota. Quando A era
  entregue, a venda continuava contando como recusa. Agora `stageForLead` só grava
  `recusado` se nenhum outro pedido do lead estiver vivo. Continua em aberto o caso de
  ordem inversa: um pedido A recusado sozinho e, depois, um pedido B novo e entregue. A
  conversa fica em `recusado`, porque o estágio terminal não reabre.
  "Vivo" quer dizer "não morto" (`isOrderDead`). Um Pix expirado ou parado em "aguardando
  pagamento" conta como vivo e impede o `recusado` de outro pedido. O erro vai para o lado
  seguro: um estágio não terminal. Incluir `expir` em `isOrderDead` quando o vocabulário real
  das plataformas for conhecido.
- **Linha armada antes da 0017** tem `order_id` nulo e segue a regra antiga: lê o último
  pedido e morre com qualquer pedido cancelado.

## 17. O lembrete de 15 minutos depois do link nunca foi agendado (§R10.4)

```mermaid
flowchart TD
  S["🟥 §R10.4 decidido e testado na função pura, mas nenhuma conversa em produção<br/>recebeu o lembrete de checkout de 15 minutos"]
  K["causa: scheduleSilenceTouches chamava scheduleSilence(from) sem o stopPoint;<br/>o teste provava scheduleSilence(now, 'link_sent'), que a produção não chamava"]
  A1["🟧 atalho: só passar o stopPoint"]
  F1["🟥 a resposta dela (cancelScheduled) e a venda (onOrderConfirmed) só cancelavam silence_*:<br/>o lembrete perguntaria 'conseguiu finalizar?' a quem acabou de comprar"]
  C1["🟩 operador disse sim (2026-09-26): stopPoint passado; inSilenceRuler<br/>(silence_* + checkout_reminder) usado na venda e no adiamento;<br/>cancelScheduled filtra os dois"]
  G["🛡️ tests/order-stage.test.ts §R10.4; mutações R10.4-armado, -resposta, -venda"]
  S --> K --> A1 --> F1 --> C1 --> G
```

**Sexta revisão (NEEDS WORK, corrigida no mesmo dia):**
- **Lembrete duplicado:** com o link mandado às 23:40, o lembrete sai às 23:55. O
  `silence_1` era adiado para as 06:00 e reancorava a régua inteira, e o upsert reativava
  o lembrete que já tinha saído. Agora `rulerFor` só rearma o lembrete quando o toque
  adiado é o próprio lembrete, e o cancelamento do reancoramento não toca nele.
- **Lembrete de link que não saiu:** `stopPointOf` armava `link_sent` pela palavra
  "link" ou "checkout", que aparecem também em oferta e negação ("quer que eu te mande o
  link?"). Agora só conta se o texto leva um dos links de checkout, pela mesma função do
  M-03 (`linkSentRecently`), com os testes de negação. A sétima revisão pegou uma primeira
  versão com um segundo helper igual; a lista de links agora é montada uma vez só, em
  `CHECKOUT_BASES`.
- **Guardas:** mutações R10.4-duplicado e R10.4-palavra-link.

Achado pela revisão Opus de 2026-09-26 (terceira passada do §15), fora do diff que ela
revisava. **Lição:** um teste da função pura não prova que a produção chama a função com
esse argumento.

## 18. M-08: prazo do antecipado por extenso

```mermaid
flowchart TD
  S["🟥 três prazos do antecipado passavam o gate: 'um dia só', 'chega em uma semana',<br/>'em 2 dias ele está aí na sua casa'"]
  K["causa: a regra por número (M-07) não lia um/uma nem semanas, e no antecipado<br/>sem caminho nomeado só julgava se a oração tivesse verbo de DELIVERY_TALK"]
  A1["🟧 atalho: pôr 'está aí', 'é seu', 'na sua mão' na lista de verbos"]
  F1["🟥 a M-07 já mostrou em seis revisões: lista de formas vaza"]
  C1["🟩 um/uma/num/numa = 1 (exceto 'um dia marcado/agendado/especial/de festa');<br/>semana = 7 corridos, nunca a média (dias úteis), pode ser a garantia;<br/>no antecipado a contagem é prazo, SALVO oração de uso (de uso, acostum, adapt) sem entrega"]
  G["🛡️ change-registry M-08, fuzz com 6600 mentiras + 75 chegadas sem verbo;<br/>mutações M-08 e M-08-chegada; dev:gates 0 afrouxamentos, 26 endurecimentos"]
  S --> K --> A1 --> F1 --> C1 --> G
```

**Primeira revisão independente (NEEDS WORK, corrigida no mesmo dia):**
- **Faixa em semanas:** "1 a 2 semanas" escapava nos dois caminhos, porque o fim da faixa
  ia para uma checagem que só lia dias.
- **Âncora da garantia:** o backtracking em `(?:receb|cheg)\w*` derrotava o lookahead. Com
  isso, "tem uma semana pra trocar depois que chega em uma semana" era isentada como
  garantia.
- **Isenção de uso:** valia para a oração inteira, e "em 3 dias ele está aí pra você se
  adaptar" passava. Agora só isenta quando o uso governa a contagem.
- **Arrependimento:** "7 dias pra desistir, a contar do dia que receber" era vetada, e
  agora passa.
- **Guardas:** cada família tem gerador de fuzz, e há as mutações M-08-semanas, -ancora e
  -uso. Contra o `main`, 0 afrouxamentos.

**Segunda revisão (NEEDS WORK, corrigida no mesmo dia):**
- **Âncora com enchimento:** a âncora nova "a contar do dia que" e o `desist` abriram
  "tem 7 dias pra desistir quando chegar aí em 7 dias". O lookahead só protegia a contagem
  colada no verbo. Agora a âncora não sai quando o verbo dela tem uma contagem na mesma
  oração.
- **Troca ao lado de chegada sem verbo:** "pode trocar: em 7 dias ele está aí" passava
  (desde a M-07), e o "que é quando ele chega" era apagado como âncora. Agora os dois são
  barrados.
- **Guardas:** mutações M-08-enchimento, -troca-chegada e -que-e-quando. A M-08-ancora foi
  reescrita, porque a versão antiga deixou de reinstalar o bug.
- **Aceito em `gate-loosen-accepted.txt`:** "No pix você tem 7 dias pra desistir, a contar
  do dia que receber." É a frase honesta do arrependimento (CDC), e a base a vetava.

**Terceira revisão (NEEDS WORK, sem afrouxamento):** os consertos da segunda tinham sido
de sintoma, por lista de preposições, e os irmãos passavam: "em uns/cerca de/no prazo de 7
dias", "e em 7 dias ele está aí", "7 dias, bem quando ele chega". Agora a correção é pela
oração:
- **Contagem e âncora:** uma contagem na mesma oração do verbo da âncora é complemento
  dele, e a âncora fica. O único corte é "(você) tem/terá/são/é" logo antes da contagem.
- **Oração nova:** uma conjunção colada à contagem abre oração nova, e aí a troca não
  isenta mais.
- **Âncora depois da contagem:** só é retirada se estiver colada à contagem.
- **Dois-pontos:** ":" não abre oração quando vem seguido de "você tem".
- **Guardas:** 11 mutações da M-08.

**Quarta revisão (NEEDS WORK, sem afrouxamento) → ônus invertido:** depois de quatro
rodadas fechando formas enquanto os irmãos seguiam abertos, veio a mentira mais grave com o
pix nomeado: "o prazo até quando chegar é de 7 dias". O desenho foi invertido. A contagem
da garantia só é isenta quando uma forma de garantia a governa **positivamente**:
- **Propósito colado:** "7 dias pra trocar".
- **Palavra de troca tomando a contagem:** "a troca é em 7 dias", "pode trocar em até 7
  dias".
- **Depois da contagem, só o permitido:** "corridos/úteis", o propósito, uma âncora de
  início ou uma oração que não fala de chegada.

Saíram oito regexes (`anchor`, `anchorAfter`, `glued`, `newClause`…) e mais quatro variáveis
de apoio. **Lição:** numa isenção, liste o que prova a exceção, não o que a desmente.

**Quinta revisão (APROVADO COM RESSALVAS):** nenhuma mentira de chegada passa. As ressalvas
eram falsos positivos em frases honestas, e foram corrigidas no mesmo dia:
- **Falas do roteiro:** a fala para a objeção do antecipado ("7 dias pra trocar ou devolver
  contando do dia que receber", `02-script-do-agente.md:252`) era vetada. Agora passa.
- **Troca de tamanho:** "7 dias pra trocar de tamanho" era vetada. Agora passa.
- **Chegada por extenso:** "e ele está com você" e "o colete é seu" passaram a ser julgadas
  como chegada.
- **Aceitos:** as quatro frases do roteiro e da base que a base vetava.
- **Risco aceito:** depois de ";" só verbo de entrega e presença são julgados. É isso que
  deixa passar a frase inteira do roteiro, e "Pode trocar em 7 dias; que é o tempo da
  viagem." também passaria.

**Sexta revisão (NEEDS WORK, com afrouxamento real):** os dois caminhos novos da quinta
abriram brechas. O caso "são/o prazo é de N depois que recebermos" isentava prazo sem
palavra de troca: "No pix, são 7 dias depois que recebermos" passava nos dois caminhos. E o
texto depois de ";" não era julgado, então "No pix você tem 7 dias pra trocar; a entrega
também." passava. Os consertos:
- **Isenção sem troca:** só vale com "você tem/terá" e com ela recebendo
  (`receb(er|e|eu|a)`).
- **Depois de ";":** é julgado como o resto da frase. Só sai a locução do roteiro "do
  pedido até a entrega".
- **Guardas:** geradores de fuzz para os dois caminhos e mutações M-08-recebermos e
  M-08-ponto-e-virgula.
- **Aceito:** a fala inteira do roteiro (`:252`).
- **Fora da M-08, família da M-10:** "Pagou no pix? São 7 dias…" passa no caminho da
  entrega, porque o nome do caminho está na frase anterior.

**Sétima revisão (NEEDS WORK, com afrouxamento real):** a locução do roteiro "do pedido até
a entrega" era retirada em qualquer lugar, e com isso "No pix, você tem 7 dias pra trocar do
pedido até a entrega" passava nos dois caminhos. Os consertos:
- **Locução:** agora só sai com o sujeito do roteiro ("eu fico aqui… com você do pedido até
  a entrega").
- **"Prazo":** "o prazo pra trocar é de 7 dias" voltou a passar.
- **Presença:** "tá aqui com você" passou a ser vetada.
- **Guardas:** mutações M-08-locucao e M-08-prazo-de-troca. Ao todo, 16 mutações na M-08.

**Oitava revisão (NEEDS WORK, um achado):** tirar o `!prazo` fez "a troca é fácil, e o
prazo é 7 dias" voltar a passar, porque uma troca solta em outra oração tomava a contagem.
Os consertos:
- **Troca governando:** agora a troca só toma a contagem quando a governa ("o prazo pra
  trocar é de", "pra trocar, o prazo é de", "é só trocar: você tem").
- **Cópula:** o substantivo aceita no máximo uma cópula, então "garantia e são" não vira
  mais "garantia é são".
- **Guardas:** um gerador com 1568 mentiras e as mutações M-08-troca-solta e M-08-copula.

**Nona revisão → APROVADO COM RESSALVAS:** num corpus acumulado de 612 frases das nove
rodadas, rodado no `main` e no branch nos dois caminhos, sobrou uma família só: "se precisar
receber e trocar, são 7 dias". Ali o "se" atravessava a chegada. Foi corrigida com um gerador
e a mutação M-08-se-chegada.

Ressalvas aceitas:
- **Garantia como condição:** "se quiser garantia, são 7 dias" já passava no `main`.
- **Frase ambígua:** "o prazo com garantia de troca é de 7 dias".
- **Nome na frase anterior:** "Pagou no pix? São 7 dias…" passa no caminho da entrega. É a
  família da M-10.
- **Dois falsos positivos baratos no antecipado.**

**Lição das nove rodadas:** cada exceção aberta para uma frase honesta foi a porta da mentira
seguinte. O que convergiu foi governo positivo, verificado por um corpus acumulado de
mentiras rodado contra o `main` a cada passada.

**Custo aceito:** no antecipado, uma contagem sem caminho nomeado e fora de uma oração de
uso agora é julgada. "Sua festa é daqui a uma semana" é vetada e custa uma reescrita,
nunca uma mentira. Das frases do corpus que passaram a ser vetadas, a maioria já é barrada
por outro gate. As exceções são falsos positivos baratos, como "já faz 10 dias" na fala da
cliente.

## 19. M-10: prazo da entrega por extenso, e o caminho nomeado na frase anterior

```mermaid
flowchart TD
  S["🟥 na entrega (1 a 3 dias) passavam 'chega em uma semana', 'em até 2 semanas',<br/>'em 5 dias', 'em dez dias'; e 'Pagou no pix? Chega em 2 dias.' passava no COD"]
  K["causa: uma contagem com o COD nomeado dava continue (codAt > prepayAt);<br/>a faixa só lia dígitos; o nome do caminho só valia na própria frase"]
  F1["🟥 primeira versão julgava toda contagem sem nome no COD:<br/>'emagrece 5 kg em uma semana' e '30 dias pra devolver' viravam delivery_promise"]
  C1["🟩 no COD a contagem tem de caber em [codDaysMin, codDaysMax] (número ou faixa, por extenso também);<br/>semana nunca cabe; sem nome, só em fala de entrega/chegada.<br/>Cabeçalho: pergunta ou fragmento de até 4 palavras na frase anterior nomeia o caminho"]
  C2["🟩 irmão: a faixa lia só 'antecipado' como nome; 'No pix chega em 1 a 3 dias' passava no COD.<br/>notDelivery tira o próprio nome do caminho ('pagamento na entrega')"]
  G["🛡️ geradores (6560 fora da faixa, 4050 dentro, cabeçalho, garantia com o nome do COD);<br/>mutações M-10, -sem-nome, -inicio, -semana, -cabecalho, -faixa-pix, -nome-da-entrega"]
  S --> K --> F1 --> C1 --> C2 --> G
```

**Custo aceito:** falsos positivos baratos que custam uma reescrita cada. O mais provável é
"…7 dias pra trocar e suporte todo dia", porque a cauda da garantia recusa "dia".

**Revisão independente: APROVADO COM RESSALVAS.** Nenhuma mentira que o `main` vete passa no
branch. A negação no cabeçalho ("Sem pix, chega em 1 a 3 dias" vetada; "Nada de pix. Chega em
5 dias, depende da região" passando) foi corrigida em seguida.

A correção:
- **Negadores:** `prepaidNamed` ignora o nome do antecipado quando ele vem negado ("sem",
  "nada de", "não precisa", "não quer" fora de pergunta, "pix não!").
- **Onde vale:** no cabeçalho, na faixa e na regra de número.
- **Sombreamento:** o `PREPAY_NAME` local da faixa sombreava o externo, e com isso "Te mando
  o link e chega em 1 a 3 dias" era vetada. Foi consertado.
- **Guardas:** gerador com 802 frases e 5 mutações novas. Esta correção **não teve revisão
  independente**.

**Fora do conserto, já existiam antes e ficam registrados:**
- **Nome do COD depois da contagem:** "Chega em uma semana na entrega." passa no
  antecipado.
- **Cabeçalho COD com corpo de média:** "Na entrega? Varia, em média 5 dias úteis." passa.
- **"Entregador" ou "na porta" como nome do COD em frase do antecipado:** "No pix, o
  entregador leva em 2 dias." vai para a faixa de 1 a 3 dias.
- **Contagens fora da regra:** "um mês", "quinzena", "meia semana", "de zero a três dias",
  "às vezes cinco", "nunca passa de 5 dias", e "5 dias." sozinho.
- **Duas frases de caminho:** "Na entrega ou no pix, chega em 1 a 3 dias." passa no COD.

**Custo aceito, falsos positivos baratos no COD:** o `ARRIVAL` inclui "aí" (a muleta da
Malu) e casa "saia" em `sai\w*`. "E aí, em 2 semanas você já se acostuma" e "A garantia é de
7 dias pagando na porta" são vetadas.

**Instável, causa provável achada na revisão final de 2026-09-27:** `pnpm verificar:guardas`
deu 100, 101 e 102 de 102 no mesmo HEAD. A ferramenta lia a lista de mutações do arquivo da
árvore, mas aplicava cada mutação num worktree do commit. Com edição não commitada, as duas
versões divergiam. Além disso, uma guarda morta por timeout contava como "pegou".

A ferramenta agora:
- lê o HEAD uma vez só;
- recusa rodar com a árvore suja;
- trata guarda sem status como inconclusiva.

**Registro:** as mutações M-08-tomada e M-08-troca-solta tinham ficado com o texto de antes
da nona revisão, e foram atualizadas neste commit. Toda mudança numa linha âncora de mutação
tem de rodar `pnpm verificar:guardas` inteiro, não só a mutação nova.

## 20. Revisão final do branch (2026-09-27)

Quatro revisores Opus em paralelo (correção, integração, segurança, testes) sobre
`main...claude/focused-gates-fjpixt`.

```mermaid
flowchart TD
  A1["🟥 integração A1: a M-08 lia 'um dia bom' do silence_1 como prazo de 1 dia;<br/>no antecipado a varredura CANCELAVA o toque em silêncio (regressão contra o main)"]
  N["🟥 correção: 'No pix não precisa esperar, chega em 2 dias' e<br/>'Nem no pix demora: chega em 2 dias' passavam no COD (regressão do 5995923)"]
  S["🟧 segurança: toque pós-pedido lia o pedido por order_id sem o lead;<br/>externalId sem limite"]
  T["🟧 testes/integração: verificar:guardas misturava árvore e HEAD; timeout contava como pego"]
  F1["🟥 atalho sugerido para A1: 'um/uma' só conta com fala de entrega<br/>→ ~90 mentiras da M-08 passariam ('Em uma semana o colete é seu')"]
  C["🟩 'um/uma' é artigo só sem entrega/chegada/posse, sem palavra de tempo tomando-a<br/>e sem o antecipado nomeado; negação que governa a contagem com a verdade na frase;<br/>'não precisa' e 'nem' só negam o nome fechando a oração"]
  G["🛡️ teste que roda TODA variante de TODO toque da régua pelos gates (zero vetos);<br/>mutações um-dia-bom, um-artigo-largo, uma-semana-negada, pix-nao-precisa-verbo,<br/>nem-no-pix, pedido-de-outra-cliente; verificar:guardas preso a um commit limpo"]
  A1 --> F1 --> C
  N --> C
  C --> G
  S --> G
  T --> G
```

**Provado na PostgREST real, com leituras apenas:** `or=(kind.like.silence_*,kind.eq.checkout_reminder)`
casa, e a igualdade no timestamp que a própria API devolve (`…403606+00:00`) casa em `eq.`. Com
isso, o fechamento pela `run_at` e o cancelamento na resposta funcionam no banco de verdade.

**Aviso ao operador (corrigido em 2026-09-28):** o `perdido` não acontece de uma vez no
deploy. Produção tem 0 linhas em `followups`, e a v41 já cancela os `silence_3` vencidos. Com o
cupom inativo o `silence_3` sai cancelado, e isso é o fim da régua (opção a), um lead de cada vez.

**Resíduos:**
- **Mentira que passa no COD sem caminho nomeado:** "Uma semana e ele tá contigo". O `main`
  também deixava passar.
- **Negação só por extenso:** a negação que governa a contagem vale só para "um/uma".
- **Envio no máximo uma vez:** com o canal ligado, uma falha da Cloud API perde o toque. Fica
  só o e-mail de falha.
- **Testes só textuais:** vários testes de `index.ts` só leem o texto do arquivo. A prova de
  produção é a sonda da varredura pela porta do n8n depois do deploy.
- **Conferência final (APROVADO COM RESSALVAS):** a exceção do artigo deixa passar no
  antecipado mentiras de "uma semana" que o 5995923 vetava. O `main` também as deixava
  passar, então não é regressão. Os casos:
  - "Uma semana, no máximo." — o teste da cauda não aceita a vírgula; `^[\s,]+` resolve.
  - "Numa semana você já está com ele." — falta "com ele / o colete" na lista de posse.
  - "Daqui (a) uma semana você já está usando." — falta "daqui (a)" nas palavras de tempo
    antes da contagem.
  - "Numa semana você já veste." — chegada disfarçada de uso.

  A gravidade é baixa: uma semana corrida fica perto da média de 5 dias úteis. É o próximo
  item de gate.

---

## Lições (valem para qualquer correção futura)

1. **Toda isenção num gate é um afrouxamento.** Antes de isentar, escreva a mentira que a
   isenção libera e prove que ela continua vetada (grafos 2 e 9 erraram aqui).
2. **Exclua, nunca exija.** "Só passa para uma pessoa se perguntar" perdeu reclamações; "passa,
   exceto despedida feliz" não perde (grafo 6).
3. **Para o caminho feliz, lista de permissão; nunca lista de proibição.** Nenhuma lista
   enumera todas as queixas; uma lista enumera as despedidas (grafo 6).
4. **Estado vem do turno, não do texto.** Três heurísticas de quantidade falharam; passar
   `ctx.units` ao gate resolveu (grafo 1).
5. **Estado guardado precisa de dono do tempo**: quando nasce, quando renova, quando expira
   e quando zera. "Zera na conversa nova" era código morto (grafo 4).
6. **Uma correção muda o contexto de outra.** Guardar o caminho expôs um veto antigo no
   prazo (grafos 3 → 8). Depois de corrigir, rode a rodada de personas de novo.
7. **A correção também é revisada.** Nove passadas de revisão: cada uma achou furos nas
   correções da anterior. Parar só em "aprovado com resíduos" listados.
8. **Teste local não prova credencial de produção.** O proxy desta máquina injetava a chave
   da Meta; produção tinha outra. Toda subida termina com sonda pela porta do n8n (grafo 11).
9. **Mutação escrita por script:** o `re.sub` do Python come as barras invertidas do texto
   de substituição; use uma função como substituto, ou a mutação "não se aplica" e escapa.
