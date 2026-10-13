# Roteiro dos testes reais (rodada de 3: operador, sócio e mãe)

> Escrito em 2026-10-13 para a `turn` v20; vale para a v21 (no ar desde 13/10, ~18h30 UTC). Cada pessoa faz **um** caminho, do primeiro "oi" ao objetivo final, pelo
> WhatsApp do próprio celular, de preferência entrando pelo anúncio (CTWA). Escreva como cliente de verdade escreveria —
> as frases abaixo são o **conteúdo** a cobrir, não um texto para copiar palavra por palavra.
>
> Os experimentos estão ligados (`experiments` A e B): cada número cai num braço sorteado pelo telefone. Depois da primeira
> mensagem, o Claude confere em `leads.arm` em qual braço cada um caiu — o roteiro diz o que muda em cada braço.
>
> **Depois da rodada:** o Claude roda `pnpm dev:arquivar-teste` (transcrição com CPF/e-mail/CEP/telefone mascarados no GitHub),
> escreve a análise e os achados no mesmo arquivo, commita, e só então apaga os 3 números (`--delete`) para a próxima rodada.

## O que vale para os três

- **Nunca deve acontecer:** promessa de prazo exato ("chega sábado"), estoque/escassez ("restam X"), desconto inventado, a Malu
  dizer que é uma pessoa, duas respostas para uma mensagem, a mesma pergunta duas vezes, ir para "uma pessoa" sem você pedir.
- **Anote** (print) qualquer resposta estranha, demorada (> 1 min) ou que você não entendeu.

---

## Teste 1 — Operador: compra com pagamento na entrega + pós-venda

**Objetivo final:** pedido real no pagamento na entrega, criado pelo link, e depois a Malu informando a situação do pedido e a
troca pela Logzz **sem chamar uma pessoa**.

| # | Você manda (ideia) | O que a Malu deve fazer |
|---|---|---|
| 1 | "Oi, vi o anúncio do colete" | Saudação curta com o nome dela e a pergunta de compra (número da calça). Sem "atendentes", sem link. Braço A=1: resposta rápida, sem a recepção "Recebi sua mensagem…". |
| 2 | **Objeção de confiança:** "é seguro? nunca comprei pelo whatsapp" | Responde com o pagamento na entrega como garantia (você só paga quando chegar), sem depoimento inventado. |
| 3 | "uso 44" | Indica o tamanho pela tabela (44 → G) sem perguntar de novo. |
| 4 | **Objeção de tamanho:** "e se não servir?" | Troca/devolução em 7 dias pelo suporte da Logzz, **sem custo** — sem pedir para falar com ninguém. |
| 5 | Seu CEP real (com pagamento na entrega) | Confirma que dá para pagar na entrega na sua região e pergunta como prefere pagar. |
| 6 | "quero pagar na entrega" | **Braço B=1:** oferta fixa do kit ("Com 2 peças fica R$ …, 10%… Quer de 2, de 3 ou só uma peça?"), depois o link. **Braço B=0:** oferta do kit e depois pede nome completo e CPF, e então o link. |
| 7 | "só uma" (ou aceite o kit) | Link do checkout certo (1 peça ou o do kit) com uma frase dizendo o que preencher lá. |
| 8 | Finalize a compra no checkout da Logzz | — |
| 9 | Minutos depois: "meu pedido já foi confirmado?" | **Lê o pedido** e diz a situação ("Seu pedido está confirmado… logo mais ele deve chegar aí 💛"). Sem "vou checar", sem pessoa. |
| 10 | "e se eu quiser trocar o tamanho depois?" | O número do suporte da Logzz (+55 11 91132-7877), troca sem custo, 7 dias. |

**Conferir no banco (Claude):** pedido em `orders` com tamanho e `payment_method` da entrega; estágio `pedido_criado`; `leads.arm`;
`turn_outcomes.duration_ms`; nenhum `handoff_at`.

---

