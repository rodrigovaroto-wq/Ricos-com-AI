# Pipeline até produção real — versão 80/20 (2026-09-29, revisão 2)

**Este é o plano vigente.** Supera a revisão 1 deste arquivo, a fila do topo do `HANDOFF.md` e a
lista "Pipeline até anúncios e leads reais" dele. `00-plano-simples.md`,
`02-plano-de-execucao-ate-os-testes-reais.md` e o `README.md` desta pasta ficam como histórico.
Achados que motivam cada item: [`../10-auditoria/2026-09-29-auditoria.md`](../10-auditoria/2026-09-29-auditoria.md)
(os da revisão 2 são A6–A11).

Dono: **C** = Claude · **O** = operador · **S** = sócio (Meta: Ads, BM, número, templates).

**Onde estamos:** o quadro de execução (feito, falta, próximo passo) fica no topo do
[`HANDOFF.md`](../../../HANDOFF.md) e é atualizado a cada sessão. Este arquivo é o plano; o quadro é o
andamento.

## Estado em 2026-10-08

> Escrito em 2026-10-08. "No ar" conferido pela API de gerência da Supabase em 2026-10-08 (função `turn`
> v88 = `agent_version` 14, `whatsapp` com o hash da publicação de 07/10, migrações 0001–0024, os 19
> segredos); a próxima sessão confere de novo antes de agir sobre o número.
> O que foi **conferido no repositório nesta data**: `pnpm test` com 7017 testes em 69 arquivos, todos
> passando; 28 gates em `src/agent/guardrails.ts`; migrações 0001–0024 em `supabase/migrations/`.

| Etapa | Estado | Evidência / observação |
|---|---|---|
| L0 (preparar) | ✅ salvo o template `order_eve` | `order_eve` **submetido à Meta, aguardando aprovação** (operador, 2026-10-08) |
| L1 (publicar) | ✅ | canal ligado e testado de ponta a ponta (2026-10-06); `turn` `agent_version` 14 = função v88, commit `bed2ee3` (código de `4dcf779`), segundo o `HANDOFF.md`; `whatsapp` com transcrição de voz; migração 0024 aplicada |
| L2 (provar com dinheiro) | 🔄 **próxima etapa** | testes do operador e do sócio: checkout antecipado, checkout na entrega; depois os guias de troca e de devolução |
| L3 (tráfego) | ⬜ | verbas e caixa reduzidos em 2026-10-08, ver L3 |
| L4 (Hermes) | 🔄 | H1 feito, H2 e H3 em parte, H4 e H5 pendentes, ver L4 |

Conversa da agente que o operador testou duas vezes pelo WhatsApp (06/10 e 07/10) e auditou; a segunda
virou o grafo §66 (28 gates desde então; e-mail fora do fluxo; "Ainda está aí?" aos 20 min e `silence_1`
a 1 h, cada um no máximo uma vez por dia; áudio transcrito). Os leads de teste 5983 e 7967 foram apagados
para novos testes; as conversas dos amigos do operador (finais 9393 e 7745) aguardam auditoria.

## A regra desta versão

**Entra no V1 só o que impede a operação de rodar com lead real, ou o que faz a agente mentir,
perder dinheiro ou deixar cliente sem resposta.** O resto (a margem de 80% → 100%) fica para o
Hermes, que lê as conversas reais em lote e propõe a mudança, com a aprovação do operador por
clique (R14.14). Para isso, o Hermes precisa **rodar de verdade** — hoje ele não roda (A6), e
consertar isso é parte do V1.

O que o V1 **não** precisa provar antes do primeiro lead: taxa de conversão, tom ideal, velocidade
até o link, régua completa, cupom, Conversions API. Isso se mede com lead real, e é o que o Hermes
e o painel diário existem para ler.

## Caminho crítico — o que trava o primeiro lead real

