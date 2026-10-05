# Modelo econômico — site vs. WhatsApp + IA

Fonte: documento *"Modelagem Econômica — Site vs. WhatsApp + IA (versão atualizada)"*,
entregue pelo operador em 2026-09-03.

> **Como tratar este arquivo.** É um **estudo de projeção com dados de mercado**, não
> resultado medido da nossa operação. O próprio documento encerra dizendo que *"a decisão
> final deve ser confirmada por teste real de CPL/CPC, conversão e CAC"*. Serve para
> dimensionar o agente e priorizar trabalho — não como verdade.
>
> **Os cenários sem COD não são premissa nossa.** A operação é COD. Eles ficam registrados
> só como referencial comparativo do estudo.

> ### Lucro por venda com o custo real — 1, 2 e 3 peças (2026-10-02)
>
> Premissas (plano do mês 1, [`10-execucao-mes-1.md`](../../agente-ia/05-plano/10-execucao-mes-1.md)
> §7, e L3 itens 2 e 7 de [`09-pipeline-ate-producao.md`](../../agente-ia/05-plano/09-pipeline-ate-producao.md);
> operador, 2026-10-02). Preços de `config/business.example.json` (`codBrl` 129,90, `prepayBrl`
> 116,91, 10%); kits e taxas da tabela de 29/09 logo abaixo, sem mudança.
>
> | Item | Antes (29/09) | **Vigente (02/10)** | Origem |
> |---|---|---|---|
> | Lead (CPL) | R$ 1,00 | **R$ 1,25–1,50** → R$ 12,50–15,00 por venda a 10% | operador |
> | IA (modelo) | R$ 0,10 por lead → R$ 1,00 por venda | **R$ 0,27 por lead** (p50 medido em 30/09; p95 R$ 0,546; teto R$ 0,55) → **R$ 2,70 por venda** a 10% | medido (L0.5) |
> | WhatsApp | não contado | **R$ 0 por lead** (atendimento e régua dentro da janela de 24 h e da gratuita de 72 h); só o template UTILITY do pós-venda fora da janela (`order_eve`), US$ 0,0068 (~**R$ 0,04**) **por pedido** | tabela da Meta |
> | Recusa na porta (só COD) | 15% a R$ 9,90 | **12–17% a R$ 9,99** — **valor especulado, ainda precisa ser medido** | operador |
> | Devolução pós-envio (dois caminhos) | 7,5% a R$ 25,00 | **5–10% a R$ 25,00** | operador |
> | Conversão lead → pedido | 10% | 10% (sem mudança; é o limiar de "escalar" em L3.7) | operador |
>
> **Valor da recusa — decidido pelo operador em 2026-10-02: R$ 9,99** (R18.3). A memória
> `entrega-concluida-so-no-cod` e a caixa de 29/09 diziam R$ 9,90; ficam como histórico. A
> **taxa** de recusa (12–17%) continua especulada — medir no primeiro extrato com recusa.
>
> **Tabela base na ponta pessimista das faixas** (recusa 17%, devolução 10%, CPL R$ 1,50, IA
> no p50). Margem antes de volume: a operação só escala se o pior caso da faixa ainda paga.
>
> | Por venda (R$) | COD 1 | COD 2 | COD 3 | Antec. 1 | Antec. 2 | Antec. 3 |
> |---|---:|---:|---:|---:|---:|---:|
> | Faturamento | 129,90 | 233,82 | 311,76 | 116,91 | 207,84 | 272,79 |
> | Produto | −30,00 | −60,00 | −90,00 | −30,00 | −60,00 | −90,00 |
> | Transação | −11,57 | −18,83 | −24,28 | −3,99 | −6,70 | −8,64 |
> | Entrega concluída | −19,99 | −19,99 | −19,99 | 0,00 | 0,00 | 0,00 |
> | Manuseio | −4,99 | −4,99 | −4,99 | −4,99 | −4,99 | −4,99 |
> | **Margem se entregue** | **63,35** | **130,01** | **172,50** | **77,93** | **136,15** | **169,16** |
> | Perda esperada por recusa (17% × (margem + R$ 9,99)) | −12,47 | −23,80 | −31,02 | 0,00 | 0,00 | 0,00 |
> | Perda esperada por devolução (10% × (margem + R$ 25,00), + taxa MP no antecipado) | −8,83 | −15,50 | −19,75 | −10,69 | −16,79 | −20,28 |
> | **Margem esperada, antes de lead, IA e WhatsApp** | **42,05** | **90,71** | **121,73** | **67,24** | **119,36** | **148,88** |
> | Lead (R$ 1,50 ÷ 10%) | −15,00 | −15,00 | −15,00 | −15,00 | −15,00 | −15,00 |
> | IA (R$ 0,27 × 10 leads) | −2,70 | −2,70 | −2,70 | −2,70 | −2,70 | −2,70 |
> | WhatsApp (UTILITY pós-venda, por pedido) | −0,04 | −0,04 | −0,04 | −0,04 | −0,04 | −0,04 |
> | **Lucro por venda** | **24,31** | **72,97** | **103,99** | **49,50** | **101,62** | **131,14** |
>
> Mix 70% COD / 30% antecipado: **R$ 31,86 / R$ 81,56 / R$ 112,13** por venda (1 / 2 / 3 peças).
> Na ponta otimista (recusa 12%, devolução 5%, CPL R$ 1,25): **R$ 41,63 / R$ 96,91 / R$ 130,97**.
> Totais calculados com valores exatos; a soma das linhas arredondadas pode diferir em R$ 0,01.
>
> **A conta de 1 peça, por caminho (ponta pessimista):**
>
> ```
> COD:        129,90 − 30,00 − 11,57 (6,99% × 129,90 + 2,49) − 19,99 − 4,99      = 63,35 se entregue
>             − 17% × (63,35 + 9,99) = −12,47      (recusa: perde a margem e paga R$ 9,99)
>             − 10% × (63,35 + 25,00) = −8,83      (devolução: perde a margem e paga R$ 25,00)
>             = 42,05 − 15,00 (lead) − 2,70 (IA) − 0,04 (WhatsApp)                 = 24,31
> Antecipado: 116,91 − 30,00 − 3,99 (MP: 0,5 × (0,99% × 116,91 + 1,00) + 0,5 × 4,98% × 116,91) − 4,99
>                                                                                     = 77,93 se entregue
>             − 10% × (77,93 + 25,00 + 3,99) = −10,69   (a taxa do MP não volta no estorno)
>             = 67,24 − 15,00 − 2,70 − 0,04                                          = 49,50
> Mix 70/30:  0,7 × 24,31 + 0,3 × 49,50                                              = 31,86
> ```
>
> **Sensibilidade, 1 peça** (devolução 10%; com 5%, acrescente R$ 4,42 no COD e R$ 5,35 no antecipado):
>
> | Recusa \ CPL | R$ 1,25: COD / Antec. / Mix | R$ 1,50: COD / Antec. / Mix |
> |---|---|---|
> | 12% | 30,47 / 52,00 / **36,93** | 27,97 / 49,50 / **34,43** |
> | 17% | 26,81 / 52,00 / **34,36** | 24,31 / 49,50 / **31,86** |
>
> - Cada ponto de recusa custa **R$ 0,73** por venda COD (63,35 + 9,99 = 73,34 × 1%); o
>   antecipado não muda.
> - Cada R$ 0,25 de CPL custa **R$ 2,50** por venda nos dois caminhos — a 10% de conversão, o CPL
>   pesa mais que a recusa em toda a faixa.
> - IA no p95 (R$ 0,546) ou no teto (R$ 0,55): R$ 5,46–5,50 por venda, −R$ 2,76 a −2,80 sobre o
>   p50 → mix pessimista **R$ 29,06–29,10**.
> - Contra a tabela de 29/09 (mix R$ 41,99, 1 peça), a ponta pessimista perde **R$ 10,13** (41,99 − 31,86) por
>   venda: lead +R$ 5,00, IA +R$ 1,70, WhatsApp +R$ 0,04, recusa e devolução mais altas o resto.
>
> **Reserva de caixa** (L3.2): **todo custo de um pedido até a venda virar dinheiro** — produto,
> manuseio, taxa de transação, entrega concluída, recusa, devolução. O **antecipado cai na hora**
> no Mercado Pago e cobre o próprio custo; **a entrega libera 14 dias depois do pagamento** (que
> acontece na porta, D+1 a 3), então só o COD empata caixa. Por pedido COD criado, com 1 peça:
> `(1 − recusa − devolução) × 66,55 + recusa × 9,99 + devolução × 25,00`, onde 66,55 =
> 30,00 + 11,57 + 19,99 + 4,99 → **R$ 52,78** na ponta pessimista, **R$ 57,69** na otimista
> (menos recusa = mais pedidos entregues = mais custo adiantado).
>
> **A conta da reserva de L3 não fecha com estas premissas — decisão do operador.** Com a verba de
> R$ 800 e 10% de conversão, o teste cria 53 pedidos (CPL R$ 1,50) a 64 (CPL R$ 1,25), 37 a 45 no
> COD, e nenhum crédito do COD volta antes do dia 15. Reserva necessária: **R$ 1.970 a R$ 2.584**,
> contra **R$ 1.200** reservados. Os R$ 1.200 cobrem até ~6,1% de conversão na ponta pessimista.
> Fecha se o produto e a transação não saírem do caixa antes da venda (a seção de caixa de
> `docs/operacao/mapa-financeiro.html` dizia que o estoque é do fornecedor e os R$ 30,00 saem da
> comissão): aí são **R$ 838 a R$ 1.039**. Qual das duas é a verdade é pergunta para o operador.

