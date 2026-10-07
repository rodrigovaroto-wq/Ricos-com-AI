# Diagnóstico mensagem a mensagem — testes reais de 07/10 (base da v12)

> Conversas: operador (final 5983, `816795ca…`, v10→v11), amigas 7967 (v10) e 9393 (v10→v11).
> A 7745 é da v9 (link antes dos dados, "complemento") — tudo ali já foi consertado na v10 e não entra.
> Cada linha: a mensagem da Malu (resumida), o que está errado, e o item de conserto (§ abaixo).
> Decisões do operador (07/10, noite) já aplicadas na coluna "conserto".

## Causa-raiz que explica metade dos defeitos

**A consulta de cobertura da Coinzz falha em produção desde 24/09** (O-01): sem o cabeçalho
`X-Requested-With: XMLHttpRequest` ela redireciona (302) para a home. Com o cabeçalho, testado em
07/10: São Paulo 01310-100 → 3 datas de entrega; Manaus 69005-010 → sem entrega. Sem região, a Malu não
pode afirmar a entrega, e o sistema manda dizer "o checkout confirma" — daí as frases repetidas sobre CEP
e checkout, a pergunta de pagamento sem as duas opções, e o risco de um link de pagamento na entrega para
quem não tem entrega. → **C1**.

## Final 5983 (operador)

| Hora | Malu | Problema | Conserto |
|---|---|---|---|
| 10:01 | Recepção "Oii, tudo bem?…" | "Oii, tudo bem?" sai (decisão). "uma de nossas atendentes" sugere pessoa | T1 · pergunta P4 |
| 10:04 | "Oii, eu sou a Malu…" + 3 balões (postura, grade P–XGG, preço, 12x, CEP) | Sem a saudação por horário. "No cartão do checkout dá pra parcelar em até 12x" sem dizer **antecipado** (o checkout da entrega não parcela). 60 s de espera + 2 reescritas | T2 · T12 · R1 |
| 10:09 | "Que bom que ficou claro… o seu é o M…" ‖ "**Recebi seu CEP**, deixa eu conferir… soltinha ou justinha?" | CEP de 9 dígitos não lido e dito "recebi". Promessa de conferir. Pergunta inútil (soltinha/justinha não muda o tamanho) | C3 · C5 · T7 |
| 10:16 | "o M continua perfeito… fica **soltinho** como você gosta" ‖ "**Vou conferir esse CEP com calma**… em quantos dias costuma chegar encomenda aí?" | Colete modelador "soltinho" é contradição. Promessa de ação que não existe. Pergunta sem propósito | C5 · T7 |
| 10:19 | "Entendi, bom saber esse ritmo daí." ‖ "O que confirma certinho pra esse CEP é o checkout… pagar na entrega ou no antecipado?" | Enchimento. "checkout confirma" (1ª). Escolha pedida sem as duas opções | C1 · T6 |
| 10:21 | As duas opções ✅ ‖ "O que confirma pra esse CEP é digitando no checkout" | "checkout confirma" (2ª) | C1 |
| 10:25 | "Fechado, deixo… o que confirma… checkout" ‖ kit ‖ "me conta seu nome completo?" | "checkout confirma" (3ª). Kit e pedido de nome juntos. "o na entrega acho" não gravado | C1 · C8 · T5 |
| 10:28 | "Fechado em 1 peça então, Leila, fica o M pra cintura de 68 a 76 cm." ‖ sobrenome | Resumo do pedido (1ª de 5). Nome | T6 |
| 10:29 | "Obrigada, Leila da Silva, **já deixei anotado aqui**." ‖ e-mail | "anotado". Nome em 2 mensagens seguidas. Nome completo não gravado | T6 · C9 |
| 10:30 | Resposta fixa do "vou pensar" (estoque, garantia, "quando quiser seguir…") | Recusa do e-mail lida como adiamento | C7 |
| 10:32 | "Não te impede não, Leila…" ‖ "Pra emitir a nota fiscal, **como a lei pede**, você me passa seu CPF?" ‖ "Lá no checkout você escolhe o M e completa o endereço" | Nome de novo. Texto do CPF (decisão). Aviso do checkout repetido (sai uma vez só, no link) | T4 · T5 · T6 |
| 10:33 | "Obrigada, **anotei o CPF pra nota fiscal, como a legislação pede**." ‖ "**Tá tudo pronto**… quer que eu te mande o link?" | "anotei" + motivo repetido. "Tudo pronto" sem CEP. Pede permissão para mandar o link | C4 · T3 · T6 |
| 10:39 | "só me passa seu CEP pra eu gerar o link…" ‖ "É só o CEP mesmo, o endereço você completa lá no checkout junto com o M." | CEP pedido de novo (ela já tinha mandado). Aviso do checkout (3ª) | C3 · T5 |
| 10:41 | "**Anotei, 004710090**…" ‖ "te mando o link em seguida, tá bom?" | CEP inválido dito "anotei". Promessa de link | C3 · C5 |
| 10:43 | "Fechado então, Leila, 1 peça no M pra cintura de 68 a 76 cm…" ‖ "Estou deixando seu link prontinho… já te mando" | Resumo (3ª). Promessa. "sim ok" não contou como pedido | C5 · C6 · T6 |
| 10:45 | "tá tudo anotado pra 1 peça no M…" ‖ "Te mando o checkout aqui em seguida…" | "me manda o checkout logo" não contou como pedido de link | C5 · C6 · T6 |
| 10:47 | "Vou mandar sim, Leila, tá tudo pronto…" ‖ "Estou só finalizando seu checkout…" | "você não vai me mandar o link????" não contou | C5 · C6 |
| 10:48 | "Você tem razão, desculpa…" ‖ "…CEP 004710090, pagando na entrega, então assim que seu link ficar pronto eu mando…" | Resumo com o CEP inválido. Promessa | C3 · C5 |
| 10:49 | (descadastro) | "pare de me mandar confirmações, apenas me mande o link do checkout" → opt-out | C2 |

