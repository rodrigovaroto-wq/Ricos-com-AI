# Frentes de integração da Malu: o que conversa com o quê, e como provar

> Escrito em 2026-10-09, ao fim do L2 (grafo §67), depois de testar cada frente pela produção.
> Toda frente abaixo tem: quem chama, como se autentica, como provar que está de pé e a última prova.
> Quando uma frente mudar, atualize a linha dela com a data e a prova nova.

## Mapa

```
Cliente (WhatsApp)
  └─ Meta Cloud API ──webhook──▶ função `whatsapp` (Supabase)
        │                         ├─ áudio → Meta ASR (muse-voice-transcribe-1.0)
        │                         ├─ imagem → Meta chat (muse-spark-1.3, image_url)
        │                         └─ selo HMAC ──▶ n8n "Turno da agente" ──▶ função `turn`
        │                                                                  ├─ Meta chat (CONVERSATION_MODEL)
        │                                                                  ├─ ViaCEP + Coinzz stock-and-delivery-day
        │                                                                  └─ Supabase (estado)
        ◀── n8n "WhatsApp envio" ◀── resposta / toque da régua / template
n8n "Relógio da régua" (5 min) ──▶ `turn` job followups ──▶ envios, handoffs, bloqueios (e-mail)
Coinzz / Logzz ──webhook──▶ n8n "Venda confirmada" ──▶ `turn` job order ──▶ orders + régua pós-pedido
n8n "Responder cliente" (formulário com senha) ──▶ `turn` job human_reply
n8n "Hermes: decisão" (15 min + formulário com código por proposta) ──▶ hermes_proposals
```

## Frentes

| # | Frente | Autenticação | Como provar | Última prova |
|---|---|---|---|---|
| 1 | Meta → função `whatsapp` (webhook) | `WHATSAPP_VERIFY_TOKEN` no GET, assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` no POST | GET com token errado → 403; POST sem assinatura → 401; mensagem real no WhatsApp gera linha em `messages` | 2026-10-09: 403 e 401 em `whatsapp` v24; conversas reais de 08/10 |
| 2 | `whatsapp` → n8n `encorpa-inbound` → `turn` | selo HMAC (`INBOUND_SIGNING_SECRET`); `turn` exige service_role (`TURN_REQUIRE_SERVICE_ROLE`) | POST em `turn` sem selo → 401 | 2026-10-09: 401 em `turn` v90 |
| 3 | Leitura e "sem digitando" | Graph API com `WHATSAPP_TOKEN` | Tiques azuis ~2 s depois da mensagem, sem "digitando" | código em `whatsapp` v24 (prova no próximo teste real) |
| 4 | Áudio → Meta ASR | `META_API_KEY` (só a Meta) | Nota de voz vira "[áudio da cliente, transcrito…]"; `llm_calls` purpose `transcribe` | 2026-10-08 (prova real do operador) |
| 5 | Imagem → Meta chat (visão) | `META_API_KEY`; `VISION_MODEL` (padrão `muse-spark-1.3`) | Foto vira "[a cliente mandou uma imagem, descrita automaticamente…]"; `llm_calls` purpose `vision` | 2026-10-09: API respondeu certo a uma imagem de teste; prova real no próximo teste |
| 6 | `turn` → Meta chat (conversa) | `META_API_KEY`; `CONVERSATION_MODEL` + `_PRICE` (do operador) | `llm_calls` purpose `interpret`/`reply` | 2026-10-08/09: 77 chamadas, R$ 0,20 |
| 7 | Cobertura: ViaCEP + Coinzz `stock-and-delivery-day` | pública; Coinzz exige `X-Requested-With: XMLHttpRequest` e **CEP só em dígitos** | `zip_code=04710090` → 200 com datas; com hífen → 422 (o código manda dígitos) | 2026-10-09 (memória `coinzz-cep-so-digitos`) |
| 8 | Links de checkout (Logzz entrega; Coinzz antecipado e kits) | públicos; link pré-preenchido com nome, telefone, CPF (e e-mail no antecipado) | os 6 respondem 200 | 2026-10-09 |
| 9 | Coinzz → n8n `encorpa-venda` → `turn` | `?token=` na URL = `SALE_WEBHOOK_TOKEN`; `?fonte=coinzz` | "Testar URL" no painel; venda sintética com lead `5500099…` (apagar depois) | 2026-10-09: teste do painel recebido; sintético com `product_code` do G → gravado com G |
| 10 | Logzz → n8n `encorpa-venda` → `turn` | idem, `?fonte=logzz` | idem | 2026-10-09: teste do painel recebido; sintético sem tamanho → gravado sem tamanho + e-mail "Venda gravada SEM tamanho" |
| 11 | Relógio da régua → `turn` job followups | service_role | execuções do workflow `SVDtFUi2N9oOskkx` todas `success` | 2026-10-09: 60/60 |
| 12 | WhatsApp envio (texto, botões, template) | credencial "WhatsApp Cloud API" no n8n | mensagens chegando no celular; `pnpm dev:n8n` ok | 2026-10-09: `pnpm dev:n8n` ok (versão ativa `25ce1447…`) |
| 13 | Templates fora da janela de 24 h | aprovados na Meta + `channel.templates` no `BUSINESS_CONFIG` | toque fora da janela sai como template; sem template → e-mail de bloqueio | operador, 2026-10-09: todos colados e aprovados |
| 14 | E-mails ao operador (SMTP do n8n) | credencial "SMTP e-mail" | handoff, venda não mapeada, tamanho que faltou, status novo, bloqueios | 2026-10-09: e-mails das vendas de teste entregues |
| 15 | Responder cliente (pessoa responde pela Malu) | formulário com basic auth | memória `n8n-editor-tira-senha-do-formulario`: ative só com `pnpm dev:n8n` dizendo ok | `pnpm dev:n8n` ok em 2026-10-09 |
| 16 | Hermes: decisão | formulário com `decision_token` por proposta (sem ele, "Link inválido") | — | sem mudança nesta sessão |

## Como as vendas são lidas (n8n "Normaliza a venda")

- **Telefone, pedido, valor, quantidade, status, data:** campos confirmados nos payloads reais (testes de
  2026-10-09 em `tests/fixtures/`).
- **Tamanho**, nesta ordem:
  1. campo explícito `size`/`tamanho`;
  2. Coinzz: `order.product_code` com o código de cada tamanho (`pro4gpo2`=P, `proqvqmj`=M, `pro7ml00`=G,
     `pro66jdm`=GG, `proe50v0`=XGG);
  3. Logzz: `products.main.variations[]`, o tamanho no fim do nome de cada variação, repetido pela quantidade;
  4. o nome do produto;
  5. o complemento do endereço.
- **Sem tamanho em lugar nenhum:** a venda é gravada assim mesmo (migração 0025) e chega o e-mail "Venda
  gravada SEM tamanho" com o payload cru. Se o tamanho estiver no payload, esse e-mail fecha o mapeamento.

## Teste completo antes de cliente real (roteiro)

1. Operador e sócio: uma compra no antecipado pagando o Pix de verdade e uma com pagamento na entrega.
2. Conferir em `orders` que as duas vendas entraram, com o tamanho certo. Se o tamanho veio nulo, o e-mail
   "Venda gravada SEM tamanho" traz o payload: ajustar o normalizador.
3. Conferir que "paguei" responde "Seu pagamento já foi confirmado aqui" quando a venda já entrou, e que a
   confirmação do pedido saiu.
4. Auditar as duas conversas pelo [roteiro](auditar-conversa-real.md).
