# Estado do projeto em 2026-10-28, fim do dia

Documento de retomada. Descreve o que existe agora, não o que deveria existir. Se algo aqui divergir do código ou do
`HANDOFF.md`, vale o código; corrija este arquivo. Decisões e causas moram no grafo
([`04-grafo-de-decisoes.md`](../documentacao/decisoes/04-grafo-de-decisoes.md) §132a, §133, §134, §135).

Nada está rodando em segundo plano: todos os subagentes terminaram. O que está inacabado está listado em §4.

## 1. Por que tudo isso começou

Smoke test de 26 a 27/10 (campanha "5 vídeos v6", anúncios com CPL e CTR bons): 22 leads, 7 CEPs, **0 com pagamento na entrega,
0 pedidos**. Preço e frete não eram a causa. A causa era cobertura: o anúncio trazia gente de cidades que a Logzz não atende, e para
quem era atendida o checkout da Coinzz mandava para o antecipado com frete. A conta de margem (lead a R$ 1,00, frete R$ 25) mostrou
que R$ 109,90 e frete grátis fecham com folga: empate em 4,3 vendas a cada 100 leads.

Dois achados estruturais, ambos medidos hoje:

1. **A Logzz e a Coinzz têm cadastros e estoques diferentes do colete.** Coinzz: produto 79880, tamanhos `pro7ml00` (G) etc.
   Logzz: produto `prow6pq0`, tamanhos `progm9w6` (P), `pro37j6q` (M), `projm2ov` (G), `prolm313` (GG), `prox1jxp` (XG = XGG).
   A Logzz entrega G em SP e M em BH, a Coinzz não; a Coinzz oferece XGG em BH e Goiânia e GG em Salvador, a Logzz não. Dados em
   [`estoque-logzz-x-coinzz-2026-10-28.json`](estoque-logzz-x-coinzz-2026-10-28.json). A causa é inferência (dois cadastros), não
   confirmada pelo fornecedor.
2. **O M não existe na Coinzz em lugar nenhum** (a consulta dá 404 "não foi possível identificar o endereço"). Na Logzz há M em BH
   e Contagem.

## 2. O que está no ar (produção)

| Peça | Estado | Onde conferir |
|---|---|---|
| Edge Function `turn` | **v47**, função v171, commit `329cb31`, publicada 28/10 20:07 UTC | `agent_versions` (linha 47) |
| `BUSINESS_CONFIG` | `business-config-2026-10-28.min.json`, sha256 `98213272…985bd`, colado pelo operador | cofre do Supabase (a API devolve o sha) |
| `LOGZZ_API_TOKEN` | gravado pelo operador no Supabase (mesmo token da credencial "Logzz API" do n8n) | lista de secrets |
| Banco | migração **0033** (`leads.cart`, `orders.details`), aditiva | `list_migrations` |
| n8n | `Venda confirmada` (`gS72LhYGOnmyALRq`) e `WhatsApp envio` (`GehzRG0OhJ4FtBm9`) atualizados; **`Carrinho abandonado`** (`xqaepviTcGHDI5YK`, caminho `encorpa-carrinho`) criado e ativo; `pnpm dev:n8n` ok nos 8 workflows | `pnpm dev:n8n` |
| Saúde | alarme de cobertura 20:11 UTC `healthy` já com o código e o config novos | n8n, execuções do `Alarme de cobertura` |
| Site (Encorpa-Website) | `main` = `1525764`, no Netlify (`encorpa-fashion.com.br`) | Playwright: R$ 109,90 / 197,82 / 263,76, "Frete grátis*", WhatsApp `5511913179168`, pixel `4466808633585371` |
| Coinzz (feito pelo operador) | OmniCash recadastrada com entrega mais barata + frete grátis para a cliente; postback de carrinho abandonado cadastrado | checkout `encorpa-0`: Pix R$ 109,90, "Pagar na entrega" R$ 109,90 com dias, sem linha de frete |
| Logzz (feito pelo operador) | ofertas a R$ 109,90 / 197,82 / 263,76 (`sal0g3mo` / `salng30n` / `sal6gz39`); integração de importação `orivd974` mapeada com `external_id`, "Em análise" **desligado** | painel da Logzz |

