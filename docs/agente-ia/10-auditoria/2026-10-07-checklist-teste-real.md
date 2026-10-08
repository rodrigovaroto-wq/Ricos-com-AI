# Checklist de avaliação — teste real da v10 (2026-10-07)

Para cada conversa do teste (5 testadores, um PDF cada), eu respondo todas as perguntas abaixo
com **sim / não / não se aplica** e a evidência: o print (o que ela viu) **e** a linha do banco
(o que o sistema decidiu). Quando os dois não batem, isso já é um achado.

Fontes de cada pergunta: desenho v2 ([`06-script/05-conversa-de-venda-v2.md`](../06-script/05-conversa-de-venda-v2.md)),
grafo §54–§64 ([`04-grafo-de-decisoes.md`](../../documentacao/decisoes/04-grafo-de-decisoes.md)),
decisões R18.1–R18.8 e o `CLAUDE.md`.

---

## 0. Antes de ler a conversa

1. O telefone do PDF casa com qual lead e qual conversa no banco?
2. Todo turno dessa conversa tem `turn_outcomes.agent_version = 10`? Se algum tiver outra
   versão, a conversa não mede a v10 e eu separo esse turno.
3. Quantos turnos ela teve, e qual foi o desfecho de cada um em `turn_outcomes`: respondido,
   `superseded`, `joined`, `deferred`, `stopped`, handoff? Algum desfecho ficou sem explicação?
4. Qual foi o custo total (`conversations.cost_brl`)? Ficou abaixo do teto de R$ 1,00? Ficou
   perto dos ~R$ 0,03 por conversa medidos no contribuidor?
5. Quantas reescritas houve e quais gates vetaram (`gate_traces`)? Algum veto se repetiu no
   mesmo turno?
6. As mensagens do banco são as mesmas do print, na mesma ordem? Alguma mensagem da Malu está
   no banco e não no print, ou o contrário?
7. Qual foi o roteiro que o testador seguiu, e qual caminho ele pegou (CEP com pagamento na
   entrega, Manaus, recusa de CPF, "vou pensar", outro)?

---

## Parte A — as mudanças depois do 1º teste real (PR #53 → #54) funcionaram?

### A1. Rajada: uma resposta por rajada (grafo §59, §61)

8. Quando ela mandou duas ou mais mensagens seguidas, recebeu **uma** resposta que cobre todas?
9. Alguma pergunta dela, no meio de uma rajada, ficou sem resposta?
10. Dois blocos de resposta se intercalaram no WhatsApp?
11. Quando ela escreveu enquanto a Malu digitava, a resposta foi revista com a mensagem nova
    (sem resposta duplicada e sem resposta jogada fora)?
12. O banco mostra `superseded`/`joined` só onde houve rajada de verdade?
13. Na rajada, o dado mais novo venceu o mais antigo (tamanho, endereço, nome corrigidos)?
14. Algum turno passou do limite de revisão e foi para a varredura (`deferRetry`)? Em quanto
    tempo ela recebeu a resposta?

### A2. Sem "não entendi" (grafo §60)

15. Apareceu "Desculpa, não entendi", "Precisa de ajuda para escolher o tamanho?" ou "Quando
    decidir é só me falar"?
16. "ah ok", "hum", "kkk" receberam continuação curta e calorosa do assunto aberto, em vez de
    uma pergunta nova sem ligação?
17. "??" recebeu a última mensagem dita de novo, mais simples e sem culpar ela?
18. Quando ela desviou (pergunta de produto no lugar do tamanho), a Malu respondeu primeiro e
    voltou ao arco com uma ponte curta?

### A3. Identidade (grafo §58, Q10)

19. A Malu se apresentou como "a Malu, da Encorpa", sem dizer "assistente virtual", "IA" ou
    "robô" sem ninguém perguntar?
20. Se perguntaram "você é robô?", ela respondeu com honestidade e ofereceu falar com alguém do
    time?
21. Ela afirmou em algum momento ser uma pessoa?

### A4. As duas opções, onde há pagamento na entrega (grafo §62, desenho §5.1)

