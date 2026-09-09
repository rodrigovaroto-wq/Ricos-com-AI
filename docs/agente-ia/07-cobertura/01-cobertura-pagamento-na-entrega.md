# Cobertura real do pagamento na entrega

> Varredura de **2026-09-08**, 43 cidades × 5 tamanhos, feita com `pnpm dev:estoque` contra
> o endpoint público `GET /checkout/stock-and-delivery-day` do próprio checkout da Coinzz.
> **Isto é uma fotografia, não uma tabela fixa** — o estoque do fornecedor muda. Rode de
> novo antes de tomar decisão de tráfego.

## O que a varredura estabeleceu

1. **O pagamento na entrega existe em 22 das 43 cidades testadas** — bem mais que as seis
   regiões metropolitanas que a primeira leitura desta varredura afirmou, e bem menos que o
   país inteiro que os documentos assumiam.
2. **Em nenhuma cidade os cinco tamanhos estão disponíveis na entrega.** Em geral são dois
   ou três, e quais mudam por praça: São Paulo tem G, GG e XGG e não tem P; o Rio tem P, GG
   e XGG e não tem G.
3. **O tamanho M não existe em lugar nenhum** — nem na entrega, nem no antecipado, nas 43
   cidades. É o único tamanho que some também do `local_operation`.
4. **O frete da entrega é constante: R$ 24,98.** Nunca variou. Total sempre R$ 154,88.
5. **O antecipado cobre tudo**: as 43 cidades, todos os tamanhos menos o M, e
   `POST /checkout/entrega/getAll` devolve *sem frete configurado* nos 27 estados — ou seja,
   **frete grátis para a cliente em todo o Brasil, R$ 110,41 fechado.** O custo do envio é do
   operador, e o `local_operation` cota de R$ 17,78 (São Paulo) a R$ 84,05 (Altamira/PA).

## Onde a entrega existe, e em quais tamanhos

| Cidade | CEP testado | Tamanhos na entrega |
|---|---|---|
| Salvador/BA | `41500620` | GG |
| Fortaleza/CE | `60176210` | GG, XGG |
| Goiânia/GO | `74948030` | G, XGG |
| Belo Horizonte/MG | `30510670` | G, XGG |
| Teresina/PI | `64060810` | G |
| Rio de Janeiro/RJ | `21011718` | P, GG, XGG |
| Natal/RN | `59073817` | GG, XGG |
| Porto Alegre/RS | `91250373` | GG, XGG |
| São Paulo/SP | `04939180` | G, GG, XGG |
| Guarulhos/SP | `07230370` | G, GG, XGG |
| Campinas/SP | `13067356` | G, GG, XGG |
| Santo André/SP | `09230590` | G, GG, XGG |
| Osasco/SP | `06149290` | G, GG, XGG |
| Niterói/RJ | `24210396` | P, GG, XGG |
| Duque de Caxias/RJ | `25030300` | P, GG, XGG |
| Nova Iguaçu/RJ | `26293591` | P, GG, XGG |
| Contagem/MG | `32052003` | G, XGG |
| Caxias do Sul/RS | `95010130` | GG, XGG |
| Aparecida de Goiânia/GO | `74948030` | G, XGG |
| São Bernardo do Campo/SP | `09857170` | G, GG, XGG |
| São José dos Campos/SP | `12244546` | G, GG, XGG |
| Betim/MG | `32681394` | G, XGG |

## Onde a entrega não existe (só antecipado)

| Cidade | CEP testado |
|---|---|
| Rio Branco/AC | `69921092` |
| Maceió/AL | `57041350` |
| Macapá/AP | `68909141` |
| Manaus/AM | `69057004` |
| Brasília/DF | `72615002` |
| Vitória/ES | `29016345` |
| São Luís/MA | `65066660` |
| Cuiabá/MT | `78049531` |
| Campo Grande/MS | `79070060` |
| Belém/PA | `66814133` |
| João Pessoa/PB | `58077005` |
| Curitiba/PR | `81580480` |
| Recife/PE | `51021080` |
| Porto Velho/RO | `76811278` |
| Boa Vista/RR | `69301380` |
| Aracaju/SE | `49081000` |
| Ribeirão Preto/SP | `14031710` |
| Uberlândia/MG | `38401140` |
| Joinville/SC | `89210705` |
| Feira de Santana/BA | `44072502` |
| Jaboatão dos Guararapes/PE | `54350732` |

> Sete cidades da lista original não entraram porque o ViaCEP não devolveu um CEP de bairro
> central para elas: Palmas, Florianópolis, Santos, Sorocaba, Londrina, Caucaia e Jundiaí.

