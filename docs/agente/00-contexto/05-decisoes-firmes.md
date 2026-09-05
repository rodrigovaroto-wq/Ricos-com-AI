# Decisões firmes — não reabrir

Decisões já tomadas pelo operador, com conhecimento de causa. Uma sessão nova não deve
reabrir nenhuma delas por conta própria; deve **projetar em volta**.

Fonte: `colet-cinta-modeladora` — `docs/contexto-do-projeto.md` §3, `HANDOFF.md`
§"Decisões recentes do operador", `docs/agente-whatsapp.md`.

## 1. Não há CNPJ e não haverá

Decisão tomada com conhecimento da exigência legal. Assunto encerrado.

**Consequência técnica a considerar, não a discutir:** a API oficial do WhatsApp (Cloud
API) exige verificação de negócio. **[HIPÓTESE]** isso provavelmente elimina o canal
oficial e deixa apenas transportes não oficiais — o que torna pacing anti-banimento
obrigatório em vez de opcional. Precisa ser validado contra as exigências atuais da Meta
antes de virar conclusão.

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

Estado em 2026-09-04. Ver [`../04-decisoes/03-decisoes-tomadas.md`](../04-decisoes/03-decisoes-tomadas.md).

- [x] **`Físico na entrega` ativo na Coinzz** — confirmado. A recusa custa −R$ 14,98
- [x] **Número decidido:** número novo, separado do site — a criar
- [x] **Handoff decidido:** a agente para e notifica; o operador assume, exceto de madrugada
- [ ] Configurar o **desconto de 15%** no pagamento antecipado, e só então ligar `PREPAY_DISCOUNT` (hoje em 5% e desligado)
- [ ] Criar o **cupom de 20%** do toque 3 do follow-up
- [ ] Separar pedido criado de pedido pago no pixel
- [ ] Configurar `/obrigado.html` como destino pós-compra na Coinzz
- [x] **Confirmado: a Coinzz tem API própria, além do webhook.** A API gera o checkout personalizado pré-preenchido; o webhook cobre o status do pedido para o acompanhamento pós-venda
- [x] **Horário do agente definido:** mensagem automática 24/7 + agente real das 06:00 às 00:00 (3 min depois, ou às 06:00 se chegou de madrugada)
- [x] **Frete Personalizado da Logzz confirmado que existe — decidido não usar.** Mantém 15% de desconto no antecipado, frete por conta da cliente, sem programa de subsídio
