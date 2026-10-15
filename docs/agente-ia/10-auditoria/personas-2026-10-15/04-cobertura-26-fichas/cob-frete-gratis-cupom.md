# cob-frete-gratis-cupom — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099933564` · execução `persona-2026-10-15T15-55-09-632Z-cob-frete-gratis-cupom`
- Fim: `persona_finished`
- Estágio: `cobertura_conhecida` · custo: R$ 0.0104
- Gates que vetaram: `coupon_exists`, `shipping_promise`, `shipping_promise`, `coverage_claim`, `coverage_claim`

## Conversa

### Turno 1

**Cliente**: oi, vi o anuncio no insta

frete gratis pra manaus?? e tem cupom de primeira compra?

**Malu** (`welcomed`):

> Recebi sua mensagem, já te respondo por aqui 💛

**Malu** (`ok`):

> Boa tarde, sou a Malu, da Encorpa! A Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
> 
> Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
> 
> Não temos cupom no momento, e pra eu ver se chega aí me passa seu CEP?

Bolhas (3):
1. Boa tarde, sou a Malu, da Encorpa! A Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
2. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
3. Não temos cupom no momento, e pra eu ver se chega aí me passa seu CEP?

- reescritas: 2 · estágio: `conversando` · custo do turno: R$ 0.0044 · acumulado: R$ 0.0044
- Vetos: `coupon_exists` (mentions a coupon that is not active in Coinzz yet | rascunho vetado: Boa tarde, eu sou a Malu, da Encorpa! A Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido, e sobre cupom a gente não tem no momento.

Aí pra Manaus depende da sua região. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Me passa seu CEP pra eu ver como fica aí?); `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: Boa tarde, sou a Malu, da Encorpa! A Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.

Aí pra Manaus depende da sua região, pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

Me passa seu CEP pra eu ver como fica aí pra você?)

### Turno 2

**Cliente**: ah entendi

mas la no insta falaram frete grátis pra todo brasil, nao é?

tipo pagando no pix tbm?

**Malu** (`ok`):

> No pix não, no antecipado o frete é calculado por região no checkout, e o valor aparece pra você no checkout antes de pagar.
> 
> Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
> 
> Me passa seu CEP? Aí eu vejo como fica o pagamento aí na sua região.

Bolhas (3):
1. No pix não, no antecipado o frete é calculado por região no checkout, e o valor aparece pra você no checkout antes de pagar.
2. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
3. Me passa seu CEP? Aí eu vejo como fica o pagamento aí na sua região.

- reescritas: 2 · estágio: `conversando` · custo do turno: R$ 0.0040 · acumulado: R$ 0.0084
- Vetos: `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: Não é pra todo Brasil no pix, o grátis vale pro pagamento na entrega porque o entregador já vai até você.

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91. Me passa seu CEP? Aí eu vejo se a entrega chega aí pra você); `coverage_claim` (affirms delivery reaches her before the region lookup answered | rascunho vetado: Não é pra todo Brasil no pix, o grátis vale pro pagamento na entrega porque o entregador já vai até você.

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91. Me passa seu CEP? Aí eu vejo se a entrega chega aí pra você); `coverage_claim` (affirms delivery reaches her before the region lookup answered | rascunho vetado: Não é não, no pix o frete é calculado por região no checkout

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

Me passa seu CEP? Aí eu vejo se a entrega chega aí pra você)

### Turno 3

**Cliente**: ta, entendi

meu cep 69050-000

**Malu** (`ok`):

> Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado, que sai com 10% de desconto: R$ 116,91.
> 
> No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis. E você tem 7 dias após o recebimento pra devolver se não gostar.
> 
> Que tamanho de calça você veste e fica confortável?

Bolhas (3):
1. Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado, que sai com 10% de desconto: R$ 116,91.
2. No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis.
3. E você tem 7 dias após o recebimento pra devolver se não gostar. / Que tamanho de calça você veste e fica confortável?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0016 · acumulado: R$ 0.0100

### Turno 4

**Cliente**: 38

mas ai sem frete gratis pra mim nao compensa, vou deixar pra depois valeu

**Malu** (`ok`):

> Sem problemas, estou aqui se tiver mais alguma dúvida 💛 No antecipado você ganha 10% de desconto: R$ 116,91, e o prazo varia por região, em média 5 dias úteis. Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.

Bolhas (2):
1. Sem problemas, estou aqui se tiver mais alguma dúvida 💛 No antecipado você ganha 10% de desconto: R$ 116,91, e o prazo varia por região, em média 5 dias úteis.
2. Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0004 · acumulado: R$ 0.0104
- Motivo: ela vai pensar: resposta fixa e link

Custo da persona (muse-spark-1.3-contributor): R$ 0.0022
Limpeza: deleted
