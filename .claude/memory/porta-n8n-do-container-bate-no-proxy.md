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
- O corte é do proxy (~30 s), não do n8n: a execução continua. Conversa inteira pela porta do n8n
  funciona assim (feito em 2026-10-01): POST no webhook ignorando a resposta HTTP, esperar a
  execução do Turno sair de `running`/`waiting` pela API do n8n, e conferir o resultado no banco
  (`messages`, `turn_outcomes`, `followups`). Com mensagens simultâneas, separe as execuções por
  lead — a janela de tempo sozinha mistura.
- Depois de qualquer sonda pela porta do n8n, espere as execuções do Turno saírem de
  `waiting` e apague os `leads` com telefone `5500099*` que nasceram depois da limpeza
  (`postgrestDb(...).deleteLead(phone)`). O `5500099000035` de 25/09 não é de sonda recente.
