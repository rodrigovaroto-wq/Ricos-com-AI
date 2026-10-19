# `BUSINESS_CONFIG` — o que muda em 19/10 (noite)

O secret de produção foi editado pelo operador depois do arquivo `business-config-2026-10-19.min.json` (o hash dele já não bate), então **o jeito
seguro é aplicar só estas duas mudanças ao JSON que está no ar**, sem colar o arquivo inteiro por cima.

1. Em `returns` (suporte de troca, devolução e mudança de endereço, a Gizele):
   ```json
   "returns": { "logzzSupportPhone": "+55 11 97727-9391", "supportName": "Gizele", "freeExchange": true }
   ```
   Mantenha o que já houver em `returns` (por exemplo `freeExchange`) e troque só o telefone e acrescente `supportName`.
2. Em `checkout` (opcional; sem a chave a consulta já usa a oferta `ccm-1-unidade`):
   ```json
   "logzz": { "productId": "165378", "saleId": "75567" }
   ```

`business-config-2026-10-19b.min.json` é o arquivo inteiro com as duas mudanças, partindo do arquivo de 19/10 (sem as edições que o
operador fez depois). Só use ele inteiro se for o caso de substituir tudo.
