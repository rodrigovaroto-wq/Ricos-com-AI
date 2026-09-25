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
  OFF["🟩 envio desligado (CANAL_ATIVO=false) até os valores do sócio"]
  GD["🛡️ WA-1-janela · WA-selo · WA-janela-no-fim · WA-envio-desligado ·<br/>regra n8n do corpo inteiro · teste do nó de envio contra src/channel"]
  S --> G1 --> C1 --> R1 --> C2 --> R2 --> C3 --> R3 --> C4 --> OFF --> GD
```

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
