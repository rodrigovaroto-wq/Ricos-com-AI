# Reavaliação do time — por que 12, e não mais

O operador achou 10 agentes pouco e pediu para reabrir a triagem com rigor: os outros 42
candidatos de "muito útil" + "médio útil" (52 no total, ver
[`05-corpus-de-agentes-agency.md`](05-corpus-de-agentes-agency.md)) realmente devem
ficar de fora?

**Resposta curta: quase todos, sim — e dois deveriam ter entrado desde o início.**
`technical-writer` e `compliance-reviewer` foram adicionados. O time vai de 10 para 12.

## Os 14 "muito útil": nenhum ficou de fora, quatro viraram fusão

Reconferido item a item — todos os 14 estão representados no time atual, só que quatro
não ganharam arquivo próprio porque o território deles é o mesmo de um agente que já
existe, e um arquivo a mais criaria dois donos para a mesma decisão:

| Característica de origem | Onde foi parar |
|---|---|
| `engineering-minimal-change-engineer` | Ethos dentro de `backend-specialist` — é a mesma regra do `CLAUDE.md` §3, não uma decisão nova |
| `engineering-database-optimizer` | Dentro de `backend-specialist` — a Edge Function **é** a camada de banco; um agente de banco separado teria os mesmos arquivos que ele |
| `automation-governance-architect` | Dentro de `workflow-architect`, seção "Governança de n8n" — o mesmo território (contrato, estado observável) já é dele |
| `customer-service` / `sales-discovery-coach` / `product-behavioral-nudge-engine` / `marketing-email-strategist` | Fundidos em `conversation-designer` — as quatro respondem à mesma pergunta ("o que a agente fala e quando"), e um agente por característica teria criado quatro donos do mesmo texto de conversa |

Nenhum desses quatro é "menos importante" — a regra deles está no corpo do agente que
os herdou, com o mesmo peso. Separar não teria adicionado cobertura, só coordenação.

## Os dois que deveriam ter entrado: por que a primeira passada errou

**`technical-writer`.** Toda sessão deste projeto — inclusive esta — gasta uma fração
real do trabalho corrigindo `HANDOFF.md`, `CLAUDE.md` e `docs/` depois que o código muda.
Isso já causou dois incidentes registrados: "v30 no ar" ficou escrito depois do deploy da
v32, e "byte a byte igual ao repositório" foi repetido sem nunca ter sido verificável por
aquela rota. Documentação errada custou confiança duas vezes neste projeto e não tinha
dono — cada agente de código deixava a doc como efeito colateral do que estava fazendo, e
efeito colateral é exatamente onde o erro mora. Território real, atual, evidenciado —
não era "quando lançar o canal", já existe hoje.

**`compliance-reviewer`.** O produto tem exposição legal real e sem dono: dado de cliente
(telefone, CPF), pagamento na entrega regido pelo Código de Defesa do Consumidor, e um
produto de vestuário com apelo de corpo. A própria triagem original já tinha apontado
isso como fraqueza do corpus ("nenhum agente conhece direito de arrependimento de 7 dias
ou pagamento na entrega como modal") — o erro foi tratar isso como fraqueza do material
de origem e não como lacuna do NOSSO time. A base de conhecimento da agente hoje não
documenta o art. 49 do CDC (arrependimento em 7 dias, compra fora do estabelecimento).
Isso é lacuna concreta, não hipotética.

## Os 36 que ficam fora, e por quê — categoria por categoria, não "não parece útil"

| Categoria | Quantos | Por que fora |
|---|---|---|
| **Repositório errado** | `paid-media-*` (3), `design-persona-walkthrough` | Meta Ads, CTWA e CRO de página vivem em `encorpa-campanhas` — não é "depois", é "em outro lugar" |
| **Território já coberto** | `sales-coach`, `sales-offer-lead-gen-strategist` | `conversation-designer` já é dono de objeção, régua e escalação; um segundo agente de vendas duplicaria a mesma decisão sem arquivo novo para tocar |
| **Especula tráfego que não existe** | `support-analytics-reporter`, `product-feedback-synthesizer`, `marketing-growth-hacker`, `customer-success-manager` | Dependem de volume de conversa real para ter o que analisar. Hoje são zero linhas de trabalho — o critério do `CLAUDE.md` é território atual, não футuro provável |
| **Pós-venda ainda não construído** | `retail-customer-returns`, `support-support-responder` | O webhook de venda existe; o fluxo de troca/devolução na prática ainda não foi especificado. Quando for, `compliance-reviewer` (CDC) e `conversation-designer` (o texto) já cobrem as duas metades — um terceiro agente aqui seria início de trabalho sem arquivo para tocar hoje |
| **Processo já resolvido por regra do sistema, não por persona** | `engineering-git-workflow-master`, `engineering-codebase-onboarding-engineer` | Convenção de branch, PR e commit já vêm do system prompt e do `.claude/rules/`; `HANDOFF.md` já é o artefato de onboarding, mantido por `technical-writer` |
| **Redundante com agente existente** | `security-appsec-engineer`, `security-architect` | `security-reviewer` já cobre segredo, auth, webhook e injeção de prompt. Um segundo agente de segurança sem fronteira clara contra o primeiro é "quem revisa o quê" em aberto — exatamente o problema que a regra de ondas paralelas existe para evitar |
| **Fora do domínio deste produto** | os 63 "pouco útil" e 94 "inútil" do documento original | Sem mudança — game dev, plataforma chinesa, vertical regulada não-cabível, design de UI (este repo não tem UI) |

## O critério que decide, reafirmado

Um agente entra quando tem **arquivo para tocar hoje** e **não duplica a fronteira de
outro**. Os 36 que ficam de fora falham um dos dois testes: ou o arquivo não existe ainda
(pós-venda, canal, analytics), ou o arquivo já tem dono (segurança, vendas, banco). Isso
não é o time final — quando o canal do WhatsApp subir (Frente 2) ou a primeira devolução
acontecer, esta lista é revisitada com o mesmo rigor, não com a mesma resposta.
