# Ferramentas do agente

Conjunto mínimo derivado do mapa funcional. **Proposta de escopo, não decisão de
implementação** — a forma final depende do runtime escolhido.

Princípio herdado da pesquisa (DeskcommCRM → `inbound-turn.ts` :148–308, :154–161):

> **Texto só sai por tool.** `send_message` é o único caminho até a cliente. O que o
> modelo escrever fora dela não chega a ninguém. Sem essa regra não existe um ponto único
> onde verificar a mensagem — e sem esse ponto, guardrail é sugestão.

Segundo princípio, do mesmo arquivo: **schema largo para o modelo, validação estrita
depois.** O modelo vê campos permissivos; a validação real é uma whitelist. Campo extra ou
forjado vira **erro de ensino em pt-BR de volta ao modelo**, nunca exceção do SDK nem
descarte silencioso.

## Conversa

| Tool | Faz | Notas |
|---|---|---|
| `send_message` | Envia UMA mensagem à cliente | Único caminho de saída. Passa pela cadeia de verificações antes de sair — ver [`04-guardrails.md`](04-guardrails.md) |
| ~~`send_options`~~ | ~~Escolha estruturada por botão~~ | **Removida na rodada 2.** O operador decidiu texto livre sempre: botão entrega que é uma IA e tira a pessoalidade da conversa. A escolha de tamanho, endereço e confirmação é conduzida em texto |
| `get_lead_context` | Relê contato, estado e últimas mensagens | Deixa o modelo se recuperar de contexto truncado |

## Venda

| Tool | Faz | Notas |
|---|---|---|
| `recommend_size` | Cintura em cm, manequim → tamanho | **Determinística**, sobre a tabela; regra "na dúvida, o maior" embutida. Não é o modelo decidindo |
| `search_knowledge` | Busca resposta na base controlada | Alternativa mais barata: matcher determinístico injetando a skill certa, sem busca |
| `update_lead_state` | Marca avanço real no funil | Só o próximo estágio válido; regressão rejeitada. Exige evidência da conversa |

## Pedido

| Tool | Faz | Notas |
|---|---|---|
| `build_prefilled_checkout_link` | Chama a API da Coinzz para gerar o checkout personalizado com os dados da cliente e a modalidade já selecionada | **Mecanismo confirmado na rodada 4:** a Coinzz tem API própria para isso, além do webhook de status. A cliente sempre confirma no link — nunca envia dado de pagamento pelo chat |
| `get_order_status` | Status do pedido da cliente | Referência de forma: DeskcommCRM → `crm_list_contact_orders` (`lib/mcp/tools/comercio.ts` :27) |

## Memória e tempo

| Tool | Faz | Notas |
|---|---|---|
| `save_lead_fact` | Grava fato durável do lead | Tamanho, medo declarado, evento, restrição, o que já foi oferecido |
| `schedule_followup` | Agenda o próprio retorno | **Uma promessa, um agendamento.** Referência: DeskcommCRM → `inbound-turn.ts` :177, `schedule-followup.ts` :77 |

## Escape

| Tool | Faz | Notas |
|---|---|---|
| `request_human_handoff` | Passa a conversa para o operador | Segunda via obrigatória: **sentinela por regex no inbound**, que detecta pedido de humano **sem chamar o modelo** (custo zero). Referência: DeskcommCRM → `human-handoff.ts` :61, :252 |

## Proteção contra laço

O agente pode repetir a mesma chamada indefinidamente. Referência de mecanismo:
DeskcommCRM → `tool-breaker.ts` :92 (`canonicalHash`), :110 (`wrapToolsWithBreaker`) —
hash canônico do argumento detecta repetição e corta, com limiar diferente para tools de
leitura (:60).

## O que NÃO deve virar tool

- **Escrever texto livre fora de `send_message`** — quebra o ponto único de verificação.
- **Consultar preço** — preço é fonte única no contexto, não busca.
- **Decidir bloquear a cliente** — opt-out inequívoco é caminho determinístico; ambíguo
  escala para humano. Ver [`04-guardrails.md`](04-guardrails.md).