| # | Bloqueio | Por que trava | Dono | Esforço |
|---|---|---|---|---|
| 1 | **Canal WhatsApp Cloud API desligado** | Sem ele não entra mensagem nenhuma | S → O → C | S: 1–2 dias de painel Meta; O: 30 min; C: 1 h |
| 2 | **Ninguém consegue responder a cliente depois do handoff** (A7) | Pedido de pessoa, troca, cancelamento e "cadê meu pedido" vão para uma pessoa — e não existe por onde essa pessoa escrever para a cliente. O número da Cloud API não abre no app do celular | O decide → C | ver L0.3 |
| 3 | **Produção 6 PRs atrás** (A1) | A v41 no ar não tem frete grátis no COD com frase canônica, nem a troca paga, nem o fim da régua depois da compra | O publica, C sonda | 1 h |
| 4 | **Modelo padrão nunca medido** (A8) | Toda medição foi no `-contributor`, ~15× mais barato. Pela estimativa, a conversa longa de cliente desconfiada bate no teto de R$ 0,50 (efetivo R$ 0,625) e vira handoff — que hoje cai no bloqueio 2 | C mede, O decide o teto | C: 1 h, ~R$ 5 de API |
| 5 | **Anúncio CTWA apontando para o número** | Sem anúncio não há lead | S | 1 h, depois do 1 |

**Estado em 2026-10-01:** 2 ✅ (formulário "Responder cliente", R17.3) · 3 ✅ (`turn` v46 = `main`
`41203ba`; n8n = `main`, L1.1) · 4 ✅ medido (p95 R$ 0,546, R17.5; o teto é do operador) ·
1 e 5 seguem com o sócio. Andamento detalhado no quadro do topo do [`HANDOFF.md`](../../../HANDOFF.md).

Tudo o mais é paralelo ou posterior.

## L0 — Preparar (em paralelo, começa hoje)

1. **S** — Parte A de [`docs/operacao/whatsapp-cloud-api.md`](../../operacao/whatsapp-cloud-api.md):
   app Business, número verificado, nome de exibição, token sem expiração.
2. **S** — submeter **só o template `order_eve` (UTILITY)** — ✅ **submetido à Meta em 2026-10-08;
   aguardando aprovação** (informado pelo operador; a aprovação ainda não foi vista). Texto de
   [`06-script/03-templates-meta.md`](../06-script/03-templates-meta.md). É o único template que
   mexe em dinheiro no V1: a véspera derruba a recusa na porta (15% × R$ 9,90 + a venda perdida).
   `silence_2` e `silence_3` ficam para depois (L4).
3. ✅ **O decide o canal de resposta humana** (bloqueio 2) — (a), R17.3, 2026-09-30. Três caminhos:
   - **(a) Formulário no n8n "Responder cliente"** — telefone + texto → workflow "WhatsApp envio" →
     grava a mensagem como saída. Só texto dentro da janela de 24 h. **C** constrói em ~4 h, com
     teste. É o menor que resolve. **Recomendado para o V1.**
   - (b) Coexistência do app WhatsApp Business com a Cloud API no mesmo número (recurso da Meta).
     O sócio confirma no painel se o número dá para isso; se der, a pessoa responde pelo celular,
     sem código novo.
   - (c) Chatwoot (a decisão Q12 original) — caixa de entrada completa, mais um serviço para
     manter. Fica para quando o volume de handoff pedir.
4. **O** — criar o link do Mercado Pago de **R$ 27,00** (troca de tamanho) e escrever no
   `BUSINESS_CONFIG`: `exchange: { feeBrl: 27, checkoutUrl: "<link>" }`; conferir
   `cost.conversationCapBrl` (A3).
5. ✅ **C** — medir o modelo padrão (2026-09-30, R17.5: p50 R$ 0,268 · p95 R$ 0,546 · 3/12 no teto; falta **O** fixar o teto): uma rodada das 12 personas com
   `CONVERSATION_MODEL=muse-spark-1.3` (sem `-contributor`, sem `CONVERSATION_MODEL_PRICE`),
   `pnpm dev:personas`, e a tabela com `pnpm dev:eval <rodada>`. Saída: custo p50/p95 por conversa e quantas bateriam no teto.
   **O** fixa o teto pelo p95 medido, não pela premissa de R$ 0,10 por lead.