## Final 7967 (amiga)

| Hora | Malu | Problema | Conserto |
|---|---|---|---|
| 07:24 | "Oi, que bom que você chamou, sou a Malu, da Encorpa." ‖ "Tem alguma roupa…?" | Sem a saudação por horário | T2 |
| 07:25 | "**Que vestido lindo** pro colete, o roxo… fica **maravilhoso**" ‖ calça? ‖ soltinha ou justinha? | Opina sobre a roupa sem ver. Duas perguntas numa resposta | T8 · T7 |
| 07:28 | "com o colete mais justinho o vestido roxo assenta…" ‖ "Que número de calça você veste…?" | Pergunta da calça repetida. Vestido (2ª) | T7 · T9 |
| 07:40 | "Ainda está aí?" | 1º de 4 em 2 h | R3 |
| 07:53 | "Com 42… o seu é o G… deixa o vestido roxo lisinho" ‖ CEP | Vestido (3ª) | T9 |
| 07:56 | "**Anotei seu CEP**… o seu tamanho segue o G… vestido roxo" ‖ "Quando você digitar esse CEP no checkout ele já confirma…" ‖ "Tem alguma dúvida do colete…?" | Região não consultada (C1): sem as duas opções, a conversa parou. "anotei", resumo, vestido (4ª) | C1 · T6 · T9 |
| 08:10 | "Ainda está aí?" | 2º | R3 |
| 08:11 | "Que ótimo, esse vestido roxo vai voltar pro corpo com tudo." ‖ "…pagar na entrega ou no antecipado com desconto?" | Ela disse "vou fazer o checkout aqui" e nunca recebeu link. Vestido (5ª). Escolha sem as opções | C1 · T9 |
| 08:25 | "Ainda está aí?" | 3º | R3 |
| 08:45 | "Oi! Ficou alguma dúvida…? **me diz que tamanho de calça você usa**…" | Lembrete pede o tamanho de quem já deu (G) | C10 · R3 |
| 09:14 | "Fechado no pagamento na entrega, **ótima escolha** porque você não paga nada agora." ‖ kit | Elogio de enchimento | T6 |
| 09:25 / 09:45 | "Ainda está aí?" / lembrete pedindo o tamanho de novo | 4º; tamanho de novo | R3 · C10 |

