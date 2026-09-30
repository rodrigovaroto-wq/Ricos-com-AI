---
name: n8n-editor-tira-senha-do-formulario
description: Depois de mexer num workflow pelo editor do n8n (ex.: "Test workflow"), a versão ativa pode perder a basic auth do formulário — só ative depois de `pnpm dev:n8n` dar ok para ele.
metadata:
  type: feedback
---

Em 2026-09-30 o "Responder cliente" foi importado pela API com `authentication: basicAuth` e a
credencial "Formulário do operador" ligada. O operador fez o envio de teste pelo editor; ao ativar,
a versão ativa não tinha mais nem `authentication` nem a credencial — formulário público, que
escreve para uma cliente como Encorpa. Quem pegou foi a regra do `pnpm dev:n8n`
(`the human reply form has no password`), não a leitura do rascunho.

Causa exata não confirmada (o rascunho já estava sem os dois campos quando foi lido). O que vale:
**ative, rode `pnpm dev:n8n` na hora, e desative se o formulário acusar senha.** O conserto é um
PUT do rascunho com `parameters.authentication = "basicAuth"` e `credentials.httpBasicAuth.id`, e
reativar — cada ativação cria uma versão nova (`activeVersionId`).
