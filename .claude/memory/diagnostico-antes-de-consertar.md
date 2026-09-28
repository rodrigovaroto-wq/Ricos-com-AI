---
name: diagnostico-antes-de-consertar
description: regra do operador (2026-09-28) — nunca consertar por tentativa e erro; primeiro análise profunda até a causa e a origem exatas, só então executar o conserto já sabendo o que precisa ser feito.
metadata:
  type: feedback
---

O operador exige (2026-09-28): diante de um problema, **não** testar soluções por tentativa e
erro. Primeiro, análise profunda: reproduzir, rastrear o caminho real (turno → gates → estado →
persistência → n8n) e achar a causa e a origem exatas. Só depois, com o panorama completo e o
conserto definido, executar.

Por que existe: as dez rodadas de revisão do gate de prazo (M-08/M-10, grafo §18–§22) foram
remendo sobre remendo: cada conserto fechava a frase relatada e abria a irmã, até a auditoria
mostrar a causa estrutural (três listas de nome do antecipado, quatro vocabulários de chegada).
O que convergiu foi entender a causa e reestruturar.

Como aplicar: todo brief de implementador pede a causa raiz provada **antes** do conserto
(reproduzir no código, nomear o arquivo e a linha de origem, listar todos os chamadores
afetados). Um conserto que não explica por que o bug existia não está pronto.
