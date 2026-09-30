# Decisões tomadas — rodada 1

Respostas do operador em 2026-09-04, sobre a pauta de
[`02-decisoes-em-aberto.md`](02-decisoes-em-aberto.md), já cruzada com o
[modelo econômico](../contexto-negocio/06-modelo-economico.md).

**Estas decisões não se reabrem sem o operador.** Cada uma traz o que foi decidido, o que
isso implica no projeto e o que ficou pendente dentro dela.

---

## Premissas confirmadas

| # | Ponto | Decisão |
|---|---|---|
| D1 | `Físico na entrega` na Coinzz | **Ativo.** A recusa custa −R$ 9,99 (corrigido em 2026-09-21, §R10.2; era −R$ 14,98), não −R$ 54,98. A pendência mais cara da operação está resolvida |
| D2 | Desconto do pagamento antecipado | **10%** → R$ 116,90. `PREPAY_DISCOUNT` em `colet/src/lib/checkout.ts` :42–49 está em 5% e desligado — **diverge e precisa ser corrigido** quando o desconto for configurado |
| D3 | Definição de "venda" | **Pedido criado.** A meta de 10% é conversa → pedido criado; os 15% de recusa entram depois |
| D4 | Contribuição do antecipado | **R$ 76,24**, não os R$ 68,34 do estudo. A média com mix 70/30 sobe de R$ 56,62 para **R$ 58,99** |
| D5 | Frete no caminho antecipado | **Por conta da cliente.** Confirma os R$ 76,24 — e levanta a pergunta de quanto ela paga no total, ver [modelo](../contexto-negocio/06-modelo-economico.md) |

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

**Justificativa econômica** (ver [modelo](../contexto-negocio/06-modelo-economico.md) §5): nos
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

Ver [`../../agente-ia/01-conhecimento/02-tabela-de-medidas.md`](../../agente-ia/01-conhecimento/02-tabela-de-medidas.md).

## Q8 — Pagamento antecipado na conversa

**Decisão: sim.** O agente fecha em COD — que é a promessa que derruba o medo de golpe — e
oferece o antecipado com desconto **antes de a cliente finalizar a compra**, como economia,
nunca como condição.

**E vale mais do que parecia — para nós.** Com a contribuição corrigida, o antecipado rende
R$ 76,24 contra R$ 51,60 do COD já descontada a recusa: **R$ 24,64 a mais por pedido**,
mesmo dando 10% de desconto, e sem exposição aos 15% de recusa.

> ⚠️ **Este argumento econômico foi revertido em 2026-09-21 — ver §R10.3/§R10.5.** O
> antecipado passou a render *menos*, não mais, que o COD (com o desconto de 15%
> vigente na época). **No mesmo dia, o operador baixou o desconto para 10%**, o que
> recupera quase toda a diferença — ver a correção mais recente em §R10.5. A decisão em
> si (oferecer o antecipado com desconto antes do fechamento) **não foi reaberta**.

**A ressalva, que é do lado dela.** No antecipado o frete fica por conta da cliente. Se
R$ 116,90 mais frete passar de R$ 129,90, o desconto não é desconto para ela — e a agente
**não pode chamar de economia algo que sai mais caro**. Pendência nº 9 abaixo: precisa ser
respondida antes de a oferta entrar no ar.

**E o caso que precisa de cuidado especial:** quando o **COD não estiver disponível para a
região dela**, o agente oferece o antecipado com **a maior segurança possível** — é o
momento em que a oferta perde justamente o argumento que dissolve o medo, e a cliente
precisa de mais prova, não de menos.

Ver [`../../agente-ia/02-especificacao/01-mapa-funcional.md`](../../agente-ia/02-especificacao/01-mapa-funcional.md) §D3.

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

> ### ⚠️ Correção de 2026-09-08 — o preço antecipado é R$ 110,41
>
> A oferta foi lida direto no painel da Coinzz (`offkw47x`, id 69452) e ela cobra
> **R$ 110,41**, não R$ 110,42. Os 15% sobre R$ 129,90 dão 110,415, e a Coinzz
> truncou para baixo — nós arredondávamos para cima. A economia declarável é
> **R$ 19,49**.
>
> O centavo importa por um motivo que não é o centavo: o guardrail de preço da
> agente só admite os valores configurados, então com 110,42 gravado ela seria
> **vetada ao dizer o preço real do checkout**. Números corrigidos no código, no
> site e nesta pasta; os valores antigos abaixo ficam onde estão, porque as
> contas de rodada foram feitas com eles.

> ### ⚠️ Correção de 2026-09-21 — a contribuição do antecipado abaixo está superada
>
> Ver §R10.3. O antecipado paga as mesmas taxas do COD (inclusive handling e entrega) —
> só não paga a taxa de entrega frustrada. Contribuição recalculada com 15% de desconto:
> R$ 45,22, não R$ 70,21.
>
> **No mesmo dia, o operador baixou o desconto de 15% para 10%** — ver §R10.5. Com 10%,
> preço R$ 116,91 e contribuição **R$ 51,27**. Os números desta seção ficam como registro
> histórico da conta daquela época (rodada 2, desconto de 15%).

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

**Números atualizados (histórico — ver correção de 2026-09-21 acima):**

| | Com 10% (rodada 1) | Com 15% (vigente à época) |
|---|---|---|
| Preço do produto | R$ 116,90 | R$ 110,42 |
| Economia declarável | R$ 13,00 | R$ 19,48 |
| Contribuição do antecipado | R$ 76,24 | R$ 70,21 |
| Média com mix 70/30 | R$ 58,99 | R$ 57,18 |
| Equilíbrio (CPL R$ 1,25) | 3,47% | 3,58% |

Cenários com R$ 57,18 (histórico): otimista R$ 2.033/dia, base R$ 1.223/dia, pessimista
R$ 684/dia (R$ 60.997, R$ 36.705 e R$ 20.510 em 30 dias).

Mesmo com 15% de desconto, o antecipado rendia (nesta conta, superada) R$ 70,21 contra
R$ 51,60 do COD já descontada a recusa — R$ 18,61 a mais por pedido, e sem exposição aos
15% de recusa.

## R2.2 — Teto de frete: existe mecanismo, precisa de confirmação no painel

**Pesquisa feita em 2026-09-05, a pedido do operador.**

> ⚠️ **A lógica desta seção não se sustenta mais — ver §R10.3.** Ela partia da premissa de
> que o antecipado rendia mais que o COD e por isso havia headroom para subsidiar frete.
> Com a contribuição corrigida (R$ 45,22), não há headroom nenhum.

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

**O número que decidia o teto (histórico, superado):** o antecipado rendia R$ 70,21 e o COD
médio rendia R$ 51,60. Logo, absorvíamos até R$ 18,61 por pedido antes de o antecipado
ficar pior que o COD. Isso dava a régua:

| Teto para a cliente | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorvemos R$ 5 → contrib. R$ 65,21 ✅ | absorvemos R$ 20 → R$ 50,21 ⚠️ | absorvemos R$ 30 → R$ 40,21 ❌ |
| R$ 15 | absorvemos R$ 10 → R$ 60,21 ✅ | absorvemos R$ 25 → R$ 45,21 ❌ | absorvemos R$ 35 → R$ 35,21 ❌ |

**Recomendação (histórica, superada):** se o Frete Personalizado existir mesmo, começar com
teto de R$ 20 e medir.

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
previsto em [`../../agente-ia/02-especificacao/02-tools-do-agente.md`](../../agente-ia/02-especificacao/02-tools-do-agente.md).

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
[`../../agente-ia/02-especificacao/04-guardrails.md`](../../agente-ia/02-especificacao/04-guardrails.md) §"Nota de
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

**Escopo inicial, decidido em 2026-09-05:** o operador já tem em mãos áudios gravados para
**boas-vindas** e **explicação inicial do produto** — os dois primeiros momentos da
conversa, antes de qualquer coleta de dado. Ampliar para outros pontos do funil (confirmação
de pedido, véspera de entrega, pós-venda) fica para uma sessão futura, fora do escopo desta
rodada.

**A landing page não muda.** Ver [`../../agente-ia/02-especificacao/04-guardrails.md`](../../agente-ia/02-especificacao/04-guardrails.md) §"A copy da landing page".

---

# Decisões tomadas — rodada 4

Respostas do operador em 2026-09-05/06.

## R4.1 — Coinzz tem API E webhook: pendência mais crítica do projeto, resolvida

**Confirmado pelo operador, verificado no próprio painel:** a Coinzz tem **integração via
API**, além do webhook já sabido. Isso fecha a pendência nº 1 da rodada 3 — e fecha melhor
do que o cenário mínimo esperado.

**O que isso muda, e o que não muda:** a decisão de segurança da rodada 3 (R3.1) — **a
cliente nunca envia dado de pagamento pelo chat, sempre confirma num checkout** — continua
de pé, e continua sendo a decisão certa por aquele motivo. O que muda é *como* o link
pré-preenchido é gerado: em vez de depender de preenchimento manual ou de um formato de URL
adivinhado, a **API gera o checkout personalizado programaticamente**, com os dados da
cliente (nome, telefone, endereço, tamanho, modalidade de pagamento) já embutidos. O webhook
continua sendo o canal de status (pedido criado, pagamento confirmado) para o acompanhamento
pós-venda.

`build_prefilled_checkout_link` deixa de ser tool com implementação em aberto e passa a ter
mecanismo real e confirmado: **chamada à API da Coinzz para gerar o checkout → link
devolvido → agente envia → cliente confirma.**

## R4.2 — Frete Personalizado da Logzz: existe, mas não será usado

**Confirmado:** a opção "Frete Personalizado" existe na Logzz (2a confirmado).

**Mas a decisão final é não usá-la.** O operador levantou duas variantes de subsídio de
frete (10% ou 5% de desconto + frete grátis até R$20) e, ao comparar com dado real de custo
de frete por região, decidiu **manter os 15% de desconto sem programa de frete grátis**:
para as principais metrópoles o frete fica entre R$15 e R$35, e para regiões mais afastadas
passa de R$40 — faixas em que um teto de R$20 exigiria subsídio frequente e alto, tornando o
programa mais caro que simplesmente manter o desconto atual.

**Isto fecha as pendências nº 2, 3 e 6 da rodada 3 numa só resposta**, e mantém os números
da rodada 2 sem alteração (histórico, ver correção de 2026-09-21 em R2.1): produto a
R$ 110,42, economia declarável de R$ 19,48, contribuição do antecipado de R$ 70,21. Nada no
modelo econômico mudava, à época.

**Registro do caminho considerado e descartado:** frete grátis com teto (R$20, financiado
por baixar o desconto para 10% ou 5%) foi avaliado e rejeitado por dado real de custo de
frete regional, não por falta de mecanismo — a Logzz oferece a opção, o operador optou por
não usá-la agora. Fica arquivado, não como pendência.

## R4.3 — Cupom do follow-up: moldura "Super + dia da semana"

**Decisão:** o argumento do cupom de 20% no terceiro toque usa o formato **"Super
[dia da semana]"** — ex.: se o terceiro toque cai numa quinta-feira, a mensagem abre com
*"Super Quinta! Você ganhou um cupom de 20% de desconto no Colete Cinta Modeladora..."*.

Isso substitui a ideia de calendário de datas comerciais fixas (rodada 3, pendência nº 4) por
um formato **sempre disponível e determinístico**: qualquer dia da semana vira "Super
[dia]", sem depender de calendário externo, sem lacuna de "não há data próxima". Mais simples
de implementar — é uma função pura de `dia_da_semana → nome do texto`, sem tabela para
manter.

## R4.4 — Duas camadas na primeira resposta: mensagem automática instantânea + agente real depois

**Decisão, e ela reformula R2.6 (rodada 2):** a primeira resposta de qualquer conversa deixa
de ser "15 segundos de atraso" e passa a ter **duas camadas**.

