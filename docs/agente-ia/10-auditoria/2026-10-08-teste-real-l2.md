# Auditoria — L2: dois testes reais pelo WhatsApp (Leila e Fabiana, 2026-10-08)

> Conversas do operador ("Leila da silva", final 5983, conversa `e50c80b9-4dfc-4498-90a3-27b2532de520`,
> 17:03–17:58) e do sócio ("Fabiana Migga Kirk", final 7967, conversa `dda6231f-83db-4882-8829-ac150d49924b`,
> 18:07–18:26), horário de Brasília. `agent_version` **14** nas duas, modelo `muse-spark-1.3-contributor`.
> Custo: Leila ≈ R$ 0,08, Fabiana ≈ R$ 0,05. Fontes: `messages`, `turn_outcomes`, `gate_traces`,
> `llm_calls`, `followups`, `leads`, `orders` e execuções do n8n — leituras do
> [roteiro](../../operacao/auditar-conversa-real.md). A conversa foi lida inteira primeiro, sem as
> anotações; as anotações do operador e do sócio foram cruzadas depois (seção "Anotações").
>
> **Desfecho: as duas quiseram comprar e receberam o link do antecipado. Nas duas, a região tinha
> pagamento na entrega (três datas, 09, 10 e 13/10) e a Malu disse que não tinha.** A Leila disse que
> pagou e ficou 35 minutos sem resposta. Nenhuma venda chegou ao sistema: `orders` vazia e zero
> execuções do workflow "Venda confirmada".

## Linha do tempo — Leila (operador)

| Hora | Ela | Malu | Leitura |
|---|---|---|---|
| 17:03 | "oii" | recepção automática (1 s) + saudação (70 s) | ✅ |
| 17:06 | "vi seu anúncio no insta… saber mais sobre a cinta" (2 msgs) | o que é + "confortável, não marca… **o efeito é só enquanto está vestido, tá?**" + gancho da roupa | ressalva sem ninguém perguntar; 3 ideias no 2º balão |
| 17:08 | a blusa da mãe | "a blusa assenta **lisinha**…" + pergunta do número da calça | ✅ usa a dor; "lisinha" pela 2ª vez |
| 17:09–17:10 | "44" + "é de qualidade?" + "já comprei uma ruinzinha" | tecido + "500 clientes" · "seu é o G" · pede CEP | ✅ responde antes de perguntar. ❌ ela hesitou ("ruinzinha") e a reversão de risco não veio |
| 17:12:02 | "aah entendi, ok" | 13 s depois: "**Que bom que fez sentido pra você**… me diz qual é seu CEP" | ❌ resposta a um "ok"; CEP pedido 2× seguidas |
| 17:12:19 | "teria como me mandar foto?" | site ✅ | a foto chegou 4 s depois da resposta ao "ok" |
| 17:14 | "ta bom" + CEP 04710090 | "**Aí na sua região a transportadora ainda não tem pagamento na entrega**…" | ❌❌ **falso** (causa 1) |
| 17:16 | "gostei do descontinho kkk, quanto é o frete?" + nome | "frete calculado no checkout" + pede CPF | o frete do antecipado não tem número; com a entrega certa, a pergunta não existiria |
| 17:17 | CPF | link do antecipado (texto fixo) | ✅ link pré-preenchido, uma vez só |
| 17:20 | "tá pedindo meu email, não consigo avançar" | "é isso mesmo, coloca o seu" | ✅ resposta certa; o atrito é do fluxo (causa 5) |
| 17:22 | "ok" | "**Que bom**, aí quando concluir me avisa…" | ❌ resposta a um "ok" (mesma causa do 17:12) |
| 17:23 | "pronto, paguei" | "Vou checar pra você e já te retorno 💛" → **handoff** | ❌ ninguém volta (causa 2) |
| 17:58 | "eai??", "deu certo meu pagamento?", "checou?" | (nada) | ❌❌ 35 min de silêncio com a cliente perguntando do dinheiro dela |