> ### Lucro por venda com lead, IA, recusa e devolução — 1, 2 e 3 peças (2026-09-29)
>
> **Histórico desde 2026-10-02:** lead, IA, recusa e devolução foram substituídos pela caixa
> acima; produto, transação, entrega concluída e manuseio continuam valendo.
>
> Premissas do operador: **lead R$ 1,00**, **conversão 10%** (R$ 10,00 de lead por venda),
> **IA R$ 0,10 por lead** (1 lead = 1 conversa → R$ 1,00 por venda), **recusa de 15% só no COD,
> a R$ 9,90 — é tudo o que o operador paga quando a entrega frustra** (substitui os R$ 9,99 de
> R10.2) e **devolução/cancelamento pós-envio de 7,5% nos dois caminhos**. A devolução é
> separada da recusa e vale sobre o pedido criado; o pedido devolvido custa a **taxa completa de
> devolução de R$ 25,00, manuseio já incluso, nos dois caminhos**, não gera receita e, no
> antecipado, **a taxa do Mercado Pago não volta no estorno** (operador, 2026-09-29). Produto
> R$ 30,00 por peça; manuseio, entrega, recusa e devolução contam **uma vez por pedido**, também
> nos kits (**confirmado pelo operador em 2026-09-29**). Antecipado com taxa do
> Mercado Pago (50% Pix / 50% cartão à vista, sem antifraude).
>
> | Por venda (R$) | COD 1 | COD 2 | COD 3 | Antec. 1 | Antec. 2 | Antec. 3 |
> |---|---:|---:|---:|---:|---:|---:|
> | Faturamento | 129,90 | 233,82 | 311,76 | 116,91 | 207,84 | 272,79 |
> | Produto | −30,00 | −60,00 | −90,00 | −30,00 | −60,00 | −90,00 |
> | Transação | −11,57 | −18,83 | −24,28 | −3,99 | −6,70 | −8,64 |
> | Entrega concluída | −19,99 | −19,99 | −19,99 | 0,00 | 0,00 | 0,00 |
> | Manuseio | −4,99 | −4,99 | −4,99 | −4,99 | −4,99 | −4,99 |
> | **Margem se entregue** | **63,35** | **130,01** | **172,50** | **77,93** | **136,15** | **169,16** |
> | Perda esperada por recusa (15% × R$ 9,90) | −10,99 | −20,99 | −27,36 | 0,00 | 0,00 | 0,00 |
> | Perda esperada por devolução (7,5%) | −6,63 | −11,63 | −14,81 | −8,02 | −12,59 | −15,21 |
> | **Margem esperada, antes de lead e IA** | **45,74** | **97,39** | **130,33** | **69,91** | **123,56** | **153,95** |
> | Lead (R$ 1,00 ÷ 10%) | −10,00 | −10,00 | −10,00 | −10,00 | −10,00 | −10,00 |
> | IA (R$ 0,10 × 10 leads) | −1,00 | −1,00 | −1,00 | −1,00 | −1,00 | −1,00 |
> | **Lucro por venda** | **34,74** | **86,39** | **119,33** | **58,91** | **112,56** | **142,95** |
>
> **Como cada linha escala com as peças** (nada é multiplicado por peça, exceto o produto):
>
> | Linha | Cobrada por | Conta (COD 1 / 2 / 3 peças; antecipado idem) |
> |---|---|---|
> | Faturamento | preço do kit | COD 129,90 / 233,82 / 311,76; antecipado 116,91 / 207,84 / 272,79 (sobre o unitário de R$ 129,90: COD 2 peças −10% e 3 peças −20%; antecipado 1 / 2 / 3 peças −10% / −20% / −30%) |
> | Produto | **peça** | R$ 30,00 × 1 / 2 / 3 |
> | Transação COD | % do preço + valor fixo **por pedido** | 6,99% × preço + R$ 2,49 (uma vez): 9,08+2,49 / 16,34+2,49 / 21,79+2,49 |
> | Transação antecipado (MP) | % do preço + R$ 1,00 fixo do Pix **por pedido** | 50% Pix (0,99% × preço + R$ 1,00) + 50% cartão (4,98% × preço): 3,99 / 6,70 / 8,64 |
> | Entrega concluída | **pedido** (só COD) | R$ 19,99 uma vez, mesmo no kit de 3 |
> | Manuseio | **pedido** | R$ 4,99 uma vez |
> | Recusa (só COD) | **pedido** | 15% × (margem entregue + R$ 9,90) |
> | Devolução pós-envio | **pedido** | 7,5% × (margem entregue + R$ 25,00); no antecipado soma-se a taxa do MP que não volta (3,99 / 6,70 / 8,64) |
> | Lead e IA | **venda** | R$ 10,00 + R$ 1,00, iguais em qualquer kit |
>
> Mix 70% COD / 30% antecipado: **R$ 41,99 / R$ 94,24 / R$ 126,41** por venda (1 / 2 / 3 peças).
> Estas contas **substituem** as médias das caixas abaixo (R$ 52,35 do COD, R$ 54,03 e R$ 60,02
> do mix), que não tinham devolução, lead nem IA. A taxa de 7,5% é premissa do operador, não
> medida; o mesmo cálculo roda no simulador de `docs/operacao/mapa-financeiro.html`.
> **Pendências restantes:** cartão à vista, sem parcelamento, no mix do Mercado Pago
> (confirmado como está). Na devolução do COD não há pagamento, logo não há taxa de transação a
> perder: só os R$ 25,00.
>
> ### 🚨 Correção de 2026-09-29 — a entrega concluída (R$ 19,99) não existe no antecipado; devolução pós-envio custa frete + manuseio
>
> Confirmado pela atendente do suporte Logzz/Coinzz (print do operador, 2026-09-29): a **taxa de
> entrega concluída de R$ 19,99 só é cobrada no pagamento na entrega (COD)**. No antecipado o
> operador paga apenas a etiqueta (se a cliente não a pagar), o manuseio e as taxas de
> transação/antifraude. **Isso derruba a premissa de 21/09** ("o antecipado paga as mesmas
> taxas do COD, entrega inclusive) e a P3 da caixa de 25/09 no que toca ao antecipado.
>
> Decisões do operador no mesmo dia: (1) a **cliente paga o frete do antecipado inteiro no
> checkout** (R15.3), então no pedido entregue o custo do operador é só taxa do MP + manuseio;
> (2) **devolução, processo de devolução ou cancelamento depois de enviado** custa ao operador
> **a taxa completa de devolução de R$ 25,00 (manuseio incluso), nos dois caminhos** —
> primeiro descrita como frete inteiro + manuseio, fechada em R$ 25,00 no mesmo dia; (3) a **recusa de 15% não muda**: entrega frustrada é o entregador chegando
> na porta e a cliente recusando pagar e receber — **só existe no COD**; o antecipado nunca
> tem taxa de frustração. Devolução/cancelamento pós-envio é um custo à parte, sem taxa
> percentual medida ainda.
>
> **Contribuição do antecipado entregue** (`preço − 30 × peças − taxa MP − 4,99`):
>
> | Peças | Antes (R$ 19,99 no custo) | **Vigente** | Média COD (15% recusa) | Vigente − COD média |
> |---|---|---|---|---|
> | 1 (116,91) | 57,94 | **77,93** | 52,35 | +25,58 |
> | 2 (207,84) | 116,16 | **136,15** | 109,01 | +27,14 |
> | 3 (272,79) | 149,17 | **169,16** | 145,12 | +24,04 |
>
> Mix 70% COD / 30% antecipado, 1 peça: 0,7 × 52,35 + 0,3 × 77,93 = **R$ 60,02** (era 54,03).
>
> **Custo de um pedido devolvido/cancelado depois de enviado, por pedido:** **− R$ 25,00** nos
> dois caminhos (taxa completa, manuseio incluso; operador, 2026-09-29). No antecipado a taxa do
> Mercado Pago **não volta** no estorno, então o pedido devolvido custa R$ 25,00 + a taxa (R$ 3,99
> / 6,70 / 8,64). No COD não há pagamento, logo não há taxa de transação a perder. (O
> `LABEL_COST_BRL = 15` do código é registro histórico.) Devolução (7,5%) e recusa (15%, R$ 9,90,
> só COD) são eventos e custos diferentes; a tabela do topo do arquivo soma os dois. As médias
> desta caixa (R$ 52,35, R$ 60,02) **não** incluem a devolução.
>
> ### ⚠️ Correção de 2026-09-25 — o antecipado passa pelo Mercado Pago: R$ 57,94 (1 peça)
>
> Desde [R14.15](../decisoes/03-decisoes-tomadas.md) o pagamento do antecipado na Coinzz é
> processado pelo **Mercado Pago**. Taxas informadas pelo operador em 2026-09-25: **Pix
> 0,99% + R$ 1,00** e **cartão à vista 4,98%**. O COD (Logzz) não muda, nem o preço que a
> cliente vê. **Esta caixa substitui a contribuição do antecipado das caixas abaixo**
> (R$ 51,27) e o que se apoiava nela: o "quase empate" da seção 6 e o "não há headroom" do
> teto de frete.
>
> **Premissas — adotadas sem resposta do operador, não medidas:**
>
> - **P1.** A taxa do MP **substitui a transação inteira da Coinzz** (6,99% + R$ 2,49 de
>   antifraude). Se os R$ 2,49 continuarem, vale a coluna "MP + R$ 2,49".
>   **Confirmado pelo operador em 2026-09-26: o antifraude não é mais cobrado** — vale a
>   coluna "Antecipado MP"; as linhas "com R$ 2,49" ficam só como registro.
> - **P2.** Mix de pagamento **50% Pix / 50% cartão à vista**.
> - **P3.** Handling (R$ 4,99) e entrega (R$ 19,99) **uma vez por pedido**, também nos kits;
>   produto R$ 30,00 por peça.
> - **P4.** **Cartão parcelado não informado** (o config aceita até 12x). A tabela supõe à
>   vista; a sensibilidade abaixo mostra quanto de taxa de parcelado a margem aguenta.
> - **P5.** Recusa COD de 15% a −R$ 9,99 por pedido, também nos kits. *(Histórico: R$ 9,90 desde
>   2026-09-29, R15.4 — ver a tabela do topo.)*
>
> Fórmula: `preço − 30 × peças − taxa MP − 4,99 − 19,99`, com
> `taxa MP = 0,5 × (0,99% × preço + 1,00) + 0,5 × 4,98% × preço`.
> 1 peça: `116,91 − 30,00 − 3,99 − 4,99 − 19,99 = R$ 57,94` (a taxa da Coinzz era R$ 10,66).
>
> | Peças (preço COD / antecipado) | COD entregue | COD média (15% recusa) | Antecipado Coinzz (antes) | **Antecipado MP** | MP + R$ 2,49 | MP − COD média |
> |---|---|---|---|---|---|---|
> | 1 (129,90 / 116,91) | 63,35 | 52,35 | 51,27 | **57,94** | 55,45 | +5,59 (+3,10 com R$ 2,49) |
> | 2 (233,82 / 207,84) | 130,01 | 109,01 | 105,84 | **116,16** | 113,67 | +7,15 (+4,66) |
> | 3 (311,76 / 272,79) | 172,50 | 145,12 | 136,25 | **149,17** | 146,68 | +4,04 (+1,55) |
>
> **Mix 70% COD / 30% antecipado, 1 peça:** 0,7 × 52,35 + 0,3 × 57,94 = **R$ 54,03**
> (R$ 53,28 com os R$ 2,49; era R$ 52,03). Kits no mesmo mix: R$ 111,15 (2 peças) e
> R$ 146,34 (3 peças).
>
> **A conclusão inverte:** o antecipado passa a render **mais** que a média do COD nas três
> quantidades, em vez de R$ 1,08 a menos. A folga é menor no kit de 3 (+R$ 4,04), porque o
> desconto de 30% come quase tudo.
>
> **Sensibilidade:**
>
> | Variável | 1 peça | 2 peças | 3 peças |
> |---|---|---|---|
> | Mix 100% Pix → 0% Pix (sem R$ 2,49) | 59,77 → 56,11 | 119,80 → 112,51 | 154,11 → **144,23** (abaixo do COD com < 9% de Pix) |
> | Idem, com R$ 2,49 | 57,28 → 53,62 | 117,31 → 110,02 | 151,62 → **141,74** (abaixo do COD com < 34% de Pix) |
> | Taxa de cartão que zera a vantagem — 50% Pix, metade cartão toda parcelada | 14,55% (10,29% com R$ 2,49) | 11,86% (9,46%) | 7,94% (6,12%) |
> | Idem — 100% cartão parcelado | 8,20% (6,07%) | 6,67% (5,47%) | 4,65% (3,74%) — já abaixo dos 4,98% à vista |
> | Recusa COD que empata com o antecipado MP (antes, com a Coinzz) | 7,4% (16,5%) | 9,9% (17,3%) | 12,8% (19,9%) |
> | Idem, com R$ 2,49 | 10,8% | 11,7% | 14,1% |
>
> Leitura da recusa: abaixo desse percentual o COD rende mais; acima, o antecipado. Com a
> Coinzz, o COD ganhava em qualquer recusa até ~16%; com o MP, o antecipado ganha em toda a
> faixa que a Logzz declara (13% a 16%), exceto 3 peças com os R$ 2,49 (empate em 14,1%).
>
> **O que decide se a folga é real:** P4. Se o parcelado em até 12x for **sem juros para a
> cliente** (juros absorvidos pela operação), a taxa real do MP para 12x precisa ser
> conferida no painel contra a linha "taxa que zera a vantagem" — no kit de 3 o limite é
> 7,94% com metade dos pedidos no cartão. Se os juros ficam com a cliente, P4 não pesa.
>
> **O que não muda:** a regra do que a agente diz (saída A, 2026-09-22 — só o percentual,
> nunca a economia em reais): a taxa do MP é custo nosso, o frete adicional da cliente
> continua à parte. Ponto de equilíbrio em % de CPL e cenários de lucro/dia continuam
> **pendentes** (mesma razão registrada abaixo). Nota de arredondamento: o mix 70/30 antigo
> dá R$ 52,02 com os valores exatos; R$ 52,03 vinha dos valores arredondados.

