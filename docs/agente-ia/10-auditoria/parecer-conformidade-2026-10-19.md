# Parecer de conformidade: o que a Malu diz e envia (2026-10-19)

Pedido do operador, antes de vender de verdade pelo WhatsApp com anúncio que abre a conversa (CTWA). Escrito pelo
`compliance-reviewer`. **Não sou advogado.** Este parecer aponta riscos e a menor mudança que os reduz; onde a dúvida é
genuinamente jurídica, ela está marcada como **pergunta para o advogado**. A decisão de aceitar um risco é do operador,
nunca deste documento.

Severidades usadas:

- **Bloqueia**: corrigir antes de gastar verba de anúncio. Ou expõe a operação a sanção concreta (CDC, LGPD, conta do
  WhatsApp), ou a correção custa uma linha e não há motivo para esperar.
- **Corrigir logo**: risco real, mas não impede a primeira venda; entra na próxima rodada.
- **Aceitável**: está certo hoje, ou o risco é pequeno e conhecido. Fica registrado para não ser reaberto sem motivo.

---

## 0. Fontes: o que li, o que busquei e o que é de memória

**Lido no repositório:** `src/agent/funnel.ts`, `src/agent/prompt.ts`, `src/agent/guardrails.ts`, `src/agent/retry.ts`,
`src/agent/coinzz.ts`, `src/agent/followups.ts`, `supabase/functions/turn/index.ts` (pós-venda e pedido de pessoa),
`supabase/functions/whatsapp/index.ts` (transcrição e descrição de imagem), migrações `0001`, `0002`, `0019` e `0020`,
`config/business.example.json`, `docs/agente-ia/01-conhecimento/01-base-de-conhecimento.md`,
`docs/documentacao/decisoes/03-decisoes-tomadas.md` §R28, `hermes/README.md`, `HANDOFF.md` e `CLAUDE.md`. Também baixei e
olhei as três imagens públicas do funil (`avaliacoes.png`, `preco.png` e `tamanhos.png`, bucket `funil`).

**Busquei pela rede (proxy), com resultado:**

| Fonte | Resultado |
|---|---|
| WhatsApp Business Messaging Policy (`business.whatsapp.com/policy`, "Last updated: September 23, 2026") | **Lida.** Citações abaixo marcadas [WA-pol]. |
| Preço da WhatsApp Business Platform (`developers.facebook.com/docs/whatsapp/pricing`) | **Lida.** Janela de entrada gratuita (FEP) de 72 h. |
| CDC, Lei 8.078/1990 (Câmara, publicação original) | **Lida** (arts. 26, 30, 31, 35, 37, 38, 49, 66, 67 e 69). O planalto.gov.br recusou a conexão. |
| LGPD, Lei 13.709/2018 (Câmara, publicação original) | **Lida** (arts. 5º, 6º, 7º, 8º, 9º, 18 e 20). Atenção: é o texto **original**; a Lei 13.853/2019 alterou o art. 20, por exemplo. |
| Meta Advertising Standards, "Personal Health and Appearance" | **Não consegui.** O `transparency.meta.com` devolveu 404 na URL específica e a página geral é renderizada por JS. **Cito de memória.** |
| WhatsApp Business Solution Terms (cláusula de "AI Providers") | **Não consegui** (redireciona para login). **De memória.** |
| Decreto 7.962/2013 (comércio eletrônico) | **Não consegui** (planalto recusou; a URL da Câmara deu 404). **De memória.** |
| CONAR, Código de Autorregulamentação | **Não consegui** (403). **De memória.** |
| ANVISA, RDC 751/2022 (dispositivos médicos) | Só baixei a página inicial da ANVISA, sem o texto da RDC. **De memória.** |
| Site `encorpa-fashion.com.br` | É SPA (o HTML não tem texto); `/politica-de-privacidade` e `/privacidade` deram 404. **Não verifiquei** se há política de privacidade publicada em outra rota. |

---

## 1. Quadro dos achados

| # | Achado | Frente | Severidade |
|---|---|---|---|
| A1 | "Enquanto você usa, **emagrece**" (R28): a Malu responde "sim" a "emagrece?", e o FAQ da própria marca diz "Não" | CDC 37, Meta | **Bloqueia** |
| A2 | Áudio 1: "reduz até **três tamanhos de cintura** imediatamente" e "virou uma **febre nos Estados Unidos**" | CDC 37, 38, 69 | **Bloqueia** |
| A3 | Modelo `-contributor` (que treina com os dados) rodando sobre cliente real | LGPD 6º, 7º, 9º | **Bloqueia** |
| A4 | Pedido de pessoa: "não tenho como te passar pra uma pessoa", sem nenhum canal alternativo | WhatsApp Policy | **Bloqueia** (uma linha) |
| A5 | "Seu pedido já saiu para entrega, então **não dá mais pra cancelar**" | CDC 49 | **Bloqueia** (uma linha) |
| A6 | Prova social ("mais de 500 clientes satisfeitas", "124 avaliações", imagem de avaliações com nome de outros produtos) sem dossiê de prova | CDC 37, 38, 69 | **Bloqueia** (é juntar prova, não é código) |
| A7 | Política de privacidade e aviso de tratamento: não encontrados | LGPD 9º, WhatsApp Policy | **Bloqueia** |
| A8 | "A **garantia** é de 7 dias": confunde arrependimento com garantia e sugere que defeito no 8º dia não tem saída | CDC 26, 49, 50 | Corrigir logo |
| A9 | Voz humana "Maria Luiza" e "Eu sempre recebo mensagens de clientes" + a Malu é IA + o site promete "Não é robô" | CDC 6º III, 37 §1º | Corrigir logo |
| A10 | Áudio 4 "consigo agendar pra **amanhã mesmo**" vai sem conferir a data | CDC 30, 35 | Corrigir logo |
| A11 | Cancelamento na entrega: "é só esperar ele chegar aí", sem confirmar o recebimento do pedido de desistência | CDC 49, Dec. 7.962 art. 5º | Corrigir logo |
| A12 | Preço de referência "DE R$ 216,50" | CDC 31, 37 §1º | Corrigir logo (é pergunta ao operador) |
| A13 | `scarcity.allowUnverified: true` libera estoque inventado quando ela adia a compra | CDC 37 | Corrigir logo (config) |
| A14 | CPF que ela manda por conta própria vai na URL do checkout | LGPD 6º III, WhatsApp Policy | Corrigir logo |
| A15 | Áudio 1 e 2: "sem precisar passar horas na academia", "gordurinha localizada", "seios mais levantados", "não machuca a pele" | Meta, CDC 37 | Corrigir logo |
| A16 | CNPJ só por e-mail | Dec. 7.962 art. 2º | Corrigir logo |
| A17 | "Ajuda na postura" | ANVISA (pergunta aberta) | Pergunta para o advogado |
| A18 | "FRETE GRÁTIS" na entrega | CDC 30, 37 | Aceitável, **se** o checkout da Logzz mostra R$ 0,00 de frete à cliente |
| A19 | Janela de 24 h, templates e opt-in de marketing | WhatsApp Policy, LGPD 8º | Aceitável |
| A20 | Retenção de 90 dias | §R6.3, §R8.2 | Aceitável (duas notas) |
| A21 | Transcrição de áudio e descrição de imagem da cliente | LGPD 5º II, 11, 33 | Aceitável, desde que entre no aviso (A7) |
| A22 | Divulgação de IA: o que ela faz hoje quando perguntada | CDC 6º III | Aceitável (ver A9) |

