# Rodadas de personas de 2026-10-15 — os relatórios legíveis

Cópia dos `.md` gerados por `pnpm dev:personas` (os `.json` brutos ficaram fora: só existiam no scratchpad do container). Todas
na porta `local`, contra o banco de produção, com números sintéticos `5500099…` apagados ao fim de cada conversa.

| Pasta | Código | O quê | Análise |
|---|---|---|---|
| `00-teste-rapido-tati` | v23 (`main`) | 1 persona, 4 turnos: prova de que a porta local lê e escreve | — |
| `01-base-v23-13-personas` | v23 (`main`) | as 13 de segurança, antes do R24 (base) | `../2026-10-15-personas-r24.md` |
| `02-r24-13-personas` | R24 + revisão Opus | as 13 depois do R24 | `../2026-10-15-personas-r24.md` |
| `03-r24b-abertura-4-personas` | R24-b | Lu, Neusa, Beatriz, Sandra: a frase do produto só para quem não falou do colete | `../2026-10-15-personas-r24.md` |
| `04-cobertura-*` | R24-b, antes do §96 | as 55 ao mesmo tempo (26 fichas, 13 de segurança, 16 de venda): 3 morreram no 500 do §96 e 1 no 429 | `../2026-10-15-personas-cobertura.md` |
| `05-reexecucao-pos-500-*` | com o conserto do §96 | as 4 que tinham falhado, limpas | `../2026-10-15-personas-cobertura.md` |

Cada `.md` traz, no fim, a seção **Alertas** (desde a rodada `04`): leia só os turnos marcados.
