# Campanha e canais

## Os dois caminhos de venda, coexistindo

Decisão do operador: o caminho novo **soma**, não substitui.

```
CAMINHO A (novo)     Meta Ads  →  WhatsApp  →  agente de IA  →  pedido
CAMINHO B (atual)    Meta Ads  →  landing page  →  checkout Coinzz  →  pedido
                                        ↘ botão flutuante de WhatsApp
                                        ↘ página de obrigado → WhatsApp
```

O site **não é descartado**. O agente atende os três pontos de entrada: anúncio direto,
botão flutuante da LP e página de obrigado.

## O que muda no caminho A

No caminho B, as etapas 2 a 5 do funil (desejo, prova, segurança, preço) são feitas
**pela página**. No caminho A, elas passam a ser trabalho do **agente**, na conversa,
antes de chegar ao pedido. Não é o mesmo agente de "tirar dúvida de quem já decidiu".

## Atribuição — o que existe e o que falta

| Ponto de entrada | Hoje | Evidência |
|---|---|---|
| Anúncio → checkout via LP | `fbclid`, `gclid`, `ttclid` e `utm_*` são repassados na URL | `colet/src/lib/checkout.ts` :9–19, `goToCheckout` :21–35 |
| Anúncio → WhatsApp direto | **nada** — a conversa chega anônima | — |
| LP → WhatsApp (botão flutuante) | **nada** — link `wa.me` seco | `colet/src/components/landing/WhatsAppFloat.tsx` :4 |
| Página de obrigado → WhatsApp | texto pré-preenchido, sem identificador | `colet/src/pages/ThankYou.tsx` :44 |

O clique em anúncio "Click to WhatsApp" carrega `ctwa_clid` e os dados do anúncio dentro
da primeira mensagem. Como isso é extraído: ver
[`../03-pesquisa/03-extracao-por-necessidade.md`](../03-pesquisa/03-extracao-por-necessidade.md) §N1
e a referência concreta em `melgarafael/DeskcommCRM` →
`lib/waha/atribuicao-de-anuncio.ts` :23–56.

**Sem isso, o Meta otimiza para "conversa iniciada", não para venda** — e já sabemos o
que custa medir a etapa errada (ver [`03-economia-cod.md`](03-economia-cod.md)).

## Pixel e eventos hoje

| Evento | Onde dispara | Arquivo |
|---|---|---|
| `PageView`, `ViewContent` | carga da página | `src/lib/pixel.ts` :25 |
| `AddToCart` | primeira escolha de tamanho | `src/components/landing/SizeSelector.tsx` :43 |
| `InitiateCheckout` | clique no CTA | `src/lib/checkout.ts` :22 |

Pixel Meta ID `26531725433172317`, instalado no site e na Coinzz.

## O que continua valendo de `docs/PROMPT.md`

O `PROMPT.md` deste repositório especifica prospecção **ativa no Instagram** — outro
canal, outro funil. Não vale para o agente inbound. **Continua valendo** o que é
transversal:

| Assunto | Onde | O que aproveita |
|---|---|---|
| Motor de conversação | `PROMPT.md` :159–173 | Modelo rápido para classificar e extrair, modelo bom para redigir; toda chamada grava modelo, tokens e custo; orçamento mensal **pausa o sistema** ao atingir o teto |
| Opt-out | `PROMPT.md` :171 | `do_not_contact` permanente, sem follow-up, sem reentrada por outra campanha, por nenhum canal |
| Persistência | `PROMPT.md` :253 | Tabela de jobs no SQLite no lugar de Redis |
| Arquitetura | `PROMPT.md` :225–262 | Modular monolith, sem microservices, sem abstração especulativa |
| Idioma | `PROMPT.md` :213–222 | Interface e conversa em PT-BR; código em inglês |