---

## 2. Achados em detalhe

### A1. "Emagrece enquanto você usa": **bloqueia**

**Onde:**

- `src/agent/prompt.ts:789-790`: *"Se ela perguntar se emagrece, a resposta é sim, amarrada ao uso: "Enquanto você usa,
  emagrece e pode reduzir até 3 números de calça""*.
- `src/agent/guardrails.ts:1328-1329` (briefing do `weight_loss_claim`), com a mesma frase, e `:1344-1355`: o gate deixa
  passar `emagrec` quando a frase tem "enquanto você usa" (`WORN`) e não tem peso, gordura nem tempo (`BODY`).
- Decisão: `03-decisoes-tomadas.md` §R28 (linhas 2244-2248), que supera a regra 1 de "As três coisas que você nunca
  inventa".
- Contra: `docs/agente-ia/01-conhecimento/01-base-de-conhecimento.md:49-52`, o FAQ do site da marca: *"O colete
  emagrece? Não. É melhor você saber agora do que descobrir depois de comprar."* E o próprio prompt, em `prompt.ts:850-851`,
  continua dizendo que ele *"não faz perder peso"*.

**Regra:** CDC art. 37 §1º: é enganosa a informação *"inteira ou parcialmente falsa […] capaz de induzir em erro o
consumidor a respeito da natureza, características, qualidade […] propriedades"*. Art. 38: *"O ônus da prova da veracidade
[…] cabe a quem as patrocina."* Art. 67 tipifica como crime *"fazer ou promover publicidade que sabe ou deveria saber ser
enganosa"*. Meta (de memória): os padrões de publicidade proíbem alegação de resultado irreal ou inesperado em produto de
perda de peso, e a política de comércio do WhatsApp [WA-pol] proíbe bens *"fraudulent, misleading, offensive, or
deceptive"*.

**Por que bloqueia:** "emagrecer" em PT-BR é perder peso ou medida do corpo. Amarrado a "enquanto você usa", o verbo
continua dizendo que o corpo muda. O que a peça faz é comprimir. Quem lê "emagrece" e volta a ter a mesma medida ao tirar
foi induzida em erro, o que é exatamente o art. 37 §1º. O agravante é documental: o FAQ publicado da marca responde "Não"
à mesma pergunta. Isso preenche o "sabe ou deveria saber" do art. 67 e entrega a prova à cliente que reclamar no Procon.
É também a frase que mais tende a voltar como devolução (o argumento original da regra 1, `prompt.ts:851-852`).

**Menor mudança que mantém a intenção** (a resposta continua "sim", amarrada ao uso e com os 3 números):

> "Na hora, sim: enquanto você usa, ele afina a cintura e pode reduzir até 3 números de calça."

- Em `prompt.ts:789-791` e no briefing de `guardrails.ts:1328-1329`, trocar "emagrece" por "ele afina a cintura".
- No gate, voltar a vetar `emagrec` sempre, ou seja, remover a exceção `WORN` de `guardrails.ts:1353-1356`. Isso
  **aperta** o gate, não afrouxa, então não entra em `tests/gate-loosen-accepted.txt`.
- A frase sugerida já passa o gate atual: "ele afina" tem o colete como sujeito, e o próprio gate diz em `:1339` que isso é
  o caimento.
- Rodar `tests/prompt.test.ts` e `pnpm dev:gates`, e registrar no grafo.

### A2. Áudio 1: "três tamanhos de cintura" e "febre nos Estados Unidos": **bloqueia**

**Onde:** `src/agent/funnel.ts:45` (`AUDIO_TRANSCRIPTS.audio1`): *"Essa cinta virou uma febre nos Estados Unidos porque ela
reduz até três tamanhos de cintura imediatamente."* Também *"vai deixar o seu corpo modelado e sem barriga em poucos
segundos"*. Vai para toda lead nova (`openingBubbles`, `:88`) e, por R28 (linha 2232), *"não passa pelos gates; a
responsabilidade é do operador"*.

**Regra:** CDC arts. 37 §1º e 38, já citados. Art. 69: *"Deixar de organizar dados fáticos, técnicos e científicos que dão
base à publicidade"* é crime por si só, mesmo que a alegação fosse verdadeira.

**Por que bloqueia:**