O que a oferta no ar faz: um preço (R$ 109,90) nos dois pagamentos, frete grátis nos dois, kit de 2 por R$ 197,82 (10%) e de 3 por
R$ 263,76 (20%), um checkout da Coinzz por quantidade (`encorpa-0`, `encorpa-site-0`, `oferta-site2-0`), cupom e experimentos
desligados, cobertura consultada na Coinzz para o antecipado.

## 3. O que foi construído (por frente)

### 3.1 Malu, oferta nova e cobertura (grafo §133)
- Config novo; `buildPrefilledCheckoutLink` escolhe os campos pela plataforma da URL (Coinzz: `document`, telefone sem 55).
- Consulta de cobertura pela Coinzz (`lookupCoinzz`); a Logzz dava falso positivo (`lookupLogzzUnsafe` lia a rota sem a unidade).
- M sem estoque: linha honesta (`sizeOutOfStockLine`), sem link, sem oferta; a régua de silêncio para; `kitRegion` acha a peça sem
  estoque em qualquer posição do kit; `CachedRegion.stockAware` invalida cache antigo.
- Gate `price_promise` veta "desconto do antecipado" com `prepayDiscountPercent` 0.

### 3.2 Origem, modo site, carrinho e Pix (grafo §134)
- Origem: `fromAd = Boolean(lead.source || payload.source)` (marca CTWA); sem marca = site. Nunca pelo texto da mensagem.
- Modo site: sem a abertura de 9 mensagens; vídeo, áudios e avaliações só a pedido (`requestedMedia`, determinístico, com negação).
  `siteMode` depende da abertura realmente enviada (`OPENING_FIRST`), não de `source`.
- `job:"cart"` (webhook de carrinho abandonado, senha em `SALE_WEBHOOK_TOKEN`, recusa se o segredo estiver vazio): toque
  `cart_recovery` 30 min depois; `pix_pending` 30 min depois de "Aguardando pagamento"; `silence_3_retomada` no lugar do cupom.
  Cancelados por qualquer pedido pago. Reenvio do Pix a pedido (`asksPixCode`, `pixResendTexts`).
- Lead por telefone: mesmo DDD e mesmos 8 dígitos (`phoneTwins`), nunca só o sufixo. Texto de webhook limpo (`plainFact`) antes do prompt.
- Quatro revisões Opus reprovaram e foram corrigidas até a aprovação (achados e correções no §134 B, C, D).

### 3.3 Venda na entrega fechada pela Malu com a importação da Logzz (grafo §135, `src/agent/cod-close.ts`)
Fluxo (decisão do operador, 28/10): com tamanho e CEP a Malu consulta as datas reais da Logzz para o pacote da cliente; quando ela
quer comprar ou pergunta como funciona, manda **um checklist** (dia entre as datas reais, nome completo, CPF, número da casa +
complemento; rua e bairro só em CEP geral de cidade); depois só pede o que faltar; com tudo, manda **só o resumo** ("Confere se está
tudo certo… Responda *SIM*"); no SIM puro cria o pedido (`POST …/importacao-de-pedidos/webhook/orivd974`, `external_id` estável por
conversa+resumo) e devolve o número e a data **que a Logzz devolveu**.
Proteções: pergunta nunca é "sim"; gate `order_claim` veta "confirmado/agendado" antes de um `order_code`; CPF mascarado; erros da
Logzz com CPF/telefone mascarados; 409 de processamento repete com o mesmo id; trava de conversa obrigatória para importar;
`rescheduled` avisa a cliente e manda e-mail ao operador (decisão do operador: manter); nome checado contra o endereço dela e
palavras de pagamento/produto/cor/lugar (`isPlausibleName`); correção de nome e número depois do resumo; webhook posterior da
Logzz cai na mesma linha do pedido (`importedTwin`). Sem `logzzImport` no config ou sem o token, tudo volta ao comportamento antigo.
Cinco revisões Opus (APROVADO na última, `d67e83e`); 81 mutações O31–O37 pegas.

### 3.4 Site (Encorpa-Website, grafo não se aplica: repositório separado)
Preço único; seletor de 1/2/3 peças (`QuantitySelector`, `KITS` em `src/lib/checkout.ts`) levando à URL certa com UTMs e `size`;
`FreeShipping` ("Frete grátis*" + "*para a maioria das cidades"); número da Malu e pixel numa constante só
(`src/config/business.ts`, o `vite.config.ts` grava o pixel em `index.html` e `obrigado.html`); sem "WhatsApp com gente de verdade";
teste de URL por quantidade em `src/lib/checkout.test.ts`.

