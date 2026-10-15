# cob-cep-errado — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099461489` · execução `persona-2026-10-15T15-55-09-632Z-cob-cep-errado`
- Fim: `persona_finished`
- Estágio: `cobertura_conhecida` · custo: R$ 0.0217
- Gates que vetaram: `shipping_promise`

## Conversa

### Turno 1

**Cliente**: oi vi o anuncio no insta

é pra comprar como?

**Malu** (`ok`):

> Boa tarde, eu sou a Malu, da Encorpa, a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
> 
> É por aqui mesmo, eu te ajudo! Que tamanho de calça você veste e fica confortável?

Bolhas (2):
1. Boa tarde, eu sou a Malu, da Encorpa, a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
2. É por aqui mesmo, eu te ajudo! Que tamanho de calça você veste e fica confortável?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0061 · acumulado: R$ 0.0061

### Turno 2

**Cliente**: meu cep é 091109000

**Malu** (`ok`):

> Você consegue conferir seu CEP pra mim, parece que veio com um número a mais?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0017 · acumulado: R$ 0.0077

### Turno 3

**Cliente**: ops 99999-999

**Malu** (`ok`):

> Obrigada, e qual tamanho de calça você veste e fica confortável?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0008 · acumulado: R$ 0.0086

### Turno 4

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

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0018 · acumulado: R$ 0.0104

### Turno 5

**Cliente**: na verdade manda pro meu trabalho, cep 04710090

**Malu** (`ok`):

> Combinado, deixamos pra entregar no seu trabalho, o checkout confirma a entrega lá quando você digitar esse CEP.
> 
> Qual das duas formas que te mostrei fica melhor pra você?

Bolhas (2):
1. Combinado, deixamos pra entregar no seu trabalho, o checkout confirma a entrega lá quando você digitar esse CEP.
2. Qual das duas formas que te mostrei fica melhor pra você?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0015 · acumulado: R$ 0.0119

### Turno 6

**Cliente**: e o primeiro cep que eu mandei vale tbm?

**Malu** (`ok`):

> Vale sim, você digita no checkout o CEP de onde prefere receber e ele confirma na hora.

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0011 · acumulado: R$ 0.0130

### Turno 7

**Cliente**: ta e no cep do trabalho fica como? entrega e preço

ah visto 40

**Malu** (`ok`):

> Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm.
> 
> Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
> 
> No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91. Qual das duas fica melhor pra você?

Bolhas (3):
1. Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm.
2. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
3. No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91. Qual das duas fica melhor pra você?

- reescritas: 1 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0077 · acumulado: R$ 0.0207
- Vetos: `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm.

Nesse CEP do trabalho o checkout confirma na hora se chega e como fica, você digita lá o [cep].

Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber, e no antecipado tem 10% de desconto e sai por R$ 116,91, com o frete calculado por região no checkout.)

### Turno 8

**Cliente**: entendi blz

depois te chamo aqui então

**Malu** (`ok`):

> Sem problemas, estou aqui se tiver mais alguma dúvida 💛 Pagando na entrega você não paga nada agora, e depois de receber ainda tem 7 dias pra devolver sem custo nenhum. Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.

Bolhas (2):
1. Sem problemas, estou aqui se tiver mais alguma dúvida 💛 Pagando na entrega você não paga nada agora, e depois de receber ainda tem 7 dias pra devolver sem custo nenhum.
2. Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0010 · acumulado: R$ 0.0217
- Motivo: ela vai pensar: resposta fixa e link

Custo da persona (muse-spark-1.3-contributor): R$ 0.0047
Limpeza: deleted