6. ✅ **O** — merge do PR #43 (`5bf5a15`, 2026-09-29; a `0020` já estava aplicada em produção).
7. ✅ **C** — logo depois do merge (mexe no mesmo `hermes.yml`; execução 8 verde, 2026-09-30): trocar a instalação do Hermes na
   Action pelo instalador oficial (A6) e rodar a Action uma vez à mão com `force` para provar que
   instala; registrar a troca de R$ 27,00 como R17.2 no grafo (pendência da revisão 1).

**Saída de L0:** número verificado, canal humano escolhido e (se for a) construído, custo do
modelo padrão medido e teto decidido, `BUSINESS_CONFIG` com `exchange`.

## L1 — Publicar (1 dia, depois de L0)

1. ✅ **C** — importar no n8n os workflows do `main` (turno, relógio, venda, envio) e rodar
   `pnpm dev:n8n` até passar (2026-09-30, pela API; o Turno respondia só depois do Wait — grafo §46).
2. ✅ **C** — `CONVERSATION_MODEL` para o modelo padrão (conversa real tem dado pessoal) — segredos
   apagados em 2026-10-01, com a delegação do operador (R17.5).
3. **O** — Parte B do runbook do canal: segredos no Supabase, publicar `turn` e `whatsapp`.
4. **S** — webhook da Meta apontando para a função `whatsapp`.
5. **C** — Parte C: credencial no n8n, `PHONE_NUMBER_ID`, `CANAL_ATIVO=true`; fechar as portas
   (`TURN_REQUIRE_SERVICE_ROLE=true`, `INBOUND_SIGNING_SECRET`).

**Saída de L1:** "oi" do celular pessoal recebe recepção e resposta; um pedido de pessoa chega por
e-mail e a pessoa responde pelo canal de L0.3.

## L2 — Provar com dinheiro de verdade (1 dia)

> **Estado em 2026-10-08: 🔄 próxima etapa.** O operador e o sócio fazem os testes: (1) checkout
> antecipado (Coinzz), (2) checkout com pagamento na entrega (Logzz). Os itens de troca e devolução
> ficam para depois: **ainda falta o guia que a Malu usa para orientar a cliente** (rascunho em
> [`06-script/06-devolucao-guiada.md`](../06-script/06-devolucao-guiada.md), não aprovado). O operador
> perguntou ao suporte da Logzz e da Coinzz se a cliente pode pedir devolução e troca direto com elas —
> **resposta pendente**; ela decide se a Malu ensina o pedido direto ou passa para uma pessoa.

Três conversas reais, feitas pelo operador ou por alguém de confiança, pelo WhatsApp:

1. **Compra na entrega (Logzz):** conversa → link → pedido → webhook → estágio → véspera → entrega.
2. **Compra antecipada (Coinzz):** conversa → link → pagamento → webhook → estágio.
3. **Troca e handoff:** com o pedido 1, pedir troca de tamanho → R$ 27,00 + link + handoff → a
   pessoa responde.

**C** confere cada passo no banco (`conversations.stage`, `followups`, `turn_outcomes`,
`llm_calls`). Nada de bateria de personas aqui: a rodada de L0.5 já cobriu mentira e custo.

**Saída de L2:** os três fluxos fecharam sem intervenção fora do previsto.

## L3 — Tráfego controlado (dias 1–18)

> **Reescrito em 2026-10-02 com as respostas do operador** (estrutura do teste, caixa, metas,
> pausa). A versão anterior (só as 22 praças, R$ 50–100/dia, pausa automática em handoff de 2 h)
> está no histórico do Git.

