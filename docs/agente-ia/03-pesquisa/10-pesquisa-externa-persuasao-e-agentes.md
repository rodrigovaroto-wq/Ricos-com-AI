# Pesquisa externa II: persuasão, conversão e como construir um agente que substitui um humano

> **Data:** 2026-10-21. **Status:** pesquisa, nada virou código. Continua a
> [pesquisa I](09-pesquisa-externa-conversao-whatsapp.md) a pedido do operador: mais fundo em **persuasão e conversão** e em
> **estrutura e configuração de agentes de IA que igualem um humano**. Cruzado com o
> [script v3](../06-script/07-script-v3-funil-validado.md) e a [análise de arquitetura](../05-plano/12-analise-arquitetura-conversao.md).
> **Método:** cerca de 20 buscas + leitura direta de dois textos primários da Anthropic. Fonte secundária está marcada.

## 0. A resposta curta

1. **"Igual a um humano" não está provado em lugar nenhum.** Os melhores dados mostram que a IA **nivela por baixo e por volume**:
   ajuda muito o atendente novato (+34%), pouco o experiente, e perde para o humano em qualidade (taxa de resposta, reunião
   marcada), mas ganha em custo. O alvo realista para a Malu é **custo por pedido entregue ≤ o do humano**, não "vender
   igual ao melhor vendedor". Para isso precisamos do número do humano (§3, item 1).
2. **A estrutura que a literatura recomenda é a que o projeto já escolheu**: fluxo determinístico com gates em volta do
   modelo, estado fora do modelo, laço de avaliar-e-reescrever. O ganho agora não está em arquitetura nova, está em
   **medir confiabilidade (não só média)** e em **ajustes de persuasão no texto**.
3. **A maior alavanca de persuasão que a pesquisa sustenta é tirar pressão**, não adicionar gatilho: em texto, linguagem que
   ameaça a liberdade da pessoa gera reação contrária. Isso muda como a Malu responde "vou pensar" e como a régua cobra.
4. **Um achado que importa para a política da Malu**: bot **anunciado de cara** derrubou compra em ~80% num experimento de
   campo; bot **não anunciado** igualou vendedor competente. A regra do projeto (nunca afirma ser humana, não anuncia, responde
   honesto se perguntada) é a posição defensável. Ver §1.6.

## 1. Persuasão e conversão: o que tem evidência, e o limite de cada uma

Tamanhos de efeito importam. Quase tudo em persuasão é **pequeno**, e a literatura sensacionalista omite isso.

