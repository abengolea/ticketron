/**
 * Integración Mercado Pago (REST API)
 * Configurar MERCADO_PAGO_ACCESS_TOKEN en .env.local
 * Webhook URL: {NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook
 */

const MP_API = 'https://api.mercadopago.com';

function resolveAccessToken(override?: string): string {
  const token = override?.trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'Mercado Pago no configurado. El productor debe vincular su cuenta en Ajustes.'
    );
  }
  return token;
}

function isProdToken(token: string): boolean {
  return token.startsWith('APP_USR');
}

/** URL base sin barra final — requerida para back_urls de MP */
export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    'http://localhost:9002';

  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_APP_URL inválida: "${raw}". Usar formato https://tu-dominio.com`
    );
  }
}

/** MP solo acepta auto_return con URLs públicas HTTPS (no localhost) */
function canUseAutoReturn(baseUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(baseUrl);
    if (protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export interface MercadoPagoLineItem {
  title: string;
  unitPrice: number;
  quantity: number;
}

export interface MercadoPagoPreferenceInput {
  title: string;
  unitPrice: number;
  quantity?: number;
  /** Si se define, reemplaza title/unitPrice/quantity por líneas del carrito */
  items?: MercadoPagoLineItem[];
  externalReference: string;
  /** Si se omite, la preferencia en MP no vence por tiempo (uso único lo controla la app) */
  expiresAt?: Date;
  payerEmail?: string;
  /** Token del checkout (/checkout/[token]) para URLs de retorno */
  checkoutToken?: string;
  /** Path relativo para URLs de retorno (ej. /bar/order/[token]). Tiene prioridad sobre checkoutToken. */
  returnPath?: string;
}

export interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export interface MercadoPagoPayment {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string;
  preference_id?: string;
}

function buildBackUrls(baseUrl: string, checkoutToken?: string, returnPath?: string) {
  if (returnPath) {
    const base = `${baseUrl}${returnPath}`;
    return {
      success: `${base}?mp=approved`,
      failure: `${base}?mp=failure`,
      pending: `${base}?mp=pending`,
    };
  }
  if (checkoutToken) {
    const base = `${baseUrl}/checkout/${checkoutToken}`;
    return {
      success: `${base}?mp=approved`,
      failure: `${base}?mp=failure`,
      pending: `${base}?mp=pending`,
    };
  }
  return {
    success: `${baseUrl}/ticket`,
    failure: `${baseUrl}/login`,
    pending: `${baseUrl}/login`,
  };
}

export async function createPreference(
  input: MercadoPagoPreferenceInput,
  accessToken?: string
): Promise<MercadoPagoPreference> {
  const token = resolveAccessToken(accessToken);
  const baseUrl = getAppBaseUrl();
  const back_urls = buildBackUrls(baseUrl, input.checkoutToken, input.returnPath);

  const body: Record<string, unknown> = {
    items: (input.items?.length
      ? input.items
      : [{ title: input.title, quantity: input.quantity ?? 1, unitPrice: input.unitPrice }]
    ).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      currency_id: 'ARS',
    })),
    external_reference: input.externalReference,
    back_urls,
    notification_url: `${baseUrl}/api/mercadopago/webhook`,
  };

  if (input.expiresAt) {
    body.expires = true;
    body.expiration_date_from = new Date().toISOString();
    body.expiration_date_to = input.expiresAt.toISOString();
  } else {
    body.expires = false;
  }

  if (input.payerEmail) {
    body.payer = { email: input.payerEmail };
  }

  // auto_return solo con HTTPS público; en local MP rechaza la preferencia
  if (canUseAutoReturn(baseUrl)) {
    body.auto_return = 'approved';
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mercado Pago preference error: ${res.status} ${errText}`);
  }

  return res.json() as Promise<MercadoPagoPreference>;
}

export async function getPayment(
  paymentId: string,
  accessToken?: string
): Promise<MercadoPagoPayment> {
  const token = resolveAccessToken(accessToken);
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mercado Pago payment error: ${res.status} ${errText}`);
  }

  return res.json() as Promise<MercadoPagoPayment>;
}

export { isProdToken };
