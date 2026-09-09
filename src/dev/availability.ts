/**
 * Consulta de disponibilidade do checkout da Coinzz, de fora do navegador.
 *
 * `GET /checkout/stock-and-delivery-day` é o que a página chama quando a cliente
 * escolhe um tamanho, e é ele que decide o pop-up de "não há disponibilidade". O
 * endpoint é **público**: nenhum cookie, nenhum CSRF, nenhum token — conferido em
 * 2026-09-08 chamando direto daqui.
 *
 * Três coisas que a leitura ingênua erra, e por isso estão escritas aqui:
 *
 * 1. `stock` volta `"1"` sempre, inclusive para tamanho indisponível. Não é ali que
 *    mora a resposta.
 * 2. `has_local_operation_cash_on_delivery` volta `false` inclusive quando o
 *    pagamento na entrega ESTÁ disponível. Também não é ali.
 * 3. Quem responde é `local_operation_cash_on_delivery.delivery_days_available`:
 *    vazio significa não, preenchido traz **o frete** e **as datas** que o checkout
 *    vai oferecer.
 *
 * Dos parâmetros que o navegador manda, só o CEP muda a resposta. Telefone, CPF,
 * bairro e número podem ser sintéticos — conferido campo a campo. Cidade e UF saem
 * do próprio CEP pelo ViaCEP. Isso é o que torna a consulta usável na conversa: a
 * agente precisa perguntar **só o CEP** antes de indicar um tamanho.
 *
 * Uso: `pnpm dev:estoque 04710090 01310100 …` (sem argumento, roda a lista padrão).
 */

const ENDPOINT = "https://app.coinzz.com.br/checkout/stock-and-delivery-day";

/** O produto-pai e os cinco tamanhos, lidos de `get-variations?product_id=79880`. */
const PARENT_PRODUCT_ID = "79880";
const SIZE_CODES: ReadonlyArray<readonly [string, string]> = [
  ["P", "pro4gpo2"],
  ["M", "proqvqmj"],
  ["G", "pro7ml00"],
  ["GG", "pro66jdm"],
  ["XGG", "proe50v0"],
];

/** A integração OmniCash da oferta de pagamento na entrega, de `getAll`. */
const APP_INTEGRATION_DETAIL_ID = "25458";

/** Valores sintéticos: conferidos como irrelevantes para a resposta. */
const PLACEHOLDER = { phone: "11900000000", document: "27944872804", number: "1" };

type Availability = {
  size: string;
  codAvailable: boolean;
  freightBrl: number | null;
  dates: string[];
  prepayFreightBrl: number | null;
  prepayDays: string | null;
};

const viaCep = async (zip: string): Promise<{ city: string; state: string; district: string }> => {
  const r = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
  const j = (await r.json()) as { localidade?: string; uf?: string; bairro?: string; erro?: unknown };
  if (j.erro || !j.localidade || !j.uf) throw new Error(`CEP não encontrado: ${zip}`);
  return { city: j.localidade, state: j.uf, district: j.bairro || "Centro" };
};

const checkSize = async (
  zip: string,
  place: { city: string; state: string; district: string },
  [size, code]: readonly [string, string],
): Promise<Availability> => {
  const query = new URLSearchParams({
    customer_phone_ddi: "55",
    customer_phone: PLACEHOLDER.phone,
    customer_document: PLACEHOLDER.document,
    "products[0][product_id]": PARENT_PRODUCT_ID,
    "products[0][code]": code,
    "products[0][quantity]": "1",
    zip_code: zip,
    city: place.city,
    state: place.state,
    neighbourhood: place.district,
    number: PLACEHOLDER.number,
    app_integration_detail_id: APP_INTEGRATION_DETAIL_ID,
    freight_value: "0",
    sale_type: "anticipated",
    "billing_moments[]": "on_delivery",
    check_to_finish: "false",
  });

  const response = await fetch(`${ENDPOINT}?${query}`);
  const body: unknown = await response.json().catch(() => null);
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data) throw new Error(`resposta inesperada para ${size} em ${zip}`);

  const cod = data.local_operation_cash_on_delivery as
    | { delivery_days_available?: Array<{ deliveryPrice: number; dates: Array<{ date: string }> }> }
    | undefined;
  const window = cod?.delivery_days_available?.[0];
  const shipping = (data.local_operation as Array<{ price: number; deadline: string }> | undefined)?.[0];

  return {
    size,
    codAvailable: Boolean(window),
    freightBrl: window?.deliveryPrice ?? null,
    dates: window?.dates.map((d) => d.date) ?? [],
    prepayFreightBrl: shipping?.price ?? null,
    prepayDays: shipping?.deadline ?? null,
  };
};

const brl = (n: number | null) => (n == null ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`);

const run = async (zips: string[]) => {
  for (const zip of zips) {
    const place = await viaCep(zip);
    console.log(`\n${place.city}/${place.state} · CEP ${zip}`);
    for (const entry of SIZE_CODES) {
      const a = await checkSize(zip, place, entry);
      const cod = a.codAvailable
        ? `entrega SIM · frete ${brl(a.freightBrl)} · datas ${a.dates.join(", ")}`
        : "entrega NÃO";
      console.log(
        `  ${a.size.padEnd(3)} ${cod.padEnd(64)} antecipado ${brl(a.prepayFreightBrl)}` +
          `${a.prepayDays ? ` em ${a.prepayDays} dias` : ""}`,
      );
    }
  }
};

/** A amostra que produziu o achado de 2026-09-08: três metrópoles e três interiores. */
const DEFAULT_ZIPS = ["04710090", "20040020", "30112000", "80010010", "68376576", "95211086"];

const args = process.argv.slice(2);
await run(args.length > 0 ? args : DEFAULT_ZIPS);

export {};
