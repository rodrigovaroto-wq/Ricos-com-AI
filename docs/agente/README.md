# Agente de vendas no WhatsApp — contexto completo

Tudo que uma sessão nova precisa saber para construir o agente, sem ter que
reconstruir a pesquisa nem adivinhar o negócio.

> **Nada aqui é código, e nada aqui é decisão de arquitetura tomada.** É contexto,
> pesquisa com evidência e especificação funcional. As escolhas de rota estão
> listadas em [`04-decisoes/02-decisoes-em-aberto.md`](04-decisoes/02-decisoes-em-aberto.md)
> e são do operador.

## Leia nesta ordem

| # | Pasta | O que tem |
|---|---|---|
| 1 | [`00-contexto/`](00-contexto/) | O negócio: produto, oferta, público, economia do COD, **modelo econômico projetado**, campanha e o que já foi decidido e não se reabre |
| 2 | [`01-conhecimento/`](01-conhecimento/) | O que o agente pode dizer: objeções, FAQ, medidas, o que vai na caixa — copy validada em tráfego pago |
| 3 | [`02-especificacao/`](02-especificacao/) | O que o agente faz: mapa funcional, tools, máquina de estados, guardrails |
| 4 | [`03-pesquisa/`](03-pesquisa/) | 8 repositórios open source lidos em código, com arquivo e linha |
| 5 | [`04-decisoes/`](04-decisoes/) | O que falta, o que já foi decidido e o que ainda precisa de escolha |
| 6 | [`05-plano/`](05-plano/) | O plano de construção: onde estamos, o que falta, em que ordem, e as perguntas ainda abertas antes do MVP |
| 7 | [`06-script/`](06-script/) | O que a agente fala: diagnóstico do funil recebido do operador e o script reescrito para a operação da Encorpa |

## Atalho por pergunta

- *"O que o negócio ganha e perde em cada venda?"* → [`00-contexto/03-economia-cod.md`](00-contexto/03-economia-cod.md)
- *"O que o agente pode prometer?"* → [`00-contexto/05-decisoes-firmes.md`](00-contexto/05-decisoes-firmes.md) e [`02-especificacao/04-guardrails.md`](02-especificacao/04-guardrails.md)
- *"Como responder a uma objeção?"* → [`01-conhecimento/01-base-de-conhecimento.md`](01-conhecimento/01-base-de-conhecimento.md)
- *"Que tamanho recomendar?"* → [`01-conhecimento/02-tabela-de-medidas.md`](01-conhecimento/02-tabela-de-medidas.md)
- *"Onde alguém já resolveu isso?"* → [`03-pesquisa/03-extracao-por-necessidade.md`](03-pesquisa/03-extracao-por-necessidade.md)
- *"Qual a meta e quanto o canal precisa render?"* → [`00-contexto/06-modelo-economico.md`](00-contexto/06-modelo-economico.md)
- *"O que já foi decidido?"* → [`04-decisoes/03-decisoes-tomadas.md`](04-decisoes/03-decisoes-tomadas.md)
- *"O que ainda não decidimos?"* → [`04-decisoes/02-decisoes-em-aberto.md`](04-decisoes/02-decisoes-em-aberto.md)
- *"Por onde começar a construir, e o que falta perguntar?"* → [`05-plano/README.md`](05-plano/README.md)
- *"O que a agente fala, exatamente?"* → [`06-script/02-script-do-agente.md`](06-script/02-script-do-agente.md)

## Relação com o resto do repositório

[`docs/PROMPT.md`](../PROMPT.md) especifica um sistema comercial autônomo de
**prospecção ativa no Instagram**. Este diretório trata de outra coisa: um agente
**inbound** de WhatsApp, alimentado por Meta Ads. Os dois documentos convivem; onde
divergirem sobre canal e funil, vale este diretório. O que o `PROMPT.md` tem de
transversal e continua valendo está listado em
[`00-contexto/04-campanha-e-canais.md`](00-contexto/04-campanha-e-canais.md).

## Marcação de confiança usada em todos os arquivos

- `[FATO — CÓDIGO]` — observado diretamente no código.
- `[FATO — DOC]` — declarado em documentação; não confirmado no código.
- `[INFERÊNCIA]` — conclusão derivada de evidência observada.
- `[HIPÓTESE]` — precisa ser validada antes de virar decisão.
- `NÃO IDENTIFICADO` — não há evidência suficiente.

## Fonte primária do negócio

O contexto de negócio vem do repositório da landing page,
`rodrigovaroto-wq/colet-cinta-modeladora` — `docs/contexto-do-projeto.md`,
`docs/funil-e-jornada.md`, `docs/agente-whatsapp.md`, `HANDOFF.md` e o código em
`src/`. Quando os dois divergirem, **aquele repositório é a fonte**; aqui está a
cópia de trabalho para o agente.