1. **S** — anúncio CTWA (só CTWA: é o que abre a janela gratuita de 72 h, ver item 5), em três fases:

   | Fase | Dias | Verba | Estrutura |
   |---|---|---|---|
   | Copy | 1–7 | R$ 350, R$ 50/dia (operador, 2026-10-09; ~~R$ 375 em 5 dias~~, ~~R$ 300~~, ~~R$ 400, R$ 80/dia~~) | 1 conjunto aberto no Brasil, mulheres de 18 a 55, 6 vídeos (6 ganchos/formatos, 1 por criativo, copy sem nada além do que a agente sabe) |
   | Região | 10–16 (depois de 2 dias de pausa) | R$ 350, R$ 50/dia (operador, 2026-10-09; ~~R$ 300 em 5 dias~~, ~~R$ 200~~, ~~R$ 400, R$ 40/dia por conjunto~~) | só as 2 copies vencedoras, mesmo post. **A** = todos os estados com mais de 5 cidades atendidas pelo pagamento na entrega; **B** = Sudeste + Centro-Oeste + Sul |
   | Leitura | 17–18 (assumido, 2 dias como antes) | R$ 0 | os pedidos na entrega dos últimos dias chegam à porta |

   **Verba atual (operador, 2026-10-09): Copy R$ 350 e Região R$ 350 (7 dias a R$ 50/dia cada), total R$ 700, com 2 dias de
   pausa entre elas, a partir de 23/10.** Os valores anteriores do mesmo dia (R$ 375 + R$ 300 em 5 dias = R$ 675), de 2026-10-08
   (R$ 300 + R$ 200 = R$ 500) e de 2026-10-02 (R$ 400 + R$ 400 = R$ 800) estão riscados na tabela. (Histórico anterior: em 2026-10-02 Copy R$ 300 → R$ 400; Região R$ 500 →
   R$ 400 e dias 6–12 → 6–10.) **Metas mínima e ideal de cada fase: a definir com o operador**, junto de 8 a 15
   métricas por criativo/copy e por região que mostrem pontos fortes e fracos de cada um (proposta
   em [`10-execucao-mes-1.md`](10-execucao-mes-1.md) §8). A referência anterior (Copy > 7,5% / CPL
   < R$ 1,50; Região > 10% / CPL < R$ 1,25) fica só como ponto de partida da conversa.
   Os criativos se validam por outro método (CPL/CTR); pedidos e conversão leem a operação inteira.
   A e B se sobrepõem no Sudeste, Centro-Oeste e Sul — a leitura de região é direcional.

   > **Reconciliado em 2026-10-09 (operador: R$ 675 e R$ 1.325 "substituem os de L3"; depois, "7 dias cada" e o plano de R$ 50/dia).** Fase 1 =
   > Copy e fase 2 = Região (mapeamento assumido; o operador não nomeou as fases). Os dias da Região passam de 6–10 para 10–16 (7 dias de
   > cada fase e 2 de pausa), e a Leitura e a decisão (item 7) vão para 17–18 (assumido). Piso de amostra (L3 item 4): mais de 500 leads e mais de 50 pedidos. Com R$ 700 (R$ 50/dia por 7 dias em cada fase) e CPL R$ 1,50 saem 467 leads e 47 pedidos: **abaixo do piso**. Passa só com CPL abaixo de ~R$ 1,40 (CPL R$ 1,35: 519 leads e 52 pedidos, pico R$ 836, sobra R$ 239; CPL R$ 1,25: 560 leads e 56 pedidos, pico R$ 903, sobra R$ 172); com CPL R$ 1,75 são 400 leads e 40 pedidos. Conta em
   > [`taxas-antecipadas-cod.md`](../../operacao/taxas-antecipadas-cod.md).
