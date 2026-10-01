# Plano de testes antes de escalar — copy, região, agente e Hermes

> **Decidido com o operador em 2026-10-01** (R18.1–R18.4,
> [`03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md); grafo §49).
> Substitui a linha "anúncio CTWA só nas 22 praças" do L3 do
> [pipeline 80/20](09-pipeline-ate-producao.md). O andamento continua no quadro do topo do
> [`HANDOFF.md`](../../../HANDOFF.md).

## Em uma tabela

| Fase | Dias | Verba de mídia | O que roda | O que decide |
|---|---|---|---|---|
| **0. Pré-teste** | antes do dia 1 | R$ 0 | Canal, conta de anúncios, agente no WhatsApp, as 3 conversas reais do L2, piso assinado, copies revisadas | O dia 1 só começa com tudo verde |
| **1. Copy** | 1–5 | **R$ 300** (R$ 60/dia) | 1 conjunto, Brasil inteiro, mulheres 18–55, os 6 vídeos | As 2 copies que seguem |
| **2. Região** | 6–12 | **R$ 500** (~R$ 35,70/dia por conjunto) | 2 conjuntos: **A = Norte + Nordeste**, **B = Sul + Sudeste + Centro-Oeste**, mulheres 18–55, só as 2 copies vencedoras | Restringir a região ou não |
| **Leitura** | 13–14 | R$ 0 | Os pedidos na entrega dos últimos dias chegam à porta (1 a 3 dias) | Recusa e entrega concluída por região |

**R$ 800 são só mídia.** O custo de IA (medido em 30/09: p50 R$ 0,27 por conversa) fica fora
dessa verba, mas entra no critério de lucro abaixo.

## Fase 0 — pré-condições (não é dia de teste)

Nenhum real de mídia antes de todas estas serem verdade:

1. Canal no ar (L0.1, L0.2, L1.3–L1.5): "oi" do celular pessoal recebe recepção e resposta.
2. As três conversas reais do L2 fecharam: compra na entrega, compra antecipada, troca + handoff
   respondido pelo formulário.
3. **As 6 copies revisadas** (compliance + coerência com a agente) — ver §Copies.
4. **Região do lead pelo DDD**, numa view SQL, para ler as cinco regiões dentro dos dois conjuntos
   (**C**, ~1 h; ainda não feito).
5. Piso de amostra ([`08-piso-de-amostra.md`](08-piso-de-amostra.md) §4) **assinado antes de olhar
   qualquer número**, com os critérios deste arquivo; `pnpm dev:estoque` rodado na véspera.

## Fase 1 — copy (dias 1–5, R$ 300)

O vídeo já foi validado em outros testes; **a variável é a copy do áudio** (roteiro e gancho).

- **Estrutura:** 1 campanha de Mensagens (clique para o WhatsApp), 1 conjunto aberto no Brasil,
  mulheres 18–55, os 6 anúncios dentro. Aberto porque a leitura de copy depende pouco da região e o
  público maior entrega mais barato.
- **Métricas, nesta ordem:**
  1. taxa de gancho (visualizações de 3 s ÷ impressões) — Ads Manager;
  2. custo por conversa iniciada — Ads Manager;
  3. % de leads que respondem a segunda mensagem da agente — Supabase, pelo `source_id` do anúncio
     (`eval_attribution`).
- **Saída:** as 2 copies com menor custo por conversa, desde que a taxa de gancho não seja a pior
  do grupo; empate desfeito pela métrica 3. Anúncio em que o Meta gastou menos de R$ 25 em 5 dias
  foi descartado pelo próprio Meta.
- **Venda por copy é leitura de direção, não prova:** separar 10% de 20% de conversão exige 199
  leads **por anúncio** (piso §2.3).

## Fase 2 — região (dias 6–12, R$ 500)

- **Estrutura:** campanha nova, orçamento por conjunto (não por campanha), R$ 250 em cada:
  - **A — Norte + Nordeste**
  - **B — Sul + Sudeste + Centro-Oeste**

  Mesmo público (mulheres 18–55), as 2 copies vencedoras **usando o mesmo post** da fase 1 (guarda
  curtidas e comentários).
- **Por que N+NE e não "Brasil inteiro" como controle:** o Brasil inteiro contém S+SE+CO (~65% da
  população). Os dois conjuntos disputariam o mesmo leilão e a diferença sairia diluída. O
  resultado do "Brasil aberto" sai por conta: a mistura de A e B ponderada pelo volume.
- **As cinco regiões sem dividir a verba:** o detalhamento por região do Ads Manager dá custo e
  conversa por estado; o DDD de cada lead (Fase 0, item 4) dá conversa, pedido e recusa por região.
  Cinco conjuntos de R$ 100 não sairiam da fase de aprendizado (decidido: 2 conjuntos).
- **Métricas por conjunto:** custo por conversa; custo por pedido criado; % de pedidos na entrega ×
  antecipado; recusa na porta e entrega concluída (painel da Logzz).
- **Leitura dentro de B:** Curitiba, Brasília, Vitória, Joinville, Campo Grande, Cuiabá, Ribeirão
  Preto e Uberlândia não têm pagamento na entrega (varredura de 21/09). A leitura separa quanto de
  B veio de quem tinha a entrega disponível — o recorte não muda (R18.2).

## Agente e Hermes — rodam por cima das duas fases, sem verba própria

- **Regras de parada, tolerância zero** (piso §4): uma mentira, um opt-out ignorado ou uma conversa
  acima do teto **pausa os anúncios no mesmo dia**.
- **Handoff respondido em até 1 h**, das 06:00 às 00:00 — alguém de plantão nos 12 dias.
- **O operador lê todas as conversas dos 3 primeiros dias** e o `pnpm dev:painel` todo dia.
- **Hermes** roda a cada 50 leads: de 4 a 8 passadas no período. Limite de hoje: não vê se a
  conversa virou pedido (H4) e a proposta aprovada não se implementa sozinha enquanto a rotina não
  estiver agendada (H3) — ele acha mentira e tom, não o que converte.

## Critérios para escalar

| Número | Escala | Ajusta | Para |
|---|---|---|---|
| Custo por pedido criado | ≤ R$ 25 | R$ 25–43 | > R$ 43 (prejuízo) |
| Mentira, opt-out ignorado, conversa acima do teto | 0 | — | 1 caso pausa no mesmo dia |
| Recusa na porta | ≤ 15% | 15–25% | > 25% |

**De onde vêm os R$ 43:** margem esperada do pagamento na entrega, 1 peça, antes de lead e IA:
R$ 45,74 ([`06-modelo-economico.md`](../../documentacao/contexto-negocio/06-modelo-economico.md),
caixa de 29/09). Menos a IA: R$ 0,27 × 10 conversas por venda = R$ 2,70. Sobram ~R$ 43 para pagar
o lead de cada pedido.

**Decisão de região:** B escala sozinho se o custo por pedido criado de B for menor que o de A **e**
a recusa de B não for pior. Se A empatar ou ganhar, escala aberto.

## Volume esperado (para calibrar expectativa, não para julgar)

| Custo por conversa | Leads fase 1 | Leads por conjunto na fase 2 | Pedidos por conjunto (10%) |
|---|---|---|---|
| R$ 1,50 | 200 | 167 | ~17 |
| R$ 2,50 | 120 | 100 | ~10 |
| R$ 4,00 | 75 | 62 | ~6 |

## O que 14 dias não respondem

- **Devolução não fecha:** a garantia é de 7 dias depois do recebimento — um pedido do dia 10 fecha
  a devolução no dia ~20. Recusa e entrega concluída se leem; devolução, só em parte.
- **Recusa por região é direção, não prova:** com 6 a 17 pedidos por conjunto, aparece uma diferença
  grande (10% × 30%), não uma pequena.

## Copies

Seis roteiros diferentes, com gancho próprio, sobre o mesmo vídeo validado; voz de fundo gerada por
IA. Algumas falam em primeira pessoa ou em tom de feedback de cliente.

Antes de subir, cada uma passa por:

1. **Coerência com a agente:** nada que os gates vetam (frete grátis sem o caminho, prazo, emagrecer,
   desconto, escassez inventada). Se o anúncio promete e a agente desmente, o teste mede a
   contradição, não a copy.
2. **Depoimento:** fala em primeira pessoa de cliente, com voz de IA, é depoimento que não existiu —
   risco de CONAR e de reprovação no Meta (`05-decisoes-firmes.md` §7).
3. **Política de anúncio do Meta:** nada que sugira insegurança com o próprio corpo nem
   antes/depois.

Estado: **aguardando o texto das 6 copies** (operador, 2026-10-01).
