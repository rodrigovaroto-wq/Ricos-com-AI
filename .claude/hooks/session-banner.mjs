#!/usr/bin/env node
// Hook SessionStart — exemplo mínimo e real, registrado em settings.json.example.
//
// Ele existe para que copiar o arquivo de exemplo produza uma configuração que
// funciona de verdade. Um exemplo que aponta para um arquivo inexistente derruba
// toda sessão com ERR_MODULE_NOT_FOUND — o oposto de "falhar aberto".
//
// Regra que ele demonstra: um hook nunca trava a sessão. Qualquer erro aqui
// termina em exit 0 e a sessão segue sem o banner.

import { readStdinRaw, parseHookEvent } from "./hook-io.mjs";

const evento = parseHookEvent(readStdinRaw());
if (evento === null) process.exit(0); // sem evento utilizável — falha aberta

// stderr é o canal consultivo: aparece para o desenvolvedor sem entrar no
// contexto do modelo nem virar saída estruturada de hook.
console.error("ricos-com-ai — leia .claude/memory/MEMORY.md antes de começar.");
process.exit(0);
