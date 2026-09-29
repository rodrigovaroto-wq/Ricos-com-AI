# Pipeline até produção real — 2026-09-29

**Este é o plano vigente.** Supera, como ordem de trabalho, a fila do topo do `HANDOFF.md` de
29/09 e a lista "Pipeline até anúncios e leads reais" dele; `00-plano-simples.md`,
`02-plano-de-execucao-ate-os-testes-reais.md` e o `README.md` desta pasta ficam como histórico e
desenho original. Achados que motivam cada item: [`../10-auditoria/2026-09-29-auditoria.md`](../10-auditoria/2026-09-29-auditoria.md).

Dono: **C** = Claude (sessão de código) · **O** = operador · **S** = sócio (Meta: Ads, BM, número,
templates). Cada fase tem uma **porta de saída**: sem ela verde, a próxima não começa.

## F0 — Fechar o código aberto (hoje → 1 dia)

1. **C** — CI verde nos PRs #42 e #43 → **O** faz o merge dos dois.
2. **O** — criar o link do Mercado Pago de **R$ 27,00** para a troca de tamanho.
3. **O** — no secret `BUSINESS_CONFIG`: `exchange: { feeBrl: 27, checkoutUrl: "<link>" }` e
   conferir `cost.conversationCapBrl: 0.5` (auditoria A3, A4).
4. **C** — depois do merge: registrar a decisão do valor (R$ 27,00 fixo) como **R17.2** em
   `03-decisoes-tomadas.md` e no grafo; corrigir o `_comment` de `config/business.example.json`
   (B5), `exchange.feeBrl` do exemplo para `27`, e as linhas velhas do `CLAUDE.md` (C5).
5. **O** — decidir: a agente cita os R$ 27,00 **antes** da compra, quando perguntada? Hoje (PR #42)
   diz só "o envio da troca é seu". Se sim, **C** muda prompt e gate juntos, com
   `tests/prompt.test.ts`, `pnpm dev:gates --fail-on-loosen` e mutação nova.

**Porta:** `main` com #42 e #43, CI verde, secret conferido.

## F1 — Publicar e provar (1 dia)

1. **O** — importar no n8n os workflows do `main` (`turno-da-agente`, `relogio-da-regua`,
   `venda-confirmada`, `whatsapp-envio`) → **C** roda `pnpm dev:n8n` até passar.
2. **O** — publicar a `turn` (hoje v41 → versão do `main`) e a `whatsapp` (canal ainda desligado).
3. **C** — sondas pela **porta do n8n**, não pela Edge Function direto: recepção; preço e prazo dos
   dois caminhos; frete grátis só com o caminho na frase; "vou pensar"; praça sem entrega; pedido
   de troca com pedido no contexto (valor R$ 27,00 + link + handoff); webhook de venda com data.
4. **C** — atualizar as memórias de deploy (C6) e o topo do `HANDOFF.md` com a versão no ar.

**Porta:** as sondas saem como esperado na versão publicada, conferida pelo formato da resposta
(isolate quente, ver memória).

## F2 — Pedido de ponta a ponta nos dois caminhos (1–2 dias)

1. **C** — pedido sintético COD (Logzz) e antecipado (Coinzz), cada status do webhook, estágio até
   `entregue_pago`.
2. **O** — confirmar o primeiro kit real (2/3 peças) e a taxa do parcelado do Mercado Pago.
3. **O** — decidir a copy do site "WhatsApp com gente de verdade" (auditoria A5) e, com isso,
   limpar a objeção 4 da base de conhecimento.

**Porta:** um pedido de cada caminho atravessa todos os status sem intervenção manual.

## F3 — Personas contra o que está no ar (1 dia)

1. **C** — as 12 personas pela porta do n8n contra a versão publicada, mais um roteiro novo: cliente
   com pedido pede troca de tamanho (valor R$ 27,00, link, handoff; nunca "grátis").
2. **C** — placar (`pnpm dev:placar`) e Hermes local sobre a rodada; mentira nova → conserto na
   origem com teste e mutação, e volta ao F1.

**Porta:** zero mentira de preço, frete, prazo, troca e saúde no placar.

## F4 — Canal WhatsApp Cloud API (depende do S)

1. **S** — app, número, token, webhook e templates aprovados (`06-script/03-templates-meta.md`).
2. **O** — segredos (`INBOUND_SIGNING_SECRET`, `TURN_REQUIRE_SERVICE_ROLE`), credencial no n8n.
3. **C** — `PHONE_NUMBER_ID`, `channel.templates`, teste template ↔ `renderFollowup`; opt-in de
   marketing (`askMarketingOptIn: true` só depois da 0019); por último `CANAL_ATIVO=true`
   (`docs/operacao/whatsapp-cloud-api.md`).
4. **S** — começar o aquecimento do número já — é o item mais longo do pipeline.

**Porta:** mensagem real entra, turno responde, template fora da janela de 24 h sai.

## F5 — Ensaio geral (2–3 dias)

1. **O** — trocar `CONVERSATION_MODEL` para o modelo sem `-contributor` (conversa real tem dado
   pessoal).
2. **C** — as 12 personas pelo WhatsApp de verdade; um pedido real pago de ponta a ponta; uma
   troca real cobrada pelo link de R$ 27,00.
3. **O** — assinar o piso de amostra (`08-piso-de-amostra.md`) **antes** de olhar número.

**Porta:** ensaio sem mentira, pedido e troca reais concluídos, piso assinado.

## F6 — Tráfego mínimo (contínuo)

1. **S** — anúncio só nas 22 praças com pagamento na entrega.
2. **C** — atribuição CTWA (`leads.source`); acompanhamento diário por `turn_outcomes`, handoffs,
   custo contra o teto de R$ 0,50 e `perdido`.
3. **Hermes** — roda a cada 50 leads; o operador aprova ou recusa cada proposta pelo link.

**Porta:** taxa de conversa → pedido e custo por lead medidos sobre o piso de amostra.

## F7 — Depois do tráfego (dívida nomeada, sem prazo)

- Conversions API; cupom real (sem ele o `silence_3` fica mudo); véspera do antecipado (polling da
  Coinzz); apps da Coinzz.
- Higiene (auditoria C7–C9): provedores OpenAI/Gemini só de dev — manter ou apagar; `@types/node`
  24; regerar ou datar os instantâneos de `09-cruzamento/`.
- Arquivar o histórico do `HANDOFF.md` (tudo abaixo do estado atual) num arquivo datado, deixando
  o `HANDOFF.md` só com o presente.
