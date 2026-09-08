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
| Prazo | **1 a 3 dias** no COD, com o dia escolhido pela cliente dentro do checkout; **5 a 10 dias úteis** no antecipado, onde o frete continua sendo cobrado à parte por região (R9.3, conferido num pedido real em 2026-09-08) |
| Garantia | 7 dias contando do recebimento |
| Fornecedor / logística | Logzz |
| Checkout | Coinzz (com Omnicash) |
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

## Desconto de pagamento antecipado — 15%, ainda não configurado

**Decidido em 2026-09-05: o desconto é de 15%**, levando o preço do produto a **R$ 110,41**
e a economia declarável a **R$ 19,49**. Subiu de 10% para 15% porque **o frete no caminho
antecipado fica por conta da cliente** — ver
[`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md) §R2.1.

**O código diverge.** `colet/src/lib/checkout.ts` :42–49 tem `PREPAY_DISCOUNT` com
`percent: 5` e `enabled: false`. Precisa virar 10% e ser ligado **só depois** de o desconto
existir na Coinzz — o comentário no próprio código explica por quê: ligar antes repetiria o
erro da promessa que a operação não cumpre.

**Enquanto a flag estiver desligada, o agente não pode oferecer o desconto.**
Ver [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md) §D2.

**Frete no antecipado: por conta da cliente.** É o que diferencia os dois caminhos: no COD
o frete está embutido nos R$ 129,90; no antecipado ela paga **R$ 110,41 mais o frete**,
calculado no checkout. A agente **pode** dizer que ela economiza R$ 19,49 no produto, desde
que diga na mesma mensagem que o frete vem à parte. Ver
[`06-modelo-economico.md`](06-modelo-economico.md).

## O que chega na casa dela

Fonte: `src/components/landing/WhatsInBox.tsx` :5–8.

- 1 Colete Cinta Modeladora, no tamanho escolhido, embalado com proteção
- Guia de uso e cuidados — como vestir, ajustar e lavar sem estragar o tecido
- Embalagem 100% discreta — não diz o que tem dentro
- Aviso no WhatsApp quando o pedido sai para entrega, e de novo na véspera

> A última linha é uma **promessa já publicada no site**. Hoje ela depende de alguém
> lembrar de avisar. É uma das razões de o agente existir.
