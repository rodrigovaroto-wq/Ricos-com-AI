# Decisões tomadas — rodada 1

Respostas do operador em 2026-09-04, sobre a pauta de
[`02-decisoes-em-aberto.md`](02-decisoes-em-aberto.md), já cruzada com o
[modelo econômico](../00-contexto/06-modelo-economico.md).

**Estas decisões não se reabrem sem o operador.** Cada uma traz o que foi decidido, o que
isso implica no projeto e o que ficou pendente dentro dela.

---

## Premissas confirmadas

| # | Ponto | Decisão |
|---|---|---|
| D1 | `Físico na entrega` na Coinzz | **Ativo.** A recusa custa −R$ 14,98, não −R$ 54,98. A pendência mais cara da operação está resolvida |
| D2 | Desconto do pagamento antecipado | **10%** → R$ 116,90. `PREPAY_DISCOUNT` em `colet/src/lib/checkout.ts` :42–49 está em 5% e desligado — **diverge e precisa ser corrigido** quando o desconto for configurado |
| D3 | Definição de "venda" | **Pedido criado.** A meta de 10% é conversa → pedido criado; os 15% de recusa entram depois |
| D4 | Contribuição do antecipado | **R$ 76,24**, não os R$ 68,34 do estudo. A média com mix 70/30 sobe de R$ 56,62 para **R$ 58,99** |
| D5 | Frete no caminho antecipado | **Por conta da cliente.** Confirma os R$ 76,24 — e levanta a pergunta de quanto ela paga no total, ver [modelo](../00-contexto/06-modelo-economico.md) |

---

## Q1 — Onde o pedido nasce

**Decisão: dois caminhos, conforme a forma de pagamento.**

- **COD (padrão):** a cliente **não preenche checkout nenhum**. Ela manda os dados pelo
  WhatsApp e o agente finaliza o pedido.
- **Antecipado:** o agente preenche contato e endereço e envia um **link de checkout
  pré-preenchido** para ela concluir o pagamento — o link carrega só dados de contato e
  entrega, **nunca dados de pagamento**.

Confirmação do pedido pela API da Coinzz.

**Pendente:** o operador não tem certeza de que existe API de criação de pedido; sabe que
**dá para gerar checkout personalizado com dados pré-preenchidos**. Verificar a
documentação da Coinzz é a primeira tarefa técnica do projeto — ela decide se o caminho COD
é API ou automação.

**Por que importa:** é a decisão que mais mexe na conversão. No caminho COD não existe
salto de contexto — a cliente fecha sem sair da conversa.

## Q2 — Onde o sistema roda

**Decisão: VPS 24/7.**

O `CLAUDE.md` dizia "roda como app Node.js local". Foi atualizado: o processo vive numa VPS
ligada o tempo todo. **SQLite continua valendo** — a proibição do `CLAUDE.md` é serverless
com disco efêmero, e isso segue de pé.

**Por que:** 240 leads/dia chegando no ritmo do Instagram (noite e fim de semana) e sessão
de WhatsApp que precisa ficar viva. Máquina desligada é lead pago e perdido.

## Q3 — Transporte de WhatsApp

**Decisão: WAHA** (`devlikeapro/waha`).

Leva junto três coisas que já estão prontas nele: o app de **números brasileiros**
(resolve o nono dígito, sem o qual a mesma cliente vira dois leads), **retry e HMAC de
webhook**, e **quatro engines intercambiáveis** — se uma quebrar com mudança de protocolo,
troca-se configuração em vez de código.

## Q4 — Número de telefone

**Decisão: número novo**, a ser criado.

O número do site (`5511916616348`) continua como está, atendido por gente. Isola o risco:
banimento do número do agente não derruba o atendimento da landing page.

**Implicação operacional:** número novo tem teto de aquecimento. Não dá para ir de zero a
300 conversas/dia na primeira semana — o volume sobe junto com a verba, e o pacing precisa
respeitar isso desde o primeiro dia.

## Q5 — Escopo e ordem de entrega

**Decisão, nesta ordem:**

1. **Pré-venda** — atender quem chega do anúncio (função 1)
2. **Pós-pedido** — confirmação e acompanhamento até a entrega (função 3)
3. **Recuperação de carrinho** — abandono no checkout do site (função 2)
4. **Follow-up**

