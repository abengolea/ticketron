import type { Timestamp } from 'firebase-admin/firestore';

export type UserRole = 'superadmin' | 'producer' | 'seller' | 'gate' | 'buyer';

export type QuotaType = 'monthly' | 'lifetime' | 'unlimited';

export interface ProducerPlan {
  maxEvents: number;
  quotaType: QuotaType;
  eventsUsed: number;
  quotaPeriodStart: Timestamp;
  pricePerEvent: number;
  planActive: boolean;
  planNotes?: string;
  createdBy: string;
}

export type PaymentLinkStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export type PaymentLinkType = 'payment' | 'complimentary' | 'cash';

export type PlatformTicketStatus = 'VALID' | 'USED' | 'CANCELLED';

export type GateValidationResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'CANCELLED'
  | 'WRONG_EVENT';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  /** Solo productores: plan de cupo y facturación */
  producerPlan?: ProducerPlan;
  /** Token de acceso MP del productor (solo server-side vía Admin SDK) */
  mercadoPagoAccessToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlatformEvent {
  id: string;
  name: string;
  date: Timestamp;
  location?: string;
  active: boolean;
  capacity: number;
  sold: number;
  price: number;
  /** UID del productor o superadmin dueño del evento */
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SellerEventAccess {
  id: string;
  sellerId: string;
  eventId: string;
  quota: number;
  sold: number;
  active: boolean;
  commissionRate?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentLink {
  id: string;
  token: string;
  eventId: string;
  sellerId: string;
  ticketQuantity: number;
  /** Referencia interna (ej. a quién se envió el link). No la ve el comprador. */
  recipientLabel?: string;
  linkType?: PaymentLinkType;
  complimentaryMessage?: string;
  buyerName?: string;
  buyerLastName?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  amount: number;
  status: PaymentLinkStatus;
  expiresAt: Timestamp;
  mercadoPagoPreferenceId?: string;
  mercadoPagoPaymentId?: string;
  confirmationEmailSentAt?: Timestamp;
  archived?: boolean;
  archivedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlatformTicket {
  id: string;
  ticketCode: string;
  paymentLinkId: string;
  eventId: string;
  sellerId: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  status: PlatformTicketStatus;
  qrPayload: string;
  usedAt?: Timestamp;
  usedBy?: string;
  archived?: boolean;
  archivedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface SerializedEvent {
  id: string;
  name: string;
  date: string;
  location?: string;
  active: boolean;
  capacity: number;
  sold: number;
  price: number;
  ownerId?: string;
}

export interface SerializedProducer {
  uid: string;
  email: string;
  displayName: string;
  active: boolean;
  producerPlan?: {
    maxEvents: number;
    quotaType: QuotaType;
    eventsUsed: number;
    quotaPeriodStart: string;
    pricePerEvent: number;
    planActive: boolean;
    planNotes?: string;
    createdBy: string;
  };
  hasMercadoPago: boolean;
  createdAt: string;
}

export interface SerializedPaymentLink {
  id: string;
  token: string;
  eventId: string;
  sellerId: string;
  ticketQuantity: number;
  recipientLabel?: string;
  linkType?: PaymentLinkType;
  complimentaryMessage?: string;
  buyerName?: string;
  buyerLastName?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  amount: number;
  status: PaymentLinkStatus;
  expiresAt: string;
  mercadoPagoPreferenceId?: string;
  mercadoPagoPaymentId?: string;
  archived?: boolean;
  createdAt: string;
}

export interface SerializedTicket {
  id: string;
  ticketCode: string;
  paymentLinkId: string;
  eventId: string;
  sellerId: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  status: PlatformTicketStatus;
  qrPayload: string;
  usedAt?: string;
  archived?: boolean;
  createdAt: string;
}

export interface SerializedTicketWithPayment extends SerializedTicket {
  paymentFormatted: string;
  paymentAmount: number;
  paymentMethod: 'mercadopago' | 'cash' | 'complimentary';
}

export interface SerializedSellerAccess {
  id: string;
  sellerId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  quota: number;
  sold: number;
  /** Entradas reservadas por links de pago pendientes (no vendidas aún). */
  pendingPayment: number;
  /** Vendidas + reservadas en links pendientes. */
  issued: number;
  remaining: number;
  price: number;
  active: boolean;
}

export type BarOrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';

export type BarVoucherStatus = 'VALID' | 'USED';

export type BarValidationResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'NOT_PAID'
  | 'WRONG_EVENT';

export interface BarOrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface BarProduct {
  id: string;
  eventId: string;
  name: string;
  price: number;
  active: boolean;
  /** null = stock ilimitado */
  stock?: number | null;
  sortOrder?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BarOrder {
  id: string;
  /** Token URL-safe para la página pública del voucher (/bar/order/[token]) */
  token: string;
  eventId: string;
  /** Carrito multi-producto (preferido) */
  items?: BarOrderItem[];
  /** Campos legacy (órdenes de un solo producto) */
  productId?: string;
  productName?: string;
  unitPrice?: number;
  quantity?: number;
  amount: number;
  buyerName?: string;
  status: BarOrderStatus;
  mercadoPagoPreferenceId?: string;
  mercadoPagoPaymentId?: string;
  voucherCode?: string;
  voucherQrPayload?: string;
  voucherStatus?: BarVoucherStatus;
  usedAt?: Timestamp;
  usedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SerializedBarProduct {
  id: string;
  eventId: string;
  name: string;
  price: number;
  active: boolean;
  stock: number | null;
  sortOrder?: number;
  createdAt: string;
}

export interface SerializedBarOrder {
  id: string;
  token: string;
  eventId: string;
  items?: BarOrderItem[];
  itemsLabel: string;
  /** Legacy */
  productId?: string;
  productName?: string;
  unitPrice?: number;
  quantity?: number;
  amount: number;
  buyerName?: string;
  status: BarOrderStatus;
  voucherCode?: string;
  voucherQrPayload?: string;
  voucherStatus?: BarVoucherStatus;
  usedAt?: string;
  createdAt: string;
}

export interface EventReservationStats {
  capacity: number;
  sold: number;
  pendingPayment: number;
  issued: number;
  remainingForLinks: number;
}

export interface EventPostStatsSellerRow {
  sellerId: string;
  sellerName: string;
  sold: number;
  used: number;
  revenue: number;
}

export interface EventPostStatsPaymentMethodRow {
  count: number;
  revenue: number;
}

export interface EventPostStatsEntryHour {
  hour: string;
  label: string;
  count: number;
}

export interface EventPostStats {
  event: SerializedEvent;
  isPastEvent: boolean;
  tickets: {
    total: number;
    active: number;
    used: number;
    valid: number;
    cancelled: number;
    archived: number;
  };
  attendanceRate: number;
  noShowCount: number;
  revenue: {
    collected: number;
    pending: number;
    byMethod: {
      mercadopago: EventPostStatsPaymentMethodRow;
      cash: EventPostStatsPaymentMethodRow;
      complimentary: EventPostStatsPaymentMethodRow;
    };
  };
  bySeller: EventPostStatsSellerRow[];
  entryTimeline: EventPostStatsEntryHour[];
  peakEntryHour: string | null;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  bar: {
    revenue: number;
    ordersPaid: number;
    vouchersRedeemed: number;
    vouchersPending: number;
  };
}