### 3.5 Templates da Meta (rascunho, para o sócio)
`encorpa_carrinho_site` (Marketing, botão de URL dinâmica), `encorpa_pix_pendente` (Utilidade), `encorpa_retomada` (Marketing,
só com opt-in). Texto exato em [`03-templates-meta.md`](../agente-ia/06-script/03-templates-meta.md) §5–§7, com o JSON para
`channel.templates` depois da aprovação. O texto do template tem de ser idêntico ao que `renderFollowup` escreve.

## 4. O que ficou em andamento ou inacabado

1. **Nada de código em andamento.** A branch `wip/checklist-close-2026-10-28` (rascunho interrompido) está **superada** pelo
   `d67e83e`; pode ser apagada.
2. **Pedido real pela importação nunca foi criado.** Provado só por sondas para Manaus (sem entrega): oferta aceita, variação
   aceita, parou em "Data de entrega indisponível". Não provado: o `hash` das variações num pedido real, a idempotência por
   `external_id`, o webhook de volta e a mensagem "Pedido confirmado" com o `order_code` verdadeiro.
3. **Pixel não carrega nos 3 checkouts da Coinzz** (antes carregava o antigo). Sem pixel o Meta não vê início de checkout nem compra
   vindos de lá.
4. **API de Conversões não existe no nosso código.** O evento de compra pelo servidor (com telefone, e-mail, nome e CEP em SHA-256)
   está planejado e **não foi construído**; depende do token que o sócio vai mandar.
5. **Templates não submetidos/aprovados**: sem eles, `cart_recovery` fora da janela de 24 h, `pix_pending` e `silence_3_retomada`
   ficam bloqueados de propósito (a varredura não envia fora da janela sem template declarado).
6. **PRs para a `main`:** nenhum aberto. A `main` do Ricos-com-AI ainda está em `dc046cf`, atrás da produção (a produção roda a
   branch `claude/site-whatsapp-test`, HEAD `3f4d6d0`). A `main` do site já é `1525764`.
7. **O teste A/B de 5 dias não começou.**

## 5. O que ainda é necessário executar, nesta ordem

| # | Ação | Quem | Prova |
|---|---|---|---|
| 1 | **Pedido de teste real:** pelo WhatsApp da Malu, G/GG/XGG com CEP de SP/Guarulhos/Campinas/Santos, pagar na entrega, responder ao checklist, conferir o resumo, SIM. Depois **cancelar na Logzz**. | operador | conversa no banco + pedido na Logzz com o `order_code` que a Malu disse; `turn_outcomes` |
| 2 | Pixel `4466808633585371` nas 3 ofertas da Coinzz (`encorpa-0`, `encorpa-site-0`, `oferta-site2-0`) + páginas de obrigado (cartão/Pix → `/obrigado.html?pago=antecipado`, entrega → `/obrigado.html`) | operador (quando o sócio mandar o token) | Playwright: `fbq init` no checkout |
| 3 | Token da API de Conversões → segredo no Supabase; eu construo o evento `Purchase` do servidor com dado em hash, disparado pelo webhook de venda | sócio → operador → agente | evento recebido no Gerenciador de Eventos |
| 4 | Sócio submete os 3 templates; aprovados → declarar em `channel.templates` (JSON em `03-templates-meta.md`), gravar o config, `job:"health"` | sócio, depois agente/operador | envio de teste dentro e fora da janela |
| 5 | Fornecedor: por que o estoque da Coinzz e o da Logzz divergem; e se a entrega da Coinzz de XGG em BH/Goiânia e GG em Salvador tem como ser cumprida | operador | resposta por escrito |
| 6 | Segmentação dos anúncios nas cidades da tabela de cobertura; 2 conjuntos (site × WhatsApp), 5 criativos cada, R$ 25/dia por 5 dias; o conjunto do site otimiza para compra (depende do item 2) | sócio | gasto e vendas por conjunto |
| 7 | Ler o teste: critério **anúncio por venda paga ≤ R$ 27**; vence quem ficar abaixo, a verba migra | agente + operador | planilha diária |
| 8 | PRs dos dois repositórios para a `main`; apagar a `wip/checklist-close-2026-10-28` | agente, com o OK do operador | merge |

