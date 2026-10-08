# Auditoria — segundo teste real pelo WhatsApp ("Leila 2", 2026-10-07)

> Conversa do operador como cliente, no número de produção, do zero (lead final 5983 apagado antes).
> Conversa `816795ca-b47f-4567-b1b2-6ca445f42e94`. 43 mensagens, das 10:01 às 10:49 (Brasília).
> Turnos de 10:02 a 10:33 em `agent_version` **10**; de 10:39 em diante em **11** (publicada às 10:37).
> Modelo `muse-spark-1.3-contributor`. Custo total ≈ R$ 0,17 (42 chamadas). Fontes: `messages`,
> `turn_outcomes`, `gate_traces`, `llm_calls`, `followups`, `leads` — leituras do
> [roteiro](../../operacao/auditar-conversa-real.md); cada causa abaixo foi reproduzida contra a função
> exportada (`tsx`), não deduzida.
>
> **Desfecho: ela quis comprar, deu todos os dados, pediu o link cinco vezes e não recebeu. No fim,
> "pare de me mandar confirmações, apenas me mande o link do checkout" foi lido como pedido de
> descadastro e a conversa foi bloqueada** (`turn_outcomes` 10:49 `opted_out`, conversa em `bloqueado`).

## Linha do tempo resumida

| Hora | Ela | Malu | Problema |
|---|---|---|---|
| 10:02–10:03 | 3 perguntas (cinta, tamanhos, pagamento/parcelas) | 1 resposta, 3 balões | ✅ rajada juntada (3 `joined`) — mas 60 s de espera |
| 10:08 | "40 de calça" + "meu cep é 004710090" | "com 40 o seu é o M" ✅ · "**Recebi seu CEP**, deixa eu conferir…" | ❌ CEP com 9 dígitos **não foi lido**; ela disse que recebeu |
| 10:16 | "mais soltinha" | "Vou conferir esse CEP com calma… em quantos dias costuma chegar encomenda aí?" | ❌ promessa de ação que não existe; pergunta sem propósito |
| 10:21 | "qual a diferença?" | as duas opções, com preço ✅ | "o que confirma pra esse CEP é o checkout" pela 3ª vez |
| 10:24 | "o na entrega acho" | "deixo então no pagamento na entrega" + kit + nome, 3 balões | escolha **não gravada** (`payment_choice` nulo) |
| 10:27–10:28 | "1 mesmo" + "Leila 2" / "Leila da silva" | pede sobrenome, agradece ✅ | `identity.name` ficou "Leila" |
| 10:30 | e-mail: "nao vou passar não, valeu" | **resposta fixa do "vou pensar"** com "restam 12 unidades" | ❌ recusa de dado lida como adiamento |
| 10:31 | "isso me impede de comprar?" | "Não te impede" ✅ + pede CPF com motivo ✅ | — |
| 10:33 | CPF | "**Tá tudo pronto**… quer que eu te mande o link?" | ❌ faltava o CEP; ela disse que estava pronto |
| 10:39 | "sim pode mandar" | pede o CEP | ✅ a diretiva certa, mas tarde demais |
| 10:40 | "ja te mandei… é 004710090" | "**Anotei**, 004710090… te mando o link em seguida" | ❌ o mesmo CEP inválido de novo; "anotei" |
| 10:43–10:48 | "sim ok", "me manda o checkout logo", "você não vai me mandar o link????", "então manda logo" | 4× "estou deixando seu link prontinho, já te mando" | ❌ laço de promessa; nenhum link |
| 10:49 | "pare de me mandar confirmações, apenas me mande o link do checkout" | (nada — opt-out) | ❌❌ compradora bloqueada |

## Causas, por ordem de gravidade

