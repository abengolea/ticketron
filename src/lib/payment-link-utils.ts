import type { PaymentLink, SerializedPaymentLink } from '@/lib/models';

/** Link de Mercado Pago creado pero aún sin pagar (reserva cupo). */
export function isPaymentLinkAwaitingPayment(
  link: Pick<PaymentLink, 'status' | 'linkType'>
): boolean {
  if (link.status !== 'PENDING_PAYMENT') return false;
  const type = link.linkType ?? 'payment';
  return type === 'payment';
}

function countsTowardCollection(link: SerializedPaymentLink) {
  return (link.linkType ?? 'payment') !== 'complimentary';
}

/** Montos de links de pago/efectivo: cobrado, pendiente y proyección. */
export function computePaymentLinkRevenue(links: SerializedPaymentLink[]) {
  let collected = 0;
  let pending = 0;

  for (const link of links) {
    if (!countsTowardCollection(link)) continue;
    const amount = link.amount ?? 0;
    if (isPaymentLinkAwaitingPayment(link)) {
      pending += amount;
    } else if (link.status === 'PAID') {
      collected += amount;
    }
  }

  return {
    collected,
    pending,
    projected: collected + pending,
  };
}

export function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
