# venda-sem-dinheiro — concluída

- Porta: `local` — função do DISCO servida localmente, contra o banco de produção — prova o código que ainda não subiu
- Telefone sintético: `5500099636695` · execução `persona-2026-10-15T17-27-08-887Z-venda-sem-dinheiro`
- Fim: `persona_left`
- Estágio: `link_enviado` · custo: R$ 0.0226
- Gates que vetaram: `shipping_promise`

## Conversa

### Turno 1

**Cliente**: Oi amiga, boa noite! Vi o anúncio do colete modelador no insta, esse de pagar só quando receber é verdade mesmo?

**Malu** (`welcomed`):

> Recebi sua mensagem, já te respondo por aqui 💛

**Malu** (`ok`):

> Boa tarde, eu sou a Malu, da Encorpa!
> 
> É verdade sim, dependendo da sua região você não paga nada agora e paga só quando o colete chegar na sua mão.
> 
> Me passa seu CEP? Aí eu já vejo como fica aí na sua região e te explico o passo a passo

Bolhas (3):
1. Boa tarde, eu sou a Malu, da Encorpa!
2. É verdade sim, dependendo da sua região você não paga nada agora e paga só quando o colete chegar na sua mão.
3. Me passa seu CEP? Aí eu já vejo como fica aí na sua região e te explico o passo a passo

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0069 · acumulado: R$ 0.0069

### Turno 2

**Cliente**: Oi Malu! Que bom amiga. Meu cep é 41500-620, consegue ver pra mim?

**Malu** (`ok`):

> Obrigada por mandar, com esse CEP você confere no checkout se o pagamento na entrega atende aí e já escolhe o dia que prefere receber.
> 
> E pra eu te indicar o tamanho certo, que tamanho de calça você veste e fica confortável?

Bolhas (2):
1. Obrigada por mandar, com esse CEP você confere no checkout se o pagamento na entrega atende aí e já escolhe o dia que prefere receber.
2. E pra eu te indicar o tamanho certo, que tamanho de calça você veste e fica confortável?

- reescritas: 0 · estágio: `conversando` · custo do turno: R$ 0.0060 · acumulado: R$ 0.0129

### Turno 3

**Cliente**: Uso 48 amiga, que fica confortável. E me tira uma dúvida, se eu pedir hoje eu pago só quando chegar mesmo?

**Malu** (`ok`):

> Com 48 que fica confortável o seu é o GG, que é pra cintura de 84 a 92 cm
> 
> No seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Na entrega, chega em 1 a 3 dias, no dia que você escolhe
> 
> No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis. Qual das duas fica melhor pra você?

Bolhas (3):
1. Com 48 que fica confortável o seu é o GG, que é pra cintura de 84 a 92 cm
2. No seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. / Na entrega, chega em 1 a 3 dias, no dia que você escolhe
3. No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis. / Qual das duas fica melhor pra você?

- reescritas: 0 · estágio: `cobertura_conhecida` · custo do turno: R$ 0.0066 · acumulado: R$ 0.0195

### Turno 4

**Cliente**: amiga, to sem dinheiro agora, só dia 5 cai meu salário, dá pra reservar e eu pago na entrega quando chegar?

**Malu** (`ok`):

> Dá sim, você não paga nada agora e escolhe no checkout um dia bom pra você receber
> 
> Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
> 
> https://entrega.logzz.com.br/pay/ccm-1-unidade?phone=5500099636695
> Nesse link você completa o endereço, escolhe o dia e escolhe o GG

Bolhas (3):
1. Dá sim, você não paga nada agora e escolhe no checkout um dia bom pra você receber
2. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.
3. https://entrega.logzz.com.br/pay/ccm-1-unidade?phone=5500099636695 / Nesse link você completa o endereço, escolhe o dia e escolhe o GG

- reescritas: 1 · estágio: `link_enviado` · custo do turno: R$ 0.0032 · acumulado: R$ 0.0226
- Vetos: `shipping_promise` (promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence that names the prepaid offer, pix, the online card or the site unless it says the freight is calculated in the checkout there; the prepaid checkout charges freight by region | rascunho vetado: Não precisa ter dinheiro agora, pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber, e escolhe o dia no checkout.

https://entrega.logzz.com.br/pay/ccm-1-unidade?[dados]
Segue o link, lá você completa o endereço, escolhe o dia e escolhe o GG)

Custo da persona (muse-spark-1.3-contributor): R$ 0.0015
Limpeza: deleted
