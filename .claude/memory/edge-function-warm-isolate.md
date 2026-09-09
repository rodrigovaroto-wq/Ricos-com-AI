---
name: edge-function-warm-isolate
description: Por minutos depois de um deploy, parte das requisições ainda é servida pela versão anterior — sonda de verificação precisa ser conferida pelo formato da resposta, não só pelo conteúdo.
metadata:
  type: architecture
---

Deployar a Edge Function `turn` não troca o que responde, troca o que **passa a poder**
responder. Por vários minutos depois, o isolate da versão anterior continua quente e
atende parte das requisições — inclusive alternando dentro da mesma conversa.

Isso apareceu na verificação da v14 (2026-09-08). Cinco sondas voltaram com o corpo de
resposta da v13 — sem `order`, `orderBlocked`, `size`, `addressReady` — e o que elas
gravaram no banco foi o comportamento velho: o nome que a cliente deu no turno não foi
persistido, porque a v13 não tem coleta de identidade nenhuma. Passamos um tempo
caçando um defeito que não existia.

**O que fazer.** Toda sonda de pós-deploy precisa provar qual versão a atendeu, e a
prova mais barata é o **formato da resposta**: uma chave que só a versão nova devolve.
Conteúdo certo não basta — a versão velha também responde coisa plausível. Se a chave
nova não estiver lá, a sonda não vale: repita, não conclua.

Isso também vale ao contrário: um "defeito" que aparece logo depois de um deploy e não
reproduz alguns minutos depois provavelmente nunca foi defeito.
