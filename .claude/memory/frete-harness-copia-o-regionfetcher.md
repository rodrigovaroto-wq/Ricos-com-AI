---
name: frete-harness-copia-o-regionfetcher
description: script que compara a consulta da Malu com o checkout real tem de usar o mesmo regionFetcher da turn, com o corpo do erro; sem ele o 400 "sem entrega" da Logzz vira falha e a prova diverge à toa
metadata:
  type: feedback
---

Em 21/10 a primeira passada do script de frete (`docs/operacao/playwright-frete-2026-10-21/agent.mts`) leu o 400 da Logzz ("sem entrega") como falha porque o `regionFetcher` copiado não levava o corpo do erro; a `turn` lê esse corpo. Resultado: divergência falsa entre agente e checkout. Todo harness que reproduz `lookupRegion`/`prepayFreight` copia o `regionFetcher` exato da `turn`, corpo do erro incluso. Ver grafo §123.