**Camada 1 — mensagem automática, instantânea, 24 horas por dia, todo lead:**

> *"Oii, tudo bem? Recebemos sua mensagem, assim que possível uma de nossas atendentes fará
> seu atendimento, aproveite para entender melhor sobre nosso produto acessando nosso site:
> encorpa-fashion.com.br"*

Enviada **imediatamente**, **independente do horário** — inclusive de madrugada. É o texto
que "toda loja usa" (palavras do operador): não finge ser a agente conversando, não usa o
ritmo humano da camada 2, e sua função é só confirmar recebimento e reduzir ansiedade
enquanto a resposta de verdade não chega. Não contradiz o guardrail de identidade: a
mensagem fala em "atendentes", não afirma nem nega automação.

**Camada 2 — a resposta real da agente, com personalidade:**

| Situação | Quando chega |
|---|---|
| Dentro do horário de atendimento (06:00–00:00) | **3 minutos** depois da mensagem da cliente |
| Fora do horário (00:00–06:00) | **A partir das 06:00** |

O atraso de "3 minutos" **substitui os 15 segundos** definidos na rodada 2 para a primeira
resposta. O ritmo de 0,2 s por palavra para as respostas seguintes **continua valendo, sem
mudança** — a mudança é só na primeira.

**Por que isso resolve melhor a pendência nº 5 da rodada 3 (lead de madrugada) do que
qualquer uma das três opções que a sessão tinha proposto:** o lead da madrugada recebe
confirmação de recebimento na hora — não fica no escuro por 4 horas — mas a conversa de
verdade, com o ritmo cuidadosamente desenhado para não parecer automação, só começa quando
há gente de fato disponível (a partir das 06:00). É a opção (a) da pendência anterior, mas
com o texto e o timing exatos definidos pelo operador em vez de deixados em aberto.

**Consequência para o guardrail de janela de atendimento:** ele passa a valer só para a
camada 2. A camada 1 roda 24/7, sempre.

## O que ficou pendente

| # | Pendência original | Status |
|---|---|---|
| 1 | A Coinzz permite gerar checkout pré-preenchido via chamada automatizada? | ✅ **Resolvida (R4.1) — confirmado: API + webhook** |
| 2 | Confirmar o Frete Personalizado da Logzz no painel | ✅ **Resolvida (R4.2) — existe, decidido não usar** |
| 3 | Desconto de 15% vs. frete grátis com teto no antecipado | ✅ **Resolvida (R4.2) — mantém 15%, sem subsídio de frete** |
| 4 | Calendário de datas comerciais para o cupom de 20% | ✅ **Resolvida (R4.3) — moldura "Super + dia da semana", sem calendário a manter** |
| 5 | Copy do site *"Não é robô"* | ✅ Resolvida na rodada 3 — mantida sem alteração |
| 6 | Lead que chega entre 00:00 e 06:00 | ✅ **Resolvida (R4.4) — mensagem automática 24/7 + agente real às 06:00 ou 3 min depois** |
| 7 | Medir custo real de frete por região | ✅ **Resolvida (R4.2) — operador já tem o dado: R$15–35 em metrópoles, R$40+ em regiões afastadas** |
| 8 | Biblioteca de áudios | ✅ Resolvida — escopo inicial é boas-vindas + explicação do produto |

**Todas as 8 pendências abertas ao fim da rodada 3 estão resolvidas.** Não há pendência
bloqueante de decisão de negócio no momento. Restam apenas verificações técnicas de
implementação (formato exato da chamada de API da Coinzz, nome dos campos do checkout
pré-preenchido) — essas são trabalho de construção, não decisão a tomar.

---

# Decisões tomadas — rodada 5

> Rodada de infraestrutura. O operador fixou a pilha e duas restrições de execução; o
> resto desta rodada é consequência dessas escolhas, verificada contra a documentação de
> cada fornecedor (as verificações estão marcadas com a data em que foram feitas).

## R5.1 — Duas restrições que definem a ordem do trabalho

| Restrição | O que significa na prática |
|---|---|
| **Ainda não existe número de WhatsApp** | Nada que dependa do canal vivo pode ser feito agora — nem pareamento, nem teste com número real, nem aquecimento |
| **Gasto zero até esgotar o que é gratuito** | Só se contrata infraestrutura quando o que dá para construir de graça estiver construído e testado |

**Consequência de projeto, e é a decisão mais importante desta rodada:** o WhatsApp deixa
de ser pré-requisito da construção. O canal vira um **adapter** com contrato explícito, e a
construção roda contra um **canal simulado** que fala esse mesmo contrato — o mesmo formato
de webhook de entrada, o mesmo endpoint de envio. É o que já foi feito no site com as
personas do navegador: o teste não espera cliente real para existir.

Isso inverte a ordem original do plano, que abria com "provisionar VPS e parear o número".
A onda 0 antiga não pode nem começar hoje; a nova pode começar agora e vai até o ponto em
que só falta plugar o canal.

## R5.2 — Banco: Supabase (Postgres) no lugar do SQLite

Substitui o SQLite fixado no `CLAUDE.md`. O motivo original do SQLite era não depender de
serviço externo; o motivo original da VPS 24/7 era *"SQLite não vai para serverless com
disco efêmero"* (§Q2). Com Postgres gerenciado, **esse argumento deixa de valer para o
estado** — mas continua valendo para o canal: a sessão do WhatsApp exige processo vivo. Ou
seja, a VPS continua necessária, por outro motivo, e o banco deixa de ser a razão.

**Verificado em 2026-09-05, na documentação da Supabase:** plano gratuito tem 500 MB de
banco por projeto, **2 projetos ativos por organização**, e projeto ocioso é **pausado após
1 semana sem atividade**.

Duas consequências práticas:

1. A organização que o operador já tem (`Oria Data-Base`, plano free) **já está nos dois
   projetos**. O projeto do agente vai numa **organização nova**, também gratuita — não é
   contorno de regra, é como a Supabase organiza cota por organização.
2. Enquanto o agente não tiver tráfego, o projeto pausa sozinho em uma semana. Um cron
   barato de ping resolve, e ele já vai existir de qualquer forma para as varreduras.

## R5.3 — n8n: orquestração e integrações, não o cérebro do turno

O operador já tem uma instância de n8n em produção para outro produto. O agente entra nela,
separado por projeto/pasta e tags próprias.

**O que o n8n faz:** webhook de entrada do canal, gravação e enfileiramento, crons de
varredura (régua de silêncio, régua de pós-pedido, ping do banco), webhook de status da
Coinzz, notificação de handoff, disparo periódico do otimizador.

**O que o n8n não faz:** a cadeia de 11 guardrails, a máquina de estados, o teto de custo
por conversa e a montagem de contexto. Isso é código versionado, com teste automatizado,
chamado por HTTP.

**Por quê:** a regra que a própria pesquisa já registrou (`03-pesquisa/03-extracao-por-necessidade.md`
§N3, §N4) é que o que pode ser determinístico não deve custar chamada de modelo — e o
corolário é que o que precisa de teste automatizado não pode morar dentro de nós de um
editor visual. Guardrail que ninguém consegue testar em CI é guardrail que ninguém sabe se
funciona. Um fluxo de n8n é ótimo como cano e como relógio; é ruim como suíte de regras.

## R5.4 — Hospedagem: PikaPods, e só para o que exige processo vivo

**Verificado em 2026-09-05:** pods a partir de ~US$ 1/mês; n8n com recursos padrão fica em
~US$ 3,80/mês.

Roda em pod **o que precisa estar de pé 24/7**: o WAHA (sessão do WhatsApp) e o n8n, se o
operador decidir separar do que ele já usa. O cérebro do turno não precisa de pod próprio no
começo — ver R5.6.

## R5.5 — WAHA continua sendo o transporte, e agora é inteiramente gratuito

**Verificado em 2026-09-05, no site do WAHA:** o que era WAHA Plus foi incorporado ao Core a
partir da imagem `2026.6.1`; mídia, múltiplas sessões e os demais recursos pagos passaram a
ser gratuitos, sem limite de mensagens nem expiração de licença. Existe um apoio comunitário
opcional de US$ 5/mês, que não desbloqueia nada.

Isso remove um custo que o plano antigo assumia e, mais importante, remove o risco de a
transcrição de áudio (§B3 do mapa funcional) esbarrar em recurso pago — o público manda
áudio, e isso não é opcional.

## R5.6 — Onde o cérebro do turno roda

Código TypeScript versionado neste repositório, exposto por HTTP. Dois lugares possíveis, e
a escolha não precisa ser feita agora porque o contrato é o mesmo nos dois:

| Opção | A favor | Contra |
|---|---|---|
| **Supabase Edge Functions** (recomendada para começar) | Gratuita, sem servidor para manter, mora junto do banco | Deno, tempo de execução limitado por chamada |
| **Container Node no mesmo pod do WAHA** | Sem limite de execução, mesma linguagem do resto | Mais uma coisa para manter de pé |

Recomendação: começar em Edge Functions e migrar para o pod se o limite de execução
incomodar. A migração é troca de host, não reescrita, desde que o cérebro não dependa de
nada específico do ambiente.

## R5.7 — Hermes Agent: otimizador que propõe, nunca que publica

O operador escolheu o [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous
Research, open source) como o agente que lê as conversas e otimiza o sistema periodicamente.

**Guardrail de governança, decidido aqui:** o Hermes lê o banco e **abre proposta de
mudança** — pull request no repositório, ou linha numa tabela de experimentos com estado
`proposto`. Ele **não** escreve prompt, preço, cupom ou guardrail direto em produção.

O motivo é o mesmo que fez a cadeia de guardrails existir: um sistema que se reescreve
sozinho sem revisão pode "otimizar" prometendo o que a operação não cumpre — desconto que
não existe, prazo que a Logzz não pratica, garantia que ninguém honra. Otimização de
conversão sem revisão humana é exatamente o caminho para a promessa quebrada que este
projeto já decidiu não cometer.

## R5.8 — Provedor de modelo: continua em aberto, com um caminho de custo zero para o desenvolvimento

Segue sendo a pergunta 1 e 2 da seção 4 do plano. O que muda: com a restrição de gasto zero,
**o desenvolvimento não espera essa decisão**. Toda chamada de modelo passa por uma função
só (o *seam* de §H6), então o provedor é configuração, não arquitetura.

Para desenvolver sem gastar, a camada gratuita de algum provedor resolve — o operador já tem
conta Google/Gemini ligada ao n8n. A decisão de qual modelo redige a conversa em produção
fica para o momento do piloto, quando o custo por conversa vira número medido em vez de
estimativa.

---

# Decisões tomadas — rodada 6

> Respostas do operador às perguntas 15 a 20 do plano, mais o material de funil que ele
> entregou em 2026-09-06.

## R6.1 — WhatsApp fica para depois; notificação de handoff vai por e-mail

O operador confirmou que **não vamos usar WhatsApp nesta fase**. A notificação de handoff
(§Q12) sai por **Gmail** enquanto o canal não existir. Não muda a decisão de destino final —
muda só o transporte do alerta durante a fase A, e o destino é configuração.

## R6.2 — Hermes roda a cada 50 leads atendidos, não por calendário

Cadência **por volume, não por relógio**: a cada 50 leads registrados e atendidos. É a escolha
certa para quem ainda não tem tráfego constante — um cron semanal rodaria sobre 3 conversas na
primeira semana e sobre 300 na quinta, e as duas análises seriam inúteis por motivos opostos.

Continua valendo o guardrail de governança da §R5.7: o Hermes **propõe**, não publica.

## R6.3 — Retenção de dado pessoal: 90 dias

Telefone, nome, endereço e o que mais for coletado da cliente expiram em **90 dias**. Vale
para o banco inteiro, inclusive histórico de conversa que contenha endereço.

Consequência de construção: a expiração é **rotina automática**, não faxina manual — uma tarefa
agendada que apaga o que passou de 90 dias. Sem isso, "retenção de 90 dias" é intenção, não
política.

