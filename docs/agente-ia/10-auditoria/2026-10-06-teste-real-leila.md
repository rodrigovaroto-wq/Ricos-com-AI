# Auditoria — primeiro teste real pelo WhatsApp ("Leila", 2026-10-06)

> Conversa do operador como cliente interessada, no número de produção, `agent_version` 7
> (`turn` v72), modelo padrão `muse-spark-1.3`. Conversa `b6933f88-b7eb-461c-b833-6432c304b85b`
> (lead de teste, final 5983). Fontes: 9 prints do operador cruzados com `messages`,
> `turn_outcomes`, `gate_traces` e `llm_calls` no Supabase. 33 mensagens, 18 turnos, 35
> chamadas ao modelo, R$ 1,29 no total.
>
> Percepção do operador: "está repetindo muita coisa e respondendo cada mensagem, não
> responde com base no contexto … parece um robô e não um agente de IA".
>
> Desfecho: o que esta auditoria achou virou as versões 8 a 10 (grafo §59–§64) e o desenho
> [`06-script/05-conversa-de-venda-v2.md`](../06-script/05-conversa-de-venda-v2.md).

## Resumo

Os maiores problemas eram **mecânica**, não "falta de inteligência" do modelo:

1. Cada mensagem dela virava uma resposta separada.
2. Uma regra fixa (a escada do "não entendi") atropelava o modelo.
3. O teto de custo calou a Malu no meio da compra.

Por cima disso, defeitos de texto (repetição, contradição) e falta de informação do produto.

## As 3 falhas de maior peso

### 1. Responde cada mensagem, não a conversa

Cada inbound disparava um turno e uma resposta próprios, sem esperar ela terminar de escrever.

| Ela mandou | Malu respondeu |
|---|---|
| 14:17:51 "tem barbatanas de metal?" + 14:17:53 "qual o material?" | **duas** respostas quase iguais, as duas pedindo o CEP de novo |
| 14:22:27 "e se eu não estiver em casa?" + "Leila" + "Leila da Silva Claude" | **três** respostas: o link **duas vezes** e um terceiro "Valeu, Leila…" |
| 14:14:20 "Tudo e com você?" + 14:14:39 "Aah ok" | duas respostas que chegaram **fora de ordem** no celular |

As 3 respostas duplicadas custaram R$ 0,22 (17% da conversa). **Correção:** §59 (rajada = uma
resposta) e §61 (espera de 5 s; mensagem que chega enquanto escreve é incorporada, não descartada).

### 2. A escada do "não entendi" disparou com respostas reais

Depois da abertura ("Tem alguma roupa que você adora?"):

- "Aah ok" → "Desculpa, não entendi, qual o tamanho que deseja?" — ninguém tinha perguntado tamanho.
- "Tem sim, um vestido azul lindo que ganhei do meu marido!!" → "Precisa de ajuda para escolher o
  tamanho?" — a resposta certa à pergunta dela, tratada como ruído.
- "??" → "Quando decidir é só me falar que prossigo com a criação do seu pedido."

**Causa:** desde a v4 (R18.7) a escada valia depois de *qualquer* pergunta enquanto o tamanho não
estava definido, e só saía do caminho com tamanho, pergunta, decisão ou pagamento. **Correção:** §60
(escada removida; o modelo interpreta toda resposta).

### 3. O teto de custo calou a Malu no meio da compra

No "Não" das 14:28 a conversa já custava **R$ 1,29**, acima do teto de R$ 1,00, e foi para uma
pessoa com "Deixa eu confirmar isso certinho pra você e já te respondo por aqui 💛". Depois ela
perguntou as medidas do M, insistiu e mandou "??" — **ninguém respondeu**.

Por que custou tanto: cada resposta mandava ~7.000 tokens de instrução (≈ R$ 0,055) mais
~R$ 0,015 para interpretar cada mensagem; somavam-se as duplicadas e as reescritas (4 turnos com
resposta barrada e reescrita, um deles duas vezes, R$ 0,19 só nele). **Desfecho:** o operador
passou a produção para `muse-spark-1.3-contributor` (~R$ 0,03 por conversa na rodada final de
personas, §64) e manteve o teto em R$ 1,00.

## Erros de conteúdo e de raciocínio, mensagem a mensagem

| Hora | O que saiu | Problema |
|---|---|---|
| 14:13 | Recepção: "uma de nossas **atendentes** esclarecerá…" | Sugere atendimento humano. Texto fixo do operador; ele decidiu **manter**. |
| 14:14 | "eu sou a Malu, assistente virtual da Encorpa" (teste anterior, v5) | Contra Q10 ("não anuncia"). Corrigido em §58. |
| 14:18 | "esse detalhe do material e das barbatanas eu não tenho aqui" | Base sem material/estrutura. Fatos do operador entraram no prompt v2 (§62). |
| 14:17–14:18 | CEP pedido 3 vezes em 3 mensagens | Repetição. |
| 14:20 | "Anotei seu CEP, o checkout confirma a entrega quando você digita ele lá" | Pediu o CEP e não usou para nada. |
| 14:20 | R$ 129,90 dito **3 vezes** em 4 balões | Repetição e excesso de texto. |
| 14:21 | "Sim" → "já vou deixar tudo pronto" + kit "quer seguir com uma ou com duas?" | Ela nunca respondeu "uma ou duas"; a Malu assumiu 1. Oferta logo depois do sim quebrou o embalo. |
| 14:21–14:27 | "Vestido azul" **5 vezes**, "Leila" em quase toda mensagem | Personalização virou tique — o que mais soa robótico. |
| 14:22 | "escreve o tamanho M no campo de complemento" | Desatualizado: a Logzz tem seletor de tamanho. Removido (§62). |
| 14:22 | Link enviado só com o telefone | Sem nome, CPF e e-mail coletados. Desde §62/§63 o link só sai com os dados. |
| 14:24 | "daqui 5 dias?" → "Não consigo pra essa data" | Duas reescritas (o filtro barrou "5 dias", certo); a resposta final ficou seca. |
| 14:25 | "não posso encomendar?" → "**Pode sim**, é só abrir o link" | Contradiz a mensagem anterior. |
| 14:27 | Antecipado "em média 5 dias úteis" | Era a resposta para "daqui 5 dias", 4 mensagens antes — não ligou uma coisa à outra. |
| — | Só uma forma de pagamento apresentada | Desde §62: as duas lado a lado onde há pagamento na entrega. |

## O que funcionou

- Lembrou do tamanho M (40 de calça = M na tabela, correto).
- Explicou bem o pagamento na entrega.
- Os filtros barraram três promessas falsas: estoque não conferido, prazo de 5 dias e faixa de
  prazo no antecipado.
- Cada resposta saiu entre 7 e 25 segundos depois da mensagem dela.

## O que virou do quê

| Achado | Onde foi tratado |
|---|---|
| Uma resposta por mensagem, fora de ordem | §59, §61 (v8, v10) |
| Escada "não entendi" | §60 (v9) |
| Anunciar-se "assistente virtual" | §58 (v7) |
| Repetição, contradição, valor antes do preço, duas formas de pagamento, fatos do produto | §62 — prompt v2, do desenho `05-conversa-de-venda-v2.md` (v10) |
| Link sem os dados, tamanho no complemento | §62, §63 (v10) |
| "Ainda está aí?" quando ela some depois de uma pergunta | §61, R18.8 (v10) |
| Custo por conversa | modelo `-contributor` (operador), §64 |
| Recepção com "atendentes" | mantida (decisão do operador) |
