# Regras dos experimentos do L3 (E6.1)

> **Sem datas e sem congelamento (R29.2, operador, 2026-10-22): o teste começa quando o operador ligar o tráfego e a leitura acontece ao fim dele.**
> (Os dias 23/10, 08–09/11 e a regra de congelamento que este arquivo trazia saíram em 2026-10-22, R29.15.)
>
> Escrito em 2026-10-12, **antes** de o teste começar. A leitura ao fim do teste segue estas
> regras e nenhuma outra. Mudar uma regra depois que o teste começa invalida o experimento que ela toca.
> Plano: [`13-plano-pratico-conversao.md`](13-plano-pratico-conversao.md) §E6. Decisões: R20.4–R20.6.
>
> **Status: ASSINADO pelo operador em 2026-10-12** (na sessão `claude/pipeline-e4-fix-exp-b`).

## 1. O que está sendo testado

Dois experimentos, cada lead sorteada nos dois, de forma independente, pelo telefone
(`src/agent/experiments.ts`, gravado uma vez em `leads.arm` = `{"A":0|1,"B":0|1}`).
Os dois usam **todas** as leads. O teste de criativo e de região do L3 (por anúncio) é ortogonal.

| Exp. | Braço 0 (controle) | Braço 1 (teste) | Flag no `BUSINESS_CONFIG` |
|---|---|---|---|
| **A** | Recepção + espera de 60 s + digitação de hoje | Sem recepção, sem a espera, digitação curta (≤ 3 s / 6 s) | `experiments.fastOpening: true` |
| **B** | Nome, CPF (e e-mail no antecipado) pedidos no chat antes do link | Link logo após tamanho + CEP + a escolha dela do pagamento, depois de uma oferta do kit com os descontos progressivos; o resto o checkout pede | `experiments.linkAfterChoice: true` |

Sem a flag, ninguém está no teste, seja qual for o braço gravado. **As duas flags são gravadas pelo
operador no segredo antes de ligar o tráfego, e não mudam até o fim do teste.**

## 2. ~~Agente congelada~~ — removido em 2026-10-22 (R29.15)

~~Nenhum deploy de prompt, gate ou config de venda durante o teste.~~ ✅ Não há congelamento: a agente é testada e publicada
quando estiver boa. Se uma mudança de prompt, gate ou config de venda subir durante o teste, o momento dela entra na leitura
(as leads de antes e de depois são comparadas separadamente).

O Hermes roda e propõe; nada se publica sozinho (R20.8).

## 3. Métricas (decididas agora)

Unidade: **a lead** (não o turno). Só leads de anúncio (`leads.source ? 'ctwa_clid'`), criadas durante a
janela do teste (da hora em que o operador liga o tráfego até o fim da fase de Região), com `arm` gravado.

| Exp. | Métrica principal | Definição exata |
|---|---|---|
| A | **Respondeu à 1ª resposta** | Ela mandou pelo menos 1 mensagem depois da 1ª mensagem nossa que **não** é a recepção automática ("Recebi sua mensagem…", `isReceipt` em `retry.ts`) — senão o braço 0 ganharia crédito por responder à recepção |
| A | Chegou ao preço (secundária) | Alguma mensagem nossa com "R$" |
| B | **Pedido ÷ lead** | A lead tem ao menos 1 linha em `orders` |
| B | Link → pedido (secundária, só indício) | Entre as que chegaram a `link_enviado` ou além, a fração com pedido |

## 4. Amostra e teste

- Esperado: ~470 leads → ~235 por braço em cada experimento.
- Com 235 por braço, α = 5% bilateral e poder de 80%, a menor diferença detectável perto de 50% é
  **~13 pontos** (2,8 × √(2 × 0,25 / 235) ≈ 0,129).
- Teste: **duas proporções, bilateral, α = 5%**, uma única vez, na leitura. **Ninguém olha o resultado
  no meio para decidir.**
- **Empate (p ≥ 0,05) → fica o mais simples:** A = o braço 1 (menos código de espera); B = o braço 0
  (o que já está provado em produção). Decidido aqui para não ser decidido pelo resultado.
- "Link → pedido" e "pedido ÷ lead" com poucos pedidos (piso do L3: ~47) são **indício**, não prova.
  Abaixo de 20 pedidos no total, B é lido só como indício, qualquer que seja o p.

## 5. Parada de segurança, por braço

Conferida todo dia pela leitura da E6.2. Um braço que cruza um limite é **desligado** (o operador
tira a flag; as leads dele voltam ao comportamento de hoje), e o motivo entra na leitura.

| Sinal | Limite (por braço, a partir de 30 leads) |
|---|---|
| Lead pediu pessoa (`leads.handoff_at` não nulo) | > 10% |
| Opt-out (`leads.opted_out_at` não nulo) | > 2,5% |
| Mentira confirmada pelo operador numa conversa | qualquer uma |
| Alarme de cobertura ("Encorpa — Alarme de cobertura") | pausa os dois braços até voltar |

## 6. A consulta da leitura

Uma por experimento; troque `'A'` por `'B'` e a métrica.

```sql
with l as (
  select ld.id, (ld.arm ->> 'A')::int as arm
  from leads ld
  where ld.source ? 'ctwa_clid' and ld.arm is not null
    and (ld.created_at at time zone 'America/Sao_Paulo') >= '2026-10-23'
    and (ld.created_at at time zone 'America/Sao_Paulo') <  '2026-11-08'
), m as (
  select l.arm,
    exists (
      select 1 from conversations c join messages mi on mi.conversation_id = c.id
      where c.lead_id = l.id and mi.direction = 'inbound'
        and mi.created_at > (select min(mo.created_at) from messages mo
                             where mo.conversation_id = c.id and mo.direction = 'outbound'
                               and mo.body not like 'Recebi sua mensagem%'
                               and mo.body not like '%uma de nossas atendentes%')
    ) as replied,
    exists (select 1 from orders o where o.lead_id = l.id) as ordered
  from l
)
select arm, count(*) as leads,
  count(*) filter (where replied) as replied,
  count(*) filter (where ordered) as ordered
from m group by arm order by arm;
```

O z das duas proporções: `p = (x0 + x1) / (n0 + n1)`, `z = (x1/n1 − x0/n0) / √(p(1−p)(1/n0 + 1/n1))`;
|z| ≥ 1,96 → diferença.

## 7. Antes de ligar o tráfego (checklist)

- [ ] `turn` com E1+E2+E3 e o experimento B publicada, migração 0026 aplicada (✅ 2026-10-12).
- [ ] As duas flags no `BUSINESS_CONFIG`; uma lead de teste de cada braço provada pela porta de produção.
- [ ] Alarme de cobertura ativo e `pnpm dev:n8n` ok.
- [ ] Ensaio com dinheiro (E5) feito.
- [x] Assinatura do operador: Rodrigo Varoto (data: 12/10/2026)