## R6.4 — Provedor de modelo: conta separada, e a escolha não é por preço

O operador decidiu usar uma **API em conta separada**, ainda a definir. A comparação de doze
modelos contra uma conversa real do funil está publicada como página à parte; o número que
decide está registrado aqui:

**A conversa inteira custa entre R$ 0,01 e R$ 0,45**, dependendo do modelo, contra uma margem
de R$ 63,35 por pedido. Mesmo o modelo mais caro da comparação consome **0,7% da margem** e
fica abaixo do teto de R$ 0,80 por conversa (§Q11). A diferença entre o mais caro e o mais
barato é de R$ 0,44 por conversa.

**Portanto: escolher a API pelo preço otimiza a variável errada.** Um ponto percentual de
conversão vale mais do que toda a economia possível na troca de modelo. O critério é qualidade
em português, confiabilidade de chamada de ferramenta, cache de prompt e latência.

Camada gratuita do Gemini cobre o desenvolvimento inteiro da fase A sem cartão.

## R6.5 — O script do funil recebido não é fonte sobre o produto

O operador entregou um script de WhatsApp de outra operação (preço R$ 119,90, entrega para o
dia seguinte, frete grátis, 12x, tamanhos M–3XL, medida com fita métrica). **Nada disso
descreve a operação da Encorpa**, e o próprio operador registrou que o material não deve ser
tratado como verdade sobre o produto.

O diagnóstico item a item está em
[`../../agente-ia/06-script/01-diagnostico-do-script-atual.md`](../../agente-ia/06-script/01-diagnostico-do-script-atual.md)
e o script reescrito em
[`../../agente-ia/06-script/02-script-do-agente.md`](../../agente-ia/06-script/02-script-do-agente.md).

**Três dos quatro áudios precisam ser regravados** — o roteiro dos novos está no script. O
áudio 2 (conforto e material) é aproveitável quase inteiro.

---

# Decisões tomadas — rodada 7

## R7.1 — Os três modelos, por papel

| Papel | Modelo | Por quê |
|---|---|---|
| Desenvolvimento e testes | **Gemini 3.5 Flash-Lite** | Camada gratuita cobre a fase A inteira |
| A conversa que converte | **gpt-5.6-luna** (OpenAI) | O turno que vende; R$ 0,048 por conversa com cache |
| Trabalho barato em produção | **Gemini 3.5 Flash-Lite** | Classificar intenção, extrair endereço, decidir estágio — 20 chamadas por conversa que não precisam de talento |

Preço fica em `src/llm/pricing.ts`, num lugar só. Trocar de modelo é editar uma linha da
tabela e uma variável de ambiente.

## R7.2 — Prazo de entrega: 3 a 5 dias no COD, sem número no antecipado

> **Superada por R9.3 em 2026-09-08.** Os dois números aqui estavam errados. Fica registrada
> porque o raciocínio de por que o antecipado não tinha prazo continua valendo — o que mudou
> é que o prazo existia e ninguém tinha ido olhar.

Correção do operador. **No COD são 3 a 5 dias, com agendamento.** No **antecipado o prazo
varia por região e frete**, então a agente não diz número nenhum ali — a transportadora
informa no checkout.

O guardrail de prazo passa a vetar os dois erros: prazo fora da janela no COD, e qualquer
janela em números no antecipado.

**Divergência resolvida em 2026-09-07.** O `FAQ.tsx` :22 e a página de obrigado do
`Encorpa-Website` diziam *"entre 7 e 14 dias"*; foram corrigidos para 3 a 5. O caminho
antecipado passou a ter um passo próprio na página de obrigado, sem número, pela mesma
razão que a agente não diz nenhum ali.

## R7.3 — Teto de custo: R$ 0,80 com 25% de folga

> ### ⚠️ Correção de 2026-09-21 — teto sobe para R$ 1,50
>
> O operador revisou o teto de custo por conversa: sobe de **R$ 0,80** para **R$ 1,50**,
> mantendo os mesmos 25% de folga antes do handoff — teto efetivo de **R$ 1,875**
> (era R$ 1,00). Segue desprezível contra a margem por pedido — ver R10.3 para a
> revisão em aberto desse número. Atualizar `conversationCapBrl` em
> `config/business.example.json` e `costCeilingBrl` no código.

Conversa que se estende pode passar em **25%** do teto antes de virar handoff — teto efetivo
de **R$ 1,00**. Continua desprezível contra a margem de R$ 63,35, e agora está no código
(`costCeilingBrl`), com teste que prova que a chamada é barrada **antes** de sair byte para o
provedor.

## R7.4 — Onde o guardrail roda: Supabase Edge Function, chamada por HTTP do n8n

O operador perguntou se dá para chamar por HTTP no n8n. Dá — e é assim que fica:

```
WAHA → webhook n8n → HTTP → Edge Function (cérebro + 11 guardrails) → Supabase
```

O n8n é o cano e o relógio; o turno inteiro — montagem de contexto, chamada de modelo, cadeia
de guardrails, teto de custo, trace — roda numa Edge Function versionada neste repositório.

**Por que Edge Function e não um nó de código no n8n:** os guardrails têm 49 testes rodando em
menos de um segundo, de graça, a cada mudança. Dentro do n8n, a única forma de testar é
disparar o fluxo e olhar. E ela mora junto do banco: as ~20 leituras por turno não atravessam
a internet.

## R7.5 — Contas separadas por projeto

n8n, APIs de modelo e PikaPods em contas próprias da operação Encorpa, sem misturar com os
outros projetos do operador. Já valendo: a organização **OFERTA ENCORPA** na Supabase, com o
projeto **Ricos com AI** (`hbmkgakzrqmdlsvszjeo`, região sa-east-1), e a instância nova do n8n,
ainda vazia.

## R7.6 — Todos os áudios serão regravados

A locutora dos áudios originais não está mais disponível. Some a questão de reaproveitar
trechos: os quatro roteiros novos estão no script, escritos para uma voz nova, e nenhum deles
carrega frase de outra operação.

## R7.7 — Provedores verificados em 2026-09-06, com uma armadilha registrada

As três credenciais foram testadas de verdade, não assumidas:

| Item | Resultado |
|---|---|
| Supabase `service_role` | 200 na REST API do projeto |
| `gpt-5.6-luna` | disponível na conta e respondendo |
| `gemini-3.5-flash-lite` | disponível na chave e respondendo |

**A armadilha:** `gpt-5.6-luna` é modelo de raciocínio. Parte do orçamento de saída é gasta
em tokens de raciocínio que ninguém vê — e um `max_completion_tokens` apertado **não trunca a
resposta: devolve erro sem conteúdo nenhum**. Na primeira chamada com 80 tokens, a resposta
veio vazia. O adapter fixa um piso de 600.

**Custo medido de uma troca completa** (classificação + resposta, com os guardrails julgando o
que voltou): **R$ 0,00087** — 0,09% do teto da conversa. A estimativa da comparação de APIs
era conservadora por uma ordem de grandeza.

---

# Decisões tomadas — rodada 8

## R8.1 — O prazo é fato ou promessa, e o guardrail passou a saber a diferença

A mensagem de véspera — *"sua entrega está marcada pra amanhã"* — era vetada pelo guardrail de
prazo, que existe justamente para impedir promessa de entrega para o dia seguinte.

As duas coisas são a mesma frase e o oposto uma da outra: **prometer "amanhã" antes do pedido**
é o que produz recusa na porta; **avisar "amanhã" na véspera de uma entrega que a transportadora
já agendou** é o que a **evita**. O gate ganhou um campo `stage`: `presale` (padrão) veta,
`logistics` libera — e mesmo em `logistics` continua vetando janela de prazo inventada.

## R8.2 — A retenção de 90 dias virou cron do banco, não do n8n

`pg_cron` chamando `purge_expired()` todo dia às 04:00, dentro do Postgres. Tirar isso do n8n
remove um ponto de falha: se o n8n cair, o dado pessoal continua expirando na hora certa.

## R8.3 — A régua roda por varredura, e a varredura custa zero

Um cron de 5 minutos no n8n chama a mesma Edge Function com `{"job":"followups"}`. Tudo o que
ela decide é determinístico — copy por variante `hash(lead_id) % n`, sem chamada de modelo — então
a frequência da varredura não tem custo. Só o envio depende do canal.

**Três comportamentos ficaram provados em produção:** o relógio reinicia a cada fala da agente
(quem responde não recebe toque), o toque do cupom fica em silêncio enquanto o cupom não existe
na Coinzz, e opt-out ou handoff cancelam o que estava agendado.

## R8.4 — Lacuna aberta: o modelo ainda decide tamanho sozinho

> **Resolvida na rodada 9** — ver R9.1.

O recomendador de tamanho existe em `src/agent/sizing.ts`, com testes e a regra "na dúvida, o
maior" — mas a Edge Function **não o chama**. Hoje o modelo deduz o tamanho a partir da tabela
em centímetros do prompt, e numa conversa de teste indicou **G para manequim 42**, enquanto a
tabela determinística indica **M**.

> **Nota de 2026-09-08:** o modelo estava certo e a tabela determinística estava errada — G
> é o que a tabela publicada diz para 42. O problema apontado aqui continua real (a decisão
> não pode ser improviso do modelo), mas o número usado como prova estava invertido. Ver a
> correção em R9.1.

Isso não é detalhe de estilo: tamanho errado vira devolução, e devolução em COD é prejuízo, não
neutro. **Próxima correção da onda A3**, antes de qualquer tráfego.

---

# Rodada 9 — execução

## R9.1 — R8.4 resolvida: o tamanho não é mais decidido pelo modelo

`extractDressSize` lê o tamanho da mensagem e `sizeFromDressSize` resolve o colete; o handler
entrega o resultado ao modelo como fato a declarar, não como número a calcular.

> ### ⚠️ Correção de 2026-09-08 — os números desta seção estavam errados
>
> Esta rodada registrou "verificado em produção: manequim 42 → **M**, 46 → **G**", e as
> sondas realmente devolveram isso. **O que elas verificaram foi o código, não a tabela.**
>
> A tabela publicada — `Offer.tsx` :16-20 e
> [`../../agente-ia/01-conhecimento/02-tabela-de-medidas.md`](../../agente-ia/01-conhecimento/02-tabela-de-medidas.md)
> — diz **42–44 = G** e **46–48 = GG**. O `sizeFromDressSize` tinha uma segunda escada,
> escrita à mão, deslocada um degrau para baixo. A agente indicava um tamanho **menor** que
> a página onde a cliente acabou de ler a tabela, em todo degrau par.
>
> Tamanho pequeno volta, e devolução em COD é o frete inteiro perdido — exatamente o
> prejuízo que a R8.4 existia para evitar. A correção transformou as duas escadas num array
> só, então elas não podem mais divergir, e um teste percorre a tabela publicada degrau a
> degrau. **O correto é 42 → G e 46 → GG.**
>
> A lição não é sobre tamanho: uma sonda de produção confirma que o código faz o que o
> código diz. Ela não confirma que o código concorda com o que a loja publicou.

**E um guarda-corpo que não funcionou.** A gravação do `leads.size` foi protegida, na primeira
versão, pelo classificador de intenção — só gravava se ele dissesse `TAMANHO`. Em produção,
"tenho 44 anos, esse colete serve pra mim?" foi classificado como `TAMANHO`, corretamente, e a
idade virou manequim: **G para uma cliente de 44 anos**. Quem decide agora é o texto (pista antes
do número, ou mensagem só com o número; recusa quando vem unidade depois). **O classificador
roteia conversa e não serve como condição de escrita no banco** — vale para tudo que vier.

## R9.2 — Destino da notificação de handoff: e-mail pessoal do operador

Responde as perguntas 7 e 16 do plano. Enquanto não existe número de WhatsApp, o alerta de
handoff vai por e-mail para o endereço pessoal do operador.