## 6. Limites e riscos conhecidos (resíduos aceitos)

- **Deploy e gravação de segredo pelo agente são barrados pelo classificador de permissão** ("Production Deploy"); cada deploy precisa
  do "pode publicar" explícito do operador, e o `BUSINESS_CONFIG` o operador cola.
- O site já promete "Frete grátis*"; a Coinzz agora também zera o frete (conferido em `encorpa-0`), mas **os kits só tiveram o total
  conferido**, não a tela do meio de pagamento.
- Pedido criado pela importação nasce na hora e não tem aprovação manual: um erro custa R$ 9,99 na porta. Por isso o SIM ao resumo.
- Gate `order_claim`: variações naturais ainda passam ("Confirmado!", "Agendadinho!", "Pronto, tá tudo certo pra quinta!"), pela
  regra R21.6 (gate só muda por frase real); a lista está no §135 C–F.
- Nome raro que começa com palavra de lugar ("Santo Antônio Silva") é recusado e a Malu pergunta de novo.
- Nome errado já gravado num lead antes das correções continua no lead (o fechamento não o usa).
- Coinzz × Logzz: o n8n não lê a data de entrega do pedido da Coinzz (`order_eve` não arma para pedido da Coinzz); o suporte de
  trocas ainda aponta para o telefone da Logzz (`returns.logzzSupportPhone`).
- `oneCheckout` compara só a URL de 1 peça com a de entrega; kit com peça sem estoque na Coinzz só é checado onde a peça da própria
  cliente tem entrega.
- O `CountdownBar` do site reinicia 32 h por visitante (não é prazo real; não foi mexido). `scripts/personas.mjs` do site já falhava
  na `main` e está obsoleto. O `HANDOFF.md` e `docs/` do site ainda descrevem o desenho de dois checkouts.
- O checkout da Coinzz pede e-mail e CPF antes do CEP e parcela em 12x com juros (a Malu não avisa dos juros).
- n8n tem dois workflows `TEMP — …` inativos que **não** são desta sessão (`teste REST Supabase`, `teste da credencial Meta API`).

## 7. Como retomar

1. Ler o topo do [`HANDOFF.md`](../../HANDOFF.md) e este arquivo; conferir o estado real (`agent_versions`, sha do `BUSINESS_CONFIG`,
   alarme de cobertura) antes de agir.
2. Se o pedido de teste (item 1) falhar: ler `conversations`/`messages`/`turn_outcomes` do telefone do operador, o e-mail de erro do
   operador e a resposta da Logzz (mensagens estão no §135 e em `readImport`); a sonda segura de importação é um POST para um CEP sem
   entrega (Manaus), que nunca cria pedido.
3. Toda mudança de gate ou texto: TDD, mutação em `src/dev/verify-guards.ts` (rodar em cópia commitada, o verificador recusa árvore
   suja), `pnpm test && pnpm dev:conversas && pnpm typecheck:function && pnpm dev:gates --fail-on-loosen`, espelho byte a byte,
   revisão Opus, e registro no grafo.

## 8. Referências

Grafo §132a (calça 56/colete masculino, da v45), §133, §134, §135. Configs: `business-config-2026-10-27.min.json`,
`business-config-2026-10-28.min.json`. Comparação de estoque: `estoque-logzz-x-coinzz-2026-10-28.json`. Templates:
`docs/agente-ia/06-script/03-templates-meta.md`. Commits-chave (Ricos-com-AI, branch `claude/site-whatsapp-test`): `481f2d3` oferta
nova, `ecea0c3`/`2474091`/`ab050f4` origem+carrinho+Pix e correções, `844743b`…`d67e83e` fechamento pela Logzz, `329cb31` o que foi
publicado como v47, `3f4d6d0` HANDOFF. Site: `1525764`.

## 9. Conferência de 2026-10-29 (manhã), sem ação de produção

- **Saúde:** desde a publicação da v47 (28/10 20:07 UTC) até 29/10 10:56 UTC, todas as execuções do n8n deram `success`
  (régua 94, alarme de cobertura 31, portal 93, Hermes 32). Nenhum lead novo, nenhum pedido novo, nenhum turno na v47 (a campanha
  está pausada): o fechamento pela Logzz continua sem uso real.
