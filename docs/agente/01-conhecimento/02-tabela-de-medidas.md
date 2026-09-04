# Tabela de medidas e recomendação de tamanho

Fonte: `colet-cinta-modeladora/src/components/landing/Offer.tsx` :14–20.

## A tabela

Medidas em centímetros.

| Tamanho | Cintura | Quadril | Equivale ao manequim |
|---|---|---|---|
| **P** | 60–68 | 88–96 | 34–36 |
| **M** | 68–76 | 96–104 | 38–40 |
| **G** | 76–84 | 104–112 | 42–44 |
| **GG** | 84–92 | 112–120 | 46–48 |
| **XGG** | 92–100 | 120–128 | 50–52 |

## Como medir

> Meça a cintura por cima da roupa de baixo, sem apertar a fita.
> *(`Offer.tsx` :157)*

## A regra de desempate, já publicada

> Ficou na dúvida entre dois? **Pegue o maior.**
> *(`FAQ.tsx` :16–20)*

Ela existe porque as faixas se encostam: 68, 76, 84 e 92 cm caem na fronteira entre dois
tamanhos. Quem está no limite e pega o menor aperta demais — e aperto demais vira troca ou
recusa.

## Por que isso não deveria ser improviso do modelo

Errar o tamanho é o caminho mais curto para o evento mais caro da operação: a peça chega,
não serve, ela recusa na porta ou pede troca. Ver
[`../00-contexto/03-economia-cod.md`](../00-contexto/03-economia-cod.md).

Um LLM pedindo "me diz teu manequim" e chutando na conversa erra de formas silenciosas —
arredonda para o menor, confunde manequim com cintura, aceita "sou magrinha" como medida.
A recomendação deveria ser uma função determinística sobre a tabela acima, com a regra de
desempate embutida, e o modelo só conduzindo a coleta da medida.

Três entradas possíveis, em ordem de confiabilidade:

1. **Cintura em cm** — entrada canônica, resolve direto
2. **Manequim** — a coluna "equivale a" resolve
3. **Descrição livre** ("uso M na maioria das roupas") — só serve para *perguntar a
   medida*, nunca para decidir sozinha

**NÃO IDENTIFICADO:** o que fazer quando cintura e quadril apontam tamanhos diferentes. A
LP não trata esse caso, e ele vai acontecer. É pergunta para o operador.