**Ambiguidade a resolver na hora de planejar a onda 1:** a régua de 3 toques da Q9 é para
quem **silencia no meio da conversa** — isso é intrínseco à pré-venda e não dá para
separar dela. Já "recuperação de carrinho" é o abandono no **checkout do site**, outro
gatilho e outra fonte de dado. São coisas diferentes com nomes parecidos.

**Justificativa econômica** (ver [modelo](../00-contexto/06-modelo-economico.md) §5): nos
volumes projetados, subir a conversão de 10% para 12,5% vale +R$ 354/dia, enquanto baixar
a recusa de 15% para 10% vale +R$ 82/dia. A pré-venda primeiro.

## Q6 — Botões ou texto livre

**Sem decisão. Fica em aberto, com o raciocínio do operador registrado:**

> Botão traz agilidade e praticidade, mas não computa as objeções que aparecem mais fácil
> em texto livre, e também não computa a identificação e conexão da cliente com a marca e
> com a vendedora.

É uma tensão real: o botão reduz atrito de digitação **e** apaga sinal. Cada objeção
digitada é informação que o agente usa para conduzir; um toque em "M" não diz nada sobre o
que ela está sentindo.

**A definir juntos.** Uma direção possível a discutir: texto livre por padrão, e botão só
nos pontos onde não há objeção a colher — confirmação final de endereço, escolha entre COD
e antecipado. Nunca no momento da dúvida sobre tamanho, que é onde a objeção mora.

## Q7 — Recomendação de tamanho

**Decisão: enviar a tabela de medidas para a cliente decidir.** Medir com fita é caminho
secundário — nem toda cliente vai ter disposição para isso. **Em caso de dúvida entre dois
tamanhos, o maior** (política já publicada no FAQ).

**Risco assumido, registrado:** tamanho auto-declarado erra mais que tamanho medido, e
erro de tamanho vira troca ou recusa na porta. A mitigação é a tabela ter a coluna de
manequim equivalente, que é a referência que a cliente já conhece, e a regra do maior
puxar para o lado seguro.

Ver [`../01-conhecimento/02-tabela-de-medidas.md`](../01-conhecimento/02-tabela-de-medidas.md).

## Q8 — Pagamento antecipado na conversa

**Decisão: sim.** O agente fecha em COD — que é a promessa que derruba o medo de golpe — e
oferece o antecipado com desconto **antes de a cliente finalizar a compra**, como economia,
nunca como condição.

**E vale mais do que parecia — para nós.** Com a contribuição corrigida, o antecipado rende
R$ 76,24 contra R$ 51,60 do COD já descontada a recusa: **R$ 24,64 a mais por pedido**,
mesmo dando 10% de desconto, e sem exposição aos 15% de recusa.

**A ressalva, que é do lado dela.** No antecipado o frete fica por conta da cliente. Se
R$ 116,90 mais frete passar de R$ 129,90, o desconto não é desconto para ela — e a agente
**não pode chamar de economia algo que sai mais caro**. Pendência nº 9 abaixo: precisa ser
respondida antes de a oferta entrar no ar.

**E o caso que precisa de cuidado especial:** quando o **COD não estiver disponível para a
região dela**, o agente oferece o antecipado com **a maior segurança possível** — é o
momento em que a oferta perde justamente o argumento que dissolve o medo, e a cliente
precisa de mais prova, não de menos.

Ver [`../02-especificacao/01-mapa-funcional.md`](../02-especificacao/01-mapa-funcional.md) §D3.

## Q9 — Régua de follow-up de quem não respondeu

**Decisão: três toques, com desconto no terceiro.**

| Toque | Quando | O quê |
|---|---|---|
| 1 | 30 min de silêncio | Retomada curta, do ponto exato onde parou |
| 2 | Manhã do dia seguinte | Ângulo diferente — não repetir a frase do toque 1 |
| 3 | 3 dias depois | **Cupom: 15% de desconto no COD, e mais 5% se pagar antecipado.** Último toque, com saída digna |

O cupom será criado pelo operador na Coinzz.

**Guardrail obrigatório:** o agente **não pode mencionar o cupom antes de o código existir
e estar configurado**. É exatamente o erro do PIX imediato contra a promessa de COD, na
mesma operação, com outro nome.

