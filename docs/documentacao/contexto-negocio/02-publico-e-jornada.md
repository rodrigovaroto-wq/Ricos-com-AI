# Público e jornada

Fonte: `colet-cinta-modeladora` — `docs/contexto-do-projeto.md` §1,
`docs/funil-e-jornada.md`, `src/components/landing/Moments.tsx`.

## Quem é ela

Mulheres de 20 a 50 anos, inseguras com o próprio corpo, presentes no Instagram.

**O medo dominante na hora da compra não é o preço — é cair em golpe.** Isso reordena
tudo: prova social vem antes da oferta, o preço só aparece depois de o medo ser nomeado,
e "tem gente de verdade do outro lado" vale mais que qualquer adjetivo sobre o produto.

## Os três momentos que ela reconhece

Copy validada em tráfego pago (`Moments.tsx` :13–22). É a taxonomia de dor do agente —
quando ela descrever a situação dela, provavelmente é uma destas:

1. **A roupa que ficou no cabide** — *"Você amou na loja, comprou, e hoje ela só sai do
   armário quando não tem ninguém em casa. Não é você que está errada. É o caimento."*
2. **O dia inteiro se ajeitando** — *"Puxa a blusa, cruza o braço na foto, senta de um
   jeito que disfarça. Já virou automático, e você nem repara mais que está fazendo."*
3. **A foto que você não postou** — *"Todo mundo saiu bem. Você olhou, guardou o celular
   e não postou. E aquela sensação ficou o resto do dia."*

## A jornada, e onde ela some

Quatro momentos de perda, em ordem de quanto custam:

1. **Não clica** — custa a impressão
2. **Sai da página / não responde no WhatsApp** — custa o clique
3. **Abandona no meio** — custa o clique e a confiança
4. **Recusa na porta** — custa o produto, o frete e a operação inteira

O quarto é o mais caro e é o único que acontece **depois** de tudo parecer ter dado certo.

## O funil da landing page, que o agente precisa reproduzir na conversa

A ordem das seções do site é o argumento em quatro tempos, e não é arbitrária:

```
quero isso  →  hero, vídeo, momentos, galeria, como usar, comparação
funcionou   →  depoimentos
é seguro    →  objeção, como funciona a entrega
compro      →  oferta, o que chega em casa, dúvidas, fechamento
```

Antes, a prova social vinha **depois** da oferta. Para um público travado por medo de
golpe, era a ordem invertida — ver que funcionou para outra pessoa é pré-requisito para
topar o risco, não consolo depois.

**Implicação para o agente:** falar preço cedo demais, para quem ainda está decidindo se
o negócio é real, queima a conversa.

## Buracos conhecidos do funil

Registrados em `docs/funil-e-jornada.md`, todos ainda abertos:

| Buraco | Situação |
|---|---|
| Carrinho abandonado não é recuperado | meta de 25% definida, mecanismo não existe |
| Quem não paga não é cobrado | reconhecido pelo operador |
| Pedido criado contado como pago | pendente na Coinzz |
| PIX imediato contra promessa de COD | pendente na Coinzz |
| ~~Sem lista de exclusão geográfica~~ | **resolvido fora do escopo** — Coinzz/Logzz bloqueiam pedido COD sem cobertura |
| Sem fluxo de pós-venda | não existe |
| Sem depoimento com rosto | não há canal pedindo um |

O agente é a peça que pode fechar quatro deles.