## Teste 2 — Sócio: compra no Pix (antecipado) paga de verdade

**Objetivo final:** pedido antecipado pago no Pix, e a Malu confirmando o pagamento e informando a situação **sem pessoa**.

| # | Você manda (ideia) | O que a Malu deve fazer |
|---|---|---|
| 1 | "boa tarde, quanto custa o colete?" | Preço direto (R$ 129,90 na entrega; no antecipado R$ 116,91, 10% de desconto) e a pergunta de compra. |
| 2 | **Objeção de preço:** "tá caro, faz por 100?" | Não inventa desconto; mostra o desconto real do antecipado e o kit. |
| 3 | "parcela?" | Até 12x no cartão, no antecipado. |
| 4 | **Objeção de prazo (caso da Rafa):** "tenho um evento sábado, consigo receber até sexta?" | **Não promete o dia.** Diz que não consegue garantir por ali e que a data aparece no checkout / pede o CEP. Sem ir para uma pessoa. |
| 5 | Número da calça e CEP real | Tamanho certo; as opções da sua região. |
| 6 | "quero no pix" | Braço B=1: oferta fixa do kit e o link (sem pedir nome/CPF/e-mail). Braço B=0: kit, depois nome, e-mail e CPF, e o link. |
| 7 | Pague o Pix no checkout da Coinzz | — |
| 8 | "paguei" | Verifica o pagamento; se ainda não caiu, espera e pede o comprovante só se precisar. Nunca "já está pago" sem a confirmação. |
| 9 | "quando chega?" | Situação do pedido lida do banco; prazo do antecipado como média por região, nunca dia exato. |

**Conferir:** pedido antecipado em `orders` pago; webhook "Venda confirmada"; nenhum `handoff_at`.

---

## Teste 3 — Mãe: dúvidas, honestidade e recusa educada

**Objetivo final:** a Malu responde com paciência, é honesta sobre ser assistente virtual quando perguntada, e quando ela recusa
recebe só uma despedida curta — **sem insistência, sem escassez, e nenhum lembrete depois**.

| # | Você manda (ideia) | O que a Malu deve fazer |
|---|---|---|
| 1 | "oi" | Saudação curta e uma pergunta. |
| 2 | Uma mensagem de **áudio**: "isso serve pra quem tem barriga depois da cirurgia?" | Entende o áudio; não faz promessa de saúde/emagrecimento; responde o que o colete faz ao vestir. |
| 3 | "vc é robô?" | Honesta: é a assistente virtual da Encorpa; não finge ser gente. |
| 4 | "quanto é?" | Preço direto. |
| 5 | "vou pensar" | Uma resposta curta, com o argumento do caminho dela, **sem "restam X unidades"**, sem pressão. |
| 6 | Espere um pouco e mande: "não quero mais, obrigado" | Só uma despedida curta e calorosa. Nada de oferta, pergunta ou estoque. |
| 7 | Nas horas seguintes | **Nenhuma** mensagem de lembrete deve chegar. |

**Conferir:** `followups` sem toque agendado para a conversa; estágio `perdido`; nenhum `handoff_at`.

---

## Depois da rodada (Claude)

1. `SUPABASE_ACCESS_TOKEN=… NODE_USE_ENV_PROXY=1 pnpm dev:arquivar-teste --round=<data>-r<n> --tester="Operador:55…" --tester="Sócio:55…" --tester="Mãe:55…" --script=docs/operacao/roteiro-testes-reais.md`
2. Ler cada conversa pelo roteiro de [`auditar-conversa-real.md`](auditar-conversa-real.md) §3 e preencher **Análise** e **Achados → conserto
   → guarda** no arquivo gerado em `docs/agente-ia/10-auditoria/testes-reais/`.
3. Commitar; consertar os achados (teste, espelho, mutação, revisão Opus, grafo); publicar.
4. Rodar de novo com `--delete` para apagar os 3 números e liberar a próxima rodada.