**Impacto econômico do toque 3** (nossa conta, não do estudo): com 15% de desconto, o preço
COD cai para R$ 110,42 e a contribuição do COD entregue cai de R$ 63,35 para ~R$ 45,23 —
uma queda de ~29%. Ainda assim é ganho: são leads que já custaram R$ 1,25 e que valeriam
zero. **A trava é não deixar o desconto vazar para quem compraria a preço cheio** — ele
existe só no toque 3, só para quem silenciou, e nunca para quem já disse sim.

## Q10 — Identidade da agente

**Decisão do operador: a agente se apresenta como vendedora da Encorpa**, com nome próprio,
sem se anunciar como IA. O objetivo declarado é qualidade de conversa alta o suficiente
para que a diferença não apareça.

**O que isso significa em projeto:** persona com nome, tom caloroso, ritmo humano, bolhas
curtas, "digitando", memória do que a cliente já disse. Nada disso é problema — é o que
faz a conversa converter.

**Regra final, refinada pelo operador em 2026-09-04 — três linhas, nesta ordem:**

1. **Não afirma ser humana.** Nunca.
2. **Não anuncia que não é.** Não abre conversa se apresentando como IA, não emenda aviso
   no rodapé, não levanta o assunto por conta própria.
3. **Se for perguntada, responde.** Direta e sem drama, e segue a conversa.

É a regra do "não mente, não anuncia". Ela resolve o conflito que estava aberto: a agente
soa como a vendedora que é para a cliente — com nome, tom e ritmo de gente — e a verdade
fica disponível para quem for atrás dela, que é justamente quem se importa.

O handoff humano continua existindo para quem quiser falar com uma pessoa.

**Conflito ainda aberto:** a landing page promete, em `Objection.tsx` :13, *"WhatsApp com
gente de verdade. **Não é robô.**"* Essa frase fica falsa com a agente atendendo. Mexer
nela é decisão de site, não de agente, e continua pendente.

## Q11 — Custo de IA

**Decisão: teto de R$ 0,80 por conversa**, com as três camadas propostas:

1. Caminho barato primeiro — opt-out, pedido de humano e saudação por regra determinística,
   sem chamar modelo
2. Modelo barato para classificar e extrair; modelo bom só para redigir
3. Prefixo de prompt estável e cacheável — identidade, oferta e objeções num bloco que não
   muda entre mensagens

**Ao estourar o teto: vira handoff humano**, não degrada em silêncio nem segue gastando.

## Q12 — Handoff humano

**Decisão: (a) + (b).** A agente **para de responder e notifica**; o operador assume.

**Disponibilidade declarada:** ativo o dia todo, **exceto de madrugada**.

**Pendente:** a faixa exata da madrugada. Sugestão a confirmar: **00h–07h**. Dentro dela a
agente não promete atendimento humano imediato — ela acolhe e diz honestamente que a
pessoa responde de manhã. Prometer alguém que não vem é a mesma família de erro do PIX.

## Q13 — Cobrança de quem não pagou

**Decisão: registrar a pendência, não resolver agora.** Continua sem regra definida —
quantas tentativas, em que tom, e até quando antes de virar prejuízo aceito. Fica fora das
quatro ondas de entrega.

## Q14 — Regiões sem cobertura

**Resolvido fora do nosso escopo:** Coinzz/Logzz **impedem a criação de pedido COD para
região não coberta**. Não precisamos construir lista de exclusão geográfica.

**O que sobra para o agente:** tratar a recusa da plataforma como um caminho de conversa,
não como erro. Quando o COD não estiver disponível para o CEP dela, é o gatilho do fluxo de
antecipado com reforço de segurança da Q8.

---

---

# Decisões tomadas — rodada 2

Respostas do operador em 2026-09-05.

## R2.1 — Frete do antecipado: fica com a cliente, e o desconto sobe para 15%

**Decisão:** o frete continua por conta da cliente. O desconto do pagamento antecipado sobe
de 10% para **15%** — preço do produto a **R$ 110,42**.

**Razão:** o frete no caminho antecipado é muito variável, podendo passar de R$ 30, R$ 40 e
até R$ 50 conforme a região. Embutir isso no preço obrigaria a precificar pelo pior caso.

**O que a agente pode dizer, decidido pelo operador:**

