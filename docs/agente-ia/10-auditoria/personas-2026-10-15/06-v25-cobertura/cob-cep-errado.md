# cob-cep-errado — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099883464` · execução `persona-2026-10-15T17-27-08-642Z-cob-cep-errado`
- Fim: `persona_finished`
- Estágio: `cobertura_conhecida` · custo: R$ 0.0264
- Gates que vetaram: `price_promise`, `shipping_promise`, `shipping_promise`, `shipping_promise`

## Conversa

### Turno 1

**Cliente**: oi vi o anuncio no insta, queria saber da calça

meu cep é 091109000

**Malu** (`ok`):

> Boa tarde! Eu sou a Malu, da Encorpa, e a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
> 
> Aqui a gente não tem calça, é só o colete mesmo, você consegue me mandar seu CEP de novo conferindo? O que chegou aqui foi com 9 números e o CEP tem 8

Bolhas (3):
1. Boa tarde! Eu sou a Malu, da Encorpa, e a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
2. Aqui a gente não tem calça, é só o colete mesmo, você consegue me mandar seu CEP de novo conferindo?
3. O que chegou aqui foi com 9 números e o CEP tem 8

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0067 · acumulado: R$ 0.0067

### Turno 2

**Cliente**: ops 99999-999

**Malu** (`ok`):

> Esse CEP não localizei, me manda com 8 números pra eu ver como fica aí na sua região?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0016 · acumulado: R$ 0.0084

### Turno 3

**Cliente**: agora sim 09110-900

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

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0060 · acumulado: R$ 0.0144

### Turno 4

**Cliente**: na verdade manda pro meu trabalho, cep 04710090

**Malu** (`ok`):

> Entendi, vai pro seu trabalho então, que tamanho de calça você veste e fica confortável?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0012 · acumulado: R$ 0.0156

### Turno 5

**Cliente**: e o primeiro cep q eu mandei vale tbm?

**Malu** (`ok`):

> Vale sim, dá pra usar qualquer um dos dois, qual você quer deixar pro pedido, o de casa ou o do trabalho?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0019 · acumulado: R$ 0.0175

### Turno 6

**Cliente**: veste 40 fica de boa

me fala como fica pra entregar no trabalho entao

**Malu** (`ok`):

> Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm, e dá pra entregar no trabalho sem problema
> 
> Qual das duas você prefere deixar, a entrega com pagamento quando recebe ou o antecipado com desconto?

Bolhas (2):
1. Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm, e dá pra entregar no trabalho sem problema
2. Qual das duas você prefere deixar, a entrega com pagamento quando recebe ou o antecipado com desconto?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0018 · acumulado: R$ 0.0193

### Turno 7

**Cliente**: mas no cep do trabalho fica quanto e chega quando? pode ser pagamento na entrega

Patricia Nogueira

**Malu** (`ok`):

> Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega.
> 
> Levando 3 peças vai para 20%: R$ 311,76 na entrega. Você quer deixar 1, 2 ou 3 peças?

Bolhas (2):
1. Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega.
2. Levando 3 peças vai para 20%: R$ 311,76 na entrega. Você quer deixar 1, 2 ou 3 peças?

- reescritas: 3 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0071 · acumulado: R$ 0.0264
- Vetos: `price_promise` (price R$ 311,76 belongs to another offer than the one this sentence names; say each offer in its own sentence | rascunho vetado: No do trabalho fica igual, pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber, e chega em 1 a 3 dias no dia que você escolhe

E levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega, e com 3 peças vai para 20%: R$ 311,76 na entrega

Você quer deixar 1, 2 ou 3 peças?); `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: No do trabalho fica igual, pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber, e chega em 1 a 3 dias no dia que você escolhe

E levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega, e com 3 peças vai para 20%: R$ 311,76 na entrega

Você quer deixar 1, 2 ou 3 peças?); `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: No do trabalho fica igual, chega em 1 a 3 dias no dia que você escolhe no checkout

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega. Levando 3 peças vai para 20%: R$ 311,76 na entrega. Você quer deixar 1, 2 ou 3 peças?); `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: No do trabalho fica igual, chega em 1 a 3 dias no dia que você escolhe no checkout.

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega. Levando 3 peças vai para 20%: R$ 311,76 na entrega. Você quer deixar 1, 2 ou 3 peças?)

Custo da persona (muse-spark-1.3-contributor): R$ 0.0036
Limpeza: deleted

## Alertas

- turno 7: 3 reescritas
