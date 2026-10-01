---
name: porta-n8n-do-container-bate-no-proxy
description: Do container da nuvem, `dev:personas --door=n8n` dá 502 em todo turno com modelo (o proxy corta em < ~40 s) e o turno atrasado RECRIA o lead sintético depois da limpeza — confira e apague `leads` 5500099* depois.
metadata:
  type: architecture
---

Em 2026-09-30 (grafo §46), depois de consertar a ordem do "Devolve a resposta" no Turno, a
sonda pela porta do n8n recebeu `welcomed` na hora, mas a segunda mensagem (turno com o Muse,
40 s ou mais) voltou `502 upstream request failed` do proxy de saída do container. O n8n
seguiu executando: a `turn` terminou **depois** da limpeza do runner, não achou o lead, criou
um novo e o tratou como primeira mensagem (recepção + Wait + resposta).

O que vale:
- Porta `n8n` a partir do container prova só a recepção (1ª mensagem). Conversa inteira pela
  porta do n8n: de máquina sem esse proxy, ou pelo canal.
- Depois de qualquer sonda pela porta do n8n, espere as execuções do Turno saírem de
  `waiting` e apague os `leads` com telefone `5500099*` que nasceram depois da limpeza
  (`postgrestDb(...).deleteLead(phone)`). O `5500099000035` de 25/09 não é de sonda recente.
