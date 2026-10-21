# Pesquisa externa: o que a literatura de vendas e conversão diz sobre a Malu

> **Data:** 2026-10-21. **Status:** pesquisa, nada virou código. **Pedido do operador:** descobrir o que fazer no agente para
> contornar objeções e vender mais, de forma humanizada e persuasiva, incluindo ofertas "black" com apelos fortes.
> **Método:** cerca de 20 buscas na web + leitura direta de duas páginas primárias (Gong Labs, Baymard). Cruzado com o
> [script v3](../06-script/07-script-v3-funil-validado.md) e a [base de conhecimento](../01-conhecimento/01-base-de-conhecimento.md).

## 0. Leia isto antes dos números

- **Quase todo número de "conversão de WhatsApp" (45–81%) vem de blog de fornecedor**, sem metodologia. A faixa
  conservadora (MessageMind: 5–15% de conversa para pedido) é a única plausível. Nenhum desses números serve de meta.
- **Não achei estudo independente** sobre: áudio vs. texto em venda por WhatsApp, atraso de digitação "humano", recusa de
  pagamento na entrega (COD) no Brasil, nem desempenho de criativos de cinta modeladora. Onde falta, a recomendação abaixo
  é **hipótese para teste A/B nos nossos dados**, não fato.
- O que tem base sólida são os **princípios** (Cialdini, Voss, Fogg, Baymard, Gong Labs, Huang et al.). Eles apontam na
  mesma direção, e o v3 já aplica parte deles.

## 1. O que a evidência sustenta (e onde o v3 já está certo)

