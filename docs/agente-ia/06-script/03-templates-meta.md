# Templates da Meta: os três toques fora da janela de 24h

> Redigido em 2026-09-22. **Status:** rascunho pronto para submeter. Nenhum dos três foi
> enviado para aprovação ainda.
>
> Contexto: [`HANDOFF.md` §Frente 2](../../../HANDOFF.md). O código já está pronto e
> **bloqueia de propósito** todo toque fora da janela sem template declarado
> (`deliveryFor` em [`src/agent/followups.ts`](../../../src/agent/followups.ts)).

---

## Por que existem, e a regra que amarra os três

Pelo WhatsApp Cloud API, texto livre só sai até 24h depois da **última mensagem dela**.
Fora disso, só sai template aprovado pela Meta. Três toques da régua caem fora da janela:

| Toque | Quando | Por que precisa de template |
|---|---|---|
| `silence_2` | manhã seguinte, 09:00 | fora da janela quando ela parou de madrugada ou cedo |
| `silence_3` | três dias depois | sempre fora |
| `order_eve` | véspera da entrega: só com a data no pedido (`scheduled_for`), às 10h do dia anterior (2026-09-29) | o pedido pode chegar por webhook de quem nunca escreveu, então não há janela nenhuma |

**A regra que amarra os três:** o template diz **a mesma coisa** que `renderFollowup`
escreve hoje, palavra por palavra. A varredura roda a cadeia de gates sobre o texto livre
de `renderFollowup`, **não sobre o template**. Quem chega à cliente é o texto aprovado na
Meta. Se os dois divergirem, o texto que ela lê é um texto que nenhum gate leu. Mudou um,
muda o outro, e submete de novo.

Única diferença permitida: negrito. O WhatsApp usa `*asterisco simples*`; o texto livre do
código usa `**duplo**`. O conteúdo é o mesmo.

---

## 1. `silence_2`: a objeção que ela não disse

| Campo | Valor |
|---|---|
| Nome sugerido | `encorpa_retomada_confianca` |
| Categoria | `MARKETING`, **suposição**: é retomada de quem não comprou, e a Meta classifica reengajamento como marketing. Se submeter como `UTILITY`, a Meta reclassifica ou recusa |
| Idioma | `pt_BR` |

**Corpo:**

```text
Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem {{1}} dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.
```

| Placeholder | Variável do código | Exemplo para a submissão |
|---|---|---|
| `{{1}}` | `warrantyDays` | `7` |

> **Corpo reescrito em 2026-09-29 (D4 do cruzamento; decisões do operador Q3 e Q4).** O texto
> anterior dizia "você vê, veste, e só paga se estiver tudo certo" — o entregador **não espera**
> ela vestir antes de pagar (Q4). O verdadeiro: ela vê, paga ao entregador na hora, não fica com
> o que não for o esperado, e depois de receber tem {{1}} dias para devolver com o frete de volta
> por conta da loja (Q3). **Se o corpo antigo já foi submetido à Meta, ele tem de ser submetido
> de novo** com este texto; declarar o nome antigo aprovado no `BUSINESS_CONFIG` faria a Meta
> entregar a ela o texto que nenhum gate leu.
>
> **Só no caminho da entrega.** Este corpo fala de pagar ao entregador. Para quem está no caminho
> antecipado (escolheu, ou a praça dela não tem pagamento na entrega — D3), `renderFollowup`
> escreve outro texto e `deliveryFor` **bloqueia** o toque fora da janela (`no_template`): não há
> template do antecipado, e mandar este seria dizer a ela que paga na porta.

**Uma variante só.** Dentro da janela, `pickVariant` alterna entre duas versões do toque
2. Fora dela, a config aceita um template por toque, então vale só a primeira, que é a
do script (Estágio 8). A segunda ("o colete não muda o seu corpo…") não foi transformada
em template: ela chega perto do tema de corpo, e é aí que a revisão de marketing da Meta
é mais rígida. Pode ser submetida depois, se a primeira for aprovada.

