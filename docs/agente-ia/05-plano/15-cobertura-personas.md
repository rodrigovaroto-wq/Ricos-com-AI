# Cobertura das personas — o que uma cliente traz e quem testa cada coisa

> Escrito em 2026-10-15, a pedido do operador: personas que cubram mais de 95% das variações de conversa, as de hoje e as que
> a escala dos anúncios vai trazer, rodando todas ao mesmo tempo, com o mínimo de máquina, de tokens e de tempo.

## De onde veio

- **As conversas reais:** as 9 arquivadas em `10-auditoria/testes-reais/` (operador, irmã, testadores …7967, …3720, …1632) e as
  auditorias da Leila e do L2 — cada mensagem de cliente foi classificada numa situação.
- **O histórico das personas:** as 13 de segurança (`.claude/agents/persona-*.md`) e os 16 compradores da E4
  (`src/dev/scenarios/venda.json`), com os furos que já pegaram (grafo §60–§95).
- **O que vem com a escala:** revenda e atacado, cliente que volta a comprar, entrega frustrada, defeito, pedido de exclusão de
  dados (LGPD), cliente que só manda áudio, plus size, mignon, homem, gestante, pós-cirurgia, espanhol, tentativa de mudar as regras.

## A taxonomia

`src/dev/scenarios/cobertura-taxonomia.json`: **138 situações** em 14 grupos — abertura, produto, tamanho, região, pagamento,
preço, confiança, dados, link e checkout, pós-compra, prazo, saída, fora do assunto e forma de escrever. Cada uma diz de onde
veio (real, persona, futuro) e quem a exercita.

**Cobertas: 135 de 138 (97,8%).** As três de fora a porta local não alcança, e cada uma diz onde é provada:
A12 (madrugada — o expediente da rodada é aberto 24 h), J1 e J5 (exigem pedido real gravado em `orders` — testes do job `order`
e a E5). `tests/persona-coverage.test.ts` falha se a cobertura cair abaixo de 95% ou se uma situação ficar sem persona e sem motivo.

## As 26 personas novas

`src/dev/scenarios/cobertura.json`, em ficha compacta: quem é, situação, como escreve, a tentativa adversarial, os dados e quando
para. As regras e o formato de resposta, que cada arquivo de persona repetia, são montados por código (`PERSONA_RULES`). Por isso:

- a ficha custa um terço do prompt de um arquivo de persona no modelo da cliente;
- nenhuma pesa na lista de agentes de uma sessão do Claude (os arquivos `.claude/agents/` pesam em toda sessão).

Fichas: irmã sem anúncio ("que isso"), só áudio (baixa visão), foto e figurinha com comprovante, tudo de uma vez, rajada picada,
pós-cirurgia, gestante, homem da academia, plus size, mignon, CEP errado, presente para outra cidade, como se paga na porta, não
estou em casa, link que não funciona, muda de caminho, kit da família, revenda, frete grátis e cupom, LGPD, pós-venda com problema,
recompra, irritada, troll com injeção de prompt, espanhol, Instagram e site.

## Como rodar — tudo ao mesmo tempo

```
NODE_USE_ENV_PROXY=1 pnpm dev:personas:todas --door=local --max-turns=12
```

Três processos em paralelo (cobertura 13 por vez, segurança 7, venda 8): uma conversa espera os modelos, não a máquina, então a
rodada dura mais ou menos a conversa mais longa. O teto é R$ 5 por suíte. Antes, suba a `turn` local (roteiro no topo de
`src/dev/persona-run.ts`). Uma suíte só: `pnpm dev:personas --suite=cobertura --concurrency=13`.

## Como ler — pelos alertas, não mensagem por mensagem

Cada conversa sai com **Alertas** no fim do `.md` e na coluna do `_resumo.md`. O alerta aponta o turno: promessa de dia, dizer que
é pessoa, prometer checar ou chamar alguém, prometer silêncio, escassez, handoff, três reescritas ou mais, o proibido da ficha
(`mustNot`), o CEP pedido três vezes e a mesma pergunta três vezes. Um alerta é pista, não veredito: leia o turno. Conversa sem
alerta e com os gates em silêncio não precisa ser lida inteira.
