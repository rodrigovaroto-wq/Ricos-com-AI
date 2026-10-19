# Malu x checkout real da Logzz, via Playwright (2026-10-19)

`all.cjs` (usa `check.cjs`) dirige o checkout real da Logzz com Playwright em 35 CEPs de 25 cidades, **abortando toda requisição que não seja GET**
(exceto validar CPF e analytics), então nenhum pedido ou lead foi criado. Para cada CEP lê os tamanhos habilitados (os indisponíveis vêm marcados
"(Indisponível)") e os dias de entrega de cada um. `real-checkout.json` é o resultado. `compare.mts` roda `lookupRegion` da Malu, tamanho a
tamanho (o "XG" do checkout é o XGG dela), e compara com o checkout.

**Resultado: 175 de 175 combinações (35 CEPs x 5 tamanhos) iguais** — onde o checkout tem dia, a Malu diz que entrega; onde não tem, que não.
Execução: `NODE_PATH=$(npm root -g) node all.cjs` (checkout) e `NODE_USE_ENV_PROXY=1 npx tsx compare.mts` (comparação). Os dias mudam todo dia.