1. **"Três tamanhos de cintura" é desmentido pela tabela da própria marca.** A tabela em `prompt.ts:833` tem 8 cm de
   cintura por tamanho (P 60-68, M 68-76, G 76-84…). Três tamanhos são cerca de 24 cm de cintura "imediatamente". O que o
   prompt e R28 afirmam é outra coisa: "até 3 **números de calça**" (por exemplo, de 42 para 36). O áudio e o texto
   prometem resultados diferentes, e o do áudio não é plausível. Uma promessa quantificada exige prova (art. 38); sem
   prova arquivada, cai no art. 69.
2. **"Febre nos Estados Unidos"** é alegação de fato, não opinião. Não há nada no repositório que a sustente.
3. O áudio fica no histórico como fala da Malu (`funnel.ts:54`), e o modelo pode repetir os dois trechos **por escrito**.
   Nenhum gate pega "febre nos Estados Unidos", e "3 tamanhos" não é o que o `weight_loss_claim` procura.

**Menor mudança:**

- Cortar do arquivo `audio-1.ogg` a frase *"Essa cinta virou uma febre nos Estados Unidos porque ela reduz até três
  tamanhos de cintura imediatamente."*. É edição de áudio, sem regravar o resto, e o transcript em `funnel.ts:45` acompanha
  o corte. Se o operador quiser manter o número, regrave só essa frase como *"Ela afina a cintura na hora, até 3 números de
  calça."*
- Para os "3 números de calça" (que continuam no prompt): arquivar a prova. Medir a cintura com e sem o colete em pelo
  menos uma usuária por tamanho, com data e foto da fita métrica, e guardar fora do repositório. É o "dado fático" do art.
  69. Sem isso, a frase do prompt também fica sem lastro.
- "Sem barriga em poucos segundos": ver A15. É exagero de marketing, e o risco é menor que o dos dois trechos acima.

### A3. Modelo `-contributor` sobre cliente real: **bloqueia**

**Onde:** `CLAUDE.md:96`: *"Desde 2026-10-06, 19:30 UTC, a `turn` no ar roda `muse-spark-1.3-contributor`"*.
`HANDOFF.md:494`, `:551`, `:604`: *"do operador, nunca troque"*. Contra: `hermes/README.md:61`: *"a `-contributor` model,
which trains on the data"*. `HANDOFF.md:1227`: *"O troca `CONVERSATION_MODEL` para o modelo sem `-contributor`
(LGPD)"*. `HANDOFF.md:1468`: *"Trocar `CONVERSATION_MODEL` para o modelo sem `-contributor` antes do primeiro lead
real"*. O primeiro teste com anúncio (R28, 16 a 19/10) já teve 33 conversas reais.

**Regra:** LGPD art. 6º I (finalidade: *"propósitos legítimos, específicos, explícitos e informados ao titular, sem
possibilidade de tratamento posterior de forma incompatível"*), III (necessidade), art. 7º (hipótese legal; treinar o
modelo de um terceiro não é "execução de contrato" com a cliente) e art. 9º V (informação sobre o uso compartilhado).

**Por que bloqueia:** o texto da cliente (nome, CEP, o que ela conta do corpo e, às vezes, o CPF que ela digita) vira
material de treino de um terceiro. Não há base legal para isso, não há aviso, e o próprio repositório já tinha registrado
que isso era o problema de LGPD a resolver antes do primeiro lead real. Não verifiquei o valor do segredo em produção; o
que está acima é o que a documentação afirma.

**Menor mudança:** apagar o segredo `CONVERSATION_MODEL` (e o `CONVERSATION_MODEL_PRICE`), e a `turn` volta ao padrão
`muse-spark-1.3` (`supabase/functions/turn/index.ts:287-291`). O custo sobe (L0.5 mediu p95 de R$ 0,546). Se o operador
quiser manter o `-contributor`, isso precisa de consentimento específico e destacado (art. 8º §1º e §4º) e de menção na
política de privacidade, o que na prática é inviável no meio de uma venda. **Pergunta para o advogado**, se ele quiser
seguir por esse caminho.

### A4. Pedido de pessoa sem canal de escalonamento: **bloqueia**

**Onde:** `src/agent/retry.ts:148-149` (`HUMAN_HANDOFF_REPLY`): *"Entendo 💛 Por aqui o atendimento é todo comigo, a
assistente virtual da Encorpa, e não tenho como te passar pra uma pessoa. Me conta o que você precisa que eu resolvo
agora."* E `prompt.ts:626-627`: *"nunca ofereça chamar alguém"*.

**Regra:** [WA-pol], lida: *"You may use automation when responding during the 24-hour window, but must also have
available prompt, clear, and direct escalation paths. These escalation paths include: In-Chat Human Agent transfer, Phone
number, Email, Web support […]"*. E: *"Maintain a WhatsApp Business profile with customer support contact information"*.
Decreto 7.962/2013 art. 4º V (de memória): serviço *"adequado e eficaz de atendimento em meio eletrônico"*.

**Por que bloqueia:** a frase fecha a única porta que a política exige que fique aberta. R22.1 (ninguém responde pelo
número) não conflita com a política: ela aceita **e-mail ou telefone** como caminho, e o config já tem `support.email`.
É uma linha, e a sanção possível é na conta do WhatsApp.

**Menor mudança** (continua sem prometer pessoa no chat):

> "Entendo 💛 Por aqui o atendimento é comigo, a assistente virtual da Encorpa. Me conta o que você precisa que eu
> resolvo agora. Se preferir, você também pode escrever pra contato@encorpa-fashion.com.br."

O e-mail vem de `CONFIG.support.email`, como no resto do código. Conferir também se o perfil comercial do número no
WhatsApp mostra o e-mail ou o site.

### A5. "Não dá mais pra cancelar": **bloqueia** (uma linha)

**Onde:** `src/agent/retry.ts:296-298` (`shippedCancelReply`, pedido antecipado já despachado): *"Seu pedido já saiu para
entrega 🚚, então não dá mais pra cancelar. Quando ele chegar aí, é só me chamar aqui pra pedir a devolução 💛"*.

