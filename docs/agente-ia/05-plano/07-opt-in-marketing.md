# Opt-in antes de template de marketing (item 16c)

> Memorando de decisão para o operador, 2026-09-28. Status: **aguarda decisão**. Escrito
> pelo `compliance-reviewer`, que **não é advogado**: onde a pergunta é jurídica de verdade,
> ela está marcada como pergunta. Entra no grafo de decisões quando o operador escolher.

**O problema.** `silence_2` (manhã seguinte) e `silence_3` (cupom, 3 dias depois) saem fora
da janela de 24h como template `MARKETING` ([`03-templates-meta.md`](../06-script/03-templates-meta.md)).
A Meta exige opt-in para isso, e o checklist de submissão já avisa que **o código não
verifica**. Hoje `leads` só tem `opted_out_at` (`supabase/migrations/0001_init.sql:12`), e
`deliveryFor` (`src/agent/followups.ts:509`) manda o template para qualquer lead que não saiu.
`order_eve` é `UTILITY` e fica fora deste memorando.

## 1. O que a Meta exige (lido em 2026-09-28)

**Verificado no texto oficial:**

- [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy) (página diz
  "Last updated: September 23, 2026"): só pode contatar quem (a) deu o número e (b) deu
  "opt-in permission (...) confirming that they wish to receive subsequent messages or calls
  from you". O método é responsabilidade da empresa, e tem de cumprir a lei local. Todo
  pedido de parar, dentro ou fora do WhatsApp, tem de ser respeitado. Fora da janela, só template.
- [Get opt-in for WhatsApp](https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in/)
  (atualizada em 16/06/2026): o opt-in precisa **dizer claramente** que a pessoa está aceitando
  receber comunicação e **dizer o nome da empresa**. Pode ser genérico, não precisa ser
  "para WhatsApp". Recomenda (sem obrigar) opt-in **por categoria** (pedido vs. oferta) e
  saída clara por categoria.
