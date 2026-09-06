# Documentação, contexto e decisões

Um dos três compartimentos do repositório — os outros dois são
[`docs/agente-ia/`](../agente-ia/) (o agente de conversa) e
[`docs/campanhas-e-anuncios/`](../campanhas-e-anuncios/) (Meta Ads, atribuição,
Conversions API). Este guarda o que é transversal: contexto de negócio, decisões,
padrões de engenharia e o tutorial das ferramentas do fluxo de execução.

| Pasta/arquivo | O que tem |
|---|---|
| [`contexto-negocio/`](contexto-negocio/) | O negócio: produto, oferta, público, economia do COD, modelo econômico, o que já foi decidido e não se reabre |
| [`decisoes/`](decisoes/) | O que falta, o que já foi decidido e o que ainda precisa de escolha (para o agente de WhatsApp) |
| [`03-padroes-de-engenharia.md`](03-padroes-de-engenharia.md) | Clean Code, segurança e testes — convenções genéricas, válidas para qualquer parte do projeto |
| [`tools/`](tools/) | Referência das 14 ferramentas do fluxo de execução do Claude Code neste repositório |
| [`prompts/`](prompts/) | 7 prompts prontos para colar e adaptar (sanitização, ESLint, code review, planejamento) |
| [`00-overview.md`](00-overview.md) · [`01-installation.md`](01-installation.md) · [`02-playbook-onboarding.md`](02-playbook-onboarding.md) | Fundamentos do fluxo de execução: filosofia, instalação, onboarding passo a passo |
| [`LICENSE-vibe-coding-toolkit`](LICENSE-vibe-coding-toolkit) | Licença MIT da estrutura de execução de origem |

Para o que o agente de vendas no WhatsApp faz e como foi pesquisado, ver
[`docs/agente-ia/README.md`](../agente-ia/README.md).
