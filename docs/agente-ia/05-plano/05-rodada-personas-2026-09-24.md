# Rodadas 1 e 2 das personas — 2026-09-24

Relatório completo, com as 24 conversas anotadas mensagem a mensagem:
[artifact "Malu nas 12 personas"](https://claude.ai/artifact/QEVUkRhKsooGd2cDoNUYEH) (privado).
Transcrições brutas: `data/persona-runs/2026-09-24T03-04-34-314Z-local` (R1) e
`…T03-27-00-630Z-local` (R2), git-ignored.

**Setup:** porta `local` (v33 do disco), `muse-spark-1.3-contributor`, `reasoning_effort`
mínimo, banco de produção com telefones sintéticos apagados no fim. R1 com o prompt de tom
novo (`6bceca1`); R2 com `0a18cdf` + `ff935fa` + `0743bd2`. Custo: R1 R$ 0,15, R2 R$ 0,24.

**Resultado:** 0 de 12 chegaram ao link nas duas rodadas. O texto do modelo está quase
sempre certo; a venda trava em código e configuração.

| # | Achado | Dono |
|---|---|---|
| 1 | E-mail obrigatório trava a venda (Jussara, Karol, Rafa, Vera); pergunta fixa de `identity.ts` repetida palavra por palavra | operador decide se o link sai sem e-mail |
| 2 | `wantsHuman` só casa a mensagem inteira; Sandra pediu pessoa e a Malu disse "já chamei" sem handoff | código |
| 3 | `extractDressSize` não lê "ela usa G 46" nem a letra; tamanho antigo (M) sobrescreveu o novo (Karol) | código |
| 4 | Prompt manda anunciar a Express, que não está de pé em nenhuma praça (Rafa) | código |
| 5 | Pós-venda: finge consultar/cancelar pedido e inventa "área do pedido" (Lu) — deve ir para humano | código |
| 6 | Falsos vetos (`warranty_promise` lê "até 3 dias" como garantia; `unattributed_window`) viram a resposta pronta, que ignora a pergunta | código, com segunda revisão |
| 7 | `fetch failed` na chamada ao modelo vira handoff definitivo (Vera R1) — tentar de novo uma vez | código |
| 8 | Recusa a medida da cintura, embora a tabela seja por cintura (Marcinha); troca G/M/G | código + prompt |
| 9 | Cliente telegráfica ("ta", "?") gera loop de 19 perguntas iguais (Neusa) | código + prompt |
| 10 | Recepção automática promete "uma de nossas atendentes" | operador |
| 11 | "Restam 12 unidades" sem contagem real (`allowUnverified: true`) e com motivo inventado | operador |
| 12 | Explicação do CPF/dados inventada pelo modelo; falta CNPJ no config | operador (texto aprovado) |
| 13 | Opt-out com pergunta no meio: para certo, mas não responde o preço pedido (Rose) | código |
| 14 | Estilo: mediana de 49 palavras por mensagem, 29% das frases acima de 30 palavras, pergunta de roupa em quase todo turno | prompt |

**O que já funciona:** honestidade sobre o produto, preço/desconto/frete corretos, consulta
de região (Manaus → antecipado), gates pegando "amanhã"/cupom/parcela/frete grátis, e a
identidade de assistente virtual.

---

## Rodada 3 — 2026-09-24, com a rodada 13 de decisões

Código em `8814026`. Custo R$ 0,26. Transcrições: `data/persona-runs/2026-09-24T19-28-10-092Z-local`.
Relatório com as 36 conversas: mesmo artifact, versão 2.

**Resultado:** 4 de 12 receberam o link (0 antes); 1 venda limpa (Rafa); 0 respostas
prontas; mediana de 37 palavras por mensagem; 5% de frases acima de 30 palavras; custo por
resposta +60% (intérprete + prompt maior). Dos 14 achados, 11 resolvidos, 1 parcial
(pós-venda), 1 sem exercício (retry de rede), 1 mantido por decisão (escassez).

| # | Achado da rodada 3 | Dono |
|---|---|---|
| 1 | A consulta `stock-and-delivery-day` da Coinzz passou a redirecionar (302 para a home) em 24/09 entre 03h e 19h UTC; sem região, a Malu afirmou "chega sim em Manaus" e mandou o link COD | código (nunca afirmar cobertura sem consulta) + operador (Coinzz) |
| 2 | Pós-venda de quem diz que já comprou não vai para humano sem pedido no banco (Lu, Vera) | código |
| 3 | Nome errado no link ("oii desculpa sumi kkk"; compra para a mãe) | código |
| 4 | Domínio `logzz.com.br` no link assusta cliente desconfiada (Jussara desistiu) | operador (link no domínio da marca) |
| 5 | "Vou nesse então" com tamanho conhecido não manda o link (Marcinha) | código |
| 6 | Despedida dispara a escada do tamanho (Tati); escada recomeça depois de "vou ver" (Neusa) | código |
| 7 | "Manequim 40" lido como calça (Marcinha, G→M) | código |
| 8 | Diretiva de região sem COD ainda diz "mesmo frete grátis" (`sizeDirectiveFor`) | código |
| 9 | Instruções do link repetitivas; e-mail pedido depois do link (Cleide) | código |

---

## Rodada 4 — 2026-09-24

Código em `f34e0fa`. Custo R$ 0,21. Transcrições: `data/persona-runs/2026-09-24T20-16-00-949Z-local`.
Relatório: mesmo artifact, versão 3.

**Resultado:** 3 vendas encaminhadas (Jussara, Karol, Marcinha: link com nome e tamanho
certos), 4 links, 3 handoffs certos (Lu e Vera pós-venda, Sandra pedido explícito), 1
resposta pronta, mediana de 37 palavras, 4% de frases longas, R$ 0,0027 por resposta.

| # | Achado da rodada 4 | Dono |
|---|---|---|
| 1 | Com a região desconhecida, `delivery_promise` julgou "1 a 3 dias" como antecipado → 2 vetos → resposta pronta (Cleide) | código |
| 2 | "manequim" no leitor de tamanho trocou G por M pela segunda rodada (Marcinha) | código |
| 3 | O mesmo link mandado duas vezes seguidas (Jussara) | código |
| 4 | Pergunta de tamanho em quase toda resposta de preço (Tati); e-mail e CPF pedidos antes do link a cliente desconfiada (Cleide) | prompt |
| 5 | Consulta de região da Coinzz continua fora do ar | operador |
| 6 | Link no domínio da marca | operador |