**O endereço não fica versionado.** Ele mora em `config/business.json`, campo `handoff.email`,
que é gitignored — o `config/business.example.json` guarda só o `{{EMAIL}}`. É dado pessoal, e a
mesma regra que mantém chave de API fora do repositório vale para ele.

**Ainda não existe envio.** O handler grava `handoff_at` e para; quem manda o e-mail é o n8n, e
esse fluxo é o próximo passo desta frente.

## R9.3 — As duas janelas de entrega, conferidas num pedido real

Substitui R7.2, que errou os dois lados. Em **2026-09-08** o operador fez um pedido de verdade
pelo checkout da Coinzz, ponta a ponta, e viu o que a documentação vinha afirmando sem ter olhado:

- **Pagamento na entrega: 1 a 3 dias**, e o checkout oferece à cliente **três dias para escolher**
  antes de ela fechar. Não é "entrega agendada depois" — a data sai da mão dela, ali.
- **Pagamento antecipado: 3 a 10 dias úteis** (era 5 a 10; corrigido pelo operador em 2026-09-09).** R7.2 dizia que ali não se falava prazo nenhum
  porque "o frete varia por região". As duas coisas são verdade ao mesmo tempo: o **valor** do
  frete varia por região e sai no checkout, o **prazo** é fixo e estava escrito lá o tempo todo.

Os dois erros custam dinheiro em direções opostas. Dizer 3 a 5 quando ela pode receber no dia
seguinte é parecer mais lento do que se é, contra concorrente que promete rápido. E calar o prazo
justo no caminho que pede o dinheiro adiantado deixa sem resposta a única pergunta que decide
aquela venda.

**No código.** `GateConfig.delivery` ganhou `prepayDaysMin`/`prepayDaysMax`, opcionais de
propósito: sem eles o gate volta ao comportamento de R7.2 e barra qualquer janela no antecipado,
que continua sendo o certo se o número deixar de valer. O `delivery_promise` escolhe a janela
pelo `paymentPath`, então a janela de um caminho dita no outro é veto — inclusive a do COD dita
no antecipado, que antes passava.

**No site.** `FAQ.tsx` e a página de obrigado do `Encorpa-Website` foram alinhados no mesmo dia,
e o passo de separação deixou de dizer "até 2 dias úteis" no caminho da entrega: numa janela de
1 a 3 dias esse passo comia o dia que a cliente acabou de escolher.

---

# Rodada 10 — em andamento (2026-09-21)

## R10.1 — Teto de custo por conversa: R$ 1,50

Ver correção em R7.3 acima. `overrunTolerance` (25%) não muda — o teto efetivo de handoff
sobe de R$ 1,00 para **R$ 1,875**.

## R10.2 — Custo de recusa na porta: R$ 9,99, confirmado

**Resolvida em 2026-09-21.** O operador confirmou: o custo de um pedido recusado na porta
(com `Físico na entrega` ativo) é **R$ 9,99**, substituindo os **R$ 14,98** registrados
desde a rodada 1 (D1).

**O que o repositório tinha antes:** R$ 14,98 era a soma de dois componentes — handling
fixo de R$ 4,99 por remessa + falha COD de R$ 9,99 (tabela de `06-modelo-economico.md`,
linha "COD recusado"). O operador confirmou que o total passa a ser R$ 9,99; a composição
exata (se o handling deixou de entrar na conta, ou se a falha em si mudou de valor) não foi
detalhada — o número que vale é o total.

**Atualizado:** [`03-economia-cod.md`](../contexto-negocio/03-economia-cod.md) e
[`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md), incluindo os
números derivados que dependem diretamente da recusa (média COD com 15% de recusa, mix
70/30, headroom de subsídio de frete do antecipado). Os números que também dependem da
contribuição do COD entregue e do antecipado (equilíbrio em % de CPL, cenários de
lucro/dia) ficam pendentes até a R10.3 fechar, para não recalcular duas vezes.

## R10.3 — Lucro antes de anúncios: COD confirmado, antecipado corrigido (agora RENDE MENOS)

**Resolvida em 2026-09-21.** O operador confirmou o mecanismo: o antecipado paga
**exatamente a mesma estrutura de taxas do COD** (produto, transação 6,99%+R$2,49,
handling R$4,99, entrega R$19,99) — a única diferença é que **não paga a taxa de entrega
frustrada**, porque pagamento já feito não tem recusa na porta.

| Caminho | Era (rodada 2, 15% off) | **Corrigido (mesmas taxas do COD)** | **Vigente (10% off, §R10.5)** |
|---|---|---|---|
| COD entregue | R$ 63,35 | R$ 63,35 (não mudou) | R$ 63,35 |
| Antecipado | R$ 70,21 (R$ 110,41, 15%) | R$ 45,22 (R$ 110,41, 15%) | **R$ 51,27** (R$ 116,91, 10%) |
| Média COD (15% recusa) | R$ 51,60 | **R$ 52,35** (§R10.2) | R$ 52,35 |
| Média mix 70/30 | R$ 57,18 | R$ 50,21 | **R$ 52,03** |

**Achado importante, não decidido por esta sessão:** com a correção do mecanismo (mesmas
taxas do COD, sem taxa de frustração) e o desconto de 15%, o antecipado rendia
**~R$ 7,13 a menos por pedido** que a média do COD — o oposto do que Q8 e R2.1 usavam
para justificar oferecê-lo como upsell antes do fechamento do COD. A régua de subsídio de
frete (R2.2/teto de frete) também perdeu sentido naquele cenário.

**No mesmo dia, o operador baixou o desconto para 10%** (§R10.5), o que muda a conta de
novo: com R$ 116,91 e a mesma fórmula, a contribuição sobe para **R$ 51,27** — quase
empatada com a média do COD (~R$ 1,08 a menos, não R$ 7,13).

**Isto não reabre Q8 nem R2.1 por conta própria** — mantém a mecânica vigente (antecipado
continua sendo a saída para quando o COD não cobre a região, e continua sem risco de
recusa). Ver a nota completa em
[`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md) e §R10.5.

**Atualizado:** [`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md)
inteiro. `03-economia-cod.md` não precisou mudar — ele só documenta a unidade econômica do
COD, que não mudou aqui.

## R10.4 — Checkout enviado e não finalizado: nova régua de 15 e 30 minutos

**Decisão:** quando a agente envia o link de checkout e a cliente não finaliza, a régua deixa
de depender só do toque de silêncio genérico de 30 minutos e ganha um toque específico mais
cedo:

| Toque | Quando | O quê |
|---|---|---|
| 1 | 15 min depois do link enviado | Lembra de finalizar e pergunta se há algum problema / se precisa de ajuda |
| 2 | 30 min depois do link enviado | Pergunta se conseguiu finalizar o pedido |

Implementado em `src/agent/followups.ts` — novo `FollowupKind` `checkout_reminder` (15 min), e
o toque de 30 min (`silence_1`, variante `link_sent`) reescrito para perguntar
especificamente se o pedido foi concluído. Depois dos 30 min, a régua volta ao padrão
existente: manhã seguinte, 3 dias.

**Isso corrige uma leitura errada:** o sistema nunca esperou 24h para o primeiro toque — mas
também não tinha o toque de 15 min nem a pergunta específica sobre dificuldade no checkout.
Os dois entram agora.

## R10.5 — Desconto do antecipado volta a 10%: quase fecha a diferença de R10.3

**Decisão do operador, no mesmo dia de R10.3:** o desconto do pagamento antecipado desce
de **15% para 10%**. Preço: **R$ 116,91** (era R$ 110,41). Economia declarável:
**R$ 12,99** (era R$ 19,49).

**Efeito na contribuição:** com a mesma fórmula de R10.3 (mesmas taxas do COD, sem taxa de
frustração), a contribuição do antecipado sobe de R$ 45,22 para **R$ 51,27** — contra
R$ 52,35 da média do COD. A diferença cai de ~R$ 7,13 para **~R$ 1,08 por pedido**.

**O que isso muda na pendência que esta seção levantava:** com a diferença tão pequena, o
argumento econômico contra manter o antecipado como upsell voluntário praticamente
desaparece. Isso não é uma decisão sobre Q8/R2.1 tomada por esta sessão — é o novo número
que o operador tem para decidir com folga menor a considerar.

**O que continua de pé, sem depender de nenhuma decisão:**
- O antecipado continua sendo a **saída obrigatória** quando o COD não cobre a região da
  cliente (Q8, Q14) — aí não é escolha, é o único caminho que existe.
- O antecipado continua **sem risco de recusa na porta** — o valor por pedido é garantido,
  não uma média que inclui uma cauda negativa.

**Atualizado:** [`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md),
[`01-mapa-funcional.md`](../../agente-ia/02-especificacao/01-mapa-funcional.md) (§D3/D4),
[`02-script-do-agente.md`](../../agente-ia/06-script/02-script-do-agente.md) (copy da
agente), `config/business.example.json` (já estava correto — `prepayBrl: 116.91`,
`prepayDiscountPercent: 10`).

---

## R10.6 — Saída A: a economia do antecipado nunca é citada em reais, só o percentual

**Decisão do operador, 2026-09-22.** A agente diz **"10% de desconto"** e o preço do
antecipado (R$ 116,91). **Nunca** diz a diferença em reais entre os dois preços
("economiza R$ 12,99"), em forma nenhuma. Substitui a saída C (economia citável com
ressalva de frete, decidida em 2026-09-10 — ver
[`04-frete-e-desconto-do-antecipado.md`](04-frete-e-desconto-do-antecipado.md)).

**Por quê.** Quatro rodadas de conserto do `price_promise` em 22/09 mostraram que o número
em reais não se protege por regex: cada formulação nova de "economia" era uma superfície
("Com o desconto de antecipado sai R$ 12,99" passava). E, com o frete do antecipado
parametrizado e pago pela cliente, "economiza R$ 12,99" vira meia-verdade para quem paga
frete maior que isso. O percentual é verdade nos dois mundos.

**O que mudou no código** (`aa1c021`): o `price_promise` veta qualquer ocorrência do
valor da economia — inclusive "12,99" solto — com `freeShipping` ligado ou desligado; a
maquinaria da saída C (exigir a ressalva na mesma frase) saiu; o prompt instrui "diga o
percentual e o preço do antecipado". Conferido por comparação de 6138 vereditos contra o
commit anterior: nenhum veredito passou de vetado para liberado.

# Rodada 11 — arquitetura do sistema (2026-09-22)

Decisões do operador sobre a arquitetura, tomadas depois da análise da proposta de
arquitetura em closed loop (Evaluation Layer · Hermes · Sandbox) contra este código. A
análise inteira, com o raciocínio, os contra-argumentos e os quatro achados de código que
a motivaram, está em
[`../../agente-ia/05-plano/04-analise-de-arquitetura.md`](../../agente-ia/05-plano/04-analise-de-arquitetura.md).

**O que originou a rodada:** o operador apresentou uma arquitetura de referência
(n8n → LLM/Agente → Supabase → Evaluation → Hermes → Sandbox → closed loop) e pediu
avaliação contra o repositório, explicitamente **sem tratá-la como decisão já tomada**. A
avaliação concluiu que a metade de cima já é o sistema e a metade de baixo falta por um
motivo que não é arquitetural: **o sistema decide bem e não registra a decisão.**

## R11.1 — O runtime é Workflow + LLM com auto-reflexão, e não vai virar agentic

**Decisão:** o desenho atual é o desenho escolhido, e passa a ser declarado como tal.
O modelo **só escreve texto**; toda ação — tamanho, endereço, identidade, cobertura,
checkout, régua — é TypeScript determinístico em volta da chamada. O loop de reescrita
(`index.ts`, §7 do turno) é auto-reflexão: o gate veta, o motivo volta ao modelo no system
prompt, ele reescreve, e o texto vetado nunca entra no histórico da conversa.

