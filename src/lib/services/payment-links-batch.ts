import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { serializePaymentLink } from '@/lib/serialize';
import type { PaymentLink, SerializedPaymentLink } from '@/lib/models';

/** Carga payment links por id (lotes de 30, límite de Firestore por consulta `in`). */
export async function loadSerializedPaymentLinksByIds(
  linkIds: string[]
): Promise<Map<string, SerializedPaymentLink>> {
  const unique = [...new Set(linkIds.filter(Boolean))];
  const map = new Map<string, SerializedPaymentLink>();
  if (unique.length === 0) return map;

  const db = getAdminDb();
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const snaps = await Promise.all(
      batch.map((id) => db.collection(COLLECTIONS.paymentLinks).doc(id).get())
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const link = { id: snap.id, ...snap.data() } as PaymentLink;
      map.set(link.id, serializePaymentLink(link));
    }
  }
  return map;
}