- **Teste do botão "Testar" da Coinzz (28/10 13:53–13:55 UTC):** o webhook de carrinho abandonado foi exercitado 3 vezes. A primeira
  foi com a senha escrita `XXXX` (recusada, e-mail "carrinho não mapeado" ao operador: comportamento certo); as outras duas com a senha
  real: carrinho gravado e `cart_recovery` armado. **O lead de teste ficou no banco** (telefone terminado em 4554, nome do exemplo da
  Coinzz, sem `source`, 1 carrinho de 2 peças): o toque foi cancelado sem envio. **Ele conta como lead "do site": exclua-o das
  métricas do teste A/B** (ou apague-o; o `delete` pelo conector trava, usar a API de gerência, ver a memória `mcp-sql-trava-com-delete`).
- **Risco achado no payload de exemplo:** o `checkout_url` do exemplo da Coinzz foi `https://checkout.coinzz.com.br/cart/abc123`,
  que `checkoutSlug` (padrão `…coinzz.com.br/checkout/<slug>`) não reconhece. Para um carrinho real com URL nesse formato o botão do
  template ficaria sem variável e o toque seria **bloqueado** (`empty_variable`): seguro, mas a recuperação não sairia. Não dá para
  saber o formato real sem um carrinho abandonado de verdade. **Ao ver o primeiro carrinho real**, conferir `leads.cart->>'checkoutUrl'`;
  se vier nulo, o conserto pequeno é derivar o slug da quantidade (1 → `encorpa-0`, 2 → `encorpa-site-0`, 3 → `oferta-site2-0`) quando a
  URL não for reconhecida. Sem urgência: os templates ainda nem foram aprovados.

## 10. Atualização de 2026-10-29

- **Pixel nas 3 ofertas da Coinzz: feito pelo operador**, com ID e token da API de Conversões cadastrados na própria Coinzz.
  Conferido com Playwright: `encorpa-0`, `encorpa-site-0` e `oferta-site2-0` carregam `4466808633585371`. Itens 3 e 4 de §4 e o item
  2 de §5 estão feitos.
- **Evento de compra pelo servidor (nosso):** não construir enquanto a Coinzz envia a API de Conversões. Os dois juntos mandariam a
  mesma compra duas vezes (sem um `event_id` comum, a Meta não deduplica). Só volta à mesa se a Coinzz não enviar a compra da entrega
  (pagamento na porta) — conferir no Gerenciador de Eventos depois das primeiras vendas.
- **Templates: submetidos pelo sócio, aguardando aprovação da Meta.** Aprovados → declarar em `channel.templates` (JSON em
  `03-templates-meta.md`) e gravar o config.
- **PR #83** aberto para a `main` (CI verde: `check` e as 8 partes de mutações). Correções do `/code-review` de 29/10 (grafo §136) estão
  na branch, **não publicadas** (no ar segue a v47).

## 11. Decisões do operador em 29/10

- **WhatsApp usa os mesmos 3 checkouts da Coinzz do site** (nas duas origens): o fechamento pela importação da Logzz fica no código,
  desligado (config sem `logzzImport`). Perde-se o pagamento na entrega onde só a Logzz tem estoque (G em SP/Guarulhos/Campinas/Santos,
  M em BH) até o fornecedor alinhar os estoques; ganha-se pixel e API de Conversões em toda venda.
- O operador gravou em 28/10 20:09 UTC um config próprio (sha `5cbc06b0…`, não reproduzível pelos arquivos do repositório) com:
  cupom SUPER20 ativo, `expressActive: true`, `conversationCapBrl: 0.3`. **Ele ainda tem `logzzImport`.**
- Arquivo para colar: [`business-config-2026-10-29.min.json`](business-config-2026-10-29.min.json) = 27/10 + essas três mudanças
  (sha `fc097252…`).
- Conferido: o cupom SUPER20 funciona nos checkouts (1 peça R$ 87,92; 2 peças R$ 158,26, empilha com o desconto do kit); o teto de
  R$ 0,30 está acima do custo real (18 conversas desde 20/10: p50 R$ 0,018, p95 R$ 0,089, máximo R$ 0,139).
- Atenção: nenhuma consulta de 27–29/10 devolveu entrega Express (só "Padrão"); com `expressActive` a Malu diz que o Express existe
  "em algumas regiões" e manda conferir no checkout. Com o cupom, 1 peça rende ~R$ 16,80 por pedido (empate em ~8,4 vendas a cada
  100 leads a CPL R$ 1), contra R$ 32,10 sem cupom.