**Por que não agentic (tool-calling):** trocaria código determinístico e testado por
escolha do modelo, num funil cuja falha típica é uma promessa que custa o frete inteiro.
Não há ganho mensurável a comprar com essa variância.

**Fecha:** o item 3 da pauta em [`02-decisoes-em-aberto.md`](02-decisoes-em-aberto.md)
(runtime do agente). A resposta de fato foi (a) — chamada HTTP direta, sem framework —
e nenhuma das quatro opções originais previa que o loop viria de graça junto do gate.

## R11.2 — Hermes é supervisor offline, nunca componente de turno

**Decisão:** Hermes lê em lote, fora do caminho da conversa, e escreve em
`hermes_proposals`. Nunca é chamado durante um turno.

**Por quê, com número:** dentro do turno seria uma terceira chamada de modelo (já são
duas: Gemini para intenção, Muse para a resposta) num funil com teto de R$ 1,50 por
conversa e ritmo de resposta calculado em milissegundos por `pacing.ts`. Custo e latência,
sem ganho — a análise do supervisor não precisa ser síncrona para ser útil.

**O schema já sabia disso:** `hermes_proposals.leads_seen` só faz sentido para análise
sobre uma amostra acumulada. A decisão estava implícita na migração `0001_init.sql` desde
o começo; esta rodada só a torna explícita.

## R11.3 — A Evaluation Layer são views SQL e um job, não um serviço

**Decisão:** medição objetiva de qualidade entra como **views no Postgres do Supabase mais
um job de cron**. Não é processo novo, não é serviço novo, não é deploy novo.

**Por quê:** um serviço separado é uma credencial nova para rotacionar, um deploy novo
para divergir do repositório — e divergência de deploy já é armadilha registrada aqui
([`.claude/memory/edge-function-drift.md`](../../../.claude/memory/edge-function-drift.md)).
As métricas são determinísticas e saem de SQL puro. Se um dia precisar de rosto, é uma
página estática como as duas que já existem em `docs/operacao/`.

**O que já dá para medir hoje, sem instrumentação nova:** taxa de bloqueio por gate
(`gate_traces`), reescritas por resposta enviada (`llm_calls.purpose`), custo e latência
por conversa (`llm_calls`), handoff (`leads.handoff_at`), opt-out (`leads.opted_out_at`),
conversão bruta (`orders` ÷ `leads`), mix COD × antecipado (`orders.payment_method`),
toques enviados e cancelados (`followups.status`).

## R11.4 — Não haverá RAG. A base de conhecimento continua no prompt

**Decisão:** sem embeddings, sem vector store, sem `pgvector`.

**Três razões, em ordem de peso:**

1. A base de conhecimento tem **104 linhas** e já cabe — e já está — no system prompt.
   RAG resolve conhecimento que não cabe no contexto; este cabe com folga.
2. RAG introduz um modo de falha que hoje não existe. Numa arquitetura cuja tese é
   "determinístico onde der", trocar texto fixo e testado por recuperação probabilística
   é andar para trás.
3. Se a base crescer, a resposta não é RAG — é o **matcher determinístico** que a spec de
   tools já propôs como alternativa barata. Ele é testável do jeito que este repositório
   testa; RAG não é.

**Quando reabrir:** base acima de ~2000 linhas, ou catálogo com mais de um produto.
Nenhuma das duas está no horizonte.

**Fecha:** o item 10 da pauta (base de conhecimento) — a opção escolhida foi (a),
injetada no prompt, com (c) nomeada como o próximo passo se e quando crescer.

## R11.5 — Memória é coluna estruturada, não camada

**Decisão:** o fato durável do lead — o medo declarado, o evento pelo qual ela quer o
produto, a restrição que ela mencionou — vira **uma coluna `jsonb` em `leads`**, escrita
pelo mesmo tipo de extrator determinístico que já existe para tamanho e endereço.

**O que isso não é:** não é vector store, não é serviço de memória, não é working memory
editável pelo modelo. A pauta original (item 4) já suspeitava disso em
`[INFERÊNCIA]`: *"um vector store para lembrar oito campos é infra que não se paga"*.
A suspeita estava certa e passa a ser decisão.

**Por que vale a pena mesmo assim:** hoje esses fatos vivem em `messages` e morrem quando
a janela de contexto trunca. O sintoma é a agente perguntar duas vezes a mesma coisa —
o atrito nº 1 da rubrica das personas de teste.

**Fecha:** o item 4 da pauta (memória), na opção (a).

## R11.6 — O closed loop fecha num humano. Nunca auto-aplicação

**Decisão:** automatizar **executar → registrar → avaliar → detectar → propor → testar**.
**Nunca** automatizar **validar → implementar**.

A proposta vira um pull request, ou uma linha em `hermes_proposals` com
`status='proposed'`, e o operador aceita ou recusa. Continua sendo um loop; só não é um
loop sem ninguém dentro.

**Três razões, e a terceira é estrutural:**

1. **Exposição regulatória real.** O produto tem apelo de corpo e saúde; a venda é COD,
   com direito de arrependimento do CDC; o dado é pessoal, com LGPD. Cada um dos 19 gates
   existe por causa de uma promessa que custa dinheiro ou expõe a operação.
2. **O histórico deste repositório.** `freeShipping` foi criado com 2.738 testes verdes e
   o deploy dado como concluído — e reinstalou um veto em produção. Testes verdes já não
   bastaram aqui.
3. **A arquitetura já bloqueia isso fisicamente, e isso é uma qualidade.** O
   `BUSINESS_CONFIG` é um secret que **só o operador consegue escrever** — não é legível
   nem gravável pela API de gerência. **Não remova essa barreira para viabilizar o loop.**

## R11.7 — O Sandbox não será construído: ele é o CI deste repositório

**Decisão:** o passo de validação do loop é literalmente
`pnpm test && pnpm dev:conversas && pnpm typecheck:function`, mais as doze personas de
teste interno quando existirem.

**Por quê:** um Sandbox que não seja o CI cria duas verdades, e uma delas fica
desatualizada. O repositório já tem esse ferimento — a spec de onze tools que nunca foi
implementada e que três sessões leram como se descrevesse o sistema.

## R11.8 — Instrumentação antes do tráfego: o funil e o desfecho do turno

**Decisão:** duas escritas novas entram **antes** do primeiro cliente real, e não numa
fase futura de observabilidade.

1. **`conversations.stage` passa a ser escrito** a cada transição, com os valores de
   `STAGES`. Hoje ele nasce `'discovery'` — valor que **não existe** na lista — e nunca é
   escrito: não existe funil, e a máquina de estados roda em teste e em simulador, não em
   produção.
2. **O desfecho do turno passa a ser persistido**: `send` · `fallback` · `deferred` ·
   `handoff` · `stopped`, mais o motivo do fallback. Hoje ele viaja no corpo HTTP e morre
   ali — a taxa de fallback, a métrica de qualidade mais importante do sistema, é
   irrecuperável depois do fato.

**Por que antes e não depois — é a única parte urgente por prazo:** conversa que já
aconteceu não se instrumenta depois. As views e o Hermes leem o passado e podem esperar
tráfego; a escrita, não.

**Feito na mesma tarde** — migração `0006` aplicada e o handler gravando; falta o deploy v33. Registro no
[plano de execução](../../agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md).

## R11.9 — O system prompt passa a ler o config (corrigido nesta sessão)

**O defeito, encontrado ao escrever a análise:** o system prompt em
`supabase/functions/turn/index.ts` afirmava, no mesmo texto:

- *"**Nunca ofereça desconto ali:** os dois caminhos custam o mesmo"* — escrito depois de
  R2.1 zerar o desconto em 09/09;
- *"Quem prefere pagar antes leva 10% de desconto (R$ 116,91)"* — nove linhas abaixo,
  lendo o config, correto por R10.5.

E declarava *"O FRETE É GRÁTIS nos dois caminhos"* como **texto fixo**, sem ler
`delivery.freeShipping` — que o gate `shipping_promise` **lê** desde 10/09
(`guardrails.ts:817,834`).

**Por que isso era grave, e não cosmético:** a Frente 4 atualizou config, comentários e
testes, e **não atualizou o prompt**. No dia em que o operador subisse `freeShipping:
false` no secret, o gate passaria a vetar uma frase que o prompt **manda** escrever — em
toda conversa, queimando uma reescrita por turno, e caindo na resposta segura quando as
reescritas acabassem. Um modelo lendo instrução autocontraditória resolve escolhendo uma
das duas, por conversa, que é o pior dos dois desfechos.

**A correção, feita em 2026-09-22:** três funções novas, ao lado de `prepayWindowLine`:

- `prepayPriceLine()` — o preço do antecipado, com ou sem desconto, conforme
  `prices.prepayDiscountPercent`;
- `prepayDiscountRule()` — se há desconto, ela diz qual é e não arredonda; se não há, a
  regra antiga volta inteira. A proibição de conceder ("eu tiro mais um pouquinho") vale
  nos dois casos;
- `freightBriefing()` — o parágrafo de frete, em dois ramos, lendo `delivery.freeShipping`
  com **o mesmo teste `!== false`** que o gate usa. Com o campo ausente do secret — que é
  como uma chave nova nasce lá — o ramo de frete grátis é o que roda, que é a verdade de
  hoje: a oferta do antecipado na Coinzz vem com `settingsFreight: []` nos 27 estados.

**Nada mudou de comportamento hoje.** Com o secret como está, o prompt gerado é
equivalente ao anterior menos a contradição do desconto. O que mudou é o dia do
`freeShipping: false`: prompt e gate passam a concordar em vez de brigar.

**Verificado:** `pnpm test` (2824 testes), `pnpm lint`, `pnpm typecheck` e
`pnpm typecheck:function` — os quatro verdes. **Ainda não deployado.**

**A lição registrada em memória:** nenhum teste tocava o system prompt. Ele é o texto que
mais decide o comportamento do sistema e era o menos verificado do repositório.

## R11.10 — `conversationCapBrl`: o código não acompanhou R10.1

**Não é decisão nova — é drift.** R10.1 fixou o teto por conversa em **R$ 1,50** em
21/09, e `config/business.example.json` foi atualizado. Mas o repositório carrega **três
números**:

| Valor | Onde | O que é |
|---|---|---|
| **1,5** | `config/business.example.json` | a decisão R10.1, correta |
| 0,8 | fallback da Edge Function (`index.ts`), `src/dev/smoke.ts`, `src/dev/run-conversations.ts` | o valor antigo de R7.3 |
| 0,50 | raciocínio de escolha de modelo no `HANDOFF.md` (Frente 5) | orçamento **por lead** para escolher modelo, nunca teto de conversa — e anterior a R10.1 |

**A ação:** alinhar o fallback do código e do harness de dev a R10.1, e corrigir a linha
do `HANDOFF.md` que trata R$ 0,50 como se fosse o teto. O valor que a produção aplica é
o do secret, não o fallback — mas o fallback é o que uma sessão futura lê para descobrir
o número, e hoje ele ensina o errado.

**É o item 2.3** do plano de execução v2.

## R11.11 — n8n continua sem regra de negócio (reafirmação)

A arquitetura de referência apresentada pelo operador lista **"regras"** dentro da caixa
do n8n. **Recusado, e com o motivo já escrito no `CLAUDE.md`:** guardrail, máquina de
estados e teto de custo são código versionado com teste. O n8n é cano e relógio — webhook,
`Wait`, cron, retry, e-mail. Nada além disso.

Esta é a única parte da proposta que foi recusada.

---

# Rodada 12 — um provedor só (2026-09-23)

## R12.1 — Só a API da Meta. Gemini e OpenAI saem do escopo

Decisão do operador em 23/09: **não vamos usar OpenAI nem Gemini.** Supera R7.1 na parte
dos provedores.

**Por que não custa nada relevante — conferido no código, não no documento:**

