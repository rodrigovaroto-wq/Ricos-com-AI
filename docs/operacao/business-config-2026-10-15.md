# `BUSINESS_CONFIG` em produção desde 2026-10-15

> O segredo não se lê de volta (a API de gerência devolve só o SHA-256 do valor). Este arquivo guarda **o valor exato** colado
> pelo operador em 15/10, às 14:25 UTC, para conferir por hash e reconstruir sem adivinhar. Não há credencial nele — só valores de
> negócio, os mesmos citados no HANDOFF e nas decisões.

## Como foi montado

`config/business.example.json`, sem os `_comment`, com estas trocas (decisões do operador, todas confirmadas em 15/10):

| Chave | Valor | De onde |
|---|---|---|
| `agentName` | Malu | — |
| `cost` | `conversationCapBrl` 1.0, `overrunTolerance` 0 | R18.7 (operador manteve em 15/10) |
| `coupon` | SUPER20, 20%, ativo | decisão de 30/09 |
| `handoff.email` | contato@encorpa-fashion.com.br | R13.2 |
| `scarcity` | **ausente** | R20.1 |
| `testimonials` | `[]` | 30/09 |
| `coinzz` | `offerHash` offp16pv, `prepayOfferHash` offkw47x, afterpay / pix | HANDOFF (operador manteve) |
| `returns` | `logzzSupportPhone` +55 11 91132-7877, `freeExchange` true | R21.2/R21.3 |
| `socialProof`, `store` | 500 clientes; plano de loja em São Paulo | R13.5 (operador confirmou que são verdade) |
| `channel` | `askMarketingOptIn` **true** (migração 0019 aplicada); templates `silence_3` (`en`), `order_eve`, `order_eve_pago` | operador, 15/10; templates de 08/10 |
| `experiments` | `fastOpening` true, `linkAfterChoice` true | R20.6, L3 assinado 12/10 |

## Conferir que é este que está no ar

```
curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/hbmkgakzrqmdlsvszjeo/secrets \
  | python3 -c "import sys,json; print([s['value'] for s in json.load(sys.stdin) if s['name']=='BUSINESS_CONFIG'])"
```

**Esperado:** `674302356480d3bc335ad9323b34424590b3b28c6f495e3370de86c101e27310` — o SHA-256 do JSON **compacto** abaixo
(`json.dumps(..., separators=(",", ":"), ensure_ascii=False)`). Conferido em 15/10, 14:26 UTC.

## O valor (compacto é o que foi colado; a versão legível vem depois)

```json
{"brand":"Encorpa","product":"Colete Cinta Modeladora","site":"encorpa-fashion.com.br","agentName":"Malu","prices":{"codBrl":129.9,"prepayBrl":116.91,"prepayDiscountPercent":10,"anchorBrl":216.5,"prepayMaxInstallments":12},"delivery":{"codDaysMin":1,"codDaysMax":3,"codScheduled":true,"prepayVariesByRegion":true,"warrantyDays":7,"freeShipping":false,"codFreeShipping":true,"prepayAvgDays":5,"expressActive":false},"sizes":["P","M","G","GG","XGG"],"hours":{"openHour":6,"closeHour":24},"cost":{"conversationCapBrl":1.0,"overrunTolerance":0},"coupon":{"code":"SUPER20","percent":20,"active":true},"cod":{"physicalOnDeliveryActive":true},"checkout":{"codUrl":"https://entrega.logzz.com.br/pay/ccm-1-unidade","prepayUrl":"https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0"},"handoff":{"email":"contato@encorpa-fashion.com.br"},"testimonials":[],"coinzz":{"offerHash":"offp16pv","prepayOfferHash":"offkw47x","codPaymentMethod":"afterpay","prepayPaymentMethod":"pix"},"support":{"email":"contato@encorpa-fashion.com.br"},"returns":{"logzzSupportPhone":"+55 11 91132-7877","freeExchange":true},"socialProof":{"satisfiedCustomers":500},"store":{"physicalStorePlanCity":"São Paulo"},"kits":[{"path":"cod","units":2,"priceBrl":233.82,"discountPercent":10,"checkoutUrl":"https://entrega.logzz.com.br/pay/ccm-2-unidades"},{"path":"cod","units":3,"priceBrl":311.76,"discountPercent":20,"checkoutUrl":"https://entrega.logzz.com.br/pay/ccm-3-unidades"},{"path":"prepay","units":2,"priceBrl":207.84,"discountPercent":20,"checkoutUrl":"https://app.coinzz.com.br/checkout/antecipado-2-0"},{"path":"prepay","units":3,"priceBrl":272.79,"discountPercent":30,"checkoutUrl":"https://app.coinzz.com.br/checkout/antecipado-3-0"}],"channel":{"askMarketingOptIn":true,"templates":{"silence_3":{"name":"encorpa_cupom_super_dia","language":"en","variables":["weekday","couponPercent","couponCode"]},"order_eve":{"name":"encorpa_vespera_entrega","language":"pt_BR","variables":["price"]},"order_eve_pago":{"name":"encorpa_vespera_entrega_pago","language":"pt_BR","variables":[]}}},"experiments":{"fastOpening":true,"linkAfterChoice":true}}
```

