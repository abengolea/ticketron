import type { Timestamp } from 'firebase-admin/firestore';

export type UserRole = 'superadmin' | 'producer' | 'dirigente' | 'seller' | 'gate' | 'buyer';

export type QuotaType = 'monthly' | 'lifetime' | 'unlimited';

export type ProducerApprovalStatus = 'pending' | 'approved' | 'rejected';

/** Condición IVA del productor para factura de fees de plataforma */
export type ProducerIvaCondicion =
  | 'responsable_inscripto'
  | 'monotributo'
  | 'consumidor_final';

export interface ProducerBillingProfile {
  ivaCondicion: ProducerIvaCondicion;
  cuit?: string;
  razonSocial?: string;
  domicilio?: string;
}

export type EventFeeChargeStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'waived';

export interface EventFeeCharge {
  id: string;
  eventId: string;
  ownerId: string;
  eventName: string;
  eventDate: Timestamp;
  ticketsIssued: number;
  pricePerTicket: number;
  pricePerEvent: number;
  amount: number;
  status: EventFeeChargeStatus;
  mercadoPagoPreferenceId?: string;
  mercadoPagoInitPoint?: string;
  mercadoPagoPaymentId?: string;
  billingHub?: {
    status: 'issued' | 'pending' | 'failed';
    facturaId?: string | null;
    cae?: string | null;
    tipoComprobante?: string | null;
    error?: string | null;
    updatedAt?: Timestamp;
  };
  paidAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SerializedEventFeeCharge {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  ticketsIssued: number;
  pricePerTicket: number;
  pricePerEvent: number;
  amount: number;
  status: EventFeeChargeStatus;
  mercadoPagoInitPoint?: string;
  paidAt?: string;
  billingHubStatus?: string;
  facturaId?: string;
}

export interface ProducerPlan {
  maxEvents: number;
  quotaType: QuotaType;
  eventsUsed: number;
  quotaPeriodStart: Timestamp;
  /** Fee de plataforma por evento (ARS) */
  pricePerEvent: number;
  /** Fee de plataforma por entrada emitida (ARS) */
  pricePerTicket: number;
  planActive: boolean;
  planNotes?: string;
  createdBy: string;
}

/** Defaults de fees editables desde Super Admin */
export interface PlatformBillingConfig {
  pricePerEvent: number;
  pricePerTicket: number;
  updatedAt?: Timestamp;
  updatedBy?: string;
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
  /** Productores self-service: pendiente hasta que Super Admin apruebe */
  approvalStatus?: ProducerApprovalStatus;
  organizationName?: string;
  phone?: string;
  registrationNotes?: string;
  approvedAt?: Timestamp;
  approvedBy?: string;
  rejectedAt?: Timestamp;
  rejectedBy?: string;
  /** Token de acceso MP del productor (solo server-side vía Admin SDK) */
  mercadoPagoAccessToken?: string;
  /** Datos fiscales para factura de fees Ticketron (Notificas SRL) */
  billingProfile?: ProducerBillingProfile;
  /** Solo dirigentes: nombre del club que representan */
  clubName?: string;
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
  approvalStatus?: ProducerApprovalStatus;
  organizationName?: string;
  phone?: string;
  registrationNotes?: string;
  producerPlan?: {
    maxEvents: number;
    quotaType: QuotaType;
    eventsUsed: number;
    quotaPeriodStart: string;
    pricePerEvent: number;
    pricePerTicket: number;
    planActive: boolean;
    planNotes?: string;
    createdBy: string;
  };
  hasMercadoPago: boolean;
  createdAt: string;
}

export interface SerializedDirigente {
  uid: string;
  email: string;
  displayName: string;
  active: boolean;
  clubName?: string;
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
  access?: {
    passesTotal: number;
    insideNow: number;
    overtime: number;
    exitedOnTime: number;
    exitedLate: number;
  };
}

// ---------- Ticketron Access (control de visitantes) ----------

export type AccessPassMode = 'group' | 'individual';
export type AccessPassStatus =
  | 'generado'
  | 'ingresado'
  | 'egresado'
  | 'vencido'
  | 'excedido'
  | 'anulado';

export type AccessScanType = 'entry' | 'exit';

export type AccessGateValidationResult =
  | 'VALID_ENTRY'
  | 'VALID_EXIT'
  | 'ALREADY_INSIDE'
  | 'ALREADY_EXITED'
  | 'INVALID'
  | 'CANCELLED'
  | 'WRONG_EVENT'
  | 'ENTRY_WINDOW_CLOSED'
  | 'NOT_INSIDE'
  | 'EXPIRED';

export interface AccessResponsible {
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  visitingClub: string;
}

export interface AccessDay {
  id: string;
  ownerId: string;
  clubName: string;
  date: Timestamp;
  location?: string;
  toleranceMinutes: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AccessEvent {
  id: string;
  accessDayId: string;
  name: string;
  discipline?: string;
  visitingClubName: string;
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
  entryWindowStart: Timestamp;
  entryWindowEnd: Timestamp;
  maxVisitors?: number | null;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VisitorInviteLink {
  id: string;
  token: string;
  accessDayId: string;
  accessEventId?: string;
  visitingClubLabel?: string;
  maxRegistrations?: number | null;
  /** Máximo de personas por registro (define el dirigente) */
  maxPartySize: number;
  registrationsUsed: number;
  expiresAt: Timestamp;
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AccessPass {
  id: string;
  accessCode: string;
  qrPayload: string;
  accessDayId: string;
  accessEventId: string;
  inviteLinkId?: string;
  groupId?: string;
  personLabel?: string;
  responsible: AccessResponsible;
  partySize: number;
  companionDnis?: string[];
  mode: AccessPassMode;
  status: AccessPassStatus;
  enteredAt?: Timestamp;
  exitedAt?: Timestamp;
  enteredBy?: string;
  exitedBy?: string;
  maxStayUntil: Timestamp;
  exitOnTime?: boolean;
  stayDurationMinutes?: number;
  confirmationEmailSentAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AccessScan {
  id: string;
  passId: string;
  accessDayId: string;
  accessEventId: string;
  scanType: AccessScanType;
  scannedAt: Timestamp;
  scannedBy: string;
  onTime: boolean;
  partySizeAtScan: number;
  responsibleName: string;
  visitingClub: string;
  accessCode: string;
}

export interface SerializedAccessDay {
  id: string;
  ownerId: string;
  clubName: string;
  date: string;
  location?: string;
  toleranceMinutes: number;
  active: boolean;
  createdAt: string;
}

export interface SerializedAccessEvent {
  id: string;
  accessDayId: string;
  name: string;
  discipline?: string;
  visitingClubName: string;
  scheduledStart: string;
  scheduledEnd: string;
  entryWindowStart: string;
  entryWindowEnd: string;
  maxVisitors: number | null;
  active: boolean;
  createdAt: string;
  /** Máximo permitido al registrar (según link + cupo del partido) */
  partySizeMax?: number;
}

export interface SerializedVisitorInviteLink {
  id: string;
  token: string;
  accessDayId: string;
  visitingClubLabel?: string;
  maxRegistrations: number | null;
  maxPartySize: number;
  registrationsUsed: number;
  expiresAt: string;
  active: boolean;
  createdAt: string;
}

export interface SerializedAccessPass {
  id: string;
  accessCode: string;
  qrPayload: string;
  accessDayId: string;
  accessEventId: string;
  accessEventName?: string;
  inviteLinkId?: string;
  groupId?: string;
  personLabel?: string;
  responsible: AccessResponsible;
  partySize: number;
  companionDnis?: string[];
  mode: AccessPassMode;
  status: AccessPassStatus;
  enteredAt?: string;
  exitedAt?: string;
  maxStayUntil: string;
  exitOnTime?: boolean;
  stayDurationMinutes?: number;
  createdAt: string;
}

export interface SerializedAccessScan {
  id: string;
  passId: string;
  accessDayId: string;
  accessEventId: string;
  accessEventName?: string;
  scanType: AccessScanType;
  scannedAt: string;
  onTime: boolean;
  partySizeAtScan: number;
  responsibleName: string;
  visitingClub: string;
  accessCode: string;
}

export interface AccessDashboardStats {
  passesTotal: number;
  byStatus: Record<AccessPassStatus, number>;
  insideNow: number;
  overtime: number;
  eventsEndedWithPeopleInside: number;
  exitedOnTime: number;
  exitedLate: number;
  totalVisitorsEntered: number;
}

export interface SavedVisitorClub {
  id: string;
  ownerId: string;
  name: string;
  normalizedName: string;
  useCount: number;
  lastUsedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