> ### 🚨 Correção de 2026-09-21 (2ª) — desconto do antecipado volta a 10%: R$ 116,91
>
> O operador reduziu o desconto do antecipado de **15% para 10%** no mesmo dia da correção
> anterior (abaixo). Preço: **R$ 116,91** (era R$ 110,41). Diferença de preço
> entre os dois caminhos: **R$ 12,99** (era R$ 19,49) — conta do operador, não fala da agente
> (saída A, 2026-09-22).
>
> **Duas coisas que continuam confirmadas, sem mudança:** a entrega (R$ 19,99) é custo
> nosso nos dois caminhos, igual ao COD — não é repassada à cliente com custo zero para a
> operação, ao contrário do que
> [`04-frete-e-desconto-do-antecipado.md`](../decisoes/04-frete-e-desconto-do-antecipado.md)
> parecia sugerir. **O que essa outra decisão descreve é um frete adicional, separado, que
> a cliente paga a mais no checkout** — essa cobrança não afeta a nossa contribuição,
> nem para melhor nem para pior; ela nunca entrou na conta.
>
> **Contribuição do antecipado recalculada:**
> `R$ 116,91 − 30,00 (produto) − 10,66 (transação: 6,99% de 116,91 + R$ 2,49) − 4,99
> (handling) − 19,99 (entrega) = R$ 51,27`
>
> **Isso muda a conclusão de novo.** Com 15% de desconto o antecipado rendia R$ 45,22,
> ~R$ 7,13 abaixo da média do COD (R$ 52,35). Com 10%, ele sobe para **R$ 51,27** —
> **quase empatado** com a média do COD, ~R$ 1,08 abaixo. A pendência §R10.5 (manter o
> antecipado como upsell?) fica mais fácil de decidir nesse cenário: a diferença que
> restava era pequena e agora é quase nula.