| Provedor | Onde R7.1 dizia que era usado | O que o código faz de verdade |
|---|---|---|
| **Gemini** | intenção, endereço, estágio — "20 chamadas por conversa" | **Só classifica intenção**, e o resultado **não decide nada**: vai no corpo da resposta e nenhum dos três workflows do n8n o lê (conferido pela API do n8n em 23/09). Endereço e estágio são TypeScript determinístico. Hoje ele é custo e **um ponto de falha**: se o Gemini cai, o turno vira handoff (`modelFailure`) sem ter decidido nada |
| **OpenAI** | a conversa (`gpt-5.6-luna`) | É a conversa **da v32 no ar**. Na v33 o padrão já é Muse Spark 1.3; a OpenAI fica só como caminho de volta (`CONVERSATION_MODEL`) e como base de comparação do eval |
| **Gemini (dev)** | desenvolvimento e testes | O runner das personas usa Gemini para fazer o papel da cliente |

**O que muda:**

1. **O turno perde a chamada de intenção** (item 2.10 do plano v2). Sem substituto: ela não
   decide nada. Um provedor a menos, uma chamada a menos por turno, um motivo de handoff a
   menos.
2. **O runner das personas passa a usar a Meta** para fazer a cliente.
3. **O eval da fase 4 deixa de ser Muse contra Luna.** Vira Muse sozinha contra a rubrica
   das personas (mentira · perda · atrito · custo · opt-out). Perde-se a comparação lado a
   lado; o critério de aprovação continua o mesmo.
4. **Perde-se o caminho de volta para a Luna.** Se a Muse reprovar no eval, a alternativa
   passa a ser outro modelo da própria API da Meta, não a OpenAI.
5. **Os secrets `OPENAI_API_KEY` e `GEMINI_API_KEY` do Supabase ficam até o deploy da v33**
   — a v32 no ar ainda usa os dois — e saem depois dele.

---

# Rodada 13 — Malu adaptativa (2026-09-24)

Origem: as rodadas 1 e 2 das personas ([relatório](../../agente-ia/05-plano/05-rodada-personas-2026-09-24.md)).
Nenhuma das 12 chegou ao link; o texto do modelo estava quase sempre certo e a venda
travava em código. Conclusão do operador: **mais adaptabilidade e autonomia, menos
guardrail.**

## R13.1 — Um intérprete antes da resposta (revê o espírito de R11.1, não a letra)

Uma chamada de modelo extra por turno lê a mensagem da cliente e devolve JSON estrito:
pedido de pessoa, cancelamento, pós-venda, opt-out, tamanho (letra, calça, cintura, para
quem), e-mail ou recusa de e-mail, forma de pagamento, "vou pensar", e se ela respondeu a
pergunta pendente. **As ações continuam sendo TypeScript determinístico** — o modelo não
chama ferramenta; ele só passa a *ler* o que as regex liam mal ("ela usa G 46",
"me passa pra uma pessoa" no meio de outra frase).

## R13.2 — Handoff só em três casos, com e-mail para o operador

Pedido explícito de pessoa (intérprete **e** palavra de pessoa na mensagem, para não dar
falso positivo), cancelamento, ou pergunta sobre pedido existente ("Vou checar pra você e
já te retorno"). Resposta vetada ou sem resposta pronta **não** passa para humano.
E-mail de handoff: `contato@encorpa-fashion.com.br` (secret `BUSINESS_CONFIG`).

## R13.3 — Gates duros e gates brandos

Continuam vetando (duros): preço, desconto, cupom, frete, prazo, garantia, parcelas,
emagrecimento, saúde, depoimento inventado, se passar por pessoa, opt-out, tamanho sem
CEP, escassez fora do configurado. Passam a só registrar (brandos): janela de prazo sem
dono, repetição de texto e a menção a loja física. Garantia escrita como "7 dias após o
recebimento". Parcelas: até 12x no cartão, só no antecipado; nunca "sem juros".

## R13.4 — Fluxos que não travam

E-mail e CPF deixam de ser obrigatórios para mandar o link: se ela não tem ou não quer
passar, o link sai com o que se sabe e o checkout pede o resto. "Vou pensar" → "Sem
problemas, estou aqui se tiver mais alguma dúvida" + link (antecipado se ela escolheu ou se
a região não tem pagamento na entrega; senão, o da entrega). Tamanho sem resposta: três
frases fixas do operador e depois silêncio até a mensagem fazer sentido. Falha de rede:
novas tentativas antes de qualquer handoff. Mensagens de até ~30 palavras, divididas só em
fim de frase.

## R13.5 — Respostas de objeção definidas pelo operador

CNPJ → e-mail do suporte. Loja física → "ainda não, só online, com planos de abrir em São
Paulo". Depoimentos → seção de depoimentos do site. Frete e data exata → dentro do
checkout. Preço alto → qualidade, "mais de 500 clientes satisfeitas", pagamento na
entrega, 7 dias, suporte todo dia. CPF → nota fiscal, como a lei exige. Expressa sai do
prompt até existir praça ativa. Recepção automática: "uma de nossas atendentes esclarecerá
todas as suas dúvidas". **"500 clientes" e "planos em São Paulo" são fatos declarados pelo
operador e ficam no config; só podem ficar lá se forem verdade.**

## R13.6 — Recusado: escassez e prova social inventadas

O operador pediu "nas últimas 24 horas compraram 68 peças", "o estoque vai acabar nas
próximas horas" e, se alguém desmentir, dizer que "o estoque foi reposto". **Não
implementado:** são números inventados e uma mentira planejada para quem desconfiar —
publicidade enganosa (CDC art. 37) e contra a política de anúncios da Meta, com risco de
derrubar a conta e o número. Não existe contagem real de estoque (a consulta da Logzz só
diz se há disponibilidade por CEP). O "restam 12 unidades" (`allowUnverified`, decisão de
08/09) fica, por decisão do operador, e carrega o mesmo risco em escala menor.

---

# Rodada 14 — kits, checkout e o loop que testa as correções (2026-09-25)

Origem: a validação da v33 (etapa 2 do plano simples) e as decisões do operador ao longo
do dia. Registro técnico de cada mudança em
[`08-mudancas/registro.md`](../../agente-ia/08-mudancas/registro.md) (M-05 a M-09).

## R14.1 — Hermes é parte do sistema, com o mesmo peso de n8n e Supabase

Instalado, calibrado (3 de 3 defeitos plantados achados) e agendado: a GitHub Action
`hermes.yml` roda a cada 50 leads (R6.2) e grava propostas em `hermes_proposals`; também
roda sobre cada rodada de personas (`pnpm hermes --source=personas:<pasta>`). Continua
**offline e sem publicar sozinho** (R11.2, R11.6): toda proposta passa por um humano. Em
dado de cliente real roda só o modelo padrão da Meta, **nunca** o `-contributor` (LGPD). Na
rodada de kits, o Hermes achou um erro de medida no placar (M-03), aceito e corrigido.

## R14.2 — Modelo da conversa: Muse Spark 1.3, trocado pelo operador antes do real

O eval contra as 12 personas deu 0 respostas prontas; a Muse fica. Os testes rodam com
`muse-spark-1.3-contributor`; **o operador troca para o modelo padrão antes do primeiro
lead real** (secret `CONVERSATION_MODEL`).

## R14.3 — Kits de 2 e 3 peças

O checkout vende quantidade fixa, então há um link por quantidade e por caminho:

| Caminho | 1 peça | 2 peças | 3 peças |
|---|---|---|---|
| Na entrega (Logzz) | R$ 129,90 (0%) | R$ 233,82 (10%) | R$ 311,76 (20%) |
| Antecipado (Coinzz) | R$ 116,91 (10%) | R$ 207,84 (20%) | R$ 272,79 (30%) |

Decisões do operador: a Malu **oferece o kit uma vez, na decisão**; **pergunta o tamanho de
cada peça** (letra ou número de calça, convertido pela mesma tabela de 1 peça — ela nunca
chuta); pede os tamanhos **no complemento do endereço**; **4 peças ou mais vão para uma
pessoa**. O kit fica guardado enquanto é usado e expira após 7 dias sem uso. O gate de
preço exige que preço e percentual pertençam a uma oferta do caminho e de uma das
quantidades que a frase cita. **Resíduo aceito:** dois kits citados juntos com os preços
trocados entre si ("2 peças R$ 311,76 e 3 peças R$ 233,82") — o link do checkout mostra o
preço certo antes de ela confirmar.

## R14.4 — Checkout: entrega na Logzz, antecipado na Coinzz

O checkout de entrega da Coinzz cobrava frete e não havia como desligar; **a entrega voltou
para a Logzz**, onde o frete para a cliente é R$ 0,00 (links `ccm-1-unidade`,
`ccm-2-unidades`, `ccm-3-unidades`; ofertas `sal0g3mo`, `salng30n`, `sal6gz39`). O
antecipado segue na Coinzz (`encorpa-pagamento-antecipado-0`, `antecipado-2-0`,
`antecipado-3-0`; ofertas `offkw47x`, `offy3l4v`, `offdd0gn`). O link da Logzz preenche o
CPF como `cpf`; o da Coinzz, como `document`. Os dois webhooks (Coinzz e Logzz) caem no
mesmo `/encorpa-venda` do n8n, com `?fonte=`.

## R14.5 — O caminho que ela escolheu vale até ela escolher de novo

Achado da rodada de personas: depois de "prefiro pagar antecipado no pix", o turno
seguinte voltava ao link da entrega, porque a escolha valia só na mensagem em que foi
dita. Agora fica no lead (`leads.payment_choice`) e é zerada após a compra. Só é gravada
quando a frase **é uma escolha** ("quero no pix", "pix mesmo"), nunca de uma pergunta ou
comparação ("quanto economizo no pix?"), e expira após 7 dias sem uso, como o kit. Região
sem pagamento na entrega continua forçando o antecipado.

## R14.10 — A régua pós-compra fala do pedido, não do preço de tabela

A confirmação e a véspera leem o pedido: total, peças, tamanhos e caminho. Kit na entrega:
"Kit de 2 coletes, tamanhos M e G, R$ 233,82 na entrega" e "deixa R$ 233,82 separado".
Pedido antecipado: "já pago", sem "deixa separado".

## R14.11 — Pós-venda vai para uma pessoa, exceto o encerramento feliz

Toda mensagem sobre um pedido existente vai para uma pessoa, menos o agradecimento ou a
despedida sem queixa ("obrigada, já finalizei", "chegou, amei"). A exceção é uma lista de
permissão: qualquer palavra fora dela ("mas veio o M", "só 1 das 2") mantém o handoff.

## R14.6 — Fatos do config confirmados pelo operador

Consulta de região **fica ativa** mesmo imperfeita. "Mais de 500 clientes satisfeitas" e
"planos de loja em São Paulo" **são verdade** e ficam. Depoimentos: nenhum no secret (a
Malu aponta a seção do site). **Proposto, sem objeção, a confirmar no deploy:** o secret
de produção sai sem `scarcity` (o "restam 12" que a R13.6 manteve carrega o mesmo risco), e
o cupom fica inativo — o código `SUPER20` veio do arquivo de teste, não do operador.

## R14.7 — Erro corrigido é erro com guarda testada, e o loop vai até a revisão aprovar

Cada bug corrigido ganha um teste e uma **mutação** em `pnpm verificar:guardas`, que
reinstala o bug e exige que o teste fique vermelho (roda no CI). Mudança de gate passa por
`pnpm dev:gates` (nenhum afrouxamento sem aceite). A validação é um loop: revisão
independente → correção na origem → nova revisão, até aprovar; depois rodada de personas e
Hermes sobre ela. Nos kits foram quatro passadas; cada uma achou furos da anterior.

## R14.8 — Deploy só com o "pode subir" do operador

A v33 sobe (secrets, 12 arquivos, sonda pelo n8n) só depois do aval explícito. O token de
acesso (PAT) do Supabase usado no deploy é revogado pelo operador logo em seguida.

