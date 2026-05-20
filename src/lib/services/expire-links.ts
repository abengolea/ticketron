import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { hasTimedExpiry } from '@/lib/payment-link-expiry';

/** Marca EXPIRED todos los paymentLinks vencidos y pendientes */
export async function expirePendingPaymentLinks(): Promise<number> {
  const db = getAdminDb();
  const now = Timestamp.now();

  const snapshot = await db
    .collection(COLLECTIONS.paymentLinks)
    .where('status', '==', 'PENDING_PAYMENT')
    .where('expiresAt', '<', now)
    .get();

  if (snapshot.empty) return 0;

  const toExpire = snapshot.docs.filter((doc) => hasTimedExpiry(doc.data()));
  if (toExpire.length === 0) return 0;

  const batch = db.batch();
  toExpire.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'EXPIRED',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return toExpire.length;
}

/** Verifica y marca un link individual si venció */
export async function ensureLinkNotExpired(
  linkId: string
): Promise<'ok' | 'expired'> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.paymentLinks).doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) return 'expired';

  const data = snap.data()!;
  if (data.status !== 'PENDING_PAYMENT') return data.status === 'EXPIRED' ? 'expired' : 'ok';
  if (!hasTimedExpiry(data)) return 'ok';

  const now = Timestamp.now();
  if (data.expiresAt.toMillis() < now.toMillis()) {
    await ref.update({ status: 'EXPIRED', updatedAt: FieldValue.serverTimestamp() });
    return 'expired';
  }
  return 'ok';
}
