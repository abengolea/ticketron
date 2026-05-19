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
  if (link.mercadoPagoPaymentId) return 'mercadopago';
  return 'cash';
}

const METHOD_LABELS: Record<TicketPaymentMethod, string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Pago en efectivo',
  complimentary: 'Entrada de favor',
};

export function getTicketPaymentDisplay(
  link: SerializedPaymentLink | undefined
): TicketPaymentDisplay {
  const method = getTicketPaymentMethod(link);
  const qty = link?.ticketQuantity ?? 1;
  const amountPerTicket =
    method === 'complimentary' ? 0 : Math.round((link?.amount ?? 0) / qty);
  const label = METHOD_LABELS[method];
  return {
    method,
    label,
    amountPerTicket,
    formatted: `${label} · ${formatArs(amountPerTicket)}`,
  };
}