## R14.12 — Deploy da v33 e a senha dos webhooks (O10)

O operador deu o aval ("pode subir"). Coinzz e Logzz **não têm campo de cabeçalho** no
webhook (conferido pelo operador nas telas), então a senha vai na URL (`&token=`), o n8n a
repassa e a função a compara com o secret `SALE_WEBHOOK_TOKEN` — venda sem a senha recebe
401. O O2 (espera de 2 min e retomada) subiu junto. A sonda de produção achou a
`META_API_KEY` do Supabase recusada pela Meta: bloqueio do operador.

## R14.13 — H-2: o link só vai com a compra confirmada (2026-09-25, tarde)

Decisão do operador sobre a proposta H-2 do Hermes ("todo link sai com o preço do caminho"):
**recusada como escrita.** O link não carrega o preço por regra, porque a cliente pode estar
só perguntando e o link cedo demais apressa e perde a venda. No lugar:

1. **O link só sai quando ela confirma que quer comprar.** Barganha com "eu levo" não é
   decisão; deixar o pedido do nome passar para perguntar outra coisa também não.
2. **"Vou pensar" continua mandando o link** (R13.4 mantida, confirmado pelo operador).
3. **Fatos ligados, só no raciocínio e no registro da agente**: preço ↔ caminho ↔ peças ↔
   prazo ↔ link, lidos do config — nunca como formato de mensagem.
4. **Prazo do antecipado continua "em média 5 dias úteis"** (sem faixa de 5 a 10).

Grafo: §12.

## R14.14 — Hermes: aprovar é um clique, e o resto anda sozinho (2026-09-25, tarde)

Decisão do operador: "a cada rodada o Hermes fica mais inteligente, registrando todas as
decisões e execuções; eu só clico em aprovar e tudo se atualiza". R11.6 continua de pé — o
loop fecha num humano —, e o humano passa a ser o clique em cada proposta:

1. **Histórico** (migração 0014): cada proposta guarda a decisão, o motivo do operador, a
   implementação e o resultado. O Hermes lê `decisoes.md` antes de propor; recusada não
   volta, e o motivo vira o critério.
2. **Decisão por link** (migração 0015, workflow n8n "Hermes: decisão do operador"): e-mail
   com um link por proposta; o formulário grava só na linha cujo código secreto bate e que
   ainda está `proposed`. O resultado de cada aprovada também chega por e-mail (0016).
3. **Implementação** (`hermes/IMPLEMENTAR.md`, rotina agendada): pega a aprovada, implementa,
   passa o CI inteiro, a revisão Opus em loop e as personas; abre o PR com `hermes:<id>` e
   faz o merge. O que precisa de segredo, config, migração ou n8n volta como `failed` com o
   que o operador tem de fazer.
4. **Publicação** (`deploy-hermes.yml`): depois do CI verde no `main`, só para commit com
   `hermes:<id>`. **R14.8 continua valendo para todo o resto**: outro merge não publica.
   Exige o secret `SUPABASE_ACCESS_TOKEN` no GitHub (operador: "(a) sim", e opção 1).

Cuidado que isto cria: o deploy publica o `main` inteiro. Mudança manual no turno que for
para o `main` precisa ser publicada logo (R14.8), senão sai de carona na próxima aprovada.

## R14.15 — Mercado Pago processa o antecipado na Coinzz (2026-09-25, noite)

Informado pelo operador: o pagamento do antecipado na Coinzz passou a ser processado pelo
**Mercado Pago**, que cobra taxa menor. Nada muda no código: o checkout, o link, o webhook
(`?fonte=coinzz`) e o preço que a Malu cita continuam os mesmos. O que muda é a margem do
antecipado — a conta de unidade econômica que usava a taxa da Coinzz fica desatualizada até
alguém refazê-la com a taxa do Mercado Pago. Mapa do funil no Miro atualizado no mesmo dia
("Funil de Vendas com Agente de IA", quadros 1 a 8).