> **Decidido pelo operador em 2026-09-28: (a).** Entra no código depois do merge do PR #37.
>
> **A segunda variante (achado de 2026-09-28,
> `tests/whatsapp-templates.test.ts`).** Fora da janela, metade das leads (por
> `pickVariant(leadId, [0, 1])`) tem a segunda variante como texto livre, mas só a
> primeira existe como template — então para essas leads o gate leu um texto e a
> Meta manda outro. Duas saídas, não uma:
>
> - **(a) Fora da janela, sempre a primeira variante.** Muda `deliveryFor` para não
>   chamar `pickVariant` quando o envio é por template — nenhum template novo.
> - **(b) Submeter a segunda variante como um segundo template `MARKETING`.** Mantém
>   a alternância também fora da janela, mas herda o mesmo risco de revisão mais
>   rígida já citado acima (tema de corpo), com mais um template para manter.
>
> **Recomendação: (a).** É uma linha de código, sem submissão nova, e a alternância
> de variante existe para não repetir a mesma frase para quem está dentro da janela —
> fora dela, uma frase aprovada é melhor do que nenhuma.

---

## 2. `silence_3`: o cupom, com saída digna

| Campo | Valor |
|---|---|
| Nome sugerido | `encorpa_cupom_super_dia` |
| Categoria | `MARKETING`. Oferta de desconto é marketing sem ambiguidade |
| Idioma | `pt_BR` |

**Corpo:**

```text
*Super {{1}}!* 🎉 Separei um cupom de *{{2}}% de desconto* pra você — e ele vale nos dois jeitos: pagando na entrega ou antecipado.

Se quiser, eu monto o pedido agora com o desconto já aplicado. E se não for o momento, tudo bem também — é só me falar que eu não te mando mais nada 💛
```

| Placeholder | Variável do código | Exemplo para a submissão |
|---|---|---|
| `{{1}}` | `weekday` | `Quinta` |
| `{{2}}` | `couponPercent` | `20` |

**Fica mudo até o cupom existir na Coinzz.** `renderFollowup` devolve `null` para
`silence_3` enquanto `coupon.active` não for verdadeiro, e a varredura cancela o toque.
Isso é de propósito: anunciar cupom que não existe é a promessa quebrada que este projeto
decidiu nunca fazer. **O template pode ser aprovado antes.** Aprovar não liga nada; quem
liga é o cupom existir e `coupon.active` virar `true`.

O off-ramp está no próprio texto ("é só me falar que eu não te mando mais nada"). O botão
"Parar promoções" que a Meta oferece para marketing **não** foi incluído: o código não envia
componente de botão, e um template com botão exigiria mudar `deliveryFor` e quem envia.

---

## 3. `order_eve`: a véspera que evita a recusa

| Campo | Valor |
|---|---|
| Nome sugerido | `encorpa_vespera_entrega` |
| Categoria | `UTILITY`: atualização de um pedido que já existe, sem oferta nenhuma |
| Idioma | `pt_BR` |

**Corpo:**

```text
Oi! Sua entrega está marcada pra *amanhã* 💛
Deixa *{{1}}* separado — pode ser dinheiro ou cartão, na maquininha do entregador.
Se você não estiver em casa amanhã, me avisa que eu tento remarcar.
```

| Placeholder | Variável do código | Exemplo para a submissão |
|---|---|---|
| `{{1}}` | `price` | `R$ 129,90` |

**Diferença em relação ao exemplo do HANDOFF:** lá, `order_eve` aparece com
`["price", "size"]`. Aqui ficou só `["price"]`, por dois motivos:

1. O texto de hoje não fala tamanho. Pôr o tamanho no template seria o template dizer uma
   coisa que o gate nunca leu.
2. `deliveryFor` **bloqueia** o toque quando um placeholder resolve vazio. Lead sem `size`
   gravado perderia justamente o toque que salva a margem, e o motivo seria só o tamanho
   que o template pediu.

Se o operador quiser o tamanho na véspera, a mudança começa em `renderFollowup`, não aqui.

