import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase-admin';
import { isPaymentLinkAwaitingPayment } from '@/lib/payment-link-utils';
import type { PaymentLink } from '@/lib/models';

export { isPaymentLinkAwaitingPayment };

export async function sumPendingPaymentReservations(
  db: Firestore,
  filters: { eventId: string; sellerId?: string }
): Promise<number> {
  let query = db
    .collection(COLLECTIONS.paymentLinks)
    .where('eventId', '==', filters.eventId)
    .where('status', '==', 'PENDING_PAYMENT');

  if (filters.sellerId) {
    query = query.where('sellerId', '==', filters.sellerId);
  }

  const snap = await query.get();
  return snap.docs.reduce((sum, doc) => {
    const data = doc.data() as PaymentLink;
    if (!isPaymentLinkAwaitingPayment(data)) return sum;
    return sum + (data.ticketQuantity ?? 1);
  }, 0);
}