> ### ⚠️ Correção de 2026-09-21 (1ª) — o antecipado paga as mesmas taxas do COD
>
> Confirmado pelo operador: o antecipado usa a mesma estrutura de taxas do COD — produto,
> transação (6,99% + R$ 2,49), handling (R$ 4,99) **e entrega (R$ 19,99)**. A única
> diferença é que ele **não paga a taxa de entrega frustrada**, porque não existe recusa
> na porta num pagamento já feito. Isso derrubou a premissa usada desde a rodada 1 de que
> o antecipado "não paga handling nem entrega". **Os números vigentes são os da correção
> acima (2ª), com 10% de desconto** — esta caixa fica como registro do mecanismo
> descoberto, que continua valendo.
>
> Isso também mudou a **média COD com 15% de recusa** — recalculada após a correção
> separada do custo de recusa (§R10.2, R$ 9,99). **O que ainda não foi recalculado:** o
> ponto de equilíbrio em % de CPL e os cenários de lucro/dia/30 dias — a fórmula original
> desses dois não está registrada neste arquivo com detalhe suficiente para refazer com
> segurança; ficam pendentes até o operador confirmar ou repassar a conta.

## Premissas gerais

> **Histórico (2026-09-29).** Esta seção e a seguinte são da rodada de 21/09. Três linhas já não
> valem: há kits de 2 e 3 peças (não "1 unidade por pedido"); a entrega concluída (R$ 19,99) só
> existe no COD (R15.4), então o antecipado **não** tem "a mesma estrutura do COD entregue"; e a
> contribuição do antecipado não é mais R$ 51,27. Os números vigentes estão na tabela de lucro por
> venda do topo deste arquivo.

