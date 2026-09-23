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

> ### 🚨 Correção de 2026-09-21 (2ª) — desconto do antecipado volta a 10%: R$ 116,91
>
> O operador reduziu o desconto do antecipado de **15% para 10%** no mesmo dia da correção
> anterior (abaixo). Preço: **R$ 116,91** (era R$ 110,41). Diferença de preço
> entre os dois caminhos: **R$ 12,99** (era R$ 19,49) — conta do operador, não fala da agente
> (saída A, 2026-09-22).
>
> **Duas coisas que continuam confirmadas, sem mudança:** a entrega (R$ 19,99) é custo
> nosso nos dois caminhos, igual ao COD — não é repassada à cliente com custo zero para a
> operação, ao contrário do que
> [`04-frete-e-desconto-do-antecipado.md`](../decisoes/04-frete-e-desconto-do-antecipado.md)
> parecia sugerir. **O que essa outra decisão descreve é um frete adicional, separado, que
> a cliente paga a mais no checkout** — essa cobrança não afeta a nossa contribuição,
> nem para melhor nem para pior; ela nunca entrou na conta.
>
> **Contribuição do antecipado recalculada:**
> `R$ 116,91 − 30,00 (produto) − 10,66 (transação: 6,99% de 116,91 + R$ 2,49) − 4,99
> (handling) − 19,99 (entrega) = R$ 51,27`
>
> **Isso muda a conclusão de novo.** Com 15% de desconto o antecipado rendia R$ 45,22,
> ~R$ 7,13 abaixo da média do COD (R$ 52,35). Com 10%, ele sobe para **R$ 51,27** —
> **quase empatado** com a média do COD, ~R$ 1,08 abaixo. A pendência §R10.5 (manter o
> antecipado como upsell?) fica mais fácil de decidir nesse cenário: a diferença que
> restava era pequena e agora é quase nula.

> ### ⚠️ Correção de 2026-09-21 (1ª) — o antecipado paga as mesmas taxas do COD
>
> Confirmado pelo operador: o antecipado usa a mesma estrutura de taxas do COD — produto,
> transação (6,99% + R$ 2,49), handling (R$ 4,99) **e entrega (R$ 19,99)**. A única
> diferença é que ele **não paga a taxa de entrega frustrada**, porque não existe recusa
> na porta num pagamento já feito. Isso derrubou a premissa usada desde a rodada 1 de que
> o antecipado "não paga handling nem entrega". **Os números vigentes são os da correção
> acima (2ª), com 10% de desconto** — esta caixa fica como registro do mecanismo
> descoberto, que continua valendo.
>
> Isso também mudou a **média COD com 15% de recusa** — recalculada após a correção
> separada do custo de recusa (§R10.2, R$ 9,99). **O que ainda não foi recalculado:** o
> ponto de equilíbrio em % de CPL e os cenários de lucro/dia/30 dias — a fórmula original
> desses dois não está registrada neste arquivo com detalhe suficiente para refazer com
> segurança; ficam pendentes até o operador confirmar ou repassar a conta.

## Premissas gerais

| Item | Premissa |
|---|---|
| Mídia | R$ 300/dia |
| Preço COD | R$ 129,90 |
| Preço antecipado/Pix | R$ 116,91 (**10% off** — voltou ao valor original da rodada 1 em 2026-09-21, depois de passar por 15%/R$ 110,41 na rodada 2) |
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
| COD recusado | handling R$ 4,99 + falha R$ 9,99 (produto e transação não são perdidos) | **− R$ 9,99** total |
| Antecipado/Pix (preço R$ 116,91, 10% off) | **mesma estrutura do COD entregue** — produto + transação + handling + entrega — sem taxa de frustração, porque nunca é recusado na porta | **R$ 51,27** |

Média COD com 15% de recusa: **R$ 52,35** (0,85 × 63,35 + 0,15 × −9,99). Com o mix 70/30:
**R$ 52,03** (0,7 × 52,35 + 0,3 × 51,27) — praticamente igual à média COD sozinha, porque o
antecipado agora rende quase o mesmo, em vez de puxar a média para cima ou para baixo com
força.

> As duas seções seguintes (rodada 1 e rodada 2) ficam como registro histórico das contas
> daquela época. As correções no topo do arquivo são as que valem.

