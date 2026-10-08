# Histórico inicial — o que já quebrou, por quê, e como foi consertado

> Lido pelo Hermes em toda execução, depois de `decisoes.md` (operador, 2026-10-08). É o ponto de partida
> dele: casos reais auditados e o que cada um ensinou. Fonte de verdade de cada linha:
> `docs/documentacao/decisoes/04-grafo-de-decisoes.md` (§ citado) e as auditorias em
> `docs/agente-ia/10-auditoria/`. Sem dado de cliente: nenhum telefone, nome, CPF ou CEP real.
> Mudou o grafo com uma lição nova de conversa real? Acrescente aqui, no mesmo commit.

## Como diagnosticar (a ordem que os casos reais ensinaram)

1. **Primeiro a integração, depois o texto.** Antes de propor mudar o prompt, confira se o dado que
   alimenta a diretiva existia. Em 2026-10-07, seis sintomas de texto ("o checkout confirma", nenhuma
   opção de pagamento) vinham de uma consulta à Coinzz sem um cabeçalho HTTP, falhando desde 24/09: a
   região era nula em todo turno (§66). Sinal: a mesma frase de "não sei" em toda conversa, de qualquer
   praça.
2. **Leia o `turn_outcomes` e o `gate_traces` da conversa**, não só as mensagens. "fallback", "handoff com
   nenhuma reescrita passou" e o mesmo gate vetando 3× seguidas são defeito de prompt ou de gate, não da
   cliente.
3. **Toda promessa de ação precisa de um código que a cumpra.** "Já te mando o link", "vou conferir seu
   CEP", "anotei" sem nada acontecendo depois: a cliente espera e desiste (§66, quatro vezes numa conversa).
4. **Palavra de saída ao lado de pedido de compra é compra.** "Pare de me mandar confirmações, apenas me
   mande o link" bloqueou uma compradora para sempre (§66). O bloqueio é terminal: na dúvida, não bloquear.
5. **Toda regra fixa lê o que ela disse, não o marcador do sistema.** O áudio transcrito chega com um
   prefixo; sem tirá-lo, "quero falar com uma pessoa" por voz não chamava ninguém (§66).
6. **Repetição é defeito.** O mesmo pedido (CEP, número da calça) mais de duas vezes seguidas, a mesma
   pergunta de gancho em toda resposta: a cliente sente robô e some (personas de 2026-10-08).
7. **Um gate que veta a frase honesta é tão ruim quanto um que deixa a mentira passar**: a conversa vai
   para uma pessoa ou para a resposta de reserva. Ex.: "parcelar só no antecipado, na entrega é à vista"
   numa frase só era vetado; o conserto foi o prompt ensinar a frase sozinha, sem afrouxar o gate.

## Como um conserto certo é feito aqui (para a sua proposta caber)

- O modelo só escreve texto; ação é TypeScript determinístico (R11.1). Proposta que pede para o modelo
  "decidir" uma ação é recusada.
- **Prompt e gate são a mesma promessa escrita duas vezes**: toda frase que o prompt ensina passa a cadeia
  de gates (`tests/prompt.test.ts`). Proposta que muda só um dos dois está incompleta.
- Cada conserto leva: teste com a frase literal da conversa **e as negações**; o par espelhado
  `src/agent/X.ts` ↔ `supabase/functions/turn/X.ts`; uma mutação em `src/dev/verify-guards.ts`; o registro
  no grafo. Gate afrouxado precisa nomear a mentira vizinha que continua vetada (`pnpm dev:gates`).
- O que o operador decidiu não se reabre sem motivo novo (ver `decisoes.md`, `regras.md`).

## Casos reais e o que ficou

| Quando | Caso | Sintoma | Causa | Conserto (e o que falhou antes) | Guarda |
|---|---|---|---|---|---|
| 2026-10-06 | 1º teste real (§60–§63) | "Desculpa, não entendi" para resposta solta; resposta dela descartada quando escrevia de novo; link antes dos dados | Escada do tamanho sem leitura da resposta solta; rajada lida mensagem a mensagem; código obedecendo o prompt antigo | Rajada lida inteira, a mais nova vence (§61); dados antes do link (§62–§63) | testes de rajada e de link-depois-dos-dados |
| 2026-10-07 | v10, cinco defeitos (§65) | Link reenviado a cada pergunta; "sim" às duas opções em laço; "desisti" levava o link | Janela de 3 mensagens; diretiva sem "concordou sem escolher"; sem leitor de desistência | Link só sai de novo se ela pedir ou o pedido mudar; frase do padrão para o "sim"; `withdrawsInBurst` | `R65-*` |
| 2026-10-07 | 2º teste real (§66) | Compradora deu tudo, pediu o link 5×, não recebeu, e foi descadastrada | Região nula (cabeçalho da Coinzz); opt-out lia "pare de me mandar"; promessa sem gate; CEP de 9 dígitos nunca lido; recusa de e-mail lida como "vou pensar" | Cabeçalho de volta; compra vence a saída; `pending_promise`, `noted_claim`; CEP errado avisado; e-mail removido de vez | `G66-*` (36 mutações) |
| 2026-10-07 | Personas, rodada 2 (§66) | "Com 38 de calça o seu é o M" sem ela dar medida; "me fala de novo o que você quer saber?" a "quanto que é" | Modelo inventando medida; resposta de reserva genérica | `size_claim`; reserva vira o preço (pergunta de preço) ou uma pessoa (decisão 16) | `size_claim`, teste da decisão 16 |
| 2026-10-07 | Revisão completa (§66) | Áudio por voz ignorado pelas regras; "quando vai me mandar o link?" não reenviava; telefone lido como CEP | Marcador do áudio; condição lida em qualquer posição; CEP aceito em qualquer número | `spoken()`; condição só "se…/quando eu…"; CEP ao lado da palavra ou mensagem inteira | `G66-audio-*`, `G66-link-condicional`, `G66-cep-errado` |
| 2026-10-08 | Personas, rodada 3 (§66) | CEP pedido 10× seguidas; o mesmo gancho em toda resposta; Jussara para uma pessoa no "vou querer um" | Sem limite de repetição; o limite novo contava pedidos não seguidos e vetava o pedido necessário | `cep_insist` só em sequência e livre na decisão de compra; `hook_repeat`; `size_insist` | `D17-*`, `D18-*`, `P8-*` |

## Decisões do operador que valem como regra (não proponha o contrário)

- Dados pedidos: só **tamanho, CEP, nome e CPF**; o resto ela preenche no checkout (2026-10-08). Nada de
  e-mail (2026-10-07).
- Pagamento: a pergunta das duas opções fica; **na entrega o frete é grátis, no antecipado é cobrado por
  região** (2026-10-08).
- No máximo 2 pedidos seguidos do mesmo dado e 1 pergunta de gancho por conversa (decisões 17 e 18).
- O modelo da conversa é do operador, à mão; o teto de custo é dele.
- Arquivo de diagnóstico não se apaga (2026-10-08).
