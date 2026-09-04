# Pesquisa — 8 referências open source, lidas em código

Todos os repositórios foram **clonados e lidos em disco** (1,0 GB, 7,4 milhões de linhas).
Cada afirmação aponta arquivo e, quando aplicável, linha — para abrir no GitHub e conferir.

| Arquivo | O que tem |
|---|---|
| [`01-selecao-das-referencias.md`](01-selecao-das-referencias.md) | Os 23 candidatos avaliados, com data real do último commit, e por que 8 foram escolhidos |
| [`02-analise-dos-8-repositorios.md`](02-analise-dos-8-repositorios.md) | Ficha técnica de cada um, 40 características, fluxo de venda reconstruído, tabela comparativa, matriz contra o nosso projeto |
| [`03-extracao-por-necessidade.md`](03-extracao-por-necessidade.md) | Reorganização por necessidade nossa (N1–N8) e correções à primeira passagem |
| [`04-varredura-profunda.md`](04-varredura-profunda.md) | Varredura mecânica sobre o corpus inteiro; 11 peças novas |

## Os 8 repositórios

| Repo | Último commit medido | Papel na nossa pesquisa |
|---|---|---|
| [melgarafael/DeskcommCRM](https://github.com/melgarafael/DeskcommCRM) | 2026-09-04 | Padrões do motor: cadeia de veto, skills, spinning, pacing, atribuição CTWA |
| [devlikeapro/waha](https://github.com/devlikeapro/waha) | 2026-09-01 | Transporte, números brasileiros, mensagens interativas |
| [evolution-foundation/evolution-api](https://github.com/evolution-foundation/evolution-api) | main 2026-05-06 | Knobs de fachada humana, debounce, botão PIX nativo |
| [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) | 2026-08-04 | Protocolo, sessão, retry, catálogo e pedido nativos |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | 2026-09-04 | `sendAndWait`, agendamento, nós de subtarefa de LLM |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | 2026-09-04 | Processadores, memória em camadas, scorers |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 2026-09-02 | Extração e reconciliação de fatos, histórico em SQLite |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | 2026-09-03 | Handoff explícito, medição de resultado, campanhas |

## O que a pesquisa concluiu, em uma linha

As oito referências resolvem **a conversa**. Nenhuma delas — confirmado por varredura
mecânica no corpus inteiro — trata **pagamento na entrega**. O trecho do funil onde nosso
dinheiro é ganho ou perdido é território sem mapa.

## Licenças — o que pode e o que não pode ser copiado

| Repo | Licença | Restrição |
|---|---|---|
| DeskcommCRM | MIT | livre, com atribuição |
| Baileys | MIT | livre, com atribuição |
| WAHA | Apache-2.0 no `LICENSE`, mas `package.json` declara `UNLICENSED` — **divergência a checar antes de uso comercial** | |
| Evolution | Apache-2.0 + regras de marca | |
| mem0 | Apache-2.0 | |
| Mastra | Apache-2.0, **exceto `ee/`** | `ee/` é licença comercial |
| n8n | Sustainable Use License (fair-code) | self-host permitido; revender como serviço não |
| Chatwoot | MIT no núcleo, **exceto `enterprise/`** | Captain e auditoria são comerciais — ler não é copiar |
