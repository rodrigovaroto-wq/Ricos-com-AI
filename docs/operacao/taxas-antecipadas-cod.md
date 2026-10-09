# Modelo de caixa do teste e taxas adiantadas por pedido

Atualizado em 2026-10-09 com as respostas do operador. Alimenta e é alimentado pelo modelo
[`modelo-caixa-anuncios.xlsx`](modelo-caixa-anuncios.xlsx) (abas Resumo, Premissas, Fluxo diário, Taxas antecipadas,
Docs x Fontes, Perguntas). Se este texto e a planilha divergirem, vale a planilha: ela recalcula.

> **Divergência com a documentação anterior.** [`06-modelo-economico.md`](../documentacao/contexto-negocio/06-modelo-economico.md)
> usa manuseio de R$ 4,99 e devolução de R$ 25,00. O operador confirmou **manuseio R$ 5,00** (Central Logzz)
> e que a devolução custa **frete de retorno + manuseio**, mais as taxas já pagas, que não voltam.
> A recusa continua em R$ 9,99, agora lida como **R$ 4,99 (entrega frustrada) + R$ 5,00 (manuseio)**.

## 1. Resultado para o teste de L3

Verba: **7 dias de anúncio a R$ 55/dia na Copy (R$ 385), 2 dias de pausa e 7 dias a R$ 55/dia na Região (R$ 385) = R$ 770**, a partir de
**23/10/2026** (Copy 23 a 29/10, pausa 30 e 31/10, Região 1 a 7/11, leitura 8 e 9/11 — a leitura de 2 dias é assumida).
Dos R$ 2.000 do operador, **R$ 1.325 são caixa** (R$ 250 ficam de margem de segurança, sobram R$ 1.075 utilizáveis). A verba vai no
**cartão** e é paga na fatura de 29/11 com o repasse do COD, não com esse caixa: os R$ 770 (R$ 876 com o imposto da Meta) passam dos R$ 675 que
sobravam dos R$ 2.000, e a diferença sai do repasse.

| Resultado (CPL R$ 1,50, conversão 10%, mix 70% COD / 30% antecipado, 1 peça) | Valor |
|---|---:|
| Leads e pedidos criados | 513 leads e 51 pedidos (36 COD e 15 antecipado) |
| Piso de amostra (mais de 500 leads e 50 pedidos) | Passa, por pouco |
| **Pico de caixa necessário** (07/11, antes do 1º repasse em 08/11) | **R$ 828** |
| **Sobra** sobre os R$ 1.075 utilizáveis | **R$ 247** |
| Caixa acumulado volta a zero | 12/11 |
| Caixa acumulado no dia 90 (21/01/2027) | R$ 1.146 |
| Fatura da Meta (R$ 770 + 13,83% de imposto) | R$ 876 (R$ 814 vence 29/11 com saque em 27/11; R$ 63 vence 29/12) |
| Lucro esperado por venda no mix 70/30 | R$ 24,57 (R$ 26,65 sem o imposto da Meta) |
| Escala que o caixa sustenta | 1,3× (dobrar a verba falta R$ 580) |

O pico acontece **antes** de qualquer repasse: é produto, taxas e frete que saem do saldo de expedição enquanto o
COD ainda não liberou (D+2 de entrega + 14 dias = 16 dias). A fatura do cartão só vence depois do primeiro repasse,
então o anúncio é financiado pelas vendas. Se ele fosse pago no dia do gasto, o pico seria R$ 1.704.

## 2. Sensibilidade (pico / sobra / caixa no dia 90)

