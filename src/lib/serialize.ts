import type { Timestamp } from 'firebase-admin/firestore';
import type {
  PlatformEvent,
  PaymentLink,
  PlatformTicket,
  SerializedEvent,
  SerializedPaymentLink,
  SerializedTicket,
} from '@/lib/models';

function tsToIso(ts: Timestamp | undefined): string | undefined {
  if (!ts) return undefined;
  return ts.toDate().toISOString();
}

export function serializeEvent(e: PlatformEvent): SerializedEvent {
  return {
    id: e.id,
    name: e.name,
    date: e.date.toDate().toISOString(),
    location: e.location,
    active: e.active,
    capacity: e.capacity,
    sold: e.sold,
    price: e.price,
  };
}

export function serializePaymentLink(p: PaymentLink): SerializedPaymentLink {
  return {
    id: p.id,
    token: p.token,
    eventId: p.eventId,
    sellerId: p.sellerId,
    ticketQuantity: p.ticketQuantity ?? 1,
    linkType: p.linkType ?? 'payment',
    complimentaryMessage: p.complimentaryMessage,
    buyerName: p.buyerName,
    buyerLastName: p.buyerLastName,
    buyerPhone: p.buyerPhone,
    buyerEmail: p.buyerEmail,
    amount: p.amount,
    status: p.status,
    expiresAt: p.expiresAt.toDate().toISOString(),
    mercadoPagoPreferenceId: p.mercadoPagoPreferenceId,
    mercadoPagoPaymentId: p.mercadoPagoPaymentId,
    archived: p.archived === true,
    createdAt: p.createdAt.toDate().toISOString(),
  };
}

export function serializeTicket(t: PlatformTicket): SerializedTicket {
  return {
    id: t.id,
    ticketCode: t.ticketCode,
    paymentLinkId: t.paymentLinkId,
    eventId: t.eventId,
    sellerId: t.sellerId,
    buyerName: t.buyerName,
    buyerPhone: t.buyerPhone,
    buyerEmail: t.buyerEmail,
    status: t.status,
    qrPayload: t.qrPayload,
    usedAt: tsToIso(t.usedAt),
    archived: t.archived === true,
    createdAt: t.createdAt.toDate().toISOString(),
  };
}
