import { Timestamp } from 'firebase-admin/firestore';
import type {
  BarOrder,
  BarOrderItem,
  BarProduct,
  PlatformEvent,
  PaymentLink,
  PlatformTicket,
  SerializedBarOrder,
  SerializedBarProduct,
  SerializedEvent,
  SerializedPaymentLink,
  SerializedTicket,
  AccessDay,
  AccessEvent,
  VisitorInviteLink,
  AccessPass,
  AccessScan,
  SerializedAccessDay,
  SerializedAccessEvent,
  SerializedVisitorInviteLink,
  SerializedAccessPass,
  SerializedAccessScan,
} from '@/lib/models';

function tsToIso(ts: Timestamp | undefined): string | undefined {
  if (!ts) return undefined;
  return ts.toDate().toISOString();
}

/** Fecha embebida en IDs legacy tipo EVENTO-20251027-1034 */
function parseLegacyEventIdDate(id: string): Date | null {
  const match = id.match(/^EVENTO-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  return new Date(+y, +m - 1, +d, +hh, +mm);
}

function asTimestamp(value: unknown, fallback: Timestamp): Timestamp {
  if (value instanceof Timestamp) return value;
  if (
    value &&
    typeof value === 'object' &&
    '_seconds' in value &&
    typeof (value as { _seconds: unknown })._seconds === 'number'
  ) {
    const raw = value as { _seconds: number; _nanoseconds?: number };
    return new Timestamp(raw._seconds, raw._nanoseconds ?? 0);
  }
  return fallback;
}

/** Normaliza documentos legacy y actuales de la colección events. */
export function normalizeEventDoc(
  id: string,
  raw: FirebaseFirestore.DocumentData
): PlatformEvent {
  const now = Timestamp.now();
  const createdAt = asTimestamp(raw.createdAt, now);
  const legacyDate = parseLegacyEventIdDate(id);
  const date = raw.date
    ? asTimestamp(raw.date, createdAt)
    : legacyDate
      ? Timestamp.fromDate(legacyDate)
      : createdAt;

  return {
    id,
    name: String(raw.name ?? raw.eventName ?? id).trim(),
    date,
    location: (raw.location ?? raw.venue ?? undefined) as string | undefined,
    active: raw.active !== false,
    capacity: Number(raw.capacity ?? raw.ticketCount ?? 0),
    sold: Number(raw.sold ?? 0),
    price: Number(raw.price ?? 0),
    ownerId: String(raw.ownerId ?? ''),
    createdAt,
    updatedAt: asTimestamp(raw.updatedAt, createdAt),
  };
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
    ownerId: e.ownerId,
  };
}

