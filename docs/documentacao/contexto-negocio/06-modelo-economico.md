# Modelo econômico — site vs. WhatsApp + IA

Fonte: documento *"Modelagem Econômica — Site vs. WhatsApp + IA (versão atualizada)"*,
entregue pelo operador em 2026-09-03.

> **Como tratar este arquivo.** É um **estudo de projeção com dados de mercado**, não
> resultado medido da nossa operação. O próprio documento encerra dizendo que *"a decisão
> final deve ser confirmada por teste real de CPL/CPC, conversão e CAC"*. Serve para
> dimensionar o agente e priorizar trabalho — não como verdade.
>
> **Os cenários sem COD não são premissa nossa.** A operação é COD. Eles ficam registrados
> só como referencial comparativo do estudo.

> ### ⚠️ Correção de 2026-09-21 — custo de recusa é R$ 9,99, não R$ 14,98
>
> Confirmado pelo operador (§R10.2 em
> [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md)). Isso muda a
> **média COD com 15% de recusa** e tudo que depende dela abaixo — recalculado nesta
> revisão. **O que não foi recalculado:** o ponto de equilíbrio em % de CPL, e os cenários
> de lucro/dia/30 dias, porque eles também dependem da contribuição do COD entregue
> (R$ 63,35) e do antecipado (R$ 70,21), **ambos em revisão separada pelo operador**
> (§R10.3). Refazer essas contas agora e de novo quando aquele número fechar é retrabalho
> evitável — ficam marcadas como pendentes até lá.

## Premissas gerais

| Item | Premissa |
|---|---|
| Mídia | R$ 300/dia |
| Preço COD | R$ 129,90 |
| Preço antecipado/Pix | R$ 116,90 no estudo (10% off) — **revisado para R$ 110,41 (15% off)** na rodada 2 |
| Custo do produto | R$ 30,00 |
| Mix | 70% COD / 30% antecipado |
| Recusa COD | 15% |
| Agente de IA | **R$ 1,50 por conversa** (era R$ 0,80 — subiu na rodada 10, §R7.3/§R10.1) |
| Upsell / order bump | não considerado |
| Mercado | Brasil, 1 unidade por pedido |

## Contribuição por pedido, antes da mídia

| Tipo | Custos considerados | Contribuição |
|---|---|---|
| COD entregue | produto + transação 6,99% + R$ 2,49 + handling R$ 4,99 + entrega R$ 19,99 | **R$ 63,35** |
| COD recusado | produto + transação + handling R$ 4,99 + falha R$ 9,99 | **− R$ 9,99** (corrigido — ver nota acima) |
| Antecipado/Pix | sem handling e sem falha COD | **R$ 68,34** |

Média COD com 15% de recusa: ~~R$ 51,60~~ **R$ 52,35** (0,85 × 63,35 + 0,15 × −9,99;
recalculado após a correção acima). Com o mix 70/30, o estudo usa **R$ 56,62 por
pedido** — número que a correção abaixo revisa para **R$ 58,99** (com a contribuição
antecipada de 10% de desconto, antes da rodada 2 — ver a versão vigente de 15% mais abaixo).

### Correção do operador (2026-09-04)

O valor do antecipado no estudo, R$ 68,34, **não fecha** com os componentes da própria
tabela. A conta correta, confirmada pelo operador, é:

```
116,90 (preço antecipado)
− 30,00 (produto)
− 10,66 (transação: 6,99% de 116,90 = 8,17 + 2,49)
= 76,24
```

**Contribuição do antecipado: R$ 76,24.** A do COD entregue permanece **R$ 63,35**.

Isso muda os números derivados:

| | Estudo | Corrigido |
|---|---|---|
| Contribuição antecipado | R$ 68,34 | **R$ 76,24** |
| Média COD (15% recusa) | R$ 51,60 | R$ 51,60 (não muda aqui — histórico anterior à correção de 2026-09-21 do custo de recusa) |
| **Média com mix 70/30** | R$ 56,62 | **R$ 58,99** |

E, com ela, os cenários:

| Cenário | Lucro/dia (estudo) | Lucro/dia (corrigido) | 30 dias (corrigido) |
|---|---|---|---|
| Otimista | R$ 2.007,90 | **R$ 2.114,55** | R$ 63.436,50 |
| Base | R$ 1.206,60 | **R$ 1.277,70** | R$ 38.331,00 |
| Pessimista | R$ 672,40 | **R$ 719,80** | R$ 21.594,00 |

**Dúvida resolvida pelo operador (2026-09-04):** no caminho antecipado, **o frete fica por
conta da cliente**. Por isso os R$ 19,99 não entram como custo nosso, e a contribuição de
**R$ 76,24 está correta**.

> Esta seção (rodada 1) e a tabela de cenários ficam como registro histórico da conta
> daquela época — usava recusa de R$ 14,98 e desconto de 10%. A seção seguinte já traz a
> versão vigente (desconto de 15%); nenhuma das duas ainda reflete a correção da recusa
> de 2026-09-21 nos cenários de lucro — ver a nota de pendência no topo do arquivo.

### O frete do antecipado — decidido na rodada 2

**O frete fica por conta da cliente, e o desconto sobe para 15%.**

Razão: o frete do antecipado é muito variável — pode passar de R$ 30, R$ 40 e até R$ 50
conforme a região. Embutir isso no preço obrigaria a precificar pelo pior caso.

