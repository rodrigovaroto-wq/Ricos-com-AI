# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive **todo** o
> contexto do projeto — negócio, pesquisa, especificação, decisões — e onde o
> agente de IA de vendas via WhatsApp vai ser construído. O outro repositório,
> `colet-cinta-modeladora` (renomeado para **Encorpa-Website**), guarda só o
> site oficial da Encorpa (landing page, checkout) e um `HANDOFF.md` resumido
> específico dele. Se um dia os dois divergirem sobre negócio, **este
> repositório é a fonte**.

> Atualizado em: 2026-09-05

---

## Em uma frase

Documentação e planejamento completos para um agente de IA de vendas via
WhatsApp (marca Encorpa, colete modelador, R$ 129,90, pagamento na entrega)
que vai operar **ao lado** do site (Encorpa-Website), não no lugar dele.
**Zero linha de código do agente ainda** — este repositório é 100%
documentação, pesquisa e decisão até aqui.

---

## Onde o trabalho parou

### Merges recentes no `main`

| PR | O que entrou |
|---|---|
| [#4](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/4) | Quatro rodadas de decisão com o operador (economia, frete, identidade, áudios, cupom, teto de custo) + o plano de construção ponta a ponta em `docs/agente/05-plano/` (duas imagens: linha do tempo e árvore de funções) |
| [#3](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/3) | Contexto inicial: produto, oferta, economia do COD, pesquisa em 8 repositórios open source, especificação funcional, guardrails |
| #2 | Correções de inconsistência encontradas em revisão |
| #1 | Estrutura inicial e guia de execução |

**Nenhum PR aberto agora.** Todo o trabalho até aqui está mergeado no `main`.

### O documento mais importante para começar

[`docs/agente/05-plano/README.md`](docs/agente/05-plano/README.md) — o plano
de construção do MVP, com:

- Onde estamos (linha do tempo, imagem)
- O que o agente vai fazer (árvore de funções e sub-agentes, imagem)
- As cinco ondas de construção (fundação → pré-venda → pós-pedido → testes
  internos → piloto pago)
- **14 perguntas em aberto**, amarradas à onda em que cada uma trava o início
  — não precisa responder tudo de uma vez, só antes da onda correspondente
- Critério de saída do MVP
- Riscos que o plano não resolve sozinho

Um PDF deste documento (com as duas imagens embutidas) já foi entregue ao
operador.

---

## A pilha, fixada na rodada 5

| Peça | Papel |
|---|---|
| **Supabase (Postgres)** | Todo o estado. Substitui o SQLite. A org atual (`Oria Data-Base`) já está no limite de 2 projetos do plano free — o projeto do agente vai numa **org nova**, também gratuita |
| **n8n** | Cano e relógio: entrada, filas, crons, webhooks, notificação. Instância que o operador já usa, separada por projeto/tags |
| **WAHA** | Transporte do WhatsApp. Desde a imagem `2026.6.1` os recursos do antigo Plus são gratuitos — mídia e áudio inclusos |
| **PikaPods** | Só o que precisa ficar de pé 24/7 (~US$ 1–4/mês por pod) |
| **Hermes Agent** | Otimizador periódico. Lê conversas, **propõe** mudanças; nunca publica sozinho |

**Duas restrições de execução:** ainda não existe número de WhatsApp, e não se gasta nada
antes de esgotar o gratuito. Por isso o plano foi reordenado em duas fases: a fase A inteira
roda contra um **canal simulado** e não depende do número; a fase B pluga o canal real. Ver
[`docs/agente/05-plano/README.md`](docs/agente/05-plano/README.md) §3 e a estimativa em §7
(13–18 sessões até o agente rodar sem canal; 5–9 depois disso até o fim do piloto).

---

## O que já foi decidido (não reabrir)

Registro cronológico completo em
[`docs/agente/04-decisoes/03-decisoes-tomadas.md`](docs/agente/04-decisoes/03-decisoes-tomadas.md).
Pontos que mais importam para quem retoma o trabalho:

- **Onde roda:** pod 24/7 para o WAHA — o canal exige sessão viva. O argumento do SQLite em disco caiu com a Supabase (rodada 5), mas o do canal continua de pé.
- **Transporte WhatsApp:** WAHA, número novo.
- **Fila de trabalho:** tabela SQL, sem Redis.
- **Ordem de prioridade das funções:** 1) Pré-venda 2) Pós-pedido 3) Recuperação de carrinho do site 4) Follow-up de longo prazo. A régua de 3 toques para quem silencia (Q9) é **intrínseca à pré-venda**, não uma função à parte — decisão explícita, já causou um erro de plano que foi corrigido antes do PR #4 (ver seção "Uma correção" no corpo do PR).
- **Desconto antecipado:** 15% (não 10%) — o frete do antecipado fica com a cliente; o site já implementa isso (ver `HANDOFF.md` do Encorpa-Website).
- **Cupom de retomada:** 20% de desconto, moldura "Super + dia da semana", ainda não criado na Coinzz — bloqueia o teste de ponta a ponta da régua de silêncio (onda 1).
- **Identidade do agente:** "não mente, não anuncia" — é a assistente vendedora oficial da Encorpa, texto livre sempre (nunca botões automáticos), respostas com atraso simulado e indicador de "digitando".
- **API da Coinzz:** confirmada (pedido nasce por checkout, não API — ver plano §onda 1 para o caminho alternativo caso o formato programático não funcione como esperado); webhook confirmado para status do pedido.
- **Frete Personalizado (Logzz):** pesquisado e **descartado** — variabilidade regional real de custo tornaria o cap arriscado; mantém-se desconto fixo em vez de cap de frete.

