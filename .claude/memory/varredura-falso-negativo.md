---
name: varredura-falso-negativo
description: Numa varredura de cobertura, falha de rede e "praça sem COD" são indistinguíveis — o urllib do Python leva 403 do proxy e devolve 43 cidades negativas; use curl e confira São Paulo/G antes de acreditar.
metadata:
  type: feedback
---

`readAvailability` trata resposta ilegível como "sem COD", de propósito: errar para o
antecipado é barato, prometer entrega inexistente é caro. A consequência só aparece numa
varredura — uma falha de transporte vira uma tabela inteira de "não" silenciosos, que lê
como apagão nacional de cobertura.

Aconteceu em 2026-09-21: o `urllib` do Python leva **403 do proxy deste ambiente** e as 43
cidades vieram negativas, duas vezes seguidas, com HTTP 200 e JSON bem-formado no relatório
final. O `curl` passa pelo proxy normalmente.

Duas regras ao rodar qualquer varredura de cobertura:

1. **Use `curl`**, não `urllib`/`fetch` do Python neste ambiente.
2. **Confira São Paulo com o G** — praça e tamanho sabidamente cobertos — antes de acreditar
   em qualquer resultado negativo em massa.
