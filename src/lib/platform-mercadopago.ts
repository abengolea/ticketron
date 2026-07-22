/**
 * Token MP de Notificas SRL (cobro de fees de plataforma).
 * Distinto del token del productor (entradas).
 */
export function getPlatformMercadoPagoToken(): string {
  const token =
    process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    process.env.MERCADO_PAGO_PLATFORM_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error(
      'Mercado Pago de plataforma no configurado (MERCADOPAGO_PLATFORM_ACCESS_TOKEN).'
    );
  }
  return token;
}

export function isPlatformMercadoPagoConfigured(): boolean {
  try {
    getPlatformMercadoPagoToken();
    return true;
  } catch {
    return false;
  }
}

export const EVENT_FEE_EXTERNAL_REF_PREFIX = 'ticketron_fee_';

export function buildEventFeeExternalReference(chargeId: string): string {
  return `${EVENT_FEE_EXTERNAL_REF_PREFIX}${chargeId}`;
}

export function parseEventFeeExternalReference(
  externalReference: string | undefined | null
): string | null {
  if (!externalReference?.startsWith(EVENT_FEE_EXTERNAL_REF_PREFIX)) return null;
  const id = externalReference.slice(EVENT_FEE_EXTERNAL_REF_PREFIX.length).trim();
  return id || null;
}
