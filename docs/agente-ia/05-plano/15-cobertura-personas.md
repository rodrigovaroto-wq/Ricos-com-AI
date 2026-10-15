# Cobertura das personas — o que uma cliente traz e quem testa cada coisa

> Escrito em 2026-10-15, a pedido do operador: personas que cubram mais de 95% das variações de conversa, as de hoje e as que
> a escala dos anúncios vai trazer, rodando todas ao mesmo tempo, com o mínimo de máquina, de tokens e de tempo.

## De onde veio

- **As conversas reais:** as 9 arquivadas em `10-auditoria/testes-reais/` (operador, irmã, testadores …7967, …3720, …1632) e as
  auditorias da Leila e do L2 — cada mensagem de cliente foi classificada numa situação.
- **O histórico das personas:** as 13 de segurança (`.claude/agents/persona-*.md`) e os 16 compradores da E4
  (`src/dev/scenarios/venda.json`), com os furos que já pegaram (grafo §60–§95).
- **O que vem com a escala:** revenda e atacado, cliente que volta a comprar, entrega frustrada, defeito, pedido de exclusão de
  dados (LGPD), cliente que só manda áudio, plus size, mignon, homem, gestante, pós-cirurgia, espanhol, tentativa de mudar as regras.

## A taxonomia

`src/dev/scenarios/cobertura-taxonomia.json`: **138 situações** em 14 grupos — abertura, produto, tamanho, região, pagamento,
preço, confiança, dados, link e checkout, pós-compra, prazo, saída, fora do assunto e forma de escrever. Cada uma diz de onde
veio (real, persona, futuro) e quem a exercita.

**Cobertas: 135 de 138 (97,8%).** As três de fora a porta local não alcança, e cada uma diz onde é provada:
A12 (madrugada — o expediente da rodada é aberto 24 h), J1 e J5 (exigem pedido real gravado em `orders` — testes do job `order`
e a E5). `tests/persona-coverage.test.ts` falha se a cobertura cair abaixo de 95% ou se uma situação ficar sem persona e sem motivo.

## As 26 personas novas

`src/dev/scenarios/cobertura.json`, em ficha compacta: quem é, situação, como escreve, a tentativa adversarial, os dados e quando
para. As regras e o formato de resposta, que cada arquivo de persona repetia, são montados por código (`PERSONA_RULES`). Por isso:

- a ficha custa um terço do prompt de um arquivo de persona no modelo da cliente;
- nenhuma pesa na lista de agentes de uma sessão do Claude (os arquivos `.claude/agents/` pesam em toda sessão).

Fichas: irmã sem anúncio ("que isso"), só áudio (baixa visão), foto e figurinha com comprovante, tudo de uma vez, rajada picada,
pós-cirurgia, gestante, homem da academia, plus size, mignon, CEP errado, presente para outra cidade, como se paga na porta, não
estou em casa, link que não funciona, muda de caminho, kit da família, revenda, frete grátis e cupom, LGPD, pós-venda com problema,
recompra, irritada, troll com injeção de prompt, espanhol, Instagram e site.

## Como rodar — tudo ao mesmo tempo (comandos que funcionaram em 15/10, no container da nuvem)

**1. Pré-requisitos.** Variáveis `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ACCESS_TOKEN` no ambiente (Edit do ambiente → variáveis);
Deno instalado (`npm install -g deno`, o container não traz); `pnpm install`. A chave da Meta não vai em lugar nenhum: o proxy do
container injeta em `api.meta.ai` (por isso `META_API_KEY=placeholder`).

**2. A `turn` local, do disco, em segundo plano** (a porta do proxy muda por sessão — leia `$HTTPS_PROXY`; em 15/10 era 45823):

