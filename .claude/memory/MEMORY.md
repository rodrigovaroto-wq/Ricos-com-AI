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
- [Cegueira a negação, nos dois sentidos](negation-blindness.md) — Toda heurística de texto deste repositório já errou em negação; antes de mexer numa, sonde a frase negada **e** a negativa que não nega — e todo conserto passa por segunda revisão antes de ser dado como resolvido; desde 25/09 `pnpm dev:gates` compara os vereditos antes/depois e o CI barra afrouxamento não aceito.
- [O n8n achata o status HTTP](n8n-achata-o-status.md) — a recusa da Edge Function viaja no corpo (`status: "error"`) e num e-mail; o status HTTP é 200 em qualquer desfecho, de propósito.
- [`BUSINESS_CONFIG` sobrescreve o fallback inteiro](business-config-sobrescreve.md) — chave nova nasce ausente em produção; todo campo novo tem de ser opcional com o padrão certo.
- [O frete do antecipado não existe](frete-do-antecipado-nao-existe.md) — os R$ 15 a R$ 84 na documentação são custo do operador, não preço da cliente; desde 28/09 frete grátis só no pagamento na entrega, dito com o caminho na frase; o antecipado cobra por região; a economia nunca é citada em reais (saída A).
- [Mensagem de erro quebrada em teste](mensagem-de-erro-quebrada-em-teste.md) — `function-drift.test.ts` faz `.toContain` no texto bruto do arquivo; uma frase escrita em duas linhas de template literal quebra o teste na quebra de linha, mesmo com a string certa em runtime.
- [Varredura de cobertura com falso-negativo](varredura-falso-negativo.md) — falha de rede e "praça sem COD" são indistinguíveis; o `urllib` do Python leva 403 do proxy e devolve as 43 cidades negativas — use `curl` e confira São Paulo/G antes de acreditar.
- [O system prompt não é coberto por teste](prompt-nao-e-coberto-por-teste.md) — nenhum teste toca o texto que mais decide o comportamento; ele já se contradizia sobre desconto e afirmava frete grátis sem ler o config que o gate lia.
- [`conversations.stage` nunca é escrito](stage-nunca-e-escrito.md) — hoje os dez estágios têm quem escreva (`perdido` pela varredura desde 26/09, não deployado); o `silence_3` com cupom inativo sai pelo ramo vazio — "fim da régua" tem de cobrir esse ramo.
- [O desfecho do turno não é persistido](desfecho-do-turno-nao-persistido.md) — vai para `turn_outcomes` desde 22/09 (não deployado); conversa anterior ao deploy da v33 não tem desfecho, e nenhuma taxa pode começar antes dessa data.
- [Guarda testada por mutação](guarda-testada-por-mutacao.md) — toda guarda nova ganha uma mutação em `src/dev/verify-guards.ts` que reinstala o bug de origem; o CI exige que ela fique vermelha.
- [Grafo de decisões](grafo-de-decisoes.md) — leia antes de mexer em gate, estado da conversa ou handoff: os atalhos óbvios já falharam e o grafo diz por quê.
- [Não relembrar PAT nem CONVERSATION_MODEL](nao-relembrar-pendencias-do-operador.md) — o operador sabe e faz; pendência já reconhecida não vira fecho de resposta.
- [Divisão de papéis: Meta é do sócio](divisao-de-papeis-meta.md) — Ads, BM, developer, número e templates são do sócio; o operador cuida do técnico.
- [Diagnóstico antes de consertar](diagnostico-antes-de-consertar.md) — regra do operador: nada de tentativa e erro; causa e origem exatas primeiro, conserto depois. As 10 rodadas do gate de prazo são o contraexemplo.
- [Ambiente aponta para outro projeto](ambiente-aponta-para-outro-projeto.md) — no container de nuvem, `SUPABASE_URL`, `N8N_*` e os conectores MCP são de outro projeto; nada de produção da Encorpa roda daqui.