### Correção do operador (2026-09-04) — histórico, ver notas no topo do arquivo

O valor do antecipado no estudo, R$ 68,34, **não fecha** com os componentes da própria
tabela. A conta feita nesta rodada foi:

```
116,90 (preço antecipado)
− 30,00 (produto)
− 10,66 (transação: 6,99% de 116,90 = 8,17 + 2,49)
= 76,24
```

**Contribuição do antecipado (histórico, superado): R$ 76,24.** A do COD entregue permanece
**R$ 63,35**.

Isso mudava os números derivados, na época:

| | Estudo | Corrigido (2026-09-04, histórico) |
|---|---|---|
| Contribuição antecipado | R$ 68,34 | R$ 76,24 |
| Média COD (15% recusa) | R$ 51,60 | R$ 51,60 |
| **Média com mix 70/30** | R$ 56,62 | R$ 58,99 |

E, com ela, os cenários da época:

| Cenário | Lucro/dia (estudo) | Lucro/dia (corrigido, histórico) | 30 dias (histórico) |
|---|---|---|---|
| Otimista | R$ 2.007,90 | R$ 2.114,55 | R$ 63.436,50 |
| Base | R$ 1.206,60 | R$ 1.277,70 | R$ 38.331,00 |
| Pessimista | R$ 672,40 | R$ 719,80 | R$ 21.594,00 |

**Dúvida da época (2026-09-04), superada em 2026-09-21:** achava-se que no antecipado o
frete ficava por conta da cliente e por isso os R$ 19,99 não entravam como custo nosso — o
que dava a contribuição de R$ 76,24. O operador corrigiu: a taxa de entrega da Logzz
(R$ 19,99) **é paga por nós do mesmo jeito que no COD** — o que não existe no antecipado é
a taxa de frustração, não a taxa de entrega em si. O frete adicional que a cliente paga à
parte no checkout é outra coisa, e não entra nesta conta (ver correção 2ª no topo).

### O frete do antecipado — decidido na rodada 2 (preço e desconto mudaram; ver correções no topo)

**O frete adicional que a cliente vê no checkout continua sendo calculado à parte** — isso
não mudou. **O desconto voltou a 10%** em 2026-09-21 (era 15%).

Razão histórica do desconto de 15%: o frete no caminho antecipado é muito variável — pode
passar de R$ 30, R$ 40 e até R$ 50 conforme a região. Embutir isso no preço obrigaria a
precificar pelo pior caso. Essa razão não se aplica mais a por que o desconto é 10% — é
uma nova decisão do operador, sem justificativa registrada aqui além da decisão em si.

| | Com 10% (rodada 1, histórico) | Com 15% (rodada 2, histórico) | **Vigente (10%, 2026-09-21)** |
|---|---|---|---|
| Preço do produto | R$ 116,90 | R$ 110,41 | **R$ 116,91** |
| Diferença de preço (conta do operador; a agente não diz) | R$ 13,00 | R$ 19,49 | **R$ 12,99** |
| Contribuição do antecipado | R$ 76,24 | R$ 70,21 / R$ 45,22 (corrigido) | **R$ 51,27** |
| Média com mix 70/30 | R$ 58,99 | R$ 57,18 / R$ 50,21 (corrigido) | **R$ 52,03** |
| Equilíbrio (CPL R$ 1,25) | 3,47% | 3,58% | **pendente de recálculo** |

Cenários de lucro/dia e 30 dias: **pendentes de recálculo** com os números vigentes — a
fórmula original não está registrada aqui com detalhe suficiente para refazer com
segurança (mesma pendência já registrada acima).