> Ela **pode** afirmar que a cliente tem X% de desconto no pagamento antecipado e que
> economiza R$ Y **na compra do produto**. A economia é real e é sobre o produto, que é o
> que a Encorpa vende. O frete é outra questão, variável e fora do controle do operador.

**Requisito que acompanha essa permissão:** a agente diz, **na mesma mensagem**, que no
caminho antecipado o frete é calculado à parte no checkout. Não é ressalva moral — é
proteção de conversão: numa audiência cuja objeção nº 1 é golpe, surpresa no checkout traz
o medo de volta e derruba o pedido que a conversa já tinha ganho.

**Números atualizados:**

| | Com 10% (rodada 1) | **Com 15% (vigente)** |
|---|---|---|
| Preço do produto | R$ 116,90 | **R$ 110,42** |
| Economia declarável | R$ 13,00 | **R$ 19,48** |
| Contribuição do antecipado | R$ 76,24 | **R$ 70,21** |
| Média com mix 70/30 | R$ 58,99 | **R$ 57,18** |
| Equilíbrio (CPL R$ 1,25) | 3,47% | **3,58%** |

Cenários com R$ 57,18: otimista **R$ 2.033/dia**, base **R$ 1.223/dia**, pessimista
**R$ 684/dia** (R$ 60.997, R$ 36.705 e R$ 20.510 em 30 dias).

Mesmo com 15% de desconto, o antecipado rende R$ 70,21 contra R$ 51,60 do COD já descontada
a recusa — **R$ 18,61 a mais por pedido**, e sem exposição aos 15% de recusa.

## R2.2 — Teto de frete: existe mecanismo, precisa de confirmação no painel

**Pesquisa feita em 2026-09-05, a pedido do operador.**

**[FATO — DOC, fonte secundária]** A Logzz tem uma opção chamada **Frete Personalizado**:

> "Se deseja realizar envios apenas com valor fixo de frete definidos por você na criação do
> produto, você deve habilitar a opção de Frete Personalizado. Essa opção de frete
> funcionará com um preço fixo ou você pode utilizar essa opção se desejar oferecer frete
> grátis."

É exatamente o mecanismo de teto pedido: o produtor fixa o valor que a cliente vê, em vez de
repassar a cotação por região.

**Ressalva de evidência, importante:** essa citação veio de resumo de busca, **não** de
leitura direta da página. A central de ajuda da Logzz responde 404 ou redireciona, e o
checkout da Coinzz responde 403 a leitura automatizada. **Precisa ser confirmado no painel
do operador antes de virar decisão.**

**[INFERÊNCIA, não documentada]** Quem paga a diferença entre o valor fixo cobrado e o custo
real da entrega é o produtor — sai do saldo dele. Não achei documentação pública dizendo
isso com todas as letras.

**O número que decide o teto:** o antecipado rende R$ 70,21 e o COD médio rende R$ 51,60.
Logo, **podemos absorver até R$ 18,61 por pedido** antes de o antecipado ficar pior que o
COD. Isso dá a régua:

| Teto para a cliente | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorvemos R$ 5 → contrib. R$ 65,21 ✅ | absorvemos R$ 20 → R$ 50,21 ⚠️ | absorvemos R$ 30 → R$ 40,21 ❌ |
| R$ 15 | absorvemos R$ 10 → R$ 60,21 ✅ | absorvemos R$ 25 → R$ 45,21 ❌ | absorvemos R$ 35 → R$ 35,21 ❌ |

**Recomendação:** se o Frete Personalizado existir mesmo, começar com teto de **R$ 20** e
medir. R$ 15 só se a distribuição de custo real ficar concentrada abaixo de R$ 30.

**Anotação de divergência:** o operador fala em frete de R$ 30 a R$ 50; a Logzz declara
publicamente que o custo total por remessa "raramente passa de R$ 25". Pode ser diferença
entre o que é cobrado da cliente e o que custa para nós, ou regiões específicas. Vale medir
antes de fixar o teto.

## R2.3 — Identidade: a resposta é "assistente vendedora oficial da Encorpa"

**Decisão, adaptando a regra da rodada 1:** quando perguntada, a agente responde que é a
**assistente vendedora oficial da Encorpa**, e que está ali para ajudar, tirar todas as
dúvidas e guiar no processo de compra.

