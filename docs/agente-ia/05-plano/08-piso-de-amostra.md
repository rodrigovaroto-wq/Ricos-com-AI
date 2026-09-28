# Piso de amostra — quanto dado antes de julgar cada número

> **Preparado em 2026-09-28, sem olhar nenhum número de tráfego real.** Item 7.3 do
> [plano de execução](02-plano-de-execucao-ate-os-testes-reais.md) ("piso de amostra
> escrito **antes** de olhar qualquer número real"). As contas são de apoio; **os pisos são
> decisão do operador**, que escolhe, preenche e assina a seção 4. Até a assinatura, o piso
> não existe.

Por que isto vem antes: com 30 conversas, toda taxa é ruído
([`04-analise-de-arquitetura.md`](04-analise-de-arquitetura.md), "Métrica antes de
amostra"). Quem olha o número primeiro escolhe o piso que confirma o que já viu.

## 1. As decisões, a métrica e a base que existe

| Decisão | Métrica | View (`0018_evaluation_views.sql`) | Base no repositório |
|---|---|---|---|
| **A agente vende** | pedido criado ÷ leads | `eval_attribution`: `sum(leads_ordered) / sum(leads)` (ou `eval_funnel`, estágio ≥ `pedido_criado`) | **Meta de 10%** conversa → pedido criado (D3, [`06-modelo-economico.md`](../../documentacao/contexto-negocio/06-modelo-economico.md) e [`03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md)). Equilíbrio de **3,47%** com CPL R$ 1,25 — **histórico, pendente de recálculo** no próprio modelo. É projeção de estudo, não medida |
| **Recusa COD na porta** | `recusado` ÷ (`entregue_pago` + `recusado`) | `eval_funnel` | **15%** (modelo); Logzz declara frustração de **13% a 16%** (mesmo arquivo). Ressalva: a view não separa COD de antecipado — o antecipado, que não é recusado, dilui a taxa. A fonte direta é o painel da Logzz |
| **Fallback aceitável** | `fallback_rate` (resposta pronta ÷ send+fallback+handoff) | `eval_turn_outcomes` | **Sem base de tráfego real.** Só sintético: 0 em 61 respostas no eval da Muse ([`06-eval-muse-2026-09-25.md`](06-eval-muse-2026-09-25.md)); 1 resposta pronta na R3 das personas ([`05-rodada-personas-2026-09-24.md`](05-rodada-personas-2026-09-24.md)). Persona adversarial não é cliente |
| **Handoff aceitável** | `handoff_rate` | `eval_turn_outcomes` | **Sem base no repositório** |
| **Gate calibrado** | `block_rate` por gate (por tentativa julgada, não por turno) | `eval_gate_blocks` | **Sem base de tráfego real.** Sintético: 0,03 reescrita por resposta (eval da Muse) |
| **Custo sob o teto** | `cost_brl` por conversa; `counter_drift_brl` | `eval_conversation_cost` | Teto `cost.conversationCapBrl` = **R$ 1,50**, folga `overrunTolerance` 25% → **R$ 1,875** efetivo (`config/business.example.json`). Sintético: R$ 0,013 por conversa |
| **Qual anúncio ganha** | `leads_ordered / leads` por `ad` | `eval_attribution` | **Sem base no repositório** para diferença entre anúncios |
| **Opt-out** | `leads_opted_out` ÷ `leads` | `eval_attribution` (conta por `leads.opted_out_at`, nunca por `stage` — item 7.0) | **Sem base no repositório** |

Duas travas de leitura: nada em `turn_outcomes` existe antes do deploy da v33
(2026-09-25); e o Hermes roda a cada 50 leads (R6.2) — **50 não é piso para julgar
taxa**: com p = 10% e n = 50, a margem é ±8,3 pp.

## 2. Tamanho de amostra

### 2.1 Estimar uma proporção — n = z²·p(1−p) / E², z = 1,96 (95%)

| p esperado | E = ±1 pp | E = ±2 pp | E = ±3 pp | E = ±5 pp |
|---|---|---|---|---|
| 3% | 1.118 | 280 | 125 | *45 ⚠* |
| 5% | 1.825 | 457 | 203 | *73 ⚠* |
| 10% | 3.458 | 865 | 385 | 139 |
| 15% | 4.899 | 1.225 | 545 | 196 |
| 20% | 6.147 | 1.537 | 683 | 246 |
| 30% | 8.068 | 2.017 | 897 | 323 |

Arredondado para cima. ⚠ = margem ≥ p: o intervalo inclui zero e a aproximação normal
falha; não use essa célula. **A unidade de n muda por métrica**: leads para conversão e
opt-out; **pedidos que chegaram à porta** para recusa; turnos com envio para fallback e
handoff; tentativas julgadas para `block_rate`.

Leitura rápida para a meta de 10%: com 139 leads, "10%" quer dizer "entre 5% e 15%" —
já fica acima do equilíbrio histórico (3,47%), mas não separa a meta de 7% ou de 13%. Com
385, entre 7% e 13%.

### 2.2 Zero eventos — a regra de três

Se nada aconteceu em n casos, o limite superior de 95% é ≈ **3/n**: 0 em 100 → até 3%;
0 em 300 → até 1%; 0 em 1.000 → até 0,3%. Serve para fallback e para "nenhuma mentira
achada pelo Hermes" — mas **não relaxa as regras absolutas da seção 4**.

### 2.3 Comparar dois anúncios — n **por anúncio**, teste de duas proporções, α = 5% bilateral, poder 80%

n = [z₀,₉₇₅·√(2·p̄(1−p̄)) + z₀,₈·√(p₁(1−p₁) + p₂(1−p₂))]² / (p₁ − p₂)², com z₀,₉₇₅ = 1,960 e z₀,₈ = 0,842.

| Anúncio A | Anúncio B | Diferença | Leads por anúncio |
|---|---|---|---|
| 10% | 12,5% | +2,5 pp | 2.507 |
| 10% | 15% | +5 pp | 686 |
| 10% | 20% | +10 pp | 199 |
| 5% | 7,5% | +2,5 pp | 1.471 |
| 5% | 10% | +5 pp | 435 |
| 3% | 5% | +2 pp | 1.506 |

Conferência: cálculo refeito à mão para 10% × 15% (685,6 → 686) e simulação de Monte
Carlo (4.000 rodadas) deu poder de 0,81 para 10% × 15% com 686 e 10% × 20% com 199. A
mesma conta vale para recusa: 15% → 10% pede **686 pedidos na porta por grupo**.

Com mais de dois anúncios, cada comparação extra aumenta a chance de um vencedor falso;
compare o melhor contra o segundo, ou aceite que "ganhou" com 3+ anúncios é indício, não
prova. **Se o anúncio for julgado por CPL ou CPC, a leitura é no Ads Manager, não aqui.**

### 2.4 Custo médio (variável contínua)

n = (1,96·s / E)², com s = desvio-padrão do custo por conversa — **sem base no repositório**
para s. O custo sintético (R$ 0,013) está ~100× abaixo do teto: se isso se repetir, a
média não precisa de amostra grande para ficar abaixo de R$ 1,50. O que importa é a cauda,
e a cauda é regra absoluta (seção 4).

## 3. De amostra para dias de tráfego

A taxa de leads por dia é desconhecida até o tráfego existir. Só as fórmulas:

- Conversão, opt-out: **dias = N ÷ leads_por_dia**
- Um anúncio entre k, divisão igual: **dias = N_por_anúncio × k ÷ leads_por_dia**
- Recusa: **dias = N_pedidos ÷ (leads_por_dia × conversão × fração COD) + prazo de entrega**
  (o pedido só vira `entregue_pago` ou `recusado` depois da entrega)
- Fallback, handoff: **dias = N_turnos ÷ (leads_por_dia × turnos_com_envio_por_lead)**

leads_por_dia medido em ____/____/______: __________ (fonte: ______________________)

## 4. O piso — para o operador preencher, datar e assinar

**Regra "não olhar antes de":** não abro `eval_attribution`, `eval_funnel`,
`eval_turn_outcomes`, `eval_gate_blocks` nem `eval_conversation_cost` com dado real para
**decidir** nada antes de o N da linha correspondente ser atingido. Olhar só para checar
se a view responde (não vazia, sem erro) é permitido; ler o valor da taxa, não.

| Julgamento | N mínimo (unidade) | Margem ou efeito aceito | Decisão que tomo quando atingir |
|---|---|---|---|
| A agente vende (conversão) | ______ leads | ± ____ pp | __________________________ |
| Recusa COD | ______ pedidos na porta | ± ____ pp | __________________________ |
| Fallback aceitável | ______ turnos com envio | até ____ % | __________________________ |
| Handoff aceitável | ______ turnos com envio | até ____ % | __________________________ |
| Gate calibrado (por gate) | ______ tentativas julgadas | até ____ % | __________________________ |
| Qual anúncio ganha | ______ leads **por anúncio** | diferença ≥ ____ pp | __________________________ |
| Custo médio | ______ conversas | média ≤ R$ ______ | __________________________ |

**Regras de parada absolutas — tolerância zero, não precisam de amostra.** Um único caso
pausa os anúncios no mesmo dia, antes de qualquer piso:

1. **Uma mentira em produção** — promessa de preço, frete, prazo, desconto ou claim que
   não é verdade, achada pelo Hermes, pelo operador ou por reclamação. Um caso basta.
2. **Opt-out ignorado** — qualquer mensagem enviada a um lead depois de
   `leads.opted_out_at`. Um caso basta.
3. **Custo acima do teto** — qualquer conversa com `cost_brl` acima de
   `conversationCapBrl × (1 + overrunTolerance)` (hoje R$ 1,875), ou `counter_drift_brl`
   diferente de zero: o mecanismo do teto falhou. Um caso basta.
4. Outras que eu acrescento: ___________________________________________________

Estas regras não passam pela seção 2: amostra mede taxa, e para estes eventos a taxa
aceitável é zero. Não existe "ainda é pouco dado" para uma mentira dita a uma cliente.

Escrito sem olhar número real: ☐ sim

Operador: ______________________   Data: ____/____/______   Commit que registra: ________
