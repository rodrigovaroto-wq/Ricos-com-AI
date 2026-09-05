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

## Decisão do operador (2026-09-04)

**A tabela vai para a cliente, e ela escolhe.** Medir com fita é caminho secundário — nem
toda cliente tem disposição para pegar uma fita métrica no meio de uma conversa de
WhatsApp, e insistir nisso é atrito onde não pode haver.

**Em caso de dúvida entre dois tamanhos, o maior.**

**Risco assumido, registrado com honestidade:** tamanho auto-declarado erra mais que
tamanho medido, e errar tamanho é o caminho mais curto para troca ou recusa na porta. Duas
coisas seguram esse risco: a coluna **"equivale ao manequim"**, que é a referência que ela
já conhece do próprio guarda-roupa, e a regra do maior, que puxa para o lado seguro.

**Como fica na conversa:** a agente manda a tabela, pergunta qual manequim ela costuma
usar, e **oferece** a medição como caminho mais preciso para quem quiser — sem transformar
isso em requisito.

## Por que a decisão final não deveria ser improviso do modelo

Errar o tamanho é o caminho mais curto para o evento mais caro da operação: a peça chega,
não serve, ela recusa na porta ou pede troca. Ver
[`../../documentacao/contexto-negocio/03-economia-cod.md`](../../documentacao/contexto-negocio/03-economia-cod.md).

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