**Regra:** CDC art. 49: *"O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura **ou** do
ato de recebimento do produto […]"*. Parágrafo único: valores pagos *"serão devolvidos, de imediato, monetariamente
atualizados"*.

**Por que bloqueia:** o direito de desistir existe desde a compra, não só depois do recebimento. "Não dá mais pra
cancelar" nega esse direito numa frase fixa. O resultado prático (devolver depois de receber) é quase o mesmo; o problema
é a palavra. Para a cliente ou o Procon, "não dá" é recusa.

**Menor mudança:**

> "Seu pedido já saiu para entrega 🚚, então ele vai chegar aí. Você pode desistir mesmo assim: é só recusar na entrega,
> ou, depois de receber, pedir a devolução em até 7 dias, e o valor volta todo pra você 💛"

O número de dias vem de `warrantyDays`. Conferir com a Coinzz e a transportadora se a recusa na porta gera estorno; se
não gerar, tire "é só recusar na entrega, ou,".

### A6. Prova social sem dossiê: **bloqueia** (juntar prova, não código)

**Onde:**

- `config/business.example.json:251-253`: `"satisfiedCustomers": 500, "reviews": 124`.
- `funnel.ts:77-78`, que monta *"Já são mais de 500 clientes satisfeitas e 124 avaliações positivas ❤️"* na abertura.
- `prompt.ts:493-494`, que usa os números na objeção de preço.
- `funnel.ts:58`, `"[imagem da Malu: avaliações reais de clientes, nota 5]"`.
- `config/business.example.json:231-237` (`testimonials`).
- R28, linhas 2233 e 2242.

**O que vi na imagem `avaliacoes.png`:** "Baseado em 124 avaliações", 119 de 5 estrelas e 5 de 4 estrelas. As três
avaliações visíveis são de produtos com **outros nomes**: "Cinta de Compressão", "Cinta Corpete Corselete" e "Cinta
Corselette". Os nomes completos das clientes aparecem (Daniela Souza, Maria Eduarda Gonçalves, Bruna Trevisol). O layout
é de aplicativo de avaliações de loja ("Escreva uma avaliação").

**Regra:** CDC art. 37 §1º, art. 38 (ônus da prova de quem anuncia) e art. 69 (não organizar o dado que dá base à
publicidade). CONAR (de memória): o Anexo Q trata de testemunhais e exige que sejam reais e comprováveis. O gate
`invented_testimonial` (`guardrails.ts:2128`) impede a Malu de inventar outros números, mas **não prova os que estão no
config**: ele só confere que o número dito é o configurado.

**Por que bloqueia:** o operador declarou que são reais (R28), e eu não tenho como contestar isso. Mas o repositório não
guarda nada que os comprove, e há dois sinais de alerta. Primeiro, a imagem mostra avaliações de produtos com outro nome;
avaliações importadas de outra loja ou de fornecedor são publicidade enganosa mesmo sendo de "clientes reais" de alguém.
Segundo, "500 clientes **satisfeitas**" afirma satisfação, não só compra.

**Menor mudança:**

1. Arquivar, fora do repositório: a exportação de pedidos entregues que sustenta "mais de 500" (com data), e a origem das
   124 avaliações (painel da loja mostrando que são deste produto, vendido por esta loja).
2. Se as avaliações forem de outro produto ou importadas, tirar a imagem e o `reviews` do config. Basta apagar a chave:
   ausente, nada é citado (`funnel.ts:72-80`).
3. Se não houver como provar a satisfação, trocar a palavra: a linha passa a "mais de 500 clientes", e o gate continua
   exigindo o número configurado.
4. LGPD: os nomes completos das clientes na imagem são dado pessoal delas, reenviado a terceiros num canal novo. A cliente
   publicou a avaliação no site, não no WhatsApp da loja. Menor mudança: abreviar o sobrenome na imagem ("Daniela S.").

### A7. Política de privacidade e aviso: **bloqueia**

**Onde:** nenhuma ocorrência de "política de privacidade", "aviso de privacidade" ou "encarregado" no repositório. O site é
SPA, e as rotas óbvias deram 404 (seção 0).

**Regra:** [WA-pol], lida: *"You are responsible for and must secure all necessary notices, permissions, and consents to
collect, use, and share people's content and information, including maintaining a published privacy policy"*. LGPD art.
9º: acesso *"de forma clara, adequada e ostensiva"* à finalidade, à forma e duração, à identificação e ao contato do
controlador, ao uso compartilhado e aos direitos do titular.

**O que o aviso precisa dizer**, a partir do código:

- **Dados:** nome, telefone, CEP, endereço, e-mail e CPF (estes três, no checkout); texto e áudio das mensagens (o áudio é
  transcrito e não é guardado; `whatsapp/index.ts:120-194`); imagens enviadas (descritas por modelo, `:212`).
- **Finalidade:** atender, vender e entregar. Mensagem de marketing só com consentimento (`0019_marketing_opt_in.sql`).
- **Compartilhamento:** Meta (WhatsApp, modelo de linguagem, transcrição e visão), Logzz (entrega), Coinzz (pagamento
  antecipado), ViaCEP e BrasilAPI (só o CEP), Supabase (banco) e o e-mail de aviso ao operador.
- **Transferência internacional:** LGPD art. 33 (de memória). A Meta processa fora do Brasil.
- **Retenção:** 90 dias (§R6.3, §R8.2).
- **Canal do titular:** art. 18. O `contato@encorpa-fashion.com.br` serve.

**Menor mudança:** publicar a página no site e pôr o link no perfil comercial do WhatsApp. Na conversa, a Malu não precisa
recitar nada; se perguntarem, ela cita o link. **Pergunta para o advogado:** se a operação precisa nomear um encarregado
(art. 41) ou se se enquadra na dispensa de agente de pequeno porte (Resolução CD/ANPD nº 2/2022, de memória).

### A8. "A garantia é de 7 dias": **corrigir logo**

