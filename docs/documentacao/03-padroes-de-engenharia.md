# Padrões de engenharia

> Convenções herdadas de uma versão anterior deste repositório (`docs/PROMPT.md`,
> removido em 2026-09-05 por especificar outro sistema — prospecção ativa no
> Instagram). O que era específico daquele canal (automação de navegador via CDP,
> pausa por restrição do Instagram, teste de DM real) foi removido abaixo; o que é
> genérico de engenharia de software foi mantido, porque vale para qualquer coisa
> que este repositório construir, agente de WhatsApp incluído.

## Clean Code

Funções pequenas · nomes explícitos · retorno antecipado · regra de negócio sem
duplicata · sem `any` · sem erro engolido · sem código morto · sem abstração
especulativa · composição em vez de hierarquia · separação entre regra,
persistência, interface e integração · transição de estado atômica e auditável ·
validação nos limites de confiança.

Sem Clean Architecture cerimonial de camada vazia.

## Segurança e confiabilidade

Validação de env · segredo fora do Git · verificação de assinatura do webhook ·
log estruturado sem token ou senha · idempotência de webhook e job · retry com
limite · dead-letter · audit log · circuit breaker · pausa geral · recuperação
após reinício · bloqueio de envio duplicado.

Pausa automática diante de: crescimento anormal de erro, mensagem duplicada,
aumento de opt-out, comportamento inesperado da IA, estouro de orçamento de IA.

`.gitignore` obrigatório para: `.env`, `config/business.json`, qualquer perfil de
navegador usado por automação, `*.db`, `data/`, `backups/`.

## Testes — antes de concluir qualquer tarefa

Lint, type check, testes, production build e um fluxo end-to-end — os comandos
canônicos já estão em [`../../CLAUDE.md`](../../CLAUDE.md) §Canonical commands.
Cobertura específica do agente de vendas (dedupe de lead, idempotência de
webhook, follow-up, recuperação após reinício, lista de não contato, circuit
breaker, corte por orçamento) é rastreada como lacuna própria em
[`decisoes/01-lacunas.md`](decisoes/01-lacunas.md) item 30, não repetida aqui.