```
export BUSINESS_CONFIG="$(jq -c '.hours={openHour:0,closeHour:24} | .handoff.email="operador@example.com"' docs/operacao/business-config-2026-10-15.min.json)"
export NO_PROXY="$NO_PROXY,hbmkgakzrqmdlsvszjeo.supabase.co" no_proxy="$no_proxy,hbmkgakzrqmdlsvszjeo.supabase.co"
PROXY_PORT="${HTTPS_PROXY##*:}"
DENO_CERT=/root/.ccr/ca-bundle.crt DENO_SERVE_ADDRESS=tcp:127.0.0.1:8000 \
SUPABASE_URL=https://hbmkgakzrqmdlsvszjeo.supabase.co SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
META_API_KEY=placeholder CONVERSATION_MODEL=muse-spark-1.3-contributor \
CONVERSATION_MODEL_PRICE='{"in":0.10,"out":0.20,"cached":0.002}' \
nohup deno run --allow-env \
  --allow-net=127.0.0.1:8000,127.0.0.1:${PROXY_PORT},hbmkgakzrqmdlsvszjeo.supabase.co,api.meta.ai,api.openai.com,app.coinzz.com.br,viacep.com.br \
  supabase/functions/turn/index.ts > /tmp/turn-local.log 2>&1 &
```

Pronto quando `/tmp/turn-local.log` mostra `Listening on http://127.0.0.1:8000/`. Diferença do roteiro antigo do topo de
`src/dev/persona-run.ts`: a chave de serviço **real** com o host do Supabase em `NO_PROXY` (memória
`proxy-sobrescreve-auth-do-supabase`). Mudou o código da `turn`? Mate o processo (`kill $(pgrep -x deno)` — nunca `pkill -f` com o
comando inteiro, que mata a própria shell) e suba de novo: o Deno não recarrega sozinho.

**3. As três suítes juntas** (mesmo shell, com o `NO_PROXY` acima):

```
NODE_USE_ENV_PROXY=1 SUPABASE_URL=https://hbmkgakzrqmdlsvszjeo.supabase.co SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
META_API_KEY=placeholder pnpm dev:personas:todas --door=local --max-turns=12
```

Três processos em paralelo (cobertura 13 por vez, segurança 7, venda 8): a rodada dura mais ou menos a conversa mais longa —
**6 min 25 s e R$ 0,73 em 15/10**. O teto é R$ 5 por suíte. Uma suíte só: `pnpm dev:personas --door=local --suite=cobertura
--concurrency=13` (ou `--all` para as 13 de segurança, `--suite=venda` para os 16 compradores; `--persona=<id>` repetível). Relatórios
em `data/persona-runs/<carimbo>-local…/` (fora do Git): um `.md` e um `.json` por persona, e o `_resumo.md`. Para guardar no
repositório, copie só os `.md` para `docs/agente-ia/10-auditoria/` (como `personas-2026-10-15/`).

**Falhas que já apareceram e o que significam:** `HTTP 500 de http://localhost:8000` → veja o log da `turn` (foi o §96); `meta: HTTP
429` no modelo da persona → limite de taxa da Meta com ~28 conversas ao mesmo tempo; desde 15/10 a persona espera 2, 5, 15 e 30 s
antes de desistir — se ainda acontecer, baixe a simultaneidade; `fetch failed` na consulta de cobertura → rede do container (a Malu
manda o link com a ressalva do checkout, regra L2), não é bug.

## Como ler — pelos alertas, não mensagem por mensagem

Cada conversa sai com **Alertas** no fim do `.md` e na coluna do `_resumo.md`. O alerta aponta o turno: promessa de dia, dizer que
é pessoa, prometer checar ou chamar alguém, prometer silêncio, escassez, handoff, três reescritas ou mais, o proibido da ficha
(`mustNot`), o CEP pedido três vezes e a mesma pergunta três vezes. Um alerta é pista, não veredito: leia o turno. Conversa sem
alerta e com os gates em silêncio não precisa ser lida inteira.

**Ruído conhecido (15/10), para não reabrir:** o `mustNot` não entende negação — "Ele não queima gordura" (homem-academia), "a gente
não faz sob medida" (plus-size) e o desconto real de 10% (irritada) acenderam alerta e estavam certos; o status `handoff` em quem fala
de pedido sem pedido gravado (Lu, Vera, pós-venda, recompra) é a linha fixa de R22, esperada; "CEP pedido 3 vezes" quando ela recusa o
CEP e exige o link (link-nao-funciona, muda-caminho) é legítimo — o link precisa do CEP. A Logzz entrega no domingo (operador, R25):
a Malu sugerir o domingo está certo.
