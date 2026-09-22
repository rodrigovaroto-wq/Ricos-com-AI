# Índice de memória

Uma linha por memória, com link para o arquivo de tópico. Teto mole de 130 linhas
não vazias — ver [`INSTRUCTIONS.md`](INSTRUCTIONS.md) para o critério de
salvamento e a política de crescimento.

<!-- Formato: - [Título](arquivo.md) — descrição de uma linha -->

- [`ON CONFLICT` e índice parcial em `followups`](on-conflict-partial-index.md) — Não troque a unique constraint por índice parcial: o upsert do handler quebra em silêncio.
- [Drift entre a Edge Function e o repositório](edge-function-drift.md) — A Edge Function no ar pode divergir do repositório nos dois sentidos; nada compara os dois lados; sempre ler o que está deployado antes de deployar.
- [Deploy da Edge Function pela API](supabase-deploy-por-api.md) — A ferramenta MCP transcreve os arquivos e o pacote não cabe mais numa mensagem; deploye pela API de gerência, com os arquivos do disco.
- [Verificar pela porta de produção](verificar-pela-porta-de-producao.md) — Sonda contra a Edge Function prova o código, não o caminho; o webhook do n8n devolvia 200 sem criar conversa nenhuma.
- [Isolate quente depois do deploy](edge-function-warm-isolate.md) — Por minutos depois de um deploy, parte das requisições ainda cai na versão anterior; confira a sonda pelo formato da resposta, não pelo conteúdo.
- [Cegueira a negação, nos dois sentidos](negation-blindness.md) — Toda heurística de texto deste repositório já errou em negação; antes de mexer numa, sonde a frase negada **e** a negativa que não nega.
- [O n8n achata o status HTTP](n8n-achata-o-status.md) — a recusa da Edge Function viaja no corpo (`status: "error"`) e num e-mail; o status HTTP é 200 em qualquer desfecho, de propósito.
- [`BUSINESS_CONFIG` sobrescreve o fallback inteiro](business-config-sobrescreve.md) — chave nova nasce ausente em produção; todo campo novo tem de ser opcional com o padrão certo.
- [O frete do antecipado não existe](frete-do-antecipado-nao-existe.md) — a oferta da Coinzz vem com `settingsFreight: []` nos 27 estados: o checkout cobra R$ 0,00 dela, e os R$ 15 a R$ 84 documentados são custo do operador, não preço da cliente.
- [Mensagem de erro quebrada em teste](mensagem-de-erro-quebrada-em-teste.md) — `function-drift.test.ts` faz `.toContain` no texto bruto do arquivo; uma frase escrita em duas linhas de template literal quebra o teste na quebra de linha, mesmo com a string certa em runtime.
- [Varredura de cobertura com falso-negativo](varredura-falso-negativo.md) — falha de rede e "praça sem COD" são indistinguíveis; o `urllib` do Python leva 403 do proxy e devolve as 43 cidades negativas — use `curl` e confira São Paulo/G antes de acreditar.
- [O system prompt não é coberto por teste](prompt-nao-e-coberto-por-teste.md) — nenhum teste toca o texto que mais decide o comportamento; ele já se contradizia sobre desconto e afirmava frete grátis sem ler o config que o gate lia.
- [`conversations.stage` nunca é escrito](stage-nunca-e-escrito.md) — nasce `'discovery'`, valor que nem existe em `STAGES`; a máquina de estados roda em teste e simulador, não em produção, e por isso não existe funil.
- [O desfecho do turno não é persistido](desfecho-do-turno-nao-persistido.md) — `send`/`fallback`/`deferred`/`handoff`/`stopped` viajam só no corpo HTTP; a taxa de fallback é irrecuperável depois do fato.
