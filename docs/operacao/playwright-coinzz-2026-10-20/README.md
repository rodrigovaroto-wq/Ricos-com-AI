# Malu x checkout real da Coinzz (pagamento antecipado), via Playwright (2026-10-20)

`all.cjs` (usa `check.cjs`) dirige os três checkouts antecipados da Coinzz (1, 2 e 3 peças) como uma cliente, em 8 CEPs (SP, Ponte Nova/MG,
Manaus, Siqueira Campos/PR geral, Porto Alegre, Salvador, Cruz Alta/RS, BH), com o link que a Malu monta (`buildPrefilledCheckoutLink`, telefone de
WhatsApp sem o nono dígito). **Todo POST é abortado**, menos cinco leituras cujo corpo não leva dado pessoal (padrão no topo de `check.cjs`): a busca do
CEP (`zipcode=<8 dígitos>`), as opções de entrega (`entrega/getAll`, `urlOffer` + UF) e as calculadoras do carrinho (`checkout_id`, frete, parcelas).
Nenhum lead, pedido ou pagamento foi criado (`aborted` = 0 em todas). `compare.mts` cruza com o config no ar (`business-config-2026-10-20.min.json`);
saída em `compare.txt`, dados em `real-checkout.json`.

Execução: `NODE_PATH=$(npm root -g) node all.cjs "?name=Rosa+Silva&phone=31984644486"` e `NODE_USE_ENV_PROXY=1 npx tsx compare.mts`.

## Resultado (56 checkouts)

| O que a Malu diz | O checkout | Veredito |
|---|---|---|
| Link com nome e telefone | "Rosa Silva" e "31 98464-4486" (nono dígito posto) em todos | igual |
| 1 peça R$ 116,91 · 2 por R$ 207,84 · 3 por R$ 272,79 | "Valor" igual; "Pedido principal" 1 centavo abaixo (116,90 · 207,83 · 272,78) na maioria | arredondamento da Coinzz |
| "o frete aparece no checkout pelo seu CEP" | frete por região e por tamanho (R$ 17,78 a R$ 78,25), somado no total | igual |
| "em até 12x no cartão" | 12x, **com juros** (ex.: R$ 145,16 à vista → R$ 191,40 em 12x) | verdade, mas sem dizer dos juros |
| "em média 5 dias úteis" | o checkout não mostra prazo nenhum | não verificável aqui |
| — | antes do CEP, o checkout pede **e-mail e CPF** | a Malu não avisa |
| tamanho M | **bloqueado em todos os CEPs**: "CEP não encontrado — informe outro destino" (`stock-and-delivery-day` 404) | **a cliente M não consegue comprar** |

**Não coberto:** CEP geral de cidade (84940-000) — o checkout pede a rua digitada e o script não preenche; o pagamento em si (nunca clicado);
o webhook da Coinzz.