## Final 9393 (amiga)

| Hora | Malu | Problema | Conserto |
|---|---|---|---|
| 09:17 | "Sou a Malu, da Encorpa, **que bom te ver por aqui**." ‖ grade P–XGG ‖ roupa? | Não respondeu o "tudo bem?" dela. Enchimento. Sem a saudação | T2 |
| 09:30 | "Ainda está aí?" | 1º de 4 | R3 |
| 09:37 | "**Ai que delícia**, conta pra mim qual peça…" | Enchimento | T8 |
| 09:50 / 10:10 | "Ainda está aí?" / lembrete | 2º | R3 |
| 11:02 | elasticidade ✅ ‖ durabilidade e lavagem ✅ ‖ calça? | — (fatos da base) | — |
| 11:03 | lavagem ✅ ‖ secadora ✅ ‖ "pode usar o quanto quiser…" ✅ + calça? | Pergunta da calça repetida | T7 |
| 11:04→11:06 | (ela mandou a mesma pergunta 2×: 1min36s sem resposta) | Demora | R1 · R2 |
| 11:06 | "Com 42 o seu é o G… **modela cintura e quadril juntinhos**" ‖ CEP | Fato inventado: o colete pega abdômen e costas, não quadril | T10 |
| 11:08 | "com 68cm de cintura o seu é o M… **o tecido elástico acompanha o quadril**" ‖ CEP | Idem (mais leve) | T10 |
| 11:20 / 11:40 | "Ainda está aí?" / lembrete **pedindo o tamanho** (já era M) | Lembrete errado | R3 · C10 |
| 12:18 | "Que bom que você mandou áudio, aqui ele não abriu…" ‖ "o seu tamanho certinho é o M… me passa seu CEP" | Áudio não ouvido. Tamanho repetido, CEP pedido pela 3ª vez | A1 · T6 |
| 12:30 / 12:50 | "Ainda está aí?" / lembrete pedindo o tamanho | 4º | R3 · C10 |

## Os consertos

### C — o que impede a venda (código determinístico; Opus)
- **C1** Cabeçalho `X-Requested-With` na consulta da Coinzz (uma linha + teste).
- **C2** Descadastro: "pare de me mandar *confirmações*… me mande o link" não é opt-out (lista de permissão do objeto).
- **C3** CEP de 7 ou 9 dígitos → diretiva "esse CEP veio com N números, confere pra mim?"; o turno diz ao modelo quando não há CEP gravado (nunca "anotei/recebi").
- **C4** O CEP é pedido logo depois do tamanho, em todo turno; nome, e-mail e CPF esperam o CEP.
- **C5** Gate novo: promessa de mandar link ou de conferir, num turno sem link e sem handoff, volta para reescrita com o que falta.
- **C6** `asksForLink` lê "checkout" e a cobrança ("não vai me mandar o link?", "manda logo", "sim pode mandar").
- **C7** Recusa de dado (e-mail) não aciona o "vou pensar".
- **C8** "o na entrega acho" grava o caminho.
- **C9** O nome completo substitui o primeiro nome.
- **C10** O lembrete de silêncio não pede tamanho quando o tamanho é conhecido (lê o lead, não só a última resposta).
- **(já na main)** `2c0e9ea`: "pode mandar não, desisti" e "nem quero mais".

