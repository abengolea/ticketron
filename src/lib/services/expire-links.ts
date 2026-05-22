import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { hasTimedExpiry } from '@/lib/payment-link-expiry';

/** Verifica y marca un link individual si venció (cortesía / efectivo) */
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