A regra completa fica assim:

1. **Não afirma ser humana.** Nunca.
2. **Não anuncia que não é.** Não abre conversa com disclosure nem levanta o assunto.
3. **Se for perguntada, responde:** *"Sou a assistente vendedora oficial da Encorpa — estou
   aqui para tirar suas dúvidas e te ajudar com o pedido."* Direta, sem drama, e segue a
   conversa.

É uma resposta honesta e comercialmente boa: não nega, não se desculpa, e reposiciona na
utilidade.

## R2.4 — Sem botões automáticos

**Decisão: texto livre, sempre.** Nada de botões ou listas.

**Razão do operador:** botão entrega que é uma IA conversando, e tira a intimidade e a
pessoalidade da conversa.

Isso encerra a pendência da rodada 1 (Q6) e **remove `send_options` do conjunto de tools**
previsto em [`../02-especificacao/02-tools-do-agente.md`](../02-especificacao/02-tools-do-agente.md).

**Consequência assumida:** tamanho, endereço e confirmação passam a ser coletados em texto
livre, o que exige extração estruturada boa e confirmação repetindo de volta. O ganho é o
que a rodada 1 já tinha registrado como custo do botão: cada objeção digitada é sinal que a
agente usa para conduzir.

## R2.5 — Horário de operação: 06:00 às 00:00

**Decisão:** a agente opera das **06:00 à meia-noite**.

**Razão do operador:** responder de madrugada entrega que é uma IA — ninguém trabalha nesse
horário.

Isso substitui a pendência da rodada 1 sobre a faixa da madrugada, e vira o gate de janela
de atendimento na cadeia de verificações.

## R2.6 — Ritmo de resposta

**Decisão, três regras:**

| Regra | Valor |
|---|---|
| Atraso da **primeira** resposta da conversa | **15 segundos** |
| Atraso das demais | **0,2 segundo por palavra da mensagem** |
| Indicador de "digitando" | **visível enquanto a agente prepara a resposta** |

**Razão:** resposta instantânea entrega que é uma IA.

**Nota técnica que a implementação precisa respeitar** (evidência: Evolution API,
`whatsapp.baileys.service.ts` :2306–2330): a presença de "digitando" **expira em cerca de 20
segundos** no WhatsApp. Qualquer espera acima disso precisa reenviar a presença em blocos —
`presenceSubscribe → composing → espera → paused`, em laço. A 0,2 s por palavra, uma
mensagem de 100 palavras já chega no limite.

## R2.7 — Cupom do follow-up: 20%

**Decisão:** o operador vai criar um cupom de **20% de desconto** para o terceiro toque do
follow-up. Isso substitui a formulação da rodada 1 (15% no COD e 20% no antecipado).

O guardrail continua valendo: **a agente não pode mencionar o cupom antes de o código existir
na Coinzz**, e o desconto **não vaza** para quem compraria a preço cheio.

## R2.8 — A função de cobrança de inadimplente deixa de existir

**Decisão:** não há mais o que cobrar. O risco de inadimplência existia no modelo
**pós-pago** (entrega primeiro, cobra depois). Com o `Físico na entrega` ativo, o entregador
cobra na porta: ou ela paga e recebe, ou recusa e não recebe. **Não existe estado de
"entregue e não pago".**

**Consequência:** as quatro funções do agente viram **três**:

1. Atender quem chega com dúvida antes de comprar
2. Recuperar carrinho abandonado
3. Confirmar o pedido depois da compra e acompanhar até a entrega

## R2.9 — Criação de pedido: o operador informa que a Coinzz tem webhook

**Registrado, com uma ressalva técnica que precisa ser resolvida antes de virar plano:**

Webhook e API são coisas diferentes. Um **webhook** é a Coinzz **avisando a gente** quando
algo acontece — pedido criado, pagamento confirmado, status mudou. Ele resolve a etapa E3
(status do pedido) e o gatilho de entrada do pós-venda, que já estavam mapeados.

O que a decisão da rodada 1 exige é o caminho inverso: **a gente criar o pedido na Coinzz**.
Isso precisa de um endpoint que possamos chamar. Se a Coinzz oferecer só webhooks de saída,
o caminho COD "a agente finaliza o pedido" não tem mecanismo.

