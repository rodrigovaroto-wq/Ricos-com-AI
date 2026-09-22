# Agente de vendas no WhatsApp — contexto completo

Tudo que uma sessão nova precisa saber para construir o agente, sem ter que
reconstruir a pesquisa nem adivinhar o negócio.

> **Nada aqui é código, e nada aqui é decisão de arquitetura tomada.** É contexto,
> pesquisa com evidência e especificação funcional. As escolhas de rota estão
> listadas em [`../documentacao/decisoes/02-decisoes-em-aberto.md`](../documentacao/decisoes/02-decisoes-em-aberto.md)
> e são do operador.

## Leia nesta ordem

Este é um dos três compartimentos do repositório —
[`docs/documentacao/`](../documentacao/) guarda contexto de negócio e decisões,
[`docs/campanhas-e-anuncios/`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) guarda tudo de Meta
Ads/atribuição/conversões, e este (`docs/agente-ia/`) guarda o agente de
conversa em si.

| # | Pasta | O que tem |
|---|---|---|
| 1 | [`../documentacao/contexto-negocio/`](../documentacao/contexto-negocio/) | O negócio: produto, oferta, público, economia do COD, **modelo econômico projetado** e o que já foi decidido e não se reabre |
| 2 | [`01-conhecimento/`](01-conhecimento/) | O que o agente pode dizer: objeções, FAQ, medidas, o que vai na caixa — copy validada em tráfego pago |
| 3 | [`02-especificacao/`](02-especificacao/) | O que o agente faz: mapa funcional, tools, máquina de estados, guardrails |
| 4 | [`03-pesquisa/`](03-pesquisa/) | 8 repositórios open source lidos em código, com arquivo e linha |
| 5 | [`../documentacao/decisoes/`](../documentacao/decisoes/) | O que falta, o que já foi decidido e o que ainda precisa de escolha |
| 6 | [`05-plano/`](05-plano/) | O plano de construção: onde estamos, o que falta, em que ordem, e as perguntas ainda abertas antes do MVP |
| 7 | [`06-script/`](06-script/) | O que a agente fala: diagnóstico do funil recebido do operador e o script reescrito para a operação da Encorpa |

## Atalho por pergunta

- *"O que o negócio ganha e perde em cada venda?"* → [`../documentacao/contexto-negocio/03-economia-cod.md`](../documentacao/contexto-negocio/03-economia-cod.md)
- *"O que o agente pode prometer?"* → [`../documentacao/contexto-negocio/05-decisoes-firmes.md`](../documentacao/contexto-negocio/05-decisoes-firmes.md) e [`02-especificacao/04-guardrails.md`](02-especificacao/04-guardrails.md)
- *"Como responder a uma objeção?"* → [`01-conhecimento/01-base-de-conhecimento.md`](01-conhecimento/01-base-de-conhecimento.md)
- *"Que tamanho recomendar?"* → [`01-conhecimento/02-tabela-de-medidas.md`](01-conhecimento/02-tabela-de-medidas.md)
- *"Onde alguém já resolveu isso?"* → [`03-pesquisa/03-extracao-por-necessidade.md`](03-pesquisa/03-extracao-por-necessidade.md)
- *"Qual a meta e quanto o canal precisa render?"* → [`../documentacao/contexto-negocio/06-modelo-economico.md`](../documentacao/contexto-negocio/06-modelo-economico.md)
- *"O que já foi decidido?"* → [`../documentacao/decisoes/03-decisoes-tomadas.md`](../documentacao/decisoes/03-decisoes-tomadas.md)
- *"O que ainda não decidimos?"* → [`../documentacao/decisoes/02-decisoes-em-aberto.md`](../documentacao/decisoes/02-decisoes-em-aberto.md)
- *"Por que o frete e o desconto do antecipado estão travados?"* → [`../documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](../documentacao/decisoes/04-frete-e-desconto-do-antecipado.md)
- *"O que falta para o sistema ficar pronto para os primeiros testes reais?"* → [`05-plano/02-plano-de-execucao-ate-os-testes-reais.md`](05-plano/02-plano-de-execucao-ate-os-testes-reais.md)
- *"Como a agente é testada por dentro antes de falar com cliente de verdade?"* → [`05-plano/03-personas-de-teste-interno.md`](05-plano/03-personas-de-teste-interno.md)
- *"O sistema deveria ter Evaluation Layer, Hermes supervisor, RAG, closed loop?"* → [`05-plano/04-analise-de-arquitetura.md`](05-plano/04-analise-de-arquitetura.md)
- *"Qual era o desenho original do agente, a árvore de funções?"* → [`05-plano/README.md`](05-plano/README.md)
- *"O que a agente fala, exatamente?"* → [`06-script/02-script-do-agente.md`](06-script/02-script-do-agente.md)
- *"Como conectar o Meta Ads / mandar a venda de volta pro Meta?"* → [`../campanhas-e-anuncios/`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-)

## Relação com o resto do repositório

Este diretório trata de um agente **inbound** de WhatsApp, alimentado por Meta Ads.
`docs/PROMPT.md` — uma versão anterior deste repositório, para outro sistema
(prospecção **ativa** no Instagram, canal e funil diferentes) — foi removido em
2026-09-05 por não se aplicar a esta operação; o que era transversal nele (motor de
conversação, opt-out, persistência, arquitetura, idioma) está preservado em
[`../campanhas-e-anuncios/01-campanha-e-canais.md`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-/blob/main/docs/01-campanha-e-canais.md)
§"Convenções herdadas" e em
[`../documentacao/03-padroes-de-engenharia.md`](../documentacao/03-padroes-de-engenharia.md).

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