```json
{
  "brand": "Encorpa",
  "product": "Colete Cinta Modeladora",
  "site": "encorpa-fashion.com.br",
  "agentName": "Malu",
  "prices": {
    "codBrl": 129.9,
    "prepayBrl": 116.91,
    "prepayDiscountPercent": 10,
    "anchorBrl": 216.5,
    "prepayMaxInstallments": 12
  },
  "delivery": {
    "codDaysMin": 1,
    "codDaysMax": 3,
    "codScheduled": true,
    "prepayVariesByRegion": true,
    "warrantyDays": 7,
    "freeShipping": false,
    "codFreeShipping": true,
    "prepayAvgDays": 5,
    "expressActive": false
  },
  "sizes": [
    "P",
    "M",
    "G",
    "GG",
    "XGG"
  ],
  "hours": {
    "openHour": 6,
    "closeHour": 24
  },
  "cost": {
    "conversationCapBrl": 1.0,
    "overrunTolerance": 0
  },
  "coupon": {
    "code": "SUPER20",
    "percent": 20,
    "active": true
  },
  "cod": {
    "physicalOnDeliveryActive": true
  },
  "checkout": {
    "codUrl": "https://entrega.logzz.com.br/pay/ccm-1-unidade",
    "prepayUrl": "https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0"
  },
  "handoff": {
    "email": "contato@encorpa-fashion.com.br"
  },
  "testimonials": [],
  "coinzz": {
    "offerHash": "offp16pv",
    "prepayOfferHash": "offkw47x",
    "codPaymentMethod": "afterpay",
    "prepayPaymentMethod": "pix"
  },
  "support": {
    "email": "contato@encorpa-fashion.com.br"
  },
  "returns": {
    "logzzSupportPhone": "+55 11 91132-7877",
    "freeExchange": true
  },
  "socialProof": {
    "satisfiedCustomers": 500
  },
  "store": {
    "physicalStorePlanCity": "São Paulo"
  },
  "kits": [
    {
      "path": "cod",
      "units": 2,
      "priceBrl": 233.82,
      "discountPercent": 10,
      "checkoutUrl": "https://entrega.logzz.com.br/pay/ccm-2-unidades"
    },
    {
      "path": "cod",
      "units": 3,
      "priceBrl": 311.76,
      "discountPercent": 20,
      "checkoutUrl": "https://entrega.logzz.com.br/pay/ccm-3-unidades"
    },
    {
      "path": "prepay",
      "units": 2,
      "priceBrl": 207.84,
      "discountPercent": 20,
      "checkoutUrl": "https://app.coinzz.com.br/checkout/antecipado-2-0"
    },
    {
      "path": "prepay",
      "units": 3,
      "priceBrl": 272.79,
      "discountPercent": 30,
      "checkoutUrl": "https://app.coinzz.com.br/checkout/antecipado-3-0"
    }
  ],
  "channel": {
    "askMarketingOptIn": true,
    "templates": {
      "silence_3": {
        "name": "encorpa_cupom_super_dia",
        "language": "en",
        "variables": [
          "weekday",
          "couponPercent",
          "couponCode"
        ]
      },
      "order_eve": {
        "name": "encorpa_vespera_entrega",
        "language": "pt_BR",
        "variables": [
          "price"
        ]
      },
      "order_eve_pago": {
        "name": "encorpa_vespera_entrega_pago",
        "language": "pt_BR",
        "variables": []
      }
    }
  },
  "experiments": {
    "fastOpening": true,
    "linkAfterChoice": true
  }
}
```

## Para a rodada local de personas

O `BUSINESS_CONFIG` da `turn` local é este, com `hours` aberto 24 h e o e-mail de aviso trocado (senão tudo sai `deferred` e
o e-mail vai ao operador):

```
export BUSINESS_CONFIG="$(jq -c '.hours={openHour:0,closeHour:24} | .handoff.email="operador@example.com"' docs/operacao/business-config-2026-10-15.min.json)"
```