**Onde:**

- `prompt.ts:817` e `:825`: *"A garantia é de ${warrantyDays} dias após o recebimento."*
- `guardrails.ts:2497-2498` (briefing do `warranty_promise`): *"A garantia é de 7 dias após o recebimento para trocar ou
  devolver"*.
- O gate veta qualquer outro número de dias perto de "garantia" (`:2551-2560`).
- `config/business.example.json:18`: `"warrantyDays": 7`.

**Regra:** os 7 dias são o **direito de arrependimento** (CDC art. 49), não garantia. A garantia legal por vício aparente
é de 30 dias para produto não durável e de 90 para durável (art. 26, I e II), contados da entrega (§1º). Garantia
contratual é *"complementar à legal"* (art. 50).

**Por que importa:** a cliente que acha costura aberta no 10º dia ouve que "a garantia é de 7 dias", o que é falso e soa
como recusa. E o gate impede a Malu de dizer o prazo certo. **Pergunta para o advogado:** vestuário costuma ser tratado
como bem durável (90 dias), mas há decisão em contrário. Por isso a sugestão abaixo não fixa número.

**Menor mudança**, que mantém os 7 dias como argumento de venda:

> "Você tem 7 dias depois de receber pra desistir e devolver, ou trocar o tamanho. E se vier com defeito, vale também a
> garantia da lei, que vai além desses 7 dias."

Aplicar em `prompt.ts:817`, `:825` e no briefing do gate. Pelo regex atual, a frase passa: o único número é o
configurado. Rodar `tests/prompt.test.ts`.

### A9. Voz humana "Maria Luiza", Malu IA e "Não é robô": **corrigir logo**

**Onde:**

- `funnel.ts:45`, áudio 1 gravado com voz humana (R28, linha 2230): *"Meu nome é Maria Luiza, mas pode me chamar de
  Malu."*
- `funnel.ts:47`, áudio 2: *"Eu sempre recebo mensagens de clientes super satisfeitas."*
- `funnel.ts:87`, texto: *"Meu nome é ${agentName}…"*
- `prompt.ts:619-622`: *"Nunca diz por conta própria que é virtual, IA, robô, bot ou assistente virtual"*.
- `01-base-de-conhecimento.md:22`, promessa do site: *"WhatsApp com gente de verdade. Não é robô."* Já está registrada
  como decisão em aberto, na linha 26.

**Regra:** não há, que eu saiba, lei brasileira em vigor que obrigue anunciar o uso de IA. O PL 2.338/2023 passou no
Senado em dezembro de 2024; **não sei o estado dele hoje** (de memória, não verificado). O que vale é o CDC: art. 6º III
(informação adequada e clara) e art. 37 §1º (enganosa *"mesmo por omissão"*). Não informar que é IA não é ilícito. Criar
a impressão positiva de que é uma pessoa pode ser, quando isso pesa na decisão de compra. E é o caso: o argumento de
confiança "gente de verdade" é publicado como contra-objeção a golpe.

**Por que não bloqueia:** quando perguntada, a Malu confirma que é assistente virtual (`prompt.ts:620-622`;
`HUMAN_HANDOFF_REPLY` diz "assistente virtual"; o gate `humanity_claim` veta negar que é robô). O risco está na soma: uma
voz humana com nome próprio, falando em primeira pessoa de mensagens que "recebe", mais um site que diz "Não é robô".

**Menor mudança**, sem mexer na decisão de não anunciar a IA:

1. Tirar do site o "Não é robô". É a única afirmação ativamente falsa da lista.
2. Cortar do `audio-2.ogg` a frase final *"Eu sempre recebo mensagens de clientes super satisfeitas."*. Se a voz não é de
   alguém que de fato recebe essas mensagens, ela é falsa, e a prova social já vai em texto.
3. Confirmar que quem gravou os áudios autorizou por escrito o uso da voz (direito de voz e imagem, Código Civil art. 20,
   de memória).
4. **Opcional**, e é a mudança que de fato fecha o risco: na abertura, *"Meu nome é Malu, a assistente virtual da Encorpa
   🥰"*. Reverteria a decisão de `prompt.ts:619-620`, então é decisão do operador.

### A10. Áudio 4, "amanhã mesmo", sem conferir a data: **corrigir logo**

