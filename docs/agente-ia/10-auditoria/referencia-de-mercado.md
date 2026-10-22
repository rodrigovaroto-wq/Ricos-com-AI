# Referência de mercado — a régua da Malu enquanto não há o número do humano

> **Decisão do operador (2026-10-22, P0.4):** não existe o histórico do funil feito por gente (M1 do plano 16), então a régua é a
> **mediana de mercado**. Ver R29.3 em [`03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md) (as faixas) e a
> pesquisa I, [`09-pesquisa-externa-conversao-whatsapp.md`](../03-pesquisa/09-pesquisa-externa-conversao-whatsapp.md) §0 (a origem).

## Os números

| Métrica | Faixa de mercado | **Mediana usada como régua** | Como a Malu é medida |
|---|---|---|---|
| Conversa → pedido | 5–15% (MessageMind; a única faixa plausível entre os números de fornecedor) | **10%** | pedidos (`orders`) ÷ conversas reais (`conversations`, sem `5500099…`) |
| Recusa na porta, pagamento na entrega, **sem** confirmação | 20–30% | **25%** | pedidos COD com status de recusa ÷ pedidos COD com desfecho de entrega |
| Recusa na porta, **com** confirmação | 10–15% | **12,5%** | idem, depois que a confirmação existir |

## Como ler

- **São números de fornecedor e de resumo secundário, sem metodologia publicada.** Servem de referência para dizer "está muito abaixo"
  ou "está na faixa", nunca de meta fina nem de prova de que a Malu é melhor que alguém.
- **Leitura só com volume.** Com menos de ~100 conversas reais, um pedido a mais ou a menos move a taxa em pontos inteiros: a comparação
  com a mediana é feita ao fim do teste com tráfego, não por dia.
- **A Malu "está na régua"** quando conversa → pedido ≥ 10% e recusa na porta ≤ 25%. Abaixo de 5% (o piso da faixa), o funil tem um
  problema a achar antes de escalar verba.
- Quando existir o número do humano (ou o da própria Malu com volume), ele substitui esta página.
