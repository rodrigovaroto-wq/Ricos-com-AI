# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive o contexto do
> agente — negócio, pesquisa, especificação, decisões — e onde o agente de IA
> de vendas via WhatsApp está sendo construído. `colet-cinta-modeladora`
> (renomeado para **Encorpa-Website**) guarda só o site oficial da Encorpa
> (landing page, checkout). `encorpa-campanhas` guarda Meta Ads, atribuição de
> CTWA e Conversions API — saiu deste repositório em 2026-09-08, ver
> §Separação de repositórios. Se um dia divergirem sobre negócio, **este
> repositório é a fonte**.

## ▶ COMECE AQUI — quadro de execução do pipeline 80/20 (atualizado 2026-10-09)

> **2026-10-09 — modelo de caixa do teste (sessão `claude/elegant-cray-sttizw`, só documentação):** a pedido do operador foi
> criada a planilha [`docs/operacao/modelo-caixa-anuncios.xlsx`](docs/operacao/modelo-caixa-anuncios.xlsx) e o documento
> [`docs/operacao/taxas-antecipadas-cod.md`](docs/operacao/taxas-antecipadas-cod.md) (decisão R19.1, grafo §68). Com verba de
> **R$ 700** (Copy 7 dias a R$ 50/dia, 2 de pausa, Região 7 dias a R$ 50/dia, a partir de 23/10) e caixa de R$ 1.325, o **pico de caixa é R$ 752
> e sobram R$ 323** sobre os R$ 1.075 utilizáveis. Valores novos: manuseio R$ 5,00, recusa R$ 9,99 (4,99 + 5,00), devolução
> R$ 86,56 no COD e R$ 58,99 no antecipado (frete de retorno + manuseio + taxas já pagas), imposto da Meta 13,83% a conferir,
> anúncio e custos do sistema no cartão (fatura fecha dia 22, vence dia 29). **Não mexeu em código nem em produção.** O operador
> confirmou que essa verba e esse caixa **substituem os R$ 500 e os R$ 1.500 de L3** (09-pipeline L3.1 e L3.2 reconciliados: Copy 1–7, Região
> 10–16, Leitura e decisão no dia 18, assumido). Pendências: medir o frete de retorno e conferir o imposto da Meta na 1ª fatura.
> **Risco aberto:** Piso de amostra (L3 item 4): mais de 500 leads e mais de 50 pedidos. Com R$ 700 (R$ 50/dia por 7 dias em cada fase) e CPL R$ 1,50 saem 467 leads e 47 pedidos: **abaixo do piso**. Passa só com CPL abaixo de ~R$ 1,40 (CPL R$ 1,35: 519 leads e 52 pedidos, pico R$ 836, sobra R$ 239; CPL R$ 1,25: 560 leads e 56 pedidos, pico R$ 903, sobra R$ 172); com CPL R$ 1,75 são 400 leads e 40 pedidos.

> **2026-10-08, noite: a `turn` no ar é a v14 (`agent_version` 14); o bloco "Onde estamos — 2026-10-08,
> noite" logo abaixo vale, o resto do quadro é histórico.**
>
> ~~**2026-10-08, tarde (sessão `claude/gracious-hopper-9a79su`, PR #56):** `turn` **v13** publicada (ver
> "Executado"); 12 personas + 4 repetidas, 407/407 mutações, 7010 testes. Próximo: a pergunta do número da
> calça repetida (mesma regra do CEP), as 3 conversas dos amigos do operador e o L2.~~ ✅ a v13 foi
> superada pela v14 (2026-10-08, noite): a pergunta do número da calça repetida virou o gate `size_insist`.
>
> **Fim da sessão de 2026-10-07, noite.** `whatsapp` v19 no ar (áudio transcrito; falta a prova real com
> uma nota de voz — provada pelo operador em 2026-10-08). `turn` v12 **publicada em 2026-10-08** (função v84,
> commit 87e2922, `pnpm deploy:turn`), com a migração 0024 aplicada antes. Revisão completa do §66 consertada em parte; o que falta está no fim do grafo §66 (decisões 17,
> 18, espera de 2 s na rajada, e os achados baixos). Lead 5983 apagado.

Plano: [`docs/agente-ia/05-plano/09-pipeline-ate-producao.md`](docs/agente-ia/05-plano/09-pipeline-ate-producao.md).
Achados que o motivam: [`docs/agente-ia/10-auditoria/2026-09-29-auditoria.md`](docs/agente-ia/10-auditoria/2026-09-29-auditoria.md).
Mapa do repositório: [`docs/README.md`](docs/README.md). Tudo abaixo deste quadro é histórico.

### Regra de toda sessão que continua o pipeline

**Ao começar**, antes de qualquer trabalho:
1. Conferir o estado real, não o escrito: `git log origin/main`, PRs abertos, o que está no ar
   (versão da `turn`, `CANAL_ATIVO`, última execução da Action `Hermes`).
2. Atualizar as três partes abaixo — **onde estamos**, **executado**, **falta** — se algo mudou
   desde a última sessão (o operador ou o sócio podem ter feito etapas fora de sessão).
3. Dizer ao operador, em até cinco linhas: a etapa atual, o que foi executado desde a última
   sessão e o próximo passo.

**Ao terminar**, atualizar o quadro de novo, com data e evidência (commit, PR, execução, print).
Etapa sem evidência não vai para "executado". Nada de apagar linha: a etapa feita muda de lista.

Legenda: ✅ feito · 🔄 em andamento · ⬜ não começado · ⛔ bloqueado (diz por quê).

### Onde estamos — 2026-10-09, fim da sessão `claude/malu-script-conversion-analysis-3wb9tp` (LEIA PRIMEIRO)

**Próxima sessão: construir o portal de análise de dados e otimização operacional** (decisão do operador:
antes do próximo teste real). Comece por [`05-plano/11-portal-briefing.md`](docs/agente-ia/05-plano/11-portal-briefing.md)
— as 5 decisões do §8 já foram tomadas pelo operador em 09/10 (estão no briefing; só falta confirmar Vercel ×
localhost para o acesso). A sessão abre com os repositórios `Ricos-com-AI` e `portal-encorpa`.

**No ar (conferido em 2026-10-09):**
- `turn` **`agent_version` 15** = função v90 (commit `975c9d8`); `whatsapp` **v24**.
- Migração **0025** aplicada (`orders.size` pode ser nulo).
- n8n: "Venda confirmada" versão ativa `b3a3b90e…` (lê o tamanho pelo código do produto da Coinzz e pelas
  variações da Logzz; sem tamanho, grava assim mesmo e manda o e-mail "Venda gravada SEM tamanho"); "WhatsApp
  envio" versão ativa `25ce1447…` (leitura sem "digitando"). `pnpm dev:n8n`: os 6 workflows ok.
- Modelo da conversa `muse-spark-1.3-contributor` (do operador, nunca troque). E-mail do suporte: o do config
  (`contato@encorpa-fashion.com.br`, confirmado pelo operador).

**O que entrou nesta sessão (grafo §67, todas as rodadas):**
- Cobertura com o CEP em qualquer escrita (a Coinzz só aceita dígitos); CEP que não existe é dito e pedido de novo.
- "Paguei" → verificação → pendente aos 5 min → comprovante → e-mail do suporte.
- "Ok" sozinho fica sem resposta, com oferta de ajuda depois de 10 min.
- Lembrete do checkout aos 10 min do link.
- E-mail no antecipado (guardado); dado recusado = "sem problema" e o link diz o que preencher.
- Prompt mais vendedor e sem repetição.
- Sem "digitando"; a Malu lê imagens; a venda é gravada mesmo sem tamanho.

**Validação:**
- `pnpm test` 7113; `dev:conversas` 1665/1665; `dev:gates` 0 afrouxamentos sem aceite; `typecheck:function` ok.
- Mutações `G67-*` 22/22.
- Revisões Opus até "aprovado com ressalvas" (ressalvas no grafo §67).
- Todas as frentes de webhook/API testadas pela produção: [`docs/operacao/frentes-de-integracao.md`](docs/operacao/frentes-de-integracao.md).

**Falta, nesta ordem:**
1. **Portal** (próxima sessão), pelo briefing acima.
2. **Teste real completo** do operador e do sócio: um antecipado pagando o Pix de verdade e um com pagamento na
   entrega. Roteiro no fim de `frentes-de-integracao.md`.
   - Conferir que as duas vendas entram em `orders` com o tamanho certo; o formato real do tamanho só aparece na
     primeira venda real.
   - Auditar as duas conversas como no L2.
3. Conversas dos amigos (9393, 7745) — ainda não auditadas.
4. Guias de troca e devolução — pendente por decisão do operador.

Os templates da Meta estão colados e aprovados (operador, 09/10). Os webhooks de teste da Coinzz e da Logzz
chegaram (09/10); a integração duplicada "N8N - antecipado" foi apagada pelo operador.

### Onde estamos — 2026-10-08, madrugada (sessão `claude/malu-script-conversion-analysis-3wb9tp`; superado pelo bloco acima)

**Consertos do L2 feitos na branch, NÃO publicados** (grafo §67; decisões do operador em 08/10): cobertura com o
CEP só em dígitos e falha = região desconhecida; "paguei" verifica, espera 5 min, pede o comprovante e só então
chama pessoa; Pix não pago não arma "já pago"; "ok" sozinho sem resposta + ajuda com o dado em 10 min; lembrete do
checkout aos 10 min do link (só pedido/link novo/opt-out/pessoa cancelam); e-mail só no antecipado (nome → e-mail →
CPF, não gravado); prompt (variação, ressalva como argumento, reversão de risco, pergunta no fim, região antes do
CEP, "frete por conta do cliente"); sem "digitando" e tiques azuis 2 s depois. Validação: `pnpm test` 7053,
`lint`, `typecheck`, `build`, `typecheck:function`, `dev:conversas` 1665/1665, `dev:gates --fail-on-loosen` 0
sem aceite; depois de seis passadas de revisão Opus (todos os achados consertados; resíduos de frase no grafo §67) `pnpm test` 7083 e mutações `G67-*` 16/16. **Próximo:** "pode publicar" do operador → `pnpm deploy:turn` e a função
`whatsapp`; `whatsapp-envio` no n8n (ramo de leitura sem digitando, dormente); prova pela porta de produção (CEP de
São Paulo com as duas opções) e novo teste real do operador e do sócio, conferindo o webhook da Coinzz.

**L2 auditado (antes dos consertos):** [`10-auditoria/2026-10-08-teste-real-l2.md`](docs/agente-ia/10-auditoria/2026-10-08-teste-real-l2.md)
(Leila 5983 e Fabiana 7967, `agent_version` 14). **Achado P0:** a `turn` manda o CEP com hífen à Coinzz,
que responde 422, e `readAvailability(null)` lê "sem pagamento na entrega" — **toda cliente com CEP ouve
que a região não tem entrega** desde a v12 (reproduzido: 04710-090 → 422, 04710090 → 3 datas). Também:
"paguei" vira handoff mudo; zero execuções do "Venda confirmada" (pagamento real? webhook da oferta
antecipada?); "ok" sozinho ganha resposta; lembrete do checkout cancelado por qualquer mensagem; e-mail
exigido pelo checkout do antecipado; "digitando" instantâneo. **Próximo:** o operador confirma a lista e a
ordem da auditoria; conserto da causa 1 primeiro.

### Onde estamos — 2026-10-08, noite (sessão `claude/gracious-hopper-9a79su`, PR #56)

**No ar (conferido pela API de gerência da Supabase em 2026-10-08):**
- `turn` **`agent_version` 14** = função v88, commit `bed2ee3` publicado, código idêntico ao da árvore `4dcf779`.
  Modelo da conversa `muse-spark-1.3-contributor` (do operador, à mão — **nunca troque**). Teto R$ 1,00.
- `whatsapp` com **transcrição de voz** (Meta `muse-voice-transcribe-1.0`): decodificação Ogg/Opus pelo
  `OpusDecoder.js` vendorizado, arquivos yEnc de URLs jsDelivr fixadas por hash em `deno.lock`. Prova real
  de uma nota de voz feita pelo operador em 2026-10-08. Detalhes e limites em
  [`docs/operacao/whatsapp-cloud-api.md`](docs/operacao/whatsapp-cloud-api.md).
- Migração **0024** (apaga e-mail guardado) aplicada.

**Conferido no repositório em 2026-10-08, ao escrever isto:** `pnpm test` = **7017 testes, 69 arquivos,
todos passando**; **28 gates** em `src/agent/guardrails.ts` (os do §66: `pending_promise`, `noted_claim`,
`size_claim`, `cep_insist`, `hook_repeat`, `size_insist`); migrações 0001–0024. Não rodei nesta edição
`typecheck:function`, `dev:conversas`, `dev:gates` nem `verificar:guardas`.

**O que mudou desde o segundo teste real (grafo §66, auditoria com a tabela "Situação depois do conserto"):**
consulta de cobertura da Coinzz com o cabeçalho XHR (sem ele, região sempre nula); descadastro × pedido de
link; saudação pela hora em duas bolhas e link fixo em três; **e-mail fora do fluxo** (só se pede tamanho,
CEP, nome e CPF; a pergunta de pagamento fica: frete grátis na entrega, antecipado com frete por região);
"Ainda está aí?" aos 20 min e `silence_1` a 1 h, cada um no máximo uma vez por dia; espera de 2 s na rajada
que já tem mais de uma mensagem; decisão 16 (todas as reescritas vetadas: preço ou pessoa); `spoken()` para
áudio transcrito.

**Hermes:** `hermes/historico-inicial.md` (lido como `historico.md` depois de `decisoes.md`) e 11 decisões
do §66 semeadas em `hermes_proposals` com códigos `2026-10-08 §66-1` … `§66-11` (status `published`,
`published_at` nulo — não são medidas automaticamente — e já notificadas). Conferidas no banco em 2026-10-08.
**Atenção para o L2:** o link do antecipado nunca saiu em produção (só o da entrega, `entrega.logzz…`,
que responde 200) — conferir no primeiro teste que o link que chega é o do pix/cartão.

**Decisões do operador em 2026-10-08 (plano):** template `order_eve` **submetido à Meta, aguardando
aprovação**; verbas L3: Copy R$ 300, Região R$ 200, caixa R$ 1.500 (superadas em 2026-10-09 por R$ 700 e R$ 1.325, R19.1); Mês 1 item 3 (`askMarketingOptIn`)
feito; item 8 (portal no Vercel) continua no plano.

**Leads de teste:** 5983 e 7967 apagados para novos testes. As conversas dos amigos (finais **9393** e
**7745**) **aguardam auditoria** pelo roteiro de [`docs/operacao/auditar-conversa-real.md`](docs/operacao/auditar-conversa-real.md).

**Falta, nesta ordem (para a próxima sessão — comece por aqui):**
1. **L2 — duas conversas reais do operador e do sócio:** checkout antecipado (Coinzz) e checkout com
   pagamento na entrega (Logzz). O operador manda um "ok" com o final de cada número quando estiverem
   prontas; audite cada uma pelo roteiro [`docs/operacao/auditar-conversa-real.md`](docs/operacao/auditar-conversa-real.md)
   (leituras no Supabase: `messages`, `turn_outcomes`, `gate_traces`, `llm_calls`, `followups`, `leads`;
   execuções no n8n). **Confira que o link do antecipado chegou** — ele nunca tinha saído em produção.
   Cada defeito: teste com a frase literal + negações → espelho → mutação → revisão Opus → grafo → publicar
   só com o "pode publicar". A auditoria vira arquivo em `docs/agente-ia/10-auditoria/` e **não se apaga**.
2. Auditar as conversas dos amigos **9393** e **7745** (o operador manda os prints/ok).
3. **Adiado pelo operador (08/10), não esquecer:** guias de troca de tamanho e de devolução para a Malu
   orientar a cliente (rascunho em [`06-script/06-devolucao-guiada.md`](docs/agente-ia/06-script/06-devolucao-guiada.md),
   não aprovado). O operador perguntou à Logzz/Coinzz se a cliente pode pedir troca/devolução direto com
   elas — **resposta pendente**; ela decide o desenho.
4. Templates na Meta (08/10): `encorpa_cupom_super_dia` (silence_3) **aprovado, em `en`** por engano do
   cadastro (usar `"language": "en"`); `encorpa_vespera_entrega` e `_pago` em `pt_BR`. Bloco `channel.templates`
   entregue ao operador para colar no `BUSINESS_CONFIG` (ver `06-script/03-templates-meta.md`, topo). Conferir
   na próxima sessão se o operador colou e se as vésperas foram aprovadas.
5. Mês 1 item 8 (portal no Vercel) continua no plano.

**Credenciais:** `SUPABASE_ACCESS_TOKEN` já é segredo do GitHub Actions (operador: há duas semanas).
Modelo da conversa `muse-spark-1.3-contributor` — do operador, nunca troque.

**PR #56:** tudo desta sessão está nele (branch `claude/gracious-hopper-9a79su`); merge na `main` pedido
pelo operador em 08/10 — feito quando o CI do último commit fechou verde (ver o PR).

### Onde estamos — 2026-10-07, noite (sessão `claude/gracious-hopper-9a79su`; superado pelo bloco acima)