## 12. Âncora de R$ 179,90 e a imagem de preço (29/10)

- Operador: âncora **R$ 179,90 por unidade**, e o selo continua "40% OFF" (a conta exata é 38,9%).
- **A imagem de preço que a Malu manda estava errada em produção** ("DE R$ 216,50 POR R$ 129,90" desde a troca de preço de 27/10).
  Nova imagem "DE R$ 179,90 POR R$ 109,90" gerada sobre a mesma foto e publicada no mesmo endereço
  (`storage/v1/object/public/funil/preco.png`); a antiga ficou em `funil/preco-129-backup.png`; cópia no repositório em
  `docs/agente-ia/06-script/midia/preco_109.png`.
- Site: `ANCHOR_PRICE = 179.9`, selo fixo "40% OFF" (Encorpa-Website `3c8659f`, publicado na `main`).
- Config: [`business-config-2026-10-29b.min.json`](business-config-2026-10-29b.min.json) = 29/10 com `anchorBrl: 179.9`
  (sha `76ca1786…`); as frases de preço com a âncora nova passam a cadeia de gates.

## 13. PAUSA de 2026-10-29 ~12:30 UTC — estado exato para retomar

### No ar agora
| Peça | Estado |
|---|---|
| `turn` | **v47** (commit `329cb31`). As correções do `/code-review` (§136) e do teste prático **não** estão publicadas |
| `BUSINESS_CONFIG` | **`business-config-2026-10-29b.min.json`**, colado pelo operador às 12:20 UTC (sha do arquivo com a quebra de linha final: `5499fc25…`, conferido). Sem `logzzImport` (WhatsApp usa os checkouts da Coinzz), cupom SUPER20 ativo, `expressActive: true`, teto R$ 0,30, âncora **R$ 179,90** |
| Imagem de preço | `funil/preco.png` = "DE R$ 179,90 POR R$ 109,90" (a antiga em `funil/preco-129-backup.png`) |
| Site | Encorpa-Website `main` `3c8659f`: âncora R$ 179,90, selo "40% OFF" (decisão do operador: manter 40%, a conta exata é 38,9%) |
| Coinzz | frete grátis, pixel `4466808633585371` + API de Conversões cadastrados pelo operador (conferido nos 3 checkouts) |
| Templates | submetidos pelo sócio, aguardando a Meta |
| PR | **#83** (`claude/site-whatsapp-test` → `main`), CI verde até `d14f048` |

### Feito hoje (29/10)
1. `/code-review` alto do diff inteiro: 8 achados, 7 corrigidos (commit `59dffe3`, grafo §136), o 8º (template de carrinho MARKETING sem opt-in) fica como decisão do operador com aval de conformidade pendente.
2. Regressão completa em `59dffe3`: 9.376 testes, typecheck, lint, `typecheck:function`, `dev:conversas` 1655/1655, `dev:gates` 0 afrouxados; CI do PR: `check` + 8 partes de mutações verdes.
3. Teste prático com o modelo real (R$ 0,16 de R$ 2,50; nenhum pedido real, nenhuma mensagem; dados de teste apagados): anúncio, site, mídia a pedido, checklist + resumo + SIM da importação (contra um servidor falso), links da Coinzz, kit, M. Defeitos D1–D8 na seção 9 do relatório (abaixo, "parou no meio").
4. Decisões do operador: WhatsApp nos checkouts da Coinzz; cupom só no follow-up; âncora R$ 179,90 com 40% OFF; Express ligado; teto R$ 0,30.
5. Imagem de preço errada em produção achada e trocada; site e config com a âncora nova.