| Item | Premissa |
|---|---|
| Mídia | R$ 300/dia |
| Preço COD | R$ 129,90 |
| Preço antecipado/Pix | R$ 116,91 (**10% off** — voltou ao valor original da rodada 1 em 2026-09-21, depois de passar por 15%/R$ 110,41 na rodada 2) |
| Custo do produto | R$ 30,00 |
| Mix | 70% COD / 30% antecipado |
| Recusa COD | 15% |
| Agente de IA | ~~R$ 1,50 por conversa~~ → **teto de R$ 0,50 por conversa** e premissa de R$ 0,10 por lead (2026-09-29, §R15.4; era R$ 0,80, depois R$ 1,50 na rodada 10, §R7.3/§R10.1) |
| Upsell / order bump | não considerado |
| Mercado | Brasil, 1 unidade por pedido |

## Contribuição por pedido, antes da mídia

| Tipo | Custos considerados | Contribuição |
|---|---|---|
| COD entregue | produto + transação 6,99% + R$ 2,49 + handling R$ 4,99 + entrega R$ 19,99 | **R$ 63,35** |
| COD recusado | handling R$ 4,99 + falha R$ 9,99 (produto e transação não são perdidos) | **− R$ 9,99** total |
| Antecipado/Pix (preço R$ 116,91, 10% off) | **mesma estrutura do COD entregue** — produto + transação + handling + entrega — sem taxa de frustração, porque nunca é recusado na porta | **R$ 51,27** |

