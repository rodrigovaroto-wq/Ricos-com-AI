# Segredos e publicação pelo Codespace: guia do operador

> Escrito em 2026-09-25. Serve para qualquer publicação da função `turn` (ou da `whatsapp`)
> e para colocar ou trocar uma credencial. O Claude desta máquina **não** consegue publicar
> nem mexer em credencial (o modo automático bloqueia); quem faz é você, seguindo isto.

## Onde cada credencial mora

| Onde | O que fica lá | Quem lê |
|---|---|---|
| **Supabase** → Edge Functions → Secrets | `BUSINESS_CONFIG`, `META_API_KEY`, `CONVERSATION_MODEL`, `CONVERSATION_MODEL_PRICE`, `SALE_WEBHOOK_TOKEN`; no WhatsApp: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, `INBOUND_SIGNING_SECRET`; e `TURN_REQUIRE_SERVICE_ROLE` | as funções `turn` e `whatsapp` |
| **GitHub** → repositório `Ricos-com-AI` → Settings → Secrets and variables → Actions | `META_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` | o Hermes e a publicação das propostas aprovadas |
| **n8n** → Credentials | "Supabase service_role", "SMTP e-mail", "Logzz API", "Coinzz API", "Meta API"; no WhatsApp: "WhatsApp Cloud API" | os workflows |

Regras que já custaram caro:
- **Cole só o valor.** Nada de `Bearer ` na frente, espaço ou quebra de linha. O código
  põe o `Bearer` sozinho. (Foi assim que a chave da Meta ficou recusada o dia inteiro.)
- **Segredo não se lê de volta.** O Supabase não mostra o valor salvo. Para mudar um campo
  do `BUSINESS_CONFIG`, cole o **config inteiro** de novo, com a mudança.
- **Chave nova nasce ausente.** Um segredo que a função não encontra vale como desligado.
- **Nunca** cole segredo em chat, e-mail, grupo ou arquivo do repositório. Se colou, troque.

## 1. Colocar ou trocar um segredo no Supabase

1. supabase.com/dashboard → projeto **Encorpa Database** → **Edge Functions** → **Secrets**.
2. **Add new secret** (ou editar o existente) → nome exatamente como na tabela → valor → **Save**.
3. A função lê o segredo novo na próxima requisição; não precisa republicar.

## 2. Colocar ou trocar um segredo no GitHub

1. github.com/rodrigovaroto-wq/Ricos-com-AI → **Settings** → **Secrets and variables** →
   **Actions**.
2. **New repository secret** (ou o lápis ao lado do existente) → nome → valor → **Add secret**.

## 3. Criar um token de acesso do Supabase (PAT), quando for publicar

1. supabase.com/dashboard/account/tokens → **Generate new token** → nome (ex.:
   `deploy-2026-09-30`) → copie o valor `sbp_...`.
2. Use no passo 4. **Revogue** na mesma página quando terminar.

## 4. Publicar pelo Codespace (sem instalar nada)

1. github.com/rodrigovaroto-wq/Ricos-com-AI → botão verde **Code** → aba **Codespaces** →
   **Create codespace on main** (ou abra o que já existe). Espere 1 a 2 minutos.
2. No terminal de baixo, traga o `main` atualizado:
   ```
   git checkout main && git pull
   ```
   Se o Claude disser que o código ainda está num branch (ex.: o canal do WhatsApp, hoje em
   `claude/peaceful-feynman-l4zf0k`, até o PR entrar no `main`), use
   `git fetch origin <branch> && git checkout <branch>` no lugar.
3. Informe o token (troque pelo seu):
   ```
   export SUPABASE_ACCESS_TOKEN=sbp_...
   ```
4. Publique o que o Claude pedir:
   - função do turno:
     ```
     npx supabase functions deploy turn --project-ref hbmkgakzrqmdlsvszjeo --use-api
     ```
   - função do WhatsApp (só na ativação do canal; **com** `--no-verify-jwt`, que nunca vai
     na `turn`):
     ```
     npx supabase functions deploy whatsapp --project-ref hbmkgakzrqmdlsvszjeo --use-api --no-verify-jwt
     ```
   Se perguntar `Need to install supabase? (y)`, responda **y**. Deu certo quando aparece
   `Deployed Functions on project hbmkgakzrqmdlsvszjeo: turn` (ou `whatsapp`).
5. Avise o Claude. Ele confere a versão nova e roda a sonda.
6. Revogue o token (passo 3) e, se quiser, apague o Codespace (github.com/codespaces → `...`
   → Delete).

## 5. Testar a Malu pela porta de produção (no mesmo terminal)

```
curl -sS -m 300 -X POST https://encorpa-fashion.pikapod.net/webhook/encorpa-inbound -H 'Content-Type: application/json' -d '{"externalId":"teste-operador-N","from":"5500099000001","body":"oi, quanto custa o colete?"}'
```

Troque o `N` a cada teste (o mesmo `externalId` é ignorado como repetido). A resposta
imediata é a recepção; a resposta da Malu sai 2 minutos depois, dentro do n8n — o Claude
confere no banco e apaga o número de teste.

**Depois que o `INBOUND_SIGNING_SECRET` estiver ligado**, esse teste passa a ser recusado
(mensagem sem selo). A partir daí, testa-se mandando mensagem de verdade para o número do
WhatsApp, ou o Claude roda as personas com o segredo.