---

## O que fazer em seguida

Em ordem, seguindo o plano (`05-plano/README.md`):

1. **Comprar o chip do WhatsApp e começar a usá-lo como número comum.** É a única coisa da lista com prazo de calendário: número novo precisa de semanas de uso normal antes de receber tráfego. Não bloqueia nada da fase A, mas atrasa a fase B se ficar para depois.
2. **Onda A0** — org e projeto novos na Supabase, schema e migrações, fila em tabela, seam de chamada de modelo com teto de custo, contrato de canal com adapter simulado.
3. Seguir pelas ondas A1 → A4 (determinístico com teste → conversa → pedido e réguas → n8n, métricas e Hermes), respondendo as perguntas da seção 4 do plano conforme cada onda chegar nelas.
4. Acompanhar o `HANDOFF.md` do **Encorpa-Website** para mudanças no site que afetem o agente (novo checkout, nova página, etc.) — a relação é de mão dupla: o site também referencia este repositório para o contexto do agente.

---

## Sistema de memória entre sessões

Este repositório tem uma camada de memória persistente em
[`.claude/memory/`](.claude/memory/), carregada automaticamente via
`CLAUDE.md`. **Ler [`MEMORY.md`](.claude/memory/MEMORY.md) antes de qualquer
trabalho** — é o índice de fatos que uma sessão nova ficaria surpresa de não
saber de antemão. Ainda não existe camada 2 (armazenamento de longo prazo
fora do repositório).

---

## Mapa dos documentos

| Arquivo | Para quê |
|---|---|
| `HANDOFF.md` | Este. Estado do projeto inteiro, para trocar de sessão. |
| `CLAUDE.md` | Memória de projeto: stack, comandos, convenções, tabela de agentes especialistas (ainda não instalados). |
| `.claude/memory/MEMORY.md` | Índice de memória entre sessões — ler antes de trabalhar. |
| `docs/agente/README.md` | Índice de todo o contexto do agente — comece por aqui se for a primeira vez. |
| `docs/agente/00-contexto/` | O negócio: produto, oferta, público, economia do COD, modelo econômico, campanha, decisões firmes. |
| `docs/agente/01-conhecimento/` | O que o agente pode dizer: base de conhecimento (objeções, FAQ) e tabela de medidas — copy validada em tráfego pago. |
| `docs/agente/02-especificacao/` | O que o agente faz: mapa funcional, tools, máquina de estados, guardrails. |
| `docs/agente/03-pesquisa/` | 8 repositórios open source lidos em código, com evidência por arquivo e linha. |
| `docs/agente/04-decisoes/` | Lacunas, decisões em aberto e o log cronológico de decisões já tomadas. |
| `docs/agente/05-plano/` | O plano de construção até o MVP — comece por aqui para retomar o trabalho. |
| `docs/PROMPT.md` | Sistema comercial autônomo para **outro canal** (Instagram) — onde divergir de `docs/agente/`, vale `docs/agente/`. |
