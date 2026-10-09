---
name: modelo-de-caixa-do-teste
description: Caixa do teste de L3 (R$ 675 de verba no cartão, R$ 1.325 em caixa, 23/10): produto e taxas do COD saem do saldo de expedição, o resto no cartão (fecha 22, vence 29); devolução = frete + manuseio + taxas já pagas (R$ 86,56 COD). Pico R$ 879, sobra R$ 196.
metadata:
  type: business-rule
---

Operador, 2026-10-09 (R19.1, grafo §67). A conta mora em `docs/operacao/taxas-antecipadas-cod.md` e na planilha
`docs/operacao/modelo-caixa-anuncios.xlsx` (premissas editáveis, fluxo de 90 dias). Três coisas que não saem de ler o código:

- **O pico de caixa vem antes do primeiro repasse do COD** (dia 14 de 90, 05/11), e não do anúncio: produto, entrega concluída,
  manuseio e transação saem do saldo de expedição quando o pedido vai para "em separação"; o repasse do COD vem 14 dias depois
  do pagamento na porta. Anúncio, API de IA, WhatsApp e fixos vão para o cartão (fatura fecha dia 22, vence dia 29) e o operador
  paga sacando do saldo (R$ 3,99, D+1 a D+2) — por isso o anúncio é financiado pelas vendas.
- **Devolução não é R$ 25,00.** É frete de retorno (R$ 30–60) + manuseio **e** as taxas já pagas não voltam: R$ 86,56 no COD,
  R$ 58,99 no antecipado, com frete de R$ 45. Recusa continua R$ 9,99 = R$ 4,99 de entrega frustrada + R$ 5,00 de manuseio.
  Manuseio é R$ 5,00 (Central Logzz), não R$ 4,99.
- **R$ 675 e R$ 1.325 substituem a verba (R$ 500) e o caixa (R$ 1.500) de L3** (operador, 09/10). Com CPL R$ 1,50 são 450 leads e 45 pedidos, abaixo do piso de 500 leads / 50 pedidos; passa com CPL perto de R$ 1,25 (pico sobe para R$ 1.055, sobra R$ 20) ou com ~R$ 755 de verba (pico R$ 984, sobra R$ 91).
- **Menos recusa e devolução aumentam o pico** (mais pedidos entregues, mais custo adiantado), e dobrar a verba falta R$ 684.
