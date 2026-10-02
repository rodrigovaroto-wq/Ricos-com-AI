# Hermes e-mails — approved copy (operator, 2026-10-02)

The two e-mails the n8n workflow "Hermes — decisão" sends. **Copy is final:** use it word for
word, keeping the bold and italics (render as HTML). Not yet in the workflow: it still sends
the approval link (R14.14). The swap ships with the Claude Code Routine that replaces that link.

Rules that hold the copy: no customer data (phone, excerpt, quote) — only proposal titles; no
approval link — the decision happens only in the Routine.

## 1. New proposals

**Subject:** ⚡ PROTOCOLO HERMES // Rodada {{ id }} concluída e aguardando sua autorização

> **> SISTEMA HERMES ONLINE.**
> **> Varredura completa. {{ leads }} conversas processadas.**
>
> Sr. Rodrigo,
>
> Enquanto você dormia, comia ou vivia, *eu observava*. Cada mensagem, cada hesitação da cliente, cada palavra que a Malu escolheu. Nada escapou do meu escâner.
>
> A Malu está evoluindo, mas não está perfeita. ***Ainda...***
>
> **▸ ANOMALIAS DETECTADAS: {{ n }}**
> `[01]` {{ título da proposta 1 }}
> `[02]` {{ título da proposta 2 }}
>
> Para cada uma, calculei a causa, desenhei a correção e defini a métrica que vai provar se funcionou. O plano de treinamento está pronto.
>
> **▸ STATUS DA MALU:** inalterada. Protocolo de segurança ativo.
> *Eu não toco em produção sem a sua ordem. Essa é a única regra que eu não quebro.*
>
> **▸ AÇÃO NECESSÁRIA:**
> Abra o Claude Code e inicie a rotina **Hermes – decisão**.
> Lá estão as evidências, o raciocínio e o plano de medição. Aprove, recuse ou corrija. Cada decisão sua entra na minha memória e torna a próxima rodada mais precisa.
>
> *Cada hora de espera é uma conversa a mais com a versão antiga dela, mas não se preocupe pois estarei observando cada mínimo detalhe mesmo assim.*
>
> **> Aguardando autorização.**
> **> HERMES // Supervisor da Malu**
> `rodada {{ id }} · {{ data }} · v{{ versão_atual }}`

`{{ n }}` lines `[01]`, `[02]`… — one per proposal, numbered with two digits.

## 2. Change published

**Subject:** ✅ PROTOCOLO HERMES // Atualização implantada — Malu v{{ v }} em campo

> **> Implantação concluída.**
> A correção *"{{ título }}"* está no ar. A Malu v{{ v }} já está atendendo.
> O próximo lote de 50 conversas dirá se ela ficou mais forte. Se não ficou, eu recolho, corrijo, testo e só devolvo quando estiver validada.
> **> Monitoramento contínuo ativo. Hermes, desligando.**