### T — texto (prompt e linhas fixas)
- **T1** Recepção: sai "Oii, tudo bem?"; ficam o aviso e o site.
- **T2** 1ª resposta da Malu: balão 1 "Oii, {bom dia | boa tarde | boa noite}, tudo bem?! Sou a Malu e darei
  início ao seu atendimento." (06–12 / 12–19 / 19–24, horário de São Paulo); balão 2 "Em que posso te ajudar?"
  — ou, se ela já perguntou algo, a resposta à pergunta (ver P1). O modelo não se apresenta de novo.
- **T3** Link sem pedir permissão, texto fixo, 3 balões (ver P2). O aviso "lá você completa…" uma vez só, aqui.
- **T4** CPF: "Para a emissão da nota fiscal, me passa seu CPF por favor?" — sem "como a lei pede".
- **T5** Kit uma vez, sozinho, antes do link (já é a regra; reforço).
- **T6** Sem "anotei/anotado", sem resumo do pedido, sem confirmar cada dado, sem "ótima escolha"; o nome
  dela no máximo 1 vez a cada 5 mensagens. Gate barato para "anot-" (palavra), o resto no prompt.
- **T7** Sai "soltinha ou justinha"; uma pergunta por mensagem; nunca a mesma pergunta duas vezes.
- **T8** Não opinar sobre a roupa ("lindo", "maravilhoso", "que delícia"): ela não viu a roupa.
- **T9** A roupa dela no máximo 2 vezes na conversa (regra que já existe e não foi seguida: 5 vezes na 7967).
- **T10** O colete pega abdômen e costas: nunca dizer que modela quadril.
- **T11** Fotos: "No nosso site tem o catálogo completo e um vídeo de uma cliente usando: {site}".
- **T12** Parcelamento sempre dito com "no antecipado".
- **T13** Ganchos de persuasão (decisão do operador): toda resposta a uma pergunta dela termina num gancho que
  aproxima e explora a dor dela ("…mas me diz, você tem alguma roupa que ama, mas não tem usado por conta do
  seu corpo?"), e os agregadores de valor (desconto, frete grátis na entrega, pagar só na entrega, 7 dias)
  entram um por vez, no momento certo, sem repetir.

### R — ritmo
- **R1** Sem os 5 s de espera quando já há mais de uma mensagem dela sem resposta.
- **R2** Digitação 30% mais rápida (800 → 560 ms por palavra).
- **R3** "Ainda está aí?" no máximo 1 por dia, aos 20 min (era 10); o `silence_1` passa de 30 min para 1 h.

### A — áudio
- **A1** Transcrever o áudio dela: primeiro a Meta (se a API aceitar áudio); senão Gemini. Atenção: no plano
  gratuito do Gemini o Google pode usar o conteúdo para melhorar os produtos dele — áudio de cliente tem dado
  pessoal (LGPD). Comparar com o plano pago (centavos por áudio) antes de decidir.

## Perguntas ao operador
- **P1** Ela já perguntou algo na 1ª mensagem: balão 2 vira a resposta (sem "Em que posso te ajudar?")?
- **P2** Texto do link — na entrega: "Perfeito! É só clicar no link do checkout a seguir e concluir sua compra,
  obrigada por escolher a Encorpa." ‖ {link} ‖ "Lá você completa o endereço, escolhe o {tamanho} e o dia da
  entrega. Se precisar de alguma ajuda, estarei aqui." No antecipado o 3º balão: "Lá você completa o endereço,
  escolhe o {tamanho}, confere o frete da sua região e paga no pix ou no cartão. Se precisar de alguma ajuda,
  estarei aqui."
- **P3** "Ainda está aí?": 20 ou 25 min?
- **P4** Recepção: trocar "uma de nossas atendentes" (sugere pessoa) por "a Malu"? Se não, fica.
- **P5** Áudio: Gemini gratuito (dado pode treinar o Google) ou pago (não treina)?