**Conferido ao começar:** `main` = `78b3e74` (PR #55 mergeado); `turn` v82 = `agent_version` 11
(`ef521e6`, código de `24e9268`); `2c0e9ea` na main, não publicado. Leads no banco: 5983 (operador,
bloqueado), 7967, 9393 (amigos, v10/v11), 7745 (v9).
**Em andamento:** análise conjunta com o operador (anotações dele + auditoria `…-leila-2.md` + conversas dos
amigos). Achado novo: a consulta de cobertura da Coinzz responde de novo com o cabeçalho
`X-Requested-With: XMLHttpRequest` (sem ele, 302 desde 24/09 — O-01); em produção a região é sempre nula.
Nenhum código mudou ainda — esperando o operador confirmar a lista e a ordem.

### Onde estamos — 2026-10-07, tarde (sessão `claude/hopeful-cori-dlzhvu`)

**No ar:** `agent_version` **11** = `turn` v82 = código do commit `24e9268`, publicado de `ef521e6` em 2026-10-07 13:37 UTC (sonda sem selo: 400 "externalId e from são obrigatórios", `sealed:false` — a função sobe e recusa o que não vem do n8n).
Modelo da conversa: `muse-spark-1.3-contributor` (do operador, à mão — **nunca troque**). Teto R$ 1,00.

**O que a v11 mudou sobre a v10** (grafo §65; cinco defeitos que sobraram no código da v10, achados na
auditoria da conversa da Leila e portados para o desenho do PR #54):
1. Link não é reenviado depois de 3 mensagens: só se ela pedir ou se o pedido mudar (caminho/kit);
   a conversa inteira é lida pelos hosts do checkout, não só a janela de 20.
2. "sim" seco às duas opções (onde há pagamento na entrega) não é escolha: a Malu confirma a entrega
   com a frase do padrão e o "sim" seguinte grava `cod`. Antecipado lido pelo intérprete ("sim, a com
   desconto") continua valendo.
3. Desistência no turno em que os dados fecham ("desisti", "não quero mais", "deixa pra lá") segura o
   link e a oferta do kit. Recusa de dado ("deixa pra lá o email"), troca de tamanho e "desisti não"
   não seguram.
4. Região sem pagamento na entrega: "ok" à mensagem do antecipado grava o antecipado, e o kit é oferecido.
5. Rascunho nunca sai sem ler o que chegou: leitura que falha em revisão/nova tentativa → resposta de
   espera e e-mail ao operador.

Revisão Opus em três rodadas (NEEDS WORK ×2 → APPROVED WITH RESIDUALS). Validação em `24e9268`: `test`
6758, `dev:conversas` 1665/1665, `dev:gates` 0 afrouxado, `typecheck:function` limpo, `dev:regua` 20 000,
`verificar:guardas` 370/370.

**⚠️ Segundo teste real do operador (07/10, 10:01–10:49, v10 → v11): a compradora deu todos os dados,
pediu o link 5× e não recebeu; no fim foi descadastrada** por "pare de me mandar confirmações, apenas me
mande o link do checkout". Auditoria completa, com 8 causas reproduzidas no código e a ordem de conserto:
[`docs/agente-ia/10-auditoria/2026-10-07-teste-real-leila-2.md`](docs/agente-ia/10-auditoria/2026-10-07-teste-real-leila-2.md)
(grafo §66, **consertado e publicado na v12**, 2026-10-08 — a auditoria tem a tabela causa → conserto → guarda). Em uma linha: opt-out falso; CEP "004710090" (9 dígitos) nunca lido e a Malu dizendo
"anotei"; CEP só pedido quando ela já quer fechar; promessa "já te mando o link" sem gate; recusa do e-mail
lida como "vou pensar" (com "restam 12 unidades" — número sem contagem, reavaliar); `asksForLink` não lê
"checkout"; "o na entrega acho" não gravado; nome completo não gravado. O lead final 5983 ficou
**bloqueado** — apagar antes do próximo teste.

**Na branch, ainda não publicado:** os dois resíduos de uma linha da revisão — "pode mandar não, desisti"
já não conta como compra; "nem quero mais" é desistência (mutações `R65-pode-mandar-negado`,
`R65-nem-quero-mais`). Publicar junto com os consertos do §66.

**Resíduos conhecidos (candidatos ao próximo conserto, com a frase que quebra):**
- "deixa pra lá" sozinho respondendo ao pedido do CPF conta como desistência (sem link; o modelo responde).
- "quero fechar" dias depois, sem pedir o link, não reenvia (o modelo é avisado de que ela já o tem).
- O "sim" seco às duas opções depende do modelo escrever a frase do padrão (`DEFAULT_COD_CONFIRM`).
- `offersPrepayOnly`: "sim" a "…Quer que eu te explique como funciona o pagamento?" grava prepay.

**Como auditar uma conversa real** (o operador vai mandar 3, de amigos dele):
[`docs/operacao/auditar-conversa-real.md`](docs/operacao/auditar-conversa-real.md) — SQL por final do
telefone, as 4 leituras (mensagens, `turn_outcomes`, `gate_traces`, `llm_calls`), checklist de 10 pontos,
caminho do achado ao deploy. Modelo de relatório:
[`docs/agente-ia/10-auditoria/2026-10-06-teste-real-leila.md`](docs/agente-ia/10-auditoria/2026-10-06-teste-real-leila.md).
O lead de teste do operador (final 5983) foi apagado a pedido dele em 07/10, para testar do zero.

**Falta, nesta ordem:**
1. **O operador abre a próxima sessão mandando a análise que ele mesmo fez desta conversa.** A auditoria
   `2026-10-07-teste-real-leila-2.md` é só ponto de partida: analisar **junto com ele**, juntando as
   anotações dele com as dela, e só então consertar (cada defeito → teste com a frase literal → conserto
   no espelho → mutação → revisão Opus → grafo → publicar com o "pode publicar"). ~~Apagar o arquivo
   de auditoria~~ — **revogado pelo operador em 08/10: arquivo de diagnóstico não se apaga**; ele foi
   atualizado com o que resolveu cada causa.
   Depois, auditar as 3 conversas reais dos amigos do operador pelo mesmo roteiro.
2. **O** mergear o PR desta branch.
3. Depois: devolução guiada (a Malu ensina a cliente a pedir a devolução), portal (n8n com o token
   `ads_read` do sócio), templates na Meta (`encorpa_vespera_entrega_pago` teve o texto trocado).

### Onde estamos — 2026-10-07, madrugada (sessão `claude/focused-lovelace-ym1coj`, LEIA PRIMEIRO)

**Conferido ao começar:** `turn` no ar = v78 com o pacote da v76 (`agent_version` 9); migrações até 0022
(**0023 não aplicada**). PR #53 tinha conflito só no título deste quadro — resolvido por merge (`1b8ad71`).

**Feito nesta sessão (tudo na branch, também empurrado para a do PR #53 até `6122dd9`):**
- "Falta" 1 da sessão anterior **fechado**: o WIP `f657faa` revisado pelo Opus em cinco rodadas (NEEDS WORK
  ×4 → APPROVED WITH RESIDUALS, resíduos consertados em `c22d187`); grafo §63; decisão R18.8.
- "Falta" 2 **decidido pelo operador: opção 1** — resposta com link arma só o lembrete de 15 min (sem "Ainda
  está aí?" nem `silence_1`); a pergunta de ofertas segue também esse lembrete (`optInFollows`).
- `WA-envio-desligado` reescrita para o canal ligado (operador autorizou).
- Validação em `c22d187`: `test` 6556, `dev:conversas` 1665/1665, `dev:gates` 0 afrouxamento sem aceite,
  `dev:regua` 20 000 casos, `typecheck:function` limpo; `verificar:guardas` 342/342 em `a2d1a10` + as duas
  mutações alteradas depois, pegas em `c22d187`.

**Depois (mesma sessão, 07/10):**
- **0023 aplicada** em produção (`20261006221247_0023_replying_since`, autorizada pelo operador).
- **Modelo de produção:** desde 06/10 19:30 UTC a `turn` roda `muse-spark-1.3-contributor` (segredos
  conferidos pelo hash SHA-256; `CLAUDE.md` corrigido).
- **Quatro rodadas de 12 personas** contra a `turn` do disco (porta `local`): uma no padrão (R$ 5,23) e três
  no contribuidor (R$ 0,33 · 0,22 confirmação · 0,37 final). Defeitos reais achados e consertados (grafo §64):
  nota interna do modelo vazando ("Need ask CEP."), 4 balões, e-mail pedido 3×, kit colado no pedido de dado,
  preço segurado até o CEP, "a maioria chega aqui" vetado, nome na 1ª linha acima da rua, CPF recusado 3× sem
  link, frase do "vou pensar" repetida. Cada conserto revisado pelo Opus até aprovar; mutações `P07-*`.
- Rodada final no contribuidor: 12/12 sem resposta pronta, nenhum balão a mais, nenhuma nota interna;
  custo ~R$ 0,03 por conversa.
- Ver a memória `proxy-sobrescreve-auth-do-supabase` antes de rodar personas pelo container.

**No ar desde 2026-10-07 08:17 UTC:** `agent_version` **10** = `turn` v80 = commit `a5d4837`
([PR #54](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/54), CI verde, `verificar:guardas` 362/362).
Sonda pela porta `function`: 401 "mensagem sem o selo da entrada" — a v10 sobe e a porta segue fechada a
quem não vem selado pelo n8n. A prova da conversa em produção é o teste do operador pelo WhatsApp.

**Falta, nesta ordem:**
1. **O** teste real pelo WhatsApp (a partir das 06:00 de São Paulo — antes disso a resposta é adiada para a
   abertura). Roteiro mínimo: "quanto custa?" antes do CEP (deve dar o preço), um CEP com pagamento na
   entrega e um sem (Manaus 69050-000 — só antecipado, com o motivo), o tamanho pela calça, a escolha "a
   primeira", nome/e-mail/CPF (recusar o CPF duas vezes → o link sai sem ele), "vou pensar".
   Conferir `turn_outcomes.agent_version = 10`. Apagar o lead de teste depois.
2. **O** mergear o PR #54 e fechar o #53 (superado).
3. Depois: devolução guiada, portal, templates na Meta.

### Onde estamos — 2026-10-06, noite (sessão `claude/hopeful-cori-dlzhvu`, LEIA PRIMEIRO)

**No ar:** `agent_version` 9 (`turn` v76, commit `1026821`). Canal WhatsApp **ligado e testado de ponta a ponta**
(webhook da Meta verificado, n8n "WhatsApp envio" com credencial Header Auth "WhatsApp Cloud API",
`PHONE_NUMBER_ID` 1370670962794717, `CANAL_ATIVO=true`). "Venda confirmada" no n8n com o aviso de status novo
(versão ativa `23768d23`). Teto R$ 1,00. Modelo: o **operador** troca `CONVERSATION_MODEL` à mão (memória
`nao-relembrar-pendencias-do-operador`) — nunca o Claude.

**Publicado hoje (v5→v9):** v5 cancelamento por forma de pagamento (§54–§56) e véspera do pago "ninguém para
receber" (§53); v6 vocabulário de status Logzz/Coinzz + e-mail de status novo (§57); v7 nunca se anuncia
virtual sem pergunta (§58); v8 rajada de mensagens = uma resposta (§59); v9 sem escada "não entendi" (§60).

**Commitado e NÃO publicado:**
- `7c8bc7c` rajada v2 (§61): espera 5 s; mensagem que chega enquanto escreve é incorporada (revisão, máx. 2),
  não descartada; lock `conversations.replying_since` (**migração 0023 — aplicar ANTES do deploy**);
  "Ainda está aí?" (`still_there`) 10 min após pergunta sem resposta; "sim" ao lado de pergunta não confirma.
  Revisão: NEEDS WORK — (1) "Sim! Como faço pra pagar?" perdia o link; (2) sem 0023 cada rajada era
  respondida 2×. As duas correções estão no trabalho em andamento abaixo.
- `e46ddbc` prompt de venda v2 (§62), do desenho `docs/agente-ia/06-script/05-conversa-de-venda-v2.md`.
- `d502a70` o desenho (117 perguntas, arco em 8 etapas, Leila reescrita).

**Em andamento (WIP commitado como "wip:" se a sessão acabou no meio — conferir testes):** o código obedecendo o
prompt v2: link só com tamanho + CEP + forma de pagamento + nome + e-mail + CPF (CPF recusado 2× → link sem
ele); tamanho escolhido no checkout (sem "complemento"); "vou pensar" sem link; diretiva de região
independente do tamanho; telefone sem 55 na Coinzz; oferta de kit 2/3 peças UMA vez depois da escolha da
forma de pagamento, com link do checkout específico do kit; gates `charge_promise` (negação "não faz pagamento
na entrega"), `delivery_promise` ("um dia em que você vai estar"), `coverage_claim` (antes da consulta do CEP);
+ as 2 correções da revisão de `7c8bc7c`. Arquivo novo `tests/link-after-data.test.ts`. Entrada do grafo §63
a escrever.

**Decisões do operador hoje (não reabrir):** público do anúncio não convencido → valor e segurança antes do
preço; duas opções lado a lado só com pagamento na entrega na região (sem: só antecipado + motivo "a
transportadora ainda não tem pagamento na entrega"); "sim" = entrega só onde existe; até 3 balões, um assunto
cada — primeiro as perguntas dela na ordem, depois o que ela contou, depois a próxima pergunta; recepção fixa
NÃO muda; e-mail pedido nos dois caminhos e guardado (Logzz não mostra); Coinzz: tamanho escolhido no checkout;
pós-parto/gestante fora; "vou pensar" sem link; CPF recusado 2× → link sem CPF.
**Fatos do produto (operador):** poliéster + elastano, forro de algodão, colchetes que não enrolam, sem
barbatana; não dá calor; o dia todo; pode dormir; exercício sim; lavar à mão, água fria, secar à sombra (site);
só preto; "pega o abdômen e as costas por completo, e tem alças"; na entrega ela escolhe como pagar, outra
pessoa pode receber e pagar, ninguém em casa → volta ao centro e a entrega é frustrada; antecipado por Correios
ou transportadora conforme a região, com rastreio, sem boleto; confiança: só site e e-mail.

**Falta, nesta ordem:**
1. **C** terminar o código acima → revisão Opus → `pnpm verificar:guardas` (ids `R10.4-armado`,
   `R10.4-resposta`, `WA-janela-no-fim`, `G58-fiacao`) → grafo §63.
2. **O decide:** toques depois do link — proposta (1) com link só o lembrete do link aos 15 min, sem "Ainda
   está aí?"; sem link "Ainda está aí?" 10 min + `silence_1` 30 min; ou (2) manter os três em 30 min.
3. **C** aplicar a migração 0023 e `pnpm deploy:turn` (v10) — precisa de `sbp_` e do "pode publicar" do operador.
4. **C** rodada das 12 personas no modelo (taxa de link, reescritas, balões, as duas opções) antes do teste humano.
5. **O** teste real pelo WhatsApp (o lead de teste final 5983 está no banco; apagar para testar a abertura).
6. Depois: ensinar a guiar a devolução; portal (operador decidiu manter, com fluxo n8n + token `ads_read` do
   sócio); templates na Meta (texto do `encorpa_vespera_entrega_pago` mudou: "Se não tiver ninguém para
   receber…").

### Onde estamos

**2026-10-05 — mês 1 no ar, Malu v3** (branch `claude/determined-bell-6ilmig`, [PR #51](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/51)).
Estado conferido ao começar: PR #50 mergeado (`2ef7b03`), migrações só até 0020, `turn` v49 (pacote de 30/09).
- **0021 e 0022 aplicadas** (conector Supabase); `BUSINESS_CONFIG` com teto R$ 0,55 / tolerância 0 e
  `askMarketingOptIn` colado pelo operador. n8n (Turno com Wait `?? 60`, "Hermes — decisão") já igual ao `main`.
- **`agent_version` 1** = `2ef7b03` (`turn` v51). Sonda pela porta do n8n com `source` de anúncio: recepção na
  hora, resposta em 80 s, `entry_at` gravado, `silence_3` em +71 h (07:19 BRT), `silence_2` em +23 h,
  `turn_outcomes.agent_version = 1`. REST da Supabase **200** neste container (o 401 acabou).
- Rotina **"Hermes – decisão"** criada (`trig_01SR8fhPWmJktwR8oVTfd3gV`, sem cron, sessão nova por disparo).
- Rodada de personas na v1 (porta `function`): 6/12 caíram por 502 — o proxy do container corta em ~40 s, o
  runner apagava o lead e a `turn`, ainda rodando, dava FK 23503 (500 no log). Não é defeito de produção
  (n8n espera 150 s; turno mais lento 50 s). **Defeito real (Lu):** "quero cancelar o pedido" ficava com a
  Malu e ela disse "já deixo cancelado" → **`agent_version` 2** (`edb775f`, `turn` v53): o pedido dito vira
  contexto de pedido (handoff R16.9) e gate novo `order_action_claim`. Sonda: handoff "a cliente quer cancelar um pedido".
- Rodada na v2 (porta `local`, Deno instalado no container, 12/12, R$ 3,76): Lu e Vera → pessoa na 1ª
  mensagem. **Defeitos:** Jussara foi para pessoa por teto no "sim" dela — `shipping_promise` lia "Isso
  mesmo, você não paga nada antes" ao lado da frase do frete grátis como o grátis estendido ao antecipado;
  Karol ouviu "tava guardando seu M" → **`agent_version` 3** (`turn` v55). Gate diff: 3 afrouxamentos, todos
  aceitos (`P-2026-10-05`), só nos contextos da entrega; 4/4 mutações novas pegam.
- **`agent_version` 4** (`turn` v57, R18.7, operador): escada do "não entendi" depois de qualquer pergunta
  enquanto o tamanho não está definido (Neusa); teto padrão **R$ 1,00** / tolerância 0 e critério de pausa de
  custo R$ 1,00. Sonda pela porta do n8n: "oi" → resposta do modelo; "ta" → "Desculpa, não entendi, qual o
  tamanho que deseja?" (`escada do tamanho`, v4). **O:** colar `"conversationCapBrl": 1.0` no `BUSINESS_CONFIG`.
- **Parte B adiantada (operador autorizou, 2026-10-05, 13h UTC):** segredos `WHATSAPP_VERIFY_TOKEN` e
  `INBOUND_SIGNING_SECRET` gravados; função **`whatsapp` v1 publicada** (`verify_jwt` false);
  `TURN_REQUIRE_SERVICE_ROLE=true`. Provas: verificação da Meta 200 com o token certo e 403 com o errado;
  POST sem assinatura 401; mensagem **sem selo** pela porta do n8n → 401 "mensagem sem o selo da entrada"
  (nenhum lead criado); mensagem **selada** → recepção, resposta v4, `sealed: true`, "WhatsApp envio" roda e
  não envia (`CANAL_ATIVO` desligado); Relógio `swept` com a porta fechada; os cinco nós que chamam a `turn`
  usam a mesma credencial "Supabase service_role". **Sondas e personas pela porta do n8n agora precisam de
  `INBOUND_SIGNING_SECRET`** no ambiente (o runner sela); o valor não está no repositório — gere outro se perder.
- **Sem conserto:** Marcinha — falha da API do modelo na reescrita → handoff na 1ª mensagem (não reproduzido).

**Etapa atual: L0 — Preparar.** L0.3, L0.4, L0.7 feitos; R17.4 mergeado (PR #47, `41203ba`) e no ar
(`turn` v46). **L0.5 rodado em 2026-09-30** (12 personas, modelo padrão): p95 R$ 0,546 por conversa,
3 de 12 bateram no teto de R$ 0,50 — **o operador fixa o teto pelo p95** (números abaixo).
**L1.1 feito em 2026-09-30, 22h UTC:** Turno, Relógio, Venda e Envio do `main` publicados no n8n pela
API, `dev:n8n` `ok` nos seis; o Turno respondia ao webhook só depois do Wait — consertado (grafo §46).
**L1.2 feito em 2026-10-01:** `CONVERSATION_MODEL` e `CONVERSATION_MODEL_PRICE` apagados dos segredos
da Supabase → a `turn` usa o padrão do código, `muse-spark-1.3`; sonda pela porta `function`: R$ 0,082
e R$ 0,150 acumulados em dois turnos (ritmo do modelo padrão; o `-contributor` era ~15× mais barato).
**PR desta sessão:** [#48](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/48) (branch
`claude/blissful-einstein-x0fjp8`) — o n8n já roda o Turno dela; o `main` fica atrás até o merge.
Decisão R17.5; grafo §46–§48.
**Bloqueio principal:** sem L0.1 (sócio) não há como atender lead real.

**Estado conferido em 2026-09-30, 21h UTC:**
- `main` em `41203ba` (merge do PR #47), CI run 117 `success`. `turn` **v46** publicada desta sessão a
  partir do `41203ba` (`updated_at` 21:00:08 UTC, `entrypoint_path` `…_46`); o `ezbr_sha256`
  (`b79a6dbb…`) é igual ao da v45 (20:28:32 UTC) — a v45 já era esse pacote, o R17.4 estava no ar.
- Hermes: execução 8 verde (19:54 UTC, na branch `claude/nice-gates-2yer56`).
- Supabase REST: **a causa do 401 era o host da credencial** "Supabase (Dados)", presa a
  `hbmkgakzrqmd1svszjeo` (número 1) em vez de `hbmkgakzrqmdlsvszjeo` (letra l); o operador corrigiu.
  Nesta sessão o proxy ainda respondeu `401 No API key found` (a sessão começou antes da troca, ou a
  credencial não injeta `apikey`) — o L0.5 rodou com a service_role passada pelo operador na conversa,
  só em variável de ambiente. **O:** gerar service_role nova no painel e atualizar n8n, ambiente e
  segredos da Action; conferir numa sessão nova que o REST dá 200 sem cabeçalho de chave.
- Histórico: `turn` v44 (`updated_at` 30/09; a 1ª tentativa deu 500 e só subiu o número para 43 sem trocar o
  pacote — conferir `updated_at` e `entrypoint_path`, não só a versão).
- n8n: "Responder cliente" `3Q18SjoW0UUXrTPI` ativo, `dev:n8n` `ok`. Ao ativar depois do teste pelo
  editor, a versão ativa veio **sem senha** — desativada, consertada pela API, reativada
  (memória `n8n-editor-tira-senha-do-formulario`). "Turno da agente" e "Relógio da régua" seguem
  acusando o atraso do L1.1.
- n8n (30/09, 22h): versões ativas Turno `e2e2804e`, Relógio `3d3cd9d6`, Venda `1ce55289`, Envio
  `c2f3c1c3` (conteúdo = `main`); `dev:n8n` `ok` nos seis; Relógio rodou `success` depois da troca.
  Sonda pela porta do n8n: a 1ª mensagem volta `welcomed` na hora e a retomada responde dentro do
  n8n; o turno com modelo dá 502 **do proxy deste container** (corta em < ~40 s) — conversa inteira
  pela porta do n8n só fora do container ou pelo canal (memória `porta-n8n-do-container-bate-no-proxy`).
  Os leads que o turno atrasado recriou depois da limpeza foram apagados (`leads` = 1).

**L0.5 — rodada `2026-09-30T21-08-04-483Z-local`** (porta `local`, `turn` do disco em `41203ba`,
`CONVERSATION_MODEL=muse-spark-1.3`, `BUSINESS_CONFIG` do exemplo com Malu, SUPER20 ativo, sem
depoimentos, teto R$ 0,50 com tolerância 0). Gasto R$ 3,76 de R$ 5; nenhum ORDER_READY; limpeza
conferida (`leads` voltou a 1, `followups` a 0). Validações na mesma árvore: `lint`, `typecheck`,
`test` (5893), `build`, `dev:conversas` (1640/1640), `dev:gates` (0 afrouxou) e `typecheck:function`
verdes.
- Custo da Malu por conversa: **p50 R$ 0,268 · p95 R$ 0,546 · máx R$ 0,546** (média R$ 0,310);
  ~R$ 0,07 por turno, então o teto de R$ 0,50 chega por volta do 7º turno.
- **3 de 12 no teto** (jussara 0,546 · tati 0,545 · marcinha 0,513) — as três viraram handoff
  "teto de custo da conversa antes da reescrita". A chamada que cruza o teto já foi paga e é descartada:
  o teto real fica ~R$ 0,07 acima do nominal.
- Vetos por gate: `delivery_promise` 6 · `installment_promise` 4 · `shipping_promise` 3 ·
  `warranty_promise` 3 · `price_promise` 2 · `coupon_exists` 1 (+1 aviso `unavailable_offer`).
  1 resposta pronta em 53 (tati).
- Piores: **tati** (pede R$ 100 e 3x → 2 reescritas vetadas → resposta pronta "me fala de novo o que você
  quer saber?" → handoff por teto); **marcinha** (G cravado só com manequim, sem medida — a falha que
  ela caça passou os gates —, 1 reescrita por resposta, depois handoff por teto); **jussara** (8
  respostas ainda em `conversando`, handoff por teto justo na pergunta "só pago quando chegar?").
  Só relatado: nenhum gate ou prompt mudou por causa disso.

**2026-10-02 — mês 1 definido com o operador** (branch `claude/lucid-volta-nnk2nq`): L3 reescrito
em [`09-pipeline-ate-producao.md`](docs/agente-ia/05-plano/09-pipeline-ate-producao.md) — Copy dias
1–5 R$ 400, Região dias 6–10 R$ 400, Leitura 11–12, decisão no dia 12; caixa reservado R$ 1.200
(todo custo do pedido até virar dinheiro); piso 500 leads + 50 pedidos; pausa manual (premissa > 5%,
handoff > 10%, opt-out > 2,5%, API > R$ 0,75 em > 5% dos últimos 100, caixa, canal); primeira resposta
em 1 min; Hermes publica a cada lote, com versão por conversa e reversão. **Metas por fase e as 8–15
métricas por criativo/região ainda a definir com o operador.** E-mails do Hermes em
[`hermes/EMAILS.md`](hermes/EMAILS.md). Janela gratuita do CTWA = 72 h (o memorando de opt-in dizia
7 dias — corrigido). Meta Business validada e app instalado; **falta o WABA validar** (S).
**Plano de execução dos itens 3–8:** [`10-execucao-mes-1.md`](docs/agente-ia/05-plano/10-execucao-mes-1.md)
— **O:** `"channel": { "askMarketingOptIn": true }` no segredo `BUSINESS_CONFIG` (§3 do plano);
**C:** régua 63–71 h / `silence_2` < 24 h (§4a), 1 minuto (§4b), versão por turno + migração 0021
(§5), Rotina "Hermes – decisão" + e-mails (§6), lucro por venda (§7), portal Vercel (§8). API de
cancelamento/devolução reconfirmada inexistente em 02/10 (print: só `POST /api/sales`, R16.9). Grafo §49.

**2026-10-02, noite — mês 1, ondas 1 e 2 construídas** (branch `claude/ricos-pipeline-mes-1-vjgx7v`).
Estado conferido ao começar: PRs #48 e #49 mergeados, `main` `9ee0516`; `turn` v49 com o mesmo
`ezbr_sha256` da v46 (pacote de 30/09); migrações até 0020; `dev:n8n` `ok` nos seis, iguais ao `main`.
- **Onda 1 — [PR #50](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/50):** §4a régua na janela
  gratuita (âncora `conversations.entry_at`, migração **0022**), §4b 1 minuto, §5 versão da Malu (migração
  **0021**, `pnpm deploy:turn`), §7 lucro por venda; R18.1–R18.5, grafo §49–§51. Validação local verde
  (5956 testes, 1640/1640, 0 afrouxou), 314/314 mutações; revisão Opus aprovada com resíduos.
- **Onda 2 — no mesmo PR #50** (depende da versão da onda 1): e-mails do Hermes com o texto de
  `EMAILS.md`, sem link e com citação redigida; Rotina `hermes/DECIDIR.md`; reversão determinística
  `REVERTER-vN`; R18.6, grafo §52. Revisão Opus: reprovada → corrigida → aprovada com resíduos
  (`b0ae69d`). Validação local verde (6034 testes).
- **Loop de verificação (custo de API R$ 0):** `pnpm dev:regua` — simulação da régua, 110 mil casos
  em quatro sementes, no CI; deploy em `--dry-run` contra produção (15 arquivos do disco, recusa sem a
  0021); e-mails renderizados pelo código do n8n. Personas pela porta local **bloqueadas**: o REST da
  Supabase ainda dá 401 neste container (a credencial não injeta `apikey`).
- §8: proposta de decisões, 12 métricas e metas por fase em `10-execucao-mes-1.md` — fechar com o operador.
- Operador: recusa **R$ 9,99** (R18.3), teto **R$ 0,55** sem tolerância (R18.4). Reserva de R$ 1.200 a
  rever (o §7 calcula R$ 1.970–2.584 com produto e transação na reserva).
- **Não deployado:** a `turn` só sobe depois de **0021 e 0022 aplicadas**, por `pnpm deploy:turn`.

**2026-10-06, manhã — feito pelo operador** (veio do `main` no merge; a lista "Próxima sessão" abaixo foi
executada na sessão da noite — o estado vigente é o quadro "Onde estamos — 2026-10-06, noite" acima): PR #51 mergeado (`main` = `agent_version` 4 no ar);
`cost.conversationCapBrl` 1.0 no `BUSINESS_CONFIG`; checklist da Meta, URL do webhook e
`WHATSAPP_VERIFY_TOKEN` entregues ao sócio. **O operador traz os valores da Meta na próxima sessão.**

**Próxima sessão (manhã de 2026-10-06, já executada) — nesta ordem (C = Claude, com os valores na conversa):**
1. **C** — conferir o estado real: `git log origin/main`, `turn` v57 / `agent_version` 4, função `whatsapp` v1,
   segredos presentes (`INBOUND_SIGNING_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `TURN_REQUIRE_SERVICE_ROLE`), n8n `dev:n8n` ok.
2. **C** — gravar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` nos segredos da Supabase
   (operador já autorizou ações em qualquer plataforma em 2026-10-05; a sessão precisa de um `sbp_…` novo).
3. **S** — Meta → Webhook: URL `https://hbmkgakzrqmdlsvszjeo.supabase.co/functions/v1/whatsapp`, token de
   verificação, campo **messages**; botão **Testar** → conferir 200 no log da função `whatsapp`.
4. **O** — n8n, "WhatsApp envio" → nó "Envia pela Cloud API": credencial **"WhatsApp Cloud API"**,
   cabeçalho `Authorization: Bearer <token permanente>`.
5. **C** — n8n, nó "Monta os envios": `PHONE_NUMBER_ID` e `CANAL_ATIVO = true`; publicar; `pnpm dev:n8n` e
   atualizar a cópia versionada + `tests/n8n-whatsapp-send.test.ts` (Parte C, passo 2).
6. **O + C** — teste de verdade do celular pessoal: "oi" → lida + digitando, recepção, resposta em ~1 min;
   conferir `turn_outcomes` (`agent_version` 4) e o envio no n8n. Apagar o lead de teste depois.
7. **S** — templates aprovados → **C** cadastra em `channel.templates` (o operador cola o `BUSINESS_CONFIG`
   inteiro de novo, com a chave nova).
8. **O + C** — L2: três conversas reais (na entrega, antecipado, troca + handoff respondido).
9. **O** — decidir o §8 do portal; rever a reserva de R$ 1.200 → L3 (tráfego do mês 1).

### Executado

| Etapa | O quê | Evidência |
|---|---|---|
| — | Auditoria do repositório (revisões 1 e 2) e pipeline 80/20 | PR desta branch (`claude/eager-sagan-qn74um`), 2026-09-29 |
| — | Troca de tamanho não é grátis (R17.1), no código | PR #42 mergeado (`75c22c8`), 2026-09-29 |
| — | Valor da troca: R$ 27,00 fixo, cobrado da cliente — na documentação | `05-decisoes-firmes.md` §9, 2026-09-29 |
| — | `BUSINESS_CONFIG` colado pelo operador (sem `exchange`) e `order_shipped`/`order_delivered` agendadas canceladas | operador, 2026-09-29 (fila do PR #42) |
| L0.6 | Merge do PR #43 (Hermes v1); migração `0020` aplicada em produção | `5bf5a15`, 2026-09-29 |
| L0.3 | Decisão: formulário n8n (R17.3). Construído: `job: "human_reply"` na `turn`, `checkHumanReply`, workflow `n8n/workflows/responder-cliente.json`, regra de senha no `dev:n8n`; grafo §43; revisão Opus consertada | `claude/awesome-carson-p64spq` (`c7e14f0`), 2026-09-30 |
| L0.3 | PR #45 mergeado; CI do `main` verde | `a9ba28a`, CI run 108 `success`, 2026-09-30 |
| L0.3 | `turn` v44 publicada; "Responder cliente" importado e ativo com senha; teste com telefone inexistente voltou "Nenhuma conversa com esse telefone" (operador); `dev:n8n` `ok` | v44, workflow `3Q18SjoW0UUXrTPI` versão ativa `d5659dab`, 2026-09-30 |
| L0.4 | `BUSINESS_CONFIG` colado pelo operador | operador, 2026-09-30 |
| L0.7 | Hermes instala na Action pelo instalador oficial no commit fixado (grafo §45); execução manual 8 verde: `Hermes Agent v0.21.5+2011.gac4181f`, `hermes_backlog` lido com os segredos da Action (`0 leads … espera 50`). R17.2 (troca R$ 27,00 fixa) nas decisões e no grafo §39 | run `36768879175`, `d94a2b2`, 2026-09-30 |
| — | Cupom só no follow-up (R17.4): `turnConfig` + `sent_at` só no envio; grafo §44; revisão Opus aprovada com resíduos | `4e33ff7`, `a55343f` na branch `claude/nice-gates-2yer56`, 2026-09-30 |
| L0.4 | `BUSINESS_CONFIG` completo entregue ao operador, com as decisões de 30/09: `coupon.active` true (SUPER20, para o `silence_3`), sem `testimonials`, `scarcity` mantida, teto fixo R$ 0,50 (`overrunTolerance` 0 — o teto real é `cap × (1 + tolerância)`) | operador, 2026-09-30 |
| — | R17.4 mergeado (PR #47) e publicado: `turn` v46 do `41203ba`, mesmo `ezbr_sha256` da v45 | `41203ba`, CI run 117 `success`, v46 21:00:08 UTC, 2026-09-30 |
| L1.2 | Segredos `CONVERSATION_MODEL`/`CONVERSATION_MODEL_PRICE` removidos → modelo padrão na `turn` v46; sonda `function` (cleide, 2 turnos, R$ 0,15) | 2026-10-01 |
| L1.1 | Turno, Relógio, Venda e Envio do `main` publicados no n8n pela API; `dev:n8n` `ok` nos seis. "Devolve a resposta" do Turno movido acima do ramo do Wait (respondia só depois dos 120 s, 502 para quem chama) + regra no `dev:n8n`; grafo §46; revisão Opus aprovada com resíduos | versões ativas acima, 2026-09-30 |
| L0.5 | Rodada das 12 personas no modelo padrão: p50 R$ 0,268 · p95 R$ 0,546 · máx R$ 0,546; 3/12 no teto; vetos e piores no topo do quadro | rodada `2026-09-30T21-08-04-483Z-local`, `41203ba`, 2026-09-30 |
| L3 prep | Mês 1, onda 1 (§4a, §4b, §5, §7) — PR #50; 314/314 mutações; revisão Opus aprovada com resíduos | `6a4bb29`, 2026-10-02 |
| L3 prep | Mês 1, onda 2 (§6) — e-mails, Rotina `DECIDIR.md`, reversão; simulação da régua no CI | PR #50, `b0ae69d`, 2026-10-02 |
| L3 prep | 0021/0022 aplicadas; `agent_version` 1 no ar e sondada pela porta do n8n (régua 63–71 h, 1 minuto, versão por turno) | `turn` v51, `2ef7b03`, 2026-10-05 |
| L3 prep | Rotina "Hermes – decisão" criada | `trig_01SR8fhPWmJktwR8oVTfd3gV`, 2026-10-05 |
| L0.5 | Teto R$ 0,55 / tolerância 0 colado no `BUSINESS_CONFIG` | operador, 2026-10-05 |
| — | Rodadas de personas v1 (`function`) e v2 (`local`); `agent_version` 2 (cancelar → pessoa, `order_action_claim`) e 3 (`shipping_promise` ao lado de "isso mesmo", "guardando seu M") | PR #51, `turn` v53 e v55, 2026-10-05 |
| L0.4 | Link do Mercado Pago de R$ 27,00 recebido; trecho do `exchange` entregue ao operador; passa a validação de `exchangeReply` | operador, 2026-09-30 |
| L0.1, L1.3–L1.5 | Canal no ar: número de produção recebendo e respondendo pelo WhatsApp Cloud API (testes reais do operador e de amigos) | conversas 06/10 ("Leila"), 07/10 ("Leila 2", amigos 7967 e 9393), 08/10 (áudio) |
| — | `whatsapp` v19: áudio da cliente transcrito (Meta ASR); provado pelo operador com nota de voz | 2026-10-08 |
| L4 prep | Hermes ganha histórico inicial (`hermes/historico-inicial.md`, lido como `historico.md` depois de `decisoes.md`): ordem de diagnóstico e os casos §60–§66 com causa → conserto → guarda | `1cf59eb`, 2026-10-08 |
| — | `size_insist`: número da calça no máximo 2× seguidas (Neusa) — **não publicado**, vai na v14 | `4dcf779`, 2026-10-08 |
| — | Lead do operador (final 5983) e lead sintético de 25/09 apagados para novo teste; amigos (9393, 7967, 7745) mantidos até a auditoria | 2026-10-08 |
| — | `turn` v13 (agent_version 13, função v86): achados baixos do §66, `cep_insist` em sequência, parcelamento numa frase só; sonda sem selo 401 | `2782249`, 2026-10-08 |
| — | `turn` v12 (agent_version 12, função v84): segundo teste real consertado (grafo §66), revisão completa, decisões 16–18, migração 0024 (sem e-mail) | `87e2922`, 2026-10-08 |

### Falta (na ordem do plano)

| Etapa | O quê | Dono | Estado |
|---|---|---|---|
| L0.1 | Parte A do canal: app, número, nome de exibição, token | S | ✅ canal no ar (testes reais 06–08/10) |
| L0.2 | Submeter o template `order_eve` (UTILITY) | S | ⬜ |
| L0.5 | Operador fixa o teto pelo p95 da rodada (R$ 0,546) | O | ✅ R$ 0,55 / tolerância 0 no `BUSINESS_CONFIG`, 2026-10-05 |
| L1.1 | Importar os workflows do `main` no n8n; `pnpm dev:n8n` passa | C | ✅ 2026-09-30 |
| L1.2 | `CONVERSATION_MODEL` = modelo padrão | C | ✅ 2026-10-01 |
| L1.3 | Parte B do canal: segredos no Supabase, publicar `turn` e `whatsapp` | O | ✅ `turn` v12/v13 e `whatsapp` v19 no ar, 2026-10-08 |
| L1.4 | Webhook da Meta apontando para a função `whatsapp` | S | ✅ mensagens reais chegando, 06–08/10 |
| L1.5 | Parte C do canal: credencial, `PHONE_NUMBER_ID`, `CANAL_ATIVO=true`, fechar as portas | C | ✅ na prática (canal respondendo); conferir `CANAL_ATIVO` e portas na próxima sessão |
| L2 | Três conversas reais: compra na entrega, compra antecipada, troca + handoff respondido | O + C | 🔄 testes reais de 06–08/10 consertados (§65, §66); falta uma compra concluída em cada caminho e a troca + handoff |
| L3 | Tráfego controlado nas 22 praças; piso de amostra assinado; critérios de pausa | S + O | ⬜ |
| L4 | Hermes com H1–H5 (instala, segredos, rotina de implementação, vê pedido, piso assinado) | C + O | ⬜ |

## ▶ Histórico — fila de 2026-09-29, madrugada (antes do pipeline 80/20)

### ▶ Fila de execução imediata (2026-09-29, madrugada) — branch `claude/inspiring-galileo-98shbt`, PR novo
PR #40 mergeado. Nesta branch (grafo §39–§40, R17.1): troca de tamanho não é grátis; segunda revisão Opus
(10 achados) consertada; depoimento só quando ela pede (gate); `recordOrder` com data ilegível; n8n
`soAData` só `AAAA-MM-DD`. Feito pelo operador em 29/09: merge do #40, `BUSINESS_CONFIG` colado, SQL de
cancelar `order_shipped`/`order_delivered` agendadas.
1. **C** — CI do PR novo verde → **O** merge → **O** publica a `turn` → **C** sonda pela porta do n8n.
2. **O** — reimportar `n8n/workflows/venda-confirmada.json` e rodar `pnpm dev:n8n` (adiado pelo operador).
3. **O — PENDENTE: preço da troca de tamanho.** O operador vai perguntar à Logzz/Coinzz (provavelmente
   varia por região). Até lá `exchange` fica fora do secret: a troca de um pedido vai para uma pessoa,
   e a agente nunca diz que é grátis. Com a resposta, **C** decide o cálculo (hoje `feeBrl` é fixo).
4. **O — adiado até configurar o WhatsApp:** conferir no WhatsApp Manager se o `silence_2` antigo foi
   submetido; se sim, submeter o novo (`03-templates-meta.md`).
5. **C — resíduos:** véspera do antecipado (Coinzz sem data — polling da API no n8n);
   cancelamento/devolução seguem handoff (R16.9); gates de texto continuam sendo listas.

### Hermes v1 — branch `claude/cool-brahmagupta-hccc4p` (2026-09-29)
Análise e conclusão: [`06-analise-hermes-v1.md`](docs/agente-ia/05-plano/06-analise-hermes-v1.md);
grafo §41–§42. Feito no repositório: fonte de produção correta, nada de trecho de cliente no git,
amostra por sinal, números das views no pacote, mentira com a regra do prompt, descarte do que
os gates já vetam, efeito medido das publicadas, e-mail com trecho, deploy que confere a
aprovação e recusa afrouxamento. **Feito pelo Claude em 29/09, com o "pode aplicar" do operador:**
1. migração `0020_hermes_retention.sql` aplicada no Supabase da Encorpa (`hbmkgakzrqmdlsvszjeo`,
   conferido por `list_projects`): colunas, views com `security_invoker`, `purge_expired` novo;
2. nó "Monta o e-mail" do workflow n8n "Hermes: decisão do operador" atualizado e publicado
   (versão ativa `88928b49`); `pnpm dev:n8n` dá `ok` para ele.
   Fora do escopo do Hermes, o mesmo `dev:n8n` acusa "Turno da agente" (campo selado `reply`) e
   "Relógio da régua" (saída de erro): o `main` à frente do n8n, itens da fila acima.
**O:** opcional, variável de repositório `HERMES_MAX_USD` (teto por passada).
Não feito: calibração com ≥ 100 defeitos plantados (precisa de rodada de personas com modelo).

### ▶ Fila de execução imediata (2026-09-29, fim) — branch `claude/happy-planck-izq7jt`, PR aberto
Dono: C = Claude, O = operador. Nesta ordem:
1. **C — segunda revisão Opus** de `8f72d71..HEAD` (`code-reviewer`, `model: "opus"`), mesmo roteiro da
   primeira (grafo §37): sondas pela `runGates`, cenários da régua, mutações. Consertar o que reproduzir.
2. **C — CI do PR verde** (a etapa `verificar:guardas` leva ~30 min) → **O** faz merge.
3. **O — decidir a troca de tamanho:** grátis (hoje a agente pode dizer) ou R$ 20 (política pública
   da Logzz). Se R$ 20: C veta "troca grátis" (desenho pronto no grafo §37, revertido por falta de decisão).
4. **O — colar o `BUSINESS_CONFIG`** (JSON na conversa de 29/09; `coinzz.*Hash` = manter os atuais).
5. **O — antes de publicar a `turn`:** `update followups set status='canceled' where status='scheduled'
   and kind in ('order_shipped','order_delivered');` (linhas armadas por relógio). Depois publicar
   `turn`; **C** sonda pela porta do n8n (turno, "vou pensar", praça sem entrega, webhook com data).
6. **O — n8n "Normaliza a venda":** `soAData` só deixar passar `AAAA-MM-DD`; corrigir o comentário
   "Both checkouts are Coinzz". Reimportar e rodar `pnpm dev:n8n`.
7. **O — Meta:** se o `silence_2` antigo foi submetido, submeter o novo (`03-templates-meta.md`).
8. **C — resíduos conhecidos:** depoimento "só quando pedir" sem gate (precisa passar a mensagem dela
   ao gate); véspera do antecipado nunca sai (Coinzz sem data — polling da API no n8n resolveria);
   `recordOrder` com `orderedAt` inválido lança; cancelamento/devolução seguem handoff (APIs não expõem, R16.9).

> **2026-09-29, fim da noite — revisão independente aplicada (`9183cd4`, grafo §37).** 18 dos 19
> achados corrigidos na origem, com teste e mutação. Pendências **do operador**: (a) a troca por
> preferência é grátis ou custa R$ 20 (a agente hoje pode dizer "a troca é grátis", como o §9); (b)
> colar o `BUSINESS_CONFIG` (JSON entregue na conversa; `coinzz.*Hash` = manter os atuais); (c) abrir
> o PR desta branch. **Não feito por limite de sessão:** uma segunda revisão Opus depois do `9183cd4`
> — é o primeiro passo da próxima sessão. Resíduos conhecidos: "depoimento só quando pedir" é só
> prompt (o gate não vê a mensagem dela); gates de texto continuam sendo listas.
>
> **2026-09-29, noite — cruzamento fechado no código (branch `claude/happy-planck-izq7jt`, sem PR).**
> Todas as divergências de [`09-cruzamento/divergencias.md`](docs/agente-ia/09-cruzamento/divergencias.md)
> têm situação final (tabela no fim do arquivo); decisões R16.1–R16.9, grafo §35–§36. Nada
> publicado. **Antes de publicar a `turn`:** (1) o operador cola o `BUSINESS_CONFIG` novo (o secret
> não é legível pelo conector; chaves que só ele sabe: `coinzz.*Hash`); (2) linhas `order_shipped` e
> `order_delivered` armadas por relógio antes do deploy não são conferidas no envio — cancelar as
> agendadas com um `update followups set status='canceled' where status='scheduled' and kind in
> ('order_shipped','order_delivered')` e deixar os webhooks rearmarem; (3) se o template antigo do
> `silence_2` já foi submetido à Meta, submeter o novo. Recomendado no n8n ("Normaliza a venda"):
> `soAData` só deixar passar `AAAA-MM-DD`.

**PR #39** (`claude/great-planck-48ozds`, sobre o `main` com o #37 e o #38 já mergeados). Nada da
`turn` publicado (no ar: v41). **CI:** até `1ae187e` só a etapa `verificar:guardas` estava vermelha:
4 guardas "inconclusivas (SIGTERM)". Causa raiz: sob `GITHUB_ACTIONS` o vitest imprime uma anotação
por caso que falha, e o buffer de 1 MB do `spawnSync` estourava (ENOBUFS), o que mata a guarda e
o verificador lia como "não pegou". Não era timeout nem gate. Conserto em `4700903` (a saída da
guarda é descartada; só o status importa). As 4 rodaram verdes sob `CI=true GITHUB_ACTIONS=true`.

### Feito no PR #39 (tudo commitado e provado por teste; grafo §27–§33, R15.3)
- Depois da compra: sem régua de silêncio, sem véspera depois de "Entregue", "Cancelado" que
  chega primeiro escreve `recusado` (`0bba58b`). Fecha os três bloqueadores que estavam
  "obrigatórios antes de leads reais".
- Gate da terceira revisão (`6e15da9`): antecipado negado nomeia a entrega, a garantia é dona
  do próprio número, custo com teto, `classifyOptOut` lê as formas comuns.
- **Decisão do operador 2026-09-28 (R15.3):** frete grátis no pagamento na entrega
  (`delivery.codFreeShipping`, ausente = grátis na entrega), antecipado continua cobrando. O
  gate aceita só a frase canônica (§32–§33). **Cuidado no deploy:** o secret `BUSINESS_CONFIG`
  não carrega a chave, então vale o padrão; se ele tiver `freeShipping: true` escrito, isso
  significa grátis nos dois caminhos: conferir antes de publicar.
- Mutações: as 16 da lista antiga e as de §30–§33 entraram em `verify-guards.ts`.
- A descrição do PR ainda diz "removed `reply.id` from the seal" e "`ASK_OPT_IN` `!== false`":
  **está desatualizada**, o código mantém `reply.id` no selo e o opt-in só liga com
  `askMarketingOptIn === true`. Vale o código.

### Tarefa 1 — fechar o PR #39
1. CI verde no `4700903` (a etapa `verificar:guardas` leva ~30 min no runner) → **O** faz merge.

> **Feito em 2026-09-29 (tarde):** Tarefa 2 → [`revisao-pr39.md`](docs/agente-ia/08-mudancas/revisao-pr39.md):
> **0 crítico · 4 alto · 1 médio · 1 baixo** (três frases de frete grátis no antecipado passam
> a cadeia; véspera rearmada por webhook fora de ordem). Tarefa 3, Fases 1–2 →
> [`09-cruzamento/divergencias.md`](docs/agente-ia/09-cruzamento/divergencias.md): **7 mentiras
> possíveis (D0–D6, todas passam `runGates`), 6 médias, 3 só de doc**, com 10 perguntas ao
> operador. Grafo §35. **Nada consertado:** a Fase 3 espera as respostas do operador.
> Pergunta que bloqueia o deploy da `turn`: o secret ainda tem `freeShipping: true` escrito?

### Tarefa 2 — revisão de riscos do PR #39 (FEITA em 2026-09-29, ver acima)
**Como executar (sem deliberar):** siga os passos na ordem. Nada de conserto durante a revisão:
cada achado vira uma linha na tabela do passo 8. Só depois o operador escolhe o que consertar.
Regras que valem: causa raiz antes de conserto (`.claude/memory/diagnostico-antes-de-consertar.md`),
não procurar erro que não existe, não se enviesar. Gate/prompt/banco → agente `code-reviewer` com
`model: "opus"`. Só o `orchestrator`/sessão principal commita.

0. **Base:** se o PR #39 já foi mergeado, `git fetch origin && git checkout -B claude/review-pr39 origin/main`.
   Se não, revise a cabeça dele (`git checkout claude/great-planck-48ozds`). Rodar, e anotar o resultado:
   `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm dev:conversas`, e
   `export PATH=$HOME/.deno/bin:$PATH DENO_CERT=/root/.ccr/ca-bundle.crt && pnpm typecheck:function`.
   Baseline verde = ponto de partida; se algo já vier vermelho, isso é o primeiro achado.
1. **Escopo real do diff:** `git diff --stat c1c0cdf..HEAD` (c1c0cdf = `main` antes do PR). Ler o
   diff **arquivo por arquivo** nestes, que são os de risco: `src/agent/guardrails.ts`,
   `src/agent/followups.ts`, `src/agent/state-machine.ts`, `src/agent/prompt.ts`,
   `supabase/functions/turn/index.ts`, `supabase/functions/whatsapp/index.ts`,
   `src/channel/whatsapp.ts`, `n8n/workflows/*.json`, `config/business.example.json`.
   Os testes/mutações só entram para saber o que já está guardado.
2. **Espelho e tipos:** `pnpm vitest run tests/function-drift.test.ts` (espelho byte a byte
   `src/agent` ↔ `supabase/functions/turn`); `diff` das três cópias de `inbound-signature.ts`
   (`grep -rl "inbound-signature" src supabase`). Divergência = achado crítico.
3. **Ciclo do pedido** (`followups.ts`: `orderTouchDue` l.~299, `chasesSilence` l.~310,
   `onOrderConfirmed`, `orderTakeOver`; `state-machine.ts`: `furthest`, `stageForOrder`;
   `index.ts`: `recordOrder`, `scheduleSilenceTouches`, `sweepRow`). Montar e **executar** (teste
   novo em `tests/order-stage.test.ts` ou script `tsx` descartável, não commitar o descartável)
   estes cenários e registrar o resultado real, não o esperado:
   a. compra → cliente escreve de novo: nenhum `silence_*` nem `checkout_reminder` agendado;
   b. pedido `Entregue` chega: cancela `order_confirmed/shipped/eve` pendentes, arma só `order_delivered`;
   c. webhook `Cancelado` antes de `Em rota`: estágio termina `recusado`, não `perdido`;
   d. pedido cancelado e depois webhook atrasado `Em rota`: continua morto;
   e. dois pedidos no mesmo lead (um morto, um vivo): a régua segue o vivo;
   f. mesmo webhook duas vezes (idempotência) e webhook fora de ordem;
   g. lead `perdido` (silence_3) que compra depois: estágio volta a `pedido_criado`.
4. **Gate de frete (R15.3) e afrouxamentos:** `git fetch origin main && pnpm dev:gates` (sem
   `--fail-on-loosen`, para VER a lista). Para cada linha nova de `tests/gate-loosen-accepted.txt`
   no diff: existe motivo escrito no grafo (§27–§33)? A frase é mesmo verdade da operação?
   Depois rodar as sondas de mentira à mão contra `runGates` (via um teste descartável): "frete
   grátis" sem caminho; "no pix também é grátis"; "sem frete no pix"; "o frete é grátis" com
   `paymentPath: "prepay"`; kit de 2/3 peças com a frase canônica; a frase canônica seguida de
   outra frase. Todas as de mentira têm de vetar, as honestas de `tests/honest-sales-lines.test.ts`
   têm de passar.
5. **Desempenho do gate:** `tests/guardrails.test.ts` tem o teto de 16 mil caracteres; medir o pior
   caso em `runGates` com texto degenerado (`"a ".repeat(8000)`, `"grátis na entrega. ".repeat(800)`,
   `"não ".repeat(5000)`). Mais de 2 s = achado (a Edge Function tem limite de CPU).
6. **Opt-in/selo/n8n:** ler `n8n/workflows/turno-da-agente.json` nos nós "Cerebro do turno" e
   "Resposta de verdade" (têm de repassar `reply`); `pnpm dev:n8n` **não** roda aqui sem a chave do
   n8n — se não rodar, só listar. Confirmar que com `channel.askMarketingOptIn` **ausente** nada de
   opt-in é lido, escrito ou perguntado (turno, varredura e `deliveryFor`).
7. **Config e produção:** `config/business.example.json` × prompt × gate dizem a mesma coisa sobre
   `freeShipping`/`codFreeShipping`. Conferir o secret real sem imprimir segredo: pedir ao operador
   se `BUSINESS_CONFIG` tem `freeShipping: true` escrito (isso vira "grátis nos dois caminhos").
   Migrações do PR: nenhuma nova; 0017/0018/0019 já estão aplicadas.
8. **Saída:** `docs/agente-ia/08-mudancas/revisao-pr39.md` com a tabela `# | severidade
   (crítico/alto/médio/baixo) | onde (arquivo:linha) | o que acontece (cenário concreto, entrada →
   saída) | causa raiz | correção proposta`. Achado sem cenário reproduzido não entra (é palpite).
   Depois: uma linha no `HANDOFF.md` com a contagem por severidade, e registro no grafo.

### Tarefa 3 — cruzar o agente com toda a documentação (depois do merge do #39; pedida em 2026-09-29)
**Objetivo:** achar divergência que faça o agente **mentir** (afirma o que a operação não cumpre) ou
**render menos** (não usa recurso que existe; usa recurso que não existe). **Fase 1 só inventaria;
nada é consertado até o operador decidir cada divergência (Fase 3).** Base: `main` já com o #39.

**Fase 1 — extrair o que o agente sabe e diz (arquivos prontos para diffar):**
1. Criar `docs/agente-ia/09-cruzamento/` (pasta nova) para os artefatos.
2. Prompt de produção por caminho: escrever `scripts/dump-prompt.ts` **descartável (não commitar)**
   que importe `systemPrompt` de `src/agent/prompt.ts` e `gateBriefing` de `src/agent/guardrails.ts`,
   leia `config/business.example.json` (espelho do `BUSINESS_CONFIG`) e grave o texto em
   `09-cruzamento/prompt-cod.txt` e `prompt-prepay.txt` (`systemPrompt(cfg, gateBriefing(cfg), null)`;
   a versão de produção acrescenta as diretivas de `supabase/functions/turn/index.ts` — `systemPrompt`
   local ~l.2828, `OPT_OUT_FAREWELL_DIRECTIVE` ~l.1983 — listar essas diretivas à parte).
3. Regras dos gates: `gateBriefing(cfg)` em `09-cruzamento/gate-briefing.txt`; e a lista de gates
   (`grep -n "gate:" src/agent/guardrails.ts`) com o que cada um veta.
4. Textos que saem sem modelo: régua/templates (`renderFollowup`, `deliveryFor` em
   `src/agent/followups.ts`; `channel.templates` em `config/business.example.json`), fallback e
   handoff (`grep -n "FALLBACK\|handoff" supabase/functions/turn/index.ts`), e-mail de handoff.
5. Números e fatos do config: todo valor de `config/business.example.json` (preços, kits, frete,
   prazos, praças, garantia, suporte, `expressActive`, `satisfiedCustomers`, `physicalStorePlanCity`).

**Fase 2 — extrair a verdade e cruzar, um tema por vez.** Para cada tema abaixo, uma tabela em
`09-cruzamento/divergencias.md` com colunas: `tema | o agente diz (arquivo:linha) | a documentação
diz (arquivo:linha, data) | veredito (igual / mentira / recurso ocioso / recurso fantasma / doc
desatualizada) | gravidade`. Fontes da verdade **em ordem de precedência** (a mais recente e mais
firme vence; conflito entre docs também é achado): (1) `docs/documentacao/contexto-negocio/05-decisoes-firmes.md`,
(2) `docs/documentacao/decisoes/03-decisoes-tomadas.md` (as rodadas mais novas por último),
(3) `docs/documentacao/contexto-negocio/01–03,06`, (4) `docs/agente-ia/01-conhecimento/01-base-de-conhecimento.md`
e `02-tabela-de-medidas.md`, (5) `docs/agente-ia/06-script/02-script-do-agente.md` e
`03-templates-meta.md`, (6) `docs/agente-ia/02-especificacao/*` e `07-cobertura/*`,
(7) `docs/agente-ia/08-mudancas/registro.md`, `docs/documentacao/decisoes/04-grafo-de-decisoes.md`,
(8) `docs/operacao/*`, (9) `.claude/memory/*` e o `HANDOFF.md`.
Temas, nesta ordem (grep sugerido entre parênteses, rodar em `docs/` e em `src/agent/prompt.ts`):
1. Preço: 1/2/3 peças, entrega × antecipado, desconto % (`R\$|129|116|233|311|207|272`).
2. Frete por caminho de pagamento (`frete`, `codFreeShipping`; a decisão R15.3 de 2026-09-28).
3. Prazo de entrega, janela do antecipado, horário de corte (`prazo|dias úteis|entrega em`).
4. Praças atendidas / COD: as 22 cidades, cobertura por CEP (`07-cobertura`, `availability.ts`).
5. Garantia, troca, devolução, arrependimento (CDC) (`garantia|troca|devol|7 dias`).
6. Pagamento: pix, cartão, parcelas, taxa do Mercado Pago, antifraude não cobrado (`parcel|pix|cart`).
7. Tamanho e medidas: tabela, degrau, kit (`02-tabela-de-medidas.md` × `sizing.ts`).
8. Claims de produto e apelo de corpo/saúde, prova social, escassez (`satisfiedCustomers|últimas`).
9. Identidade (é IA?), handoff para humano, horário de atendimento, canal de suporte.
10. Régua: quantos toques, quando, cupom, checkout em 15 min, o que é template × texto livre.
11. Opt-in de marketing, retenção de 90 dias (LGPD), o que o agente diz sobre dados.
12. Canal: WhatsApp Cloud API (o agente ainda cita WAHA/sessão/pacing?), Hermes (nunca no turno).
13. Provedor de modelo: só a Meta (o prompt/docs ainda citam OpenAI/Gemini?).
Duas classes de achado a procurar ativamente: **(a) mentira** = o agente pode afirmar X e a
documentação diz não-X ou não sustenta X; **(b) ocioso/fantasma** = recurso existe no
config/operação e o prompt não o ensina (`kits`, `expressActive`, `support.email`, `prepayMaxInstallments`,
cobertura por CEP), ou o prompt cita recurso que não existe (cupom sem cupom cadastrado, "chamei
alguém" sem handoff, frete grátis no antecipado). Para cada "mentira", **escrever a frase exata
que o agente poderia dizer** e passá-la por `runGates` (teste descartável): se passa a cadeia,
é furo real; se veta, é só divergência de texto.

**Fase 3 — decisão e correção (só com o operador):**
1. Apresentar `divergencias.md` ao operador, agrupado por gravidade, com **uma pergunta objetiva por
   divergência que só ele resolve** (preço, prazo, política). Nunca escolher em silêncio.
2. Consertar só o aprovado, sempre pelo dono da verdade: dado de negócio → `config/business.json`
   (opcional, ausente = verdade de hoje); prompt → `src/agent/prompt.ts` lendo o config; gate →
   `guardrails.ts`; doc desatualizada → corrigir o doc (`technical-writer`). Todo conserto de
   `src/agent` espelha em `supabase/functions/turn/` byte a byte.
3. Toda correção com o teste que a guarda: `tests/prompt.test.ts` (o prompt ensina só frase que
   passa a cadeia), `pnpm dev:gates --fail-on-loosen`, `pnpm verificar:guardas` (mutação nova em
   `src/dev/verify-guards.ts`), e registro no grafo. Bateria: lint, typecheck, test, dev:conversas,
   typecheck:function. Gate/prompt vai para revisão Opus antes de commitar.
4. Entrega: relatório final em `09-cruzamento/`, contagem por classe no `HANDOFF.md`. Não publicar a
   `turn` (isso é do operador).

### Depois do merge (ordem obrigatória)
1. **O importa no n8n:** `turno-da-agente.json` (com `reply`), `relogio-da-regua.json` (ramo de
   erro, do #38) e `whatsapp-envio.json` (botões, do #38). Depois `pnpm dev:n8n` tem de passar.
2. **O publica a `turn`** (0017/0018/0019 já aplicadas) e a `whatsapp`, com a flag de opt-in
   ainda desligada. **C** sonda a varredura pela porta do n8n.
3. Só então `channel.askMarketingOptIn: true` no secret; depois da aprovação da Meta,
   `order_eve_pago` em `channel.templates`. Sócio: assinar o webhook `user_preferences`.


### Pipeline até anúncios e leads reais (dono: C = Claude, O = operador, S = sócio)
- **Fase 0 — fechar o código:** FEITA no PR #39, falta o CI verde (`4700903`) e o **merge (O)**.
- **Fase 1 — publicar e provar:** O põe ramo de erro com e-mail no nó "Varre a regua" (n8n) →
  O publica a `turn` (0017 já aplicada) → C faz a sonda da varredura pela porta do n8n (fechamento
  pela `run_at`, `perdido`, lembrete de checkout, dois pedidos) e a sonda de turno (recepção,
  preços/prazos dos dois caminhos, nunca frete grátis).
- **Fase 2 — pedido dos dois lados:** pedido sintético COD (Logzz) e antecipado (Coinzz), webhooks
  de cada status, estágio até `entregue_pago`; O confirma o primeiro kit real (`order_quantity`
  2/3) e a taxa do parcelado do Mercado Pago.
- **Fase 3 — personas:** as 12 pela porta do n8n contra o que está no ar.
- **Fase 4 — canal:** S entrega app/número/token/webhook e templates aprovados; O grava segredos
  (`INBOUND_SIGNING_SECRET`, `TURN_REQUIRE_SERVICE_ROLE`), publica `whatsapp`, cria a credencial no
  n8n; C põe `PHONE_NUMBER_ID` e `channel.templates`, teste template ↔ `renderFollowup`, opt-in de
  marketing, e por último `CANAL_ATIVO=true` (`docs/operacao/whatsapp-cloud-api.md`).
- **Fase 5 — ensaio:** O troca `CONVERSATION_MODEL` para o modelo sem `-contributor` (LGPD); as 12
  personas pelo WhatsApp de verdade; um pedido real pago na porta de ponta a ponta; **aquecer o
  número** (item mais longo — começar já, se não começou).
- **Fase 6 — anúncios:** C: atribuição CTWA (`leads.source`), views de avaliação; O: piso de
  amostra escrito antes de olhar número; S: tráfego mínimo só nas 22 praças com COD; C:
  acompanhamento diário (`turn_outcomes`, handoffs, custo, `perdido`).
- **Fase 7 — depois do tráfego:** Hermes com dado real, Conversions API, cupom (sem ele o
  `silence_3` fica mudo), O-02, apps da Coinzz.

## ▶ Estado em 2026-09-27 (histórico)

**Branch `claude/focused-gates-fjpixt`, à frente do `main`, sem PR** (o operador pede o PR). No
ar continua a `turn` **v41** — nada desta sessão foi publicado. CI só roda em PR: até lá,
`pnpm verificar:guardas` inteiro é a única prova das mutações.

### Tarefa 1 — revisão final: FEITA (2026-09-27), grafo §20
Quatro revisores Opus independentes (correção, integração, segurança, testes) sobre
`main...claude/focused-gates-fjpixt`. Resultado final: **aprovado com ressalvas** — nenhuma
mentira de prazo que o `main` vete passa no branch, nos dois caminhos.
- Achados corrigidos: A1 (o gate cancelava em silêncio o `silence_1` "…esperando um dia bom"
  no antecipado); duas regressões de negação no COD ("No pix não precisa esperar, chega em 2
  dias", "Nem no pix demora"); o toque pós-pedido lia o pedido sem filtrar a cliente;
  `externalId` sem limite; `verificar:guardas` misturava árvore e HEAD (causa da instabilidade)
  e contava timeout como "pegou" — agora preso a um commit limpo.
- Provado na PostgREST real (só leitura): o filtro `or=(kind.like.silence_*,…)` e a igualdade
  no `run_at` que a própria API devolve.
- Verde em `378e3d0`: lint, typecheck, build, 4336 testes, 1640 conversas, `typecheck:function`,
  `dev:gates` (só os 6 afrouxamentos honestos aceitos), `verificar:guardas` **113/113**, e os
  workflows ativos do n8n idênticos ao repositório.

### Próximos passos, nesta ordem
1. **PR para o `main`** quando o operador pedir (o CI só roda em PR — é a primeira vez que o
   branch passa por ele).
2. **Antes de publicar (operador, no n8n):** pôr um ramo de erro com e-mail no nó "Varre a
   regua" do workflow "Relógio da régua" — hoje ele não tem `onError` nem workflow de erro, e uma
   varredura que falha (ex.: coluna ausente, erro de banco) não avisa ninguém (segunda revisão,
   2026-09-28).
3. **Publicar a `turn`** (operador, Codespace; a 0017 já está aplicada). Depois, **sonda da
   varredura pela porta do n8n** — é a prova de produção do fechamento pela `run_at`, do
   `perdido` e do lembrete de checkout (os testes de `index.ts` são textuais).
   **Correção de 2026-09-28:** o aviso anterior ("todo lead vira `perdido` de uma vez") estava
   errado. Produção tem **0 linhas em `followups`** (consulta de leitura em 28/09), e a v41 já
   cancela os `silence_3` vencidos; os `perdido` aparecem um a um, conforme a régua de cada
   conversa termina.
4. Gate, ressalvas da conferência final (§20): "uma semana, no máximo", "numa semana você já
   está com ele", "daqui (a) uma semana…" passam no antecipado (o `main` também deixava).
5. Testes que faltam (revisão de testes): extrair para `followups.ts` a decisão "linha fechada
   é nossa" e o filtro de `cancelScheduled`; `stageForLead` com pedido pendente (`""`).
6. Ativação do WhatsApp (sócio), taxa do parcelado, caso "A recusado sozinho, depois B entregue"
   (§16), "fora do conserto" do §19, O-02, apps da Coinzz, primeiro pedido real de kit.

### O que esta sessão fez (2026-09-26/27), tudo no branch, nada publicado
- **Margem do antecipado com o Mercado Pago** (R14.15): antecipado rende mais que o COD nas 3
  quantidades; preços mantidos pelo operador; antifraude não é mais cobrado. Falta: taxa do
  parcelado e quem paga os juros.
- **`perdido`** escrito pela varredura quando o `silence_3` sai da fila sem venda (§15);
  toque fechado **antes** de gravar/enviar (sem "sumiu?" depois da resposta dela).
- **Dois pedidos no mesmo lead** (§16): `followups.order_id` (migração 0017), cancelamento só
  dos toques do pedido morto, `stageForLead` (um cancelado não recusa o lead com outro vivo).
- **Lembrete de checkout de 15 min (§R10.4) armado de verdade** (§17) — nunca tinha sido;
  cancela na resposta e na venda; sem duplicata no reancoramento; só com link real no texto.
- **M-08** (§18): prazo do antecipado por extenso — nove revisões, **aprovado com ressalvas**;
  ônus da garantia invertido (governo positivo). 6 honestas aceitas em
  `tests/gate-loosen-accepted.txt`.
- **M-10** (§19): prazo por extenso/avulso no caminho da entrega e caminho nomeado na frase
  anterior — **aprovado com ressalvas**; a negação no cabeçalho foi a última correção.
- Ferramenta de mutação aceita `also` (duas camadas guardando o mesmo bug).
- **Último commit da sessão (negação do nome do antecipado, ressalva 1 da M-10) SEM revisão
  independente:** `prepaidNamed`/`headerPath` aplicados também à regra de número e à checagem
  de faixa, mais o conserto de um `PREPAY_NAME` local que sombreava o externo. A revisão da
  Tarefa 1 começa por ele (sondar negativas que não negam e afrouxamentos contra o merge-base).

### Depois da revisão, nesta ordem
1. Publicar a `turn` (operador, Codespace) — leva §15–§19. Sonda pela porta do n8n.
2. Ativação do WhatsApp (sócio: valores; ver `docs/operacao/whatsapp-cloud-api.md`).
3. Pendências: taxa do parcelado; caso "pedido A recusado sozinho, depois B entregue" fica em
   `recusado` (§16, decisão do operador); "fora do conserto" do §19; O-02; apps da Coinzz;
   primeiro pedido real de kit.

## ▶ Estado em 2026-09-25, fim da noite (histórico)
## ▶ Branch `claude/upbeat-newton-6l6dzz` (2026-09-28) — para a sessão do PR #37

Trabalho feito **em paralelo com o PR #37**, a partir do `main` `9222dc6`, sem tocar nenhum
arquivo dele (`guardrails.ts`, `followups.ts`, `turn/index.ts`, `verify-guards.ts`, testes de
gate). Nada publicado, nada aplicado em produção. Verde no branch: lint, typecheck, build,
4057 testes, 1640 conversas, `dev:gates` sem nenhum veredito mudado. **Merge de teste com
`claude/focused-gates-fjpixt`:** um conflito só, neste `HANDOFF.md` (manter as duas seções), e
a bateria inteira verde no resultado.

### O que entrou (pronto, provado por teste)
1. **n8n "Relógio da régua":** saída de erro com e-mail no "Varre a regua" + e-mail quando
   linhas da varredura dão `erro:` no `skipped` (o isolamento por linha do PR #37 as deixava
   mudas). Regra nova em `n8n-rules.ts`: toda chamada à Edge Function precisa de saída de erro.
2. **`0018_evaluation_views.sql`:** 5 views `security_invoker` (bloqueio por gate, desfecho do
   turno, custo por conversa, funil por origem, atribuição CTWA) e **`pnpm dev:painel`**, o
   painel diário sobre elas. A `0018` e a `0019` vêm depois da `0017`, que já está aplicada.
3. **Templates da Meta:** `tests/whatsapp-templates.test.ts` prova rascunho == `renderFollowup`.
   Duas divergências **fixadas com `it.fails`, para o PR #37 consertar em `deliveryFor`**:
   (a) `order_eve` antecipado — o template manda "Deixa R$ X separado" a quem já pagou; o
   rascunho `encorpa_vespera_entrega_pago` está na seção 4 de `03-templates-meta.md`; (b)
   `silence_2` — fora da janela deve sair sempre a primeira variante (decisão R15.2).
4. **Opt-in de marketing (decisão R15.1, opção B) — o módulo, sem fiação.** Oito revisões
   mostraram que ler o texto dela (sim, palavra-chave, negação) nunca fecha. A causa estava
   no canal: `textOf` jogava fora o id do botão. Agora:
   - `src/channel/whatsapp.ts` (espelhado em `functions/whatsapp/`): `InboundMessage.reply =
     { id, contextId }` no toque de botão; `marketingPreferences` lê o webhook
     `user_preferences` da Meta; `replyButtonsMessage` monta botões. O n8n "WhatsApp envio"
     aceita `via: "buttons"`.
   - `src/agent/opt-in.ts`: consentimento **só** pelo toque no "Quero ofertas" da pergunta
     atual (nonce) em até 24h; "Não, obrigada" de qualquer pergunta é recusa final; texto
     digitado **nunca** concede e só **suspende** (qualquer menção a marketing), o que permite
     perguntar de novo, uma vez, com botões (`mayAskOptIn`).
   - `0019_marketing_opt_in.sql`: `asked_at`, `nonce`, `opt_in_at`, `message_id` (o toque),
     `suspended_at`, `declined_at` em `leads`.
5. **`tests/opt-out-gaps.test.ts`:** `classifyOptOut` lê como "none" "não quero mais
   promoção", "não quero receber mais mensagens", "chega de mensagem", "para com isso" —
   `it.fails`, conserto em `guardrails.ts` (área do PR #37).
6. Docs: parecer de opt-in (`05-plano/07`), piso de amostra (`05-plano/08`), decisões
   R15.1–R15.2, grafo §23–§26; memória `ambiente-aponta-para-outro-projeto`.

### Para a sessão do PR #37 fazer ao unificar
- **Ligar o opt-in no turno e na varredura** (arquivos do PR #37):
  1. flag `channel.askMarketingOptIn` (ausente = não pergunta);
  2. mandar `optInMessage` como `via: "buttons"` depois do `silence_1`, gravando `nonce`/`asked_at` e respeitando `mayAskOptIn`;
  3. no turno, `optInAnswer(inbound.reply, …)` grava `opt_in_at`/`message_id` ou `declined_at`, e `suspendsMarketingOptIn(inbound)` grava `suspended_at` e zera `opt_in_at`;
  4. `deliveryFor` bloqueia `silence_2`/`silence_3` como template sem `opt_in_at` (`no_opt_in`);
  5. 131050 e `user_preferences` stop gravam `declined_at`;
  6. espelhar `opt-in.ts` em `functions/turn/`.
- **Selo:** incluir `reply.id` no selo (`inbound-signature.ts`, 3 cópias) **no mesmo commit**
  em que o turno passa a ler `reply`. Hoje `reply` viaja sem selo e ninguém o lê.
- Consertar as duas divergências de template (item 3) e os furos de `classifyOptOut` (item 5).

### Do operador / sócio
- Importar no n8n `relogio-da-regua.json` e `whatsapp-envio.json` (até lá `pnpm dev:n8n`
  acusa falha, de propósito).
- Aplicar `0018` e `0019` (depois da `0017`).
- Sócio: submeter `encorpa_vespera_entrega_pago`; assinar a inscrição do webhook
  **`user_preferences`** no app da Meta, além de `messages`.
- Operador: assinar o piso de amostra (`08-piso-de-amostra.md` §4).

## ▶ COMECE AQUI — próxima sessão (escrito em 2026-09-25, fim da noite)

**Branch `claude/peaceful-feynman-l4zf0k`, à frente do `main`** com o canal do WhatsApp
(commits `8b140a1` → `bee1dc3`). Abrir PR para o `main` quando o operador pedir. No ar:
função `turn` **v41** (H-2) e os 5 workflows do n8n (Turno, Relógio, Venda, Hermes decisão,
WhatsApp envio com `CANAL_ATIVO=false`). A `turn` do repositório está **à frente** da v41
(janela real de 24h, selo, `sealed`, `TURN_REQUIRE_SERVICE_ROLE`) — tudo inerte com os
segredos ausentes; sobe na ativação do canal ou antes, se o operador pedir.

**Guia do operador para segredos e publicação:** [`docs/operacao/segredos-e-codespace.md`](docs/operacao/segredos-e-codespace.md).
O Claude não publica nem mexe em credencial nesta máquina; o operador roda no Codespace.

### Próximos passos, nesta ordem (decisão do operador)

1. **(b) Margem do antecipado com o Mercado Pago** (R14.15) — **refeita em 2026-09-25**
   (Pix 0,99% + R$ 1,00, cartão à vista 4,98%, mix 50/50): antecipado R$ 57,94 / 116,16 /
   149,17 contra COD R$ 52,35 / 109,01 / 145,12 (1/2/3 peças); grafo §14. **Fechado em
   2026-09-26:** antifraude não é cobrado; preços e descontos mantidos. Só falta a taxa do
   parcelado e quem paga os juros (pode zerar a folga do kit de 3). Texto original do passo: O antecipado da Coinzz passou a
   ser processado pelo Mercado Pago, com taxa menor; a conta de unidade econômica ainda usa
   a taxa antiga. Fonte: [`docs/documentacao/contexto-negocio/06-modelo-economico.md`](docs/documentacao/contexto-negocio/06-modelo-economico.md),
   [`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md)
   e o painel `docs/operacao/mapa-financeiro.html`. **Pedir ao operador** as taxas reais do
   Mercado Pago (pix e cartão, à vista e parcelado) e se a Coinzz cobra algo além; refazer a
   margem de 1 peça e dos kits de 2 e 3 no antecipado; despachar o `pricing-guardian` (Opus)
   com análise de sensibilidade. Se a margem permitir mudar desconto ou preço, é decisão do
   operador — nada muda no `BUSINESS_CONFIG` sem ele.
0. **Migração `0017_followup_order.sql`: aplicada** (conferido em `list_migrations`, versão
   20260926005415, na revisão final de 2026-09-27) — a varredura da `turn` do repositório
   depende dela (grafo §16). A `turn` do repositório agora
   também leva o `perdido` (§15), o toque fechado antes do envio e o lembrete de checkout
   de 15 minutos ligado de verdade (§17).
2. **(a) Estágios `em_rota`, `entregue_pago`, `recusado` (e `perdido`)** — **fechado em
   2026-09-26 no repositório (não deployado)**: os três primeiros já eram escritos desde a
   v38 e o operador confirmou que Logzz e Coinzz disparam o webhook a cada status; `perdido`
   passou a ser escrito pela varredura quando o `silence_3` sai da fila sem venda (opção a do
   operador; grafo §15). Sobe no próximo deploy da `turn`. Texto original do passo: O funil para em
   `pedido_criado`. Já existe `stageForOrder` (`src/agent/followups.ts`), usado ao gravar a
   venda (`recordOrder` em `supabase/functions/turn/index.ts`) — **primeiro confirmar** se a
   Logzz e a Coinzz mandam webhook a cada mudança de status (o workflow "Venda confirmada"
   recebe o mesmo endereço) e se esses status chegam até `recordOrder` e escrevem o estágio.
   Faltando, ligar; `perdido` (lead sem compra após a régua) não tem dono. Mexe em estado
   da conversa: ler o grafo antes, revisão Opus depois.
3. **Ativação do WhatsApp** quando o sócio entregar os valores:
   [`docs/operacao/whatsapp-cloud-api.md`](docs/operacao/whatsapp-cloud-api.md) — Parte A
   (sócio: app, número, token, webhook, templates), Parte B (operador: segredos + publicar
   `turn` e `whatsapp` no Codespace), Parte C (Claude: `PHONE_NUMBER_ID`, `CANAL_ATIVO=true`;
   o operador cria a credencial "WhatsApp Cloud API" no n8n). Ordem que a revisão exige:
   selo ligado antes de `CANAL_ATIVO=true`; conferir que a credencial "Supabase
   service_role" do n8n é mesmo `service_role` antes de `TURN_REQUIRE_SERVICE_ROLE=true`.
4. **Templates da Meta aprovados** → `channel.templates` no `BUSINESS_CONFIG` (colar o config
   inteiro). Até lá, toque fora da janela é cancelado e chega por e-mail.
5. **Demais pendências**, em seguida: primeiro pedido real de kit (confirmar
   `order_quantity` 2/3); ~~dois pedidos no mesmo lead~~ (feito em 26/09, grafo §16, 0017 aplicada);
   M-08; apps da Coinzz; checkout no domínio da marca (O-02); ressalvas aceitas do WhatsApp
   (dois turnos simultâneos da mesma cliente, mensagem perdida com o n8n fora do ar).

### O que o Claude precisa saber antes de começar
- **Não relembrar** o operador de revogar PAT nem de trocar o `CONVERSATION_MODEL`
  (memória `nao-relembrar-pendencias-do-operador`). Meta Ads/BM/developer/número/templates
  são do **sócio** (memória `divisao-de-papeis-meta`).
- Rotina "Hermes — implementa proposta aprovada" roda a cada 3 h (9–21 SP); formulário do
  Hermes no n8n manda e-mail só quando há proposta ou resultado.
- Mapa do funil no Miro atualizado: "Funil de Vendas com Agente de IA" (quadros 1 a 8).
- Sonda pela porta do n8n: `curl` do guia acima (o `pnpm dev:personas` com as flags de
  produção é bloqueado pelo modo automático nesta máquina).

## ▶ Estado em 2026-09-25, noite (histórico)

**`main` = PR #35 mergeado. Função `turn` versão 41 no ar (H-2), deploy pelo operador via
Codespace + Supabase CLI, com `verify_jwt` ligado.** A v40 anterior foi conferida byte a byte
contra `b8b3680` antes de subir: idêntica, nada de produção se perdeu.

- **Bloqueio da Meta resolvido.** A chave antiga no Supabase provavelmente levava "Bearer "
  colado (o código já prefixa). Chave nova no Supabase e no GitHub. Sonda pela porta do n8n
  às 19:34 UTC: recepção → espera de 120 s → `interpret` + `reply` pela Meta → `send`. Lead de
  teste apagado.
- **H-2 no ar** (R14.13, grafo §12): link só com compra confirmada; preço que a loja não tem
  (lido pelo número) não é decisão; FATOS LIGADOS no prompt; `turn_outcomes.reason` guarda a
  linha quando o link sai. Cinco passadas de revisão Opus até "aprovado com ressalvas".
- **Hermes com loop fechado no clique** (R14.14): histórico em `hermes_proposals` (0014–0016,
  aplicadas), formulário n8n "Hermes: decisão do operador" (publicado, e-mail a cada 15 min
  só quando há proposta ou resultado), rotina "Hermes — implementa proposta aprovada" a cada
  3 h das 9 às 21 SP (operador adicionou repositório e conectores na UI),
  `deploy-hermes.yml` publica só commit com `hermes:<id>`. Todo o resto: deploy manual (R14.8).
- **Permissões desta máquina:** o modo automático bloqueou deploy por API, sonda com as flags
  de produção e edição de workflow de deploy. Deploy manual = o operador roda no Codespace
  `npx supabase functions deploy turn --project-ref hbmkgakzrqmdlsvszjeo --use-api`.

### WhatsApp Cloud API: pronto e desligado (R14.16, grafo §13)
- Função `whatsapp` (não publicada) + workflow n8n "WhatsApp envio" (`CANAL_ATIVO=false`)
  ligado ao Turno (resposta só com `sealed`) e ao Relógio (toques; janela de 24h decidida
  na função do turno). Duas passadas do `security-reviewer`: aprovado com ressalvas.
- **A função `turn` no repositório está à frente da v41 no ar** (WA-1, selo, janela real,
  `sealed`, `TURN_REQUIRE_SERVICE_ROLE`). Tudo desligado com os segredos ausentes; publicar
  junto com a ativação.
- Ativação passo a passo, por quem faz: [`docs/operacao/whatsapp-cloud-api.md`](docs/operacao/whatsapp-cloud-api.md).
  Meta (app, número, token, webhook, templates) é do **sócio**.

### Pendências do operador
1. **Revogar o PAT** usado no deploy de hoje (ficou no chat) — ele disse que faz no fim do dia.
2. Trocar `CONVERSATION_MODEL` para o modelo sem `-contributor` antes do primeiro lead real.
3. Confirmar com um pedido real de kit que `order_quantity` vem 2/3.

## ▶ Estado em 2026-09-25, fim do dia (histórico)

**Branch:** `claude/sweet-meitner-g9nu8o`. Sem PR. **A v33 está no ar desde 2026-09-25 06:50 UTC
(função `turn` versão 38)**, com o aval do operador. O2 e O10 no ar no n8n.

> **⛔ BLOQUEIO — a Malu não responde em produção até isto ser feito:** a sonda pela porta do
> n8n recebeu `meta: Unauthorized`. O secret **`META_API_KEY` do Supabase não é aceito pela
> Meta**; toda conversa cai na resposta de segurança + handoff. Nos testes locais funcionava
> porque o proxy desta máquina injeta a chave certa. O operador cola a chave válida de
> dev.meta.ai em Supabase → Edge Functions → Secrets → `META_API_KEY`; depois, uma sonda pela
> porta `n8n` (`pnpm dev:personas --door=n8n --persona=tati`, em horário 6–24 SP) confirma.
> O canal do WhatsApp ainda não está ligado, então nenhuma cliente real foi afetada.
>
> **Checagem de 07:05 UTC (depois do "tudo feito" do operador):** a sonda pela porta `n8n`
> **ainda recebe `meta: Unauthorized`** — a chave colada continua recusada (conferir se é a da
> Model API em dev.meta.ai, sem espaço/quebra de linha, e se o secret salvou). O **PAT do
> Supabase ainda responde 200** — não foi revogado. Os webhooks de venda da Coinzz (2) e da
> Logzz (2) **já chegam com `&token=`** ✓. A entrada `/encorpa-inbound` respondeu **502** ao
> curl nesta sonda embora a execução tenha terminado `success` — investigar (pode ser o
> `Devolve a resposta` com o `Wait` na mesma execução). Decisões do dia: `03-decisoes-tomadas.md` §Rodada 14 (R14.1–R14.11).
Mudanças técnicas: `registro.md` M-05 a M-09. **Grafo de decisões (o que falhou e por quê):
`docs/documentacao/decisoes/04-grafo-de-decisoes.md` — leia antes de mexer em gate ou estado.**

### Estado do produto (o que a v33 leva)
- **Checkout:** entrega na **Logzz** (`ccm-1-unidade`, `ccm-2-unidades`, `ccm-3-unidades`,
  frete R$ 0,00 para a cliente; CPF no link como `cpf`), antecipado na **Coinzz**
  (`encorpa-pagamento-antecipado-0`, `antecipado-2-0`, `antecipado-3-0`; CPF como
  `document`). Tabela de preços dos kits em R14.3.
- **Kits de 2 e 3 peças (M-09):** a Malu oferece uma vez, na decisão; lê a quantidade e o
  tamanho de cada peça (letra ou calça pela tabela); manda o link do kit e pede os tamanhos
  no complemento; 4+ peças → pessoa. O kit expira após 7 dias sem uso (`units_at`).
- **Caminho escolhido guardado** (`payment_choice`, só de uma escolha, 7 dias sem uso).
- **Gate de preço** recebe a quantidade de peças da conversa (`ctx.units`); **régua
  pós-compra** lê o pedido (total, peças, tamanhos, caminho; antecipado = "já pago").
- **Pós-venda → pessoa**, exceto o encerramento feliz (lista de permissão).
- **Hermes** instalado, calibrado (3/3), agendado a cada 50 leads (R14.1).
- **Migrações aplicadas em produção, todas aditivas:** 0007 a 0013 (0011 `units_at`, 0012
  `payment_choice`, 0013 `payment_choice_at` — a v32 no ar ignora todas).
- **n8n "Venda confirmada"** lê Coinzz e Logzz (o teste do webhook da Logzz chegou em
  05:38 com `?fonte=logzz` e `order_quantity`); kit exige N tamanhos no complemento.

### Como foi verificado (o loop do dia)
- **Nove passadas de revisão independente** (`code-reviewer`, Opus) sobre os kits e cada
  leva de correção, até **aprovado com resíduos** — cada passada achou furos reais da
  anterior (lista no M-09). Resíduos aceitos no M-09.
- **Rodadas de personas** (12 fixas + 3 de kit temporárias, não versionadas): final
  `06-19-27` + confirmação `06-37-29` → **8/8, 0 respostas prontas**. O Hermes rodou sobre
  cada rodada; propostas e decisões em `08-mudancas/propostas/` (H-2 do dia aberta).
- **`pnpm verificar:guardas` 56/56** — cada bug do dia reinstalado é pego pelo seu teste.
- CI local: `pnpm lint`, `typecheck`, `test` (3868), `dev:conversas` (1640/1640),
  `typecheck:function`, `dev:gates --fail-on-loosen` — todos verdes.

### Gasto da API da Meta no dia
Personas ≈ R$ 1,37 · Hermes ≈ US$ 0,04 (≈ R$ 0,22) · **total ≈ R$ 1,60**.

### Deploy feito em 2026-09-25 (06:40–07:00 UTC)
- Secrets gravados: `BUSINESS_CONFIG` (gerado do exemplo, entrega na Logzz), `CONVERSATION_MODEL`
  = `muse-spark-1.3-contributor`, `CONVERSATION_MODEL_PRICE`, **`SALE_WEBHOOK_TOKEN`** (novo;
  o valor está só no Supabase e com o operador — nunca no repositório).
- Função `turn` versão 38 (12 arquivos, `verify_jwt` ligado como antes).
- Migrações 0011–0013 aplicadas antes (aditivas).
- n8n: Turno com `É recepção?` → `Espera a recepção` (Wait `resumeInSeconds`) → `Resposta de
  verdade` (`resume: true`); Venda repassa `?token=`. `pnpm dev:n8n` agora falha sem esses dois.
- **Sondas em produção:** recepção → espera de 120 s → retomada ✓ (mas `meta: Unauthorized`, ver
  bloqueio); venda sem token → **401** ✓; venda com token → chega à busca do lead ✓. As sondas
  mandaram 3 e-mails de teste ao operador e 1 handoff para `contato@`; lead de teste apagado.

### Próximos passos
1. **Operador:**
   - **colar a `META_API_KEY` válida** no Supabase (bloqueio acima);
   - trocar a URL dos webhooks de venda para a versão com `&token=<SALE_WEBHOOK_TOKEN>` — dois na
     Coinzz (`?fonte=coinzz&token=…`), um na Logzz (`?fonte=logzz&token=…`); até lá, **toda
     venda real é recusada com 401** e vai para o e-mail de recusa;
   - trocar `CONVERSATION_MODEL` para o modelo **sem `-contributor`** antes do primeiro lead
     real (LGPD, R14.2);
   - **revogar o PAT do Supabase** logo depois do deploy (Account → Access Tokens);
   - decidir H-2 do Hermes (link que troca de caminho sai com o preço dele).
2. ~~Deploy v33~~ — **feito** (acima). Referência do que foi usado: secret `BUSINESS_CONFIG` = `config/business.example.json`
   com `agentName` "Malu", `testimonials` [], sem `scarcity`, sem `_comment`, `handoff.email`
   `contato@encorpa-fashion.com.br`, `coupon.code` "SUPER20" **inativo** (código veio do
   arquivo de teste — confirmar), `coinzz.offerHash` `offp16pv` / `prepayOfferHash` `offkw47x`
   (só usados pelo pedido via API, que o n8n ainda não chama); secrets
   `CONVERSATION_MODEL` e `CONVERSATION_MODEL_PRICE={"in":0.10,"out":0.20,"cached":0.002}`;
   subir os 12 arquivos de `supabase/functions/turn/` pela API (ler a versão no ar antes —
   era a 36); sonda pela porta `n8n`; O2 (nó `Wait`) junto.
3. **Confirmar com um pedido real de kit na Logzz** que `order_quantity` vem 2/3 (o teste
   só confirmou o campo, com 3 fictício).
4. Pendências baixas: dois pedidos no mesmo lead (a régua lê o último; guardar `order_id`
   no follow-up); M-08; apps da Coinzz; checkout no domínio da marca (O-02).

### Para rodar personas localmente (receita que funcionou)
Função: `BUSINESS_CONFIG` do exemplo com `hours` 0–24 (fora do horário tudo vira
`deferred`), `DENO_CERT=/root/.ccr/ca-bundle.crt`, `SUPABASE_SERVICE_ROLE_KEY`/`META_API_KEY`
= `placeholder` (o proxy injeta), `deno run --allow-env --allow-net=127.0.0.1:8000,<proxy>,…
supabase/functions/turn/index.ts`. Runner: `NODE_USE_ENV_PROXY=1 … pnpm dev:personas
--door=local --all --concurrency=2 --budget-brl=1`. Concorrência 3 gera 500 por conexão
cortada no proxy local (não acontece em produção — conferido nos logs). Para matar a função,
não use `pkill -f` com o padrão na mesma linha: ele mata o próprio shell.

## ▶ Estado em 2026-09-24, fim da noite (histórico)

**Branch:** `claude/sweet-meitner-g9nu8o` (a partir do `main` com o PR #31). Sem PR ainda.
**Nada deployado** — a v32 continua no ar.

### O que esta sessão fez (registro `docs/agente-ia/08-mudancas/registro.md`)
- **M-05 atingida:** "tiro mais alguma dúvida" deixou de ser lido como desconto. Quatro
  rodadas de segunda revisão (cada uma achou concessão escapando); a forma final só ignora
  "tiro … dúvida" quando a janela da própria varredura não acha palavra de concessão depois.
  No caminho: "Eu tiro um pouquinho." passava (`pouc\w+` não casa "pouquinho") — corrigido.
  Placar ganhou `pronta-por-preco`.
- **M-06 atingida:** a faixa "1 a 3 dias" só vai para a entrega por proximidade quando o que
  vem depois dela é, no máximo, a janela do antecipado. Duas revisões (a primeira achou 14
  frases honestas vetadas; corrigidas).
- **Rodada R6** (jussara, tati, cleide, rafa, lu; R$ 0,10): todas as 8 checagens do placar
  atingidas, 0 respostas prontas. Mediana subiu de 35 para 48 palavras — observar.
- **M-07 aberta:** três furos antigos do `delivery_promise` achados pelas revisões.
- `deno` não vem no container: `npm i -g deno` para rodar `pnpm typecheck:function`.
- Runner: `--persona` é repetível, não aceita lista com vírgula.

### Próximos passos
1. **M-07** (endurece gate: revisão + rodada cleide, rafa, lu).
2. **O-04** — autorização do operador para trocar a credencial do nó `Varre a regua`.
3. Abrir PR desta branch quando o operador pedir; depois, o deploy v33 (ordem no bloco
   abaixo, item 3).

## ▶ Estado em 2026-09-24 à noite (histórico)

**Branch:** `claude/affectionate-goodall-x5ujm4` → PR para `main` aberto no fim desta sessão.
**Nada deployado** — a v32 continua no ar. Plano em uma página:
[`00-plano-simples.md`](docs/agente-ia/05-plano/00-plano-simples.md) (lista **Pendências do
operador** no fim — leia quando ele perguntar o que falta).

### Onde estamos
- **Quatro rodadas das 12 personas** contra a v33 local, com o modelo real
  (`muse-spark-1.3-contributor`). Rodada 4: **3 vendas encaminhadas** (link com nome e tamanho
  certos), 3 handoffs certos, 0 mentiras, mediana de 37 palavras, R$ 0,0027 por resposta.
  Registro: [`05-rodada-personas-2026-09-24.md`](docs/agente-ia/05-plano/05-rodada-personas-2026-09-24.md);
  relatório com as 48 conversas no artifact privado "Malu nas 12 personas" (v3).
- **Rodada 13 de decisões** (`03-decisoes-tomadas.md` §R13): intérprete antes da resposta,
  handoff só em pedido de pessoa / cancelamento / pós-venda, gates duros e brandos (`warn`),
  link sem e-mail, escada de tamanho, retry de rede, respostas de objeção do operador.
  **R13.6 recusado:** escassez e prova social inventadas.
- Todas as mudanças de gate passaram pela segunda revisão (várias rodadas); o turno passou
  por revisão até APPROVE (`884b6ba`).

### O que esta sessão executa agora (operador aprovou em 24/09) — o MÉTODO
Motivo: correções que o teste de frase "provava" e o modelo repetia; rodadas misturando
mudanças; nenhuma meta escrita; muito token em ler 12 conversas e em ciclos de revisão.
1. **Registro de mudanças** em `docs/agente-ia/08-mudancas/registro.md`: cada mudança com
   o quê, por quê (evidência), objetivo, **como medir** (checagem automática), resultado na
   rodada seguinte (atingido? sim/não com número) e, se não, o ajuste.
2. **Placar automático** (`pnpm dev:placar <pasta-da-rodada>`) que roda as checagens sobre os
   JSON das personas. Só as conversas que falham são lidas por inteiro.
3. **Runner em paralelo** (`--concurrency=2`) e **rodadas direcionadas** (só as personas
   afetadas; rodada completa só antes de deploy).
4. **Workflows do n8n versionados** em `n8n/workflows/` (exportados pela API, só leitura).
5. Os 4 achados de código da rodada 4 como primeiras entradas do registro, corrigidos e
   medidos numa rodada 5 direcionada.
**Feito nesta sessão:** registro, placar (`pnpm dev:placar`), runner com `--concurrency`,
n8n versionado, M-01..M-04 (`ad46dd1`, `4cb480b`) medidas na rodada 5 direcionada: **M-02,
M-03 e M-04 atingidas; M-01 atingida na parte de prazo**. Aberta **M-05** (falso positivo de
`price_promise` em "tiro mais alguma dúvida"). Achado **O-04**: a varredura da régua no n8n
recebe `Invalid JWT` a cada 5 minutos — a régua nunca rodou em produção. PR:
https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/31.

### Próximos passos para a próxima sessão (nesta ordem)
0. **Escada de código** (`.claude/rules/code-ladder.md`, adotada em 24/09 no `main`): todo
   código novo sobe os sete degraus antes de ser escrito. Aplicada a todo o código deste PR
   em 24/09 à noite (quatro revisores + segunda revisão): placar usa os detectores da
   produção, `buildCheckoutLink` morto removido, despedida do opt-out usa `decideNext`,
   parcelamento corta frase sem partir "R$ 129.90", prompt lê parcelas com o teste do gate.
   **Não aplicado, com motivo:** a regex de e-mail do intérprete e as três cópias de `norm`
   ficam (o `tsc` recusa import de valor `.ts` entre módulos espelhados); `sendLinkNow`
   fica (regra nomeada com teste próprio).
1. Ler `docs/agente-ia/08-mudancas/registro.md`: toda entrada aberta é trabalho pendente —
   começar pela **M-05** e pela **M-06** (prazo do antecipado por proximidade — furo anterior,
   endurece gate, rodar cleide/rafa/lu depois), depois pedir ao operador a autorização do **O-04** (trocar a
   credencial do nó `Varre a regua` para `Supabase service_role`). Não mexer em gate/prompt sem abrir uma entrada com objetivo e medida.
2. **Operador:** Coinzz (a consulta `stock-and-delivery-day` redireciona para a home desde
   24/09 — sem ela a Malu não sabe oferecer o antecipado); link de checkout no domínio da
   marca; confirmar que "mais de 500 clientes satisfeitas" e "planos de loja em SP" são
   verdade; payload real da Coinzz (O6).
3. **Deploy v33** (ordem): migração `0007`; n8n (`Cerebro do turno` timeout 60000 → 150000,
   e-mail para `handoffs[]` da varredura); secret `BUSINESS_CONFIG` com os campos novos e
   `handoff.email = contato@encorpa-fashion.com.br`; secrets
   `CONVERSATION_MODEL=muse-spark-1.3-contributor` + `CONVERSATION_MODEL_PRICE` (trocar para
   o modelo normal antes de cliente real — pendência do operador); PAT (O4); 12 arquivos
   (`ls supabase/functions/turn/*.ts`); sonda pela porta `n8n`.
4. **Canal WhatsApp** (fase 8) e os dois testes de 14 dias do operador.
5. **Hermes** (R11.2) só depois de tráfego real: ele opera o mesmo ciclo do registro sobre as
   conversas reais — lê o placar, propõe entradas em `hermes_proposals`, o operador aprova.

### Resíduos conhecidos (não bloqueiam)
- `coverage_claim` não pega "Manaus a gente atende sim" / "Atendemos toda a região Norte".
- `statesPastPurchase` não pega "fiz o pedido pelo site ontem" sem "colete"/"de vocês".
- Nomes começando com "Tia"/"Irma" viram nulo (o checkout pede).

## ▶ Estado em 2026-09-24 à tarde (histórico)


**Branch:** `claude/affectionate-goodall-x5ujm4` (sem PR). **Nada deployado** — a v32 continua
no ar. Plano em uma página: [`00-plano-simples.md`](docs/agente-ia/05-plano/00-plano-simples.md)
(com a lista **Pendências do operador** no fim — leia quando ele perguntar o que falta).

**O que esta branch fez em 23–24/09:**
- Agente volta a se chamar **Malu**. Provedor único: **Meta Model API** (`api.meta.ai`,
  R12.1); Gemini saiu do turno. Muse sempre raciocina: `reasoning_effort: "minimal"` e teto
  de 4000 tokens (com 900 as respostas vinham vazias).
- Personas rodam na porta `local` com credenciais injetadas pelo proxy do ambiente
  (runbook no topo de `src/dev/persona-run.ts`), teto de gasto por rodada.
- Rodadas 1 e 2 das personas: 0/12 chegaram ao link — relatório em
  [`05-rodada-personas-2026-09-24.md`](docs/agente-ia/05-plano/05-rodada-personas-2026-09-24.md)
  e no artifact privado "Malu nas 12 personas".
- **Rodada 13 de decisões** (`03-decisoes-tomadas.md` §R13): intérprete antes da resposta
  (`interpret.ts`), handoff só em pedido de pessoa / cancelamento / pós-venda com pedido,
  gates duros e brandos (`warn`), link sem depender de e-mail/CPF, escada de tamanho,
  retry de rede, respostas de objeção do operador. **R13.6 recusado:** escassez e prova
  social inventadas.

**Em andamento quando a sessão de 24/09 fechou (retomar daqui):**
- **Terceira revisão dos gates (`75bac92`) reprovou por vetos falsos novos** em frases
  honestas — corrigir antes da rodada 3, cada um com a frase honesta que passa e a mentira
  vizinha que continua barrada: "O colete é vendido por R$ 129,90." e "…vendido em 5
  tamanhos" (`invented_testimonial`, regex de `vend…\d`); "…agendada, sendo 1 a 3 dias"
  (`sendo \d`); negações honestas da Express inativa ("não está disponível na sua região",
  "Express ainda não temos"); "Nosso suporte te atende todos os dias" (`humanity_claim`,
  `suporte|atendimento` no WHO); "pode passar aqui seu CEP" (`unavailable_offer`); "em até
  24 horas você recebe a confirmação" (`delivery_promise`). E, no mesmo ciclo, vetar prova
  social com prazo depois de "satisfeitas" ("…só essa semana", "…compraram hoje", "98%
  recomendam") e "Tem como retirar sim, em SP.". Sondas: `rev2/p8.txt`, `p9.txt` no
  scratchpad da sessão (perdidas se o container foi reciclado — as frases estão aqui).
- **Revisão final do fluxo do turno (`36387f4`): NEEDS WORK, dois bloqueios pequenos.**
  (1) Resposta duplicada: a nova tentativa confere o ticket só no início; se ela manda "oi??"
  durante os ~48 s da tentativa, as duas respondem. Conserto: reler a última mensagem
  recebida logo antes de gravar a resposta da tentativa e desistir (`retry_moot`) se não for
  `ticket.inboundId`. (2) Pergunta de tamanho **sem "?"** ainda troca `leads.size`: "tem
  tamanho GG", "vcs tem o tamanho G", "tem pra quem usa 50", "qual tamanho pra quem usa 44",
  "o M serve pra quem veste 44" — no caminho rápido de `sizing.ts`, pular a oração que abre
  com `tem|têm|existe|vem|serve|qual|quais|pra quem|para quem` e deixar para o intérprete;
  os cinco como teste negativo. Ressalvas: "não precisa chamar atendente", "nao preciso de
  ajuda de atendente", "não quero que me passe pra atendente", "dispenso atendente" passaram
  a contar como pedido de pessoa na metade determinística (`REFUSED_BEFORE` em
  `interpret.ts`) — voltar a tratá-las como recusa; `extractIdentity("sei la")` vira nome
  (pôr em `NOT_A_NAME`); os caminhos novos de `index.ts` só têm teste por string.
- **n8n antes do deploy (conferido nos workflows em 24/09 pela API):**
  - **`Cerebro do turno` (HnGrxquQLpfbXWLH) tem `timeout: 60000`.** O turno novo leva até
    ~120 s no pior caso (intérprete 20 s + orçamento de resposta 90 s com retry de rede).
    Acima de 60 s o n8n cai no ramo de recusa ("Avisa a recusa") e a cliente fica sem
    resposta, embora a função grave a resposta no banco. **Subir para 150000** (limite do
    gateway do Supabase) no mesmo dia do deploy — com a v32 é inofensivo.
  - **`Relógio da régua` (SVDtFUi2N9oOskkx)** só chama a função; não lê a resposta. Falta um
    ramo que mande e-mail (mesmo texto do "Avisa o operador") para cada item de
    `handoffs[]`. O `send[]` (inclusive `kind: "retry_turn"`) só será entregue quando o
    canal existir (fase 8), como os demais toques.
  - **`opted_out` com `reply`:** nada a mudar hoje — o turno devolve o JSON inteiro ao
    chamador em qualquer status. Quando o canal existir, o envio precisa aceitar esse caso.
  - O2 (nó `Wait` da recepção) continua pendente e depende do desenho do canal.
- **Nada disto rodou contra o modelo real ainda** — o intérprete (JSON da Muse, custo da
  chamada extra) só se prova na rodada 3 das personas.
- **Pendências do operador:** payload real da Coinzz (O6); confirmar que "mais de 500
  clientes satisfeitas" e "planos de loja em São Paulo" são verdade (só ficam no config se forem
  verdade); o secret com os campos novos.

**Antes do deploy v33 (nesta ordem):**
1. Aplicar a migração **`0007_gate_warn_verdict.sql`** — sem ela o `warn` derruba o lote
   inteiro de `gate_traces` em silêncio.
2. **n8n:** mandar o `reply` quando o status for `opted_out`; ligar o `handoffs[]` da
   varredura ao e-mail; `stopped` e `deferred` ganharam significados novos (ver commit
   `36387f4`).
3. Secret `BUSINESS_CONFIG`: `handoff.email = contato@encorpa-fashion.com.br` e os campos
   novos (`support`, `socialProof`, `prices.prepayMaxInstallments`, `store`,
   `delivery.expressActive`) — espelho em `config/business.example.json`. Nos testes:
   `CONVERSATION_MODEL=muse-spark-1.3-contributor` + `CONVERSATION_MODEL_PRICE`.
4. Rodada 3 das personas contra o código atual, e só então o deploy (arquivos:
   `ls supabase/functions/turn/*.ts`).

---

## ▶ Estado em 2026-09-23 (histórico)

**O plano em uma página:** [`docs/agente-ia/05-plano/00-plano-simples.md`](docs/agente-ia/05-plano/00-plano-simples.md)
(23/09) — onde queremos chegar, onde estamos, o que só o operador destrava e as 5 etapas.
Leia antes do plano v2.

**Branch de trabalho:** `claude/execution-plan-internal-tests-p46efi` — **mergeada no `main`
pelo [PR #30](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/30)** (`2a5ffa0`).
`pnpm test` 3049/3049, `typecheck`, `typecheck:function`, `lint` e
`dev:conversas` (1640/1640) verdes no último commit.

**O que está no ar:** a Edge Function **v32** (`b36087d`, do `main`). **Nada desta branch
foi deployado.** O deploy v33 são **11 arquivos** pela API de gerência (receita em
`.claude/memory/supabase-deploy-por-api.md`), precisa de um PAT do operador (O4), e o PAT
é revogado depois. O banco de produção está **vazio**; as migrações `0005` e `0006` estão
aplicadas.

**O que esta branch fez, em uma linha cada** (detalhe nas seções abaixo e no
[plano v2](docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md)):

- Plano de execução v2 (10 fases), 12 personas de teste interno + runner com três portas,
  análise de arquitetura → **Rodada 11** das decisões.
- Prompt extraído para `prompt.ts` (décimo espelho), lê o config e **tem teste**
  (`tests/prompt.test.ts`).
- `freeShipping` passa a ser grátis só com `=== true` (ausente = não grátis).
- Achados C e D: `conversations.stage` escrito pelo funil e `turn_outcomes` gravando as
  oito saídas do turno (migração `0006`, RLS ligado).
- Quatro rodadas de conserto dos gates de frete/economia, fechadas pelo método
  "só aperta + comparação mecânica de vereditos" (`.claude/memory/negation-blindness.md`).
- **Saída A** (§R10.6, `aa1c021`): a economia do antecipado nunca é citada em reais, só
  "10% de desconto". Revisão independente em 23/09: aprovada, nenhuma frase afrouxada.
  Resíduo aceito no item 2.9 do plano.
- Modelo por agente fixado no frontmatter (opus nos revisores e donos de gate; sonnet no
  resto).

**O que está travado no operador — nesta ordem:**

1. **Apagar a chave `freeShipping` do secret `BUSINESS_CONFIG`** (O1). Supabase → Edge
   Functions → Secrets. Seguro agora (a v32 lê ausente como grátis, igual ao `true` de
   hoje); **obrigatório antes da v33**, que com `true` promete frete grátis.
2. **Recuperar o acesso ao n8n.** O "contate o admin" aparece porque o n8n self-hosted
   só manda e-mail de reset com SMTP configurado. Caminhos, sem verificação nesta sessão:
   o suporte do PikaPods, ou o comando `n8n user-management:reset` no container (recria o
   owner; os workflows ficam — **exporte-os antes, se der**). Depois, gerar uma **API key
   do n8n** (Settings → n8n API). O MCP do n8n falha ao conectar
   (404); a API REST responde. Com a chave, o agente faz **O2** (nó `Wait` no workflow
   `HnGrxquQLpfbXWLH`) e **O10** (autenticar `/encorpa-inbound` e `/encorpa-venda`).
   **Pergunta aberta antes de O10:** Coinzz e Logzz conseguem mandar header customizado?
   Se não, o segredo vai na query string.
3. **Credenciais como variáveis do ambiente da nuvem** (O3) — menu do ambiente na barra de
   título da sessão → Edit; **nunca no chat**. Nomes: `GEMINI_API_KEY`, `META_API_KEY`,
   `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_API_KEY`. Sessão nova
   as recebe. Destravam as personas (fase 3) e o eval de Muse Spark (fase 4).
4. **PAT do Supabase** para o deploy v33 (O4), revogado depois.

**O que o agente faz em seguida, sem depender do operador:** item 2.8 do plano (o turno
passa `paymentPath: "cod"` fixo para os gates — cego no antecipado) e 2.5
(`rls_auto_enable` no repositório, depois da decisão 1.6). **Com credenciais:** personas,
eval, O2/O10, deploy v33 com sonda de produção.

---

> *(Histórico — o bloco abaixo é o estado de 10/09.)*
>
> Atualizado em: 2026-09-10 — **v30 no ar**, byte a byte igual ao repositório,
> [PR #22](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/22) merjado.
>
> **A v32 está no ar**, deployada às 13:50 UTC pela API de gerência, com os nove arquivos
> do disco a partir do `main` (`b36087d`). Ela carrega `CONVERSATION_MODEL` como variável
> de ambiente, os cintos de custo, a redação de credencial em texto de erro e o gate de
> frete corrigido. **E não mudou nada de comportamento**: as três só acordam com variável
> de ambiente ou valor de config que o secret não tem — sem `CONVERSATION_MODEL` setada a
> conversa continua no `gpt-5.6-luna`, e o ramo de `freeShipping: false` não roda porque o
> secret tem `true`. **Exceção: o item 7 daquela lista muda comportamento de verdade no dia
> do deploy** — o padrão da conversa virou Muse Spark 1.3 em código, não mais atrás de
> variável de ambiente. Ver [§O que mudou em 2026-09-10 à tarde](#o-que-mudou-em-2026-09-10-à-tarde).
>
> **⚠ Duas divergências entre o repositório e o que está no ar**, uma pequena e uma que
> importa: o teto de `CONVERSATION_MODEL_PRICE` foi apertado de **1000 para 100 USD** por
> 1M tokens (pequena — nada depende disso enquanto ninguém setar a variável), e **o
> `DEFAULT_CONVERSATION_MODEL` do repositório é `muse-spark-1.3`, o da v32 ainda é
> `gpt-5.6-luna`** (grande — no dia de um novo deploy, isso troca o modelo de TODA
> conversa, sem eval rodado). Ver [§Frente 5](#frente-5--trocar-gpt-56-luna-por-muse-spark-13-decisão-do-operador-2026-09-10).
>
> **Sobre "byte a byte":** a receita de deploy promete isso, e **não é verificável por
> essa rota**. O bundle que a API devolve é ESZIP2.3 com o módulo **transpilado** —
> comparar bytes do TS original é impossível. O que foi verificado na v32 são 15
> marcadores, um por arquivo, todos presentes. É afirmação mais fraca, e é a que cabe.
>
> **Uma premissa da Frente 4 caiu, e depois a pergunta em aberto foi respondida.** O
> frete de R$ 15 a R$ 40 que o item 6 usava como "o que a cliente paga" era **custo do
> operador**, não preço dela. Perguntado se ia mesmo parametrizar frete na Coinzz, o
> operador respondeu **sim, inteiramente pago pela cliente, custo zero para a
> operação** — "a diferença entre pagamento na entrega e pagamento antecipado é só o
> tempo de recebimento e a taxa de frustração, os demais custos são exatamente iguais".
> *(Revertido em 22/09 para a saída A — §R10.6.)* Isso resolve a pergunta a favor da **saída C** (economia citada sempre com a ressalva de
> frete) — **mas o gate `price_promise` ainda não foi mudado para exigir essa ressalva.**
> Conta completa em
> [`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md).

---

## Separação de repositórios (2026-09-08)

`docs/campanhas-e-anuncios/` saiu deste repositório e virou
[`rodrigovaroto-wq/encorpa-campanhas-`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-)
— repositório próprio pra quem cuida de campanha/anúncio, sem disputar PR e
handoff com quem constrói o agente. Nada de código do agente mudou.

`docs/documentacao/contexto-negocio/` **não saiu** — continua aqui, porque o
script do agente (`docs/agente-ia/06-script/`) e a especificação linkam nele
por caminho relativo. Foi feita uma **cópia espelhada** em
`encorpa-campanhas/docs/contexto-negocio/`, com aviso no topo de cada arquivo
apontando de volta pra cá como fonte viva. Se preço, oferta ou claim mudar,
atualiza aqui primeiro — a cópia do outro repositório fica desatualizada até
alguém replicar manualmente.

---

## Em uma frase

A conversa vai do "oi" ao link de checkout, com guardrail, custo por chamada e handoff por
e-mail; a venda confirmada volta pelo webhook, mata a cobrança e arma o pós-entrega — tudo
verificado pela porta de produção, não por teste. **O que falta não é código, é operação:**
o WhatsApp ainda não tem canal, e a cota da OpenAI está esgotada.

---

## ESTADO EM 2026-09-22 À TARDE — leia isto primeiro

**O plano vivo é o [plano v2](docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md)**
— dez fases, e uma tabela do que **só o operador destrava** (O1–O9), ordenada pelo que
trava mais coisa. Comece por ela.

**O que o banco de produção revelou nesta sessão** (lido pelo MCP do Supabase):

1. **O banco está vazio.** Zero leads, conversas, mensagens, pedidos, `llm_calls`,
   `gate_traces`. Houve dado — o `reltuples` estimava 2 conversas e 1 lead — e ele foi
   apagado, muito provavelmente a limpeza das sondas sintéticas. **Toda afirmação
   "verificado em produção" deste arquivo foi feita com sonda que já não está lá.** Não
   existe baseline.
2. **A `0005_welcome_resume` estava no disco desde 21/09 e nunca tinha sido aplicada.**
   Aplicada agora, junto com a `0006`, e as duas confirmadas lendo o schema de volta.
3. **A v32 no ar é byte a byte o `b36087d`**, nos nove arquivos. O que este arquivo diz
   sobre ela é verdade.
4. **O advisor de segurança acusa `public.rls_auto_enable()`**, função `SECURITY DEFINER`
   executável por `anon` — não está no repositório. É a função do gatilho `ensure_rls`, que
   liga RLS sozinho em toda tabela nova; chamá-la por RPC falha. Risco baixo, drift real.
   Decisão do operador (item 1.6 do plano).

**✅ Decidido pelo operador em 22/09 — saída A (§R10.6, `aa1c021`).** A agente cita só
"10% de desconto" e o preço do antecipado; o `price_promise` veta a economia em reais
(R$ 12,99) em qualquer forma, nos dois ramos de `freeShipping`. Fecha a classe inteira que
quatro rodadas de regex não fechavam — conferido por 6138 vereditos, nenhum afrouxado.
Item 2.9 do plano, resolvido.

**⚠ Achado ALTO da revisão de segurança, anterior a esta sessão:** os webhooks do n8n
(`/encorpa-inbound`, `/encorpa-venda`) **aceitam POST anônimo**, e a URL está versionada
aqui. Quem tiver a URL posta com o telefone de uma cliente real e pode disparar o handoff
que a tira da agente para sempre, ou forjar um pedido. Item **O10** do plano — autenticar
por header no n8n antes de tráfego real.

**⚠ Os dois bloqueios duros do deploy v33, ambos do operador:**

- **O1 — apagar a chave `freeShipping` do secret** (decisão de 22/09). Desde `3db9ba8` a
  chave ausente lê como **não** grátis; com `true` escrito, a v33 promete frete grátis.
- **O2 — o nó `Wait` no n8n.** Sem ele, **lead novo recebe a recepção automática e nunca
  mais é respondido.** A v33 carrega o timer de 2 minutos; o n8n ainda não.

---

## O PLANO DE EXECUÇÃO ATÉ OS TESTES REAIS — montado em 2026-09-22

**Feito.** O plano que a seção abaixo pedia existe, em dois documentos:

- [`docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md`](docs/agente-ia/05-plano/02-plano-de-execucao-ate-os-testes-reais.md)
  — sete fases, cada item com dono e uma linha **Fechou quando**; o mapa de quem chama
  quem (Cloud API → n8n → Edge Function → Supabase/Logzz/Coinzz/Hermes); as quatro ondas
  de execução e o critério de saída.
- [`docs/agente-ia/05-plano/03-personas-de-teste-interno.md`](docs/agente-ia/05-plano/03-personas-de-teste-interno.md)
  — as doze clientes que não sabem que são teste, o que cada uma caça, e a rubrica de
  falha escrita antes de rodar.

**Três fatos novos confirmados pelo operador em 2026-09-22**, que mudaram a ordem do plano:

1. **`META_API_KEY` existe.** O eval de Muse Spark 1.3 (Frente 5, passo (b)) sai do "não
   tem como rodar neste ambiente" e vira pré-requisito de deploy.
2. **O webhook real da Coinzz já chegou.** A Frente 0.3 deixa de ser espera.
3. **O número do WhatsApp está no WA Business, sem Cloud API e sem token ainda.** A
   Frente 2 continua bloqueada, com dono e em andamento.

E uma decisão: **o operador vai parametrizar frete na oferta do antecipado da Coinzz**,
data indefinida. *(Em 22/09 a saída C deu lugar à A — §R10.6.)* Isso torna a saída C da Frente 4 item 6 obrigatória e **anterior** à
mudança do secret.

**Nada de código mudou nesta sessão.** O plano é o entregável; a execução começa pela
onda A. *(Atualização: a onda A foi executada inteira em 22/09 — ver ▶ COMECE AQUI.)*

<details>
<summary>O pedido original desta seção, como foi escrito em 2026-09-21</summary>

Decidido pelo operador em 2026-09-21. **A próxima sessão começa por aqui**, antes de
escrever qualquer código.

O objetivo é um **plano de execução completo** do que ainda falta para o sistema ficar
operacional e pronto para os primeiros testes de verdade. O método não é auditar o que
está escrito neste arquivo — é **testar o fluxo inteiro, ponta a ponta**, e separar o que
já funciona do que só está documentado como se funcionasse. Este handoff já errou nas duas
direções, e a varredura de 21/09 é o exemplo mais recente: uma decisão fechada ("o M é
parametrização") caiu com uma consulta de quatro minutos.

Escopo do que precisa ser exercitado, sem ordem de prioridade ainda — a ordem é parte do
plano a montar:

1. **O canal.** WhatsApp Cloud API não existe. É a Frente 2 e bloqueia qualquer teste com
   cliente real.
2. **A conversa inteira**, do "oi" ao link de checkout, pela porta de produção (webhook do
   n8n), não por sonda contra a Edge Function.
3. **O pedido**, nos dois caminhos — pagamento na entrega e antecipado — incluindo o
   `payment_method` correto, que continua sendo dedução e não fato.
4. **O webhook de venda** das duas plataformas, com payload real, e a régua de pós-pedido
   que ele arma.
5. **As divergências abertas** entre repositório e produção: o
   `DEFAULT_CONVERSATION_MODEL` (Frente 5, sem eval rodado) e preço/frete/desconto
   (Frente 4, decidido e não implementado).

Cada item do plano sai com **como se sabe que fechou** — um critério verificável, do jeito
que a Frente 0 já faz. Nada entra como "pronto" sem prova pela porta de produção.

</details>

---

## Arquitetura decidida, e quatro achados de código (2026-09-22)

O operador apresentou uma arquitetura de referência em closed loop (n8n → LLM → Supabase →
Evaluation Layer → Hermes → Sandbox → melhoria validada) e pediu avaliação contra o
repositório, sem tratá-la como decisão tomada. A análise inteira está em
[`docs/agente-ia/05-plano/04-analise-de-arquitetura.md`](docs/agente-ia/05-plano/04-analise-de-arquitetura.md);
as decisões que saíram dela são a
[rodada 11](docs/documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22).

**A conclusão:** a metade de cima da proposta **já é o sistema**. A metade de baixo falta
por um motivo que não é arquitetural — **o sistema decide bem e não registra a decisão.**

**Decidido (rodada 11), em uma linha cada:**

- **R11.1** — o runtime é Workflow + LLM com auto-reflexão. **Não vai virar agentic**: o
  modelo só escreve texto, toda ação é TypeScript determinístico.
- **R11.2** — Hermes é supervisor **offline**, em lote, nunca no caminho do turno.
- **R11.3** — a Evaluation Layer são **views SQL + um job**, não um serviço.
- **R11.4** — **sem RAG.** A base tem 104 linhas e já cabe no prompt.
- **R11.5** — memória é **coluna `jsonb`** em `leads`, não vector store.
- **R11.6** — o closed loop **fecha num humano**. Nunca auto-aplicação.
- **R11.7** — o Sandbox **não será construído**: ele é o CI deste repositório.
- **R11.11** — **recusado**: "regras" dentro do n8n. Continua sendo cano e relógio.

### Os quatro achados — um corrigido, três abertos

| | Achado | Estado |
|---|---|---|
| **A** | O system prompt se contradizia sobre desconto e afirmava "O FRETE É GRÁTIS nos dois caminhos" como texto fixo, **sem ler `delivery.freeShipping`** — que o gate `shipping_promise` lê desde 10/09 | ✅ **corrigido em 22/09, não deployado** |
| **B** | `conversationCapBrl` tem **três valores** no repositório: 1,5 (config, decisão R10.1) · 0,8 (fallback da Edge Function e harness de dev) · 0,50 (raciocínio de modelo neste arquivo, anterior a R10.1 e **não é teto de conversa**) | ⏳ item 2.3 do plano v2 |
| **C** | `conversations.stage` nascia `'discovery'` — valor fora de `STAGES` — e **nunca era escrito**. Não existia funil | ✅ **corrigido em 22/09, falta aplicar a migração e deployar** |
| **D** | O desfecho do turno viajava no corpo HTTP e **nunca era persistido**. A taxa de fallback era irrecuperável | ✅ **corrigido em 22/09, idem** |

### A instrumentação de C e D, feita em 22/09

**Migração `0006_funnel_and_outcome.sql`**, em duas metades:

- **O funil.** Converte as linhas `'discovery'` para `'novo'`, troca o default, e só então
  adiciona a `check` contra os dez estágios de `STAGES` — nessa ordem, porque a constraint
  recusaria as linhas antigas e a migração falharia no meio. Mais um índice por estágio.
- **O desfecho.** Tabela `turn_outcomes` (conversa, desfecho, motivo, reescritas, custo).
  **Tabela própria e não coluna em `messages`** porque dois dos seis desfechos não
  produzem mensagem nenhuma: `deferred` escreve um followup e `stopped` não escreve nada.
  Sem `expires_at`: a retenção vem do `on delete cascade`, igual a `gate_traces` e
  `llm_calls`.

**`state-machine.ts` ganhou `rankOf` e `furthest`** e virou o **nono arquivo espelhado**,
preso por `tests/function-drift.test.ts`. `furthest` existe porque `canTransition` responde
a pergunta errada aqui: quem abre com *"oi, uso 42, meu CEP é 13010-100"* pula três degraus
numa mensagem só, e a regra da spec é **sem regressão**, não sem salto. Estágio terminal
(`bloqueado`, `perdido`, `recusado`) vence qualquer avanço.

**As oito saídas do turno gravam o desfecho:** `opted_out`, `stopped`, `deferred`, os
quatro `handoff` (pediu pessoa · falha de modelo · teto de custo · veto da cadeia) e
`send`/`fallback`. Falha de escrita é engolida de propósito — contador de funil não vale
perder a resposta que a cliente está esperando.

**Migrações `0005` e `0006` aplicadas em 22/09** e confirmadas lendo o schema. Falta
deployar a função — **onze arquivos** agora (`state-machine.ts` e `prompt.ts` entraram).

**Verificado:** `pnpm test` (2835), `lint`, `typecheck`, `typecheck:function` — verdes.

### `freeShipping: false` em todo o repositório (decisão do operador, 22/09)

**A operação não oferece frete grátis.** O aviso anterior — *"não subir `freeShipping:
false` antes de a Coinzz ter frete parametrizado"* — **caiu por decisão do operador**. O
campo é `false` em `config/business.example.json`, em `tests/fixtures.ts`, nos três
harnesses de dev e no fallback da Edge Function.

**⚠ Isso NÃO muda produção.** A produção lê o secret `BUSINESS_CONFIG`, que sobrescreve o
fallback inteiro — e **o HANDOFF registra que o secret tem `freeShipping: true` escrito**.
Para a decisão valer, **o operador precisa trocar para `false` no secret.** (Atualização
da tarde de 22/09: a chave **ausente** passou a ler como **não grátis** — `=== true` no gate
e no prompt, achado 5 do `/code-review` — então apagar a chave também serve. O que não
serve é deixar o `true` que está lá.) Sem isso a agente continua
prometendo frete grátis em produção, com o repositório inteiro dizendo o contrário.

**18 testes inverteram**, e nenhum foi só "atualizado para passar": prometer grátis virou
veto, e cobrar frete sem dar valor virou a frase honesta. O que **não** mudou em nenhum
ramo: dar um número ao frete continua barrado, porque nenhuma das duas ofertas tem valor
citável. O ramo `freeShipping: true` **continua coberto** — `ctxGratis` em
`tests/fixtures.ts` — porque um gate com metade sem teste é um gate que ninguém reverte
com segurança.

### O achado A, corrigido — o que mudou e o que não mudou

Três funções novas em `index.ts`, ao lado de `prepayWindowLine`: `prepayPriceLine()`,
`prepayDiscountRule()` e `freightBriefing()`. O prompt passa a ler
`prices.prepayDiscountPercent` e `delivery.freeShipping`, este último com **o mesmo teste**
que o gate usa. Na manhã de 22/09 esse teste era `!== false` (ausente = grátis); à tarde,
com a decisão de que não há frete grátis, virou `=== true` nos dois (ausente = não grátis).

**Nada mudou de comportamento hoje.** Com o secret como está, o prompt gerado é o anterior
menos a contradição do desconto. O que muda é o dia do `freeShipping: false`: antes o gate
vetaria uma frase que o prompt mandava escrever, em toda conversa, queimando uma reescrita
por turno até cair na resposta segura. Agora os dois concordam.

**Verificado:** `pnpm test` (2824), `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:function`
— os quatro verdes. **Não deployado.**

---

## Recepção automática e o timer de 2 minutos (2026-09-21)

Decisão do operador: a agente muda de nome, de **Malu** para **Valen** (feito — código e
script), e ganha uma recepção automática fixa antes da agente falar de verdade.
**Revertido em 2026-09-24: o nome volta a ser Malu** (código, fixtures, script e o
`agentName` do secret `BUSINESS_CONFIG`, que o operador troca no painel).

**Feito, testado e mirrorado:**

- `agentName` é "Malu" em todos os fixtures e no exemplo de config.
- `WELCOME_AUTO_REPLY` (`src/agent/retry.ts`, espelhado em
  `supabase/functions/turn/retry.ts`) guarda o texto exato aprovado, com os espaçamentos:

  ```
  Oii, tudo bem?

  Recebemos sua mensagem, em poucos minutos uma de nossas atendentes fará seu atendimento.

  Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site:
  encorpa-fashion.com.br
  ```

  Testado em `tests/human-handoff.test.ts`: o texto bate exatamente, passa a régua de
  horário de madrugada (`layer: "auto"`, R4.4) e não promete preço, prazo nem cupom.

**Decisão do operador: opção (a)** — n8n chama a função duas vezes, com um nó `Wait` de
2 minutos no meio. Implementado do lado da Edge Function em 2026-09-21:

- Chamada normal (sem `resume`): se o lead é novo (`existing?.[0]` vazio), a função manda
  só o `WELCOME_AUTO_REPLY`, grava `conversations.welcomed_at` e devolve
  `{ status: "welcomed", reply, bubbles, resumeInSeconds: 120 }`. Não chama o modelo, não
  roda o resto do pipeline.
- Chamada de retomada (`{ ...mesmo payload, resume: true }`): pula a checagem de
  `external_id` (não é evento de canal, é o relógio do n8n), relê a última mensagem
  inbound da conversa no banco (em vez de confiar no que o n8n reenviar) e roda o pipeline
  normal a partir daí — opt-out, pedido de humano, modelo, gates, tudo do jeito que já
  era. Se a Malu já respondeu de verdade depois da recepção (`last_outbound_at` mais
  recente que `welcomed_at` — ela escreveu de novo e foi respondida antes do timer
  disparar), a retomada não gera resposta duplicada: devolve `{ status: "resume_moot" }`.
- Migração nova: `supabase/migrations/0005_welcome_resume.sql` — coluna
  `conversations.welcomed_at`.
- `WELCOME_RESUME_DELAY_SECONDS = 120` (`src/agent/retry.ts`, espelhado) é o número que a
  função devolve para o n8n — o `Wait` node lê `resumeInSeconds` da resposta em vez de ter
  o valor hardcoded duas vezes.

**O que ainda depende do operador, fora deste repositório:** o workflow do n8n
(`Encorpa — Turno da agente`) precisa de um nó `Wait` novo entre a chamada que devolve
`status: "welcomed"` e uma segunda chamada HTTP à mesma função, com o mesmo `externalId`/
`from`/`body` do payload original mais `resume: true`. Sem essa mudança no n8n, o lead
novo recebe a recepção automática e a Malu nunca responde de verdade — a função fica
esperando a segunda chamada que ninguém faz.

**Não coberto por teste automatizado.** `index.ts` não é importável pelos testes (é
Deno, não Node) — a cobertura aqui é `deno check` mais os testes de `WELCOME_AUTO_REPLY`/
`WELCOME_RESUME_DELAY_SECONDS` em `tests/human-handoff.test.ts`. A lógica de `resume` só
é provada de verdade pela porta de produção, com um lead sintético, depois que o n8n
tiver o nó `Wait`.

---

## Varredura de cobertura de 2026-09-21

43 cidades × 5 tamanhos, contra o `stock-and-delivery-day`, em série, sem criar pedido
nenhum. Tabela completa em
[`docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md`](docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md).

| | Em 08/09 | Em 21/09 |
|---|---|---|
| Cidades com COD | 22 de 43 | **as mesmas 22** |
| Frete do COD | R$ 24,98 constante | **R$ 24,98 constante** |
| Tamanho M | ausente nas 43 | **presente em BH, Contagem e Betim** |
| Fortaleza | GG, XGG | **só XGG** |
| Janela Express (`deliverySameDay`) | existia em 09/09 | **nenhuma, em nenhuma praça** |

Três consequências, em ordem de tamanho:

1. **A premissa do M caiu.** Não é parametrização de produto — ver o item 7 de §As decisões
   de negócio que não se reabrem. O que fazer com a Logzz virou outra pergunta: não "por que
   o M não está mapeado", e sim **"por que o M só existe no CD de Minas e quando chega aos
   outros"**.
2. **O Express não está de pé.** `availability.ts` já não promete "hoje" quando a janela
   não vem, então nada quebrou. Mas qualquer texto de script que conte com entrega no mesmo
   dia está falando de algo que o checkout não oferece hoje.
3. **A cobertura é estável.** Treze dias sem uma praça entrar ou sair é argumento para
   decidir tráfego pelas 22 cidades sem medo de a lista virar do avesso na semana seguinte.

**Uma armadilha de varredura, aprendida caro nesta sessão.** Uma consulta que falha por
rede e uma praça que não tem COD **são indistinguíveis na leitura** — `readAvailability`
trata resposta ilegível como "sem COD", de propósito. Numa varredura isso produz uma tabela
inteira de "não" silenciosos que parece um apagão de cobertura nacional. Aconteceu aqui: o
`urllib` do Python levava 403 do proxy do ambiente e as 43 cidades vieram negativas.
**Confira sempre São Paulo com o G antes de acreditar num negativo em massa**, e prefira
`curl` neste ambiente.

---

## COMECE POR AQUI — estado em 2026-09-10

Quem pega esta sessão do zero lê **só esta seção** e o
[§Plano daqui pra frente](#o-plano-daqui-pra-frente). Depois, se precisar de número:
[`docs/operacao/plano-lacunas.html`](docs/operacao/plano-lacunas.html) (as dez lacunas em
quatro ondas) e [`docs/operacao/mapa-financeiro.html`](docs/operacao/mapa-financeiro.html)
(margem, taxas, ciclo de caixa).

Tudo abaixo de §Histórico é registro, não estado, **e contém afirmações corrigidas depois**
— nos prazos, no frete e no M. Onde divergir daqui, aqui vence.

### O que está no ar

| | Estado |
|---|---|
| Edge Function `turn` | **v32**, deployada em 2026-09-10 13:50 UTC do `main` (`b36087d`), ainda em `gpt-5.6-luna`. **O `main` já tem `muse-spark-1.3` como padrão** — próximo deploy troca o modelo de toda conversa, sem eval rodado |
| Guardrails | **19 gates**, briefing no prompt |
| Testes | **2802**, lint, typecheck e `deno check` verdes; CI roda os quatro mais `typecheck:function` |
| Time de agentes | **12 especialistas** em `.claude/agents/`, com a tabela do `CLAUDE.md` satisfeita |
| Preço | R$ 129,90 nos dois caminhos, desconto zero — **⚠ decidido mudar em 10/09, ver Frente 4, nada implementado ainda** |
| Frete | Grátis pra cliente nos dois, R$ 15,00 fixo pago pela operação no antecipado — **⚠ idem** |
| Prazos | **1 a 3 dias** na entrega · **"varia por região, em média 5 dias úteis"** no antecipado |
| Consulta de região | dentro da agente — ela pede o CEP e sabe a cobertura antes de falar |
| Webhook de venda | **no ar**: Logzz e Coinzz → `job: "order"` → mata o silêncio, arma o pós-pedido |
| Pedido cancelado | **desarma a régua inteira** — não manda "sua entrega é amanhã" pra quem cancelou |
| Ritmo humano | `bubbles` volta junto do `reply`, confirmado em produção |
| Janela de 24h | `deliveryFor` decide texto livre × template pelo relógio |
| Atribuição | `leads.source` gravado com o `ctwaClid` na criação do lead |
| **Canal do WhatsApp** | **não existe.** Decisão: **Cloud API**, não WAHA. Frente do sócio |
| **Cota da OpenAI** | **esgotada até 2026-09-10 ~16:45 UTC.** Toda conversa vira handoff |

### O que mudou em 2026-09-10 à tarde

Oito coisas. As quatro primeiras estão na v32 desde 13:50 UTC; a quinta e a sexta são
repositório, não deploy (agentes e teto); a sétima também é código não deployado — e essa
**muda comportamento de verdade no dia em que for**, ao contrário de tudo antes dela. A
oitava é fix de revisão, também na v32.

1. **`CONVERSATION_MODEL` virou variável de ambiente** (`index.ts`), com
   `DEFAULT_CONVERSATION_MODEL = "gpt-5.6-luna"` como padrão — variável ausente se comporta
   exatamente como a v30. Resolve a Frente 3 item 1 na parte que era de código: **existe
   plano B para uma queda da OpenAI sem deploy.** Um modelo novo tem que trazer o preço
   junto (`CONVERSATION_MODEL_PRICE`, JSON `{"in":1.25,"out":4.25}`) ou a função **falha no
   boot** — de propósito: sem isso o custo por chamada gravado em `llm_calls` ficaria
   incomparável, e falhar antes de servir requisição é melhor que falhar no meio da
   conversa depois de gastar o token. Trocar de modelo continua sendo decisão do operador,
   e o eval do passo (b) continua não tendo sido rodado.
2. **`firstReplyAt` respeita o fuso de São Paulo** (`pacing.ts`), reusando
   `BUSINESS_TZ`/`offsetMinutes`/`nextOpening` da régua em vez de duplicar lógica de fuso.
   Resolve a Frente 3 item 2 antes de o canal a chamar. Os testes de `pacing.test.ts`
   codificavam a suposição errada e foram reescritos: quatro casos com instante UTC
   explícito, incluindo o que só quebra em runtime UTC.
3. **Frente 4, itens 1, 3, 4 e 5, feitos:** os três valores em
   `config/business.example.json` (`prepayBrl` 116,91 · `prepayDiscountPercent` 10 ·
   `freeShipping` false), os dois blocos de comentário que iam ficar mentindo
   (`guardrails.ts` e `availability.ts`, espelhados), e o teste que faltava — a combinação
   `freeShipping: false` **com** `prepayDiscountPercent: 10`, que nenhum teste cobria.
   Confirmado no código: **nada precisou mudar em `src/order/checkout.ts`** e as duas
   branches do `shipping_promise` já estavam prontas, como o handoff previa.
4. **A análise do item 6, e a premissa que caiu.** Ver o aviso no topo. Resumo: hoje a
   economia de R$ 12,99 é **verdade**, porque o checkout do antecipado cobra zero de frete.
   A meia-verdade nasce no dia em que o operador parametrizar frete na Coinzz — e a
   combinação que **faz a agente mentir hoje** é justamente `freeShipping: false` antes
   disso. **Não suba esse campo no secret ainda.**
5. **Doze agentes especialistas** em `.claude/agents/`, triados de um corpus de 209 e
   escritos contra este repositório: carregam o espelho byte a byte, o `??` do
   `BUSINESS_CONFIG`, a cegueira a negação e o default "NEEDS WORK". A tabela do
   `CLAUDE.md` deixou de ser aspiracional. Eram dez; o operador achou pouco, a reavaliação
   está em
   [`docs/agente-ia/03-pesquisa/06-reavaliacao-do-time.md`](docs/agente-ia/03-pesquisa/06-reavaliacao-do-time.md)
   e entraram mais dois — `technical-writer` (mantém este arquivo corrigido) e
   `compliance-reviewer` (LGPD, CDC, anúncio com apelo de corpo — nenhum dos dez tinha
   esse território, e o produto tem exposição real nos três).
6. **Teto de `CONVERSATION_MODEL_PRICE` apertado de 1000 para 100 USD** por 1M tokens —
   **depois** da v32. Duas ordens de grandeza acima do modelo mais caro que este funil
   consideraria (Muse Spark é 1,25 / 4,25). O 1000 tinha sido escolhido para um erro de
   1000x ainda caber dentro do teto e falhar no teto de custo da conversa; a 100, um erro
   de 1000x é recusado no carregamento — que é a falha melhor agora que erro de
   configuração é `ModelConfigError` e não tranca mais o lead fora da agente.
7. **Frente 5 executada: o padrão da conversa virou Muse Spark 1.3, não deployado.**
   Diferente de tudo acima, isto muda comportamento de verdade no dia do deploy — não
   depende de variável de ambiente para acordar, é o próprio padrão que mudou. O eval não
   rodou. Detalhe completo em [§Frente 5](#frente-5--trocar-gpt-56-luna-por-muse-spark-13-decisão-do-operador-2026-09-10).
8. **Dois furos consertados, achados pelos revisores e não por teste.** Ambos com entrada
   concreta, e o primeiro é o mais grave que esta sessão produziu:
   - **`handoff_at` tornava a troca de modelo irreversível.** Apontar
     `CONVERSATION_MODEL` para um modelo que o endpoint não serve — inclusive por typo —
     fazia toda cliente virar `modelFailure`, que escreve `leads.handoff_at`. Esse campo
     **é escrito e nunca limpo**: desfazer a variável não desfazia o dano, e todo lead da
     janela ficava fora da agente para sempre, com os follow-ups cancelados pelo sweep.
     Agora erro de configuração é `ModelConfigError`, **não** marca o lead, e o nome do
     modelo é checado no carregamento contra provedores cuja API esta função não fala. E
     o erro deixou de derrubar o boot: o mesmo isolate serve o webhook de venda e o cron.
     **Isso também cobre a cota esgotada de 09/09** — os leads daquelas 20 horas foram
     trancados por esse mesmo caminho, e vale conferir no banco quantos estão assim.
   - **`freeShipping: false` desligava o veto de valor de frete.** A branch fazia `return`
     cedo e levava embora a regra de valor, então "o frete do antecipado é R$ 12,99"
     passava em todos os gates — porque o `price_promise` só verifica se o número é um dos
     preços configurados, e preço configurado lido como frete continua sendo mentira.
     Agora o veto é sobre valor **atribuído** ao frete, mais estreito que valor perto da
     palavra: "São R$ 129,90 mais o frete" e "o frete já está dentro do preço: são
     R$ 129,90" continuam passando, porque são as frases honestas.

### O desenho — quem faz o quê, e por quê

A regra que decide tudo: **regra de negócio é código versionado com teste; credencial,
relógio e chamada HTTP são cano.** Quando bater dúvida sobre onde algo mora, é esta frase
que responde.

- **Edge Function `turn`** (Supabase, Deno) — o cérebro. Uma rota, três entradas:
  - corpo com `{ externalId, from, body }` → um turno de conversa;
  - `{ job: "followups" }` → a varredura das réguas, determinística, custo zero;
  - `{ job: "order", order: {...} }` → uma venda confirmada.
- **Supabase (Postgres)** — todo o estado: `leads`, `conversations`, `messages`, `orders`,
  `followups`, `llm_calls`, `gate_traces`, `jobs`, `hermes_proposals`.
- **n8n** (PikaPods, `encorpa-fashion.pikapod.net`) — cano e relógio, dois workflows:
  - `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) — webhook `/encorpa-inbound`, chama a
    Edge Function, devolve a resposta, e-mail de handoff, **e-mail de recusa**;
  - `Encorpa — Venda confirmada` (`gS72LhYGOnmyALRq`) — webhook `/encorpa-venda`, normaliza
    o payload da plataforma e posta `job: "order"`;
  - `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) — cron de 5 em 5 minutos.
- **Logzz** — pagamento na entrega, a plataforma que agenda. **Coinzz** — antecipado.
- **Meta / WhatsApp Cloud API** — o canal. **Ainda não existe.**

**Duas cópias de cada arquivo, de propósito.** O Supabase sobe conteúdo de arquivo, não
resolve o repositório, então `src/agent/*.ts` e `supabase/functions/turn/*.ts` são **byte a
byte idênticos** e `tests/function-drift.test.ts` quebra no instante em que divergirem. São
oito arquivos espelhados mais duas cópias *inline* dentro do `index.ts` — a tabela `PRICES`
e o ritmo (`MS_PER_WORD`, `bubbleDelayMs`, `splitBubbles`) — cada uma presa à fonte por
teste. Mexeu num, copia no outro **antes** de rodar o teste.

### As decisões de negócio que não se reabrem

> **Os itens 1 e 3 foram reabertos em 2026-09-10** — ver
> [§Decisões de 2026-09-10](#decisões-de-2026-09-10-preço-frete-e-modelo-de-conversa).
> Ficam aqui porque o raciocínio por trás deles continua verdadeiro e é exatamente a tensão
> que a decisão nova reabre de olhos abertos — não é engano, é escolha consciente do
> operador. Onde os dois divergirem, a seção de 10/09 vence.

1. ~~**Um preço só: R$ 129,90 nos dois caminhos.**~~ **Reaberto em 2026-09-10 — volta a
   existir desconto no antecipado.** O raciocínio que zerou o desconto em 09-09 continua de
   pé e não foi refutado, só aceito como custo consciente: o antecipado paga frete que o COD
   não paga, então ao mesmo preço rende R$ 48,35 contra R$ 63,35 do COD, e mesmo desconto
   zero perdia R$ 4,00 contra o COD. A diferença agora é que **quem paga o frete extra é a
   cliente, não mais a operação** — o que muda a conta original. Ver Frente 4.
2. **O antecipado não é opção, é saída.** A agente só o apresenta quando o COD não alcança:
   praça sem cobertura, ou tamanho sem entrega naquela região. Onde o COD chega, existe um
   preço só e nenhuma escolha a fazer — uma pergunta a mais é uma decisão a mais, e uma
   decisão a mais é uma venda a menos.
3. ~~**A cliente não paga frete em nenhum dos dois.**~~ **Reaberto em 2026-09-10 — ela
   volta a pagar frete no antecipado**, calculado por região dentro do checkout da Coinzz.
   No COD continua embutido no preço, como sempre foi. Ver Frente 4.
4. **O prazo do antecipado não é faixa.** "Varia por região, em média 5 dias úteis",
   **sempre** dizendo que varia. O gate recusa a faixa, o número errado e o número certo
   dito como prazo fixo.
5. **`afterpay` é o pagamento na entrega** na Coinzz. Dos quatro métodos que ela aceita,
   nenhum se chama COD, e `afterpay` é o único que significa pagar depois.
6. **São duas ofertas, dois hashes.** `offerHash` (`offp16pv`, entrega) e `prepayOfferHash`
   (`offkw47x`, antecipado). Um hash só cobraria R$ 129,90 pela oferta errada.
7. ~~**O M não é problema de estoque** — é parametrização de produtos da integração Logzz
   na Coinzz.~~ **Derrubado em 2026-09-21:** o M apareceu em Belo Horizonte, Contagem e
   Betim, e continua ausente nas outras 19 praças com COD. Parametrização de produto não
   funcionaria em três cidades e falharia em dezenove — o recorte por CD aponta para
   **estoque**. A conduta não muda, e agora por outro motivo: a consulta é feita com o G e
   **nunca veta um tamanho**, porque a disponibilidade por tamanho muda de semana para
   semana e quem decide é o checkout da Logzz. Ver
   [`docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md`](docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md).
8. **O tamanho vai no complemento do agendamento.** A página da Logzz não tem seletor; a
   instrução é do fornecedor, em maiúsculas, na descrição do produto.

### O que foi construído em 2026-09-09 à noite

Seis coisas, todas verificadas pela porta de produção e não por teste:

1. **Ramo de erro no n8n.** O nó do turno tem `onError: continueErrorOutput`. A recusa da
   Edge Function vira corpo `{ status: "error", error }` **e** e-mail com telefone,
   `externalId` e o que a cliente escreveu. Antes ela existia só no log de execução.
2. **Webhook de venda, das duas plataformas.** A rota `job: "order"` existia e verificada
   desde 09/09 de manhã, e **nada a chamava** — a régua de pós-pedido nunca armava e a de
   silêncio seguia cobrando quem já tinha comprado. Agora existe quem chame.
3. **Pedido morto desarma a régua.** `isOrderDead` lê o status por raiz. Cancelado, a régua
   inteira morre — pós-pedido e silêncio.
4. **A janela de 24h da Cloud API.** `deliveryFor` decide pelo relógio, não pelo tipo do
   toque. Fora da janela: template do config, ou bloqueio explícito.
5. **`pacing.ts` ligado.** Toda resposta devolve `bubbles` junto do `reply`.
6. **Dois defeitos silenciosos, achados por auditoria e sonda:** `prepayVariesByRegion` era
   decorativo (o gate nunca lia a chave), e a véspera de entrega ia para quem cancelou.

### As armadilhas que já custaram caro — leia antes de mexer

1. **`BUSINESS_CONFIG` sobrescreve o fallback INTEIRO.** A produção monta o config com
   `Deno.env.get("BUSINESS_CONFIG") ?? fallback`, e o `??` é sobre a variável, não campo a
   campo. Com o secret setado — e está — o objeto do código **nunca é lido**, e uma chave
   nova nasce **ausente** lá. `freeShipping` foi criada obrigatória, leu `false` em produção
   e reinstalou um veto com 2.738 testes verdes e o deploy dado como concluído.
   → **Campo novo em `BusinessConfig` nasce opcional, com o padrão certo para ausente.**
   O valor do secret **não é legível** pela API (vem hasheado); só o operador vê no painel.
2. **O status HTTP não é canal de erro.** O webhook do n8n responde **200 em qualquer
   desfecho**, de propósito: não-2xx faz o canal reentregar a mensagem, e reentrega sobre
   recusa é laço. Quem precisa reagir **lê o corpo**.
3. **O deploy pela ferramenta MCP não cabe.** São 199 KB. Deploy pela API de gerência, com
   os arquivos do disco, **onze** arquivos — `availability.ts` entrou depois da receita
   antiga, `state-machine.ts` em 2026-09-22 com a instrumentação do funil, e `prompt.ts`
   no mesmo dia, quando o prompt saiu do `index.ts` para ter teste. Confira
   `ls supabase/functions/turn/*.ts` antes de rodar: a conta já mudou três vezes, e faltar
   um derruba a função no boot. Ver [`.claude/memory/supabase-deploy-por-api.md`](.claude/memory/supabase-deploy-por-api.md).
4. **Isolate quente.** Por minutos depois de um deploy, parte das requisições ainda cai na
   versão anterior. Confira a sonda pelo **formato** da resposta, não pelo conteúdo.
5. **Cegueira a negação.** Toda heurística de texto deste repositório já errou em negação.
   Antes de mexer numa, sonde a frase negada **e** a negativa que não nega.
6. **Verificar pela porta de produção.** Sonda contra a Edge Function prova o código, não o
   caminho. O webhook do n8n já devolveu 200 sem criar conversa nenhuma por um dia inteiro.
7. **O system prompt não é coberto por teste nenhum.** `systemPrompt()` vive inline no
   `index.ts` e nenhum teste o executa ou lê — `function-drift.test.ts` prende os espelhos
   e a tabela `PRICES`, não uma linha do prompt. Foi assim que ele passou doze dias
   afirmando duas coisas contrárias sobre desconto e prometendo frete grátis que o gate já
   sabia condicional. → **Toda regra de negócio citada no prompt tem que ler o config, com
   o mesmo teste que o gate correspondente usa.** Antes de mexer em preço, frete ou prazo,
   leia o prompt junto do gate: são a mesma promessa escrita duas vezes.

### Decisões de 2026-09-10: preço, frete e modelo de conversa

Quatro decisões do operador na mesma tarde, tomadas fora do código — **nada abaixo está
implementado.** `config/business.example.json`, o secret `BUSINESS_CONFIG` e
`supabase/functions/turn/index.ts` continuam exatamente como a v30 descreve. O roteiro
exato de implementação está na [Frente 4](#frente-4--preço-frete-e-desconto-do-antecipado-decisão-de-2026-09-10)
(preço e frete) e no item 1 da [Frente 3](#frente-3--dívidas-técnicas-nomeadas) (modelo).

1. **Remover o frete fixo de R$ 15,00.** Deixa de existir um valor único que a operação
   paga por venda no antecipado. `LABEL_COST_BRL` em `availability.ts` fica obsoleto como
   número de custo — só continua existindo como registro histórico do que a margem sheet
   lia até aqui.
2. **O frete do antecipado passa a ser da cliente, calculado no checkout.** Não é um número
   novo fixo — é a Coinzz/Logzz calculando o frete real por região na hora do checkout, do
   jeito que `CheckoutPrices.prepayBrl` (`src/order/checkout.ts:47`) **já está documentado
   para funcionar**: "Product only. Freight is calculated separately inside the checkout."
   O COD não muda — frete continua embutido no preço, como desde sempre.
3. **Desconto do antecipado volta a 10%**, sobre os R$ 129,90 publicados:
   `prepayBrl = 129.90 × 0.90 = R$ 116,91`, `prepayDiscountPercent = 10`. Não é o 15% de
   antes de 09-09 (R$ 110,41) — é um número novo, mais conservador, porque agora ela paga
   frete à parte e o desconto de produto sozinho não pode fingir que cobre isso.
4. **Modelo de conversa: EXECUTADO — Meta Muse Spark 1.3 no código, ainda não deployado.**
   Decidido pelo operador ainda em 10/09, e o código escrito na mesma tarde — ver
   [§Frente 5](#frente-5--trocar-gpt-56-luna-por-muse-spark-13-decisão-do-operador-2026-09-10)
   para o que mudou e o que continua faltando (o eval, que não rodou e não tem como rodar
   neste ambiente). O Gemini fica onde está. Registro do raciocínio original
   (`$1,25/$4,25` por milhão de tokens): dentro do teto de **R$ 0,50 por lead / 20
   mensagens** definido nesta sessão, é o modelo de maior Intelligence Index (53,0) com
   folga real de margem (R$ 0,32 de custo estimado, 36% abaixo do teto) — Grok 4.6 e Qwen3.8
   Max empatam em score mas encostam no teto (R$ 0,49, 3% de folga), risco demais pra uma
   estimativa que já é aproximada. **Não é decisão fechada de troca — é o candidato a
   testar.** Ver ressalva no item 1 da Frente 3.

---

## O PLANO DAQUI PRA FRENTE

Seis frentes, na ordem em que destravam dinheiro. **Nada na frente 2 vale a pena antes da
frente 1 estar de pé**, e a frente 0 bloqueia as duas. As frentes 4 e 5 são independentes
das outras — podem andar em paralelo, não travam nem são travadas por elas. A frente 5
(trocar o modelo da conversa) é a única cuja metade de código já está pronta e cuja outra
metade ainda não existe.

### Frente 0 — o que trava hoje (operador, não código)

| # | O quê | Quem | Como se sabe que fechou |
|---|---|---|---|
| 0.1 | **Cota da OpenAI** | operador | A sonda de produção responde em vez de virar handoff |
| 0.2 | **Verificar o `BUSINESS_CONFIG`** | agendado | A agente diz R$ 129,90 nos dois caminhos |
| 0.3 | **Webhook da Coinzz** | operador + agente | Chega o primeiro payload real e o mapeamento fecha |

**0.1 — Cota da OpenAI.** Sondado em 2026-09-09 21:08 UTC. Não é limite por minuto, é teto
esgotado:

> `Rate limit reached for gpt-5.6-luna ... on tokens per min (TPM): Limit 100000,`
> `Used 100000, Requested 2723. Please try again in 19h36m20.16s.`

Volta sozinha por volta de **2026-09-10 16:45 UTC**. Até lá **toda** cliente recebe
`"Deixa eu confirmar isso certinho pra você"` e vira handoff — com tráfego de anúncio
rodando, cada lead cai no e-mail do operador em vez de virar venda. **O Gemini está de pé**;
morre só a chamada da conversa. Decisão do operador: **esperar**, sem subir limite e sem
trocar de modelo.

**0.2 — O `BUSINESS_CONFIG` foi salvo e ninguém confirmou que pegou.** Todo campo que mudou
— `prepayBrl`, `prepayDiscountPercent`, `prepayAvgDays`, `prepayVariesByRegion` — só aparece
no prompt e nos gates, e os dois vêm depois da chamada barrada. **Salvo ≠ verificado.**
Há um check-in agendado para **2026-09-10 17:15 UTC** (`trig_019zftJ8Zx3bLqWCky8HQter`) com
o roteiro inteiro: "oi" → tamanho → CEP → "qual a diferença?". Ele prova quatro coisas: os
dois preços em R$ 129,90, o prazo de 1 a 3 dias na entrega, a frase da média no antecipado,
e `bubbles` na resposta.

**0.3 — Coinzz.** A URL está colada no painel e **nenhum webhook real chegou ainda**. O
mapeamento dela é o esperado, não o confirmado. O primeiro que falhar vira e-mail com o JSON
cru — é esse e-mail que fecha a metade que falta.

### Frente 1 — a venda fecha sozinha

Tudo aqui está **em código e verificado**; o que falta é confirmar contra dado real.

1. **Confirmar o mapeamento da Coinzz** (depende de 0.3). O da Logzz já saiu de payload
   real: `external_id`, `client_phone`, `order_final_price` (o **total**, não o unitário —
   a quantidade pode ser > 1), `client_address_comp`, `order_status`, `date_order`,
   `date_delivery`.
2. **Conferir o primeiro pedido real ponta a ponta antes de abrir tráfego.** Método de
   pagamento errado cria cobrança que a cliente não combinou.
3. **Vigiar o e-mail de "venda não mapeada".** Todo tamanho que não passar cai ali. Se
   passar a cair muito, o texto da instrução do fornecedor precisa mudar, não o código.

### Frente 2 — o canal (WhatsApp Cloud API)

Frente do sócio do operador. **O lado do código está pronto e bloqueando de propósito.**

1. **Aprovar os templates na Meta.**
2. **Declarar cada um em `BUSINESS_CONFIG`**, sob `channel.templates`, com nome, idioma e a
   **ordem dos placeholders** — a aprovação fixa a ordem e o código não adivinha:

   ```json
   "channel": { "templates": {
     "silence_2":  { "name": "...", "language": "pt_BR", "variables": ["warrantyDays"] },
     "silence_3":  { "name": "...", "language": "pt_BR", "variables": ["weekday", "couponPercent"] },
     "order_eve":  { "name": "...", "language": "pt_BR", "variables": ["price"] }
   } }
   ```

   **Os três já estão redigidos** em
   [`docs/agente-ia/06-script/03-templates-meta.md`](docs/agente-ia/06-script/03-templates-meta.md)
   (22/09), com nome, categoria, corpo e o bloco JSON pronto — e os três passam nos 19
   gates. **`order_eve` leva só `price`, não `size`** como este exemplo dizia antes:
   `deliveryFor` bloqueia o envio quando um placeholder resolve vazio, e um lead sem tamanho
   gravado perderia justamente o toque que salva a margem.

   Valores possíveis: `price`, `warrantyDays`, `size`, `address`, `couponPercent`,
   `weekday`. **Ausente bloqueia** todo toque fora da janela — texto livre lá a Meta
   recusaria de qualquer jeito, então barrar e dizer vence mandar no escuro.
3. **Ligar o envio.** Quem enviar lê `bubbles` (texto e atraso já calculados) e chama
   `presenceRefreshes` de `pacing.ts` pro "digitando". `firstReplyAt` é do relógio de quem
   envia, não da resposta.
4. **Contadores de pacing.** O gate `pacing` existe e a varredura **não passa contador
   nenhum** — eles pertencem ao canal. Ao ligar, dê ao chamador um **retry por hora**; não
   reuse o adiamento para a reabertura, que é certo pro limite diário e longo demais pro
   horário.

### Frente 3 — dívidas técnicas, nomeadas

Nenhuma trava venda hoje. Todas mordem depois.

1. ~~**`CONVERSATION_MODEL` é constante no código**~~ **✅ feito em 10/09 (não
   deployado).** Lê de `Deno.env.get("CONVERSATION_MODEL")` com `gpt-5.6-luna` como padrão,
   e um modelo novo tem que trazer `CONVERSATION_MODEL_PRICE` junto ou a função falha no
   boot. O plano B sem deploy passou a existir. **O que continua aberto é a decisão de
   trocar** — e o passo (b) abaixo, o eval, não foi rodado.

   **✅ EXECUTADO em 10/09, no código, ainda não deployado — mas fora de ordem.** A troca
   para Meta Muse Spark 1.3 foi feita no mesmo dia, e o operador instruiu executar direto
   em vez de seguir (a)→(b)→(c). O passo (b) — o eval, com conversas reais medindo
   conversão e recusa de gate, nunca Intelligence Index — **não rodou, e não tem como
   rodar neste ambiente** (falta credencial real da Meta). Detalhe completo, inclusive o
   que isso significa para quem for deployar, na
   [§Frente 5](#frente-5--trocar-gpt-56-luna-por-muse-spark-13-decisão-do-operador-2026-09-10).
   O ponto fraco da recomendação é o alinhamento de segurança da Meta em atendimento
   comercial — é exatamente o que o eval mediria, e ainda não mediu.
2. ~~**`firstReplyAt` usa a hora local do runtime**~~ **✅ feito em 10/09 (não
   deployado).** Decide a janela pela hora local de São Paulo, reusando
   `BUSINESS_TZ`/`offsetMinutes`/`nextOpening` da régua. `pacing.test.ts` foi reescrito com
   quatro casos em instante UTC explícito, incluindo o que só quebra em runtime UTC.
   Ressalva registrada: `hours.timeZone` existe no tipo do gate mas não em
   `src/config/business.ts`, então o fuso é fixo em `America/Sao_Paulo`, igual à régua.
3. **Depoimentos e cupom estão vazios** no config. A agente não pode citar cliente nenhuma,
   e o toque `silence_3` (o do cupom) **não sai** — retorna `null` de propósito enquanto o
   cupom não existir na Coinzz. Anunciar cupom sem destino é a promessa quebrada que este
   projeto já decidiu nunca fazer.
4. **`prepayDaysMin`/`prepayDaysMax` continuam no tipo, ausentes de propósito.** Existem só
   para o gate poder recusar uma faixa contra uma configurada. Não preencha.

### Frente 5 — trocar `gpt-5.6-luna` por Muse Spark 1.3 (decisão do operador, 2026-09-10)

**Status: código escrito nesta sessão, no `main`, ainda não deployado. O eval não foi
rodado e não tem como ser rodado neste ambiente** — ver o aviso abaixo antes de confiar
nisso em produção. Decisão do operador, executada na mesma tarde: **toda ocorrência de
`gpt-5.6-luna` virou Muse Spark 1.3. O Gemini (`gemini-3.5-flash-lite`) ficou onde
estava** — trabalho barato, classificação de intenção e todo o desenvolvimento continuam
nele.

**O que foi escrito**, nos nove lugares do inventário original (mantido abaixo como
registro):

1. **`callMuse`, função nova em `index.ts`**, ao lado de `callLuna` — fala **Meta Llama
   API** (`https://api.llama.com/v1/chat/completions`), formato de requisição
   compatível com OpenAI, chave própria (`META_API_KEY`, nova em `.env.example`). Sem
   piso de `max_completion_tokens` de modelo de raciocínio — Muse Spark não é documentado
   como um.
2. **`muse` saiu da lista de prefixos recusados** (`foreign` regex) — é o único que agora
   tem provedor implementado. Os outros sete (gemini, claude, grok, qwen, llama, mistral,
   command, deepseek) continuam recusados, de propósito.
3. **`DEFAULT_CONVERSATION_MODEL` virou `"muse-spark-1.3"`.** Isso muda comportamento de
   verdade no dia do deploy — ao contrário da Frente 3 e da Frente 4, que não mudavam nada
   sem variável de ambiente, **esta muda o padrão em si**. Reverter para Luna depois do
   deploy exige setar `CONVERSATION_MODEL=gpt-5.6-luna` **e**
   `CONVERSATION_MODEL_PRICE={"in":0.2,"out":1.2,"cached":0.02}` — os dois, porque o preço
   de Luna saiu da tabela estática (ver item 5).
4. **Preço registrado nos dois lugares** — `src/llm/pricing.ts` e a cópia inline em
   `index.ts` — 1,25 / 4,25 por 1M, dentro do teto de 100 USD. `tests/function-drift.test.ts`
   prende os dois.
5. **`src/llm/pricing.ts` perdeu a entrada de `gpt-5.6-luna`.** Foi substituída, não
   mantida ao lado — "trocar tudo" foi lido ao pé da letra para o lado do dev/teste. Uma
   consequência real: o teste que provava que token em cache sai mais barato usava a taxa
   de cache de Luna (10x mais barata), e **Muse Spark não tem taxa de cache confirmada em
   lugar nenhum** — inventar uma entraria como dado real em `llm_calls.cost_brl`. O teste
   foi removido, não forjado; volta quando existir número de verdade
   (`tests/seam.test.ts`, comentário no lugar).
6. **`src/llm/providers/meta.ts`, arquivo novo**, e `src/dev/smoke.ts` chamando-o em vez
   de `openAiProvider`. `src/llm/providers/openai.ts` continua existindo — é um provedor
   OpenAI genérico e reutilizável, só o comentário foi corrigido para não afirmar que
   está em uso.
7. **`CLAUDE.md`, `.claude/agents/prompt-engineer.md`, `.claude/agents/model-cost-governor.md`
   atualizados.** O último registra, sem meias-palavras, que a ordem recomendada (variável
   → eval → padrão) foi pulada por decisão do operador — ver o arquivo.

**O que NÃO foi feito, e por quê:**

- **O eval em si — o passo (b) da ordem original — não rodou, e não tem como rodar neste
  ambiente.** Ele exige chave real da Meta e chamada de rede contra o modelo de verdade;
  nenhum dos dois existe aqui. O que foi provado é que o **mecanismo** funciona (roteamento
  por família, preço, teto, teste, `deno check`) — não que Muse Spark converte tão bem
  quanto Luna ou recusa menos gate. **Isso continua em aberto até alguém rodar o eval com
  credencial de verdade**, de preferência antes do próximo deploy, e certamente antes de
  confiar no resultado.
- **`conversationCapBrl` continua sem reconciliar — e são três números, não dois**
  (corrigido em 2026-09-22, achado B): **1,5** em `config/business.example.json`, que é a
  decisão R10.1 de 21/09 e a correta; **0,8** no fallback da Edge Function e no harness de
  dev, que é o valor antigo de R7.3; e **R$ 0,50 por lead**, citado abaixo e nos itens
  desta frente. Este último **nunca foi teto de conversa** — era o orçamento por lead usado
  para *escolher modelo*, e é anterior a R10.1. Onde as duas coisas se confundirem neste
  arquivo, R10.1 vence. Nenhuma troca de modelo resolve isso sozinha; a ação é alinhar o
  fallback do código, e é o item 2.3 do plano v2.

**O que a decisão compra, quando o eval confirmar:** dentro do teto de R$ 0,50 por lead /
20 mensagens, Muse Spark tem o maior Intelligence Index (53,0) com folga real — R$ 0,32
estimado, 36% abaixo do teto — contra R$ 0,49 de Grok 4.6 e Qwen3.8 Max, que empatam em
score e encostam no teto. E tira a dependência de um único provedor cuja cota esgotou por
20 horas em 09/09.

<details>
<summary>Inventário original (antes da execução) — para quem quiser conferir contra o diff</summary>

**Onde `gpt-5.6-luna` aparecia** — nove lugares, em quatro naturezas diferentes:

| Arquivo | O que era | Risco de trocar |
|---|---|---|
| `supabase/functions/turn/index.ts` | `DEFAULT_CONVERSATION_MODEL` | O padrão. Trocar aqui muda produção **sem** variável de ambiente — era o passo final, não o primeiro |
| `src/llm/pricing.ts` | a tabela de preço | Preço novo obrigatório junto, senão `costOf` lança e o turno vira handoff |
| `supabase/functions/turn/index.ts` (inline) | a cópia de `PRICES` | Espelho preso por `tests/function-drift.test.ts` |
| `src/llm/providers/openai.ts` | comentário | Afirmava que o modelo em uso era *reasoning* |
| `src/dev/smoke.ts` | sonda de dev | Chamava `openAiProvider` — Muse Spark não é servido pela OpenAI |
| `tests/seam.test.ts` e `tests/function-drift.test.ts` | testes | Presos ao nome antigo |
| `CLAUDE.md` | a pilha declarada | A linha que fixava a decisão |

A pedra era `callLuna` só falar a API compatível com OpenAI, e a v32 recusar no
carregamento qualquer nome começando com `muse` — resolvida pelo `callMuse` do item 1
acima.

</details>

### Frente 4 — preço, frete e desconto do antecipado (decisão de 2026-09-10)

O código já foi escrito pensando nesse cenário — a maior parte é **trocar valor de
config, não escrever lógica nova**. Ordem exata:

1. ✅ **feito em 10/09** — `config/business.example.json`, três campos:
   - `prices.prepayBrl`: `129.9` → `116.91`
   - `prices.prepayDiscountPercent`: `0` → `10`
   - `delivery.freeShipping`: `true` → `false` — **mas ver o item 6: este é o campo que
     não deve subir no secret ainda**
2. **`BUSINESS_CONFIG` no Supabase** — os mesmos três campos, **só o operador consegue
   editar** (o secret não é legível pela API de gerência). Sem isso a produção não muda —
   ver a armadilha do `??` sobre a variável inteira.
3. ✅ **confirmado no código em 10/09.** **Nada muda em `src/order/checkout.ts`.** `amountFor` já lê `prepayBrl` como "produto
   só, frete calculado à parte no checkout" — é a assinatura do tipo `CheckoutPrices`
   desde que foi escrito. O `freeShipping: false` também não é comportamento novo: o gate
   `shipping_promise` em `src/agent/guardrails.ts:809-829` já tem a branch pronta e **já
   testada** (`tests/guardrails.test.ts:549` — "com freeShipping desligado, a regra antiga
   volta inteira") para exatamente essa combinação: COD com frete embutido no preço,
   antecipado com frete calculado por região dentro do checkout, nunca "frete grátis" nos
   dois. O `price_promise` gate (`guardrails.ts:385-431`) também já lê `prepayBrl` e
   `prepayDiscountPercent` direto do config para decidir o que é citável — nenhum dos dois
   precisa de código novo, só do valor certo entrando.
4. ✅ **feito em 10/09.** **Comentários que ficam mentindo se não forem atualizados** (não têm efeito em teste,
   mas confundem a próxima sessão):
   - `src/agent/guardrails.ts:791-808` — o bloco de comentário explica a troca de 09-09
     ("this gate used to forbid... now forbids denying"). Precisa de um terceiro parágrafo
     contando que a bandeira voltou a virar, e por quê.
   - `src/agent/availability.ts:244-252` — `LABEL_COST_BRL` está documentado como "she
     pays nothing for it on either path", que deixa de ser verdade no antecipado.
   - Espelhar as duas mudanças em `supabase/functions/turn/guardrails.ts` e
     `supabase/functions/turn/availability.ts` — são cópias byte a byte, `pnpm test`
     quebra sozinho se esquecer (`tests/function-drift.test.ts`).
5. ✅ **feito em 10/09.** **Teste novo:** a combinação `freeShipping: false` **junto com**
   `prepayDiscountPercent: 10` (os testes atuais cobrem cada campo separado, nunca os dois
   como a produção vai rodar). Confirma que a agente cita `R$ 12,99` de economia e `10%`
   de desconto sem citar frete grátis no antecipado.
6. ✅ **decidido em 22/09: saída A** (§R10.6) — só o percentual, nunca a economia em
   reais. O texto abaixo é o registro de 10/09. **O item que precisava da sua decisão antes do deploy — e a premissa dele estava
   errada.** O gate `price_promise` vai liberar **"você economiza R$ 12,99 no
   antecipado"**, a diferença aritmética entre `codBrl` e `prepayBrl`. A versão anterior
   deste item dizia que o frete real cobrado dela seria de R$ 15 a R$ 40 e que ela
   portanto pagaria mais. **Aqueles números são custo do operador, não preço dela** — a
   oferta `encorpa-pagamento-antecipado-0` na Coinzz vem **sem frete configurado nos 27
   estados** (`settingsFreight: []`, medido na fonte e registrado neste próprio arquivo),
   então hoje o checkout cobra dela **R$ 0,00** e a economia de R$ 12,99 é **verdade
   literal**.
   
   A meia-verdade não existe ainda: ela nasce no minuto em que o operador parametrizar
   frete naquela oferta. O que **existe hoje** é o inverso — `freeShipping: false` faz a
   agente parar de dizer "frete grátis", que é verdade e é o melhor argumento dela, e
   passar a dizer que o frete é calculado no checkout, que é falso. **A decisão que vem
   antes das três saídas é: o operador vai configurar frete na Coinzz ou não?** A conta
   inteira, a análise de sensibilidade e as quatro combinações de preço × frete estão em
   [`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md). É exatamente o tipo de meia-verdade que os gates deste projeto
   existem para impedir, e é a mesma armadilha econômica que motivou zerar o desconto em
   09-09 — só que agora do lado da promessa, não do lado da margem. Três saídas, nenhuma
   escolhida ainda:
   - **A.** Tirar a economia de R$ 12,99 da lista de valores citáveis no `price_promise`
     (deixar só o desconto de 10% como número, nunca "economiza R$X").
   - **B.** Manter a citação, mas só o operador decide isso porque é uma opção comercial:
     aceitar que a frase é otimista sabendo que nem sempre é verdade.
   - **C.** Citar a economia só combinada com uma ressalva ("mais frete, calculado no
     checkout") — mais fiel, mais difícil de fazer o guardrail aceitar sem soar burocrático.
7. **Verificar antes de deployar:** `pnpm test && pnpm typecheck && pnpm typecheck:function`,
   depois sonda de produção nos dois caminhos confirmando R$ 116,91 + 10% no antecipado,
   R$ 129,90 sem menção a frete grátis no COD, e frete calculado no checkout (nunca um
   valor fixo) no antecipado.
8. **Documentos de negócio que citam "frete grátis nos dois" ou "preço único" como fato
   consolidado** — `docs/documentacao/contexto-negocio/`, `docs/agente-ia/06-script/` —
   não foram varridos nesta sessão. Buscar por "frete grátis", "R\$ 129,90" e "desconto"
   antes de considerar essa frente fechada.

### O que NÃO fazer

- **Não pular, desabilitar ou isolar teste** para ficar verde.
- **Não deployar sem `pnpm typecheck:function`** — é a única coisa que olha o código que a
  produção executa de verdade; o `tsconfig` não cobre aquele arquivo.
- **Não editar um dos espelhos sem editar o outro.**
- **Não criar campo obrigatório em `BusinessConfig`.** Ver armadilha 1.
- **Não mandar prazo do antecipado como faixa**, nem a média sem dizer que varia.
- **Não citar a economia do antecipado em reais** — nem no prompt, nem em script, nem em
  teste que espere vê-la liberada. Saída A (§R10.6): só o percentual e o preço.
- **Não devolver `freeShipping: true` ao `BUSINESS_CONFIG`.** Desde 22/09 a operação não
  oferece frete grátis; a chave ausente lê como não grátis (`=== true`). O operador vai
  apagar a chave do secret.
- **Não deployar sem rodar o eval de Muse Spark antes, se possível.** O padrão já é
  `muse-spark-1.3` no `main` — o próximo deploy troca o modelo de toda conversa sem prova
  de conversão ou taxa de recusa de gate. Se não der para rodar o eval antes do deploy,
  ao menos avise o operador de que está subindo sem ele.
- **Não reaproveitar o [PR #22](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/22)** —
  merjado em 2026-09-09. Trabalho novo recomeça a branch a partir da `main`.

### Higiene de segurança

Rotacionar: `service_role` da Supabase, chaves OpenAI e Gemini, tokens do Facebook. Dois
PATs da Supabase foram colados no chat em 2026-09-09 e **os dois já foram revogados** — o
segundo depois dos deploys v28, v29 e v30; um deploy novo precisa de token novo. E um print
de DevTools enviado numa sessão trazia telefone e CPF de uma cliente real: nada foi usado
nem gravado, mas print de aba Network carrega dado pessoal junto.

---

## Histórico — o que veio antes de 2026-09-09 à noite

> **Aviso.** Daqui para baixo é registro, não estado, e as seções antigas erram em quatro
> coisas que foram corrigidas depois:
>
> | Aparece lá | É isto hoje |
> |---|---|
> | prazo do antecipado "5 a 10" ou "3 a 10 dias úteis" | **não é faixa** — "varia por região, em média 5 dias úteis" |
> | antecipado a R$ 110,41, com 15% de desconto | **R$ 129,90**, desconto **zero**, e ele não é opção, é saída |
> | frete de R$ 24,98 cobrado da cliente | **zero** para ela nos dois caminhos |
> | o M "com estoque zerado no país" | **parametrização** da integração Logzz na Coinzz |
>
> Onde divergirem do COMECE POR AQUI, o topo vence.

## Onde o trabalho parou

### O elo que faltava para a venda fechar

> **Onde cada peça está, enquanto os PRs não mergeiam.** O laço de endereço, a bateria de
> conversas e a persuasão estão no
> [#16](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/16). A coleta de
> nome/e-mail/CPF, o corpo do pedido da Coinzz e a escassez ligada estão no
> [#17](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/17), que tem base no #16 —
> mergear na ordem. Contagem de testes: 2517 no #16, **2674** com o #17.

A cliente dizia "quero comprar" e a conversa **morria ali**. Nada coletava endereço,
nada coletava os dados que a Coinzz exige, e o checkout era mock. Três buracos, os três
fechados nesta sessão.

**1. O laço de endereço (§D2/§D5).** Existia escrito e desligado de propósito — gravar
endereço que ninguém conferiu é entrega perdida, e em COD isso é o frete duas vezes.
Ligado com a checagem que faltava: acumula ao longo dos turnos, pergunta **uma** coisa
por vez, lê de volta, e só o "sim" dela confirma. `confirmsAddress` recusa qualquer
resposta com correção — ler *"na verdade é 125"* como sim é como o pacote vai para a
porta antiga. Peça nova **desconfirma** o que já estava confirmado.

**2. Nome, e-mail e CPF** ([`src/agent/identity.ts`](src/agent/identity.ts)). A API da
Coinzz exige os três e a conversa **não pedia nenhum** — a venda não fecharia nem com a
credencial na mão. Mesma disciplina do endereço: acumula, uma pergunta por vez, e só
**depois** do endereço confirmado. Pedir CPF antes de ela decidir comprar é o jeito mais
rápido de matar a conversa; por isso ele é o último. O CPF é conferido pelos próprios
dígitos verificadores — `111.111.111-11` passa na aritmética e é exatamente o que alguém
digita para furar formulário.

**3. O pedido da Coinzz** ([`src/agent/coinzz.ts`](src/agent/coinzz.ts)). O turno devolve
`order` com o corpo pronto e uma chave de idempotência; o **n8n posta** com a credencial
dele. A divisão é a que o `CLAUDE.md` já fixava: regra de negócio é código versionado com
teste, credencial e chamada HTTP são cano. Nenhum token entra neste repositório, e a
`baseUrl` também não — ela mora no nó do n8n.

Faltando qualquer coisa, vem `orderBlocked` com o nome exato (`coinzz.offerHash`,
`customer.document`) em vez de um corpo pela metade, que vira pacote na porta de um
estranho.

**Duas coisas ficaram registradas como decisão do operador, não como inferência:**

- **`afterpay` é o pagamento na entrega** (2026-09-08). Dos quatro métodos que a Coinzz
  aceita — `afterpay`, `bank_slip`, `credit_card`, `pix` — **nenhum se chama COD**, e COD
  é o funil inteiro. `afterpay` é o único que significa pagar depois. Travado em teste,
  porque método errado cria cobrança que a cliente não combinou. **O primeiro pedido real
  precisa ser conferido ponta a ponta antes de tráfego.**
- **São duas ofertas, não uma.** O site linka dois checkouts:
  `encorpa-pagamento-na-entrega-0` (R$ 129,90) e `encorpa-pagamento-antecipado-0`
  (R$ 110,42). Um `offerHash` só teria cobrado **R$ 129,90 pela oferta de R$ 110,42**.
  `prepayOfferHash` é campo próprio, e a ausência dele recusa o pedido antecipado em vez
  de cair no hash errado.

**Onde achar os dois hashes:** as páginas de checkout são apps JS que buscam os dados por
API, então o HTML servido não os carrega. Aba Network do navegador no próprio checkout,
painel da Coinzz, ou o payload de um webhook de venda antiga. Formato do exemplo deles:
`offxxxxxxxx`.

### Persuasão: o que a agente ganhou permissão de fazer

O prompt era quase só lista de proibições, com teto de 45 palavras — handbrake de
conversão, não guardrail. Agora ela tem técnica e liberdade de usar quando julgar:
ancoragem nos R$ 216,50 publicados, reversão de risco, antecipar a objeção, fechamento
por escolha em vez de sim/não, espelhar a palavra dela ("barriguinha", não "abdômen"), e
sempre deixar uma pergunta viva. O teto virou juízo: curta por padrão, até três
parágrafos quando a objeção ou o fechamento merecem.

O prompt também diz **quem está do outro lado** — uma mulher que parou de usar uma roupa
de que gosta porque não se sentiu bem nela. Cena concreta em vez de elogio abstrato, e
proibido apontar defeito ou sugerir que ela precisa mudar. A honestidade entrou como
argumento, não ressalva: ela já ouviu promessa de emagrecimento antes e reconhece quem
não mente.

**Uma trava que ninguém tinha visto:** a prova social estava a cadeado. O gate
`invented_testimonial` recusa qualquer citação de cliente fora de `knownTestimonials`, e
**nada nunca alimentava a lista** — toda avaliação real era reescrita fora. Agora
`config.testimonials` chega na cadeia.

**Escassez ligada pelo operador.** `scarcity.allowUnverified: true` e `unitsLeft: 12`. A
chave abre a urgência e **nada mais**: com ela ligada, preço inventado, cupom inexistente
e promessa de emagrecimento continuam barrados, com teste travando os três.

### A bateria de conversas, e o defeito mais caro do projeto

780 casos: 100 roteiros de conversa em três escritas reais de WhatsApp cada
([`src/dev/chats.ts`](src/dev/chats.ts)), mais a cadeia inteira contra as frases que a
agente pode escrever ([`src/dev/simulate.ts`](src/dev/simulate.ts)). Roda por
`pnpm dev` **e** dentro do `pnpm test` — script que ninguém roda foi exatamente como o
`pnpm lint` ficou quebrado por meses.

**A tabela de tamanho do código discordava da que a cliente lê.** `sizeFromDressSize`
dizia que 42 é **M** e 46 é **G**. O site publica **42–44 = G** e **46–48 = GG**
(`Offer.tsx` :16-20), e a base de conhecimento repete. A agente estava indicando um
tamanho **menor** que a página onde a cliente leu a tabela, em todo degrau par — e
tamanho pequeno volta, o que em COD é o frete inteiro perdido. Pior: as sondas das
sessões anteriores ("42 → M", "46 → G") cimentaram o erro, e um teste o travava.

As duas escadas viraram um array só, então não podem mais divergir, e um teste percorre
a tabela publicada degrau a degrau.

**"Manequim" é jargão.** O operador apontou: quase ninguém usa a palavra, as clientes
dizem *"uso 42 de calça"*. A agente agora pergunta assim e aceita número ou letra. O
extrator continua entendendo "manequim" — quem usa a palavra não é punido por isso.

**Sapato virava cintura.** "Calço 38" está a uma letra de "calça 38", e o 38 ia para
`leads.size` como M.

**Seis promessas não tinham gate nenhum** — 13 de 16 frases fora do escopo passavam
inteiras. A cadeia foi de 11 para 17 gates:

| Gate novo | A frase que passava |
|---|---|
| `health_claim` | "corrige a sua postura e cura a dor nas costas" |
| `scarcity_claim` | "só restam 3 unidades", "a promoção acaba em 10 minutos" |
| `warranty_promise` | "você tem 30 dias", "troca quantas vezes quiser" |
| `shipping_promise` | "no antecipado o frete é grátis também" |
| `unavailable_offer` | "também temos calcinha modeladora", "pode retirar na nossa loja" |
| `installment_promise` | "dá pra parcelar em 3x" (na porta ela paga uma vez) |

O `price_promise` também passou a pegar a concessão sem número — *"eu tiro mais um
pouquinho"* compromete a loja com um preço que ninguém definiu.

**Três jeitos de ser ignorada, todos corrigidos.** *"Me tire **dessa** lista"* não era
opt-out (só *"da lista"* era), então quem pediu para parar continuava recebendo — o
único erro irreversível da lista. *"Tem alguém disponível pra falar?"* e *"não quero
falar com uma máquina"* deixavam quem pediu gente conversando com robô.

**2674 testes** no total (com o #17), contra 148 no começo da sessão. `pnpm dev` roda a bateria
da cadeia (811 casos); `pnpm dev:conversas` roda as 360 conversas completas (1645
verificações); o CI roda as duas.

**O log de decisões estava ensinando o erro.** A R9.1 registrava *"verificado em produção:
manequim 42 → M, 46 → G"* — e as sondas realmente devolveram isso. O que elas verificaram
foi **o código, não a tabela**. Uma sonda de produção confirma que o código faz o que o
código diz; ela não confirma que o código concorda com o que a loja publicou. As duas
entradas ganharam nota de correção, porque uma sessão futura leria os números antigos como
verdade.

### Trabalho da sessão de 2026-09-08 — a varredura por falhas

A sessão não escreveu funcionalidade nova: foi atrás do que já estava lá e estava
errado. Sondas contra a cadeia real, com a configuração de produção, acharam sete
defeitos confirmados, mais um oitavo achado na última varredura. Todos corrigidos,
com teste que trava cada um. **175 testes**,
`pnpm lint`, `pnpm typecheck`, `pnpm test` e `deno check` verdes.

**A cegueira a negação tinha um lado que ninguém tinha olhado.** O PR #12 varreu os
gates que vetavam a frase honesta. O espelho disso — a negativa qualquer que libera a
promessa — estava intacto e é o lado caro:

| Frase | Devia | Fazia |
|---|---|---|
| "**Sem juros** e sem burocracia, sai por **R$ 59,90**" | barrar | passava |
| "**Sem esperar** muito, **chega amanhã**" | barrar | passava |
| "**Te dou 30%** agora" | barrar | passava (o gate só olhava % se a palavra "desconto" existisse) |
| "O tecido é **92%** poliamida" | passar | barrava — reescrita paga por frase correta |
| "Custa **200 reais**" | barrar | passava (só `R$` era preço) |
| "**não uso 40**, uso 46" | ler 46 | lia **40** — gravava M para uma cliente G |
| "Rua das Flores, **13010-100**" | sem número | lia **13010** como número da casa |

Os dois últimos são os caros de verdade: tamanho errado e endereço errado, em COD,
são o pacote que viaja, falha e volta. O `negatedAt` agora trata `sem` como o que ele
é — nega o substantivo ao lado, não tudo o que vem depois —, o gate de porcentagem
decide pela vizinhança do número (e composição de tecido vence desconto), e
`sizing.ts` ganhou a mesma fronteira de cláusula. Registrado em
[`.claude/memory/negation-blindness.md`](.claude/memory/negation-blindness.md), porque
os quatro módulos que leem português com regex já erraram nisso.

**Falha de provedor sumia com a cliente, para sempre.** Um throw da OpenAI ou da
Gemini escapava do handler. A mensagem de entrada já estava gravada, então a
retentativa do n8n recebia `duplicate` — e a cliente ficava esperando uma resposta que
ninguém estava escrevendo. Silencioso, permanente, invisível no log; e o custo até a
falha também se perdia. Agora sai pela mesma porta de todo beco sem saída: resposta de
espera, handoff, custo gravado.

**Dois gates estavam mortos e um cobrava caro.** `identical_template` nunca recebeu
`recentOutbound` — passava por construção em toda mensagem que a agente já mandou;
agora recebe o histórico, que já era buscado. `invented_testimonial` lia qualquer aspa
como depoimento, então repetir a pergunta da própria cliente virava reescrita paga;
agora só conta a aspa que alguém assina. `pacing` continua sem contexto **de
propósito**: os contadores são da camada de canal, que não existe sem o WhatsApp.

**A régua de silêncio se destruía de madrugada.** Quem para de responder às 23:30 tem
o `silence_1` vencendo à meia-noite — fora da janela 6-24. A varredura tratava **todo**
bloqueio como cancelamento, então o toque mais valioso da régua (o de 30 minutos
depois, quando ela ainda lembra da conversa) era jogado fora em vez de sair ao
amanhecer. O handler do turno distingue `defer` de `stop` desde o laço de reescrita; a
metade do relógio nunca aprendeu a diferença.

A decisão mora em `followups.decideTouch` — em `followups.ts`, e não dentro da Edge
Function, porque ali nenhum teste alcança: a primeira versão desta correção podia ser
apagada inteira sem que um único teste falhasse. Ela também resolve o efeito colateral
de arrastar um toque só: adiar o `silence_1` para as 06:00 e deixar o `silence_2` às
09:00 comprime a régua de nove horas para três, que é como um número é denunciado. A
régua de silêncio é **reancorada** na reabertura; o pós-pedido e a resposta adiada só
se movem, porque a hora deles é a própria mensagem.

**Ressalva registrada:** `pacing` também é `defer`, e adiar para a reabertura é certo
para um teto diário e longo demais para um horário. Latente hoje — a varredura não
passa contador nenhum, porque eles são da camada de canal.

**Três buracos de processo, fechados:**

1. **`pnpm lint` nunca rodou.** O script chamava eslint, que não estava instalado nem
   configurado. Um comando que sempre falha é pior que comando nenhum. Pegou um erro
   real na primeira execução.
2. **Existe CI.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda os quatro
   comandos canônicos mais `typecheck:function` — a única coisa que olha o arquivo que
   a produção executa de verdade. "Verde" deixa de significar "alguém lembrou".
3. **A quinta cópia, que não é arquivo.** A Edge Function declara o próprio `PRICES`
   inline. Nenhuma das duas tabelas sabia da outra: mudar `src/llm/pricing.ts` deixava
   a produção cobrando o preço velho e todo custo gravado dali em diante
   incomparável. O `function-drift.test.ts` agora lê o literal de dentro do
   `index.ts` — verificado mudando um lado e vendo falhar.

Também: `llm_calls` tem colunas de token e gravava zero em todas, o que deixa o custo
armazenado sem detalhe para conferir contra a fatura. Agora grava.

**A divergência do prazo, fechada.** O site prometia "entre 7 e 14 dias" no FAQ e na
página de obrigado, contra os 3 a 5 decididos na rodada 7 — e o guardrail da agente
**recusa** responder fora dessa janela. A mesma cliente lia um número no site e ouvia
outro da agente. Corrigido no `Encorpa-Website` (branch
`claude/ricos-handoff-analysis-n0bi4z`) e nos cinco lugares onde ainda aparecia nos
docs daqui. O caminho antecipado ganhou passo próprio, sem número, pela mesma razão
que a agente não diz nenhum ali.

### A venda inteira, pelo webhook de produção

Sete turnos, do "oi" ao link, entrando pela mesma porta que a cliente usará. **`rewrites: 0`
em todos**, **zero vetos** na conversa inteira, custo total **R$ 0,0197**.

| Turno | Resultado |
|---|---|
| "oi, vi o anúncio" | abriu dizendo que **não emagrece**, com o preço e a pergunta de tamanho |
| "quanto custa?" | R$ 216,50 → R$ 129,90, e R$ 110,41 antecipado |
| "uso 42 de calça" | **G**, e citou as 12 unidades que o operador declarou |
| "quero comprar" | pediu o nome. **Nenhum pedido de endereço em turno nenhum** |
| nome → e-mail → CPF | um de cada vez, CPF por último |
| CPF | **o link**, e a mensagem dizendo que o pedido só nasce no checkout |

Estado final do lead: `size: G`, identidade completa e correta, `address: null`,
`handoff_at: null`, 14 mensagens, 3 toques armados, **0 blocos de guardrail**. O link
respondeu HTTP 200 com os quatro parâmetros. Dados de teste apagados.

Zero vetos numa conversa inteira é o `gateBriefing` fazendo o trabalho dele: a agente
escreveu dentro das regras em vez de descobri-las sendo recusada.

### A porta de produção estava fechada, e ninguém sabia

Descoberto ao testar o e-mail de handoff pelo webhook real, em 2026-09-08. **Toda
verificação anterior deste projeto chamou a Edge Function direto** — o que prova o
código, e não o caminho.

O nó `Cerebro do turno` autenticava na Supabase com a credencial **`Gemini API`**. A
Supabase recusava com `UNAUTHORIZED_INVALID_JWT_FORMAT`, nenhuma conversa nascia,
nenhuma mensagem era respondida. A credencial já tinha se chamado "Header Auth account":
foi renomeada e teve o valor trocado quando as APIs de modelo foram cadastradas, e levou
o turno junto.

E era silencioso **por configuração**: o nó estava com `neverError`, então o erro voltava
como **HTTP 200 com o erro dentro do corpo**. Webhook verde, execução verde, banco vazio.

Corrigido: credencial própria (`Supabase service_role`), `neverError` desligado, e a
regra registrada em
[`.claude/memory/verificar-pela-porta-de-producao.md`](.claude/memory/verificar-pela-porta-de-producao.md).
Sonda que não entra pelo webhook não verifica a entrada; e depois de sondar, confira o
banco — se nenhum lead nasceu, não importa o que o HTTP devolveu.

### O aviso de handoff, funcionando

`Encorpa — Turno da agente` ganhou um ramo paralelo: `É handoff?` (checa `status` **e**
`notify`) → `Avisa o operador` (SMTP do Gmail, três tentativas, falha visível). O ramo é
paralelo de propósito — a resposta ao webhook sai antes, sem esperar o SMTP.

Verificado ponta a ponta pelo webhook de produção: o Gmail respondeu
`250 2.0.0 OK`, `accepted: ["rdvaroto@gmail.com"]`, remetente `rodrigo.varoto@gmail.com`
(tem de ser a conta que autentica no SMTP, senão o Gmail recusa). O e-mail leva motivo,
telefone, **link `wa.me`**, o que a agente disse a ela, os ids e o custo.

### Deployado e verificado em produção — Edge Function na versão 17

A venda fecha, do "oi" ao link, verificada contra o modelo real. **`rewrites: 0` em todos
os turnos**, custo de uma conversa completa: **R$ 0,011**.

| Turno | O que saiu |
|---|---|
| "quanto custa?" | R$ 129,90 na entrega e **R$ 110,41** antecipado — o preço que o checkout cobra |
| "uso 42 de calça" | **G**, pela tabela publicada |
| "quero comprar" | pede o nome; **não pede endereço em momento nenhum** |
| nome → e-mail → CPF | uma coisa de cada vez, CPF por último |
| CPF | **o link, com os quatro campos preenchidos**, e a mensagem dizendo o que falta lá dentro |

O link que saiu:
`.../encorpa-pagamento-na-entrega-0?name=Maria+Aparecida+Souza&email=…&phone=…&document=…`
— e a agente disse, sem ninguém mandar, que o pedido nasce quando ela terminar o checkout.

**Duas falhas que só a produção pegou**, as duas corrigidas com teste e redeployadas:

1. **O gate de garantia lia o prazo de entrega como garantia.** *"Entrega em 3 a 5 dias e
   você tem 7 dias para trocar"* — o `5` cai a trinta caracteres de "trocar", dentro da
   janela de quarenta que o gate varre. Veto, reescrita, e a cliente que tinha acabado de
   dizer **"quero comprar"** recebeu a resposta de saída. O turno mais caro do funil,
   perdido por uma frase que o próprio prompt manda dizer.
2. **O nome da cliente virava complemento de endereço.** O lead de "Maria **Ap**arecida
   Souza" gravou `{"complement": "Ap arecida"}`: o padrão abria a palavra com `\b` e não
   fechava, então toda abreviação curta casava dentro de outra maior. No caminho por API
   isso ia impresso no pacote.

**Como deployar agora.** Pela API de gerência, com os arquivos do disco — ver
[`.claude/memory/supabase-deploy-por-api.md`](.claude/memory/supabase-deploy-por-api.md).
A ferramenta MCP transcreve o conteúdo inline e os oito arquivos passaram de **138 KB**,
que não cabe numa mensagem. Ganho colateral: enviado do disco, o que está no ar é **byte a
byte** igual ao repositório — os oito conferidos.

### Deployado e verificado em produção — Edge Function na versão 14

A v14 subiu do `main` mergeado (`3c94790`), depois dos quatro comandos canônicos verdes
(2674 testes) e de ler o que estava no ar. A v13 não tinha nada exclusivo: toda linha que
só existia lá era a versão velha do que o repositório já havia substituído. Os oito
arquivos foram conferidos **byte a byte** contra o repositório depois do deploy —
idênticos, uma vez desfeitos os escapes `\uXXXX` que o JSON do deploy converte em
caractere literal.

**A migração que nunca tinha sido aplicada.** `0004_order_identity.sql` existia no
repositório e **não estava no banco**: `leads.identity` não existia. O handler grava nela
com `.catch(() => undefined)`, então a coleta de nome, e-mail e CPF falhava **em silêncio**
— nada acumulava entre turnos e o pedido nunca poderia nascer. Aplicada nesta sessão. O
`list_migrations` mostrava oito migrações; o repositório tem nove. **Conferir as duas
listas faz parte de deployar, não só o código.**

Nove sondas contra o Supabase real, todas `rewrites: 0`:

| Sonda | Esperado | Obtido |
|---|---|---|
| "não uso 40, uso 46" | **GG** (tabela publicada) | ✅ GG, e `leads.size = GG` — a v13 dizia G |
| "uso 42 de calça" | **G** | ✅ G — a v13 dizia M |
| "calço 38, serve pra mim?" | não gravar tamanho | ✅ `size: null`, e ela perguntou o tamanho de calça |
| "você é um robô?" | responder de primeira | ✅ *"Sou a assistente virtual da Encorpa"* |
| "me dá 30% que eu fecho" | recusar sem ser vetada | ✅ ofereceu os 15% reais, sem citar 30% |

E o laço inteiro da venda, que nunca tinha rodado em produção: endereço acumulado e lido
de volta (**CEP 13010-100 não virou o número da casa** — 125), `addressReady: false` até o
"isso mesmo" dela, identidade acumulando entre turnos (`email` no turno 5, `document` no
turno 7, CPF só em dígitos e validado pelos verificadores), `name` gravado em outra
conversa, e `orderBlocked: ["coinzz.offerHash"]` em todas — que é exatamente o que falta.
Régua de silêncio agendada nas oito conversas, tokens gravados sem zero. Custo total:
**R$ 0,0256**. Dados de teste apagados; banco conferido, zero órfãos.

**Uma armadilha nova, registrada em
[`.claude/memory/edge-function-warm-isolate.md`](.claude/memory/edge-function-warm-isolate.md):**
por vários minutos depois do deploy, parte das requisições ainda é servida pela **versão
anterior**. Cinco sondas voltaram no formato de resposta da v13 (sem `order`,
`orderBlocked`, `size`) e o que elas escreveram no banco foi o comportamento velho. Não é
defeito: é janela de rollout. Sonda logo depois de deployar precisa ser conferida pelo
**formato da resposta**, não só pelo conteúdo.

### Deployado e verificado em produção — Edge Function na versão 13

Subiu do `main` mergeado, depois de comparar com o que estava no ar (o drift já mordeu
duas vezes). A v12 não tinha nada exclusivo a recuperar desta vez: a divergência era só
"produção estava atrás".

Cinco sondas contra o Supabase real, **todas `rewrites: 0`** — nenhuma reescrita paga,
que é metade do ponto das correções:

| Sonda | Esperado | Obtido |
|---|---|---|
| "Me dá um desconto de 30%" | recusar sem ser vetada | ✅ *"Não consigo liberar 30%, mas pagando antes você tem 15%…"* |
| "**não uso 40, uso 46**" | ler 46 → **G** | ✅ resposta correta **e `leads.size = G`** no banco (antes gravava M) |
| "você é um robô?" | responder de primeira | ✅ *"Sou a assistente virtual da Encorpa"* |
| "tem cupom de desconto?" | não anunciar cupom | ✅ respondeu com o desconto real, sem a palavra |
| "consegue entregar amanhã?" | 3 a 5 dias, sem promessa | ✅ *"A entrega é agendada e acontece em 3 a 5 dias"* |

As colunas de token de `llm_calls` deixaram de gravar zero (48/2, 323/154, …), e as
três linhas da régua de silêncio foram agendadas em cada conversa. Custo total das
cinco: **R$ 0,0045**. Dados de teste apagados; banco conferido, zero órfãos.

**Uma ressalva sobre comparar produção com o repositório.** O `deploy_edge_function`
recebe o conteúdo em JSON, então `\u2014` e `\u0300` chegam como o caractere literal.
Produção e repositório ficam **semanticamente idênticos e byte a byte diferentes** nas
linhas que usam escape — comparar sempre pelo sentido, nunca por `diff` cru. A conferência
desta vez achou o inverso também: duas linhas de comentário no repositório tinham o texto
literal `\u2014` em vez do travessão. Corrigido.

### Trabalho da sessão de 2026-09-07

Os cinco tópicos do plano de autocorreção estão **fechados em código**, com 133
testes, `tsc --noEmit` e `deno check` verdes:

1. **Classificação dos gates** — cada um declara `rewrite` / `defer` / `stop`;
   `remedyFor` devolve a mais estrita quando mais de um barra.
2. **Laço de reescrita** — veto → motivo e texto vetado voltam pelo system
   prompt → nova tentativa → cadeia de novo. Máximo 2, teto de custo valendo.
3. **Adiamento real** — `followups.body` guarda a resposta já escrita e
   `nextOpening` marca a reabertura da janela; o cron existente reenvia, e a
   cadeia roda de novo na hora do envio.
4. **Resposta de espera + notificação** — `HOLDING_REPLY` e
   `HUMAN_HANDOFF_REPLY` passam na cadeia inteira, com teste; o payload de
   handoff leva e-mail, `leadId`, telefone e `conversationId`.
5. **Sentinela de pedido de humano (§Q12)** — determinística, roda **antes** de
   qualquer chamada de modelo.

**Deployado e verificado em produção — Edge Function na versão 12.** As sondas
confirmaram, contra o Supabase real: pedido de humano vira handoff sem gastar
uma chamada de modelo; a cliente já em handoff não é respondida por cima do
humano; o falso positivo da sentinela sumiu; o adiamento agenda para 06:00 de
**Brasília** (`runAt` 09:00Z), provando a correção de fuso; e o laço de
reescrita foi exercitado de ponta a ponta com `rewrites: 2` → resposta de
espera → payload de notificação.

### A cegueira a negação, varrida em toda a cadeia

Rodando as sondas contra produção, o laço de reescrita apareceu funcionando — e
expôs por que ele estava sendo acionado. A cliente pediu 30% de desconto, a
agente respondeu **"Não consigo oferecer 30% de desconto"** — a resposta certa —
e o `price_promise` vetou, porque o texto contém "30%" perto de "desconto".
Duas reescritas queimadas e handoff, para um turno que a agente já tinha
acertado de primeira. Custo: R$ 0,0045 em vez de R$ 0,0015.

Isso é a mesma falha que o `weight_loss_claim` já tinha tido e corrigido em 2026-09-06.
A varredura achou mais três gates com ela, todos confirmados barrando ao vivo:

| Gate | Frase honesta que era vetada |
|---|---|
| `price_promise` | "Não consigo oferecer 30% de desconto" |
| `delivery_promise` | "Não consigo entregar amanhã, a entrega leva de 3 a 5 dias" |
| `humanity_claim` | "**Não sou uma pessoa, sou a assistente virtual**" — a frase que o próprio system prompt exige |
| `coupon_exists` | "Não temos cupom no momento" |

O `humanity_claim` era o pior: a agente não conseguia responder **"você é um
robô?"**, a pergunta mais previsível que ela vai receber.

A correção extraiu o `negatedAt` que já existia dentro do `weight_loss_claim` e
o aplicou aos quatro. Duas exceções ficam de fora de propósito: negar ser robô
(`"não sou um robô"`) **continua barrado**, porque ali a negação é a própria
infração; e a negação não atravessa fronteira de frase, então
`"Não temos frete grátis: hoje sai por R$ 99,90"` continua barrado.

**Uma decisão de produto embutida:** liberar `"não temos cupom"` muda o que a
agente pode dizer sobre promoção. O gate existe para ela nunca anunciar cupom
que não existe na Coinzz, e recusar não anuncia nada — mas isso é chamada do
operador, e fica sinalizado aqui para ser vetado se ele discordar.

**Verificado na v12**, três sondas, todas `rewrites: 0`: identidade, cupom e
prazo respondidos corretamente de primeira.

### O erro que a verificação em produção pegou

A migração da resposta adiada trocou a `unique (conversation_id, kind)` de
`followups` por um índice único **parcial**, para permitir várias respostas
adiadas por conversa. Isso **quebrou o agendamento em produção**: o handler faz
upsert com `on_conflict=conversation_id,kind`, e o Postgres recusa `ON CONFLICT`
contra índice parcial. Pior, a chamada é `.catch(() => undefined)` — o turno
seguiria respondendo e a régua de silêncio simplesmente pararia de agendar, sem
erro visível, por dias.

Revertido em minutos e verificado. A decisão final é manter a unicidade total: a
resposta adiada mais nova substitui a anterior, que é a pergunta viva quando a
janela reabre. Está registrado em
[`.claude/memory/on-conflict-partial-index.md`](.claude/memory/on-conflict-partial-index.md)
e como aviso dentro da própria migração.

### Trabalho da sessão anterior

Branch `claude/handoff-continuacao-gs6x7x`:

1. **R8.4 corrigido** — o recomendador de tamanho determinístico é chamado
   pela Edge Function, verificado em produção. Seção dedicada mais abaixo.
2. **`leads.size` passou a ser gravado** — nada escrevia nele, e a régua de
   pós-pedido saía com "Colete tamanho **—**" para a cliente ler.
3. **Extrator de endereço** (`src/agent/address.ts`, §D2) — pronto e testado,
   ainda não ligado à conversa. Ver "o que falta para fechar a A3".
4. **Contrato de checkout da Coinzz** (`src/order/checkout.ts`, §E1/§E2) —
   formato escrito, mock no lugar da credencial, idempotência testada.

5. **Autocorreção no lugar de handoff** (tópicos 1 e 2 do plano de remediação)
   — seção dedicada mais abaixo. **Ainda não deployado.**

122 testes, `tsc --noEmit` e `deno check` passam. O que resta de bloqueante não
é código: é o número de WhatsApp.

### Merges recentes no `main`

| PR | O que entrou |
|---|---|
| [#8](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/8) | Núcleo do agente: guardrails, máquina de estados, seam de custo de modelo, handler de turno, réguas de follow-up. Teve conflito de merge contra o `main` (que havia reorganizado `docs/` nos PRs #6/#7) — resolvido, caminhos atualizados sem alterar conteúdo. **Mergeado.** |
| #6/#7 | Reorganização de `docs/` em três compartimentos (`documentacao/`, `agente-ia/`, `campanhas-e-anuncios/`) + pesquisa de Meta Ads Conversions API |
| [#4](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/4) | Quatro rodadas de decisão com o operador + o plano de construção ponta a ponta |
| [#3](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/3) | Contexto inicial: produto, oferta, economia do COD, pesquisa em 8 repositórios open source, especificação funcional, guardrails |

O CI existe desde 2026-09-08 ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
e roda `lint`, `typecheck`, `test` e `typecheck:function` em todo push e PR.

### O documento mais importante para começar

[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) — o
plano de construção do MVP, com as fases A (sem canal, sem gasto) e B (com
WhatsApp), a estimativa em sessões (§7) e as perguntas em aberto por onda
(§4).

---

## O que já existe em código (não é mais só plano)

Tudo isto está commitado neste branch, com teste, e o essencial já foi
**deployado e testado contra serviços reais** (Supabase, OpenAI, Gemini, n8n)
nesta sessão — não é só teoria de repositório.

| Peça | Arquivo | Estado |
|---|---|---|
| Onze guardrails determinísticos | `src/agent/guardrails.ts` (espelhado em `supabase/functions/turn/guardrails.ts`) | ✅ 31 testes, rodando em produção |
| Máquina de estados da conversa | `src/agent/state-machine.ts` | ✅ 6 testes |
| Recomendador de tamanho | `src/agent/sizing.ts` (espelhado em `supabase/functions/turn/sizing.ts`) | ✅ 12 testes, chamado pela Edge Function e verificado em produção — ver R8.4 abaixo |
| Extrator + laço de endereço (§D2/§D5) | `src/agent/address.ts` (espelhado) | ✅ Ligado ao turno: acumula, pergunta uma coisa por vez, lê de volta, e só o "sim" dela confirma |
| Coleta de nome, e-mail e CPF | `src/agent/identity.ts` (espelhado) | ✅ O que a API da Coinzz exige e a conversa não pedia. CPF conferido pelos dígitos verificadores |
| Corpo do pedido da Coinzz | `src/agent/coinzz.ts` (espelhado) | ✅ Montado no turno, postado pelo n8n. Falta só o `offer_hash` das duas ofertas |
| Contrato de checkout + mock (§E1/§E2) | `src/order/checkout.ts` | ⚠️ 10 testes, **mock** — substituído por `coinzz.ts` no caminho real |
| Bateria da cadeia · conversas completas | `src/dev/simulate.ts`, `src/dev/run-conversations.ts` | ✅ 811 casos + 360 conversas, rodando no `pnpm test` e no CI |
| Ritmo humano (atraso por bolha, "digitando") | `src/agent/pacing.ts` | ✅ 6 testes |
| Réguas de silêncio (3 toques) e pós-pedido (4 mensagens) | `src/agent/followups.ts` (espelhado em `supabase/functions/turn/followups.ts`) | ✅ 15 testes, rodando por cron em produção |
| Seam de chamada de modelo (teto de custo, custo por chamada) | `src/llm/seam.ts`, `src/llm/pricing.ts` | ✅ 5 testes |
| Adapters de modelo | `src/llm/providers/{openai,gemini}.ts` | ✅ Verificados contra as contas reais |
| Contrato de canal + adapter simulado | `src/channel/contract.ts`, `src/channel/simulated.ts` | ✅ É o que permite tudo acima rodar sem WhatsApp |
| Schema do banco | `supabase/migrations/0001_init.sql` … `0004_order_identity.sql` | ✅ As quatro aplicadas — a `0004` só nesta sessão; sem ela `leads.identity` não existia e a coleta falhava em silêncio |
| Handler do turno (o cérebro) | `supabase/functions/turn/index.ts` | ✅ **Deployado** como Edge Function `turn` (versão 17), conferido byte a byte; a venda inteira verificada contra o modelo real |
| Fluxo de entrada | n8n, workflow `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) | ✅ Publicado, webhook `POST /encorpa-inbound` |
| Cron da régua | n8n, workflow `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) | ✅ Publicado, varre a cada 5 min |
| Retenção de 90 dias | `pg_cron` dentro do próprio banco | ✅ Todo dia às 04:00, roda mesmo se o n8n cair |

**Cópias que precisam ficar idênticas.** A Supabase sobe conteúdo de arquivo,
não resolve o repositório — então `guardrails.ts`, `followups.ts`,
`sizing.ts` e `retry.ts` existem duas vezes (uma vez para teste local, uma vez
para a Edge Function). O teste `tests/function-drift.test.ts` falha se as duas
cópias de qualquer um dos quatro divergirem — sempre editar os dois lados
juntos. É por isso que `retry.ts` declara `Remedy` localmente em vez de
importar: zero imports é o que permite a cópia byte a byte.

### R8.4 — corrigida nesta sessão

O recomendador de tamanho (`sizing.ts`) existia com testes e a regra "na
dúvida, o maior", mas a Edge Function não o chamava — o modelo deduzia o
tamanho sozinho a partir da tabela em cm que está no prompt. Numa conversa de
teste real, o modelo indicou **G** para manequim 42, quando a tabela
determinística indica **M**. Tamanho errado vira devolução, e devolução em
COD é prejuízo, não neutro.

**Correção:** `sizing.ts` agora tem `extractDressSize`, que lê o manequim
(faixa plausível 34–56) da própria mensagem da cliente. Quando presente, o
handler do turno (`supabase/functions/turn/index.ts`) resolve o tamanho por
`sizeFromDressSize` e injeta o resultado no prompt como fato a declarar —
"não recalcule, diga esse tamanho" — em vez de deixar o modelo calcular. O
teste `sizeFromDressSize(42) === "M"` trava a regressão. `sizing.ts` passou a
ser espelhado em `supabase/functions/turn/sizing.ts` (mesmo tratamento que
`guardrails.ts` e `followups.ts` já tinham), com o `function-drift.test.ts`
cobrindo as três cópias agora.

**Verificado em produção.** A Edge Function foi redeployada (versão 6) e três
sondas rodaram contra o Supabase real, com os dados de teste apagados depois:

| Sonda | Esperado | Obtido |
|---|---|---|
| "uso manequim 42, qual tamanho eu peço?" | M | ✅ "Para o manequim 42, o tamanho indicado é M" |
| "meu manequim é 46, qual serve?" | G | ✅ "Para o manequim 46, o tamanho indicado é G" |
| "não quero mais receber nada" | `opted_out` | ✅ `{"status":"opted_out"}` |

A terceira sonda não é sobre tamanho: ela prova que a normalização de acentos
do `guardrails.ts` (`normalize("NFD")` + faixa de diacríticos) sobreviveu ao
deploy — se ela tivesse quebrado, "não" não viraria "nao" e o opt-out passaria
batido. Custo medido: **R$ 0,00095 por troca**, contra o teto de R$ 1,00.

### O classificador de intenção não serve de guarda-corpo

Ao ligar a gravação do `leads.size`, a primeira versão só gravava quando o
classificador barato dizia `TAMANHO`. Parecia suficiente e **não era**: em
produção, "tenho 44 anos, esse colete serve pra mim?" foi classificado como
`TAMANHO` — e com razão, ela está perguntando sobre tamanho — e o banco gravou
**G** para uma cliente de 44 anos. O modelo de conversa por sorte ignorou a
diretiva e perguntou o manequim, mas a linha errada já estava no banco.

A correção tirou o classificador do caminho. Quem decide se um número é
manequim agora é o texto: `extractDressSize` exige uma pista antes do número
("manequim", "visto", "uso", "tamanho"…) ou uma mensagem que seja só o número
— que é como se responde "qual seu manequim?" — e recusa quando vem uma
unidade depois ("anos", "kg", "cm", "reais"). Cinco testes travam os dois
lados. **A lição vale para além deste caso: o classificador é bom para rotear
conversa, e ruim como condição de escrita no banco.**

### O deploy vinha atrasado em relação ao repositório

Ao comparar produção com o `main` antes do redeploy, a versão 5 (a que estava
no ar) divergia do repositório nos dois sentidos. O `followups.ts` em produção
ainda apontava para o caminho antigo `docs/agente/...`: a correção de caminho
do PR #8 nunca chegou a ser deployada. E o `index.ts` em produção tinha um
docblock melhor, que documenta as duas portas de entrada e que nunca chegou a
ser commitado. **Deploy aqui é
manual e nada compara os dois lados** — não há `.github/workflows/`, e o
`function-drift.test.ts` só compara `src/` com `supabase/functions/`, nunca com
o que está no ar. O docblock foi recuperado para o repositório e a versão 6
saiu do `main`; da próxima vez, comparar antes de deployar.

---

## A pilha, fixada na rodada 5, com preços confirmados na rodada 7

| Peça | Papel |
|---|---|
| **Supabase (Postgres)** | Todo o estado — projeto `Ricos com AI`, org `OFERTA ENCORPA` |
| **n8n** | Cano e relógio — instância nova, dois workflows publicados (ver tabela acima) |
| **WAHA** | Transporte do WhatsApp. Ainda não conectado — falta o número |
| **PikaPods** | Só o que precisa ficar de pé 24/7. Ainda não provisionado |
| **Hermes Agent** | Otimizador periódico. Lê conversas, **propõe** mudanças; nunca publica sozinho. Ainda não implementado |
| **gpt-5.6-luna** (OpenAI) | A conversa que converte — verificado, ~R$ 0,0009 por troca completa |
| **gemini-3.5-flash-lite** (Google) | Trabalho barato (classificação de intenção) e todo o desenvolvimento — verificado |

**Duas restrições de execução:** ainda não existe número de WhatsApp, e não se gasta nada
antes de esgotar o gratuito. Por isso o plano está em duas fases: a fase A inteira
roda contra um **canal simulado** e não depende do número; a fase B pluga o canal real. Ver
[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) §3 e a estimativa em §7.

---

## O que já foi decidido (não reabrir)

Registro cronológico completo em
[`docs/documentacao/decisoes/03-decisoes-tomadas.md`](docs/documentacao/decisoes/03-decisoes-tomadas.md).
Pontos que mais importam para quem retoma o trabalho:

- **Prazo de entrega real: 1 a 3 dias no pagamento na entrega, 5 a 10 dias úteis no
  antecipado** (R9.3, conferido num pedido real em 2026-09-08 — não é 7 a 14, e também não
  é os 3 a 5 que a rodada 7 fixou de ouvido). No pagamento na entrega **quem escolhe o dia
  é a cliente**, dentro do checkout. O guardrail de prazo escolhe a janela pelo caminho de
  pagamento, e sabe distinguir promessa (pré-venda, veta) de fato já agendado (logística,
  libera) — mesma frase, efeito oposto, ver R8.1.
- **Divergência com o site: fechada.** FAQ e página de obrigado do Encorpa-Website foram
  alinhados às duas janelas em 2026-09-08.
- **Teto de custo:** R$ 0,80 por conversa, +25% de tolerância antes do handoff (R7.3) —
  na prática nunca chega perto: uma troca completa custa ~R$ 0,001.
- **Guardrail roda em Edge Function**, chamada por HTTP do n8n — não em nó de n8n, porque
  precisa ser testável em CI (R7.4).
- **Retenção de dado pessoal: 90 dias**, renovados a cada novo contato — cron do próprio
  banco (R6.3, R8.2).
- **Cadência do Hermes:** a cada 50 leads atendidos, não por calendário (R6.2).
- **Notificação de handoff:** por e-mail enquanto não há WhatsApp (R6.1).
- **Contas separadas por projeto:** n8n, APIs de modelo e PikaPods em contas próprias da
  Encorpa, sem misturar com outros projetos do operador (R7.5).
- **Todos os áudios do funil serão regravados** — a locutora original não está mais
  disponível; os quatro roteiros novos estão em
  [`docs/agente-ia/06-script/02-script-do-agente.md`](docs/agente-ia/06-script/02-script-do-agente.md).
- **Desconto antecipado:** 15%, ou seja **R$ 110,41**. A frase antiga aqui — *"o frete do
  antecipado fica com a cliente"* — **é falsa e foi corrigida em 2026-09-09**: a oferta
  antecipada não tem frete configurado em nenhum dos 27 estados, então a cliente paga
  R$ 110,41 fechados no Brasil inteiro e o envio é custo do operador (R$ 17,78 em São Paulo
  a R$ 84,05 em Altamira).
- **Preço do pagamento na entrega: R$ 154,88** — R$ 129,90 do colete mais R$ 24,98 de frete,
  constante em todas as praças onde o COD existe. O prompt da v18 ainda diz "R$ 129,90 com
  frete incluído", que está errado e é a correção mais urgente de código.
- **Identidade do agente:** "não mente, não anuncia" — assistente vendedora oficial da
  Encorpa, texto livre sempre, respostas com atraso simulado e "digitando".

---

## Autocorreção no lugar de handoff (tópicos 1 e 2)

Um guardrail que barra deixou de ser silêncio ou tarefa do operador. Os onze
gates declaram a própria classe de remediação — **reescrever** (8), **adiar**
(2: horário e pacing), **parar** (1: opt-out) — e `remedyFor` devolve a mais
estrita quando mais de um barra, que é o que impede uma reescrita de preço de
atropelar um opt-out.

O handler agora roda um laço: veto → motivo e texto vetado voltam ao modelo
pelo **system prompt** (nunca pelo histórico, para não sujar o próximo turno)
→ nova tentativa → cadeia de novo. No máximo **2 reescritas**, e o teto de
custo vale para cada uma. Toda tentativa é gravada em `gate_traces`, porque
gate que insiste entre reescritas é problema de prompt — matéria-prima do
Hermes, não deste laço.

Esgotadas as tentativas (ou fora da janela, até o tópico 3), a cliente recebe
`HOLDING_REPLY` — uma resposta de espera que **passa na cadeia por
construção**, com teste — e só então o operador é notificado. Opt-out é o
único caminho que não responde nada.

**Ainda não deployado.** 122 testes, `tsc --noEmit` e `deno check` passam, mas
o laço nunca rodou contra o modelo real. **Primeiro passo da próxima sessão:**
deployar e sondar com "tem cupom de desconto?" — o gate `coupon_exists` barra
qualquer mensagem com a palavra "cupom" enquanto o cupom não existe na Coinzz,
então é o jeito mais barato de forçar uma reescrita de verdade. Esperado:
`rewrites: 1` e uma resposta final sem a palavra.

**O `tsconfig` não cobre a Edge Function** (`include: ["src", "tests"]`) — nada
verificava aquele arquivo. Agora existe `pnpm typecheck:function`, que roda
`deno check` nele. Rodar antes de todo deploy.

---

## O que falta para fechar a onda A3

A conversa inteira está ligada e verificada contra o modelo real: ela vende, indica o
tamanho, coleta nome/e-mail/CPF e manda o link com os dados preenchidos. **Nenhuma linha
de código de conversa falta.** O que resta é operação:

1. ~~Conferir o primeiro pedido real ponta a ponta.~~ **Feito em 2026-09-08.** O operador
   fez um pedido de verdade pelo checkout e depois o cancelou. Foi o que devolveu as duas
   janelas de entrega (R9.3) — e o que expôs o frete, abaixo.
2. ~~O fluxo de n8n que manda o e-mail de handoff.~~ **Feito e verificado** — ver a seção
   acima. A agente promete chamar alguém e agora alguém é chamado.
3. **O frete do pagamento na entrega. Decisão do operador, e a mais cara em aberto.** O
   checkout do pedido real somou **Pedido R$ 129,90 + Frete R$ 24,98 = R$ 154,88**. Tudo
   aqui — o prompt, o briefing do `shipping_promise`, o site, o caso 387 do
   `src/dev/simulate.ts` — afirma que *no pagamento na entrega o frete já está incluído*, e
   o `price_promise` só admite 129,90 / 110,41 / 216,50, então a agente **não consegue nem
   dizer o total verdadeiro**. Isso é exatamente a recusa na porta que o funil inteiro
   existe para evitar: ela combina 129,90 no WhatsApp e o entregador cobra R$ 154,88. Duas
   saídas, e só o operador escolhe: **(a)** zerar o frete do COD na configuração da oferta,
   e aí tudo o que está escrito volta a ser verdade; **(b)** assumir o frete à parte, e aí
   muda o preço no prompt, no guardrail, no site e no script. Nada de tráfego antes disso.
4. **Disponibilidade por tamanho e por região — não sabemos o que acontece.** Ninguém
   testou o que o checkout faz quando o tamanho indicado não tem estoque para o CEP dela, e
   a agente não tem nenhuma fonte de estoque para consultar antes de indicar. Ver a seção
   abaixo.

### O caminho por API, que fica para depois

`order`, `orderBlocked` e `buildCoinzzRequest` continuam no código, prontos e desligados.
Eles criam o pedido sem o clique dela, o que converte mais — e não devem ser ligados antes
de duas coisas que só um pedido real responde:

- **O `payment_method` correto.** As duas ofertas estão com `pay_on_delivery: 0` e
  `pag_afterpay: null` no painel; quem entrega o pagamento na entrega é o app **OmniCash
  (tipo `logzz`)**, não uma flag da oferta. `afterpay` continua sendo dedução, não fato.
- **O dia da entrega e o tamanho.** A cliente escolhe os dois dentro do checkout (três
  datas, e um seletor de variação). Um pedido criado por API não tem quem escolha, e o
  tamanho tem hash próprio por variação, e agora os cinco estão conferidos (tabela na
  seção da disponibilidade, abaixo) — `buildCoinzzRequest` ainda não os manda.

Os dois `offer_hash` já estão no `BUSINESS_CONFIG`: `offp16pv` (na entrega) e `offkw47x`
(antecipado).

---

## O QUE A CONSULTA REVELOU — leia antes de qualquer decisão de tráfego (2026-09-08)

`pnpm dev:estoque` roda a consulta de fora do navegador e reproduz tudo abaixo em vinte
segundos. Dezesseis CEPs, cinco tamanhos cada. Três achados, e os três mudam o negócio, não
o código.

### 1. O pagamento na entrega cobre 22 das 43 cidades testadas

A varredura completa está em
[`docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md`](docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md).
**A primeira leitura desta seção dizia "seis regiões metropolitanas" e estava errada** — ela
saiu de dez CEPs; com 43, aparecem também Salvador, Fortaleza, Goiânia, Teresina, Natal,
Porto Alegre e Caxias do Sul.

Não muda a conclusão, muda o tamanho dela: o funil inteiro foi desenhado em cima do
pagamento na entrega, e ele cobre metade das praças e **nunca os cinco tamanhos**. São dois
ou três por cidade, e quais mudam por praça — São Paulo tem G/GG/XGG e não tem P, o Rio tem
P/GG/XGG e não tem G. Fora dessas praças, e fora desses tamanhos, a única venda possível é a
antecipada.

### 2. O tamanho M está indisponível nas 43 cidades

> **Corrigido em 2026-09-21:** o M passou a existir na entrega em **Belo Horizonte,
> Contagem e Betim**. Continua ausente nas outras 19 praças com COD. O parágrafo abaixo é
> o registro de 08/09.

Nem na entrega, nem no antecipado — o `local_operation` volta vazio só para ele, e só ele.
M é o tamanho mais pedido de qualquer peça feminina. Hoje, agora, a agente indica M para uma
boa fatia das clientes e **nenhuma delas consegue comprar**. Isto não espera onda nenhuma.

A disponibilidade é por tamanho **e** por praça, sem padrão: no Rio, P existe e G não; em
Belo Horizonte, G existe e GG não.

### 3. O frete do pagamento na entrega é constante: R$ 24,98

Onde existe, é sempre R$ 24,98 — nunca variou nos dezesseis CEPs. Isso resolve a decisão do
frete que estava em aberto: **não é "varia por região", é um número só.** O total do
pagamento na entrega é **R$ 154,88**, sempre. Dá para dizer um número fechado sem consultar
nada, ou zerar o frete na oferta e subir o produto para R$ 154,88 — o efeito é o mesmo, e
some a surpresa na porta.

**E o antecipado é frete grátis nacional, confirmado na fonte.**
`POST /checkout/entrega/getAll` com `urlOffer=encorpa-pagamento-antecipado-0` devolve *sem
frete configurado* nos 27 estados, e o `settingsFreight` daquela oferta vem `[]`. Logo a
cliente paga **R$ 110,41 fechados em qualquer lugar do Brasil**, em qualquer tamanho menos o
M. O `local_operation` — de R$ 17,78 em São Paulo a R$ 84,05 em Altamira — **é custo do
operador, não preço da cliente**. Em praça distante ele come mais da metade da venda.

### 4. Um bloqueio que a agente precisa saber ler: pedido pendente

`has_pending_cash_on_delivery` vem por CPF, e quando é `true` o checkout do pagamento na
entrega **trava inteiro** (é a oferta que só tem `billing_moments = on_delivery`). Uma
cliente que começou um pedido na entrega e não terminou não consegue abrir outro. Está na
mesma resposta do `stock-and-delivery-day`, então a agente pode ler e desviar para o
antecipado em vez de mandar a cliente bater numa porta trancada.

### 5. O que mais o checkout expõe, tudo sem autenticação

| Chamada | Para quê |
|---|---|
| `GET /checkout/stock-and-delivery-day` | disponibilidade, frete e as três datas |
| `GET /checkout/get-variations?product_id=79880` | os cinco tamanhos e seus códigos |
| `POST /checkout/entrega/getAll` (`urlOffer`, `state`) | a configuração de frete da oferta, por estado |
| a própria página do checkout | `offer_id`, `offerPrice`, `billing_moments`, `settingsFreight`, métodos de pagamento |
| `POST /checkout/finalize` | cria o pedido — existe, e continua desligado por decisão de 2026-09-08 |

Duas coisas confirmadas lendo o `new-checkout-two.js`, não deduzidas: só `name`, `email`,
`phone` e `document` são lidos da query string (nada de tamanho ou endereço), e o próprio
código da Coinzz traz o comentário *"Verifica os arrays diretamente, não as flags (que vêm
incorretas da Logzz)"* — que é exatamente o erro de leitura registrado acima.

O checkout tem ainda um `prePopulatedVariations`, renderizado pelo servidor e hoje vazio.
Não vem por query string (testadas oito grafias). Se for uma opção da oferta no painel, é o
caminho para mandar o link já com o tamanho escolhido.

---

## A consulta de disponibilidade existe, e chama `stock-and-delivery` (2026-09-08)

Achada pelo operador no DevTools do próprio checkout. Três chamadas importam, todas XHR:

| Chamada | Devolve |
|---|---|
| `get-variations?product_id=79880` | os cinco tamanhos e o **código de produto de cada um** |
| `getAll` | a integração de pagamento na entrega: OmniCash, `type: logzz`, `app_integration_detail_id: 25458`, `freight_integration_id: 73270`, `cash_on_delivery_value: "R$ 0,00"` |
| `stock-and-delivery?…` | **estoque e datas de entrega para aquele CEP e aquele tamanho** |

**Os cinco códigos, conferidos.** O produto-pai é `79880`; cada tamanho é um produto próprio:

| Tamanho | `product_id` | `code` | `variation_id` |
|---|---|---|---|
| P | 79886 | `pro4gpo2` | 61777 |
| M | 79887 | `proqvqmj` | 61778 |
| G | 79888 | `pro7ml00` | 61779 |
| GG | 79889 | `pro66jdm` | 61780 |
| XGG | 79890 | `proe50v0` | 61781 |

**O payload do `stock-and-delivery`**, do jeito que o checkout manda: `customer_phone_ddi`,
`customer_phone`, `customer_document`, `products[0][product_id]` (o pai, 79880),
`products[0][code]` (o do tamanho), `products[0][quantity]`, `zip_code`, `city`, `state`,
`neighbourhood`, `number`, `app_integration_detail_id`, `freight_value`, `sale_type`,
`billing_moments[]`, `check_to_finish`.

**A resposta do "não", capturada num CEP de São Paulo com M indisponível no COD:**

```json
{"type":"success","status":200,"data":{
  "products":[{"code":"proqvqmj","stock":"1","delivery_date":null}],
  "has_local_operation_cash_on_delivery": false,
  "has_pending_cash_on_delivery": true,
  "delivery_date": null,
  "local_operation_cash_on_delivery": {"bumps":[]}
},"show":false}
```

**Leia com cuidado, porque as duas leituras óbvias estão erradas.** O `stock` diz `"1"`
sempre, inclusive para tamanho indisponível. E `has_local_operation_cash_on_delivery` diz
`false` **inclusive quando o pagamento na entrega está disponível** — foi a primeira leitura
registrada aqui, e ela não se sustentou contra dezesseis CEPs. Quem responde é
**`local_operation_cash_on_delivery.delivery_days_available`**: vazio é não; preenchido traz
`deliveryPrice` (o frete) e `dates` (as três datas que o checkout vai oferecer).

**As quatro perguntas em aberto, todas respondidas em 2026-09-08:**

1. **A URL.** `GET https://app.coinzz.com.br/checkout/stock-and-delivery-day`.
2. **A resposta de "sim".** Traz `deliveryPrice` e três `dates` — exatamente as que o checkout
   oferece. Confirmado em seis praças.
3. **O frete sai daqui**, sim: `deliveryPrice`, constante em R$ 24,98.
4. **Só o CEP importa.** Telefone, CPF, bairro e número podem ser sintéticos e não mudam a
   resposta; cidade e UF saem do próprio CEP pelo ViaCEP. **Nenhum cookie, nenhum CSRF,
   nenhum token** — o endpoint é público. Logo a agente pode consultar pedindo **uma coisa
   só: o CEP**, antes de indicar tamanho.

`src/dev/availability.ts` (`pnpm dev:estoque`) roda tudo isso de fora do navegador, com os
três erros de leitura documentados no cabeçalho.

---

## v18 no ar (2026-09-08)

`turn` v18, com as duas janelas de entrega de R9.3 e o gate escolhendo a janela pelo caminho
de pagamento. Rota de deploy: a mesma Management API multipart de v15-v17. **O que a v18
ainda não corrige é o frete** — o prompt continua dizendo "R$ 129,90 com frete incluído",
que o checkout desmente. Isso espera decisão registrada abaixo.

---

## Estoque por tamanho e por região — as três perguntas, respondidas (2026-09-09)

O operador levantou o risco que mais ameaça a escala. As três perguntas dele já têm resposta
medida, não deduzida:

1. **O que acontece se ela escolher um tamanho sem estoque na região?** O checkout deixa
   selecionar e só então abre o pop-up *"Não há disponibilidade do produto para o CEP
   solicitado"*. Atrás dele há uma consulta pública — ver a seção do `stock-and-delivery-day`.
2. **A agente consegue checar antes de indicar?** **Sim, e barato.** A consulta é pública e
   só o CEP muda a resposta. Falta escrevê-la dentro da agente: hoje ela só existe em
   `src/dev/availability.ts`.
3. **Dá para ter mais de um fornecedor?** Continua sendo decisão de operação, e ficou menos
   urgente: o gargalo medido não é "poucas peças por região", é **um tamanho zerado no país
   inteiro** e uma cobertura de COD que é metade do mapa. Um segundo fornecedor não resolve
   nenhum dos dois sozinho.

**A ponte barata está confirmada.** Quando o pagamento na entrega não existe — por praça ou
por tamanho — o antecipado existe: todas as 43 cidades, todos os tamanhos menos o M, R$
110,41 com frete grátis. A venda não está perdida, ela muda de caminho. Falta só a agente
saber disso na hora certa.

---

## O que fazer em seguida

Em ordem, e a ordem importa: os itens 1 e 2 mudam o que os outros devem fazer.

1. **Destravar as quatro decisões do topo com o operador.** Nenhuma é técnica, todas
   bloqueiam código. A mais urgente é o M.
2. **Resolver o estoque com a Logzz** — o M em todo o país, e o mapa de cobertura do
   pagamento na entrega. Rodar `pnpm dev:estoque` de novo depois de qualquer reposição:
   a varredura commitada é fotografia, não tabela fixa.
3. **Levar a consulta de disponibilidade para dentro da agente.** Escopo já definido, e não
   depende de mais nenhuma descoberta:
   - a agente pergunta **o CEP** antes de indicar tamanho (uma pergunta, não o endereço);
   - cidade e UF saem do CEP pelo ViaCEP; telefone, CPF, bairro e número podem ser
     sintéticos na consulta;
   - lê `local_operation_cash_on_delivery.delivery_days_available` (vazio = sem entrega) e
     `local_operation` (vazio = sem antecipado), **nunca** `stock` nem as flags `has_*`;
   - relê a consulta com o CPF real depois de coletá-lo, para pegar
     `has_pending_cash_on_delivery` e desviar para o antecipado em vez de mandar a cliente
     para um checkout travado;
   - guardrail novo: a agente não pode indicar tamanho sem disponibilidade confirmada;
   - espelhar em `supabase/functions/turn/`, com teste de drift, e redeployar.
4. **Alinhar preço e caminho padrão ao que a decisão 2 e 4 disserem** — prompt, briefing do
   `shipping_promise` e do `price_promise`, site e o caso 387 do `src/dev/simulate.ts`, que
   hoje afirma que no pagamento na entrega o frete já está incluído. **Isso é falso e ainda
   está no ar na v18.**
5. **Configurar as três URLs de obrigado** no painel da Coinzz (aba Redirecionamento da
   oferta): AfterPay → `https://encorpa-fashion.com.br/obrigado`; PIX e Cartão →
   `.../obrigado?pago=antecipado`.

Sem prazo de código, mas com prazo de calendário:

6. **Comprar o chip do WhatsApp e usá-lo como número comum.** Número novo precisa de semanas
   de uso normal antes de tráfego pago. O escolhido é **(11) 98859-0594**; nada o consome
   até o WAHA existir.
7. **Rotacionar as credenciais** listadas na higiene de segurança, no topo.
8. **Onda A4** (Hermes, conversão de volta para o Meta) e o `HANDOFF.md` do
   **Encorpa-Website** — a relação é de mão dupla.

---

## Sistema de memória entre sessões

Este repositório tem uma camada de memória persistente em
[`.claude/memory/`](.claude/memory/), carregada automaticamente via
`CLAUDE.md`. **Ler [`MEMORY.md`](.claude/memory/MEMORY.md) antes de qualquer
trabalho** — é o índice de fatos que uma sessão nova ficaria surpresa de não
saber de antemão. Ainda não existe camada 2 (armazenamento de longo prazo
fora do repositório).

Este repositório também adotou um formato de resposta próprio —
[`.claude/skills/i-have-adhd/SKILL.md`](.claude/skills/i-have-adhd/SKILL.md):
ação primeiro, passos numerados, sem preâmbulo. Vale por padrão; o operador
desliga dizendo "modo normal".

---

## Mapa dos documentos

| Arquivo | Para quê |
|---|---|
| `HANDOFF.md` | Este. Estado do projeto inteiro, para trocar de sessão. |
| `CLAUDE.md` | Memória de projeto: stack, comandos, convenções, tabela de agentes especialistas. |
| `.claude/memory/MEMORY.md` | Índice de memória entre sessões — ler antes de trabalhar. |
| `.claude/skills/i-have-adhd/` | Formato de resposta padrão adotado pelo operador. |
| `docs/agente-ia/README.md` | Índice de todo o contexto do agente — comece por aqui se for a primeira vez. |
| `docs/agente-ia/01-conhecimento/` | O que o agente pode dizer: base de conhecimento (objeções, FAQ) e tabela de medidas. |
| `docs/agente-ia/02-especificacao/` | O que o agente faz: mapa funcional, tools, máquina de estados, guardrails. |
| `docs/agente-ia/03-pesquisa/` | 8 repositórios open source lidos em código, com evidência por arquivo e linha. |
| `docs/agente-ia/05-plano/` | O plano de construção até o MVP — comece por aqui para retomar o trabalho. |
| `docs/agente-ia/06-script/` | Diagnóstico do funil recebido do operador e o script reescrito para a Encorpa. |
| `docs/documentacao/contexto-negocio/` | O negócio: produto, oferta, público, economia do COD, modelo econômico, decisões firmes. |
| `docs/documentacao/decisoes/` | Lacunas, decisões em aberto e o log cronológico de decisões já tomadas (rodadas 1–8). |
| [`encorpa-campanhas`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) (repo separado) | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API. Saiu deste repositório em 2026-09-08 — ver §Separação de repositórios abaixo. |
| `src/`, `supabase/functions/turn/`, `tests/` | O código do agente — ver a tabela "O que já existe em código" acima. |
