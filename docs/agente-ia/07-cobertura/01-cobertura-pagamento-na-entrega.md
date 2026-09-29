# Cobertura real do pagamento na entrega

> **Atualizado em 2026-09-29 (D13 do cruzamento).** A cobertura do pagamento na entrega é a da
> **Logzz**, e a venda na entrega é feita no checkout da Logzz. O endpoint consultado
> (`app.coinzz.com.br/checkout/stock-and-delivery-day`, em `src/agent/availability.ts`) é a porta
> pública que lê essa mesma operação local da Logzz (`local_operation_cash_on_delivery`). Sondado
> em 2026-09-29: São Paulo (01310-100) → entrega com 3 datas, a partir do dia seguinte; Manaus
> (69005-010) → sem entrega. O "frete R$ 24,98" abaixo é o custo da operação, não o que ela paga:
> no checkout da Logzz o frete para ela é R$ 0,00 (R15.3).

> **Varredura de 2026-09-21**, 43 cidades × 5 tamanhos, contra o endpoint público
> `GET /checkout/stock-and-delivery-day` do próprio checkout da Coinzz. Substitui a
> varredura de 2026-09-08, mantida abaixo em §Como estava em 2026-09-08 para comparação.
> **Isto é uma fotografia, não uma tabela fixa** — o estoque do fornecedor muda. Rode de
> novo antes de tomar decisão de tráfego.

## O que a varredura de hoje estabeleceu

1. **A cobertura não se mexeu em treze dias.** As mesmas **22 das 43 cidades** têm
   pagamento na entrega, e são exatamente as mesmas 22 de 08/09. Nenhuma praça entrou,
   nenhuma saiu.
2. **O frete da entrega continua constante: R$ 24,98**, em todas as 22 praças e em todos
   os tamanhos disponíveis. Nunca variou em nenhuma das duas varreduras.
3. **O tamanho M deixou de estar zerado no país.** Ele apareceu em **Belo Horizonte,
   Contagem e Betim** — as três em Minas Gerais, as três atendidas pelo mesmo CD. Nas
   outras 19 praças com COD, o M continua ausente.
4. **Fortaleza perdeu o GG**, que existia em 08/09. É a única perda de tamanho da
   varredura.
5. **Nenhuma janela Express em lugar nenhum.** Em 09/09 o checkout oferecia uma modalidade
   `deliverySameDay` ("receba hoje em até 4 horas"); hoje as 22 praças com COD devolvem só
   a modalidade "Padrão", com três datas. A agente não pode prometer "hoje".

### O que o item 3 derruba

O `HANDOFF.md` registrava como decisão fechada que *"o M não é problema de estoque — é
parametrização de produtos da integração Logzz na Coinzz"*. **Essa conclusão não se
sustenta mais.** Parametrização errada de produto não funcionaria em três cidades e
falharia em dezenove: o M ter aparecido só nas praças de um mesmo CD aponta para
**estoque por centro de distribuição**, não para mapeamento.

O que **continua** valendo é a consequência prática, e por outro motivo: a consulta segue
sendo feita por região (com o G) e segue não vetando tamanho, porque a disponibilidade por
tamanho muda de semana para semana e a decisão final é do checkout da Logzz, não nossa.

## Onde a entrega existe, e em quais tamanhos (2026-09-21)

| Cidade | CEP testado | Tamanhos na entrega |
|---|---|---|
| Aparecida de Goiânia/GO | `74948030` | G, XGG |
| Belo Horizonte/MG | `30510670` | M, G, XGG |
| Betim/MG | `32681394` | M, G, XGG |
| Campinas/SP | `13067356` | G, GG, XGG |
| Caxias do Sul/RS | `95010130` | GG, XGG |
| Contagem/MG | `32052003` | M, G, XGG |
| Duque de Caxias/RJ | `25030300` | P, GG, XGG |
| Fortaleza/CE | `60176210` | XGG |
| Goiânia/GO | `74948030` | G, XGG |
| Guarulhos/SP | `07230370` | G, GG, XGG |
| Natal/RN | `59073817` | GG, XGG |
| Niterói/RJ | `24210396` | P, GG, XGG |
| Nova Iguaçu/RJ | `26293591` | P, GG, XGG |
| Osasco/SP | `06149290` | G, GG, XGG |
| Porto Alegre/RS | `91250373` | GG, XGG |
| Rio de Janeiro/RJ | `21011718` | P, GG, XGG |
| Salvador/BA | `41500620` | GG |
| Santo André/SP | `09230590` | G, GG, XGG |
| São Bernardo do Campo/SP | `09857170` | G, GG, XGG |
| São José dos Campos/SP | `12244546` | G, GG, XGG |
| São Paulo/SP | `04939180` | G, GG, XGG |
| Teresina/PI | `64060810` | G |