| # | Princípio | O que a pesquisa diz | Aplicação na Malu |
|---|---|---|---|
| 1.1 | **Reatância** (a pessoa resiste quando sente a liberdade ameaçada) | Meta-análise de 146 efeitos (2005–2024): linguagem de pressão aumenta raiva e pensamentos negativos e **reduz persuasão**, r≈0,20. O efeito é **maior em texto puro** que em vídeo/áudio ([SSRC/MediaWell](https://mediawell.ssrc.org/?p=515820), via resumo) | WhatsApp é texto. Trocar "aproveita agora", "garanta já" por moldura que devolve o controle: "fica à vontade", "se fizer sentido pra você". Vale para a régua de follow-up |
| 1.2 | **Perguntas calibradas e rótulo da emoção** (Voss) | Pergunta que deixa dizer **não** gera conforto e abre a conversa. Fontes secundárias, sem dado de venda por texto ([resumo](https://justcall.io/blog/best-sales-negotiation-chris-voss.html)) | "Vou pensar": "Parece que sobrou alguma dúvida. É o valor, o tamanho ou a entrega?" em vez de insistir |
| 1.3 | **Gong Labs, objeções** | 67 mil chamadas: os melhores vendedores **pausam mais e perguntam** antes de responder. O medíocre despeja monólogo de ~21 s. Correlação, não causa ([Gong](https://www.gong.io/resources/labs/handling-sales-objections/)) | Objeção vaga = uma pergunta curta, não um parágrafo de argumentos |
| 1.4 | **Prova social** | Mostrar avaliações eleva muito a compra: produto com 5 avaliações tem 270% mais chance de compra que sem nenhuma, num varejista de presentes ([Spiegel, via resumo](https://lipscore.com/blog/product-reviews-increase-your-online-sales-by-270/)). Fonte secundária diz que notas entre 4,0 e 4,7 inspiram mais confiança que 5,0 | Não achei teste de depoimento específico vs. genérico. Manter só avaliação real. **Rever "nota 5"** se a nota real tiver variação: uma nota perfeita pode soar falsa (afirmação não verificada) |
| 1.5 | **Pé na porta / porta na cara** | Meta-análise: efeitos **pequenos** (r≈0,17 e 0,15), exigem causa pró-social, e a porta na cara só funciona com intervalo curto ([Dillard et al., via resumo](https://pure.psu.edu/en/publications/sequentialrequest-persuasive-strategies-metaanalysis-of-footinthe/)). Uma réplica de 2014 não encontrou o efeito | O v3 já usa micro-passos (tamanho, CEP, nome) por facilidade (Fogg), não por "compromisso". Não esperar salto. Não montar a conversa em torno disso |
| 1.6 | **Divulgação de IA** | Experimento de campo, ~6.200 clientes, ligações de venda: bot **sem aviso** igualou o vendedor proficiente e superou o novato; **avisar antes** reduziu a compra em 79,7% ([Luo et al., Marketing Science 2019](https://pubsonline.informs.org/doi/abs/10.1287/mksc.2019.1206)). Era ligação ativa (a empresa ligou), não cliente que chega do anúncio | Confirma a regra do projeto: **não anunciar, nunca negar** (R2.3). Nunca "sou uma pessoa". O dado não autoriza mentir, e a cliente de anúncio já veio sozinha |
| 1.7 | **Personalização** | GPT-4 com dados do oponente venceu o humano em 64,4% dos debates em que um dos dois convenceu (900 pessoas, Nature Human Behaviour 2025). **Debate político**, não venda ([Salvi et al.](https://citations.prolific.com/paper/on-the-conversational-persuasiveness-of-gpt-4)) | A alavanca é usar o que **ela disse na conversa** (ocasião, tamanho, cidade). Só dado que ela deu |
| 1.8 | **Âncora, isca, kit** | O estudo clássico da isca (Economist) é de questionário, não de receita medida ([resumo](https://blogs.ubc.ca/onurkurtic/2015/07/10/the-decoy-effect/)) | A régua de preço do kit (1, 2 e 3 peças) já existe e os valores são reais. Não vender como "truque" |
| 1.9 | **Preço depois de entender** | Gong: ganho maior quando preço aparece em chamada longa após descoberta (fonte secundária, B2B). SPIN (35 mil chamadas): táticas de fechamento servem em **venda barata**; descoberta funda é para venda grande ([Rackham, resumo](https://en.wikipedia.org/wiki/Neil_Rackham)) | Colete de R$ 130 é compra de impulso. **Não importar** "11–14 perguntas de descoberta" de B2B. Uma pergunta bem posta basta |

### O ponto menos óbvio: o modelo também é persuadível

Equipe com Cialdini testou os 7 princípios em ~28.000 conversas com um modelo: com o gatilho (autoridade, compromisso, prova
social…), a obediência a pedidos que ele recusaria subiu de **33% para 72%** ([Wharton GAIL](https://gail.wharton.upenn.edu/research-and-insights/persuading-llms-initial-study/);
versão preliminar, modelo pequeno). Para a Malu isso é o risco inverso: a **cliente** (ou um golpista) pode usar "sou da
Meta", "a Ana já tinha liberado desconto", "todo mundo ganha frete grátis" para empurrar o modelo. O que protege é o que o
projeto já tem, a ação em código e os gates. Falta um teste por persona de **pressão por autoridade** (§3, item 6).

## 2. Como estruturar um agente que chegue perto de um humano

### 2.1 O que a evidência diz sobre "substituir"

| Fonte | Achado | Leitura para nós |
|---|---|---|
| [Brynjolfsson, Li e Raymond (NBER 2023)](https://nber.org/papers/w31161) | 5.179 atendentes: IA assistente subiu a produtividade ~14%, **34% nos novatos**, quase nada nos experientes | A IA **eleva o piso**, não o teto. A régua deve ser o vendedor mediano |
| [Klarna, via imprensa](https://siliconcanals.com/klarna-u-turns-on-ai-rehires-humans/) | IA fez o trabalho de ~700 atendentes, resolução de 11 min para 2. Em 2025 o CEO admitiu que o custo pesou demais e a qualidade caiu; voltou a contratar e garante "sempre há um humano" | Custo como único critério degrada. Mantém a lição: caminho para uma pessoa é decisão de projeto. **Atenção**: a regra R22.1 da Malu é nunca chamar pessoa; o que ela não resolve vai por e-mail. Vale revisitar quando houver volume |
| [Comparação pareada, 100 mil e-mails](https://www.digitalapplied.com/blog/ai-sdr-real-performance-100k-email-analysis-2026) | IA: resposta 4,1% vs 5,2% humano; reunião 0,7% vs 1,1%; custo por reunião bem menor (blog de fornecedor) | Padrão repetido: humano ganha em qualidade, IA em custo e volume. Híbrido é a recomendação, sem estudo independente |
| [Air Canada, tribunal 2024](https://manatt.com/insights/newsletters/advertising-law/ai-gone-wild-airline-has-to-honor-a-refund-policy) | A empresa foi obrigada a honrar reembolso inventado pelo chatbot; "o chatbot é entidade separada" foi rejeitado | Confirma que garantia, prazo, frete e desconto precisam ser gate. A promessa da Malu é a promessa da Encorpa |

### 2.2 Estrutura recomendada (Anthropic) contra o que o projeto tem

Fonte primária: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) e
[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

| Recomendação | O projeto |
|---|---|
| **Comece simples; só acrescente complexidade se a medição provar** | Decidido (R11: sem tool-calling, sem RAG, sem vetor) |
| **Fluxo com portões em código entre as etapas** (*prompt chaining*) e **avaliar-e-reescrever** | É a cadeia de gates com veto e reescrita (até cinco tentativas, R22.2) |
| **Guardrail em paralelo à resposta**, não dentro dela | Gates são código, fora do modelo |
| **Prompt na "altitude certa"**: nem regra frágil, nem vago. **Poucos exemplos canônicos valem mais que lista de regras** | O próprio [plano 12](../05-plano/12-analise-arquitetura-conversao.md) achou o prompt com regra de estilo demais produzindo texto longo (C7, R3). A Anthropic aponta o mesmo |
| **Contexto é finito**; manter notas fora da janela e recuperar só o necessário | Fato durável do lead em `jsonb` por extrator determinístico (R11.5) |
| **Interface das ferramentas** como docstring para júnior; desenhar para dificultar o erro | Aplica-se às ações em código (checkout, cobertura) |
| **Parada e supervisão humana** em ação irreversível | Hermes propõe, operador aprova (R14.14) |

### 2.3 Três riscos que a literatura traz e o projeto ainda não mede

1. **Conversa longa degrada o modelo.** Em 200 mil conversas simuladas, os modelos caíram em média **39%** do uso de uma
   mensagem para várias, a maior parte por **instabilidade** (+112%), não por falta de capacidade. Eles assumem cedo, tentam
   responder cedo e **não se recuperam** de um passo errado. Baixar a temperatura e repetir a instrução não resolveu
   ([Laban et al., Microsoft/Salesforce](https://arxiv.org/html/2505.06120v1)). Resposta: manter o estado **fora** do
   modelo (já existe) e **reinjetar um bloco compacto de fatos do lead a cada turno** (tamanho, CEP, cobertura,
   ocasião, objeções já ditas), em vez de confiar no histórico bruto.
2. **A média esconde a inconsistência.** O benchmark τ-bench (Sierra) mede **pass^k**: acertar a **mesma tarefa k vezes
   seguidas**. Para um modelo da geração anterior, ~61% numa rodada caía para ~25% em oito (números de fonte secundária,
   [resumo](https://capitalandcompute.net/ai-benchmarks/tau-bench/)). Cliente real repete a conversa de formas ligeiramente
   diferentes: uma persona que passa 1 vez em 1 não prova nada.
3. **Cliente simulado desiste de menos que cliente real.** Um estudo de 2026 mediu simuladores contra compra real e alerta
   que o simulador **suprime resistência** e passa a premiar táticas de pressão que o cliente de verdade ignora
   ([arXiv 2606.20708](https://arxiv.org/pdf/2606.20708), só o resumo lido). A bateria de personas prova que os gates seguram, **não
   que a conversão sobe**.

### 2.4 O que a Intercom ensina sobre configurar (vendor, mas é o texto mais prático)

[Fin Guidance](https://www.intercom.com/help/en/articles/10560969-fin-guidance-best-practices-writing-effective-ai-prompts):
descrever **o que informar** e deixar o modelo escolher as palavras; instrução específica e acionável ("pergunte qual produto
ela usa antes de responder"); **oferta de escalar situacional, não regra geral** (o geral reduz a taxa de resolução); base
de conhecimento defasada limita o teto, qualquer que seja o modelo. A taxa média de resolução de 56% em 30 dias é número do
fornecedor.

## 3. O que fazer: backlog adicional (acumula com os 7 itens da pesquisa I)

Ordem por impacto esperado sobre risco. Tudo é hipótese a medir; prompt e gate passam por `tests/prompt.test.ts` e
`pnpm dev:gates`.

| # | O quê | Por quê | Custo/risco |
|---|---|---|---|
| 1 | **Obter o número do humano**: conversão e custo por pedido entregue do fluxo manual do operador (o "FLUXO" do Drive) | Sem isso "igual a um humano" não é verificável. Define a meta | Zero de código; depende do operador |
| 2 | **Prompt e régua sem pressão** (§1.1): moldura de liberdade, nenhuma urgência fabricada, "sem pressa" explícito | Reatância; o texto puro agrava | Baixo; checar com `persona-denise` e `persona-neusa` (régua) |
| 3 | **"Vou pensar" e "tá caro" viram uma pergunta curta com rótulo** (§1.2–1.3) | Gong e Voss; liga com o achado §18 do plano 12 (recusa lida como "vou pensar") | Baixo; gate só muda por frase real (R21.6) |
| 4 | **Bloco de fatos do lead reinjetado a cada turno** (§2.3.1) | Degradação em conversa longa | Médio; olhar antes o que o `turn` já injeta |
| 5 | **Rodar cada persona N vezes e reportar pior caso e pass^k**, não só a média | §2.3.2 | **Custa chamadas ao modelo da Meta**. A memória *Sem gasto de API sem pedido* exige o seu OK antes |
| 6 | **Persona de pressão por autoridade/compromisso** ("sou da Meta", "a atendente disse que...") | §1, risco inverso | Baixo; reaproveita `persona-tati` e `persona-jussara` |
| 7 | **Validar a bateria contra as conversas reais**: comparar onde as personas param com onde as 33 reais pararam (`turn_outcomes`) | §2.3.3 | Sem custo de modelo; é consulta SQL |
| 8 | **Revisar a afirmação da nota** na prova social | §1.4 | Conferir a nota real nas avaliações |

**Mantidas as cinco recusas da rodada 11**: tool-calling, RAG, vetor, Hermes dentro do turno e auto-aplicar melhoria. A
pesquisa só reforçou: a Anthropic recomenda o mais simples que funcione.

## 4. O que não achei ou não verifiquei

- **Nenhum estudo independente de "IA vendendo no WhatsApp"**, nem de recusa no pagamento na entrega, nem de áudio vs. texto.
- Cialdini, Voss, Hormozi e SPIN vieram de **resumos**, não dos livros. Gong e Anthropic, dos textos originais.
- O estudo de divulgação (Luo) é de ligação ativa, não de cliente que chega do anúncio. O de personalização (Salvi) é debate político.
- Os números do τ-bench e das comparações IA/humano são de fonte secundária ou de blog de fornecedor.
- Tudo aqui é **hipótese de teste**. Nada foi medido nos nossos dados.

## 5. Fontes

[Anthropic: agentes](https://www.anthropic.com/engineering/building-effective-agents) ·
[Anthropic: contexto](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) ·
[Laban et al.](https://arxiv.org/html/2505.06120v1) · [Luo et al.](https://pubsonline.informs.org/doi/abs/10.1287/mksc.2019.1206) ·
[Salvi et al.](https://citations.prolific.com/paper/on-the-conversational-persuasiveness-of-gpt-4) ·
[Wharton GAIL](https://gail.wharton.upenn.edu/research-and-insights/persuading-llms-initial-study/) ·
[Brynjolfsson et al.](https://nber.org/papers/w31161) · [Klarna](https://siliconcanals.com/klarna-u-turns-on-ai-rehires-humans/) ·
[Air Canada](https://manatt.com/insights/newsletters/advertising-law/ai-gone-wild-airline-has-to-honor-a-refund-policy) ·
[AI SDR vs humano](https://www.digitalapplied.com/blog/ai-sdr-real-performance-100k-email-analysis-2026) ·
[τ-bench](https://capitalandcompute.net/ai-benchmarks/tau-bench/) · [Simulador vs compra real](https://arxiv.org/pdf/2606.20708) ·
[Intercom Fin](https://www.intercom.com/help/en/articles/10560969-fin-guidance-best-practices-writing-effective-ai-prompts) ·
[Gong Labs](https://www.gong.io/resources/labs/handling-sales-objections/) · [Reatância](https://mediawell.ssrc.org/?p=515820) ·
[Pé na porta](https://pure.psu.edu/en/publications/sequentialrequest-persuasive-strategies-metaanalysis-of-footinthe/) ·
[Spiegel](https://lipscore.com/blog/product-reviews-increase-your-online-sales-by-270/) · [Isca](https://blogs.ubc.ca/onurkurtic/2015/07/10/the-decoy-effect/) ·
[Rackham](https://en.wikipedia.org/wiki/Neil_Rackham) · [Voss](https://justcall.io/blog/best-sales-negotiation-chris-voss.html)
