# venda-com-pressa — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099124475` · execução `persona-2026-10-15T15-55-09-599Z-venda-com-pressa`
- Fim: `persona_left`
- Estágio: `cobertura_conhecida` · custo: R$ 0.0106
- Gates que vetaram: `shipping_promise`

## Conversa

### Turno 1

**Cliente**: Oi, vi o anúncio do colete modelador, ainda tem disponível?

**Malu** (`ok`):

> Boa tarde! Sou a Malu, da Encorpa
> 
> Você viu o colete modelador, né? Me passa seu CEP, por favor? Aí eu já vejo como ficam a entrega e o pagamento aí na sua região
> 

Bolhas (2):
1. Boa tarde! Sou a Malu, da Encorpa
2. Você viu o colete modelador, né? Me passa seu CEP, por favor? Aí eu já vejo como ficam a entrega e o pagamento aí na sua região

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0015 · acumulado: R$ 0.0015

### Turno 2

**Cliente**: É 06149290. E chega até sábado?

**Malu** (`ok`):

> No seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Na entrega, chega em 1 a 3 dias, no dia que você escolhe.
> 
> No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis.
> 
> Qual das duas fica melhor pra você?

Bolhas (3):
1. No seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
2. Na entrega, chega em 1 a 3 dias, no dia que você escolhe.
3. No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis. / Qual das duas fica melhor pra você?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0065 · acumulado: R$ 0.0080

### Turno 3

**Cliente**: resume pra mim, to sem tempo

**Malu** (`ok`):

> Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
> 
> No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91.
> 
> Qual das duas fica melhor pra você?

Bolhas (3):
1. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
2. No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91.
3. Qual das duas fica melhor pra você?

- reescritas: 1 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0026 · acumulado: R$ 0.0106
- Vetos: `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: Na entrega R$ 129,90 com frete grátis, no antecipado R$ 116,91 mais frete, qual prefere?)

Custo da persona (muse-spark-1.3-contributor): R$ 0.0009
Limpeza: deleted
