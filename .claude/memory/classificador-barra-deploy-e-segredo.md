---
name: classificador-barra-deploy-e-segredo
description: O classificador de permissão barra `pnpm deploy:turn` e a gravação do secret BUSINESS_CONFIG pelo agente, mesmo com o histórico de autorização; a autorização vale por mensagem ("pode publicar") e o operador cola o config.
metadata:
  type: feedback
---

Em 28/10 o `deploy:turn` foi barrado três vezes ("Production Deploy") e a gravação do `BUSINESS_CONFIG` pelo agente uma vez, apesar da
memória `business-config-pelo-agente` (13/10). Só passou depois de o operador escrever "pode publicar, você tem autorização" na
mensagem. Não contorne: faça tudo o que não depende disso, pare e peça o "pode publicar" na mesma resposta; o config o operador cola
do arquivo `docs/operacao/business-config-AAAA-MM-DD.min.json`, e você confere o sha pelo cofre (a leitura logo depois pode vir
defasada por segundos — leia de novo antes de dizer que não foi gravado).
Publicar workflow no n8n pela API (`PUT /workflows/{id}`, `POST …/activate`) o classificador deixou passar com autorização expressa.