### Parou no meio
- **Branch `wip/practical-fixes-coupon-2026-10-29` (commit `6961ec0`), NÃO revisada, NÃO publicada, fora do PR:** correções do teste prático e o cupom só no follow-up (grafo §137 rascunhado).
  - D1: "qual tamanho pra quem veste 42?" respondido (era vetado por `size_claim`); D3: depois do vídeo a pedido, o modelo sabe que ele já foi; D4: "não vi o vídeo ainda, manda?" é pedido; D8: caixa do kit com o preço do kit e sem "Chegará em Menos de 24 Horas" falso; D6/D5/D2 do fechamento pela Logzz (desligado).
  - Cupom: na conversa a Malu não oferece nem cita o cupom (nem nega); só depois que o toque do cupom foi enviado a ela ou se ela citar o cupom/código. Gate + prompt.
  - Validado no estado salvo: `pnpm test` 9.435 ✓, typecheck ✓, lint ✓, `typecheck:function` ✓, `dev:conversas` 1655/1655 ✓, `dev:gates` ✓, espelho ✓.
  - **Faltam:** conferir/terminar as mutações `O39-*` (25 já escritas; o implementador parou ajustando quatro delas) e rodar o verificador numa cópia commitada; revisão Opus; reteste com o modelo real só de D1/D3/D4/D8 e do cupom (centavos).
- **Risco no ar até a v48:** a v47 com cupom ativo pode **citar o cupom na conversa** (o briefing do `coupon_exists` autoriza). Se isso incomodar antes da v48: `coupon.active: false` no config.

### O que falta, em ordem
1. Terminar a `wip/practical-fixes-coupon-2026-10-29`: mutações O39, revisão Opus até APROVADO, reteste curto com o modelo real (≤ R$ 0,50), mesclar na `claude/site-whatsapp-test` (PR #83), CI verde.
2. Publicar a **v48** (`pnpm deploy:turn`, precisa do "pode publicar" do operador — ele já deu para esta rodada) e conferir o alarme `healthy`.
3. Operador: pedido de teste real **não se aplica mais** à importação (desligada); fazer um pedido de teste pela Malu → link da Coinzz → pagar na entrega (ou Pix) e cancelar, para provar o webhook de venda e a régua pós-pedido com a Coinzz.
4. Sócio: templates aprovados → declarar `cart_recovery`, `pix_pending`, `silence_3_retomada` em `channel.templates` (JSON em `03-templates-meta.md`) + gravar o config.
5. Fornecedor: alinhar o estoque Coinzz × Logzz (G em SP, M em BH perdem o pagamento na entrega no checkout da Coinzz).
6. Lead de teste da Coinzz (telefone terminado em 4554): excluir das métricas ou apagar.
7. Teste A/B de 5 dias (sócio liga os conjuntos), leitura diária; critério anúncio por venda ≤ R$ 27 (sem cupom; com cupom no follow-up o empate de 1 peça sobe).
8. Merge do PR #83 com o OK do operador.


## 14. NO AR: `turn` v48 (2026-10-29 14:37 UTC)

- **Publicada:** `agent_version` 48, função `turn` v177, commit `1e4609c` (branch `claude/site-whatsapp-test`, PR #83), config
  `business-config-2026-10-29b` sem mudança. Substitui a v47: o risco do cupom citado na conversa (§13) acabou.
- **O que a v48 traz:** o cupom SUPER20 só é liberado depois que o toque de follow-up com ele foi enviado (`couponTouchSent`), nunca na
  oferta da conversa (grafo §137); "Menos de 24 Horas" de volta para a primeira data de amanhã; os defeitos D1–D8 do teste prático; e os
  dois furos do kit achados no reteste curto (grafo §138: "as duas G" não vira nome; a caixa do kit pergunta o tamanho da peça que falta).
- **Reteste curto com o modelo real** (R$ 0,12, leads sintéticos apagados): 7 de 7 cenários como esperado; cupom nunca citado nem negado
  com a palavra; âncora 179,90 em toda resposta de preço, 216,50 em nenhuma.
- **Fato de estoque para o operador:** na Coinzz o G em São Paulo não tem pagamento na entrega (estoque do G em Belo Horizonte); GG e XGG têm.
- **Validação antes da subida:** 9.545 testes, lint, typecheck, `typecheck:function`, `dev:conversas` 1655/1655, `dev:gates --fail-on-loosen` ok.

**Falta (operador):** decidir se a Malu cita os preços dos kits com cupom depois do follow-up (2 peças R$ 158,26); pedido de teste pela
Malu → link Coinzz (cancelar depois); aprovação dos templates → `channel.templates`; estoque Coinzz × Logzz com o fornecedor; tirar o lead
de teste da Coinzz (final 4554) das métricas; teste A/B de 5 dias; merge do PR #83 com o OK dele; apagar as branches
`wip/checklist-close-2026-10-28` e `wip/practical-fixes-coupon-2026-10-29` (superadas).
