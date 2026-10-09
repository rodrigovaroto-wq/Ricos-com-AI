---
name: coinzz-cep-so-digitos
description: A consulta de cobertura da Coinzz responde 422 a CEP com hífen e só aceita dígitos; e uma consulta que falha nunca pode virar "sem pagamento na entrega".
metadata:
  type: architecture
---

`stock-and-delivery-day` da Coinzz: `zip_code=04710-090` → **422 "O CEP não foi encontrado"**;
`zip_code=04710090` → 200 com as datas. O CEP é guardado com hífen (`parseCep`), então a consulta tira
os não-dígitos em `askSize` (`src/agent/availability.ts`). Em 08/10 isso fez **toda cliente com CEP**
ouvir "sua região não tem pagamento na entrega" (L2, grafo §67), porque o 422 virava `null` e
`readAvailability(null)` lê `cod: false`. Regra: falha da consulta = região desconhecida
(`lookupRegion` → `failed`), nunca "não tem". Sonda de verdade: a mesma URL com e sem hífen — a sonda de
07/10 usou dígitos e por isso "provou" um código que em produção falhava. ViaCEP com `erro` = CEP que não
existe (`not_found`): a Malu diz isso e pede pra conferir.