**Alternativa que preserva a decisão sem depender de API** — a mesma que já existe para o
antecipado: a agente monta o **checkout pré-preenchido com todos os dados e a forma COD já
selecionada**, e a cliente só confirma. Ela não preenche nada nem informa pagamento; dá um
toque. Perde-se menos conversão do que parece, e não depende de API nenhuma.

**Pendente:** confirmar na documentação da Coinzz se existe endpoint de criação de pedido.

---

# Decisões tomadas — rodada 3

Respostas do operador em 2026-09-05.

## R3.1 — Criação de pedido: confirmado, webhook apenas, checkout personalizado

**Decisão mantida e reforçada:** a agente não cria pedido por API. Para os dois caminhos, o
mecanismo é o mesmo — **checkout personalizado da Coinzz, pré-preenchido com os dados da
cliente**, com o link enviado para ela confirmar.

**Razão do operador — e ela é melhor do que a alternativa que eu tinha em mente:** confirmar
no checkout é **mais seguro**, não um substituto inferior à API. No COD, a cliente vê o
resumo do pedido antes de confirmar, o que reduz erro de tamanho/endereço e dá a ela a
sensação de controle que uma audiência desconfiada de golpe precisa. No antecipado, o
argumento é ainda mais forte: **ela nunca envia dado de pagamento pelo chat** — só confirma
no ambiente seguro da Coinzz. Isso fecha uma exposição que eu não tinha nomeado antes:
cartão ou chave PIX trafegando em texto de WhatsApp é o tipo de coisa que uma auditoria de
segurança reprovaria de cara, e a decisão evita o problema por completo.

**Como isso muda o mapa funcional (E1):** o fluxo deixa de ser "a agente cria o pedido" e
passa a ser "a agente monta o checkout pré-preenchido e envia o link; a cliente confirma".
`create_order` como tool desaparece; entra `build_prefilled_checkout_link`.

**O que falta:** confirmar que a Coinzz oferece checkout personalizado programável (não só
manual pelo painel) — ou seja, que dá para gerar o link com nome, telefone, endereço e
tamanho já preenchidos via chamada automatizada, e não só copiando e colando à mão. Isso é
diferente de "ter API de pedido": é ter API de **checkout pré-preenchido**. Ver pendência
nº 1 revisada abaixo.

## R3.2 — Cupom de 20%: vale nos dois caminhos, com um argumento sazonal como capa

**Decisão:** o cupom de 20% do terceiro toque vale tanto para COD quanto para antecipado.

**Refinamento pedido pelo operador:** em vez de apresentar o cupom como "prêmio por ter
sumido três dias" (que é o que ele é, mecanicamente), a agente o encaixa num motivo externo
— **semana do consumidor, data comemorativa, ou "condição especial por tempo limitado"** —
sempre que uma dessas datas existir perto do envio. **Se não houver nenhuma no calendário no
momento, mantém a formulação anterior (retomada de follow-up) e aceita o risco descrito na
rodada 2** (quem espera ganha mais que quem paga na hora).

**Consequência de projeto:** a régua de follow-up passa a consultar um calendário de datas
comerciais antes de escolher o texto do terceiro toque. Isso é conteúdo, não código — uma
lista mantida pelo operador, não uma integração com feriados.

## R3.3 — O desconto de 15% vs. frete grátis: fica registrado como lacuna conjunta

**Decisão:** não decidir agora. O operador quer analisar junto se é melhor **manter os 15%
de desconto** ou **oferecer frete grátis até um teto** no caminho antecipado — e, se
qualquer coisa mudar, vale **tanto no site quanto no WhatsApp**.

Isso confirma o que já estava registrado (R2.3, pendência nº 6) e adiciona a
opção de comparar desconto-no-preço vs. frete-grátis-com-teto como **estratégias
concorrentes**, não complementares — dar as duas ao mesmo tempo dobra o subsídio sem dobrar
a conversão.

## R3.4 — Mídia 24/7, atendimento 06:00–00:00: mantido, sem mudança

Confirma R2.5. A lacuna R2's pendência sobre "o que fazer com quem chega às 02:00" **segue
sem resposta explícita** — o operador confirmou o horário do agente, não o que acontece com
o lead da madrugada. Ver pendência revisada abaixo.