- [Pricing](https://developers.facebook.com/docs/whatsapp/pricing) (atualizada em 28/09/2026):
  quem chega por anúncio Click-to-WhatsApp (CTWA) abre a janela de atendimento, e a resposta
  abre uma **free entry point window de até 7 dias**. É regra de **preço**, não de permissão.
- [Error codes](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/)
  (atualizada em 18/06/2026): **131050**, a cliente "has chosen to stop receiving marketing
  messages". Não reenviar. O webhook `user_preferences` avisa quando ela para ou volta.

**Minha leitura (não verificada, não está escrita assim):**

- **Clicar num CTWA não é opt-in para template de marketing.** Ela escreveu para conversar
  agora. Não há frase dizendo que aceita receber comunicação futura da Encorpa, que são os
  dois requisitos da página de opt-in. O clique cobre a janela da conversa, não a régua.
- A "free entry point window" de 7 dias **não** autoriza texto livre depois de 24h. Ela
  torna o envio gratuito, mas o texto da policy ("Outside the 24-hour customer service
  window, you may only send messages via approved Message Templates") continua valendo.
- `silence_2` **dentro** da janela sai como texto livre em conversa que ela abriu, e não
  depende de opt-in de marketing. Só o caminho de template depende.

## 2. O que a LGPD acrescenta (Lei 13.709/2018, [texto no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), lido em 2026-09-28)

- **Duas bases possíveis para mensagem de marketing:** consentimento (art. 7º, I) ou
  legítimo interesse (art. 7º, IX; art. 10, I, "apoio e promoção de atividades do controlador").
- **Legítimo interesse** pede dado estritamente necessário (art. 10, §1º) e transparência
  (§2º). A ANPD pode pedir relatório de impacto (§3º). A titular pode se opor (art. 18, §2º).
  Mesmo que a LGPD aceitasse, **não resolve a Meta**, que pede opt-in declarado.
- **Consentimento** tem de ser por escrito ou por meio que demonstre a vontade (art. 8º). A
  **prova é do controlador** (§2º). Autorização genérica é nula (§4º). Pode ser revogado a
  qualquer momento, de graça e fácil (§5º).
- **Retenção (§R6.3, §R8.2):** a prova do opt-in fica em `leads` e em `messages`, que
  expiram juntos em 90 dias. Quando a prova some, some também a lead que receberia a
  mensagem. Por isso a coluna nova fica coberta pelo cron que já existe, sem tabela nova.
- **Pergunta ao operador (jurídica):** uma cliente de CTWA com conversa aberta pode receber
  `silence_2` por legítimo interesse, sem opt-in? Pela LGPD talvez. Pela Meta, não é o que
  está escrito. Este memorando parte do mais seguro: sem opt-in, sem template de marketing.

## 3. Opções

| | A. Só `UTILITY` fora da janela | B. Pergunta explícita, feita pelo código | C. CTWA vale como opt-in |
|---|---|---|---|
| **O que ela vê** | `silence_2` só se ainda estiver na janela. `silence_3` nunca sai (está sempre fora) | No `silence_1` (30 min, dentro da janela), uma linha a mais: "Posso te chamar aqui de novo com lembrete e oferta da Encorpa? Se sim, me responde *SIM*." | Nada muda |
| **O que o código grava** | Nada. `deliveryFor` bloqueia template de `silence_2`/`silence_3` | `leads.marketing_opt_in_at`, `marketing_opt_in_asked_at`, `marketing_opt_in_message_id` | Nada que prove o consentimento |
| **Risco** | Nenhum novo | Baixo. Prova no banco, pedido nominal e específico (art. 8º, §4º), saída pela régua de opt-out que já existe | **Bloqueia.** Não cumpre os dois requisitos da página de opt-in e não tem prova (art. 8º, §2º). Denúncia de spam derruba a quality rating e o limite de envio do número, que é o único canal |
| **Efeito em venda** | Perde o cupom do dia 3 e o `silence_2` de quem parou de madrugada | Perde esses dois toques só para quem não respondeu SIM. A cliente mais calada, que é o alvo da régua, provavelmente não responde | Nenhum até a primeira denúncia. Depois dela, o número inteiro sofre |

**A é o piso de B:** enquanto ninguém deu opt-in, B se comporta igual a A. Existe uma quarta
via, o opt-in no próprio anúncio (formulário ou texto do CTWA com o nome da marca). Ela pede
mudança na campanha, que está em outro repositório. Pode entrar depois, gravando o mesmo campo.

## 4. Recomendação: B, que começa como A

Com esta especificação implementada, e até o operador ligar a pergunta, o código fica em A:
não sai template de marketing sem `marketing_opt_in_at`. (Hoje, antes dela, `deliveryFor`
não confere opt-in nenhum.) A regra de risco antes de conversão manda que A seja o padrão. Ligar
B é decisão do operador.

**Especificação mínima (para depois do merge do PR que mexe na régua):**

1. **Migração** `00NN_marketing_opt_in.sql`: em `leads`, três colunas `timestamptz`/`text`
   anuláveis: `marketing_opt_in_at`, `marketing_opt_in_asked_at`, `marketing_opt_in_message_id`.
   Sem tabela nova, porque o cron de 90 dias já apaga a linha.
2. **Config** `channel.askMarketingOptIn?: boolean`, lido `=== true`. **Ausente = não pergunta**,
   então ninguém entra e nenhum template de marketing sai. Espelha o `freeShipping`.
3. **Pergunta, escrita pelo código e não pelo modelo:** `renderFollowup("silence_1")` junta a
   linha só se a flag for `true` e `marketing_opt_in_asked_at` for nulo. O texto cita
   `config.brand` (a Meta pede o nome da empresa). **Não cita cupom**, porque `coupon.active`
   pode ser `false` e seria promessa que o `coupon_exists` barra. A varredura grava
   `marketing_opt_in_asked_at` quando o toque sai. O texto passa pela cadeia de gates como hoje.
4. **Captura, determinística:** em `turn`, depois do `classifyOptOut` e antes do modelo.
   Grava `marketing_opt_in_at` e o id da mensagem só se a pergunta foi feita, se ela
   respondeu dentro de 24h e se a resposta é um sim explícito e curto ("sim", "pode", "quero",
   "pode mandar"). **A negação é checada primeiro** ("não", "nao", "agora não", "pode não",
   "sim, mas não quero oferta"). Resposta ambígua conta como **não**. O turno segue normal
   para o modelo responder.
5. **Gate na saída:** `deliveryFor` recebe um conjunto fixo no código,
   `MARKETING_KINDS = {silence_2, silence_3}`. Com a janela fechada e sem opt-in, devolve
   `{ via: "blocked", reason: "no_opt_in" }` antes de olhar o template. A janela aberta não muda.
   A varredura já lê `leads(...)`: basta pôr `marketing_opt_in_at` no `select`
   (`supabase/functions/turn/index.ts:1099`). A mudança em `deliveryFor` vale para
   `src/agent/followups.ts` e para o espelho byte a byte `supabase/functions/turn/followups.ts`.
6. **Revogação:** o opt-out explícito já para tudo (`supabase/functions/turn/index.ts:1794`). Isso é mais estrito que
   só marketing, e fica assim. O erro **131050** no webhook `whatsapp` (`deliveryErrors`)
   zera `marketing_opt_in_at` da lead. Hoje ele só vai para o log (`supabase/functions/whatsapp/index.ts:52`).
7. **Prompt:** o prompt não ensina a pergunta, porque ela é do código. Se o prompt passar a
   citar "te aviso amanhã" ou algo parecido, lê a mesma flag, e `tests/prompt.test.ts` prova isso.

**Testes que a mudança precisa (TDD, antes do código):**

- `deliveryFor`: `silence_2`/`silence_3` com janela fechada, template declarado e sem opt-in →
  `no_opt_in`. Com opt-in → template. `order_eve` sem opt-in → template (é utility).
  `silence_2` com janela aberta e sem opt-in → texto.
- Config sem `askMarketingOptIn` → `silence_1` sem a linha, e nenhuma lead ganha opt-in.
- Classificador: tabela de sins e **tabela de negações** (as frases do item 4, mais "sim?"
  como pergunta, e "sim" sem pergunta feita antes, que não grava nada).
- 131050 → `marketing_opt_in_at` nulo, e o toque seguinte bloqueia.
- `pnpm dev:gates` sem afrouxamento, `pnpm typecheck:function`, e o teste do espelho.

**Nota à parte (expõe risco, fora do 16c):** o `silence_3` promete "é só me falar que eu não
te mando mais nada". É promessa vinculante (CDC art. 30) e precisa ser coberta pelo
`classifyOptOut` para frases como "não quero mais promoção". Vale conferir quando o PR da
régua fechar.