### 1. Opt-out falso bloqueou a compradora — `classifyOptOut`
`src/agent/guardrails.ts` (`classifyOptOut`, padrão `(para|pare|parem|pode parar) de (me)? (mandar|enviar|encher)`).
`classifyOptOut("pare de me mandar confirmações, apenas me mande o link do checkout")` → `"explicit"`.
O padrão não olha **o que** ela pede para parar, nem que a mesma mensagem pede o link. O bloqueio é
terminal. **Conserto:** o objeto de "pare de mandar" precisa estar numa lista de permissão (mensagem,
oferta, promoção, nada, ou sem objeto); "confirmações"/"perguntas" com pedido de link/checkout na
mesma mensagem não é descadastro. Testes de negação com esta frase literal. **Opus** (heurística + bloqueio terminal).

### 2. CEP de 9 dígitos nunca lido, e ninguém avisou — `parseCep` + falta de diretiva
`src/agent/address.ts:74` — `/\b(\d{5})-?\s?(\d{3})\b/` exige limite de palavra; "004710090" (um zero
a mais antes de 04710-090) → `null` nas duas vezes. Sem CEP: sem região, sem `pathSettled`, e
`missingForLink` parou em `"cep"` até o fim. O modelo não sabia que o CEP não fora lido e disse "Recebi
seu CEP", "Anotei". **Conserto:** (a) um número com cara de CEP e tamanho errado (7 ou 9 dígitos) vira
diretiva determinística "esse CEP veio com N números, confere pra mim?" — **não** adivinhar o zero;
(b) o fato do turno diz ao modelo "CEP: ainda não recebido" quando não há CEP gravado, para ele nunca
dizer "anotei". Teste com "004710090".

### 3. CEP pedido só quando ela já quer fechar — diretiva com `linkDue`
`supabase/functions/turn/index.ts` (~3201): a diretiva do CEP só existe com `missing === "cep" && linkDue`.
`missingForLink` põe o CEP antes de nome/e-mail/CPF, mas as diretivas de nome, e-mail e CPF foram
seguindo e o CEP ficou mudo — às 10:33 ela tinha "tudo pronto" sem CEP. **Conserto:** com tamanho
conhecido e CEP ausente, a diretiva do CEP vale em todo turno (não só com `linkDue`), e os pedidos
de nome/e-mail/CPF esperam o CEP — a ordem que `missingForLink` já declara.

### 4. Promessa de ação que não acontece — sem gate
"deixa eu conferir como fica a entrega", "estou deixando seu link prontinho, já te mando em seguida"
(4×). Nenhum gate veta "te mando o link (em seguida|já|daqui a pouco)" num turno sem `checkoutUrl`,
nem "vou conferir o CEP". É a mesma família do "Deixa eu confirmar isso certinho" que o operador
aceita **só** como resposta de espera do handoff. **Conserto:** gate que veta promessa futura de
link/conferência quando o turno não manda link nem há handoff; o motivo volta ao modelo com o dado
que falta ("falta o CEP válido: peça de novo"). **Opus**; `pnpm dev:gates`.

### 5. Recusa de e-mail lida como "vou pensar" — intérprete
"nao vou passar não, valeu" (resposta ao pedido do e-mail) → `interpretation.wants_to_think = true` →
resposta fixa do adiamento (estoque "restam 12 unidades", "quando quiser seguir é só me chamar").
A decisão "e-mail recusado não insiste" do operador virou empurrar a cliente para fora. **Conserto:**
quando a última mensagem da Malu pede um dado (`refusedAsks` já reconhece a recusa), a resposta que
recusa esse dado não aciona `wants_to_think`; segue para o próximo dado.
> **Para o operador:** "restam 12 unidades desse lote" vem de `scarcity: { unitsLeft: 12, allowUnverified: true }`
> (ligado por você em 2026-09-08) — o número não tem contagem por trás. Reavaliar (CDC, propaganda enganosa;
> `compliance-reviewer`).