2. **O** — caixa: **R$ 1.325 em caixa** (operador, 2026-10-09, dos R$ 2.000 investidos; a verba de R$ 700 vai no cartão e é paga com o repasse; eram
   ~~R$ 1.500~~ em 2026-10-08 e ~~R$ 1.200~~ em 2026-10-02 — o caixa sustenta a operação no intervalo entre a venda e o dinheiro líquido recebido) para **todo custo de um pedido até a venda virar
   dinheiro** (produto, manuseio, taxa de transação, entrega concluída, recusa, devolução),
   mix 70% na entrega / 30% antecipado, 1 peça por pedido. Recusa na porta 12–17% a R$ 9,99
   (**valor especulado, ainda precisa ser medido**); devolução pós-envio 5–10% a R$ 25,00.
   WhatsApp: R$ 0 por lead (tudo dentro da janela de 24 h ou da gratuita de 72 h); só o template
   UTILITY do pós-venda fora da janela custa ~R$ 0,04 por pedido. A taxa de entrega concluída (R$ 19,99)
   só é descontada quando a entrega conclui. O antecipado cai no Mercado Pago na hora; a comissão
   do pagamento na entrega libera 14 dias depois do pagamento.

   > **Reserva reconciliada em 2026-10-09 (operador):** caixa de **R$ 1.325** com **R$ 250 de segurança** (R$ 1.075 utilizáveis). Para a verba
   > acima o **pico de caixa é R$ 752** (07/11, antes do 1º repasse em 08/11) e **sobram R$ 323**. Produto e taxas do COD saem do
   > **saldo de expedição** (resolve "do caixa ou da comissão?"); manuseio R$ 5,00; recusa R$ 9,99 = R$ 4,99 + R$ 5,00; devolução = frete de
   > retorno (R$ 30–60) + manuseio + taxas já pagas (R$ 86,56 no COD). Anúncio, API de IA, WhatsApp, PikaPods e número saem no **cartão**
   > (fatura fecha dia 22, vence dia 29). Detalhe em [`taxas-antecipadas-cod.md`](../../operacao/taxas-antecipadas-cod.md) e em
   > [`modelo-caixa-anuncios.xlsx`](../../operacao/modelo-caixa-anuncios.xlsx).
3. **O** — handoff: o operador responde o mais rápido que conseguir, das 06:00 às 00:00. Fora disso
   vale R4.4 (mensagem automática 24/7, agente a partir das 06:00). A primeira resposta real da
   agente sai **1 minuto** depois da mensagem (operador, 2026-10-02; era 3 min na doc e 120 s no
   código). Sem prazo que pause anúncio.
   As conversas são lidas pelo Hermes a cada 50 leads; o operador revisa quando ele volta.
4. **O** — piso de amostra (assinado em 2026-10-02): nenhum teste é dado como validado antes de
   **mais de 500 leads atendidos e mais de 50 pedidos criados**.
