# Produto e oferta

Fonte: `colet-cinta-modeladora` — `docs/contexto-do-projeto.md` §1 e §2,
`src/config/business.ts`, `src/lib/checkout.ts`, `src/components/landing/`.

## A oferta, em números

| | |
|---|---|
| Marca | **Encorpa** |
| Produto | Colete Cinta Modeladora |
| Tamanhos | P, M, G, GG, XGG (`SizeSelector.tsx` :5) |
| Preço | **R$ 129,90**, frete embutido |
| Pagamento | Na entrega (COD) — dinheiro, cartão ou maquininha, direto com o entregador |
| Prazo | **1 a 3 dias** no COD, com o dia escolhido pela cliente dentro do checkout; no antecipado **varia por região, em média 5 dias úteis** (`prepayAvgDays`) |
| Frete | **Grátis no pagamento na entrega** (R15.3, 2026-09-28): ela paga R$ 129,90 e mais nada; a agente diz isso nomeando o caminho ("Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber."). **No antecipado não é grátis:** calculado por região dentro do checkout, e a agente não sabe nem cita o valor. *Histórico: de 09/09 a 22/09 esta tabela dizia "grátis nos dois caminhos"; de 22/09 a 28/09, "não há frete grátis".* |
| Garantia | 7 dias contando do recebimento; na devolução o frete é por conta da loja (R16.3, 2026-09-29) |
| Troca de tamanho | **R$ 27,00 fixo por troca, cobrado da cliente** (operador, 2026-09-29) — não varia por região nem por número de peças; pago por link do Mercado Pago, fora da Coinzz/Logzz (R17.1). A devolução segue sem custo para ela (R16.3). A agente nunca diz que a troca é grátis. |
| Fornecedor / logística | Logzz |
| Checkout | Entrega: Logzz (desde 2026-09-25). Antecipado: Coinzz (com Omnicash) |
| Site | www.encorpa-fashion.com.br |
| WhatsApp | `5511916616348` (`src/config/business.ts`) |
| E-mail | contato@encorpa-fashion.com.br |

## O que o produto faz — e o que não faz

Metade das decisões de copy depende disso, e é regra dura, não estilo.

**Faz:** modela enquanto está vestido · muda o caimento da roupa na hora · é discreto
por baixo do tecido · dá apoio de postura.

**Não faz: não emagrece.** O efeito acaba quando ela tira.

O site diz isso em voz alta no FAQ, de propósito: a resposta honesta compra
credibilidade para o resto e derruba devolução de quem compraria esperando outra coisa.
**O agente não pode reverter isso.**

A frase que mantém desejo e honestidade compatíveis, e que vale como orientação de tom:

> **O colete não muda o seu corpo. Muda como a roupa cai nele.**

## Desconto de pagamento antecipado — 10%

**Vigente desde 2026-09-21: o desconto é de 10%**, levando o preço do produto a **R$ 116,91**
e a diferença entre os dois preços a **R$ 12,99** (conta do operador — a agente não diz
esse número; ver abaixo). Passou por 15% (R$ 110,41) na rodada 2, decidido em
2026-09-05, e voltou a 10% — ver
[`06-modelo-economico.md`](06-modelo-economico.md) e
[`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md) §R2.1.

**O código diverge.** `colet/src/lib/checkout.ts` :42–49 tem `PREPAY_DISCOUNT` com
`percent: 5` e `enabled: false`. Precisa virar 10% e ser ligado **só depois** de o desconto
existir na Coinzz — o comentário no próprio código explica por quê: ligar antes repetiria o
erro da promessa que a operação não cumpre.

**Enquanto a flag estiver desligada, o agente não pode oferecer o desconto.**
Ver [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md) §D2.

**Frete no antecipado: por conta da cliente.** É o que diferencia os dois caminhos: no COD
o frete está embutido nos R$ 129,90; no antecipado ela paga **R$ 116,91 mais o frete**,
calculado por região no checkout — a agente nunca sabe o valor e não cita número. A agente
**não** diz a economia em reais (a diferença entre os dois preços): diz o percentual e o
preço do antecipado — "10% de desconto: R$ 116,91 no antecipado" — e que o frete vem à parte.
*Corrigido em 2026-09-22 — saída A: só o percentual.* (Até aqui valia a saída C: "pode dizer
que ela economiza R$ 12,99 no produto, desde que diga na mesma mensagem que o frete vem à
parte".) Ver [`06-modelo-economico.md`](06-modelo-economico.md).

## O que chega na casa dela

Fonte: `src/components/landing/WhatsInBox.tsx` :5–8.

- 1 Colete Cinta Modeladora, no tamanho escolhido, embalado com proteção
- Guia de uso e cuidados — como vestir, ajustar e lavar sem estragar o tecido
- Embalagem 100% discreta — não diz o que tem dentro
- Aviso no WhatsApp quando o pedido sai para entrega, e de novo na véspera

> A última linha é uma **promessa já publicada no site**. Hoje ela depende de alguém
> lembrar de avisar. É uma das razões de o agente existir.
