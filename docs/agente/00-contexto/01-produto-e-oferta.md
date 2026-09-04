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
| Prazo | 7 a 14 dias, dependendo da cidade; **entrega agendada** |
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

## Desconto de pagamento antecipado — desligado

`src/lib/checkout.ts` :42–49 tem `PREPAY_DISCOUNT` com `enabled: false`, 5% sobre
R$ 129,90. O comentário no próprio código explica: ligar antes de a Coinzz configurar o
desconto repetiria o erro da promessa que a operação não cumpre.

**O agente não pode oferecer esse desconto enquanto a flag estiver desligada.**

## O que chega na casa dela

Fonte: `src/components/landing/WhatsInBox.tsx` :5–8.

- 1 Colete Cinta Modeladora, no tamanho escolhido, embalado com proteção
- Guia de uso e cuidados — como vestir, ajustar e lavar sem estragar o tecido
- Embalagem 100% discreta — não diz o que tem dentro
- Aviso no WhatsApp quando o pedido sai para entrega, e de novo na véspera

> A última linha é uma **promessa já publicada no site**. Hoje ela depende de alguém
> lembrar de avisar. É uma das razões de o agente existir.