| Cenário | Pico | Sobra | Dia 90 |
|---|---:|---:|---:|
| Base | R$ 828 | R$ 247 | R$ 1.146 |
| Frete de retorno R$ 30 | R$ 789 | R$ 286 | R$ 1.223 |
| Frete de retorno R$ 60 | R$ 866 | R$ 209 | R$ 1.069 |
| Devolução sem perder as taxas já pagas | R$ 758 | R$ 317 | R$ 1.286 |
| Transação COD abatida do repasse | R$ 523 | R$ 552 | R$ 1.146 |
| Sem o imposto da Meta | R$ 828 | R$ 247 | R$ 1.253 |
| Recusa 12% e devolução 5% | R$ 844 | R$ 231 | R$ 1.653 |
| CPL R$ 1,25 (62 pedidos) | R$ 993 | R$ 82 | R$ 1.574 |
| CPL R$ 1,75 (44 pedidos, abaixo do piso) | R$ 709 | R$ 366 | R$ 841 |
| CPL R$ 2,00 e conversão 7% (27 pedidos, abaixo do piso) | R$ 434 | R$ 641 | R$ 100 |
| Liberação do COD em 30 dias | R$ 1.156 | −R$ 81 | R$ 1.146 |
| Dobrar a verba (R$ 1.540) | R$ 1.655 | −R$ 580 | R$ 2.408 |
| Antecipado retido 14 dias | R$ 2.318 | −R$ 1.243 | R$ 1.146 |

Menos recusa e devolução **aumentam** o pico (mais pedidos entregues, mais custo adiantado) e o lucro; CPL melhor também (mais pedidos).
Um funil pior reduz o pico e o lucro: com CPL R$ 2,00 e conversão 7% o teste quase não rende.

## 3. Taxas e custos adiantados, por pedido COD (1 peça, R$ 129,90)

Todo o caixa do operador fica no **saldo de expedição** da Logzz, e dele saem os custos do pedido quando ele vai
para "em separação" (assumido 1 dia após o pedido; se o saldo acaba, o pedido fica "saldo insuficiente").

| Item | Valor | Quando sai | De onde sai | Se o pedido falha |
|---|---:|---|---|---|
| Produto | R$ 30,00 por peça | "Em separação" (após a venda) | Saldo de expedição | Volta ao estoque, sem perda |
| Entrega concluída | R$ 19,99 | "Em separação" | Saldo de expedição | Estornada se a entrega falha |
| Manuseio | R$ 5,00 | "Em separação" | Saldo de expedição | Fica (recusa e devolução) |
| Transação (6,99% do preço + R$ 2,49 antifraude) | R$ 11,57 | Antes do repasse | Valor em caixa | Volta na recusa; **não volta na devolução** |
| **Total adiantado por pedido** | **R$ 66,56** | | | |
| Entrega frustrada | R$ 4,99 | Na recusa (~D+2) | Caixa | Só existe na recusa |
| **Custo total da recusa** | **R$ 9,99** | ~D+2 | Caixa | Logística e transação voltam |
| **Custo total da devolução** | **R$ 86,56** | Produto chega ao centro (~D+9) | Caixa | Frete de retorno R$ 45 (faixa R$ 30–60) + manuseio R$ 5 + taxas já pagas (entrega R$ 19,99, manuseio R$ 5, transação R$ 11,57) |

Liberação do dinheiro do COD: **14 dias** a partir do pagamento do cliente (Pix ou cartão), que acontece na entrega.
Sem antecipação do recebível (a Logzz cobraria 4,99%).

## 4. Pedido antecipado (R$ 116,91)

| Item | Valor | Quando sai | Observação |
|---|---:|---|---|
| Produto | R$ 30,00 | "Em separação", do saldo de expedição | Volta ao estoque na devolução |
| Manuseio | R$ 5,00 | "Em separação", do saldo de expedição | Na devolução não volta |
| Taxa Mercado Pago | R$ 3,99 | Descontada na entrada | 50% Pix (0,99% + R$ 1,00) e 50% cartão à vista (4,98%); parcelado conta como à vista; não volta no estorno |
| Entrega concluída | — | Não existe no antecipado | Suporte Logzz/Coinzz, 29/09 |
| **Custo total da devolução** | **R$ 58,99** | Produto chega ao centro (~D+9) | Frete R$ 45 + manuseio de retorno R$ 5 + manuseio original R$ 5 + taxa do Mercado Pago R$ 3,99; o preço é devolvido à cliente |