**Margem refeita (2026-09-25):** com Pix 0,99% + R$ 1,00 e cartão à vista 4,98% (taxas do
operador), mix 50/50, o antecipado rende **R$ 57,94 / 116,16 / 149,17** (1/2/3 peças), contra
R$ 52,35 / 109,01 / 145,12 da média do COD com 15% de recusa — era R$ 51,27 / 105,84 /
136,25 com a Coinzz. O antecipado passa a render mais que o COD nas três quantidades; mix
70/30 de 1 peça sobe para R$ 54,03. **Três premissas não confirmadas** mudam o resultado: se
o antifraude de R$ 2,49 continua (folga cai para +3,10 / +4,66 / +1,55), o mix Pix/cartão e,
sobretudo, a taxa do **parcelado** se os juros forem absorvidos pela operação (no kit de 3,
acima de 7,94% no cartão a vantagem some). Nenhum preço ou desconto mudou. Conta e
sensibilidade:
[`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md) (caixa de
2026-09-25). Grafo: §14.

**Decisão do operador (2026-09-26):** o antifraude de R$ 2,49 **não é mais cobrado** (P1
confirmado — vale R$ 57,94 / 116,16 / 149,17) e **preços e descontos ficam como estão**: o
ganho do Mercado Pago vira margem. Segue em aberto só a taxa do parcelado e quem paga os
juros (P4), que pode zerar a folga do kit de 3.

## R14.16 — O canal do WhatsApp fica pronto e desligado (2026-09-25, noite)

Decisão do operador: Meta Ads, Business Manager, o app de developer, o número e os templates
são do **sócio**; o operador cuida do técnico. O técnico ficou pronto antes do número:

1. **Entrada:** função `whatsapp` (assinatura da Meta conferida, 200 na hora, selo
   `INBOUND_SIGNING_SECRET` em cada mensagem) → n8n `encorpa-inbound` → turno.
2. **Saída:** workflow n8n "WhatsApp envio" (`CANAL_ATIVO = false`), chamado pelo Turno
   (confirmação de leitura, balões) e pelo Relógio (toques, texto ou template).
3. **Janela de 24h de verdade:** começa na mensagem dela (horário da Meta), fecha 10 min
   antes; toque bloqueado vira e-mail; nova tentativa fora da janela vai para uma pessoa.
4. **Porta fechada em camadas:** selo na entrada, lista fechada de campos no n8n, e
   `TURN_REQUIRE_SERVICE_ROLE` para a chave pública — os dois segredos nascem ausentes e
   são ligados na ativação, com uma sonda antes.

Passo a passo de ativação: [`docs/operacao/whatsapp-cloud-api.md`](../../operacao/whatsapp-cloud-api.md).
Grafo: §13.

## R14.9 — Para depois

Apps de integração da Coinzz (pagar.me, Mercado Pago, 123Log); checkout no domínio da
marca (O-02); autenticar os webhooks do n8n (O10) — com segredo em header se Coinzz e Logzz
permitirem, senão na URL.

# Rodada 15 — opt-in de marketing e a régua sem contradizer o template (2026-09-28)

> Escrita na branch `claude/upbeat-newton-6l6dzz`, em paralelo ao PR #37
> (`claude/focused-gates-fjpixt`, que chega a §22 do grafo e não usa esta numeração — as
> duas se somam no merge). Ver
> [`docs/agente-ia/05-plano/07-opt-in-marketing.md`](../../agente-ia/05-plano/07-opt-in-marketing.md)
> para a especificação completa; grafo §23–§26.

## R15.1 — Opt-in de marketing: opção B, que começa como opção A

O operador decidiu, em 2026-09-28: **opção B** do memorando (pergunta explícita, feita pelo
código, nunca pelo modelo) — não a opção A (só template `UTILITY` fora da janela, sem
perguntar nada) nem a C (tratar o clique no anúncio como opt-in, rejeitada por não cumprir
os dois requisitos da página de opt-in da Meta e não ter prova de consentimento). **Decidido,
não implantado**: a flag `channel.askMarketingOptIn` ainda não existe no `BUSINESS_CONFIG`
nem é lida pelo turno — até ela nascer (ausente = não pergunta), o código se comporta como A.
O módulo que faz a pergunta, lê a resposta e lê a revogação (`src/agent/opt-in.ts`,
commit `17decb7`: consentimento só pelo toque no botão, texto só suspende) já existe e está provado por teste, mas a fiação que o liga
ao turno e à régua é trabalho posterior ao merge do PR #37.

## R15.2 — `silence_2`: opção (a) para a segunda variante

O operador decidiu, em 2026-09-28, a opção (a) para a segunda variante do `silence_2`
quando cai fora da janela de 24h: ela sai como a **primeira variante** (que já tem
rascunho de template), em vez de sair como texto livre — o que hoje acontece e que
`tests/whatsapp-templates.test.ts` fixa como divergência conhecida (`it.fails`) até a
mudança entrar. **Decidido, não implantado**: a implementação (escolher a primeira
variante quando a janela está fechada e a segunda seria a mandada) é trabalho posterior
ao merge do PR #37, listado no topo do `HANDOFF.md`.

## R15.3 — Frete grátis no pagamento na entrega; o antecipado segue cobrando por região

O operador decidiu, em 2026-09-28: *"Com pagamento na entrega a Malu precisa informar o frete
grátis sim, pois com pagamento na entrega o frete de fato é grátis. Desconto tem sim, deve
prometer desconto no pagamento antecipado e quando adicionam mais de 1 peça, tudo está
documentado. Não deixe as travas e guardrails tão fortes, pois podem limitar a atuação do
agente e prejudicar a venda por limitar coisas que são verdades e agregam valor."*
Perguntado, confirmou que o checkout do **antecipado (Coinzz) cobra frete por região** — o
"frete grátis" é verdade **só** no pagamento na entrega (Logzz, frete R$ 0,00 para ela).

**Supera, em parte, a decisão de 2026-09-22** ("a operação não oferece frete grátis"): ela
continua valendo para o antecipado e deixa de valer para a entrega.

- **Config:** `delivery.codFreeShipping`, opcional, lido com `!== false` — **ausente = grátis
  na entrega**, que é a verdade de hoje, então o secret `BUSINESS_CONFIG` de produção não
  precisa ser editado para a decisão valer. `false` volta ao mundo de 22/09. `freeShipping`
  continua significando "grátis nos **dois** caminhos" (`=== true`) e, se ligado, prevalece.
- **Gate (`shipping_promise`):** a promessa de frete grátis passa quando a frase nomeia o
  pagamento na entrega ("na entrega", "pagando ao entregador", "paga quando receber") e nada
  além dele — nenhum nome do antecipado (pix, cartão, boleto, "pagando antes"…), nenhum preço
  do antecipado, nada que alcance os dois caminhos ou o outro ("nos dois", "em qualquer forma
  de pagamento", "também", "ou antes", "não é só na entrega", "sem pagamento na entrega"). O
  "frete grátis" **sem caminho** continua vetado nos dois caminhos: `paymentPath: "cod"` é o
  que o turno passa quando ela não escolheu nada, e o turno em que ela pergunta "e no pix, tem
  frete?" é um deles. A negação honesta do antecipado ("no pix não tem frete grátis") passa.
  Valor de frete continua nunca citável.
- **Prompt:** o bloco de frete ensina "Pagando na entrega o frete é grátis: você paga só
  R$ 129,90 quando receber." e, no antecipado, "calculado por região, o valor aparece no
  checkout". Desconto do antecipado, kits, pagar ao receber e os 7 dias já estavam ensinados.
- **Guarda contra excesso de trava:** `tests/honest-sales-lines.test.ts` — as frases
  verdadeiras que vendem, pela cadeia inteira com o config de exemplo, e a mentira espelhada de
  cada uma. Grafo §29.

## R15.4 — Entrega concluída só no COD; devolução pós-envio custa frete + manuseio (2026-09-29)

A atendente do suporte Logzz/Coinzz informou ao operador que a **taxa de entrega concluída
(R$ 19,99) só é cobrada no pagamento na entrega**. No antecipado o operador paga etiqueta (se
a cliente não paga), manuseio e taxas de transação. O operador decidiu:

- **Antecipado entregue:** a cliente paga o frete inteiro no checkout; custo do operador =
  taxa do MP + R$ 4,99. Contribuição 1 peça **R$ 77,93** (era R$ 57,94).
- **Devolução, processo de devolução ou cancelamento depois de enviado:** o operador paga o
  **frete inteiro + o manuseio**, nos dois caminhos (COD R$ 19,99 + R$ 4,99; antecipado
  etiqueta + R$ 4,99).
- **Recusa de 15% inalterada** e exclusiva do COD (entregador na porta, cliente recusa). O
  antecipado nunca tem taxa de frustração. **Custo da recusa: R$ 9,90, tudo o que o operador
  paga** (operador, 2026-09-29 — substitui o R$ 9,99 de R10.2; os R$ 9,99 que sobram em
  `03-economia-cod.md` e nas caixas históricas do modelo econômico ficam como registro).
- **Premissas de lucro por venda (2026-09-29):** lead R$ 1,00, conversão 10%, IA R$ 0,10 por
  lead, devolução pós-envio 7,5% nos dois caminhos; tabela para 1, 2 e 3 peças em
  `06-modelo-economico.md` e no `mapa-financeiro.html`. **Etiqueta média de R$ 20,00** nas
  devoluções do antecipado (+ manuseio R$ 4,99 = R$ 24,99); recusa (15%, R$ 9,90) e devolução
  (7,5%, R$ 24,98 no COD) são eventos separados, com taxas e custos próprios.
  **Fechado no mesmo dia:** a taxa completa de devolução é **R$ 25,00, manuseio incluso, nos dois
  caminhos** (substitui os R$ 24,98 / R$ 24,99); a taxa de transação **não volta** no estorno
  (no antecipado o Mercado Pago cobra mesmo assim); entrega, manuseio e demais taxas são
  **por pedido**, também nos kits (confirmado); cartão à vista e 7,5% de devolução ficam como
  expectativa. Lucro por venda 1 / 2 / 3 peças: COD 34,74 / 86,39 / 119,33; antecipado 58,91 /
  112,56 / 142,95; mix 70/30 41,99 / 94,24 / 126,41.
- **Teto de custo por conversa: R$ 0,50** (operador, 2026-09-29; supera os R$ 1,50 de R10.1).
  `conversationCapBrl` = 0,5 em `config/business.example.json`, no fallback da Edge Function
  (`supabase/functions/turn/index.ts`), nas fixtures e nos scripts de `src/dev/`; com a folga de
  25% o teto efetivo cai de R$ 1,875 para **R$ 0,625**. **Não deployado:** o secret
  `BUSINESS_CONFIG` de produção define o valor e sobrescreve o fallback inteiro — o operador
  precisa trocar `cost.conversationCapBrl` lá para o teto novo valer.

Supera a premissa de 21/09 e a P3 de 25/09 no que toca ao antecipado. Só documentação e o
mapa financeiro mudam — nenhum gate, prompt ou config lê esses valores; a regra do que a agente
diz (só o percentual, frete no checkout do antecipado) segue igual. Conta completa em
[`06-modelo-economico.md`](../contexto-negocio/06-modelo-economico.md).
---

# Rodada 16 — o que a régua e o gate afirmam, contra a operação (2026-09-29)

Origem: a revisão de riscos do PR #39 e o cruzamento do agente com a documentação
([`revisao-pr39.md`](../../agente-ia/08-mudancas/revisao-pr39.md),
[`09-cruzamento/divergencias.md`](../../agente-ia/09-cruzamento/divergencias.md)). Respostas do
operador em 2026-09-29, uma por divergência.

## R16.1 — Os toques depois da compra seguem o status e a data do pedido

A véspera ("sua entrega está marcada pra amanhã") e o "já está a caminho" saíam por relógio (30 h
e 24 h depois do pedido), inclusive no antecipado, que leva em média 5 dias úteis. Passam a
seguir o **status** e a **data de entrega** do pedido. O operador prefere ler direto da API da
Coinzz e da Logzz; por ora a fonte é o webhook de venda das duas plataformas, que já traz o
status e a data (`date_delivery` → `orders.scheduled_for`). Sem data, não há véspera.

## R16.2 — Praça sem pagamento na entrega segue o antecipado, também na régua

Se a praça da lead não tem pagamento na entrega, a agente segue o segundo caminho, o
antecipado, deixando explícito o desconto e o prazo médio de entrega. O turno já fazia isso; a
régua não sabia a praça e mandava "você não paga nada agora". A praça passa a ser guardada no
lead e o toque é escrito e julgado pelo caminho dela.

## R16.3 — O frete da devolução é por nossa conta

Se a cliente quiser devolver o produto dentro dos 7 dias, o frete é pago pela loja. "A gente
devolve o seu dinheiro sem custo nenhum" é verdade e fica.

## R16.4 — O entregador não espera ela vestir

Nada pode dizer que ela veste ou experimenta o colete antes de pagar. O verdadeiro é o que o
site publica: ela vê o colete antes de pagar e, se não for o que esperava, não fica com ele;
depois de receber, tem 7 dias para devolver. Os toques que diziam "você vê, veste, e só paga se
estiver tudo certo" foram reescritos, e o gate passa a vetar a promessa.

## R16.5 — "Restam 12 unidades" continua

O secret de produção tem `scarcity`, e o operador mantém o "restam 12 unidades" (R13.6, R14.6).

## R16.6 — Postura agrega valor, sem virar tratamento

Operador, 2026-09-29: o colete ajuda na postura, além de modelar. A agente pode dizer ("além de
modelar, ele ajuda na postura", "dá apoio à postura") — é o que o site publica ("Segura a
postura"). Continua vetado dizer que corrige, trata ou cura postura, coluna ou dor, e "melhora a
postura" (efeito duradouro no corpo). Prompt e `health_claim` dizem a mesma coisa.

## R16.7 — Depoimentos só quando ela pedir

A agente mantém a indicação da seção de depoimentos do site, mas só quando a cliente pede
depoimento. Hoje é regra de prompt e de briefing: o gate não vê a mensagem dela, então não há
veto determinístico para a menção espontânea.

## R16.8 — "Vou pensar": a resposta fixa passa a vender, e é o único lugar do estoque

A resposta ao adiamento ("vou pensar", "depois eu compro") era só "Sem problemas, estou aqui se
tiver mais alguma dúvida" + link. Agora (`thinkReply`) mantém essa abertura e acrescenta o estoque
declarado ("restam 12 unidades desse lote"), o argumento do caminho dela (na entrega: nada agora e
7 dias pra devolver sem custo; no antecipado: 10% de desconto e o prazo médio) e aponta o link, ou
pede o tamanho se ainda não há link. O estoque sai do prompt da conversa e `scarcity_claim` veta
nas outras mensagens as formas de estoque e prazo que conhece (contagem, últimas unidades, estoque
acabando, esgotado, oferta que acaba) — é lista, não prova (`postponing`, grafo §37). Supera a parte "sem segundo argumento" da R13.4.

## R16.9 — Cancelamento e devolução continuam com uma pessoa (veredito sobre as APIs)

Pedido do operador: a agente completar cancelamento e devolução sozinha pela API. Veredito, com a
documentação enviada em 2026-09-29: **não é possível hoje — a agente aciona o handoff.** A API da
Coinzz documenta só `POST /api/sales` (criar venda ou reprocessar pagamento); a da Logzz, só
`GET /api/v1/products` (token de teste validado: as ofertas de 1/2/3 peças batem com o config). Nenhuma
expõe cancelar, estornar ou devolver. A devolução da Logzz é por formulário, e-mail
(trocasereembolsos@logzz.com.br) ou WhatsApp, com etiqueta pré-paga e reembolso em até 72 h úteis
após a inspeção. Se a Coinzz ou a Logzz passarem a expor esses endpoints, a automação entra como
código determinístico, nunca como ferramenta do modelo (R11.1). **Pergunta aberta ao operador:** pela
política pública da Logzz, a troca por preferência (tamanho) custa R$ 20 à cliente, mas o repositório
trata "a troca do colete é grátis" como verdade desde 2026-09-25 (grafo §9, M-08) e a agente continua
podendo dizer isso até o operador decidir.

> **Resposta de 2026-09-29 (R17.1):** a troca de tamanho **não é grátis** — o envio da troca é da
> cliente. Ver abaixo.

---

# Rodada 17 — a troca de tamanho (2026-09-29)

## R17.1 — O envio da troca de tamanho é da cliente, pago por um link do Mercado Pago

Resposta do operador à pergunta aberta da R16.9: *"Frete por conta da cliente. Agente calcula e envia
o link do checkout do Mercado Pago (fora da Coinzz ou Logzz) para a cliente pagar essa taxa."* O link
ainda vai ser criado pelo operador.

- **A agente nunca diz que a troca é grátis.** `warranty_promise` veta "a troca é grátis", "sem
  custo pra trocar", "a gente paga o frete da troca", "trocar ou devolver, sem custo" e a resposta
  "custa nada" a uma pergunta sobre a troca (`claimsExchangeFree`). A devolução continua sem custo
  (R16.3): "a devolução é sem custo" passa.
- **Antes da compra**, o prompt e o briefing dizem que o envio da troca é dela, sem valor.
- **Depois da compra**, quando ela pede para trocar o tamanho de um pedido (`wants_exchange` no
  intérprete, só com pedido no contexto), a resposta é fixa: o valor do envio da troca e o link do
  Mercado Pago; em seguida o handoff, e uma pessoa combina a troca. O valor só passa o
  `price_promise` nessa resposta (`GateContext.exchanging`).
- **Config:** `exchange: { feeBrl, checkoutUrl }`, opcional. **Ausente** (o secret de hoje), a
  troca de um pedido vai para uma pessoa como antes, com "Vou checar pra você e já te retorno 💛".
  Os dois precisam estar escritos no `BUSINESS_CONFIG`, com `feeBrl` número e `checkoutUrl` em
  `https://`, para a resposta com link sair.
- **"Calcula":** hoje o valor é um só, fixo por troca (`feeBrl`). Se o envio variar por região
  ou por número de peças, isso é uma decisão nova — pergunta aberta ao operador.

Grafo §39.

## R17.3 — A pessoa responde a cliente por um formulário do n8n

Decisão do operador em 2026-09-30 (L0.3 do pipeline 80/20): opção (a), formulário no n8n
"Responder cliente", em vez da coexistência com o app WhatsApp Business ou do Chatwoot.

- **Como:** telefone (como veio no e-mail de handoff) + texto → a `turn` confere e grava → "WhatsApp
  envio". O formulário tem senha (credencial "Formulário do operador", basic auth).
- **Quando sai:** só texto, só dentro da janela de 24 h da última mensagem dela, nunca para quem
  pediu para parar, um envio por clique. A recusa aparece no próprio formulário, em português.
- **A agente não volta:** responder pelo formulário não limpa o `handoff_at`.
- **Chatwoot** (Q12 original) fica para quando o volume de handoff pedir.

Grafo §43.

## R17.4 — O cupom é do follow-up, não da conversa

Decisão do operador em 2026-09-30: o cupom SUPER20 (20%) está ativo e serve ao follow-up de quem
não comprou de primeira (`silence_3`). A conversa só pode citá-lo depois que esse toque chegou a
ela; antes, lê como se não houvesse cupom. Sem chave nova no `BUSINESS_CONFIG`: `coupon.active`
continua ligando o toque. Grafo §44.

**R17.4 (a), mesmo dia:** Logzz e Coinzz aceitam cupom no checkout. O toque dá o código
(`coupon.code`) para ela digitar; deixa de prometer "eu monto o pedido com o desconto já aplicado".