### 6. Pedido de link que não conta — `asksForLink`
`asksForLink` só reconhece o imperativo + "link" no começo da oração. Falso para "sim, me manda o
checkout logo", "você nao vai me mandar o link do checkout????", "então manda logo", "sim pode mandar".
Aqui não mudou o desfecho (o CEP travava antes), mas sem CEP travado o link também atrasaria.
**Conserto:** aceitar "checkout" como sinônimo de link e a pergunta cobrando ("não vai me mandar o link?").

### 7. Escolha "o na entrega acho" não gravada — `choosesPath`
`choosesPath("o na entrega acho")` → `false`; `payment_choice` ficou nulo. O modelo agiu como escolhido
("deixo então no pagamento na entrega"), mas o "sim" seguinte ("vou ficar com 1 mesmo") não confirma
nada e a escolha não foi gravada. **Conserto:** "acho" depois da escolha não é dúvida; a forma
"o/a (na entrega|pix)" sem verbo é escolha.

### 8. Nome completo não gravado
`leads.identity.name = "Leila"` depois de "Leila da silva". O extrator não substitui o nome curto pelo
completo. Checkout pré-preenchido sairia só com "Leila".

### Menores (texto)
- 60 s entre a rajada e a primeira resposta (duas reescritas por `unverified_size`, certas).
- "o que confirma pra esse CEP é o checkout" 3×; "1 peça no M pra cintura de 68 a 76 cm" 4×.
- Kit e pedido de nome na mesma mensagem (10:25) — o §64 separou kit de pedido de dado; conferir se voltou.
- "ajuda na postura" na abertura — conferir com a base de conhecimento (claim de saúde; `compliance-reviewer`).

## O que funcionou
- Rajadas juntadas (`joined` ×6, `superseded` ×1): uma resposta por rajada.
- Tamanho M pela calça 40; e-mail opcional respeitado quando ela perguntou; CPF pedido com motivo.
- `unverified_size` barrou 3 promessas de estoque; `delivery_promise` barrou "6 dias".
- Custo ≈ R$ 0,17 na conversa inteira (contribuidor).

## Ordem sugerida para o conserto (próxima sessão)
1. Opt-out falso (§1) — perde venda e bloqueia para sempre.
2. CEP: leitura + diretiva + fato do turno (§2, §3) e o gate de promessa (§4) — juntos fecham o laço.
3. Recusa de dado ≠ "vou pensar" (§5); `asksForLink` (§6); `choosesPath` (§7); nome completo (§8).
Cada um: teste de comportamento com a frase literal desta conversa + negações → conserto no espelho →
mutação → revisão Opus → grafo → publicar com o "pode publicar".

O lead final 5983 está **bloqueado** (opt-out): para testar de novo do zero, apague-o (ver roteiro).

---

## Situação depois do conserto (atualizado 2026-10-08)