O dinheiro do antecipado está disponível **na hora** (operador, no site e na conta, 2026-10-09).

## 5. Anúncios e custos do sistema: tudo no cartão de crédito

Fatura do cartão: **fecha dia 22 e vence dia 29** (limite R$ 4.000). Para pagar, o operador saca do saldo da Logzz
para a conta (taxa R$ 3,99 por saque, 1 por fatura; o dinheiro cai em D+1 a D+2, então o saque sai 2 dias antes).

| Item | Valor | Quando entra no cartão | Quando sai do caixa |
|---|---|---|---|
| Anúncio Meta | verba + 13,83% de imposto ("deve aparecer" — conferir na 1ª fatura) | A cada R$ 100 acumulados ou no fim do mês; o saldo menor que R$ 100 cai na fatura do mês seguinte | 2 dias antes do vencimento da fatura em que caiu |
| API de IA (Meta) | R$ 0,27 por lead | A cada R$ 20 acumulados ou no fim do mês | idem |
| WhatsApp (template UTILITY) | R$ 0,04 por pedido | Dia 1 do mês seguinte | idem |
| PikaPods + número WhatsApp | R$ 18,50 + R$ 35,00 por mês | Dia 1 | idem |

Imposto do Simples: fora do modelo por ora (operador).

## 6. Premissas do funil (não medidas)

CPL R$ 1,50, conversão lead → pedido 10%, IA R$ 0,27 por lead (p50 medido), recusa 17% e devolução 10% (pontas pessimistas
das faixas de 02/10; recusa e devolução ainda sem medida), 100% dos pedidos de 1 peça, mix 70% COD / 30% antecipado,
entrega do COD em 2 dias (D+1 a D+3), produto devolvido chega em 7 dias sem perda.

## 7. O que ainda não está confirmado

1. Imposto da Meta (13,83%): o operador "não sabe", disse para assumir que aparece. Conferir na 1ª fatura.
2. Frete de retorno real (modelo usa R$ 45, meio da faixa R$ 30–60). Medir nas primeiras devoluções.
3. Transação do COD: o operador confirmou que sai antes do repasse; o momento exato (pedido ou separação) é assumido.
4. **Piso de amostra.** mais de 500 leads e mais de 50 pedidos. Com R$ 770 (R$ 55/dia por 7 dias em cada fase) e CPL R$ 1,50 saem 513 leads e 51 pedidos: passa por pouco. Com CPL R$ 1,75 são 440 leads e 44 pedidos (abaixo do piso); com CPL R$ 1,25, 616 leads e 62 pedidos (passa, mas o pico sobe para R$ 993 e a sobra cai para R$ 82). O operador confirmou em 2026-10-09 que o plano de 7 dias a R$ 55/dia
   (R$ 770) e o caixa de R$ 1.325 substituem a verba e o caixa de L3 (R$ 500 e R$ 1.500); ver
   [`09-pipeline-ate-producao.md`](../agente-ia/05-plano/09-pipeline-ate-producao.md) L3.1 e L3.2.
5. A verba (R$ 770, R$ 876 com imposto) é maior que os R$ 675 que sobravam dos R$ 2.000; o modelo a paga com o repasse do COD na fatura de 29/11.

Fontes: [Central Logzz — taxas, prazos e condições](https://ajuda.logzz.com.br/artigos/taxas-prazos-e-condicoes-da-logzz),
[blog Coinzz — pagamento na entrega](https://blog.coinzz.com.br/visao-geral/plataforma/como-fazer-vendas-com-pagamento-na-entrega-cash-on-delivery-cod-pela-coinzz/),
[Tecnoblog — imposto da Meta](https://tecnoblog.net/noticias/meta-decide-repassar-os-custos-com-impostos-no-brasil-para-os-anunciantes/),
[Meta — preços do WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md).