## Onde a entrega não existe (só antecipado)

| Cidade | CEP testado |
|---|---|
| Aracaju/SE | `49081000` |
| Belém/PA | `66814133` |
| Boa Vista/RR | `69301380` |
| Brasília/DF | `72615002` |
| Campo Grande/MS | `79070060` |
| Cuiabá/MT | `78049531` |
| Curitiba/PR | `81580480` |
| Feira de Santana/BA | `44072502` |
| Jaboatão dos Guararapes/PE | `54350732` |
| Joinville/SC | `89210705` |
| João Pessoa/PB | `58077005` |
| Macapá/AP | `68909141` |
| Maceió/AL | `57041350` |
| Manaus/AM | `69057004` |
| Porto Velho/RO | `76811278` |
| Recife/PE | `51021080` |
| Ribeirão Preto/SP | `14031710` |
| Rio Branco/AC | `69921092` |
| São Luís/MA | `65066660` |
| Uberlândia/MG | `38401140` |
| Vitória/ES | `29016345` |

> Sete cidades da lista original não entraram porque o ViaCEP não devolveu um CEP de bairro
> central para elas: Palmas, Florianópolis, Santos, Sorocaba, Londrina, Caucaia e Jundiaí.

## Como rodar de novo, e uma armadilha do ambiente

`pnpm dev:estoque` roda a consulta de fora do navegador. Duas coisas aprendidas em 21/09
rodando a varredura:

1. **Em série, não em paralelo.** Seis consultas simultâneas não foram a causa do problema
   abaixo, mas a varredura serial é barata (~4 minutos para 215 consultas) e não vale o
   risco de estrangular o serviço do fornecedor.
2. **Cuidado com falso-negativo de transporte.** Uma consulta que falha por rede e uma
   praça que não tem COD **são indistinguíveis na leitura**: `readAvailability` trata
   resposta ilegível como "sem COD", de propósito (errar para o antecipado é barato,
   prometer entrega inexistente é caro). Numa varredura isso vira uma tabela inteira de
   "não" silenciosos. Confira sempre uma praça sabidamente coberta — São Paulo com o G —
   antes de acreditar num resultado negativo em massa.

## Como estava em 2026-09-08

Varredura anterior, mantida para comparação. Diferenças para hoje: o M não existia em
nenhuma das 43 cidades, e Fortaleza tinha GG além do XGG. Todo o resto é idêntico.

- **22 cidades com entrega**, as mesmas de hoje.
- **Frete da entrega R$ 24,98**, constante. Total R$ 154,88.
- **O antecipado cobria tudo**: as 43 cidades, todos os tamanhos menos o M, e
  `POST /checkout/entrega/getAll` devolvia *sem frete configurado* nos 27 estados. O
  `local_operation` cotava de R$ 17,78 (São Paulo) a R$ 84,05 (Altamira/PA) — custo do
  operador, não preço da cliente.

| Cidade | Tamanhos na entrega em 08/09 |
|---|---|
| Salvador/BA | GG |
| Fortaleza/CE | GG, XGG |
| Goiânia/GO | G, XGG |
| Belo Horizonte/MG | G, XGG |
| Teresina/PI | G |
| Rio de Janeiro/RJ | P, GG, XGG |
| Natal/RN | GG, XGG |
| Porto Alegre/RS | GG, XGG |
| São Paulo/SP | G, GG, XGG |
| Guarulhos/SP | G, GG, XGG |
| Campinas/SP | G, GG, XGG |
| Santo André/SP | G, GG, XGG |
| Osasco/SP | G, GG, XGG |
| Niterói/RJ | P, GG, XGG |
| Duque de Caxias/RJ | P, GG, XGG |
| Nova Iguaçu/RJ | P, GG, XGG |
| Contagem/MG | G, XGG |
| Caxias do Sul/RS | GG, XGG |
| Aparecida de Goiânia/GO | G, XGG |
| São Bernardo do Campo/SP | G, GG, XGG |
| São José dos Campos/SP | G, GG, XGG |
| Betim/MG | G, XGG |