Média COD com 15% de recusa: **R$ 52,35** (0,85 × 63,35 + 0,15 × −9,99). Com o mix 70/30:
**R$ 52,03** (0,7 × 52,35 + 0,3 × 51,27) — praticamente igual à média COD sozinha, porque o
antecipado agora rende quase o mesmo, em vez de puxar a média para cima ou para baixo com
força.

> As duas seções seguintes (rodada 1 e rodada 2) ficam como registro histórico das contas
> daquela época. As correções no topo do arquivo são as que valem.

### Correção do operador (2026-09-04) — histórico, ver notas no topo do arquivo

O valor do antecipado no estudo, R$ 68,34, **não fecha** com os componentes da própria
tabela. A conta feita nesta rodada foi:

```
116,90 (preço antecipado)
− 30,00 (produto)
− 10,66 (transação: 6,99% de 116,90 = 8,17 + 2,49)
= 76,24
```

**Contribuição do antecipado (histórico, superado): R$ 76,24.** A do COD entregue permanece
**R$ 63,35**.

Isso mudava os números derivados, na época:

| | Estudo | Corrigido (2026-09-04, histórico) |
|---|---|---|
| Contribuição antecipado | R$ 68,34 | R$ 76,24 |
| Média COD (15% recusa) | R$ 51,60 | R$ 51,60 |
| **Média com mix 70/30** | R$ 56,62 | R$ 58,99 |