**O que a agente pode dizer sobre o preço.** O percentual e o preço do antecipado — "10% de
desconto: R$ 116,91 no antecipado" — e que o frete é calculado à parte no checkout. **Nunca a
economia em reais** (a diferença de R$ 12,99): ela é sobre o produto, e o frete adicional é
linha separada, variável e fora do controle do operador: sempre que o frete da região dela
passar de R$ 12,99, ela paga **mais** no total pelo antecipado enquanto ouviria que economiza. Isso é sobre o que a
**cliente** paga, e é diferente da taxa de entrega de R$ 19,99 que é custo **nosso** nos dois
caminhos. *Corrigido em 2026-09-22 — saída A: só o percentual.* (Este parágrafo dizia "a
economia de R$ 12,99 é real e é sobre o produto", lido como licença para a agente citá-la.)

### Teto de frete — a régua de headroom muda de novo com o desconto de 10%

**[FATO — DOC, fonte secundária]** A Logzz tem a opção **Frete Personalizado**: o produtor
define um valor fixo de frete na criação do produto, ou oferece frete grátis.

**Ressalva de evidência:** a citação veio de resumo de busca, não de leitura direta — a
central de ajuda da Logzz responde 404 ou redireciona e o checkout da Coinzz responde 403.
**Confirmar no painel antes de virar decisão.**

**Não há headroom de margem para subsidiar o frete adicional que a cliente paga no
checkout.** Isso é sobre um número diferente do que decide o subsídio: o antecipado
(R$ 51,27) está quase empatado com o COD (R$ 52,35), não sobrando — subsidiar frete a
partir daqui reduziria a contribuição do antecipado para abaixo do COD outra vez. A tabela
de sensibilidade abaixo fica como registro histórico da régua que existia quando o
antecipado rendia mais.

| Teto para a cliente (histórico, com contribuição de R$ 70,21) | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorve R$ 5 → contrib. histórica R$ 65,21 | absorve R$ 20 → R$ 50,21 | absorve R$ 30 → R$ 40,21 |
| R$ 15 | absorve R$ 10 → R$ 60,21 | absorve R$ 25 → R$ 45,21 | absorve R$ 35 → R$ 35,21 |

**Divergência a medir, ainda válida:** o operador observa frete de R$ 30 a R$ 50; a Logzz
declara que o custo total por remessa "raramente passa de R$ 25". Pode ser diferença entre
o preço cobrado da cliente e o custo para nós, ou regiões específicas.

**Outras taxas confirmadas por fonte externa, ainda válidas:** handling fixo de **R$ 4,99**
por remessa · Entrega Express **+R$ 5,00** por entrega concluída, cobrada só do produtor ·
taxa de frustração declarada de **13% a 16%**, o que corrobora a premissa de 15% de recusa.

### 6. Cada pedido que migra de COD para antecipado agora custa quase o mesmo

> Esta seção passou por duas correções no mesmo dia (2026-09-21) — ver o topo do arquivo.

Com a contribuição vigente, o antecipado rende **R$ 51,27** contra **R$ 52,35** da média do
COD (já descontada a recusa de 15%) — **~R$ 1,08 a menos por pedido**, quase um empate.
Isso é bem diferente da conta original (antecipado "R$ 17,86 a mais") e também diferente da
primeira correção do dia (antecipado "R$ 7,13 a menos"): o corte do desconto de 15% para
10% recuperou a maior parte da diferença.

**O que isso significa para a decisão de Q8 e R2.1** (oferecer o antecipado com desconto
antes do fechamento do COD, `03-decisoes-tomadas.md`): com a diferença agora tão pequena
(~R$ 1,08), o argumento econômico contra manter o antecipado como upsell praticamente some.
O antecipado continua sem risco de recusa — isso nunca mudou — e agora rende quase o mesmo
por pedido. **Esta sessão não decidiu reabrir Q8/R2.1** — mas a pendência registrada em
§R10.5 fica mais fácil de resolver a favor de manter o antecipado como está.

## Confirmações do operador sobre as premissas

| # | Ponto | Resposta |
|---|---|---|
| D1 | `Físico na entrega` ativo na Coinzz? | **Sim, ativo.** A recusa custa −R$ 9,99 (corrigido em 2026-09-21; era −R$ 14,98), e o modelo está correto neste ponto |
| D2 | Desconto do pagamento antecipado | **10%** — R$ 116,91 (voltou de 15% em 2026-09-21; era 10% na rodada 1, subiu para 15% na rodada 2, voltou a 10% agora) |
| D3 | "Venda" no modelo é o quê? | **Pedido criado.** A meta de 10% é conversa → pedido criado, com os 15% de recusa aplicados depois |
| D4 | Contribuição do antecipado | **R$ 51,27** (recalculado em 2026-09-21 com o desconto de 10% — mesmas taxas do COD, sem taxa de frustração). A média com mix 70/30 é **R$ 52,03** |