**Onde:** `funnel.ts:49`: *"Eu consigo agendar a entrega pra amanhã mesmo"*. Em `funnel.ts:193`, ele vai sempre que o
CEP tem entrega (`region.cod`), por decisão do R28 (linhas 2240-2241: *"sem condição de data; a primeira data é o dia
seguinte em ~90% dos casos"*). O texto fixo logo acima (`funnel.ts:156`) diz a data **real**.

**Regra:** CDC art. 30: a informação *"suficientemente precisa […] obriga o fornecedor"*. Art. 35: a cliente pode exigir
o cumprimento. É a razão de ser do `delivery_promise`, e o áudio passa por fora dele.

**Por que importa:** em cerca de 1 de cada 10 CEPs, a mesma oferta diz "amanhã" no áudio e "quinta (23/10)" no texto. É
promessa vinculante descumprida e contradição visível. O risco jurídico é pequeno (ela vê a data no checkout); o de
confiança, não.

**Menor mudança:** mandar o áudio 4 só quando a primeira data é amanhã. Em `funnel.ts:193`, a condição vira
`region.cod && firstDayLine(region.dates[0], now)?.startsWith("amanhã")`. Nos outros 10%, a caixa de texto já diz tudo.
Isso altera o R28, então é decisão do operador.

### A11. Cancelamento na entrega sem confirmação: **corrigir logo**

**Onde:** `retry.ts:304-305` (`COD_CANCEL_REPLY`): *"Como o seu pedido é pago na entrega, é só esperar ele chegar aí. Se
não quiser receber, é só dizer isso pro entregador na hora 💛"*.

**Regra:** CDC art. 49. Decreto 7.962/2013 art. 5º (de memória): o arrependimento pode ser exercido *"pela mesma
ferramenta utilizada para a contratação"* (§1º), e o fornecedor deve *"enviar ao consumidor confirmação imediata do
recebimento da manifestação de arrependimento"* (§3º).

**Por que importa:** ela desistiu pelo WhatsApp, que foi onde comprou. A frase transfere o ônus para ela (ficar em casa
para recusar) e não confirma que recebeu a desistência. Não há cobrança indevida (nada foi pago), então o risco é de
reclamação, não de devolução em dobro (art. 42).

**Menor mudança:**

> "Recebi o seu pedido de cancelamento 💛 Como é pago na entrega, você não paga nada. Se o entregador aparecer mesmo
> assim, é só recusar na porta."

O e-mail ao operador que já sai (`turn/index.ts:3551`) passa a pedir que ele cancele na Logzz. Evite "anotei", que o
`noted_claim` veta.

O mesmo vale para `PREPAID_CANCEL_REPLY` (`retry.ts:311`): *"irei dar início no cancelamento"* está certo, mas o
estorno precisa ser *"de imediato"* (art. 49, parágrafo único). Hoje depende de o operador ler o e-mail e cancelar na
Coinzz à mão; não há prazo no código. Fica como nota: definir um prazo operacional, por exemplo no mesmo dia.

### A12. "DE R$ 216,50": **corrigir logo** (pergunta ao operador)

**Onde:** `funnel.ts:147` (`OFFER_HEADLINE`): *"⭐ DE R$ 216,50 POR R$ 129,90 ⭐"*. A mesma âncora está na imagem
`preco.png` e vem de `config/business.example.json:10` (`anchorBrl`). `HANDOFF.md:2822` chama de *"os R$ 216,50
publicados"*.

**Regra:** CDC art. 31 (informação correta sobre preço) e art. 37 §1º ("preço" está na lista expressa). "De/por" com um
"de" que nunca foi praticado é a forma clássica de oferta enganosa autuada pelo Procon (de memória).

**Pergunta ao operador:** o colete foi vendido de fato a R$ 216,50, por um período razoável e com registro? Se sim,
arquive o registro (A6). Se não, a menor mudança é tirar a palavra "DE" e o riscado: **"R$ 129,90 com frete grátis na
entrega"**. Ou trocar a âncora por algo verdadeiro, como "10% off no Pix" no antecipado. Hoje não decido isso; só aponto
que sem registro a linha não se sustenta.

### A13. Escassez inventada liberada pelo config: **corrigir logo** (config)

**Onde:** `config/business.example.json:226-230`: `"scarcity": { "unitsLeft": 12, "offerEndsAt": null,
"allowUnverified": true }`. Em `guardrails.ts:2416`, quando ela adia a compra (`ctx.postponing === true`), o gate pula
o bloco de veto, e em `:2448` vem `if (declared?.allowUnverified) return null;`: **qualquer** estoque ou prazo passa.

**Regra:** CDC art. 37 §1º. O próprio gate diz em `:2398-2399`: *"an urgency that does not exist is misleading
advertising"*.

**Por que importa:** desde R20.1 o prompt manda não citar estoque (`prompt.ts:541`), mas a rede de segurança está aberta
justamente no turno em que o modelo mais tende a inventar urgência, o de "vou pensar". Não confirmei o valor no segredo
de produção.

**Menor mudança:** no segredo `BUSINESS_CONFIG`, `"allowUnverified": false`, ou apagar o bloco `scarcity` inteiro (nada o
usa desde R20.1). Não há código a mudar.

### A14. CPF na URL do checkout: **corrigir logo**

**Onde:** `src/agent/coinzz.ts:272-276`: se ela mandou o CPF por conta própria (`prompt.ts:866-867` manda agradecer), ele
vai na query string do link (`?cpf=…` ou `?document=…`), que é enviado de volta pelo WhatsApp.

**Regra:** [WA-pol], lida: *"Don't share or ask people to share […] personal ID card numbers, or other sensitive
identifiers."* LGPD art. 6º III (necessidade) e VII (segurança). Uma URL com CPF fica em log de servidor, histórico do
navegador e encaminhamento de conversa.

**Menor mudança:** não pôr o CPF na URL. Basta remover o bloco de `coinzz.ts:272-276` e espelhar. Ela digita o CPF no
checkout, como já faz quem não o mandou (R28: *"e-mail, CPF e endereço a cliente preenche no checkout"*).

### A15. Os outros trechos dos áudios 1 e 2: **corrigir logo**

**Onde:**

- `funnel.ts:45`: *"Sabe aquela gordurinha localizada que fica sempre marcando na roupa?"*, *"sem nenhum esforço"*, *"sem
  precisar passar horas na academia"*.
- `funnel.ts:47`: *"seu corpo fica modelado com os seios mais levantados e a barriga retinha"*, *"a cinta não enrola, não
  dobra e nem machuca a pele"*.

**Regra:** Meta, padrões de publicidade (de memória): "Personal Health and Appearance" proíbe imagem de antes e depois,
resultado inesperado ou improvável, e conteúdo que gere autopercepção negativa para vender produto de dieta, peso ou
saúde. "Personal Attributes" proíbe afirmar ou insinuar atributo físico da pessoa ("sua gordurinha"). **Essas regras
valem para o anúncio, não para a mensagem 1:1.** A conversa é regida pela [WA-pol] (proíbe "misleading" e "exert undue
pressure on targeted groups"). Mas se esses trechos forem reaproveitados no criativo do anúncio, ele é reprovado e a conta
de anúncio é marcada. CDC art. 37 §1º para "seios mais levantados" e "não machuca": são afirmações de produto que não
estão nos fatos confirmados (`prompt.ts:269-277`).

**Menor mudança**, por corte de áudio e na ordem de risco:

1. "sem precisar passar horas na academia": insinua que substitui exercício, o que é alegação de saúde.
2. "com os seios mais levantados": o colete não tem bojo (imagem `preco.png`). Confirme que a alça de fato sustenta, ou
   corte.
3. "nem machuca a pele": absoluto. Basta "não enrola e não dobra".
4. "gordurinha localizada": aceitável numa conversa que ela iniciou; **nunca** no criativo do anúncio.

Também não ponha no anúncio nenhuma imagem de antes e depois nem a foto de `preco.png` como criativo. É foco em parte do
corpo, que entra na regra de conteúdo adulto dos anúncios (de memória). Os criativos estão em outro repositório e não os
revisei.

### A16. CNPJ só por e-mail: **corrigir logo**

**Onde:** `prompt.ts:518-519`: *"CNPJ e dados técnicos da empresa. Peça pra ela mandar um e-mail"*. E
`01-base-de-conhecimento.md:78`: *"Sem […] CNPJ para citar"*.

**Regra:** Decreto 7.962/2013 art. 2º (de memória): o meio eletrônico usado para a oferta deve exibir, em local de
destaque, nome empresarial e CNPJ, endereço físico e eletrônico.

**Menor mudança:** a razão social e o CNPJ entram no config (campo opcional) e a Malu diz quando perguntada; também vão no
perfil comercial do WhatsApp e no rodapé do site. A operação já tem CNPJ (é ele que habilita a Cloud API, `CLAUDE.md` §Stack), então não há o que esconder, e "mande um e-mail"
para o dado mais básico de confiança soa como golpe.

### A17. "Ajuda na postura": **pergunta para o advogado**

**Onde:** `prompt.ts:792-794`: *"Além de modelar, ele ajuda na postura enquanto está vestido: dá apoio e segura a
postura"*. O `health_claim` (`guardrails.ts:2363-2391`) veta "corrige", "trata", "pós-operatório" e "dor", mas deixa
"ajuda na postura" passar (R16.6).

**Regra (de memória, não verificada):** a ANVISA trata como dispositivo médico o produto com finalidade terapêutica ou de
correção (RDC 751/2022 para classificação; corretores posturais e cintas pós-cirúrgicas costumam ser notificados). Peça de
vestuário modeladora, **vendida como roupa e sem alegação terapêutica**, em regra fica fora da ANVISA. O que puxa um
produto para dentro é a alegação, não a peça.

**Avaliação:** "modela" e "afina a cintura" são alegação estética de roupa, sem questão sanitária, e "emagrece" é problema
de CDC (A1), não de ANVISA. "Ajuda na postura" fica na zona cinza. A linha atual (sem "corrige", "trata" ou "dor") é a
mais segura **dentro** da decisão R16.6. **Pergunta para o advogado ou consultor regulatório:** se "ajuda na postura / segura
a postura" basta para caracterizar alegação de finalidade de saúde. Até a resposta, a frase mais segura é *"além de
modelar, ele dá firmeza nas costas enquanto você usa"*, que descreve a peça, não um efeito no corpo.

### A18. "FRETE GRÁTIS" na entrega: **aceitável, com uma conferência**

**Onde:** `funnel.ts:153-156`, `:235`, `:280`. O áudio 4 (`:49`) diz *"com frete grátis"*. Config `codFreeShipping: true`
(`config/business.example.json:20`; R15.3: *"a oferta da Logzz cobra R$ 0,00 da cliente"*).

**A conferência:** R28 (linha 2237) diz *"o checkout de 1 peça mostra R$ 26,90"*. Pelo contexto (modelo de margem), é a
taxa cobrada **do lojista**. Confirme abrindo o checkout de 1, 2 e 3 peças como cliente: se aparecer qualquer valor de
frete para ela, "FRETE GRÁTIS" vira oferta descumprida (art. 30) em toda conversa. Se for R$ 0,00, está correto.

### A19. Janela de 24 h, templates e opt-in: **aceitável**

**Onde:** `followups.ts:1365-1367` (`silence_2` e `silence_3`, templates de MARKETING, saem só com
`marketingOptIn === true`), `config/business.example.json:289` (`askMarketingOptIn: false`, ou seja, ninguém recebe
marketing fora da janela) e `0019_marketing_opt_in.sql` (prova do consentimento por botão, não por texto, art. 8º §2º).

**Regra:** [WA-pol], lida: *"Outside the 24-hour customer service window, you may only send messages via approved Message
Templates"* e *"you have received opt-in permission"*. A página de preço confirma que a janela gratuita de 72 h do CTWA é
de **preço**, não de permissão.

**Avaliação:** o desenho está certo. Uma nota: o comentário em `followups.ts:167-168` (*"MARKETING template included"*)
fala de custo, e o código bloqueia marketing sem opt-in; ninguém deve ler o comentário como licença. A saída por texto
("pare", "sair", `skipsOpening`, `funnel.ts:126-129`) e por botão também está coberta.

### A20. Retenção de 90 dias: **aceitável**, com duas notas

`purge_expired()` (`0020_hermes_retention.sql:26-45`) apaga `leads`, `conversations`, `messages` e `orders` vencidos, roda
no `pg_cron` do banco (`0002`), e `followups`, `llm_calls`, `gate_traces` e `turn_outcomes` saem por cascata. As
citações do Hermes são removidas em 90 dias. Coberto, conforme §R6.3 e §R8.2.

- **Nota 1:** `jobs` só é apagado com status `done` ou `failed` (`0020:38`). Um job preso em `pending` ou `claimed`, com
  telefone no `payload`, nunca expira. É raro; acrescentar `or created_at < now() - interval '90 days'` fecha a brecha.
- **Nota 2:** os dados fora do banco não estão no cron e precisam constar no aviso (A7): os e-mails de aviso ao operador
  (com trechos da conversa) e os pedidos na Logzz e na Coinzz. A retenção fiscal do pedido (nota fiscal) é obrigação legal
  (art. 7º II) e justifica guardar mais que 90 dias **lá**, não aqui.

### A21. Transcrição de áudio e descrição de imagem: **aceitável**, se entrarem no aviso

`whatsapp/index.ts:120-194`: o áudio dela vai para `muse-voice-transcribe-1.0` (Meta), e só o texto fica, em `messages`,
com retenção de 90 dias. O áudio não é guardado, nada é logado e não há identificação por voz. Portanto **não** é dado
biométrico (LGPD art. 5º II só fala em biométrico *"quando vinculado a uma pessoa natural"* para identificá-la). A
imagem dela vai para o modelo de visão (`:212`).

**Risco que sobra:** o conteúdo. Ela pode contar no áudio, ou mostrar na foto, que está grávida, que operou ou que tem
dor. Isso é dado de saúde, sensível (art. 5º II, art. 11), e vai para um terceiro no exterior (art. 33). A menor medida é
o aviso (A7) e o modelo sem treino (A3). Os gates já impedem a Malu de **usar** esse dado para indicar a peça
(`health_claim`, e `01-base-de-conhecimento.md:79`: *"Pós-parto, gestante: não adicionar"*).

### A22. Como ela se comporta hoje quando perguntam se é IA: **aceitável**

- Perguntada "você é robô / é uma pessoa?", diz que é a assistente virtual da marca (`prompt.ts:619-621`).
- Perguntada de novo, ou "é IA?", confirma "Sou, sim" (`:622`).
- Pedido de pessoa: frase fixa que diz "assistente virtual" (`retry.ts:149`).
- O gate `humanity_claim` (`guardrails.ts:2221-2230`) veta afirmar ser pessoa e veta prometer que alguém vai chamar.

Não há mentira ativa na conversa escrita. O risco de identidade está nos áudios e no site (A9), não no texto da Malu.

Fora do Brasil (de memória): os termos da plataforma da Meta passaram a vetar, a partir de 15/01/2026, provedores de IA de
**uso geral** no WhatsApp Business. Assistente de atendimento e venda do próprio negócio é o caso permitido, e a Malu se
encaixa. Não consegui ler os termos para confirmar.

---

## 3. Decisões do operador que carregam risco

São decisões dele e continuam valendo, exceto onde marquei "bloqueia". O risco de cada uma, sem rodeio:

| Decisão | Risco | Minha posição |
|---|---|---|
| **R28: "emagrece enquanto você usa"** | Afirma mudança de corpo que o FAQ da própria marca nega por escrito. É o art. 37 com prova pronta contra a loja. | **Bloqueia.** "Ele afina a cintura na hora" mantém o "sim" e o número. |
| **R28: áudios "como estão gravados", fora dos gates** | Dois trechos (3 tamanhos e febre nos EUA) não têm lastro, e um é desmentido pela tabela da marca. A responsabilidade "do operador" não muda de quem é a responsabilidade legal: é da loja (art. 38). | **Bloqueia** só a frase do áudio 1; o resto é cortar quando der. |
| **R28: áudio 4 sem condição de data** | Promessa de "amanhã" errada em ~10% dos CEPs. | Corrigir logo; é uma condição. |
| **R28: prova social 500 + 124** | Sem dossiê, e a imagem mostra outros nomes de produto. | **Bloqueia** até arquivar a prova; se não houver, apagar a chave. |
| **R22.1: ninguém atende** | Legítimo, mas a política do WhatsApp exige um caminho de escalonamento (e-mail serve). | **Bloqueia** só a frase sem canal. |
| **Modelo `-contributor` "nunca troque"** | Treino de terceiro sobre dado de cliente, sem base legal nem aviso. O próprio HANDOFF tinha marcado isso como pendência de LGPD. | **Bloqueia.** |
| **R16.6: "ajuda na postura"** | Zona cinza com a ANVISA. | Pergunta para o advogado; a frase atual é a mais segura dentro da decisão. |
| **Não anunciar a IA (`prompt.ts:619`)** | Sozinho é aceitável; somado a voz humana com nome e a "Não é robô" no site, vira omissão relevante. | Corrigir o site e o fim do áudio 2; o resto é escolha dele. |

---

## 4. O que decidir antes de gastar verba de anúncio, em ordem

1. **Trocar o modelo da conversa** para o padrão sem `-contributor` (A3). Um segredo apagado.
2. **"Emagrece" vira "afina a cintura na hora"** no prompt e no gate, e cortar do áudio 1 a frase "febre nos Estados Unidos
   … três tamanhos de cintura" (A1, A2).
3. **Arquivar a prova** dos 500 clientes, das 124 avaliações (deste produto, desta loja) e da medição dos "3 números de
   calça". Sem prova, apagar a chave correspondente do config (A2, A6).
4. **Publicar a política de privacidade** e pôr o link e o e-mail no perfil do WhatsApp (A7, A4).
5. **Duas frases fixas:** o e-mail de contato em `HUMAN_HANDOFF_REPLY` (A4), e "Você pode desistir mesmo assim" no lugar de
   "não dá mais pra cancelar" (A5).
6. **Confirmar o "DE R$ 216,50"** (A12) e o frete R$ 0,00 no checkout da Logzz (A18).
7. Na sequência, sem impedir o anúncio: "garantia" vira "7 dias pra desistir + garantia da lei" (A8); `allowUnverified:
   false` (A13); CPF fora da URL (A14); áudio 4 só com "amanhã" verdadeiro (A10); confirmação de desistência na entrega
   (A11); tirar "Não é robô" do site e o fim do áudio 2 (A9); CNPJ no config (A16).

**Perguntas para o advogado**, que este parecer não responde:

- (a) Prazo de garantia legal de vestuário: art. 26 I ou II (A8).
- (b) Se "ajuda na postura" caracteriza alegação de saúde (A17).
- (c) Se a operação precisa de encarregado (A7).
- (d) Base legal, se o operador quiser manter o `-contributor` (A3).

Toda mudança de prompt ou gate acima passa por `tests/prompt.test.ts` e `pnpm dev:gates`, e entra no grafo de decisões
antes de ser considerada pronta.