5. **Régua de silêncio dentro da janela gratuita.** Lead de CTWA respondido em até 24 h abre uma
   *free entry point window* de **72 h, contada da primeira resposta** — que é a mensagem
   automática da camada 1 (R4.4), enviada na hora. Dentro dela qualquer mensagem é gratuita,
   template de marketing inclusive; fora dela, template de marketing é cobrado (verificado em
   2026-10-02 em [Pricing](https://developers.facebook.com/docs/whatsapp/pricing); só vale para
   quem escreveu pelo app Android/iOS, não pelo WhatsApp Web/desktop). Decisão do operador
   (2026-10-02): o `silence_3` sai **entre 63 h e 71 h depois da abertura da janela**, no último
   horário que caia em 06:00–00:00 — a faixa de 8 h sempre contém um horário de atendimento. Nada
   de marketing depois das 72 h. **No código ainda é "3 dias depois do silêncio"**
   (`followups.ts`), que pode cair fora da janela: muda antes do primeiro anúncio.
   Decisões do operador no mesmo dia:
   - a contagem começa na **primeira mensagem dela em cada entrada por anúncio** (um anúncio novo
     abre janela nova e recomeça a contagem);
   - se ela conversou além das 63 h e então sumiu, **não há `silence_3`**: a régua fecha no
     `silence_2`, e é ele que marca a conversa `perdido`;
   - **opt-in, caminhos 1 + 3** ([`07-opt-in-marketing.md`](07-opt-in-marketing.md)): o
     `silence_2` sai sempre **dentro de 24 h da última mensagem dela** (texto livre, sem template e
     sem opt-in — às 09:00 do dia seguinte, ou antes, no último horário de atendimento que caiba
     nas 24 h); o `silence_3` (template MARKETING) só para quem tocou "Quero ofertas". O botão já
     existe: mensagem própria logo depois do `silence_1`, ligada por
     `channel.askMarketingOptIn: true` no `BUSINESS_CONFIG`. Opt-in no texto do anúncio (caminho
     2) só se o sócio confirmar com a Meta.
6. **Critérios de pausa — manuais** (o operador decide; nada pausa sozinho; cada um tem seção
   própria no portal, ver [`10-execucao-mes-1.md`](10-execucao-mes-1.md) §8):
   - mais de 5% das conversas com alguma premissa indevida (o Hermes marca nas 50 de cada lote; o
     operador confere por amostra);
   - opt-out acima de 2,5%;
   - custo de API (modelo + WhatsApp) acima de R$ 1,00 por lead em mais de 5% dos últimos 100
     leads atendidos (era R$ 0,75; subiu junto com o teto do modelo, R18.7, operador 2026-10-05 — só a
     conversa que bate o teto, mais o WhatsApp, chega lá);
   - handoff em mais de **10%** das conversas (acima de 5% a agente já falha em algum grau, mas no
     começo o handoff é esperado e é o dado que explica o porquê; operador, 2026-10-02);
   - caixa reservado para custo antecipado (item 2) acabando;
   - número restrito pela Meta ou Cloud API fora → **para toda a operação** até resolver.
7. **Decidir no dia 18** (a pior das três métricas decide, sobre o piso do item 4):

   | Decisão | Conversão da agente | CPL | ROI |
   |---|---|---|---|
   | Escalar | > 10% | < R$ 1,25 | > 2,5 |
   | Ajustar | 6%–10% | R$ 1,25–1,75 | 1,5–2,5 |
   | Parar | < 6% | > R$ 1,75 | < 1,5 |

   ROI = lucro bruto antes de anúncio e API ÷ (anúncio + API: WhatsApp e modelo).

8. **Hermes durante o teste** (operador, 2026-10-02) — cada proposta entra assim que aprovada, não
   na virada de fase: o Hermes do lote seguinte lê a agente já com a mudança dele e mede o efeito
   da própria proposta. Não estraga o teste: os criativos se julgam por CPL/CTR (anúncio, não
   agente) e A/B de região rodam ao mesmo tempo, sob a mesma versão.
   - roda a cada 50 leads (R6.2); o operador aprova numa **Rotina do Claude Code**, não mais pelo
     link do e-mail (R14.14); o e-mail só avisa que há proposta esperando;
   - **cada publicação grava um número de versão em toda conversa** — sem ele, nem o Hermes nem o
     painel separam antes de depois. **Não existe hoje** (nem coluna, nem campo): entra antes do
     primeiro anúncio;
   - a proposta é julgada pela **frequência e pelo impacto do erro na continuidade da conversa e
     no fechamento da venda** — veto, handoff, resposta pronta, premissa indevida, custo, e onde
     a conversa parou — nunca por taxa de venda de um lote só (50 leads a 10% é ±8 pp);
   - piorou handoff ou premissa indevida no lote seguinte → a mudança **sai de produção, é
     analisada, corrigida, testada internamente e validada**, e só então volta. Nenhuma proposta
     nova entra antes disso.

**Saída de L3:** dia 18 com a decisão da tabela acima. O Hermes roda a cada 50 leads durante o
teste (R6.2).

## L4 — Hermes assume a melhoria contínua (a partir dos 50 leads)

Para o Hermes fazer os 20% restantes, cinco coisas têm de ser verdade. Hoje nenhuma é:

| # | Condição | Situação hoje | Dono |
|---|---|---|---|
| H1 | A Action instala e roda o Hermes | ~~5 de 5 execuções falharam~~ ✅ **feito** em 2026-09-30 (L0.7, execução 8 verde); Hermes instalado e calibrado desde 2026-09-25 (`hermes/README.md`) | C (L0.7) |
| H2 | Os segredos da Action existem: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_API_KEY`; e `SUPABASE_ACCESS_TOKEN` para publicar a aprovada | `SUPABASE_ACCESS_TOKEN` precisa ser **segredo do GitHub Actions** (repositório → Settings → Secrets and variables → Actions) para o `deploy-hermes.yml`; separadamente, pode ser **variável de ambiente do Claude** para que as sessões publiquem. São dois lugares distintos: um não vale pelo outro. Estado de cada segredo: **não verificado nesta sessão** | O |
| H3 | A rotina que implementa a proposta aprovada (`hermes/IMPLEMENTAR.md`) está agendada | a rotina **"Hermes – decisão"** (`hermes/DECIDIR.md`) existe desde 2026-10-05 (`trig_01SR8fhPWmJktwR8oVTfd3gV`, sem cron, disparada pelo operador); ela implementa a aprovada na mesma sessão. ~~não encontrada (A9)~~ | C criou, O dispara |
| H4 | O Hermes vê se a conversa **virou pedido** | ⬜ **pendente** (A10): o pacote leva vetos e desfechos do turno, não `eval_funnel` nem pedido/entrega/recusa. Ele acha mentira e tom, mas não o que converte | C, ~2 h |
| H5 | O piso de amostra está assinado | ⬜ **pendente** (o efeito medido fica "leitura"); o piso foi assinado em 2026-10-02 (L3.3), mas só vale com leads reais | O (L3 item 4) |

Desde 2026-10-08 o Hermes também lê um **histórico inicial** (`hermes/historico-inicial.md`) e 11
decisões do §66 semeadas em `hermes_proposals` (ver [`hermes/README.md`](../../../hermes/README.md)).

Com H1–H5, o ciclo é: 50 leads → Hermes lê as conversas marcadas (handoff, veto, custo, resposta
pronta) mais um controle → propõe → e-mail com link → operador aprova → rotina implementa, prova,
publica → a passada seguinte mede o efeito.

**O que fica para o Hermes propor (não fazer antes):** velocidade até o link (hoje sai em 3 de 12
conversas, na mediana depois de 7 respostas), tom com cliente desconfiada, objeções novas, falsos
vetos de gate, texto da régua.

**O que fica para o operador decidir com dado (o Hermes não mexe em config, n8n nem template):**
`silence_2`/`silence_3` e o opt-in de marketing; o cupom de 20%; o teto de custo; Conversions API
(otimizar anúncio por compra, depois dos primeiros pedidos); véspera do antecipado (polling da
Coinzz).

## Cortado do V1 (e por quê)

| Item da revisão 1 | Por que sai do caminho crítico |
|---|---|
| Bateria das 12 personas pela porta do n8n contra a produção (F3) | A rodada de L0.5 cobre mentira e custo; o resto só se aprende com cliente real |
| Aquecer o número como "item mais longo" | Era risco do WAHA. Na Cloud API, a conversa que a cliente abre pelo anúncio não conta no limite de mensagens; o limite vale para mensagem que a empresa inicia (template). O sócio confere o limite no WhatsApp Manager |
| Templates `silence_2`, `silence_3` e opt-in de marketing | Recuperam venda perdida, não abrem a operação; `silence_3` depende do cupom, que não existe |
| Templates para `order_shipped` e `order_delivered` | Fora da janela, o toque é cancelado com e-mail — perda pequena, sem mentira |
| Higiene C5–C10 da auditoria (provedores de dev, `@types/node`, instantâneos, numeração, `HANDOFF.md` longo) | Não muda nada para a cliente |
| Calibração do Hermes com ≥ 100 defeitos | Precisa de dado; 3/3 plantados basta para começar |
| Juiz tipado / JEV | Já adiado pela análise do PR #43 |
