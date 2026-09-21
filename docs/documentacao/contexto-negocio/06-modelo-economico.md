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

> ### 🚨 Correção de 2026-09-21 — o antecipado paga as mesmas taxas do COD, e rende MENOS
>
> Confirmado pelo operador: o antecipado usa **exatamente a mesma estrutura de taxas do
> COD** — produto, transação (6,99% + R$ 2,49), handling (R$ 4,99) **e entrega (R$ 19,99)**.
> A única diferença é que ele **não paga a taxa de entrega frustrada**, porque não existe
> recusa na porta num pagamento já feito.
>
> Isso derruba a premissa usada desde a rodada 1 de que o antecipado "não paga handling
> nem entrega" — premissa que gerava R$ 70,21 de contribuição. Recalculado com a fórmula
> correta (idêntica à do COD entregue, só trocando o preço para R$ 110,41 e sem taxa de
> frustração): **contribuição do antecipado = R$ 45,22**.
>
> **Isso inverte a conclusão estratégica de Q8 e R2.1** (`03-decisoes-tomadas.md`): o
> antecipado deixa de ser "R$ 17,86 a mais por pedido" e passa a ser **~R$ 7,13 a menos**
> que a média do COD (R$ 52,35). Oferecer o antecipado como upsell antes do fechamento —
> decisão vigente desde a rodada 1 — perde o argumento econômico que a sustentava. Ver
> §6 abaixo e §R10.5 em [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md)
> — **essa decisão pode precisar ser reaberta com o operador**, e esta sessão não a reabriu
> sozinha.
>
> Isso também muda a **média COD com 15% de recusa** — recalculada após a correção separada
> do custo de recusa (§R10.2, R$ 9,99). **O que ainda não foi recalculado:** o ponto de
> equilíbrio em % de CPL e os cenários de lucro/dia/30 dias — a fórmula original desses dois
> não está registrada neste arquivo com detalhe suficiente para refazer com segurança; ficam
> pendentes até o operador confirmar ou repassar a conta.

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
| COD recusado | handling R$ 4,99 + falha R$ 9,99 (produto e transação não são perdidos) | **− R$ 9,99** total (corrigido — ver nota acima) |
| Antecipado/Pix (preço R$ 110,41) | **mesma estrutura do COD entregue** — produto + transação + handling + entrega — sem taxa de frustração, porque nunca é recusado na porta | **R$ 45,22** (corrigido — ver nota acima) |

Média COD com 15% de recusa: **R$ 52,35** (0,85 × 63,35 + 0,15 × −9,99). Com o mix 70/30 e
a contribuição corrigida do antecipado: **R$ 50,21** (0,7 × 52,35 + 0,3 × 45,22) — **abaixo**
da média COD sozinha, porque o antecipado agora puxa a média para baixo em vez de para cima.

> As duas seções seguintes (rodada 1 e rodada 2) ficam como registro histórico das contas
> daquela época — ambas assumiam que o antecipado não pagava handling nem entrega. A
> correção de 2026-09-21 no topo do arquivo é a que vale.

### Correção do operador (2026-09-04) — histórico, ver nota no topo do arquivo

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
que dava a contribuição de R$ 76,24. O operador corrigiu: o frete até é calculado à parte no
checkout (isso não muda), mas a taxa de entrega da Logzz (R$ 19,99) **é paga por nós do
mesmo jeito que no COD** — o que não existe no antecipado é a taxa de frustração, não a taxa
de entrega em si.

### O frete do antecipado — decidido na rodada 2 (preço e desconto continuam valendo; contribuição, não)

**O frete continua sendo calculado à parte no checkout, e o desconto continua em 15%.** Isso
não muda com a correção de 2026-09-21 — o que muda é só a contribuição por pedido.

Razão do desconto: o frete no caminho antecipado é muito variável — pode passar de R$ 30,
R$ 40 e até R$ 50 conforme a região. Embutir isso no preço obrigaria a precificar pelo pior
caso.

| | Com 10% | Com 15% (histórico) | **Corrigido 2026-09-21** |
|---|---|---|---|
| Preço do produto | R$ 116,90 | R$ 110,41 | R$ 110,41 (não muda) |
| Economia declarável | R$ 13,00 | R$ 19,49 | R$ 19,49 (não muda) |
| Contribuição do antecipado | R$ 76,24 | R$ 70,21 | **R$ 45,22** |
| Média com mix 70/30 | R$ 58,99 | R$ 57,18 | **R$ 50,21** |
| Equilíbrio (CPL R$ 1,25) | 3,47% | 3,58% | **pendente de recálculo** |

Cenários com R$ 57,18 (histórico, superado — pendente novo cálculo com R$ 50,21): otimista
R$ 2.033/dia (R$ 60.997/30d), base R$ 1.223/dia (R$ 36.705/30d), pessimista R$ 684/dia
(R$ 20.510/30d).