> **⚠ Não submeter este corpo sozinho (achado de 2026-09-28, `tests/whatsapp-templates.test.ts`).**
> Para pedido **antecipado**, `renderFollowup` tira a linha "Deixa {{1}} separado", porque ela
> já pagou; este template manda a linha sempre. Declarado como está, a cliente que pagou no
> Pix recebe na véspera "Deixa R$ 129,90 separado", um texto que nenhum gate leu. O conserto
> pede duas coisas: um segundo template sem a linha do valor (rascunho na seção 4, abaixo) e
> o código escolhendo entre os dois e passando pelo gate o texto do template, não o texto
> livre. Até lá, o teste guarda a divergência com `it.fails`.
>
> O mesmo teste guarda uma segunda, menor: fora da janela, metade das leads recebe a
> primeira variante do `silence_2`, mas o gate leu a segunda — decisão do operador na
> seção 1, acima.

Mantenha o texto **sem nada promocional**. Uma palavra de oferta num template `UTILITY` faz a
Meta reclassificar o template como marketing, e aí ele muda de preço e passa a depender do
opt-in de marketing.

---

## 4. Véspera do pedido já pago (`order_eve`, antecipado)

| Campo | Valor |
|---|---|
| Nome sugerido | `encorpa_vespera_entrega_pago` |
| Categoria | `UTILITY`: mesma atualização de um pedido que já existe, sem oferta nenhuma |
| Idioma | `pt_BR` |

**Corpo:**

```text
Oi! Sua entrega está marcada pra *amanhã* 💛
Se você não estiver em casa amanhã, me avisa que eu tento remarcar.
```

**Só sai com data.** Desde 2026-09-29 a véspera só é armada com a data da entrega no pedido, e o
webhook da Coinzz (o antecipado) não traz data: enquanto isso for verdade, este template não tem
quando sair. O corpo não mudou; submeter continua valendo para o dia em que a data existir.

**Sem placeholder.** Este corpo é `renderFollowup("order_eve", { prepaid: true, ... })`
palavra por palavra, só com o negrito convertido (`**x**` → `*x*`) — a linha "Deixa {{1}}
separado" não entra porque ela já pagou, e sem essa linha não sobra variável nenhuma para
declarar. Isso é uma leitura válida da regra do topo desta página, não uma exceção a ela: a
Meta não exige um mínimo de variáveis por template, um corpo pode ter zero. A verificação
contra a cadeia de gates está abaixo, na mesma seção que verifica os outros três.

**O código ainda não lê uma segunda chave.** Hoje `deliveryFor` só sabe de uma entrada por
`FollowupKind` em `channel.templates` (uma chave, um template). Escolher entre este corpo e
o de `encorpa_vespera_entrega` conforme `ctx.prepaid` é mudança de código em `deliveryFor`,
a ser feita depois que o PR #37 for mesclado — até lá, declarar este nome no
`BUSINESS_CONFIG` não muda nada, porque nada lê a chave. Quando a mudança existir, a
declaração ficaria assim (rascunho, fora do bloco que o operador copia hoje):

```text
"channel": { "templates": {
  "order_eve":       { "name": "encorpa_vespera_entrega",      "language": "pt_BR", "variables": ["price"] },
  "order_eve_pago":  { "name": "encorpa_vespera_entrega_pago", "language": "pt_BR", "variables": [] }
} }
```

### Verificação contra a cadeia de gates

Mesmo método da seção de verificação abaixo, com `prepaid: true` e o mesmo config e
relógio (quinta-feira, 09:00 de São Paulo). Saída literal:

```text
order_eve(antecipado) layer=auto stage=logistics allowed=true gates=20 pass=20 remedy=null []
order_eve(antecipado) layer=agent stage=logistics allowed=true gates=20 pass=20 remedy=null []
```

`gates=20` (não 19, como no restante desta página): a cadeia cresceu desde a verificação
original de 2026-09-22; o número é o de hoje, no repositório atual, não uma correção
retroativa dos outros três.

---

## Bloco para o `BUSINESS_CONFIG`

Depois de **aprovados**, com os nomes exatamente como ficaram na Meta:

