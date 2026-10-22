# Triagem — reunião com a Octadesk (2026-10-14)

> Fonte: transcrição da demo (Wispr Flow), resumo, prints do brainstorming do sócio e dois insights do operador.
> Objetivo: separar o que melhora a Malu do que é pitch de venda. **Nada aqui é decisão** — é a pauta para o operador e o sócio
> escolherem. O que for escolhido entra no grafo e em `03-decisoes-tomadas.md` como R22.x.

## 0. Achado que muda a leitura da reunião

A conta da vendedora não fecha: 20 vendas + 30% = **26 vendas** (≈ R$ 3.380), não 60 vendas e R$ 7.800. Os "30% de conversão via
WhatsApp" e "70% menos tempo de atendente" são números de vitrine, sem base de comparação. Não usar como meta nem como régua para a L3 —
a régua continua sendo a do piso de amostra (`05-plano/08-piso-de-amostra.md`).

## 1. Lixo — descartado (não se aplica ou já foi decidido contra)

| Item da reunião | Por que sai |
|---|---|
| API oficial vs. não homologado, BSP direto vs. intermediário, Gupshup, fatura em reais | Já estamos na WhatsApp Cloud API direto da Meta (CNPJ). Problema resolvido. |
| Multicanal (widget no site, Instagram, Facebook, e-mail) | Fora de escopo até a L3 provar o WhatsApp. Site em segundo plano é o que o próprio sócio anotou. |
| Agentes ilimitados (pós-venda, financeiro, comercial) | A Malu já faz venda + pós-venda num só fluxo (R21). Mais agentes = mais prompt para manter sem ganho medido. |
| Base de conhecimento "sem limite" (PDF, Excel, site) | É RAG. Decidido contra (R11.4): a base cabe no prompt e RAG traz o modo de falha "recuperação errada". |
| Estúdio de fluxo arrasta-e-solta, 400 etapas | O fluxo é código com teste (R11.1). n8n já é o cano. |
| IA "aprende sozinha" com atendimento humano | Auto-aplicar está proibido (R11.6). O nosso loop já fecha no clique do operador. |
| Grupos, ligação, migração de histórico, app iOS/Android, suporte 8h–20h | Detalhes da plataforma deles. |

## 2. Já temos — não construir de novo

| O que a Octadesk vendeu | Onde já existe aqui |
|---|---|
| Simular tempo de digitação / humanização | `src/agent/pacing.ts` — atraso por bolha, presença "digitando" renovada, experimento A (abertura rápida). |
| Entender áudio | `supabase/functions/whatsapp` — transcrição `muse-voice-transcribe-1.0` + decoder Opus. |
| Consultar pagamento na entrega pelo CEP | `availability.ts` / `coinzz.ts` — cobertura Coinzz, falha de consulta nunca vira "sem entrega". |
| Status do pedido | Pós-venda lê o pedido e responde sozinha (R21, grafo §86). |
| Frete e promoção na conversa | Frete pelo config (R15.3), kits (`0009_kits.sql`). |
| Histórico completo / não repetir pergunta / lembrar a cliente | Histórico em `messages` + fato durável em `leads` (extrator determinístico, R11.5). |
| Follow-up de carrinho / fora da janela de 24h | Régua em `followups.ts`, template MARKETING/UTILITY fora da janela. |
| Sugerir melhoria e o humano aprovar | Hermes → `hermes_proposals` → Rotina "Hermes – decisão" → implementa, prova, publica. |
| Reverter atualização que piorou a métrica | `REVERTER-*` no Hermes (`hermes/DECIDIR.md`): reversão entra primeiro e trava propostas novas. |
| Humano assume o atendimento | Handoff + formulário n8n "Responder cliente". |
| Origem do lead (campanha) | `eval_attribution` (0018), CTWA. |
| Métricas por versão do agente | `agent_versions` + `eval_version_outcomes` (0021), `pnpm painel`. |
| Testar antes de produção | CI = sandbox (R11.7), personas, `pnpm dev:eval --compare`. |

## 3. Vale avaliar — candidatos reais

Ordenado por (ganho para a meta R21.1 "Malu resolve sozinha") ÷ (custo). Cada um já sobe a escada de código.

### A. Painel visual por versão do agente (insight 1 do operador) — **recomendado**

- **O que é:** uma página com cada versão (`agent_versions`) lado a lado: o que mudou (nota, commit, proposta do Hermes), conversas,
  taxa de handoff, taxa de fallback, venda (link enviado → pedido), custo por conversa, e o veredito "melhorou / piorou / sem amostra".
