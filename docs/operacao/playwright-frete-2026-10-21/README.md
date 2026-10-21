# Frete do antecipado: a consulta da Malu contra o checkout real da Coinzz (2026-10-21)

**Pergunta:** o valor que `prepayFreight` (`src/agent/availability.ts`) devolve é o "Frete" que o checkout antecipado de 1 peça mostra
para o mesmo CEP e o mesmo tamanho? Pedido do operador em 21/10: "todos os fretes devem bater tanto no Playwright quanto na consulta do agente".

**Método**
- **Lado do checkout** (`pw-all.cjs` + `pw-check.cjs`, cópia de `../playwright-coinzz-2026-10-20/check.cjs` que também grava a consulta
  `stock-and-delivery-day` que a própria página faz): o checkout `encorpa-pagamento-antecipado-0` dirigido como cliente, até a tela do Pix.
  **Todo POST abortado** menos as leituras sem dado pessoal; `aborted` = 0 em todas as rodadas; nenhum lead ou pedido criado.
- **Lado do agente** (`agent.mts`): o mesmo caminho do turno (`lookupRegion` → `region.place` → `prepayFreight`), com o mesmo
  `regionFetcher` da `turn` (o erro leva o corpo; a primeira versão do script não levava e lia o 400 "sem entrega" da Logzz como
  falha — erro do script, não do agente). Só os placeholders de `availabilityQuery`, nunca nome, telefone ou CPF de cliente.
- 16 CEPs de 12 estados (`ceps.json`) × P, M, G, GG, XGG = 80 casos; mais 2 CEPs gerais de cidade (sem rua: `pw-check2.cjs` preenche
  rua e bairro como a cliente faria) × 3 tamanhos, e os dois lados de novo.

**Resultado**

| Bateria | Casos | Iguais |
|---|---|---|
| 16 CEPs × 5 tamanhos | 80 | 80 (79 na primeira passada + Rio de Janeiro GG repetido 3×, veja abaixo) |
| CEP geral de cidade (Siqueira Campos/PR, Abaeté/MG) | 7 | 7 |

- **M:** sem frete nos dois lados em todos os CEPs (a Coinzz responde 404; o checkout mostra "CEP não encontrado") — já registrado no §116.
- **Arredondamento:** a Coinzz devolve 3 casas (19,345; 33,315; 28,254999…); a página mostra meio para cima (19,35; 33,32; 28,25).
  `prepayFreight` arredonda igual nos três — o `toFixed(2)` comum daria 33,31.
- **Rio de Janeiro GG, primeira passada:** a página não chegou a fazer a consulta de frete (nenhuma `stock-and-delivery-day` gravada,
  "Pedido principal" sem frete). Repetido 3× em `one.cjs`: 31,29 nas três, igual ao agente. Falha da automação naquele passo, não divergência.
- **O bairro não muda o frete** (`gen.mts`: "Bela Vista", "Centro", "Qualquer" dão o mesmo valor); **bairro vazio** faz a consulta voltar
  vazia, e aí a Malu fica com a frase de hoje ("aparece no checkout"). A consulta do agente nunca manda bairro vazio para CEP com rua; para
  CEP geral manda "Centro", e o valor bateu com o checkout.

**Não coberto:** kits de 2 e 3 peças (o frete do kit não sai desta consulta: G+GG em SP é 33,17); o valor muda quando a Coinzz muda a
tabela — esta prova vale para 21/10.

Execução: `NODE_PATH=$(npm root -g) node pw-all.cjs` e `NODE_USE_ENV_PROXY=1 npx tsx agent.mts` (scripts com caminho absoluto do container).
