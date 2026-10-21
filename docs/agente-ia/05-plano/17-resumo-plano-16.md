# Plano 16 — resumo da implementação (21/10/2026)

No ar como `turn` v40, `BUSINESS_CONFIG` de 21/10 colado (hash conferido), migração 0029 aplicada, assunto do e-mail no n8n com a faixa do score. PRs: Ricos-com-AI #77 e encorpa-portal #5.

| O quê | Antes | Agora | Erros achados no caminho | Impacto esperado | Limitações |
|---|---|---|---|---|---|
| Perfil da cliente | Só tamanho, CEP e etapa | Ocasião, dor, objeções, sensibilidade a preço e áudios, guardados por lead | Mensagem contada em dobro; mensagem perdida quando chegava enquanto a Malu escrevia; "obrigada, tchau" contado como "vou pensar" | Respostas mais pessoais | O perfil depende da leitura do modelo |
| Score 0–100 | Não existia | Quente, morna ou fria. A fria recebe só 1 lembrete. O e-mail vem com a etiqueta. O portal mostra por lead e o total | A régua lia a linha inteira do lead, com endereço e dor; agora lê só o tamanho e a faixa | Menos insistência com quem não quer; prioridade para as quentes | Pesos chutados até ~200 leads reais. Toque sem resposta não tira ponto |
| Escassez | Proibida | "O seu tamanho está acabando: restam só X", com estoque real menor que 20 | Estoque contado a menos; número de até 1 h atrás; frase repetida a cada turno | Urgência verdadeira, sem risco no CDC | Se a Malu não usar a frase quando ela é oferecida, a frase não volta |
| Frete do antecipado | "Aparece no checkout" | O valor real antes do link | Kit recebia o frete de 1 peça; erro no próprio teste. Conferido em 87 casos, todos iguais à Coinzz | Menos desistência no checkout | Só para 1 peça. Kit continua "aparece no checkout" |
| Objeção vaga | Resposta fixa | Uma pergunta com um motivo verdadeiro para comprar agora | "Claro!" depois de "nem compensa"; a pergunta podia sair duas vezes ou nunca | Recupera parte de quem hesita | Uma vez por conversa |
| Gatilho pessoal | Não existia | Usa o que ela contou até 3 vezes; frase pessoal antes da oferta | "Ajuda no pós-parto" e "reduz a barriga" passavam pelos gates; agora são descartadas | Conversa mais humana | A frase antes da oferta ainda não foi vista ao vivo |
| Persona Gisele | — | Pressiona a Malu com autoridade e falsas promessas | — | Prova que ela não cede | — |
| Validação | — | 8736 testes, 738 mutações, 7 rodadas de /code-review, 6 rodadas de personas | — | — | Personas sem regressão detectável; custo do modelo ~35% maior |
| Produção | v39 | v40, com score no e-mail, config de 21/10 e migração 0029 no banco | — | — | Confira a primeira conversa real: `leads.score` preenchido |
