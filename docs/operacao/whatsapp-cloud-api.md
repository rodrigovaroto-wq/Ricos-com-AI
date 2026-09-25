# Ligar o WhatsApp Cloud API: quem faz o quê

> Escrito em 2026-09-25. O código está pronto e **desligado**: a função `whatsapp`
> (entrada), o workflow n8n **"Encorpa — WhatsApp envio"** (saída, com `CANAL_ATIVO = false`)
> e os ramos no Turno e no Relógio. Nada sai para cliente nenhuma até a Parte C.
> Decisão: R14.16. Grafo: §13.

## Como a mensagem anda depois de ligado

1. A cliente escreve para o número.
2. A Meta chama a função `whatsapp` no Supabase. A função confere a assinatura da Meta,
   responde "ok" na hora, sela a mensagem e entrega ao n8n.
3. O n8n Turno marca como lida (com "digitando…") e chama a Malu. A Malu confere o selo.
4. A resposta volta pelo workflow "WhatsApp envio", em balões com o tempo de digitação.
5. A régua usa o mesmo envio. Dentro de 24h da última mensagem dela vai como texto; fora,
   só com template aprovado; sem template, o toque é cancelado e chega um e-mail avisando.

## Parte A — o sócio, no painel da Meta

1. **App:** em developers.facebook.com, um app do tipo Business com o produto **WhatsApp**,
   ligado à Business Manager verificada com o CNPJ.
2. **Número:** adicionar o chip novo em WhatsApp → Configuração da API, verificar por SMS
   ou ligação e pedir aprovação do **nome de exibição** ("Encorpa").
3. **Token que não expira:** Business Manager → Usuários do sistema → criar um usuário
   administrador → atribuir o app e a conta do WhatsApp (WABA) → **Gerar token** com as
   permissões `whatsapp_business_messaging` e `whatsapp_business_management`, sem
   expiração.
4. **Anotar e entregar ao operador, por canal seguro** (nunca por e-mail aberto ou grupo):
   - o **token** do item 3;
   - o **ID do número de telefone** (Phone number ID), em WhatsApp → Configuração da API;
   - a **chave secreta do app** (App secret), em Configurações do app → Básico.
5. **Webhook** (só depois da Parte B, porque a Meta testa o endereço na hora):
   - URL de retorno: `https://hbmkgakzrqmdlsvszjeo.supabase.co/functions/v1/whatsapp`
   - Token de verificação: o valor que o operador gerar na Parte B, passo 1
   - Assinar o campo **messages**.
6. **Templates:** submeter os 3 de
   [`docs/agente-ia/06-script/03-templates-meta.md`](../agente-ia/06-script/03-templates-meta.md),
   exatamente com o texto de lá. Quando aprovados, avisar o operador com os nomes.

## Parte B — o operador (técnico), no Codespace e no Supabase

1. **Gerar dois segredos** no terminal do Codespace, cada um com
   `openssl rand -hex 32`: um é o **token de verificação** (vai também para o sócio, item
   A5) e o outro é o **selo da entrada**.
2. **Segredos no Supabase** (Edge Functions → Secrets):
   - `WHATSAPP_APP_SECRET` = chave secreta do app (A4)
   - `WHATSAPP_VERIFY_TOKEN` = token de verificação (B1)
   - `WHATSAPP_PHONE_NUMBER_ID` = ID do número (A4)
   - `WHATSAPP_TOKEN` = token do A3 (só para a confirmação de leitura com "digitando…")
   - `INBOUND_SIGNING_SECRET` = selo da entrada (B1). **Sem ele, a Malu não responde pelo
     WhatsApp**: o n8n só envia quando a função do turno confirma o selo.
3. **Publicar as duas funções** no Codespace, a partir do `main` atualizado:
   ```
   export SUPABASE_ACCESS_TOKEN=sbp_...
   npx supabase functions deploy turn --project-ref hbmkgakzrqmdlsvszjeo --use-api
   npx supabase functions deploy whatsapp --project-ref hbmkgakzrqmdlsvszjeo --use-api --no-verify-jwt
   ```
   O `--no-verify-jwt` é só na `whatsapp`: a Meta não tem como mandar a chave do Supabase,
   e quem autentica a Meta é a assinatura conferida dentro da função.
4. Avisar o sócio para fazer o **A5** (webhook).

## Parte C — ligar o envio (o Claude faz, com os valores em mãos)

1. **Credencial no n8n** (a única coisa que o Claude não cria por aqui): abrir o workflow
   "WhatsApp envio", nó "Envia pela Cloud API", e criar a credencial que o nó pede, com o
   nome **WhatsApp Cloud API** e o cabeçalho `Authorization` = `Bearer <token do A3>`.
2. No nó **"Monta os envios"**: `PHONE_NUMBER_ID` = o ID do número e `CANAL_ATIVO = true`.
   Publicar. Rodar `pnpm dev:n8n` e atualizar a cópia versionada (o teste
   `n8n-whatsapp-send` passa a exigir o estado novo — trocar junto).
3. **Teste de verdade:** do celular pessoal, mandar "oi" para o número. Esperado: "lida" e
   "digitando…" na hora, a recepção, e 2 minutos depois a resposta da Malu. Antes, usar o
   botão **Testar** do webhook no painel da Meta (o sócio) e conferir o 200 no log da função.
4. **Fechar as portas** depois do teste passar:
   - `TURN_REQUIRE_SERVICE_ROLE=true` nos segredos do Supabase (a chave pública deixa de
     abrir a função do turno). **Antes**, confirmar que a credencial "Supabase service_role"
     do n8n guarda mesmo a chave de serviço (JWT com `role: service_role`) — se for a
     anônima, esse segredo derruba o Turno, o Relógio e a Venda;
   - conferir que as sondas e personas passam `INBOUND_SIGNING_SECRET` (o executor já
     sela quando a variável existe).
5. **Templates aprovados:** cadastrar em `channel.templates` do `BUSINESS_CONFIG`. O
   segredo não pode ser lido de volta: **cole o config inteiro de novo**, com a chave nova.

## O que ainda não está coberto (aceito na revisão de segurança)

- Duas mensagens seguidas da mesma cliente podem virar dois turnos ao mesmo tempo.
- Uma mensagem que o n8n não receber (fora do ar) fica registrada só no log da função
  `whatsapp`, pelo id, sem fila para reprocessar. A Meta já recebeu o "ok" e não reenvia.
- Enquanto `INBOUND_SIGNING_SECRET` e `TURN_REQUIRE_SERVICE_ROLE` não estiverem ligados, a
  porta pública do n8n ainda aceita mensagem forjada (só sem `job`, `order` e `token`).