## R3.5 — Identidade: mantém "não mente, não anuncia"; ganha um ativo novo

**O operador não pediu mudança de comportamento.** O ponto conceitual que ele levanta — que
a agente não é "um robô" no sentido de script fixo sem autonomia, e sim um sistema de
linguagem generativa com decisão adaptativa — está registrado em
[`../02-especificacao/04-guardrails.md`](../02-especificacao/04-guardrails.md) §"Nota de
vocabulário". A regra das três linhas não muda.

**O que muda de fato no projeto — e isso é uma peça nova, não uma reafirmação:**

> **O agente vai enviar áudios gravados por pessoas reais.**

Isso não estava em nenhuma decisão anterior e muda o desenho da função de envio de
mensagem. Hoje o mapa fala só de texto (B5/B6/B7). Um áudio gravado por humano, tocado pelo
agente, é uma peça de mídia pré-gravada, não um TTS gerado na hora — o que tem implicações
de guardrail que texto não tem:

- **Não pode ser gerado dinamicamente por variável.** Se o áudio é gravação fixa, ele não
  pode dizer "Bruna, seu pedido de R$ 129,90..." com valores que mudam — precisa ser
  genérico o bastante para servir a qualquer conversa, ou existir em poucas variantes
  pré-gravadas por situação (confirmação, véspera de entrega, boas-vindas).
- **Precisa de biblioteca e critério de seleção.** Qual áudio toca em qual momento da
  conversa é decisão do agente (ou do sistema de skills), mas o conteúdo do áudio em si é
  imutável — o mesmo padrão de "conteúdo versionado, seleção determinística" que já vale
  para os templates de re-entrada (rodada 1, referência DeskcommCRM `reentry-template.ts`).
- **Reforça a identidade sem contradizer o guardrail.** Uma voz humana real não é uma
  mentira sobre ser humano — é uma característica de qualidade de atendimento, do mesmo
  jeito que um nome próprio e um tom caloroso já eram. Mas grava-la como se fosse a agente
  falando ao vivo, numa situação em que fica claro que é play de arquivo (ex.: a voz não
  responde ao que a cliente acabou de perguntar), teria o efeito oposto do pretendido.

**Isso entra como pendência de especificação, não decisão fechada:** quais mensagens do
funil recebem áudio, quantas variantes por mensagem, e quem grava. Ver pendência nova
abaixo.

**A landing page não muda.** Ver [`../02-especificacao/04-guardrails.md`](../02-especificacao/04-guardrails.md) §"A copy da landing page".

## O que ficou pendente

| # | Pendência | Quem resolve |
|---|---|---|
| 1 | **A Coinzz permite gerar checkout personalizado pré-preenchido via chamada automatizada** (não só manual pelo painel)? Isso é diferente de "API de pedido" — ver R3.1 | Verificação técnica — primeira tarefa |
| 2 | Confirmar o **Frete Personalizado** da Logzz no painel — mas a decisão de usá-lo depende da R3.3 (desconto vs. frete grátis) primeiro | Operador |
| 3 | **Desconto de 15% vs. frete grátis com teto no antecipado** — decidir juntos, e replicar a escolha no site e no WhatsApp (R3.3) | Operador + sessão |
| 4 | Calendário de datas comerciais para o argumento do cupom de 20% (semana do consumidor etc.) — lista a manter | Operador |
| 5 | Copy do site *"Não é robô"* — **não será alterada.** Mantido como está, por decisão do operador (R3.5) | ✅ resolvida (sem mudança) |
| 6 | Leads que chegam entre 00:00 e 06:00: mídia continua rodando, mas ainda não está definido se a agente responde ao acordar às 06:00 ou se a conversa é tratada como perdida | Operador |
| 7 | Medir o custo real de frete por região antes de fixar qualquer teto | Operador |
| 8 | **Nova: biblioteca de áudios gravados por pessoas reais** — quais mensagens do funil recebem áudio, quantas variantes por mensagem, quem grava, e como o sistema escolhe qual tocar (R3.5) | Operador + sessão |

**Resolvidas na rodada 3:** mecanismo de criação de pedido (webhook + checkout
personalizado, sem API de pedido) · cupom vale nos dois caminhos · identidade mantida sem
mudança de comportamento.