> Tudo abaixo está na `turn` **v12** (função v84, publicada em 2026-10-08, commit `87e2922`) e na `whatsapp`
> v19; o que veio depois está na fila da v13. PR
> [rodrigovaroto-wq/Ricos-com-AI#56](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/56). Registro completo:
> [grafo §66](../../documentacao/decisoes/04-grafo-de-decisoes.md). Este arquivo **não se apaga**
> (operador, 2026-10-08: arquivo de diagnóstico fica).

| Causa | O que resolveu | Guarda (mutação em `src/dev/verify-guards.ts`) |
|---|---|---|
| **Causa-raiz que ninguém via:** região nula desde 24/09 | A consulta da Coinzz voltou a mandar `X-Requested-With: XMLHttpRequest`; sem ele vinha 302 e a Malu dizia "o checkout confirma" em vez de dar as duas opções | `G66-cabecalho-coinzz` |
| §1 Opt-out falso | Pedido de link em qualquer ponto da mensagem, ou em outra mensagem da rajada, é compra; recusa ("não quero", "não tenho interesse") continua bloqueando | `G66-optout-objeto`, `G66-optout-link-negado` |
| §2 CEP de 9 dígitos | `malformedCep` + diretiva "o sistema não leu, peça de novo"; não lê telefone, CEP negado nem número de casa | `G66-cep-errado` |
| §3 CEP só no fim | "Falta o CEP" antes de nome e CPF | `G66-cep-antes-dos-dados` |
| §4 Promessa sem ação | Gates `pending_promise` (frase por frase; condição libera só o envio; negação honesta passa) e `noted_claim` ("anotei") | `G66-promessa-de-link`, `G66-promessa-fiacao`, `G66-promessa-por-frase`, `G66-anotei` |
| §5 Recusa de e-mail = "vou pensar" | E-mail removido de vez (pergunta, armazenamento, migração 0024); `refusesAskedDatum` separa recusa de adiamento e de desistência | `G66-sem-email`, `G66-sem-email-prompt`, `G66-recusa-nao-e-pensar`, `G66-recusa-com-adiamento` |
| §6 Pedido de link | `asksForLink` lê "checkout", a cobrança ("quando vai me mandar o link?") e "manda logo"; condição ("se eu…", "quando eu pagar") não conta; link fixo do operador, sem perguntar | `G66-link-checkout`, `G66-link-cobranca`, `G66-link-condicional`, `G66-link-fixo`, `G66-link-por-oracao` |
| §7 "o na entrega acho" | `choosesPath` aceita artigo e "acho"; a palavra dela vence o intérprete; "antes eu queria…" não é antecipado | `G66-escolha-com-artigo`, `G66-escolha-contra-a-palavra`, `B8-antes-nao-e-antecipado` |
| §8 Nome completo | Partícula lida depois do pedido do nome; tempo e promessa ("fim de semana te passo") não viram nome; "Maria da Hora" é nome | `G66-nome-com-particula`, `G66-nome-nao-e-hora`, `B3-nome-com-hora` |
| Menores | Saudação da hora em 2 balões (também na 1ª resposta fixa); régua: "Ainda está aí?" 20 min e lembrete 1 h, 1×/dia; rajada espera 2 s; digitação 30% mais rápida | `G66-saudacao`, `G66-saudacao-hora`, `B2-saudacao-no-link`, `G66-uma-vez-por-dia`, `G66-uma-vez-por-dia-fiacao`, `G66-rajada-sem-espera`, `G66-lembrete-sem-tamanho` |

**Descobertos depois, nas personas e na revisão, e resolvidos no mesmo PR:** áudio da cliente transcrito
(Meta `muse-voice-transcribe-1.0`; `spoken()` faz as regras fixas lerem o que ela falou: `G66-audio-id`,
`G66-audio-fiacao`); tamanho inventado (`size_claim`); resposta de reserva vira o preço ou uma pessoa
(decisão 16); no máximo 2 pedidos de CEP (`D17-cep-no-maximo-2`) e 1 gancho por conversa (`D18-um-gancho`);
agregadores de valor lidos do config (`G66-agregadores-do-config`).

### O que este caso ensina (para não repetir)
1. **Um defeito de integração se disfarça de defeito de texto.** Seis dos sintomas ("o checkout confirma",
   nenhuma opção de pagamento) vinham de um cabeçalho HTTP faltando desde 24/09. Antes de mexer no prompt,
   confira se a consulta que alimenta a diretiva respondeu (`region` nula em todo turno é alarme).
2. **Palavra de saída ao lado de pedido de compra é compra.** Bloqueio é terminal; a dúvida vai para "não
   bloquear", e a negação do pedido ("nem me manda link") é o que mantém o bloqueio.
3. **Promessa de ação sem código que a cumpra precisa de gate**, frase por frase, com a negação honesta
   liberada — senão a cliente espera um link que ninguém manda.
4. **Todo leitor determinístico lê o texto dela, não o marcador do sistema** (áudio): um prefixo ou um
   ponto final mudam o resultado de uma regex ancorada.
5. **Mutação que "não se aplicou" não é guarda**: depois de mudar um trecho guardado, rode
   `pnpm verificar:guardas` e atualize a mutação no mesmo commit.