E, com ela, os cenários da época:

| Cenário | Lucro/dia (estudo) | Lucro/dia (corrigido, histórico) | 30 dias (histórico) |
|---|---|---|---|
| Otimista | R$ 2.007,90 | R$ 2.114,55 | R$ 63.436,50 |
| Base | R$ 1.206,60 | R$ 1.277,70 | R$ 38.331,00 |
| Pessimista | R$ 672,40 | R$ 719,80 | R$ 21.594,00 |

**Dúvida da época (2026-09-04), superada em 2026-09-21:** achava-se que no antecipado o
frete ficava por conta da cliente e por isso os R$ 19,99 não entravam como custo nosso — o
que dava a contribuição de R$ 76,24. O operador corrigiu: a taxa de entrega da Logzz
(R$ 19,99) **é paga por nós do mesmo jeito que no COD** — o que não existe no antecipado é
a taxa de frustração, não a taxa de entrega em si. O frete adicional que a cliente paga à
parte no checkout é outra coisa, e não entra nesta conta (ver correção 2ª no topo).

### O frete do antecipado — decidido na rodada 2 (preço e desconto mudaram; ver correções no topo)

**O frete adicional que a cliente vê no checkout continua sendo calculado à parte** — isso
não mudou. **O desconto voltou a 10%** em 2026-09-21 (era 15%).

Razão histórica do desconto de 15%: o frete no caminho antecipado é muito variável — pode
passar de R$ 30, R$ 40 e até R$ 50 conforme a região. Embutir isso no preço obrigaria a
precificar pelo pior caso. Essa razão não se aplica mais a por que o desconto é 10% — é
uma nova decisão do operador, sem justificativa registrada aqui além da decisão em si.

| | Com 10% (rodada 1, histórico) | Com 15% (rodada 2, histórico) | **Vigente (10%, 2026-09-21)** |
|---|---|---|---|
| Preço do produto | R$ 116,90 | R$ 110,41 | **R$ 116,91** |
| Diferença de preço (conta do operador; a agente não diz) | R$ 13,00 | R$ 19,49 | **R$ 12,99** |
| Contribuição do antecipado | R$ 76,24 | R$ 70,21 / R$ 45,22 (corrigido) | **R$ 51,27** |
| Média com mix 70/30 | R$ 58,99 | R$ 57,18 / R$ 50,21 (corrigido) | **R$ 52,03** |
| Equilíbrio (CPL R$ 1,25) | 3,47% | 3,58% | **pendente de recálculo** |

Cenários de lucro/dia e 30 dias: **pendentes de recálculo** com os números vigentes — a
fórmula original não está registrada aqui com detalhe suficiente para refazer com
segurança (mesma pendência já registrada acima).