## Linha do tempo — Fabiana (sócio)

| Hora | Ela | Malu | Leitura |
|---|---|---|---|
| 18:09 | dúvida de tamanho + "esse negócio de pagamento na entrega" | 1º balão: "te explico os dois com calma, **e pra te indicar o tamanho… que número?**"; 2º e 3º: como funciona a entrega + "frete grátis, R$ 129,90" | ❌ a pergunta no 1º balão e a resposta depois; "os dois" sem dono. Antes do CEP, a entrega dita como certa |
| 18:12 | "42" | "seu é o G… me passa seu CEP?" | ✅ |
| 18:15 | "Perfeito! Aceita pix né? Toca campainha?" + CEP 04662-002 | "**ainda não tem pagamento na entrega**, mas o antecipado aceita pix…" | ❌❌ falso (causa 1). Ela tinha acabado de dizer "Perfeito!" para a entrega |
| 18:20 | "Perguntei se aceita pix **na entrega**" + nome | "Não aceita, no seu CEP não tem pagamento quando chega" | consequência da causa 1 |
| 18:22 | CPF + "**quero pagar na entrega então**, pode ser no cartão na entrega?" | "vai só no antecipado" + link | ❌ ela pediu a entrega duas vezes e recebeu o antecipado. Uma cliente real desiste aqui |
| 18:26 | áudio: "vou finalizar, obrigado Malu" | "Que ótimo, Fabiana, finaliza com calma…" | ✅ áudio transcrito e respondido certo |

## Causas, por ordem de dinheiro

### 1. A consulta de cobertura manda o CEP com hífen, e a Coinzz recusa — toda cliente ouve "não tem pagamento na entrega"

**Reproduzido em 2026-10-08, ~19:00:** `stock-and-delivery-day` com `zip_code=04710-090` → **422**
`"O CEP não foi encontrado"`; com `zip_code=04710090` → **200** e uma janela "Padrão" com 09/10, 10/10 e
13/10. Igual para 04662-002 e para a Av. Paulista (01310-100). O `parseCep` guarda o CEP como `04710-090`
(é o que está em `leads.address.cep`) e `checkRegion` repassa esse texto à Coinzz; só o ViaCEP recebe os
dígitos (`zip.replace(/\D/g, "")`). O script de dev (`src/dev/availability.ts`) usa dígitos — por isso a
sonda de 07/10 que validou o cabeçalho XHR (C1, grafo §66) respondeu certo e a `turn` não.

