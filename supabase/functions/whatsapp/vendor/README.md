# vendor — o decodificador de Opus da transcrição de áudio (R18.9)

Só o `OpusDecoder.js` de `opus-decoder@0.7.12/src` está copiado aqui, com dois `import` reescritos para
URLs fixas do jsDelivr; nenhuma outra linha mudou. Os outros três arquivos vêm do jsDelivr na versão
exata do npm, porque têm binário em yEnc (caracteres de controle) que o conector de deploy não transporta
(operador, 2026-10-07, opção 2). O empacotador do Supabase lê as URLs **só no deploy** e embute os
arquivos na função; em produção nada é buscado fora. O `simple-yenc`, importado sem caminho pelo
`WASMAudioDecoderCommon.js`, é resolvido pelo `../deno.json`. Sem o Web Worker do pacote (puxa `node:vm`,
que o empacotador recusa) — a transcrição não precisa dele.

| Arquivo | Origem |
|---|---|
| `OpusDecoder.js` (aqui) | `opus-decoder@0.7.12/src/OpusDecoder.js` |
| `EmscriptenWasm.js` | https://cdn.jsdelivr.net/npm/opus-decoder@0.7.12/src/EmscriptenWasm.js — o libopus em WebAssembly |
| `WASMAudioDecoderCommon.js` | https://cdn.jsdelivr.net/npm/@wasm-audio-decoders/common@9.0.7/src/WASMAudioDecoderCommon.js |
| `simple-yenc` | https://cdn.jsdelivr.net/npm/simple-yenc@1.0.4/dist/esm.js |

Licenças: os três pacotes são MIT, de Ethan Halsall (texto em `LICENSE`). O `libopus` dentro do
WebAssembly é BSD-3-Clause (Xiph.Org Foundation e colaboradores, https://opus-codec.org/license/).

O `../deno.lock` prende o sha256 de cada arquivo remoto: se um deles mudar no jsDelivr, o Deno recusa
a carga. **Antes de cada deploy**, mesmo assim, confira que cada URL ainda entrega o arquivo revisado em 2026-10-07
(`curl -sS <url> | sha256sum`). O hash do `OpusDecoder.js` e as URLs ficam presos em
`tests/audio-transcription.test.ts`.

```
2585c59bba07b99fc82c5f72282ad5218ae3cc25d28ceac5b7863a04a83da633  OpusDecoder.js
278768f829703b8b443dfc64b8c5d0e29e73f5012ba7edc641b4c211390a1a72  EmscriptenWasm.js
9eb713858e7c98dcb2da9a3121ba10b2f0e69bf9f32151eb705569c68e1f33ce  WASMAudioDecoderCommon.js
14680ab2c8dec870ceffc05e79967b7358d31fd96eee6481388f06347a53ac3e  simple-yenc (dist/esm.js)
```
