# Campanhas e anúncios (Meta Ads)

Um dos três compartimentos do repositório — os outros dois são
[`docs/documentacao/`](../documentacao/) (contexto de negócio e decisões) e
[`docs/agente-ia/`](../agente-ia/) (o agente de conversa). Este guarda tudo que é
do lado "anúncio/campanha": os dois caminhos de venda, atribuição de CTWA, e a
pesquisa de código sobre Meta Ads/Conversions API.

| Arquivo | O que tem |
|---|---|
| [`01-campanha-e-canais.md`](01-campanha-e-canais.md) | Os dois caminhos de venda coexistindo, o que existe e falta de atribuição, pixel/eventos hoje, convenções herdadas de engenharia |
| [`02-analise-meta-ads-e-conversoes.md`](02-analise-meta-ads-e-conversoes.md) | 3 repositórios de Meta Ads/Conversions API lidos em código — resolve a lacuna de mandar a venda de volta pro Meta |

Copy e criativo de anúncio validados em tráfego pago ficam em
[`docs/agente-ia/01-conhecimento/`](../agente-ia/01-conhecimento/) — é conteúdo que
o agente também usa na conversa, por isso mora com o restante da base de
conhecimento, não aqui.