**O que a agente pode dizer sobre o preço.** O percentual e o preço do antecipado — "10% de
desconto: R$ 116,91 no antecipado" — e que o frete é calculado à parte no checkout. **Nunca a
economia em reais** (a diferença de R$ 12,99): ela é sobre o produto, e o frete adicional é
linha separada, variável e fora do controle do operador: sempre que o frete da região dela
passar de R$ 12,99, ela paga **mais** no total pelo antecipado enquanto ouviria que economiza. Isso é sobre o que a
**cliente** paga, e é diferente da taxa de entrega de R$ 19,99 que é custo **nosso** nos dois
caminhos. *Corrigido em 2026-09-22 — saída A: só o percentual.* (Este parágrafo dizia "a
economia de R$ 12,99 é real e é sobre o produto", lido como licença para a agente citá-la.)

### Teto de frete — a régua de headroom muda de novo com o desconto de 10%

**[FATO — DOC, fonte secundária]** A Logzz tem a opção **Frete Personalizado**: o produtor
define um valor fixo de frete na criação do produto, ou oferece frete grátis.

**Ressalva de evidência:** a citação veio de resumo de busca, não de leitura direta — a
central de ajuda da Logzz responde 404 ou redireciona e o checkout da Coinzz responde 403.
**Confirmar no painel antes de virar decisão.**

**Não há headroom de margem para subsidiar o frete adicional que a cliente paga no
checkout.** Isso é sobre um número diferente do que decide o subsídio: o antecipado
(R$ 51,27) está quase empatado com o COD (R$ 52,35), não sobrando — subsidiar frete a
partir daqui reduziria a contribuição do antecipado para abaixo do COD outra vez. A tabela
de sensibilidade abaixo fica como registro histórico da régua que existia quando o
antecipado rendia mais.

| Teto para a cliente (histórico, com contribuição de R$ 70,21) | Custo real R$ 25 | Custo real R$ 40 | Custo real R$ 50 |
|---|---|---|---|
| R$ 20 | absorve R$ 5 → contrib. histórica R$ 65,21 | absorve R$ 20 → R$ 50,21 | absorve R$ 30 → R$ 40,21 |
| R$ 15 | absorve R$ 10 → R$ 60,21 | absorve R$ 25 → R$ 45,21 | absorve R$ 35 → R$ 35,21 |

**Divergência a medir, ainda válida:** o operador observa frete de R$ 30 a R$ 50; a Logzz
declara que o custo total por remessa "raramente passa de R$ 25". Pode ser diferença entre
o preço cobrado da cliente e o custo para nós, ou regiões específicas.

**Outras taxas confirmadas por fonte externa, ainda válidas:** handling fixo de **R$ 4,99**
por remessa · Entrega Express **+R$ 5,00** por entrega concluída, cobrada só do produtor ·
taxa de frustração declarada de **13% a 16%**, o que corrobora a premissa de 15% de recusa.

### 6. Cada pedido que migra de COD para antecipado agora custa quase o mesmo

> Esta seção passou por duas correções no mesmo dia (2026-09-21) — ver o topo do arquivo.

Com a contribuição vigente, o antecipado rende **R$ 51,27** contra **R$ 52,35** da média do
COD (já descontada a recusa de 15%) — **~R$ 1,08 a menos por pedido**, quase um empate.
Isso é bem diferente da conta original (antecipado "R$ 17,86 a mais") e também diferente da
primeira correção do dia (antecipado "R$ 7,13 a menos"): o corte do desconto de 15% para
10% recuperou a maior parte da diferença.

**O que isso significa para a decisão de Q8 e R2.1** (oferecer o antecipado com desconto
antes do fechamento do COD, `03-decisoes-tomadas.md`): com a diferença agora tão pequena
(~R$ 1,08), o argumento econômico contra manter o antecipado como upsell praticamente some.
O antecipado continua sem risco de recusa — isso nunca mudou — e agora rende quase o mesmo
por pedido. **Esta sessão não decidiu reabrir Q8/R2.1** — mas a pendência registrada em
§R10.5 fica mais fácil de resolver a favor de manter o antecipado como está.

## Confirmações do operador sobre as premissas

| # | Ponto | Resposta |
|---|---|---|
| D1 | `Físico na entrega` ativo na Coinzz? | **Sim, ativo.** A recusa custa −R$ 9,99 (corrigido em 2026-09-21; era −R$ 14,98), e o modelo está correto neste ponto |
| D2 | Desconto do pagamento antecipado | **10%** — R$ 116,91 (voltou de 15% em 2026-09-21; era 10% na rodada 1, subiu para 15% na rodada 2, voltou a 10% agora) |
| D3 | "Venda" no modelo é o quê? | **Pedido criado.** A meta de 10% é conversa → pedido criado, com os 15% de recusa aplicados depois |
| D4 | Contribuição do antecipado | **R$ 51,27** (recalculado em 2026-09-21 com o desconto de 10% — mesmas taxas do COD, sem taxa de frustração). A média com mix 70/30 é **R$ 52,03** |