- **O que já existe:** os dados (`eval_version_outcomes`, `eval_funnel`, `eval_arm_*`) e o painel em texto (`painel-core.ts`). Falta
  só a visualização e a coluna de venda por versão.
- **Custo:** baixo — uma view a mais (funil por versão) + uma página estática gerada pelo `painel` (como os `.html` de `docs/operacao/`).
  Não vira produto/UI (a regra "sem frontend" continua: é relatório do operador).
- **Cuidado:** com 5 leads, toda versão mostra "sem amostra". O veredito tem de respeitar o piso de `08-piso-de-amostra.md`, senão o painel
  ensina a decidir por ruído.

### B. Taxa de resolução sem pessoa — **recomendado (é a métrica da R21.1)**

- **O que é:** % de conversas que terminaram sem handoff (resolvidas pela Malu), por versão e por motivo do handoff. Foi o número que mais
  agradou na demo, e é exatamente a meta R21.1.
- **O que já existe:** `turn_outcomes.handoffs`. Falta gravar o **motivo** do handoff (pedido explícito de pessoa, reescritas esgotadas,
  pós-venda sem pedido…) — a rodada de testes de 13/10 mostrou que os dois furos abertos são handoffs por motivos diferentes.
- **Custo:** baixo — uma coluna `handoff_reason` e uma view. Entra no painel A.

### C. Etiqueta automática do atendimento — **avaliar junto com B**

- **O que é:** cada conversa ganha uma etiqueta legível (ex.: `comprou-cod`, `duvida-entrega`, `recusou`, `pos-venda-troca`, `handoff-preço`).
- **O que já existe:** `conversations.stage` (10 estágios) e os desfechos de turno já são etiquetas — só não têm nome de negócio.
- **Custo:** quase zero se for derivada em view a partir do estágio + motivo do handoff. **Não** fazer com chamada ao modelo.

### D. Sinal de cliente impaciente/irritada — **avaliar depois da L3**

- **O que é:** a "análise de sentimento" da demo. Aqui seria um detector determinístico (repetição da mesma pergunta, "??", "alô",
  caixa alta, "já perguntei") que muda a resposta (mais curta, direto ao ponto) — não um modelo a mais.
- **Por que esperar:** a regra R21.6 — gate/heurística só muda por frase real. Hoje não há frase real de impaciência no corpus. Anotar
  as que aparecerem na L3 e decidir com elas.
- **Risco:** toda heurística de texto aqui já errou em negação (memória `negation-blindness`).

### E. Pesquisa de satisfação pós-entrega — **avaliar depois da L3**

- **O que é:** uma mensagem depois do "entregue" ("de 1 a 5, como foi?").
- **Custo:** baixo no código (um toque na régua), mas fora da janela de 24h exige template UTILITY aprovado pela Meta (o sócio cuida) e
  custa por mensagem. Com 0 pedidos hoje, não há quem responder. Faz sentido quando houver volume de entrega.

### F. Pergunta da entrega como objeção nº 1 (print do sócio, 11:16) — **verificar, não construir**

- "Dúvida da entrega" é a objeção que mais consome tempo. Conferir no corpus se a resposta fixa de prazo (§87) e os fatos R21.7 cobrem as
  variações reais. Se cobrem, nada a fazer; se não, entra na próxima leva de consertos da rodada de testes.

## 4. Fica de fora sem discussão — insight 2 do operador

**Acessar `beta.octadesk.com` e fazer engenharia reversa para copiar a plataforma: não fazemos.** É a área logada de clientes deles;
entrar sem ser cliente é acesso não autorizado, e copiar código/interface viola os termos de uso e direitos autorais deles — risco jurídico
para a Encorpa sem ganho, porque o que vale (seção 3) já foi visto na demo e não depende do código deles. Ideia de funcionalidade não é
protegida; o que a demo mostrou já está anotado acima. Se quiserem mais detalhe, o caminho limpo é a documentação pública e o vídeo de
demonstração que a vendedora vai mandar.

## 5. Proposta de ordem (para o operador decidir)

1. **Agora (antes da L3):** nada novo. A prioridade é fechar os 2 furos da rodada de testes de 13/10 (HANDOFF.md) — eles mexem
   diretamente na taxa de resolução.
2. **Durante a L3:** B + C (motivo do handoff e etiqueta) — são baratos e fazem a L3 render informação.
3. **Leitura da L3 (ao fim do teste):** A (painel por versão), já com dados de verdade.
4. **Depois da L3, com volume:** D e E, se as frases reais e o volume de entregas justificarem.