```json
"channel": { "templates": {
  "silence_2": { "name": "encorpa_retomada_confianca", "language": "pt_BR", "variables": ["warrantyDays"] },
  "silence_3": { "name": "encorpa_cupom_super_dia",   "language": "pt_BR", "variables": ["weekday", "couponPercent"] },
  "order_eve": { "name": "encorpa_vespera_entrega",   "language": "pt_BR", "variables": ["price"] }
} }
```

A ordem de `variables` é a ordem `{{1}}`, `{{2}}`… aprovada. A aprovação fixa essa ordem, e o
código não adivinha. Declare só o que já foi aprovado: chave ausente bloqueia o toque, e
chave presente com template recusado faz a Meta recusar o envio.

---

## Verificação contra a cadeia de gates

Cada corpo acima foi preenchido com o valor que `deliveryFor` resolve de verdade e passou
por `runGates` num script `tsx` descartável (não versionado). O config usado foi o
decidido hoje: COD R$ 129,90, antecipado R$ 116,91 com 10%, `freeShipping: false`,
garantia 7 dias, cupom 20% com `active: true` só para o `silence_3` renderizar. O relógio
estava em quinta-feira, 09:00 de São Paulo, e `stage` seguiu a mesma regra da varredura
(`order_*` → `logistics`, resto → `presale`).

| Template | Variáveis resolvidas | `layer: "auto"` | `layer: "agent"` (o que a varredura usa) | Texto livre de `renderFollowup` |
|---|---|---|---|---|
| `silence_2` | `["7"]` | 19/19 pass | 19/19 pass | pass |
| `silence_3` | `["Quinta", "20"]` | 19/19 pass | 19/19 pass | pass |
| `order_eve` | `["R$ 129,90"]` | 19/19 pass | 19/19 pass | pass |

Saída literal:

```text
silence_2 layer=auto stage=presale allowed=true gates=19 pass=19 remedy=null []
silence_2 layer=agent stage=presale allowed=true gates=19 pass=19 remedy=null []
silence_3 layer=auto stage=presale allowed=true gates=19 pass=19 remedy=null []
silence_3 layer=agent stage=presale allowed=true gates=19 pass=19 remedy=null []
order_eve layer=auto stage=logistics allowed=true gates=19 pass=19 remedy=null []
order_eve layer=agent stage=logistics allowed=true gates=19 pass=19 remedy=null []
silence_3 with coupon.active=false -> null
order_eve without size -> template
```

**Contraprova de que os gates não passaram por serem cegos.** O mesmo script, com textos
errados de propósito:

| Texto | Resultado |
|---|---|
| "O frete é grátis…" | bloqueado por `shipping_promise` |
| Texto da véspera com `stage: "presale"` | bloqueado por `delivery_promise`: "amanhã" só é fato na logística |
| Cupom com `coupon.active: false` | bloqueado por `coupon_exists` e `price_promise` |
| "tem 30 dias pra devolver" | bloqueado por `warranty_promise` |
| "Deixa R$ 99,90 separado" | bloqueado por `price_promise` |

Nenhum dos três promete frete grátis, prazo do antecipado, escassez, cupom inexistente ou
mudança de corpo.

---

## Checklist de submissão na Meta

- [ ] Nome em minúsculas com `_`, exatamente como na tabela de cada template.
- [ ] Idioma `pt_BR`.
- [ ] Exemplo preenchido para cada placeholder (a Meta exige na submissão).
- [ ] Nenhum placeholder no começo ou no fim do corpo, e nenhum colado em outro. Os três
      respeitam isso.
- [ ] Sem cabeçalho, rodapé nem botão. O código envia só o corpo.
- [ ] Marketing (`silence_2`, `silence_3`) só vai para quem deu opt-in para receber mensagem
      da marca no WhatsApp. Isso é regra da Meta, não do código, e **o código não verifica**.
- [ ] Aprovou? Copie o nome **aprovado** para o bloco do `BUSINESS_CONFIG` acima.
- [ ] Reprovou ou foi reclassificado? Não reescreva o template sozinho: o texto novo tem que
      entrar primeiro em `renderFollowup`, passar pelos gates e pelos testes, e só então
      voltar para a Meta.
