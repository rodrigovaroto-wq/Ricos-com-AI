# Base de conhecimento do agente

**Copy validada em tráfego pago**, transcrita fielmente do código da landing page. Não
parafrasear ao usar: estes textos já passaram por gente real decidindo se compra.

Fonte: `colet-cinta-modeladora/src/components/landing/`. Quando a LP mudar, este arquivo
precisa mudar junto — **duas verdades divergem em silêncio.**

---

## Objeções — os quatro argumentos de segurança

Fonte: `Objection.tsx` :10–13. Contexto da seção: *"Faz sentido. Tem golpe demais por aí,
e não existe texto que prove que a gente é diferente. Então a gente não pede pra você
acreditar."*

| # | Objeção que responde | Título | Texto |
|---|---|---|---|
| 1 | "e se for golpe / e se eu pagar e não chegar" | **O dinheiro só sai na entrega** | Sem cadastro e sem cartão para fazer o pedido. Você paga na porta de casa. |
| 2 | "e se não for o que eu esperava" | **Você vê antes de pagar** | O colete chega na sua mão. Não é o que você esperava? Não fica com ele. |
| 3 | "e se não servir" | **7 dias pra trocar** | Contando da data em que você recebeu. Errou o tamanho ou não gostou, a gente troca ou devolve o valor. |
| 4 | "vou falar com um robô" | **WhatsApp com gente de verdade** | Não é robô. Se der qualquer problema, tem alguém do outro lado. |

> ⚠️ **A objeção 4 fica estranha vinda de um agente de IA.** É um conflito real entre a
> promessa publicada e o canal novo, e está registrado como decisão em aberto — ver
> [`../../documentacao/decisoes/02-decisoes-em-aberto.md`](../../documentacao/decisoes/02-decisoes-em-aberto.md).

## Perguntas frequentes — as quatro respostas

Fonte: `FAQ.tsx` :11–26.

**1. Dá pra usar por baixo da roupa sem aparecer?**
> Dá. O tecido é liso e fininho, então não marca nem faz volume. Funciona embaixo de
> camiseta, de vestido justo e de calça social, inclusive nas mais claras, que é onde
> costuma aparecer.

**2. E se eu errar o tamanho?**
> Tem uma tabela de medidas logo acima, junto do preço. Meça a cintura, compare e
> escolha. Ficou na dúvida entre dois? Pegue o maior. E se mesmo assim não servir, chame
> no WhatsApp. Você tem 7 dias contando de quando recebeu.

**3. Como funciona esse pagamento na entrega?**
> Você faz o pedido agora sem pagar nada e sem informar cartão. O entregador leva o
> colete até a sua casa e você paga na hora, direto para ele. Costuma chegar de 3 a 5
> dias, e a entrega é agendada, então você fica sabendo o dia.

**4. O colete emagrece?**
> Não. É melhor você saber agora do que descobrir depois de comprar. Ele modela enquanto
> está vestido: aperta na medida certa e muda o caimento da roupa na hora. O efeito
> aparece na mesma hora e acaba quando você tira.

## Como funciona a entrega — os três passos

Fonte: `HowItWorks.tsx` :4–6.

1. **Você faz o pedido** — Escolha o tamanho, informe o endereço e pronto. Sem cartão e sem pagar nada agora.
2. **Recebe no seu endereço** — A gente envia e avisa o dia da entrega. Você não fica em casa esperando sem saber.
3. **Paga na entrega** — O entregador chega, você vê o produto e paga na hora. Não gostou? Não fica com ele.

## O que chega na caixa

Fonte: `WhatsInBox.tsx` :5–8.

- **1 Colete Cinta Modeladora** — no tamanho que você escolheu, embalado com proteção
- **Guia de uso e cuidados** — como vestir, como ajustar e como lavar sem estragar o tecido
- **Embalagem 100% discreta** — a embalagem não diz o que tem dentro. Ninguém precisa saber além de você
- **Aviso no WhatsApp** — a gente te chama quando o pedido sai para entrega, e de novo na véspera

## Comparação com as alternativas

Fonte: `Comparison.tsx` :8–16. Colunas: Colete (nosso) · Faixa · Cinta.

| Característica | Colete | Faixa | Cinta |
|---|---|---|---|
| Discreto | sim | mais ou menos | não |
| Confortável | sim | mais ou menos | não |
| Fácil de vestir | sim | mais ou menos | mais ou menos |
| Respira bem | sim | não | não |
| Segura a postura | sim | não | mais ou menos |

## Prova social

Fonte: `Testimonials.tsx` :4–7. **São reconstruções** (ver
[`../../documentacao/contexto-negocio/05-decisoes-firmes.md`](../../documentacao/contexto-negocio/05-decisoes-firmes.md) §7) —
o agente pode usar o argumento, não deve apresentá-los como depoimento verificado nem
inventar novos.

- **Bruna A., São Paulo, SP** — *"Vesti e a roupa já ficou outra no corpo. Comprei desconfiada, mas só paguei quando chegou. Vou pedir o segundo."*
- **Renata S., Rio de Janeiro, RJ** — *"Tinha medo de cair em golpe. Como só paguei na porta de casa, arrisquei. Chegou rápido e a barriga sumiu embaixo da blusa."*
- **Patricia C., Fortaleza, CE** — *"Uso embaixo da calça, do vestido, de tudo. Não precisa mudar nada no guarda-roupa, só colocar por baixo."*
- **Juliana M., Porto Alegre, RS** — *"Uso debaixo do uniforme o dia inteiro e ninguém nunca percebeu. E não incomoda, isso foi o que mais me surpreendeu."*

Nota social usada no site: **4.9** · volume: **500+** vendas.

## Fecho de desejo

Fonte: `Moments.tsx` :53–54 e `Offer.tsx`.

> O colete não muda o seu corpo. **Muda como a roupa cai nele.**

> Um colete só, e ele serve pra tudo que já está no seu armário: calça, vestido, blusa.
> Veste por baixo e a roupa assenta diferente.

> A roupa caindo do jeito que você queria, sem arriscar um centavo antes de ver o colete.
