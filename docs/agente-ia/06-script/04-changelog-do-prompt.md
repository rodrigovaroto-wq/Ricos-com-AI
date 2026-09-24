# Changelog do system prompt

O prompt é `src/agent/prompt.ts`, espelhado byte a byte em
`supabase/functions/turn/prompt.ts`. As versões anteriores a esta estão só no histórico do
Git desse arquivo (`git log -- src/agent/prompt.ts`). Toda entrada daqui para a frente diz o
que foi **medido**, e diz quando nada foi medido.

### 2026-09-24 — ritmo de conversa e concordância

- **Mudou (1):** o bloco de clareza deixou de mandar "Uma ideia por frase. Frase curta, ponto
  final, próxima." e "criança de 8 anos". Entrou o bloco `COMO VOCÊ ESCREVE`: vírgula mais que
  ponto, com um limite verificável ("duas frases seguidas com menos de oito palavras cada"),
  português falado com "né" no máximo uma vez por mensagem, e o tom de vendedora "o tom, não a
  identidade". As regras de clareza que protegem dinheiro ficaram (número diz a que se refere,
  sem jargão, uma oferta, antecipado como saída); a proibição de "emendar preço, prazo e
  pergunta" virou "preço e prazo ficam colados no pagamento a que pertencem, e os de um
  caminho nunca dividem a frase com os do outro".
- **Mudou (2):** "fechar bonito" saiu da cena concreta (o advérbio `bonito` é a origem mais
  provável de "voltar a usar bonita com ele"); a tática "pergunta viva no fim" ganhou duas
  perguntas-modelo corretas e "uma pergunta por mensagem"; o bloco novo manda reler cada frase
  por concordância nominal, verbal e pronome sem dono ("o colete", não "ele").
- **Por quê:** reclamação do operador em 2026-09-24, lendo respostas reais da Muse — estilo
  telegráfico e a frase "Me conta, qual roupa você queria voltar a usar bonita com ele?".
- **Medido:** nada contra o modelo ainda. As duas mudanças saíram juntas, a pedido, então o
  efeito de cada uma não é atribuível. `tests/prompt.test.ts` prova que as duas
  perguntas-modelo passam `runGates` nos dois caminhos e nos dois ramos de `freeShipping`, e
  `pnpm dev:conversas` segue 1640/1640 — mas o roteiro é determinístico e não chama o modelo.
  **A prova que falta:** rodar as personas contra `muse-spark-1.3` com `reasoning_effort:
  "minimal"` antes e depois, e contar (a) respostas com duas frases seguidas de menos de oito
  palavras, (b) erros de concordância numa leitura humana, (c) reescritas por gate — a (c) não
  pode subir, porque frase mais longa é onde prazo se solta do pagamento
  (`unattributed_window`).
- **Regressão:** nenhuma na suíte (3072/3072 com só esta mudança sobre a HEAD). Caso negado
  coberto: tom humano não é afirmar ser pessoa — "Não sou robô" segue vetado, "Não sou uma
  pessoa, sou a assistente virtual" segue aprovado.
