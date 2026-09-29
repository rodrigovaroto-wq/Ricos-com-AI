# Decisões firmes — não reabrir

Decisões já tomadas pelo operador, com conhecimento de causa. Uma sessão nova não deve
reabrir nenhuma delas por conta própria; deve **projetar em volta**.

Fonte: `colet-cinta-modeladora` — `docs/contexto-do-projeto.md` §3, `HANDOFF.md`
§"Decisões recentes do operador", `docs/agente-whatsapp.md`.

## 1. Há CNPJ — o canal é o WhatsApp Cloud API oficial

**Corrigido em 2026-09-21.** Uma versão anterior deste arquivo registrava "não há CNPJ e
não haverá" e hipotetizava que isso eliminaria a Cloud API oficial, restando só
transportes não oficiais (WAHA). **A operação tem CNPJ.** Confirmado pelo operador.

**Decisão vigente:** o canal é o **WhatsApp Cloud API** (Meta), não um transporte não
oficial. Isso elimina a necessidade de pacing anti-banimento e de manter um processo de
sessão vivo 24/7 (o motivo original do pod na PikaPods para o WAHA). Ver
[`CLAUDE.md`](../../../CLAUDE.md) §Stack para o estado atual da migração.

## 2. Não afirmar "nada de PIX antes da entrega"

Enquanto o checkout da Coinzz emitir PIX imediato, o agente **não pode** dizer que não
haverá cobrança antes da entrega. O site já cometeu esse erro: prometeu pagar na entrega
enquanto o checkout emitia PIX, e isso explica 2 de 3 PIX expirados e aprovação em 33%.

Esta é a regra que mais justifica um guardrail executável em vez de instrução no prompt.

## 3. O produto não emagrece, e isso se diz em voz alta

Ver [`01-produto-e-oferta.md`](01-produto-e-oferta.md). Não reverter.

## 4. Volume de vendas: 500+, em todos os lugares

Número único, usado no site inteiro.

## 5. Contador de escassez: 1 dia e 8 horas, por visitante, continuando de onde parou

Um contador que reinicia sozinho se desmente na frente de quem voltou — que é justamente
quem estava considerando comprar.

## 6. Tom de voz do agente

Definido pelo operador em `docs/agente-whatsapp.md`:

- O agente pode ser **mais direto que o site** — persuasivo.
- **Só fala verdades**, com omissões permitidas dentro dessas verdades.
- **Nunca prometer o que a operação não cumpre.**

## 7. Depoimentos são reconstruções

Houve clientes reais, mas o contato foi perdido. O aviso legal do rodapé descreve isso
corretamente e **não** afirma que são reproduções autorizadas. O agente não deve
apresentá-los como depoimentos verificados nem inventar novos.

## 8. As três funções do agente

Definidas pelo operador. Eram quatro; a de **cobrar quem não pagou deixou de existir** na
rodada 2, porque com o `Físico na entrega` ativo o entregador cobra na porta — ou ela paga e
recebe, ou recusa e não recebe. Não há estado de "entregue e não pago".

1. Atender quem chega com dúvida antes de comprar
2. Recuperar carrinho abandonado
3. **Confirmar o pedido depois da compra e acompanhar até a entrega**

O que a função 3 precisa produzir na cliente:

- Que ela se sinta **bem por ter comprado com a gente** — não arrependida
- Que ela se sinta **segura de que o pedido vai chegar**, porque tem alguém em contato
- Que a mensagem seja **calorosa, não protocolar**

Momentos que a sequência precisa cobrir:

| Quando | Do que trata |
|---|---|
| Logo após o pedido | Confirmar tamanho e endereço, apresentar-se, virar um contato salvo |
| Durante o trajeto | Um sinal de vida, para ela não esquecer que comprou |
| Véspera da entrega | Avisar o dia, lembrar do valor e das formas de pagamento |
| Depois de receber | Perguntar se serviu, ensinar o primeiro uso, pedir foto/depoimento |

## Pendências do operador que travam decisões técnicas

Estado em 2026-09-04. Ver [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md).

- [x] **`Físico na entrega` ativo na Coinzz** — confirmado. A recusa custa −R$ 14,98 *(Desde 2026-09-25 o checkout da entrega é a Logzz; a Coinzz ficou com o antecipado.)*
- [x] **Número decidido:** número novo, separado do site — a criar
- [x] **Handoff decidido:** a agente para e notifica; o operador assume, exceto de madrugada
- [ ] Configurar o **desconto de 10%** (R$ 116,91) no pagamento antecipado, e só então ligar `PREPAY_DISCOUNT` (hoje em 5% e desligado). *Era 15% até 2026-09-21, quando voltou a 10% — ver [`06-modelo-economico.md`](06-modelo-economico.md).*
- [ ] Criar o **cupom de 20%** do toque 3 do follow-up
- [ ] Separar pedido criado de pedido pago no pixel
- [ ] Configurar `/obrigado.html` como destino pós-compra na Coinzz
- [x] **Confirmado: a Coinzz tem API própria, além do webhook.** A API gera o checkout personalizado pré-preenchido; o webhook cobre o status do pedido para o acompanhamento pós-venda
- [x] **Horário do agente definido:** mensagem automática 24/7 + agente real das 06:00 às 00:00 (3 min depois, ou às 06:00 se chegou de madrugada)
- [x] **Frete Personalizado da Logzz confirmado que existe — decidido não usar.** Mantém 15% de desconto no antecipado, frete por conta da cliente, sem programa de subsídio. *Atualizado: o desconto voltou a 10% (R$ 116,91) em 2026-09-21; o frete continua por conta da cliente, calculado por região no checkout. Corrigido em 2026-09-22: a operação não oferece frete grátis em nenhum dos dois caminhos. **Superado em parte em 2026-09-28 (R15.3):** no pagamento na entrega (Logzz) o frete é grátis para ela e a agente diz isso; no antecipado (Coinzz) continua calculado por região no checkout, nunca grátis.*
- [x] **CNPJ confirmado (2026-09-21)** — canal é o WhatsApp Cloud API oficial, não WAHA. Ver item 1 acima.
