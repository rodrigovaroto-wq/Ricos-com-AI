# Graphify — o que é, pelo código, e onde encaixa aqui (2026-10-20)

Pedido do operador (2026-10-20): analisar o [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) como
consumidor, ver como ele encaixa neste repositório e como a Malu e o Hermes poderiam consultá-lo.

Lido em disco: clone de `main` no commit `86c57be` (release **0.9.92**, pacote PyPI `graphifyy`, Apache-2.0). Cada afirmação
aponta arquivo e linha desse commit. **Não foi executado** — instalar o pacote do PyPI neste container foi barrado pela
permissão da sessão; o que depende de execução está marcado *a medir*.

## 1. O que ele é, de verdade

Uma CLI Python (≥ 3.10) que transforma uma pasta num grafo `graph.json` + `GRAPH_REPORT.md` + `graph.html`, e responde
perguntas sobre ele (`graphify query "<pergunta>"`, `graphify path A B`, `graphify explain X`). Não é vetor nem embedding:
é um grafo NetworkX que se percorre.

| Peça | Como funciona | Evidência |
|---|---|---|
| Código → nós e arestas | tree-sitter, local, **sem LLM**; TypeScript incluso | `pyproject.toml:29`, `graphify/extract.py:1` |
| Markdown → nós e arestas | parser linha a linha, **sem LLM**: a página, cada título, `contains` entre títulos, `references` para links `[x](./y.md)` | `graphify/extractors/markdown.py:358-409`, `extract.py:8619` |
| Markdown → código | um `` `nome` `` em crase num doc vira aresta título → função **só se exatamente uma** função/classe do corpus tiver esse nome; ambíguo não vira aresta | `graphify/markdown_resolution.py:21-33`, `:97`, `:191`, `:216` |
| Atualizar sem custo | `graphify update .` → `_rebuild_code`, só AST, inclui `.md` | `graphify/cli.py:2779-2821`, `graphify/watch.py:1677-1687`, `:1828` |
| Passe semântico (LLM) | docs, PDF e imagem, via o modelo do assistente ou chave de API (Gemini, Claude, OpenAI…); `GRAPHIFY_BACKEND=none` desliga | README §Privacy |
| `--code-only` | pula **todo** `.md` — inclusive o estrutural | `graphify/cli.py:4039-4048` |
| Servidor MCP | `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, mais três de PR | `graphify/serve.py:2202-2322` |
| Instalação por plataforma | Claude Code: skill + bloco no `CLAUDE.md` + hook `PreToolUse` que empurra para o grafo antes de cada Read/Grep. Hermes: skill em `~/.hermes/skills/graphify/` + `AGENTS.md` | `graphify/install.py:208-215`, `:669-672`; `graphify/always_on/agents-md.md:8` |
| Ignorar arquivos | `.graphifyignore` no padrão do `.gitignore`, com `!` | `graphify/detect.py:1468`, `:1564` |
| Memória de trabalho | `save-result` + `reflect`: perguntas marcadas útil/beco/corrigida viram `LESSONS.md` | `graphify/reflect.py:1-25` |
| Log local | toda consulta vai para `~/.cache/graphify-queries.log` (sem a resposta) | README §Privacy |
| Para script | código de saída: `0` resposta, `3` nome ambíguo, `4` nada achado | README §Using the graph directly |

## 2. O que o código diz que muda o encaixe aqui

1. **O espelho byte a byte cega a ponte doc → código.** 17 arquivos de `src/` têm cópia idêntica em `supabase/functions/`
   (`tests/function-drift.test.ts:12-31`). Então toda função exportada existe duas vezes, e a regra "só uma com esse nome"
   (`markdown_resolution.py:33`) **descarta** a menção. Os nomes que o grafo de decisões mais cita — `stageForOrder` (8×),
   `asksForLink` (8×), `lookupRegion`, `isOrderDead`, `buyerAsk` (6× cada) — estão todos nos dois lados. Sem tratar o espelho,
   a única ligação que vale o Graphify aqui — "quais seções do grafo falam desta função" — sai vazia. **Tratado neste commit:**
   `.graphifyignore` tira as cópias e deixa `src/` (canônico, com teste) e `supabase/functions/turn/index.ts` (que só existe lá).
   Custo: os `import` de `index.ts` para os irmãos espelhados ficam sem destino no grafo. *A medir:* quantas arestas
   `references` do grafo de decisões para código aparecem com e sem o arquivo.
2. **Os gates são strings, não funções.** Os nomes que aparecem no trace de veto (`delivery_promise`, `shipping_promise`,
   `coverage_claim`…) são `name: "…"` dentro de objetos (`src/agent/guardrails.ts:1416`). O Graphify liga menção a função ou
   classe, nunca a valor de string. Ou seja: ele **não** responde "quais seções do grafo falam do gate `delivery_promise`".
3. **`handOff` e `sendFixed` são closures dentro de `index.ts`** (`supabase/functions/turn/index.ts:2727`, `:3148`). *A medir*
   se o extrator de TypeScript gera nó para `const` interna; se não, as 6 menções a cada uma também ficam sem aresta.
4. **O caminho barato é `graphify update .`, não `/graphify .`.** O `/graphify` completo manda os 401 `.md` para o passe
   semântico de um modelo; o `update` faz só AST, e `--code-only` jogaria fora justamente os docs.

## 3. Encaixe por consumidor

### 3.1 Sessões do Claude Code (desenvolvimento, `DECIDIR.md`, `IMPLEMENTAR.md`) — **sim, é aqui que paga**

É o uso para que a ferramenta foi feita. O repositório tem 181 `.ts` e 401 `.md`; o grafo de decisões sozinho tem 3 662 linhas e
112 seções, e a regra do `CLAUDE.md` manda lê-lo antes de mexer em gate. Hoje isso é `grep` e leitura inteira. Com o grafo:

- `graphify explain "lookupRegion"` → quem chama, quem importa, **e as seções do grafo e do `HANDOFF.md` que a citam** (depois do item 2.1);
- `graphify path "asksForLink" "handOff"` → como uma heurística chega ao handoff;
- `GRAPH_REPORT.md` → os nós mais conectados (onde uma mudança espalha) para o revisor e para a Rotina que implementa proposta do Hermes.

Configuração recomendada, sem custo de modelo e sem tocar produção:

- `graphify update .` com `GRAPHIFY_BACKEND=none` (nenhum LLM, nenhuma chave — coerente com "sem gasto de API sem pedido");
- `graphify-out/` **fora do git** (já no `.gitignore`): o grafo é derivado, reescrito inteiro a cada build e o container é novo a cada
  sessão, então ele se reconstrói no início da sessão (hook `SessionStart`) em vez de virar diff;
- **não** rodar `graphify claude install`: ele acrescenta um bloco próprio ao `CLAUDE.md` (que este projeto mantém curto e
  curado) e um hook que intercepta todo Read/Grep. Uma linha escrita à mão no `CLAUDE.md` faz o mesmo, depois de medido.

### 3.2 A Malu (o turno) — **não**

Cinco motivos, quatro deles já decididos:

- consultar um grafo no meio do turno é **recuperação** — o modo de falha que o R11.4 recusou ("recuperação que falha");
- escolher o que consultar seria **tool-calling na conversa** (R11.1);
- a base de conhecimento tem 104 linhas e já está inteira no prompt; o fato do lead é `jsonb` em `leads` (R11.5);
- a `turn` roda em Deno na Edge Function e o Graphify é Python — seria um serviço novo no caminho do turno, com latência;
- o grafo é de **código e documentação**, não de produto: nada nele responde a uma cliente.

O que o Graphify dá à Malu é indireto: quem mexe no prompt e nos gates dela enxerga o que a mudança atinge.

### 3.3 O Hermes — **não agora, e não pela instalação oficial**

- `graphify install --platform hermes` instala uma skill que manda **rodar a CLI**. O Hermes daqui roda com os toolsets
  `file,skills,todo` e nada mais (`src/dev/hermes-run.ts:20`, `:257`) — essa é a barreira do R11.6. Dar terminal a quem lê conversa
  real para poder chamar o Graphify abre a barreira para ganhar pouco.
- O que o Hermes precisaria do grafo é "para cada gate que vetou neste lote, o que já se tentou nele". Pelo item 2.2, o Graphify não
  liga gate a seção. Isso é um `grep` determinístico do nome do gate por seção do grafo de decisões — degrau 2/6 da escada, sem
  dependência nova — e só vale construir se uma proposta do Hermes repetir um caminho que o grafo já descartou (hoje o
  `historico.md` e o `decisoes.md` do pacote cobrem o que ele já errou).
- Se um dia valer: gerar o trecho no `hermes.yml` (CI, antes do Hermes) e pôr no pacote como mais um `.md` — nunca dar ao Hermes
  ferramenta nova.

### 3.4 O que não adotar

| Peça | Por quê |
|---|---|
| Passe semântico (`/graphify .` completo, `--backend`) | Manda os docs a um modelo; o estrutural já cobre títulos, links e menções; provedor de modelo aqui é decisão do operador |
| `save-result` / `reflect` | Segunda memória ao lado de `.claude/memory/` e do grafo de decisões — duas verdades |
| `graphify claude install` / hook `PreToolUse` | Reescreve o `CLAUDE.md` e intercepta toda leitura (item 3.1) |
| Graphify Cloud | O código sai do repositório para um serviço pago; nada aqui pede monorepo nem cross-repo |
| `prs`, `wiki`, `neo4j`, `watch` | Sem necessidade hoje |

## 4. O que falta, e de quem é

1. **Operador:** autorizar instalar `graphifyy==0.9.92` (PyPI) no container — ou num hook `SessionStart` versionado. Sem isso
   nada roda.
2. **Medir, numa sessão com a permissão:** tempo do `graphify update .`; nº de arestas `references` saindo de
   `04-grafo-de-decisoes.md` com e sem o `.graphifyignore`; se `handOff`/`sendFixed` viram nó; três perguntas reais
   (`explain lookupRegion`, `explain stageForOrder`, `path asksForLink handOff`) comparadas com `grep`.
3. **Só depois:** uma linha no `CLAUDE.md` ("pergunta de código: `graphify query` antes do grep") e o hook `SessionStart`.
