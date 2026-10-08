# Ligar o WhatsApp Cloud API: quem faz o quê

> Escrito em 2026-09-25; atualizado em 2026-10-08. ~~O código está pronto e **desligado**…~~ ✅ **O canal
> foi ligado e testado de ponta a ponta em 2026-10-06** (webhook da Meta verificado, credencial "WhatsApp
> Cloud API" no n8n, `CANAL_ATIVO=true`, segundo o `HANDOFF.md`). As Partes A–C abaixo ficam como o roteiro
> de como foi ligado e de como religar. A função `whatsapp` (entrada) e o workflow n8n **"Encorpa —
> WhatsApp envio"** (saída) estão em `supabase/functions/whatsapp/` e `n8n/workflows/`.
> Decisão: R14.16. Grafo: §13.

## Como a mensagem anda depois de ligado

1. A cliente escreve para o número.
2. A Meta chama a função `whatsapp` no Supabase. A função confere a assinatura da Meta,
   responde "ok" na hora, sela a mensagem e entrega ao n8n.
3. O n8n Turno marca como lida (com "digitando…") e chama a Malu. A Malu confere o selo.
4. A resposta volta pelo workflow "WhatsApp envio", em balões com o tempo de digitação.
   Se a mensagem dela é uma **nota de voz**, a função `whatsapp` a transcreve antes de entregar (ver
   "Áudio" abaixo) e o texto vai marcado como transcrição.
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
   - `WHATSAPP_TOKEN` = token do A3 (confirmação de leitura com "digitando…" e download dos áudios dela para a transcrição, R18.9)
   - `META_API_KEY` = a mesma da `turn` (segredo do projeto): transcreve os áudios dela pelo `muse-voice-transcribe-1.0`. Ausente, o áudio chega como "não consegue ouvir", como antes.
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
   - **A `turn` se publica por `pnpm deploy:turn`** (grava a versão em `agent_versions` e põe
     `AGENT_VERSION` antes), não pelo `functions deploy` solto — ver o `HANDOFF.md`.
   - **A `whatsapp` depende de `deno.json` e `deno.lock`** (na pasta da função): o `deno.json` resolve o
     `simple-yenc` e o `deno.lock` prende o sha256 dos arquivos remotos. Pelo **conector MCP da Supabase**
     (`deploy_edge_function`), envie junto `index.ts`, `whatsapp.ts`, `inbound-signature.ts`,
     `vendor/OpusDecoder.js`, `deno.json` e `deno.lock`, com `verify_jwt: false`. Pelo CLI o comando acima
     serve (ele lê os mesmos dois arquivos); **o caminho do CLI para a `whatsapp` com o decodificador não
     foi reexecutado nesta edição** — o que foi usado e provado em 2026-10-07/08 foi o conector.
   - Antes de cada deploy, conferir que as URLs do jsDelivr ainda entregam os arquivos revisados
     (`supabase/functions/whatsapp/vendor/README.md` tem a tabela e os hashes).
4. Avisar o sócio para fazer o **A5** (webhook).

## Parte C — ligar o envio (o Claude faz, com os valores em mãos)

1. **Credencial no n8n** (a única coisa que o Claude não cria por aqui): abrir o workflow
   "WhatsApp envio", nó "Envia pela Cloud API", e criar a credencial que o nó pede, com o
   nome **WhatsApp Cloud API** e o cabeçalho `Authorization` = `Bearer <token do A3>`.
2. No nó **"Monta os envios"**: `PHONE_NUMBER_ID` = o ID do número e `CANAL_ATIVO = true`.
   Publicar. Rodar `pnpm dev:n8n` e atualizar a cópia versionada (o teste
   `n8n-whatsapp-send` passa a exigir o estado novo — trocar junto).
3. **Teste de verdade:** do celular pessoal, mandar "oi" para o número. Esperado: "lida" e
   "digitando…" na hora, a recepção, e cerca de 1 minuto depois a resposta da Malu (a primeira resposta sai 1 minuto depois da mensagem — operador, 2026-10-02). Antes, usar o
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

## Áudio: a nota de voz vira texto (R18.9, operador, 2026-10-07)

A função `whatsapp` baixa a nota de voz dela pela Graph API, decodifica o Ogg/Opus (libopus em WebAssembly,
`vendor/OpusDecoder.js`, sem ffmpeg, que o Edge não tem), monta um WAV de 16 kHz e o envia ao
`muse-voice-transcribe-1.0` da Meta (`api.meta.ai/v1/asr/transcribe`, português). O texto segue ao turno
como transcrição marcada; as regras fixas (pedir pessoa, pedir o link, nome) leem sem o marcador
(`spoken()`, grafo §66).

| Limite (em `supabase/functions/whatsapp/index.ts`) | Valor |
|---|---|
| Tamanho do arquivo baixado | 2 MB (`MAX_AUDIO_BYTES`, ~16 min de voz do WhatsApp) |
| Duração decodificada | 5 min (`MAX_AUDIO_SAMPLES`, 300 s a 16 kHz), contada pacote a pacote |
| Prazo de tudo (URL, download, decodificação, transcrição) | 25 s (`TRANSCRIBE_DEADLINE_MS`) |
| Corpo do webhook | 256 KB (`MAX_BODY_BYTES`) |

- **Segredos que a transcrição exige:** `WHATSAPP_TOKEN` (baixa a mídia; só é enviado a hosts da Meta) e
  `META_API_KEY` (a mesma da `turn`). Faltando qualquer um, ou em qualquer falha (arquivo grande, áudio
  longo, prazo, Meta recusando), a cliente recebe a frase "não consegue ouvir", como antes da transcrição.
- **Custo:** US$ 0,18 por hora de áudio, ~R$ 0,00027 por segundo (`TRANSCRIBE_PRICE_BRL_PER_SECOND` muda o
  valor); gravado em `llm_calls` com `purpose = transcribe`.
- **Dependência:** o único pacote de runtime do projeto (decisão do operador, caminho 1). Ver
  `supabase/functions/whatsapp/vendor/README.md` para origem, licenças e hashes.

## O que ainda não está coberto (aceito na revisão de segurança)

- ~~Duas mensagens seguidas da mesma cliente podem virar dois turnos ao mesmo tempo.~~ ✅ tratado desde a
  rajada v2 (grafo §61, migração 0023 `conversations.replying_since`): a rajada vira uma resposta; espera de
  5 s, e 2 s quando já há mais de uma mensagem (`BURST_WINDOW_MS`).
- Uma mensagem que o n8n não receber (fora do ar) fica registrada só no log da função
  `whatsapp`, pelo id, sem fila para reprocessar. A Meta já recebeu o "ok" e não reenvia.
- Enquanto `INBOUND_SIGNING_SECRET` e `TURN_REQUIRE_SERVICE_ROLE` não estiverem ligados, a
  porta pública do n8n ainda aceita mensagem forjada (só sem `job`, `order` e `token`).