export function serializePaymentLink(p: PaymentLink): SerializedPaymentLink {
  return {
    id: p.id,
    token: p.token,
    eventId: p.eventId,
    sellerId: p.sellerId,
    ticketQuantity: p.ticketQuantity ?? 1,
    recipientLabel: p.recipientLabel,
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

export function barOrderItems(
  order: Pick<BarOrder, 'items' | 'productId' | 'productName' | 'unitPrice' | 'quantity'>
): BarOrderItem[] {
  if (order.items?.length) return order.items;
  if (order.productId && order.productName) {
    return [
      {
        productId: order.productId,
        productName: order.productName,
        unitPrice: order.unitPrice ?? 0,
        quantity: order.quantity ?? 1,
      },
    ];
  }
  return [];
}

export function barOrderItemsLabel(items: BarOrderItem[]): string {
  return items.map((i) => `${i.productName} x${i.quantity}`).join(', ');
}

export function barProductAvailable(p: BarProduct): boolean {
  if (typeof p.stock === 'number') return p.stock > 0;
  return true;
}

export function compareBarProducts(
  a: SerializedBarProduct,
  b: SerializedBarProduct
): number {
  const sa = a.sortOrder ?? 9999;
  const sb = b.sortOrder ?? 9999;
  if (sa !== sb) return sa - sb;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function serializeBarProduct(p: BarProduct): SerializedBarProduct {
  return {
    id: p.id,
    eventId: p.eventId,
    name: p.name,
    price: p.price,
    active: p.active,
    stock: typeof p.stock === 'number' ? p.stock : null,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toDate().toISOString(),
  };
}

export function serializeBarOrder(o: BarOrder): SerializedBarOrder {
  const items = barOrderItems(o);
  return {
    id: o.id,
    token: o.token,
    eventId: o.eventId,
    items,
    itemsLabel: barOrderItemsLabel(items),
    productId: o.productId,
    productName: o.productName,
    unitPrice: o.unitPrice,
    quantity: o.quantity,
    amount: o.amount,
    buyerName: o.buyerName,
    status: o.status,
    voucherCode: o.voucherCode,
    voucherQrPayload: o.voucherQrPayload,
    voucherStatus: o.voucherStatus,
    usedAt: tsToIso(o.usedAt),
    createdAt: o.createdAt.toDate().toISOString(),
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

export function serializeAccessDay(d: AccessDay): SerializedAccessDay {
  return {
    id: d.id,
    ownerId: d.ownerId,
    clubName: d.clubName,
    date: d.date.toDate().toISOString(),
    location: d.location,
    toleranceMinutes: d.toleranceMinutes,
    active: d.active,
    createdAt: d.createdAt.toDate().toISOString(),
  };
}

export function serializeAccessEvent(e: AccessEvent): SerializedAccessEvent {
  return {
    id: e.id,
    accessDayId: e.accessDayId,
    name: e.name,
    discipline: e.discipline,
    visitingClubName: e.visitingClubName ?? '',
    scheduledStart: e.scheduledStart.toDate().toISOString(),
    scheduledEnd: e.scheduledEnd.toDate().toISOString(),
    entryWindowStart: e.entryWindowStart.toDate().toISOString(),
    entryWindowEnd: e.entryWindowEnd.toDate().toISOString(),
    maxVisitors: e.maxVisitors ?? null,
    active: e.active,
    createdAt: e.createdAt.toDate().toISOString(),
  };
}

export function serializeVisitorInviteLink(l: VisitorInviteLink): SerializedVisitorInviteLink {
  return {
    id: l.id,
    token: l.token,
    accessDayId: l.accessDayId,
    visitingClubLabel: l.visitingClubLabel,
    maxRegistrations: l.maxRegistrations ?? null,
    maxPartySize: l.maxPartySize ?? 10,
    registrationsUsed: l.registrationsUsed,
    expiresAt: l.expiresAt.toDate().toISOString(),
    active: l.active,
    createdAt: l.createdAt.toDate().toISOString(),
  };
}

export function serializeAccessPass(
  p: AccessPass,
  extras?: { accessEventName?: string }
): SerializedAccessPass {
  return {
    id: p.id,
    accessCode: p.accessCode,
    qrPayload: p.qrPayload,
    accessDayId: p.accessDayId,
    accessEventId: p.accessEventId,
    accessEventName: extras?.accessEventName,
    inviteLinkId: p.inviteLinkId,
    groupId: p.groupId,
    personLabel: p.personLabel,
    responsible: p.responsible,
    partySize: p.partySize,
    companionDnis: p.companionDnis,
    mode: p.mode,
    status: p.status,
    enteredAt: tsToIso(p.enteredAt),
    exitedAt: tsToIso(p.exitedAt),
    maxStayUntil: p.maxStayUntil.toDate().toISOString(),
    exitOnTime: p.exitOnTime,
    stayDurationMinutes: p.stayDurationMinutes,
    createdAt: p.createdAt.toDate().toISOString(),
  };
}

export function serializeAccessScan(
  s: AccessScan,
  extras?: { accessEventName?: string }
): SerializedAccessScan {
  return {
    id: s.id,
    passId: s.passId,
    accessDayId: s.accessDayId,
    accessEventId: s.accessEventId,
    accessEventName: extras?.accessEventName,
    scanType: s.scanType,
    scannedAt: s.scannedAt.toDate().toISOString(),
    onTime: s.onTime,
    partySizeAtScan: s.partySizeAtScan,
    responsibleName: s.responsibleName,
    visitingClub: s.visitingClub,
    accessCode: s.accessCode,
  };
}