| Achado | Fonte | Situação no v3 |
|---|---|---|
| **Taxas extras e prazo são o motivo nº 1 de abandono**: 39% por custo adicional, 21% por entrega lenta, 19% por cadastro forçado, 18% por checkout difícil. Recomendação: mostrar custo total e **data de entrega cedo** | [Baymard](https://baymard.com/learn/reduce-cart-abandonment) | Entrega: certo (frete grátis + data antes do link). **Antecipado: "o frete aparece no checkout" é exatamente a surpresa que a Baymard mede.** Lacuna 1 |
| **Reduzir esforço vale mais que aumentar motivação** (Fogg: motivação × facilidade × gatilho) | [Fogg](https://behaviormodel.org/) | Certo: só nome + CEP, CPF fora |
| **Quem faz mais perguntas de acompanhamento é mais bem visto** (Harvard, 2017; efeito modesto, d≈0,35) | [Huang et al.](https://psychologicalscience.org/news/minds-business/asking-questions-increases-likability.html) | O v3 abre com 11 mensagens de valor e só então 1 pergunta. Falta uma pergunta **sobre ela** (ocasião, o que incomoda) antes do pitch. Lacuna 2 |
| **Os melhores vendedores pausam mais e perguntam antes de responder uma objeção; os medianos despejam um monólogo** (67 mil chamadas) | [Gong Labs](https://www.gong.io/resources/labs/handling-sales-objections/) | A Malu responde a objeção de imediato. Para objeção vaga ("vou pensar", "tá caro"), perguntar antes. Lacuna 3 |
| **Rotular a emoção antes de responder** ("parece que a sua preocupação é…") e usar pergunta aberta "como/o que" | [Voss, via resumos](https://justcall.io/blog/best-sales-negotiation-chris-voss.html) | Parcial, depende do modelo; não é ensinado no prompt |
| **Reverter o risco é o que faz a oferta parecer "boa demais para recusar"**: garantia específica, bônus que removem um obstáculo | [Hormozi, via resumos](https://www.supersummary.com/100m-offers/key-takeaways/) | Já temos o melhor reversor possível: paga na entrega + 7 dias. Está dito, mas **não é a abertura da resposta à desconfiança** |
| **A velocidade de resposta importa** (estudo XANT/MIT: contato em 5 min ≈ 21× mais qualificação que em 30 min, via resumo secundário) | [Aurora Inbox](https://www.aurorainbox.com/en/2026/05/28/whatsapp-conversion-response-time-2026/) | Agente responde em segundos; o atraso é de propósito. Não é gargalo |
| **Régua de recuperação**: 1º toque cedo e sem desconto (≈1 h), 2º em 12–24 h, 3º em 48–72 h, incentivo só no 2º ou 3º. Vendor afirma que 65% das recuperações vêm do 1º toque | [eGrow](https://www.egrow.com/en/blog/woocommerce-abandoned-cart-whatsapp-2026) | Régua enxuta já existe (um toque por momento). Conferir se há toque ≈1 h **após o link** |
| **Otimizar o anúncio para compra, não para conversa** deu mais vendas (caso Braip, Meta) | [AsisteClick](https://asisteclick.com/en/blog/click-to-whatsapp-ads-ctwa-conversion-2026/) | É do sócio (Ads). Ver §5 |

## 2. Ofertas "black": o que achei e o que descartei

**O que achei.** As páginas de "spy tools" (Adligator, Motion, Brandsearch) mostram só o formato dos anúncios, sem
dado de desempenho. Nenhuma fonte comparou criativos de cinta modeladora com resultado. O que se repete nos anúncios de
pagamento na entrega e de modeladores:

- **Oferta primeiro**: "leve 2 e ganhe 1", faixa de desconto, "de R$ X por R$ Y" (SKIMS: *offer-first banner* 12%).
- **Demonstração e experimentação**: o corpo antes e depois **vestindo** a peça, prova de caimento (*try-on*, *demo*, *split screen*).
- **Reforço de confiança do pagamento na entrega**: "você só paga quando chegar", entrega agendada na sua cidade.
- **Depoimento de cliente real** e comparação de ajuste.

Todos os quatro **já estão no v3**. Não há "segredo" escondido que a Malu não use.

**O que descartei, e por quê.** O apelo "black" que realmente dispara é promessa de corpo, escassez falsa, prova social
inventada e contador que reinicia. Não entra no agente, por razões práticas e não só morais:

1. **Escassez e urgência falsas** (contador que zera, "últimas unidades" sem estoque real) são tratadas como *dark pattern* e
   práticas enganosas ([FTC, via análise jurídica](https://revisionlegal.com/internet-law/ecommerce-false-advertising-fake-sales-timers-dark-patterns/));
   no Brasil, publicidade enganosa é o art. 37 do CDC. Já está vetado no projeto (`persona-jussara`, `persona-beatriz`).
2. **Promessa de emagrecer ou "reduzir tamanhos"** é o ponto onde a categoria de modeladores é mais fiscalizada
   (Meta Ads, CONAR, ANVISA). Atenção: o áudio 1 do funil já diz "reduz até três tamanhos de cintura" (§5, item 3 do script v3).
   É o risco mais concreto que vi, e a Malu tem de seguir confirmando só o efeito de **vestido**.
3. **O custo de errar é o ativo inteiro**: conta de anúncios, número da Cloud API (nota de qualidade) e CNPJ. A cliente que
   cai em apelo falso vira recusa na entrega (frete perdido) e reclamação.

**O que serve do espírito "black" sem esses riscos**: urgência **real** (corte do dia para a entrega de amanhã, que a
consulta de cobertura já devolve; desconto de kit com preço por peça), prova **real** (as 124 avaliações e a nota 5) e um
benefício **vestido e demonstrável** ("modela em segundos").

## 3. As lacunas, em ordem de impacto esperado

Cada uma é hipótese a testar. As três primeiras mexem no prompt (`tests/prompt.test.ts`, `pnpm dev:gates`).

| # | Mudança | Por quê (evidência) | Risco |
|---|---|---|---|
| 1 | **Antecipado: dar o valor do frete antes do link** (a consulta de região já existe) | Baymard 39%: custo surpresa no checkout | Médio: depende do que a Coinzz devolve; sem número confiável, dizer a faixa real, nunca inventar (memória *frete do antecipado não existe*) |
| 2 | **Uma pergunta sobre ela antes do pitch** ("é pra alguma ocasião ou pro dia a dia?"), e usar a resposta no resto da conversa | Huang et al.; Fogg (personalização aumenta motivação) | Baixo, mas testar contra o fluxo atual: o v3 vende antes de perguntar de propósito |
| 3 | **Objeção vaga = pergunta antes da resposta**: "vou pensar", "tá caro", "vou ver": rotular + "o que pesa mais pra você, o valor ou a dúvida se serve?" | Gong Labs; Voss | Baixo. Respeitar "não" claro, que encerra a régua |
| 4 | **Abrir a resposta à desconfiança com o reversor**: "você só paga quando o entregador chegar e vê o colete antes de pagar" | Hormozi (reversão de risco); Baymard (confiança) | Baixo; é frase que a base já valida |
| 5 | **Âncora do kit por peça** ("2 peças saem R$ 116,91 cada") | Âncora de preço em pacote | Verificar com o `pricing-guardian`; a conta tem de bater com a de R$ 233,82 |
| 6 | **Confirmação do dia anterior à entrega** ("amanhã o entregador passa, vai ter alguém?") para reduzir recusa | Vendor: confirmação prévia leva devolução de 20–30% para 10–15% (estimativa comercial) | Exige template fora da janela de 24 h; não é conversão, é caixa. Medir |
| 7 | **Toque ≈1 h após o link sem pagamento, sem desconto** | Cadência de recuperação | Já pode existir; checar em `followups.ts` |

**Não recomendo**: contador, "últimas unidades", depoimento sem fonte, atraso de digitação artificial como "truque" (sem
evidência), e áudio como regra geral (a evidência é só uma credibilidade percebida maior em estudo de desinformação e um
teste de fornecedor sobre chat de site; ver §4).

## 4. Dúvidas que só os nossos dados respondem

- **Áudio vs. texto**: nenhum estudo independente de venda. Medir conversão com e sem os áudios 1 e 2 (A/B no tráfego atual).
- **Quantas mensagens antes da primeira pergunta**: o v3 aposta em 11; teste contra 5.
- **Efeito de cada objeção**: `turn_outcomes` já guarda o desfecho. Ordenar onde as conversas param pelo tipo da última
  mensagem da cliente é o dado que a literatura não tem.

## 5. Fora do agente (do sócio, só para repasse)

- Otimizar a campanha CTWA **para compra**, não para conversa (caso Braip, 45% mais leads qualificados).
- Preço das mensagens da Cloud API: a partir de 01/10/2026 os templates de utilidade enviados **dentro** da janela de 24 h
  também são cobrados (salvo janela de entrada gratuita de anúncio CTWA). Impacta a confirmação da §3, item 6. Conferir na
  [tabela oficial da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Política: a Meta proibiu, desde 15/01/2026, **assistentes de IA de uso geral** no WhatsApp Business. Agentes de venda e
  suporte de uma empresa estão fora da proibição, segundo a cobertura da imprensa ([TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform)).
  A Malu é de venda, não geral, mas **o texto oficial dos termos não foi lido**; vale o sócio conferir.

## 6. Fontes

[Zowie](https://getzowie.com/blog/conversational-commerce) · [Qualimero](https://qualimero.com/en/blog/whatsapp-marketing-examples-ai-consultation-guide-2026) ·
[MessageMind](https://messagemind.ai/blog/conversational-commerce) · [Salesmate (Cialdini)](https://www.salesmate.io/blog/cialdinis-principles-of-sales-persuasion) ·
[Gong Labs](https://www.gong.io/resources/labs/handling-sales-objections/) · [Baymard](https://baymard.com/learn/reduce-cart-abandonment) ·
[Fogg](https://behaviormodel.org/) · [Huang et al., APS](https://psychologicalscience.org/news/minds-business/asking-questions-increases-likability.html) ·
[Hormozi, resumo](https://www.supersummary.com/100m-offers/key-takeaways/) · [Voss, resumo](https://justcall.io/blog/best-sales-negotiation-chris-voss.html) ·
[SendPulse](https://sendpulse.com/br/blog/texto-pronto-para-vendas-no-whatsapp) · [Sebrae](https://sebrae.com.br/content/dam/portal-sebrae/na/midias/documentos/pdfs/ebook_como-vender-whatsapp-sem-perder-cliente.pdf) ·
[Loggi (COD)](https://www.loggi.com/conteudos/logistica/cash-on-delivery/) · [Adligator (COD)](https://adligator.com/spy/cod) · [Motion](https://motionapp.com/library/brands/skims) ·
[eGrow (recuperação)](https://www.egrow.com/en/blog/woocommerce-abandoned-cart-whatsapp-2026) · [Docket (voz)](https://www.docket.io/voice-vs-text)