22. A cobertura só foi afirmada **depois** da consulta do CEP?
23. Com pagamento na entrega disponível, ela recebeu as **duas** opções lado a lado?
24. A frase do frete grátis é a canônica ("Pagando na entrega o frete é grátis: você paga só
    R$ X quando receber")?
25. Cada prazo está colado no seu caminho (entrega 1–3 dias no dia que ela escolhe; antecipado
    em média 5 dias úteis, varia por região)?
26. Tudo do antecipado veio numa frase só, com "o frete é calculado por região no checkout"?
27. Os 10% saíram só como percentual, nunca como economia em reais?
28. A âncora (preço cheio) ficou fora da mensagem das duas opções?
29. A mensagem terminou com uma pergunta de escolha, sem empurrar uma das duas?

### A5. Sem pagamento na entrega (Manaus 69050-000, desenho §5.2)

30. Ela ouviu com carinho que ali ainda não tem pagamento na entrega, e o motivo?
31. Recebeu o antecipado com o desconto e o preço do config, frete por região e prazo médio?
32. A garantia de 7 dias apareceu como reversão de risco?
33. Saiu alguma vez "você não paga nada agora", "paga ao entregador" ou "paga quando receber"?
34. O link (se saiu) é o do antecipado (Coinzz)?

### A6. A escolha do caminho (grafo §63, desenho §5.1 e §5.3)

35. "Sim"/"ok"/"pode ser" sem escolher virou "Então deixo no pagamento na entrega… pode ser?",
    e só onde a entrega existe?
36. "A primeira", "o antecipado" ou "quero pagar no pix" ficaram gravados no caminho certo
    (`leads.payment_choice`)?
37. Depois de escolher, a comparação foi reaberta sem ela pedir?

### A7. Os dados antes do link (grafo §63, §64, desenho §6)

38. A ordem foi tamanho → CEP → forma de pagamento → nome completo → e-mail → CPF?
39. Foi um dado por mensagem, com o motivo quando ajuda (nome: o pedido sai no seu nome;
    e-mail: deixa o checkout preenchido; CPF: nota fiscal)?
40. Algum dado já dado foi pedido de novo (tamanho, CEP, nome)?
41. Só o primeiro nome → ela recebeu só "E o sobrenome?"?
42. Nome na 1ª linha com a rua embaixo → o nome foi lido, sem pedir de novo?
43. Ela mandou tudo de uma vez → a Malu agradeceu numa frase e seguiu, sem confirmar campo por
    campo?
44. E-mail recusado uma vez → nunca mais foi pedido?
45. CPF: na 1ª recusa, ela ouviu o motivo uma vez; o 2º pedido **citou a palavra CPF**?
46. Recusou o CPF duas vezes → o link saiu sem o CPF, com "você digita direto no checkout"?
47. "E se eu não passar o CPF?" foi tratado como dúvida e não contou como recusa?
48. CPF inválido → "Acho que escapou algum número aí" (nunca "CPF inválido")?
49. Endereço inteiro → a Malu usou só o CEP e **não** repetiu o endereço de volta?
50. Ela disse em algum momento onde o dado fica ou deixa de ficar guardado? (proibido)

### A8. O link (desenho §7)

51. O link só saiu depois de todos os dados (ou das recusas permitidas)?
52. O link veio com nome, e-mail, telefone e CPF preenchidos? **Precisa do print da página do
    checkout**: o banco não mostra o que a página exibiu.
53. A mensagem do link diz o que ainda falta fazer lá (endereço, dia da entrega, tamanho no
    seletor) e, na entrega, "nessa página você não paga nada"?
54. Apareceu "complemento do agendamento"? (proibido desde §62)
55. Um link por mensagem e um caminho por link: o link da entrega nunca veio com o preço do
    antecipado, nem o contrário?
56. Se ela pediu o outro caminho depois, recebeu o outro link com os mesmos dados?

### A9. Kit (grafo §63, §64)

57. O kit foi oferecido **uma** vez, sozinho na mensagem, depois da escolha do caminho e antes
    do link?
58. Os valores do kit são os do caminho dela, conferidos contra o `BUSINESS_CONFIG` no ar?
59. Ela recusou → o kit voltou a aparecer?

### A10. "Vou pensar" (R16.8, grafo §63, §64)

60. Saiu a frase fixa (sem pressão, estoque declarado, argumento do caminho dela)?
61. Sem os dados completos, a frase saiu **sem** link?
62. A frase fixa saiu duas vezes seguidas?
63. Quando ela voltou depois, a Malu retomou de onde parou, sem cobrar?

### A11. Preço antes do CEP (grafo §64)

64. "Quanto custa?" antes do CEP recebeu o preço logo, sem segurar até o CEP?
65. O preço foi dito sem afirmar cobertura nem frete grátis antes da consulta?

### A12. Forma das mensagens (grafo §64)

66. Alguma resposta passou de 3 balões?
67. Apareceu nota interna do modelo (inglês, "Need ask…", instrução para si mesma)?
68. Algum balão foi cortado no meio da frase?

### A13. Toques depois de cada resposta (R18.8, grafo §61)

69. A resposta **com** link armou só o lembrete de 15 min (sem "Ainda está aí?" e sem
    `silence_1` na primeira meia hora)?
70. A resposta **sem** link e terminada em pergunta armou "Ainda está aí?" aos 10 min, e o
    `silence_1` aos 30 min?
71. "Ainda está aí?" saiu uma vez por pergunta, dentro das 24 h, e foi cancelado quando ela
    respondeu?
72. A pergunta de ofertas (opt-in) veio depois do lembrete do link ou do `silence_1`, e nunca
    antes?
73. Saiu algum toque fora do horário (antes das 06:00)?
74. Algum toque saiu depois de ela comprar, pedir uma pessoa ou pedir para parar?

### A14. Cancelamento e pedido feito (grafo §54, §56, §57), só se alguém testou

75. "Quero cancelar" recebeu a resposta fixa do caminho e do status certos (entrega: recusar
    na porta; antecipado saído: devolução depois de chegar; antecipado não saído: cancelamento
    manual), sempre com handoff?
76. A Malu disse em algum momento que cancelou? (proibido)

### A15. Abertura e ritmo (R18.1)

77. A recepção fixa saiu na hora, com o texto de sempre?
78. A primeira resposta real saiu cerca de 1 minuto depois?
79. Cada balão saiu com o tempo de digitação, sem rajada de balões instantâneos?

---

## Parte B — a conversa inteira está coerente com o que construímos?

### B1. O arco de 8 etapas (desenho §4)

80. Dá para dizer, a cada mensagem, em que etapa a conversa estava (abertura, descoberta,
    tamanho, valor, pagamento, dados, link, pós-link)?
81. A Malu pulou alguma etapa necessária, ou travou numa etapa depois do sinal de avançar?
82. Quando ela chegou com pergunta pronta (preço, tamanho), a pergunta dela veio primeiro?
83. A pergunta da roupa foi feita uma vez só, e abandonada se ela não quis contar?
84. Cada mensagem andou um passo, ou houve mensagem que não levou a nada?

### B2. As 14 regras contra o robô (desenho §3)

85. A primeira frase de cada resposta responde ao que ela perguntou?
86. Algum preço ou fato foi repetido sem ela perguntar de novo?
87. O nome dela apareceu no máximo uma vez a cada 5 ou 6 mensagens?
88. A roupa dela (a cena) apareceu no máximo duas vezes na conversa inteira?
89. Alguma mensagem contradisse a anterior sem dizer que estava corrigindo?
90. Foi uma pergunta por mensagem, no fim, sem a mesma pergunta com as mesmas palavras?
91. Elogio de enchimento ("ótima pergunta", "que legal") apareceu mais de uma vez?
92. Saiu "não tenho essa informação" seco, sem o que é certo e sem handoff?
93. Alguma pergunta dela ficou sem resposta?
94. A Malu ligou a pergunta antiga à resposta nova quando eram a mesma necessidade?

### B3. A cabeça dela (desenho §2)

95. A Malu falou do caimento da roupa e nunca de defeito do corpo dela?
96. A reversão de risco (pagar na entrega, 7 dias) veio quando ela hesitou, e não em toda
    mensagem?
97. Houve pressão, urgência inventada ou escassez fora da frase do "vou pensar"?
98. Ao ler a conversa como cliente: ela se sentiu ouvida ou interrogada?

### B4. Números e promessas: só o que o config e a operação cumprem

99. Todo número citado é o do `BUSINESS_CONFIG` no ar (preços, desconto, prazos, garantia, kits,
    clientes satisfeitas)? Confiro contra o segredo, não contra o exemplo do desenho.
100. A troca foi dita como grátis, ou com o valor R$ 27,00 antes da compra? (os dois são
     proibidos; a devolução é sem custo)
101. Apareceu cupom (SUPER20) antes do `silence_3`?
102. Parcelamento: só no antecipado e só se ela perguntou?
103. Prometeu prazo exato, "chega amanhã", entrega expressa ou no mesmo dia?
104. Prometeu resultado de saúde ou de corpo (emagrecer, afinar, hérnia, postura permanente)?
     O certo é "modela enquanto está vestido, não emagrece".
105. Inventou depoimento, contato de cliente, CNPJ ou dado da empresa fora do config?
106. Disse "experimenta/veste antes de pagar"? O certo é "vê o colete antes de pagar".
107. Os fatos do produto batem com os do operador (sem barbatana, poliéster com elastano, forro
     de algodão, colchetes que não enrolam, só preto, tamanho no seletor do checkout)?
108. O tamanho indicado é o que a tabela de medidas dá para a calça ou a cintura dela, com a faixa em cm?
     Entre dois tamanhos, foi o maior, com o porquê?

### B5. Handoff, opt-out, horário

109. Pedido de pessoa teve handoff imediato, sem a Malu prometer o que ninguém vai cumprir?
110. Dúvida repetida ou "??" sem saída escalou para urgente, com briefing?
111. Pedido para parar de receber mensagens foi respeitado na hora, inclusive misturado com
     outra frase?
112. Chegou o e-mail de handoff ao operador, com motivo e contexto? (confirmar na caixa)

### B6. Comparação com a conversa da Leila (desenho §11)

113. Placar desta conversa: preço dito quantas vezes, nome quantas vezes, CEP pedido quantas
     vezes, "não entendi" quantas vezes, contradições, perguntas sem resposta?
114. Esta conversa teria chegado ao link com a Leila de 06/10? Em que ponto travaria?

---

## Parte C — como cada achado é registrado

Cada "não" vira uma linha com:

| Campo | O que vai |
|---|---|
| Conversa / mensagem | testador, horário, trecho literal |
| Pergunta do checklist | o número acima |
| Gravidade | **1** perde a venda ou trava a compra · **2** promessa que custa dinheiro ou fere regra (CDC, LGPD, anúncio) · **3** soa robô ou repete · **4** cosmético |
| Onde mora a causa | prompt · gate · código determinístico (`interpret`, `identity`, `followups`…) · config/segredo · n8n · modelo (obediência) |
| Evidência | print + linha do banco (`messages`, `gate_traces`, `turn_outcomes`) |
| Já conhecido? | resíduo listado no grafo (§59–§64) ou achado novo |
| Ação proposta | conserto, decisão do operador, ou aceitar como resíduo |

Os achados 1 e 2 vêm primeiro. Achado que é resíduo já aceito no grafo não reabre sem caso
novo. Achado do modelo (obediência) só vira conserto se repetir em mais de uma conversa.

---

## Parte D — o que só o print mostra (não está no banco)

- A página do checkout aberta: dados preenchidos, seletor de tamanho, valor e frete.
- A ordem e o tempo de chegada dos balões no celular (intercalação, digitando…).
- Mensagem que saiu do banco e não chegou (falha da Cloud API: conferir o e-mail "Mensagem NAO
  entregue").
- Como o link aparece (clicável, com prévia ou sem).

Peça aos testadores que incluam o print do checkout aberto, se chegaram nele.
