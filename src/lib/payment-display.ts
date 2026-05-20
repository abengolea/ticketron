import type { SerializedPaymentLink } from '@/lib/models';

export type TicketPaymentMethod = 'mercadopago' | 'cash' | 'complimentary';

export interface TicketPaymentDisplay {
  method: TicketPaymentMethod;
  label: string;
  amountPerTicket: number;
  formatted: string;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getTicketPaymentMethod(
  link: SerializedPaymentLink | undefined
): TicketPaymentMethod {
  if (!link) return 'cash';
  if (link.linkType === 'complimentary') return 'complimentary';
  if (link.linkType === 'cash') return 'cash';
  if (link.mercadoPagoPaymentId || link.mercadoPagoPreferenceId) {
    return 'mercadopago';
  }
  // Links de checkout MP no siempre tienen linkType; si está pagado y no es efectivo/cortesía → MP
  if (link.status === 'PAID') return 'mercadopago';
  return 'cash';
}

const METHOD_LABELS: Record<TicketPaymentMethod, string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Pago en efectivo',
  complimentary: 'Entrada de cortesía',
};

function resolveAmountPerTicket(
  method: TicketPaymentMethod,
  link: SerializedPaymentLink | undefined,
  unitPrice?: number
): number {
  if (method === 'complimentary') return 0;

  // MP + entrada emitida: mostrar siempre el precio fijado del evento
  if (method === 'mercadopago' && unitPrice && unitPrice > 0) {
    return unitPrice;
  }

  const qty = link?.ticketQuantity ?? 1;
  const fromLink = Math.round((link?.amount ?? 0) / qty);
  if (fromLink > 0) return fromLink;
  if (unitPrice && unitPrice > 0) return unitPrice;
  return 0;
}

export function getTicketPaymentDisplay(
  link: SerializedPaymentLink | undefined,
  options?: { unitPrice?: number }
): TicketPaymentDisplay {
  const method = getTicketPaymentMethod(link);
  const amountPerTicket = resolveAmountPerTicket(method, link, options?.unitPrice);
  const label = METHOD_LABELS[method];
  return {
    method,
    label,
    amountPerTicket,
    formatted: `${label} · ${formatArs(amountPerTicket)}`,
  };
}
