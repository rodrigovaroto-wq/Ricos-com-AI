# Sistema de memória — regras de uso

Memória persistente entre sessões, em duas camadas. Este arquivo é carregado
automaticamente em toda sessão via `CLAUDE.md`. Leia o índice
[`MEMORY.md`](MEMORY.md) antes de começar qualquer trabalho.

## Estrutura

- **`MEMORY.md`** — o índice, sempre carregado. Uma linha por memória, com link
  para o arquivo de tópico. Teto mole: **130 linhas não vazias**.
- **Arquivos de tópico** — um arquivo por memória, nesta mesma pasta, com
  frontmatter obrigatório:

```markdown
---
name: slug-em-kebab-case
description: resumo de uma linha — usado para julgar relevância numa sessão futura
metadata:
  type: feedback | architecture | business-rule | reference
---

O fato ou a regra em si, por que importa, e quando se aplica.
```

`type` tem exatamente 4 valores. Não invente outros:

- **`feedback`** — um erro que precisou de correção durante uma sessão.
- **`architecture`** — um padrão descoberto só depois de tentativas que falharam.
- **`business-rule`** — algo que afeta o código mas não é óbvio só de ler ele.
- **`reference`** — onde uma informação externa mora (painel, wiki, ticket).

## Critério de salvamento

Antes de escrever uma entrada, aplique o teste literal:

> Uma sessão futura ficaria surpresa e grata de saber disso antes de começar,
> em vez de descobrir do jeito difícil?

Se a resposta for não, **não salve**. Isso exclui explicitamente:

- Qualquer coisa derivável de ler o código ou o histórico do Git.
- Prazos, motivações e contexto temporário do momento atual.
- Receita de debug — isso mora na mensagem do commit.
- Qualquer coisa já documentada no `CLAUDE.md` ou no `README.md`.

Erre para o lado de não salvar. Um índice pequeno e de alto sinal vence um
índice grande e ignorado, sempre.

A linha de `description` é a única parte lida automaticamente todo dia — capriche
nela mais do que no corpo do arquivo.

## Política de crescimento

Antes de adicionar uma entrada nova, conte as linhas não vazias do `MEMORY.md`.
Abaixo de 130, só adicione. Acima, sanitize primeiro:

1. Pontue cada entrada existente: recência × especificidade × chance de evitar um
   erro real no futuro.
2. Para cada entrada de baixa pontuação, **migre** — nunca apague direto — nesta
   ordem exata:
   1. **Checar duplicidade** no armazenamento de longo prazo.
   2. **Adequar ao formato** exigido pelo destino.
   3. **Criar** a entrada lá.
   4. **Confirmar** lendo a entrada de volta. Sem leitura confirmada, a migração
      não aconteceu.
   5. **Só então** apagar o arquivo de tópico e a linha no `MEMORY.md`.
3. Reescreva o índice com o que sobrou.
4. Aí sim, adicione a entrada nova.

Apagar antes da confirmação de leitura é perda de dado, não faxina. Na dúvida se
uma entrada ainda merece o lugar dela, deixe lá — migrar depois não custa nada.

## Camada 2 — armazenamento de longo prazo

**Ainda não existe.** Este projeto não tem vault, wiki ou base externa definida.
Enquanto isso, opere só com a camada 1 e não invente um destino de migração.

Quando o índice se aproximar do teto, isso vira uma decisão a tomar com o
operador — ver [`docs/documentacao/tools/08-obsidian-memory.md`](../../docs/documentacao/tools/08-obsidian-memory.md)
para montar um do zero.
