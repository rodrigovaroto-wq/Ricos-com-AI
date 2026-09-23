# O corpus de 209 agentes do `agency-agents-app`, triado contra este projeto

Fonte: [`msitarzewski/agency-agents-app`](https://github.com/msitarzewski/agency-agents-app),
pasta `src-tauri/resources/corpus-baseline/` — 209 arquivos `.md`, um por agente,
em 16 categorias. Cada arquivo tem frontmatter (`name`, `description`, `color`,
`emoji`, `vibe`) e um corpo de 180 a 620 linhas com identidade, missão, **regras
críticas**, entregáveis e métricas de sucesso.

> **O que este documento é:** triagem de reaproveitamento. Nenhum desses agentes
> é instalado neste repositório e nada aqui muda o `CLAUDE.md` — a tabela de
> especialistas de lá continua não satisfeita. O valor está nas **regras
> críticas** de meia dúzia deles, que resolvem problemas nomeados no `HANDOFF.md`.
>
> **O que este documento não é:** autorização para despachar agente. Enquanto não
> existir `.claude/agents/`, a sessão principal implementa direto.

## O veredito em uma tabela

| Tier | Quantos | Critério |
|---|---|---|
| **Muito útil** | 14 | Tem regra crítica que ataca um problema nomeado no `HANDOFF.md` — enxertável em prompt, gate, doc ou processo |
| **Médio útil** | 38 | Serve a uma frente real (canal, atribuição, pós-venda, operação), mas depois das quatro frentes atuais |
| **Pouco útil** | 63 | Domínio adjacente (SEO, design, PM, finanças corporativas, B2B enterprise). Nada errado, só não é este negócio |
| **Inútil** | 94 | Game dev, XR, academia/worldbuilding, plataformas chinesas, verticais reguladas (saúde, jurídico, imóveis, crédito) e blockchain |

Total: 209. A checagem de cobertura é script, não olhômetro — nenhum arquivo
ficou sem tier.

---

## Tier 1 — Muito útil: o time recrutado

Cada linha diz **o que enxertar** e **onde**. A coluna "Ataca" cita a seção do
`HANDOFF.md` ou o arquivo que a característica corrige.

### 1.1 Os cinco que mudam o agente em produção

| Agente | Característica a enxertar | Ataca |
|---|---|---|
| `engineering-autonomous-optimization-architect` | Shadow traffic (5%), LLM-as-a-Judge com **critério numérico definido antes** do teste, circuit breaker por velocidade de falha, custo por 1M tokens obrigatório na proposta de arquitetura | Frente 3 item 1 — a troca `gpt-5.6-luna` → Muse Spark 1.3 e o teto de R$ 0,50/lead. Também a cota esgotada de 09/09: "halt on anomaly em 429 → rota barata + alerta humano" é exatamente o plano B que não existe |
| `engineering-prompt-engineer` | Prompt **versionado como código, fora do fonte**, com changelog de impacto medido, 3 casos de teste por prompt (feliz, borda, falha), e "teste no modelo e temperatura de produção" | O prompt de conversa mora dentro de `supabase/functions/turn/index.ts`, sem changelog e sem suíte. É o que torna o eval do passo (b) da Frente 3 impossível de comparar |
| `specialized-pricing-analyst` | Governança de desconto: **todo desconto com justificativa documentada e validade**; "mostre a conta" com análise de sensibilidade; margem antes de volume; alternativas preferidas ao corte de preço | Frente 4 item 6 — a economia de R$ 12,99 citável sem descontar o frete real. O framework dele resolve o impasse A/B/C com número, não com opinião. *(Resolvido em 22/09: saída A, §R10.6.)* |
| `specialized/customer-service` | **Escada de escalação em três níveis** (imediato / urgente / padrão) com gatilhos nomeados, transferência quente com briefing prévio, e "nunca prometa o que não pode entregar" | O handoff hoje é binário: ou a agente responde, ou cai no e-mail do operador. Não existe nível, não existe briefing, e o e-mail de recusa não classifica urgência |
| `product-behavioral-nudge-engine` | **Um próximo passo acionável por toque**, nunca despejo; off-ramp explícito ("quer ver mais ou paramos aqui?"); viés de default ("já deixei pronto, quer que eu envie?") | A régua de silêncio e a de pós-pedido. Hoje decidem *quando* tocar; não têm regra de *forma* do toque nem saída limpa para quem não quer mais |

### 1.2 Os quatro que mudam o processo de construção

| Agente | Característica a enxertar | Ataca |
|---|---|---|
| `specialized-workflow-architect` | Contrato explícito em todo handoff (payload, sucesso, **falha com código**, timeout, ação de recuperação); **estados observáveis** — o que a cliente vê, o que o operador vê, o que está no banco, o que está no log; suposição de tempo sinalizada; "verifique contra o código, não contra a descrição" | A máquina de estados e as três entradas da Edge Function. `firstReplyAt` em UTC (Frente 3 item 2) é exatamente uma suposição de tempo não sinalizada. O "verifique contra o código" é a armadilha 6 do handoff escrita por outra pessoa |
| `automation-governance-architect` | Padrão n8n: nomeação e versionamento de workflow, baseline de confiabilidade (retry, idempotência, dead letter), **baseline de log**, gatilhos de re-auditoria; e o veredito em cinco níveis (aprovar / piloto / automação parcial / adiar / rejeitar) | Os três workflows n8n (`HnGrxquQLpfbXWLH`, `gS72LhYGOnmyALRq`, `SVDtFUi2N9oOskkx`) não têm padrão de nome, versão nem log declarado. E o webhook que devolveu 200 por um dia sem criar conversa é falta de baseline de log, não de código |
| `testing-reality-checker` | Default **"NEEDS WORK"**; gatilhos de reprovação automática; exigir prova antes de declarar pronto | A armadilha 6 e o defeito mais caro do projeto: `freeShipping` lido como `false` em produção com 2.738 testes verdes e o deploy dado como concluído |
| `engineering-minimal-change-engineer` | Diff mínimo viável; recusa de scope creep; **três linhas parecidas antes de uma abstração prematura** | Já é a regra 3 do `CLAUDE.md` — este agente a transforma em checklist verificável em vez de intenção |

### 1.3 Os cinco de apoio direto

| Agente | Característica | Ataca |
|---|---|---|
| `engineering-database-optimizer` | Cobre **Supabase/PostgreSQL nominalmente**: índice, plano de query, schema | Nove tabelas e uma varredura de régua de 5 em 5 minutos sem nenhuma revisão de índice registrada |
| `security-senior-secops` | **Varre segredo e dado sensível antes de qualquer outra coisa** | Dois PATs colados no chat e um print com telefone e CPF de cliente real — §Higiene de segurança |
| `engineering-code-reviewer` | Revisão por correção/segurança/erro/cobertura, não por estilo | Preenche o slot `code-reviewer` da tabela do `CLAUDE.md` |
| `sales-discovery-coach` | **AECR** (Acknowledge → Empathize → Clarify → Reframe) e a distribuição real de objeção: 48% preço/valor, 32% timing, 20% concorrência. "Objeção de orçamento quase nunca é orçamento" | A base de objeções em `01-conhecimento/` e o script de `06-script/`. Dá ordem de prioridade ao que a agente treina primeiro |
| `marketing-email-strategist` | Sequências de ciclo de vida nomeadas (boas-vindas, nutrição, **reativação, win-back**, review, indicação) com benchmark de cadência | A régua de silêncio é uma sequência de reativação sem nome e sem benchmark. `silence_3` (o do cupom) está travado — o playbook dele diz o que entra no lugar |

---

## Tier 2 — Médio útil (38)

Servem, mas depois. Agrupados por quando entram.

**Quando o canal subir (Frente 2):** `specialized-mcp-builder`,
`testing-api-tester`, `testing-evidence-collector`, `engineering-sre`,
`engineering-incident-response-commander`, `engineering-devops-automator`,
`engineering-backend-architect`, `engineering-software-architect`,
`engineering-ai-engineer`.

**Quando existir tráfego e dado real:** `paid-media-tracking-specialist` (Meta
CAPI e atribuição de CTWA — o repositório de campanhas é o dono),
`paid-media-creative-strategist`, `paid-media-paid-social-strategist`,
`design-persona-walkthrough` (CRO com LIFT/Cialdini/Fogg),
`marketing-growth-hacker`, `marketing-livestream-commerce-coach` (técnica de
fechamento em venda ao vivo, o mais próximo de venda por conversa em PT-BR),
`support-analytics-reporter`, `product-feedback-synthesizer`.

**Quando a venda fechar sozinha (pós-venda):** `retail-customer-returns`
(devolução e reembolso — o direito de arrependimento não está no conhecimento da
agente), `customer-success-manager`, `support-support-responder`,
`support-legal-compliance-checker` (o corpo é GDPR, não CDC — vale o método, não
o conteúdo), `support-finance-tracker`, `sales-coach`,
`sales-offer-lead-gen-strategist`.

**Processo e documentação:** `engineering-technical-writer`,
`engineering-git-workflow-master`, `engineering-codebase-onboarding-engineer`,
`security-appsec-engineer`, `security-architect`, `specialized-model-qa`,
`specialized-chief-of-staff`, `agents-orchestrator`,
`specialized-cultural-intelligence-strategist`, `product-manager`,
`project-management-meeting-notes-specialist`, `testing-test-results-analyzer`,
`testing-workflow-optimizer`, `engineering-email-intelligence-engineer`.

## Tier 3 — Pouco útil (63)

Domínio adjacente, sem gancho neste projeto hoje: design de interface e marca
(8), SEO/AEO e conteúdo ocidental (12), paid media de busca e programática (4),
venda B2B enterprise e RevOps (7), gestão de produto e projeto (7), finanças
corporativas (3), engenharia de front/mobile/dados (6), testes de
acessibilidade e performance (3), segurança de nuvem/compliance/detecção (4),
agentes de relatório de vendas por Excel (4), e cinco avulsos
(`business-strategist`, `specialized-document-generator`,
`specialized-developer-advocate`, `specialized-salesforce-architect`,
`support-executive-summary-generator`).

## Tier 4 — Inútil (94)

Sem interseção com o negócio: game development (20 — Unity, Unreal, Godot,
Roblox, Blender), XR e computação espacial (6), academia e worldbuilding (5),
plataformas chinesas (20 — Douyin, Xiaohongshu, WeChat, Weibo, Zhihu, Baidu,
Bilibili, Kuaishou, Taobao), verticais reguladas (16 — saúde, jurídico, imóveis,
crédito, faturamento médico, hospitalidade, RH, recrutamento, ensino,
governo), blockchain e identidade de agente (6), engenharia de plataforma
específica (11 — Feishu, WeChat Mini Program, Filament PHP, Drupal/WordPress,
firmware, Solidity, OrgScript, LSP, terminal), e 10 avulsos (tradução ES↔EN,
mentoria pessoal, cadeia de suprimentos, mercado francês/coreano, produção de
estúdio).

---

## O que fazer com isso — ordem proposta

Nada abaixo está feito. É proposta de sequência, e cada passo é pequeno.

1. **Enxertar as regras críticas de `engineering-prompt-engineer`** no prompt da
   agente: tirar o texto de dentro do `index.ts`, versionar com changelog, e
   escrever os 3 casos por comportamento. Sem isso o eval da Frente 3 não tem
   linha de base.
2. **Aplicar o framework de desconto de `specialized-pricing-analyst`** ao item 6
   da Frente 4 — a decisão A/B/C sai de opinião e vira análise de
   sensibilidade com o frete real da tabela da Logzz.
3. **Escrever o contrato de handoff no formato de `specialized-workflow-architect`**
   para as três entradas da Edge Function e para os três workflows n8n, com
   estados observáveis. É o documento que a Frente 2 vai precisar de qualquer jeito.
4. **Trocar o handoff binário pela escada de três níveis de `customer-service`**,
   com gatilho nomeado por nível e briefing no e-mail do operador.
5. **Adotar o default "NEEDS WORK" de `testing-reality-checker`** como regra de
   deploy, ao lado do `pnpm typecheck:function`.

## Onde o corpus é fraco

Honestidade sobre o que ele não resolve:

- **Nenhum agente é PT-BR nem brasileiro.** Nenhum conhece CDC, direito de
  arrependimento de 7 dias, pagamento na entrega como modal dominante, ou
  regra de anúncio de vestuário no Brasil. O que se aproxima é chinês
  (livestream commerce), não brasileiro.
- **Nenhum conhece WhatsApp Cloud API.** O mais perto é WeChat/WeCom, que é
  outro produto com outra regra de janela e outro sistema de template.
- **É prompt, não código.** São arquivos de persona: regra crítica, entregável e
  métrica. Não há teste, não há biblioteca, não há nada para importar — o
  reaproveitamento é textual e cada regra enxertada continua precisando de teste
  nosso.