| | Com 10% | **Com 15% (vigente)** |
|---|---|---|
| Preço do produto | R$ 116,90 | **R$ 110,41** |
| Economia declarável | R$ 13,00 | **R$ 19,49** |
| Contribuição do antecipado | R$ 76,24 | **R$ 70,21** |
| Média com mix 70/30 | R$ 58,99 | ~~R$ 57,18~~ **R$ 57,71** (0,7 × 52,35 + 0,3 × 70,21 — recalculado após a correção da recusa) |
| Equilíbrio (CPL R$ 1,25) | 3,47% | **3,58%** (pendente de recálculo — ver nota no topo) |

Cenários com R$ 57,18 (pendentes de recálculo, ver nota no topo): otimista **R$ 2.033/dia**
(R$ 60.997/30d), base **R$ 1.223/dia** (R$ 36.705/30d), pessimista **R$ 684/dia**
(R$ 20.510/30d).

**O que a agente pode dizer.** A economia de R$ 19,49 é real e é sobre o produto — que é o
que a Encorpa vende. O frete é linha separada, variável e fora do controle do operador. A
única exigência é que a agente diga, **na mesma mensagem**, que o frete do antecipado é
calculado à parte no checkout. Não é ressalva moral: é proteção de conversão, porque
surpresa no checkout com esta audiência traz o medo de golpe de volta.

### Teto de frete — mecanismo encontrado, confirmação pendente

**[FATO — DOC, fonte secundária]** A Logzz tem a opção **Frete Personalizado**: o produtor
define um valor fixo de frete na criação do produto, ou oferece frete grátis. É exatamente o
teto pedido.

**Ressalva de evidência:** a citação veio de resumo de busca, não de leitura direta — a
central de ajuda da Logzz responde 404 ou redireciona e o checkout da Coinzz responde 403.
**Confirmar no painel antes de virar decisão.**

**[INFERÊNCIA]** A diferença entre o valor fixo cobrado e o custo real sai do saldo do
produtor. Não há documentação pública dizendo isso com todas as letras.

**A régua do teto.** O antecipado rende R$ 70,21 e o COD médio ~~R$ 51,60~~ **R$ 52,35** —
podemos absorver até **~R$ 17,86 por pedido** (era R$ 18,61) antes de o antecipado ficar
pior que o COD. A tabela de sensibilidade abaixo usa a contribuição do antecipado
diretamente (R$ 70,21 − absorvido) e não muda com esta correção — só a frase acima muda.

| Teto para a cliente | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorve R$ 5 → R$ 65,21 ✅ | absorve R$ 20 → R$ 50,21 ⚠️ | absorve R$ 30 → R$ 40,21 ❌ |
| R$ 15 | absorve R$ 10 → R$ 60,21 ✅ | absorve R$ 25 → R$ 45,21 ❌ | absorve R$ 35 → R$ 35,21 ❌ |

**Recomendação: teto de R$ 20** e medir. R$ 15 só se o custo real ficar concentrado abaixo
de R$ 30.

**Divergência a medir:** o operador observa frete de R$ 30 a R$ 50; a Logzz declara que o
custo total por remessa "raramente passa de R$ 25". Pode ser diferença entre o preço cobrado
da cliente e o custo para nós, ou regiões específicas.

**Outras taxas confirmadas por fonte externa:** handling fixo de **R$ 4,99** por remessa ·
Entrega Express **+R$ 5,00** por entrega concluída, cobrada só do produtor · taxa de
frustração declarada de **13% a 16%**, o que corrobora a premissa de 15% de recusa.

### 6. Cada pedido que migra de COD para antecipado vale ~R$ 17,86 a mais

Com 15% de desconto, o antecipado rende **R$ 70,21** contra **R$ 52,35** do COD já
descontada a recusa — **~R$ 17,86 a mais por pedido** (era R$ 18,61, antes da correção do
custo de recusa). E rende mais ainda na prática, porque não corre risco de recusa: o COD
só entrega R$ 63,35 em 85% das vezes, e nos outros 15% tira R$ 9,99 (era R$ 14,98).

Isso sustenta a decisão da rodada 1 de oferecer o antecipado com desconto **antes** de a
cliente finalizar. Com a ressalva que não muda: a oferta vem **depois** de o COD já estar
fechado, nunca como condição — o "não paga nada agora" é o que dissolve o medo de golpe, e
esse medo é a objeção nº 1 do público. Ver
[`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md) §Q8.

**Esses ~R$ 17,86 são o novo teto de subsídio de frete** que podemos absorver antes de
o antecipado ficar pior que o COD — é o número que decide o Frete Personalizado.

## Confirmações do operador sobre as premissas

| # | Ponto | Resposta |
|---|---|---|
| D1 | `Físico na entrega` ativo na Coinzz? | **Sim, ativo.** A recusa custa −R$ 9,99 (corrigido em 2026-09-21; era −R$ 14,98), e o modelo está correto neste ponto |
| D2 | Desconto do pagamento antecipado | **15%** — R$ 110,41 (era 10% na rodada 1; subiu porque o frete ficou com a cliente). O código (`checkout.ts` :42) ainda tem 5% e desligado, e precisa ser corrigido quando o desconto for configurado |
| D3 | "Venda" no modelo é o quê? | **Pedido criado.** A meta de 10% é conversa → pedido criado, com os 15% de recusa aplicados depois |
| D4 | Contribuição do antecipado | **R$ 76,24**, não R$ 68,34 — confirmado pelo operador. A média com mix 70/30 sobe para R$ 58,99 (número da rodada 1, com recusa de R$ 14,98 e desconto de 10% — ver notas de correção acima para os valores vigentes) |
