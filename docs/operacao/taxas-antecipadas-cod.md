# Taxas e custos adiantados por pedido (Logzz / Coinzz / Mercado Pago / Meta)

Atualizado em 2026-10-09 (2ª rodada) com as respostas do operador. Alimenta o modelo de caixa
[`modelo-caixa-anuncios.xlsx`](modelo-caixa-anuncios.xlsx) (aba "Taxas antecipadas"). Valores de 1 peça: COD R$ 129,90 e antecipado R$ 116,91.

> **Divergência com a documentação anterior.** [`06-modelo-economico.md`](../documentacao/contexto-negocio/06-modelo-economico.md)
> usa manuseio de R$ 4,99. O operador confirmou **R$ 5,00** em 2026-10-09 (central de ajuda da Logzz).
> O custo total da recusa continua R$ 9,99, agora lido como **R$ 4,99 (entrega frustrada) + R$ 5,00 (manuseio)**.
> Quem decidir atualizar o 06 deve repassar o R$ 0,01 a mais por pedido.

## Pagamento na entrega (COD)

| Item | Valor | Quando sai | De onde sai | Se o pedido falha |
|---|---:|---|---|---|
| Produto | R$ 30,00 por peça | "Em separação" (após a venda) | Saldo de expedição | Volta ao estoque, sem perda |
| Entrega concluída | R$ 19,99 | "Em separação" (~1 dia após o pedido) | Saldo de expedição | Estornada se a entrega falha |
| Manuseio | R$ 5,00 | "Em separação" | Saldo de expedição | Fica (recusa e devolução) |
| Transação (6,99% do preço + R$ 2,49 antifraude) | R$ 11,57 | Antes do repasse (operador, 2026-10-09) | Valor em caixa / saldo | Volta na recusa; **não volta na devolução** |
| Entrega frustrada | R$ 4,99 | Na recusa (~D+2) | Caixa do operador | Só existe na recusa |
| **Custo total da recusa** | **R$ 9,99** | ~D+2 | Caixa | Logística e transação voltam |
| **Custo total da devolução** | **R$ 86,56**: frete de retorno R$ 45 (faixa R$ 30–60) + manuseio R$ 5 + taxas já pagas que não voltam (entrega R$ 19,99, manuseio R$ 5, transação R$ 11,57) | Produto chega ao centro (~D+9) | Caixa / saldo | Produto volta ao estoque |
| Saque | R$ 3,99 por saque | Dia do saque (1 por mês) | Caixa | — |

Liberação do dinheiro do COD: **14 dias** a partir do pagamento do cliente (que acontece na entrega).

## Antecipado

| Item | Valor | Quando sai | Observação |
|---|---:|---|---|
| Produto | R$ 30,00 | "Em separação" (após a venda), do saldo de expedição | Volta ao estoque na devolução |
| Manuseio | R$ 5,00 | "Em separação", do saldo de expedição | Na devolução não volta |
| Taxa Mercado Pago | R$ 3,99 | Descontada na entrada | 50% Pix (0,99% + R$ 1,00) e 50% cartão à vista (4,98%); não volta no estorno |
| Entrega concluída | — | Não existe no antecipado | Confirmado pelo suporte Logzz/Coinzz em 2026-09-29 |

Dinheiro disponível na hora (operador, 2026-10-09).

## Anúncios e custos do sistema

| Item | Valor | Quando sai |
|---|---|---|
| Anúncio Meta | verba + 13,83% de imposto repassado | Fatura do cartão (fecha dia 22, vence dia 29). A Meta cobra a cada R$ 100 e no fim do mês |
| IA + WhatsApp | R$ 0,27 por lead + R$ 0,04 por pedido | Dia 1 do mês seguinte |
| PikaPods + número WhatsApp | R$ 18,50 + R$ 35,00 por mês | Dia 1 |

## Devolução do antecipado

R$ 58,99: frete de retorno R$ 45 + manuseio de retorno R$ 5 + manuseio original R$ 5 + taxa do Mercado Pago R$ 3,99 (o preço é devolvido à cliente).

## O que ainda não está confirmado

1. Antifraude: o operador escreveu R$ 2,99; a Central e os docs dizem R$ 2,49 (o modelo usa R$ 2,49).
2. Frete de retorno real (modelo usa R$ 45, meio da faixa R$ 30–60).
3. Se o manuseio é cobrado duas vezes na devolução (original e de retorno).
4. De onde saem fixos, IA, WhatsApp e saque, já que o caixa fica no saldo de expedição, e se o repasse recarrega o saldo sem taxa de saque.

Fontes: [Central Logzz — taxas, prazos e condições](https://ajuda.logzz.com.br/artigos/taxas-prazos-e-condicoes-da-logzz),
[blog Coinzz — pagamento na entrega](https://blog.coinzz.com.br/visao-geral/plataforma/como-fazer-vendas-com-pagamento-na-entrega-cash-on-delivery-cod-pela-coinzz/),
[Tecnoblog — imposto da Meta](https://tecnoblog.net/noticias/meta-decide-repassar-os-custos-com-impostos-no-brasil-para-os-anunciantes/).