**O que a agente pode dizer sobre o preço continua valendo.** A economia de R$ 19,49 é real
e é sobre o produto — que é o que a Encorpa vende. O frete é linha separada, variável e fora
do controle do operador, calculado à parte no checkout. Isso é sobre o que a **cliente** paga
e não muda com esta correção, que é sobre o que **a operação** recebe de contribuição.

### Teto de frete — a lógica original não se sustenta mais

**[FATO — DOC, fonte secundária]** A Logzz tem a opção **Frete Personalizado**: o produtor
define um valor fixo de frete na criação do produto, ou oferece frete grátis.

**Ressalva de evidência:** a citação veio de resumo de busca, não de leitura direta — a
central de ajuda da Logzz responde 404 ou redireciona e o checkout da Coinzz responde 403.
**Confirmar no painel antes de virar decisão.**

**A régua do teto, como estava desenhada, não existe mais.** Ela partia de "o antecipado
rende R$ 70,21, mais que o COD (R$ 52,35), então há R$ 17,86 de headroom para subsidiar
frete". Com a contribuição corrigida (R$ 45,22), **o antecipado já rende menos que o COD
sem nenhum subsídio** — subsidiar frete só pioraria a conta. A tabela de sensibilidade
abaixo fica como registro histórico; a recomendação de teto de R$ 20 não se aplica mais
até o operador decidir se ainda quer oferecer subsídio de frete, e com que objetivo (não
seria mais margem — seria conversão pura, pago do próprio bolso do produtor).

| Teto para a cliente (histórico) | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorve R$ 5 → contrib. histórica R$ 65,21 | absorve R$ 20 → R$ 50,21 | absorve R$ 30 → R$ 40,21 |
| R$ 15 | absorve R$ 10 → R$ 60,21 | absorve R$ 25 → R$ 45,21 | absorve R$ 35 → R$ 35,21 |

**Divergência a medir, ainda válida:** o operador observa frete de R$ 30 a R$ 50; a Logzz
declara que o custo total por remessa "raramente passa de R$ 25". Pode ser diferença entre
o preço cobrado da cliente e o custo para nós, ou regiões específicas.

**Outras taxas confirmadas por fonte externa, ainda válidas:** handling fixo de **R$ 4,99**
por remessa · Entrega Express **+R$ 5,00** por entrega concluída, cobrada só do produtor ·
taxa de frustração declarada de **13% a 16%**, o que corrobora a premissa de 15% de recusa.

### 6. Cada pedido que migra de COD para antecipado vale ~R$ 7,13 a MENOS, não a mais

> Esta seção inverte a conclusão da rodada 1/2, que dizia o oposto. Ver a correção no topo
> do arquivo.

Com a contribuição corrigida, o antecipado rende **R$ 45,22** contra **R$ 52,35** da média
do COD (já descontada a recusa de 15%) — **~R$ 7,13 a menos por pedido**, não a mais.

**O que isso significa para a decisão de Q8 e R2.1** (oferecer o antecipado com desconto
antes do fechamento do COD, `03-decisoes-tomadas.md`): o argumento econômico que sustentava
essa decisão — "o antecipado rende mais e não corre risco de recusa" — **não é mais
verdadeiro pela metade que é mensurável**. O antecipado continua sem risco de recusa (isso
não mudou), mas rende menos por pedido mesmo assim. Continua fazendo sentido como **saída**
para quando o COD não está disponível na região (isso não tem alternativa), mas oferecê-lo
como **upsell voluntário** quando o COD já fechou passa a ser uma escolha que troca margem
por outra coisa — talvez fluxo de caixa antecipado, talvez menor exposição a recusa que
ainda carrega custo indireto (tempo do agente, atrito de cobrança) que o modelo não
captura. **Esta sessão não decidiu isso — fica registrado para o operador decidir**, ver
§R10.5 em [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md).

## Confirmações do operador sobre as premissas

| # | Ponto | Resposta |
|---|---|---|
| D1 | `Físico na entrega` ativo na Coinzz? | **Sim, ativo.** A recusa custa −R$ 9,99 (corrigido em 2026-09-21; era −R$ 14,98), e o modelo está correto neste ponto |
| D2 | Desconto do pagamento antecipado | **15%** — R$ 110,41 (era 10% na rodada 1; subiu porque o frete ficou com a cliente). O código (`checkout.ts` :42) ainda tem 5% e desligado, e precisa ser corrigido quando o desconto for configurado |
| D3 | "Venda" no modelo é o quê? | **Pedido criado.** A meta de 10% é conversa → pedido criado, com os 15% de recusa aplicados depois |
| D4 | Contribuição do antecipado | **R$ 45,22** (corrigido em 2026-09-21 — mesmas taxas do COD, sem taxa de frustração; era R$ 70,21/R$ 76,24). A média com mix 70/30 cai para **R$ 50,21** |
