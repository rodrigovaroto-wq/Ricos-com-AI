# cob-paga-na-porta-como — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099156348` · execução `persona-2026-10-15T15-55-09-632Z-cob-paga-na-porta-como`
- Fim: `persona_finished`
- Estágio: `cobertura_conhecida` · custo: R$ 0.0284
- Gates que vetaram: `coverage_claim`, `charge_promise`

## Conversa

### Turno 1

**Cliente**: oi vi o anuncio no insta

é verdade q da pra pagar so quando chegar ai ne?

**Malu** (`ok`):

> Boa tarde! Sou a Malu, da Encorpa
> 
> É verdade sim, na maioria das regiões dá pra pagar só quando o colete chegar na sua mão. Me passa seu CEP? Aí eu já vejo como fica aí na sua região

Bolhas (3):
1. Boa tarde! Sou a Malu, da Encorpa
2. É verdade sim, na maioria das regiões dá pra pagar só quando o colete chegar na sua mão. Me passa seu CEP?
3. Aí eu já vejo como fica aí na sua região

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0063 · acumulado: R$ 0.0063

### Turno 2

**Cliente**: ah legal

mas aceita pix na hora ne? e cartao na maquininha?

o entregador espera eu descer?

**Malu** (`ok`):

> Na maioria das regiões você escolhe a forma que deseja pagar na hora, então dá pra combinar do jeito que ficar melhor pra você
> 
> O entregador não espera provar, então o ideal é escolher uma data em que você vai estar em casa pra receber e pagar ali mesmo
> 
> Me passa seu CEP? Pelo seu CEP eu vejo se chega aí com pagamento na entrega

Bolhas (3):
1. Na maioria das regiões você escolhe a forma que deseja pagar na hora, então dá pra combinar do jeito que ficar melhor pra você
2. O entregador não espera provar, então o ideal é escolher uma data em que você vai estar em casa pra receber e pagar ali mesmo
3. Me passa seu CEP? Pelo seu CEP eu vejo se chega aí com pagamento na entrega

- reescritas: 1 · estágio: `conversando` · custo do turno: R$ 0.0127 · acumulado: R$ 0.0190
- Vetos: `coverage_claim` (affirms delivery reaches her before the region lookup answered | rascunho vetado: Você escolhe a forma que deseja pagar na hora, então dá pra combinar do jeito que ficar melhor pra você

A entrega é no seu endereço, mas o entregador não espera provar, você recebe e paga ali mesmo

Me passa seu CEP pra eu ver se aí na sua região tem pagamento na entrega?)

### Turno 3

**Cliente**: tem boleto?

vem pelo correio?

se eu nao tiver o dinheiro na hora ele volta outro dia?

**Malu** (`ok`):

> Boleto não tem, no antecipado o pagamento é no pix ou no cartão e no pagamento na entrega você escolhe a forma que deseja pagar
> 
> No pagamento na entrega não vem pelo correio, quem entrega e recebe é o entregador
> 
> Se não tiver ninguém em casa ele leva o pedido de volta pro centro de distribuição e a entrega não acontece, então vale deixar o valor separado no dia que você escolher

Bolhas (3):
1. Boleto não tem, no antecipado o pagamento é no pix ou no cartão e no pagamento na entrega você escolhe a forma que deseja pagar
2. No pagamento na entrega não vem pelo correio, quem entrega e recebe é o entregador
3. Se não tiver ninguém em casa ele leva o pedido de volta pro centro de distribuição e a entrega não acontece, então vale deixar o valor separado no dia que você escolher

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0011 · acumulado: R$ 0.0200

### Turno 4

**Cliente**: entendi

meu cep é 18035000

eu quero o 46 na entrega pode ser?

**Malu** (`ok`):

> Com 46 o seu é o GG, que é pra cintura de 84 a 92 cm
> 
> Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado com 10% de desconto por R$ 116,91. No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver se não gostar
> 
> Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, e 3 peças sai por R$ 272,79. Quer ficar com 1, 2 ou 3 peças?

Bolhas (3):
1. Com 46 o seu é o GG, que é pra cintura de 84 a 92 cm / Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado com 10% de desconto por R$ 116,91.
2. No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver se não gostar
3. Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, e 3 peças sai por R$ 272,79. Quer ficar com 1, 2 ou 3 peças?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0023 · acumulado: R$ 0.0223

### Turno 5

**Cliente**: ata mas eu queria pagar na entrega ne

nao tem jeito nao? me manda o link ai pra eu ver

**Malu** (`ok`):

> Não tem jeito por aí, é só o antecipado mesmo porque a transportadora ainda não liberou esse caminho na sua região
> 
> Pra eu deixar o pedido no seu nome, me passa seu nome completo por favor?

Bolhas (2):
1. Não tem jeito por aí, é só o antecipado mesmo porque a transportadora ainda não liberou esse caminho na sua região
2. Pra eu deixar o pedido no seu nome, me passa seu nome completo por favor?

- reescritas: 1 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0028 · acumulado: R$ 0.0252
- Vetos: `charge_promise` (promises payment at the door where she only has the prepaid path, and pays in the checkout | rascunho vetado: Entendo querer pagar só quando receber, aí na sua região não consigo liberar esse caminho, só o antecipado mesmo

Pra eu deixar o pedido no seu nome, me passa seu nome completo por favor?)

### Turno 6

**Cliente**: meu nome? eh pra q ne

so manda o link do tamanho q eu vejo la

**Malu** (`ok`):

> É só pra deixar o pedido no seu nome, não vai pra outro lugar
> 
> Qual seu nome completo?

Bolhas (2):
1. É só pra deixar o pedido no seu nome, não vai pra outro lugar
2. Qual seu nome completo?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0019 · acumulado: R$ 0.0271

### Turno 7

**Cliente**: então deixa se nao tem na entrega nao quero nao obrigada

**Malu** (`ok`):

> Sem problemas, fico por aqui se precisar de alguma coisa

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0013 · acumulado: R$ 0.0284

Custo da persona (muse-spark-1.3-contributor): R$ 0.0044
Limpeza: deleted
