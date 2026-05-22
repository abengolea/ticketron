import type { Timestamp } from 'firebase-admin/firestore';

export type UserRole = 'admin' | 'seller' | 'gate' | 'buyer';

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

export interface EventReservationStats {
  capacity: number;
  sold: number;
  pendingPayment: number;
  issued: number;
  remainingForLinks: number;
}
