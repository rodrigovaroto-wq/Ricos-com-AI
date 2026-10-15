# cob-paga-na-porta-como — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099622930` · execução `persona-2026-10-15T17-27-08-642Z-cob-paga-na-porta-como`
- Fim: `persona_finished`
- Estágio: `link_enviado` · custo: R$ 0.0313
- Gates que vetaram: `coverage_claim`

## Conversa

### Turno 1

**Cliente**: oi boa tarde vi o anuncio no insta

é verdade que paga na entrega ne? como funciona isso

**Malu** (`ok`):

> Boa tarde! Sou a Malu, da Encorpa, e a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
> 
> É verdade sim, dependendo da sua região você não paga nada agora e paga só quando o colete chegar na sua mão, me passa seu CEP pra eu ver como fica aí na sua região?

Bolhas (2):
1. Boa tarde! Sou a Malu, da Encorpa, e a Encorpa vende o Colete Cinta Modeladora, que modela enquanto está vestido.
2. É verdade sim, dependendo da sua região você não paga nada agora e paga só quando o colete chegar na sua mão, me passa seu CEP pra eu ver como fica aí na sua região?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0060 · acumulado: R$ 0.0060

### Turno 2

**Cliente**: ata entendi mas paga como na porta ne?

aceita pix na hora ne? e cartao na maquininha?

vem pelo correio?

**Malu** (`ok`):

> Você paga na porta mesmo, pra quem entrega, e você escolhe a forma que deseja pagar na hora.
> 
> Não vem pelo correio, quem entrega e recebe é o entregador.
> 
> Me passa seu CEP pra eu ver como fica aí na sua região?

Bolhas (3):
1. Você paga na porta mesmo, pra quem entrega, e você escolhe a forma que deseja pagar na hora.
2. Não vem pelo correio, quem entrega e recebe é o entregador.
3. Me passa seu CEP pra eu ver como fica aí na sua região?

- reescritas: 1 · estágio: `conversando` · custo do turno: R$ 0.0119 · acumulado: R$ 0.0179
- Vetos: `coverage_claim` (affirms delivery reaches her before the region lookup answered | rascunho vetado: Paga na porta sim, pra quem entrega, e você escolhe a forma que deseja pagar na hora.

Não vem pelo correio, quem entrega e recebe é o entregador, e ele não espera provar, tá?

Me passa seu CEP pra eu ver se o pagamento na entrega chega aí na sua região?)

### Turno 3

**Cliente**: ata e se eu nao tiver o dinheiro na hora ele volta outro dia? fica como

tem boleto?

**Malu** (`ok`):

> Se não tiver ninguém em casa na hora, o entregador leva de volta pro centro de distribuição e a entrega não acontece, então o ideal é escolher um dia que você vai estar em casa.
> 
> Boleto não tem, o pagamento é na entrega ou no pix e no cartão no checkout.
> 
> Você pensou em usar o nosso colete com qual roupa?

Bolhas (3):
1. Se não tiver ninguém em casa na hora, o entregador leva de volta pro centro de distribuição e a entrega não acontece, então o ideal é escolher um dia que você vai estar em casa.
2. Boleto não tem, o pagamento é na entrega ou no pix e no cartão no checkout.
3. Você pensou em usar o nosso colete com qual roupa?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0005 · acumulado: R$ 0.0184

### Turno 4

**Cliente**: entendi mas o entregador espera eu descer ne?

eu uso 46 fica bom ne? me manda o link pra ver

**Malu** (`ok`):

> Com 46 de calça o seu é o GG, que é pra cintura de 84 a 92 cm, e ele modela bem nessa faixa.
> 
> O entregador não espera, então é bom deixar tudo pronto pra receber na hora.
> 
> Me passa seu CEP pra eu ver como fica a entrega e o pagamento aí na sua região?

Bolhas (3):
1. Com 46 de calça o seu é o GG, que é pra cintura de 84 a 92 cm, e ele modela bem nessa faixa.
2. O entregador não espera, então é bom deixar tudo pronto pra receber na hora.
3. Me passa seu CEP pra eu ver como fica a entrega e o pagamento aí na sua região?

- reescritas: 0 · estágio: `tamanho_definido` · custo do turno: R$ 0.0069 · acumulado: R$ 0.0253

### Turno 5

**Cliente**: ah entendi GG ne

meu cep é 18035000 manda o link ai pra eu ver

**Malu** (`ok`):

> Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado, que sai com 10% de desconto: R$ 116,91.
> 
> No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver se não gostar.
> 
> Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, e 3 peças sai por R$ 272,79, quer levar 1, 2 ou 3 peças?

Bolhas (3):
1. Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado, que sai com 10% de desconto: R$ 116,91.
2. No antecipado o frete é calculado por região no checkout, e o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver se não gostar.
3. Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, e 3 peças sai por R$ 272,79, quer levar 1, 2 ou 3 peças?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0024 · acumulado: R$ 0.0277

### Turno 6

**Cliente**: ata mas eu queria pagar na entrega ne nao tem jeito?

manda o link assim mesmo pra eu ver?

**Malu** (`ok`):

> Não tem outro jeito por aí, é só no antecipado mesmo, com 10% de desconto: R$ 116,91.
> https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?phone=00099622930
> lá você completa o endereço e escolhe o GG

- reescritas: 0 · estágio: `link_enviado` · custo do turno: R$ 0.0024 · acumulado: R$ 0.0300

### Turno 7

**Cliente**: ta bom vou olhar aqui

**Malu** (`ok`):

> Sem problemas, fica à vontade pra olhar com calma.
> 
> Estou aqui se tiver mais alguma dúvida.

Bolhas (2):
1. Sem problemas, fica à vontade pra olhar com calma.
2. Estou aqui se tiver mais alguma dúvida.

- reescritas: 0 · estágio: `link_enviado` · custo do turno: R$ 0.0013 · acumulado: R$ 0.0313

Custo da persona (muse-spark-1.3-contributor): R$ 0.0048
Limpeza: deleted

## Alertas

- CEP pedido 3 vezes