**Por que virou "não tem" em vez de "não sei":** no fetcher da `turn`, `r.ok ? r.json() : null` devolve
`null` no 422, e `readAvailability(size, null)` lê `cod: false` ("anything unparseable reads as no cash on
delivery"). A região sai **não nula**, com `cod: false`, e o modelo recebe a diretiva do "não chega". O
comentário da `turn` diz o oposto ("a failed lookup… `region` stays null"); as duas regras se contradizem
e a do `availability.ts` venceu. Antes do §66 a Coinzz devolvia 302 → página HTML → `r.json()` lança →
`catch` → região nula. Desde a v12 (cabeçalho XHR) a falha passou a ser 422 → "sem entrega".

**Alcance:** toda conversa com CEP desde a v12 (08/10) — 2 de 2 nos testes. É o achado que mais custa:
o pagamento na entrega é o caminho que converte o público frio (decisão do operador), e ele foi tirado de
todas. A Fabiana pediu a entrega duas vezes.

**Conserto proposto:** (a) mandar só os dígitos em `zip_code`; (b) resposta não-200 ou sem `data` = região
**desconhecida** (nula), nunca "sem entrega" — "não sei" faz a Malu seguir sem afirmar; "não tem" mente.
Teste com o 422 literal, espelho, mutação, revisão Opus, grafo. **Prova pela porta de produção** (memória
`verificar-pela-porta-de-producao`): um CEP de São Paulo tem de voltar com as duas opções.

### 2. "Paguei" vira handoff, e no handoff ninguém responde

`handoffFor` lê "pronto, paguei" como pergunta sobre pedido existente (`orderContext` vem do link enviado)
→ `ORDER_HANDOFF_REPLY` "Vou checar pra você e já te retorno 💛" + `handoff_at`. Daí em diante o turno
fica calado esperando uma pessoa; às 17:58 as três mensagens dela foram `superseded` e nenhuma teve
resposta. O operador era a própria cliente, então ninguém respondeu — mas em produção é o mesmo: cada
"paguei" vira trabalho manual para o operador, que é o oposto do objetivo.

E não havia o que conferir: `orders` está vazia e o workflow "Venda confirmada" (`/encorpa-venda`) **não
tem nenhuma execução** registrada. Ou o pagamento não foi feito, ou a Coinzz não mandou o webhook desta
oferta (`encorpa-pagamento-antecipado-0`). **Precisa do operador:** o pix foi pago de verdade? O pedido
aparece no painel da Coinzz? A URL do webhook está cadastrada nessa oferta?

**Conserto proposto:** "paguei" depois do link, sem pedido no banco, não é handoff. A Malu responde ela
mesma, sem prometer conferir: "Oba! Assim que a confirmação do pagamento chegar aqui eu te aviso 💛" (texto
fixo, como os outros de pós-venda). Quando o webhook do pedido chega, a régua pós-compra já manda a
confirmação. Se o webhook não chegar em X minutos (sugestão: 30), aí sim e-mail ao operador — sem
`handoff_at`, para a conversa não ficar muda. E, para todo handoff: mensagem nova dela sem resposta humana
em N minutos ganha uma resposta de espera **uma vez** e reavisa o operador, em vez de silêncio.

### 3. Um "ok" sozinho ganha resposta

17:12 "aah entendi, ok" → "Que bom que fez sentido pra você… me diz seu CEP" (o CEP tinha sido pedido 90 s
antes). 17:22 "ok" → "Que bom, aí quando concluir…". O prompt manda isso: *"Um 'ah ok', 'hm' ou 'kkk' pede
uma continuação curta e calorosa"*. Numa conversa de WhatsApp, um "ok" depois de uma pergunta nossa
quer dizer "li, já respondo"; responder repete a pergunta (pressão) ou agradece um "ok" ("Que bom").

**Conserto proposto (determinístico, sem chamar o modelo):** a rajada inteira é só reconhecimento ("ok",
"ta bom", "entendi", "aah entendi, ok", "blz", "kkk", 👍) **e** a última mensagem da Malu pediu um dado
(CEP, nome, CPF, tamanho) ou não fez pergunta → não responde. O "Ainda está aí?" dos 20 min continua
armado e cobre quem sumir. **Não vale** quando a última mensagem foi pergunta de sim/não ou de escolha
("pode ser no antecipado?", as duas opções): aí "ok" é decisão, e o fluxo atual (`DEFAULT_COD_CONFIRM`,
§65) continua. Negações a testar: "ok, mas e o frete?", "ok quero", "não ok". Isso resolve as anotações 4
e 8 de uma vez, e a primeira metade da 4 ("ignorar a confirmação e responder só a pergunta") sai de
graça: o "ok" não gera turno e a pergunta seguinte é respondida sozinha.

### 4. O lembrete do checkout é cancelado por qualquer mensagem depois do link

`rulerFor` só arma o `checkout_reminder` (15 min) na resposta que **carrega** o link. Qualquer mensagem
depois reancora a régua sem ele: a Leila perguntou do e-mail, a Fabiana mandou o áudio — nas duas o
lembrete foi `canceled` e nunca saiu. Na Fabiana, `silence_1/2/3` seguem agendados mesmo se ela pagou,
porque o que os cancela é o webhook do pedido (causa 2).

**Conserto proposto:** o toque do checkout ancora no **link**, não na última mensagem: sai 10 min depois
do link (anotação 10) se nenhum pedido chegou, e só um pedido ou um novo link o cancela. Texto: a
anotação pede "Conferi que seu pagamento ainda não foi concluído" — **só é verdade com o webhook
funcionando**. Até ele estar provado, o texto não pode dizer "conferi"; proposta: "Vi que seu pedido ainda
não foi finalizado, travou em alguma etapa? Me conta que eu te ajudo 💛". No pagamento na entrega a
palavra é "agendamento". Pedido pago → a régua de silêncio para (já é assim quando o webhook chega).

### 5. O checkout do antecipado exige e-mail, e o fluxo tirou o e-mail

Decisão de 07/10 (grafo §66, migração 0024): não pedir nem guardar e-mail. A Leila travou no checkout
("não tô conseguindo avançar sem adicionar email") e precisou de mais uma troca de mensagens. A Coinzz
aceita `email` no link pré-preenchido (`CHECKOUT_PREFILL.prepay` já lista `email`).

**Proposta (anotação 7):** pedir o e-mail **só no antecipado**, depois que ela escolheu (ou depois do "não
chega"), na ordem nome → e-mail → CPF (o CPF continua o último: é o que faz hesitar). Uma recusa basta e o
link vai sem ele, com "lá no checkout ele pede seu e-mail pra mandar a confirmação". Motivo novo para
reabrir o §66: o checkout bloqueia sem ele, provado nesta conversa. O e-mail vai no link e não é gravado
em `leads` (a 0024 continua valendo). Com a causa 1 consertada, a maioria vai para a entrega e nem vê
essa pergunta.

### 6. Texto e ordem (prompt)

- **Ressalva espontânea (anotação 1).** O prompt diz "NÃO emagrece, e o efeito acaba ao tirar. **Diga isso
  quando o assunto chegar perto**" e "essa honestidade é argumento". O modelo leu "chegar perto" como
  "sempre": falou na primeira mensagem, quando ela só disse que viu o anúncio. Proposta: dizer só quando
  ela perguntar de emagrecer, de efeito permanente ou de saúde. Os gates de emagrecimento e saúde
  continuam vetando a promessa — tirar a ressalva espontânea não abre a promessa.
- **"Lisinha" 3 vezes (anotação 2).** A origem é o próprio prompt: o exemplo "com o colete por baixo o
  vestido assenta **lisinho**" e o fato "lisinho e fininho". O modelo copia o exemplo. Proposta: tirar a
  palavra do exemplo, dar 3–4 formas de falar do caimento e a regra "o mesmo adjetivo uma vez por conversa".
- **Persuasão (anotação 3).** Concordo com a direção. A frase do operador ganha por quatro coisas pequenas:
  "**nosso** colete" (posse), "cai **melhor**" (benefício, não jargão), "suas **peças favoritas**" (amplia de
  uma blusa para o guarda-roupa), "se sentindo **linda** novamente" (o resultado emocional dela). O prompt
  hoje briga com isso: manda evitar "fique linda" e preferir cena concreta. "Linda" sobre ela não é opinião
  sobre a roupa (essa regra fica). Proposta: a frase dele vira exemplo no prompt, e a regra do adjetivo
  muda para "a cena concreta e o sentimento dela, nunca opinião sobre a roupa".
- **Reversão de risco na dúvida de qualidade (anotação 5).** Certo, e o caso era exatamente o que o prompt
  pede ("use quando ela hesitar") — ela disse "já comprei uma e era bem ruinzinha", e a Malu não usou. Dois
  ajustes no texto proposto: (a) "frete grátis" não pode ir nesse balão — o gate `shipping_promise` só
  aceita o frete grátis na frase própria do pagamento na entrega, e antes do CEP ela pode não ter a entrega;
  (b) "7 dias de garantia" é dito como "7 dias pra devolver se não gostar", que é o que existe (garantia
  sugere defeito). Texto que passa: *"E o melhor, dependendo da sua região você só paga quando o colete
  estiver na sua mão, e se não gostar tem 7 dias pra devolver sem custo nenhum, risco zero pra você"*.
  Limite de 3 balões: nessa resposta, tamanho + CEP vão juntos no 3º.
- **"…pra devolver se não gostar" (anotação 6).** Correto; muda na instrução do "não chega" e nas objeções.
- **Pergunta no fim (anotação 4, segunda metade).** A Fabiana recebeu a pergunta do tamanho no 1º balão e a
  explicação depois. Proposta: regra de prompt (não gate, como pedido): a pergunta vai no último balão
  quando a resposta tem explicação.
- **Antes do CEP, a entrega dita como certa.** A Fabiana ouviu "frete grátis, R$ 129,90 quando receber" e
  depois "na sua região não tem". Mesmo com a causa 1 consertada, isso vai acontecer com quem mora fora da
  cobertura. Proposta: antes do CEP, "na maioria das regiões" / "dependendo da sua região" na explicação da
  entrega.
- **"Toca sim" (Fabiana, campainha).** A Malu afirmou como o entregador age — fato que ela não tem. Baixo;
  anotar para o prompt ("chega no seu endereço" sim, detalhe do entregador não).

### 7. "Digitando…" na hora (anotação 12 e do sócio)

`whatsapp/index.ts` chama `readAndTyping` assim que a mensagem chega: marca como lida (dois tiques azuis) e
liga o "digitando…" no mesmo segundo. Os dois sócios leram isso como robô. Proposta: tirar o
`typing_indicator` (só `status: "read"`). Pergunta em aberto: marcar como lida na hora também denuncia; a
alternativa é marcar como lida só quando a resposta for sair. É uma linha em cada caso.

### O que funcionou (manter)

Rajada juntada (`joined` em todas), respostas em 10–35 s, uma pergunta por vez, gancho da roupa usado no
argumento, tamanho certo pela tabela, foto → site, nome e CPF na ordem, link pré-preenchido uma vez só
(elogio do sócio), áudio transcrito e respondido, custo baixo (R$ 0,05–0,08 por conversa).

## Anotações × achados

| # | Anotação | Veredito | Onde |
|---|---|---|---|
| L1 | ressalva só se perguntar | ✅ concordo | causa 6 |
| L2 | "lisinha" repetido | ✅ origem no exemplo do prompt | causa 6 |
| L3 | mais persuasiva | ✅ concordo, ajustando a regra que hoje a impede | causa 6 |
| L4 | "ok" + pergunta; pergunta no fim | ✅ resolvido por não responder ao "ok"; pergunta no fim por prompt | causas 3 e 6 |
| L5 | 2º balão de reversão de risco | ✅ sem "frete grátis" e com "pra devolver" | causa 6 |
| L6 | "…se não gostar" | ✅ | causa 6 |
| L7 | e-mail no antecipado | ✅ reabre o §66 com motivo novo | causa 5 |
| L8 | "Que bom" ao "ok" | ✅ mesma causa da L4 | causa 3 |
| L9 | sumiu depois do "paguei" | ✅ grave; e nenhum webhook de venda chegou | causa 2 |
| L10 | régua para no pagamento; checagem aos 10 min | ✅ com texto que não diz "conferi" até o webhook estar provado | causa 4 |
| L11 | consultou a entrega? | ✅ **não consultou certo**: CEP com hífen → 422 → "não tem" | causa 1 |
| L12 / sócio | "digitando" instantâneo | ✅ | causa 7 |
| sócio | pix na entrega confuso | ✅ consequência da causa 1 | causa 1 |
| sócio | link pré-preenchido e áudio | ✅ manter | — |
