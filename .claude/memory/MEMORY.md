# Índice de memória

Uma linha por memória, com link para o arquivo de tópico. Teto mole de 130 linhas
não vazias — ver [`INSTRUCTIONS.md`](INSTRUCTIONS.md) para o critério de
salvamento e a política de crescimento.

<!-- Formato: - [Título](arquivo.md) — descrição de uma linha -->

- [`ON CONFLICT` e índice parcial em `followups`](on-conflict-partial-index.md) — Não troque a unique constraint por índice parcial: o upsert do handler quebra em silêncio.
- [Drift entre a Edge Function e o repositório](edge-function-drift.md) — A Edge Function no ar pode divergir do repositório nos dois sentidos; nada compara os dois lados; sempre ler o que está deployado antes de deployar.
- [Cegueira a negação, nos dois sentidos](negation-blindness.md) — Toda heurística de texto deste repositório já errou em negação; antes de mexer numa, sonde a frase negada **e** a negativa que não nega.
