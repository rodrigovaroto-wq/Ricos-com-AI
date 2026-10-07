# vendor — o decodificador de Opus da transcrição de áudio (R18.9)

Copiado do npm em 2026-10-07, **sem** os módulos de Web Worker (o empacotador do Supabase recusa o
`node:vm` que eles puxam, e a transcrição não precisa deles). Só três `import` foram reescritos (dois para
caminho relativo, um para a URL fixa abaixo); nenhuma outra linha mudou. O hash de cada arquivo está preso em
`tests/audio-transcription.test.ts`: trocar um arquivo exige trocar o hash, de propósito.

| Arquivo | Origem |
|---|---|
| `OpusDecoder.js` | `opus-decoder@0.7.12/src` |
| `EmscriptenWasm.js` — **não copiado** | importado de `https://cdn.jsdelivr.net/npm/opus-decoder@0.7.12/src/EmscriptenWasm.js`: o libopus em WebAssembly, 82 KB de binário em yEnc que o conector de deploy não transporta (operador, 2026-10-07, opção 2). O empacotador lê a URL só no deploy e embute o arquivo; versão publicada no npm não muda. Antes de cada deploy, confira: `curl -sS <url> \| sha256sum` tem de dar o hash abaixo |
| `WASMAudioDecoderCommon.js` | `@wasm-audio-decoders/common@9.0.7/src` |
| `simple-yenc.js` | `simple-yenc@1.0.4/dist/esm.js` |

Licenças: os três pacotes são MIT, de Ethan Halsall (texto em `LICENSE`). O `libopus` dentro do
WebAssembly é BSD-3-Clause (Xiph.Org Foundation e colaboradores, https://opus-codec.org/license/).

sha256:

```
278768f829703b8b443dfc64b8c5d0e29e73f5012ba7edc641b4c211390a1a72  EmscriptenWasm.js (jsDelivr)
b0ed0ec83d376cd75082b77f9e521d4737caaffe3117683cc3a5b925403316ba  OpusDecoder.js
83aa80c0c251b049046f8b0dfabc020a10f4b79d0a955647cafeff2a71d47d85  WASMAudioDecoderCommon.js
14680ab2c8dec870ceffc05e79967b7358d31fd96eee6481388f06347a53ac3e  simple-yenc.js
```
