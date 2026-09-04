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
| D4 | Contribuição do antecipado | **R$ 76,24**, não os R$ 68,34 do estudo. A média com mix 70/30 sobe de R$ 56,62 para **R$ 58,99**. Fica aberta a dúvida de se o frete de R$ 19,99 incide também no antecipado — ver [modelo](../00-contexto/06-modelo-economico.md) |

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

**E vale mais do que parecia.** Com a contribuição corrigida, o antecipado rende R$ 76,24
contra R$ 51,60 do COD já descontada a recusa — **R$ 24,64 a mais por pedido**, mesmo dando
10% de desconto. Cada pedido que migra de COD para antecipado também sai da exposição aos
15% de recusa.

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

**O único comportamento que fica de fora, e por quê:** a negação ativa. A agente não é
projetada para afirmar que é humana quando alguém perguntar diretamente e a sério. Com um
público cuja objeção número um é golpe, ser pega numa negação custa mais do que a pergunta
custaria. Ela desvia com naturalidade para o que resolve — o pedido, o tamanho, a entrega —
e o handoff humano existe justamente para quando a pessoa quiser falar com gente.

**Confirmado pelo operador:** seguir com este modelo — persona completa, sem negação ativa.

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

## O que ficou pendente desta rodada

| # | Pendência | Quem resolve |
|---|---|---|
| 1 | A Coinzz tem API de criação de pedido? | Verificação técnica — primeira tarefa |
| 2 | Botões vs. texto livre (Q6) | Operador + sessão, juntos |
| 3 | Faixa horária da madrugada (Q12) | Operador |
| 4 | Código do cupom de 15% / 20% (Q9) | Operador cria na Coinzz |
| 5 | Copy do site: *"Não é robô"* (Q10) | Operador |
| 6 | `PREPAY_DISCOUNT` de 5% → 10% e ligar (D2) | Depende da configuração na Coinzz |
| 7 | Regra de cobrança de inadimplente (Q13) | Adiada por decisão |
| 8 | O frete de R$ 19,99 incide também no antecipado? Se sim, a contribuição cai de R$ 76,24 para R$ 56,25 e a estratégia de antecipado se inverte | Operador |
