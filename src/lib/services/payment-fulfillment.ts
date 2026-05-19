import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { issueTicketsForLink } from '@/lib/services/issue-tickets';
import type { PaymentLink, PlatformTicket } from '@/lib/models';

/**
 * Emite tickets tras pago aprobado — IDEMPOTENTE.
 * Crea tantos tickets como indique ticketQuantity en el link.
 */
export async function fulfillPaymentLink(
  paymentLinkId: string,
  mercadoPagoPaymentId: string
): Promise<{ created: boolean; ticketCodes?: string[] }> {
  const db = getAdminDb();

  const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    throw new Error(`PaymentLink no encontrado: ${paymentLinkId}`);
  }

  const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;

  if (link.linkType === 'complimentary' || link.linkType === 'cash') {
    throw new Error('No se puede fulfill este link vía Mercado Pago');
  }

  const existingTickets = await db
    .collection(COLLECTIONS.tickets)
    .where('paymentLinkId', '==', paymentLinkId)
    .get();

  const ticketQuantity = link.ticketQuantity ?? 1;

  if (existingTickets.size >= ticketQuantity && link.status === 'PAID') {
    return {
      created: false,
      ticketCodes: existingTickets.docs.map(
        (d) => (d.data() as PlatformTicket).ticketCode
      ),
    };
  }

  if (link.status === 'CANCELLED' || link.status === 'EXPIRED') {
    throw new Error(`PaymentLink en estado ${link.status}, no se emite ticket`);
  }

  const now = Timestamp.now();
  if (link.expiresAt.toMillis() < now.toMillis() && link.status === 'PENDING_PAYMENT') {
    await linkRef.update({ status: 'EXPIRED', updatedAt: FieldValue.serverTimestamp() });
    throw new Error('PaymentLink vencido');
  }

  if (link.status !== 'PAID') {
    await linkRef.update({
      status: 'PAID',
      mercadoPagoPaymentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (mercadoPagoPaymentId) {
    await linkRef.update({
      mercadoPagoPaymentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const result = await issueTicketsForLink(paymentLinkId);
  return { created: result.created, ticketCodes: result.ticketCodes };
}

/** Busca paymentLink por preferenceId o external_reference (paymentLinkId) */
export async function findPaymentLinkForPayment(
  preferenceId: string | undefined,
  externalReference: string | undefined
): Promise<PaymentLink | null> {
  const db = getAdminDb();

  if (externalReference) {
    const doc = await db.collection(COLLECTIONS.paymentLinks).doc(externalReference).get();
    if (doc.exists) return { id: doc.id, ...doc.data() } as PaymentLink;
  }

  if (preferenceId) {
    const q = await db
      .collection(COLLECTIONS.paymentLinks)
      .where('mercadoPagoPreferenceId', '==', preferenceId)
      .limit(1)
      .get();
    if (!q.empty) {
      const d = q.docs[0]!;
      return { id: d.id, ...d.data() } as PaymentLink;
    }
  }

  return null;
}
