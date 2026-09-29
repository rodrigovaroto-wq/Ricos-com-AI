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

Tudo o mais é paralelo ou posterior.

## L0 — Preparar (em paralelo, começa hoje)

1. **S** — Parte A de [`docs/operacao/whatsapp-cloud-api.md`](../../operacao/whatsapp-cloud-api.md):
   app Business, número verificado, nome de exibição, token sem expiração.
2. **S** — submeter **só o template `order_eve` (UTILITY)** de
   [`06-script/03-templates-meta.md`](../06-script/03-templates-meta.md). É o único template que
   mexe em dinheiro no V1: a véspera derruba a recusa na porta (15% × R$ 9,90 + a venda perdida).
   `silence_2` e `silence_3` ficam para depois (L4).
3. **O decide o canal de resposta humana** (bloqueio 2). Três caminhos:
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
5. **C** — medir o modelo padrão: uma rodada das 12 personas com
   `CONVERSATION_MODEL=muse-spark-1.3` (sem `-contributor`, sem `CONVERSATION_MODEL_PRICE`),
   `pnpm dev:personas`, e a tabela com `pnpm dev:eval <rodada>`. Saída: custo p50/p95 por conversa e quantas bateriam no teto.
   **O** fixa o teto pelo p95 medido, não pela premissa de R$ 0,10 por lead.
6. ✅ **O** — merge do PR #43 (`5bf5a15`, 2026-09-29; a `0020` já estava aplicada em produção).
7. **C** — logo depois do merge (mexe no mesmo `hermes.yml`): trocar a instalação do Hermes na
   Action pelo instalador oficial (A6) e rodar a Action uma vez à mão com `force` para provar que
   instala; registrar a troca de R$ 27,00 como R17.2 no grafo (pendência da revisão 1).

**Saída de L0:** número verificado, canal humano escolhido e (se for a) construído, custo do
modelo padrão medido e teto decidido, `BUSINESS_CONFIG` com `exchange`.

## L1 — Publicar (1 dia, depois de L0)

1. **O** — importar no n8n os workflows do `main` (turno, relógio, venda, envio) → **C** roda
   `pnpm dev:n8n` até passar (hoje falha em "Turno" e "Relógio": o `main` está à frente).
2. **O** — `CONVERSATION_MODEL` para o modelo padrão (conversa real tem dado pessoal).
3. **O** — Parte B do runbook do canal: segredos no Supabase, publicar `turn` e `whatsapp`.
4. **S** — webhook da Meta apontando para a função `whatsapp`.
5. **C** — Parte C: credencial no n8n, `PHONE_NUMBER_ID`, `CANAL_ATIVO=true`; fechar as portas
   (`TURN_REQUIRE_SERVICE_ROLE=true`, `INBOUND_SIGNING_SECRET`).

**Saída de L1:** "oi" do celular pessoal recebe recepção e resposta; um pedido de pessoa chega por
e-mail e a pessoa responde pelo canal de L0.3.

## L2 — Provar com dinheiro de verdade (1 dia)

Três conversas reais, feitas pelo operador ou por alguém de confiança, pelo WhatsApp:

1. **Compra na entrega (Logzz):** conversa → link → pedido → webhook → estágio → véspera → entrega.
2. **Compra antecipada (Coinzz):** conversa → link → pagamento → webhook → estágio.
3. **Troca e handoff:** com o pedido 1, pedir troca de tamanho → R$ 27,00 + link + handoff → a
   pessoa responde.

**C** confere cada passo no banco (`conversations.stage`, `followups`, `turn_outcomes`,
`llm_calls`). Nada de bateria de personas aqui: a rodada de L0.5 já cobriu mentira e custo.

**Saída de L2:** os três fluxos fecharam sem intervenção fora do previsto.

## L3 — Tráfego controlado (semana 1)

1. **S** — anúncio CTWA só nas 22 praças com pagamento na entrega, orçamento baixo (sugestão:
   R$ 50–100 por dia nos 3 primeiros dias).
2. **O** — ler **todas** as conversas dos 3 primeiros dias (são poucas) e o `pnpm dev:painel`
   diário; responder todo handoff em até 1 h no horário de atendimento (06:00–00:00).
3. **O** — assinar o piso de amostra ([`08-piso-de-amostra.md`](08-piso-de-amostra.md) §4)
   **antes** de olhar a primeira taxa.
4. **Critérios de pausa** (qualquer um → pausar o anúncio, consertar, voltar):
   - uma mentira de preço, frete, prazo, troca ou saúde chegou à cliente;
   - handoff sem resposta humana em mais de 2 h no horário de atendimento;
   - custo por conversa acima do teto em mais de 10% das conversas do dia;
   - mensagem da cliente sem resposta nenhuma (falha de canal).

**Saída de L3:** 50 leads reais — o gatilho do Hermes (R6.2).

## L4 — Hermes assume a melhoria contínua (a partir dos 50 leads)

Para o Hermes fazer os 20% restantes, cinco coisas têm de ser verdade. Hoje nenhuma é:

| # | Condição | Situação hoje | Dono |
|---|---|---|---|
| H1 | A Action instala e roda o Hermes | **5 de 5 execuções falharam** na instalação (A6) | C (L0.7) |
| H2 | Os segredos da Action existem: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_API_KEY`; e `SUPABASE_ACCESS_TOKEN` para publicar a aprovada | não conferido (a instalação quebra antes) | O |
| H3 | A rotina que implementa a proposta aprovada (`hermes/IMPLEMENTAR.md`) está agendada | **não encontrada** (A9): sem ela, "Aprovar" grava a decisão e nada acontece | C cria, O autoriza |
| H4 | O Hermes vê se a conversa **virou pedido** | **não vê** (A10): o pacote leva vetos e desfechos do turno, não `eval_funnel` nem pedido/entrega/recusa. Ele acha mentira e tom, mas não o que converte | C, ~2 h |
| H5 | O piso de amostra está assinado | não (o efeito medido fica "leitura") | O (L3.3) |

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
