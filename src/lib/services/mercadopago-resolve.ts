import { getPayment, type MercadoPagoPayment } from '@/lib/mercadopago';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';

export interface ResolvedMercadoPagoPayment {
  payment: MercadoPagoPayment;
  accessToken: string;
  ownerId: string;
}

/**
 * Resuelve un pago MP probando el token de cada productor/superadmin.
 * Necesario porque cada productor usa su propia cuenta MP y el webhook es único.
 */
export async function resolveMercadoPagoPayment(
  paymentId: string
): Promise<ResolvedMercadoPagoPayment | null> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.users)
    .where('role', 'in', ['producer', 'superadmin'])
    .get();

  for (const doc of snap.docs) {
    const token = (doc.data().mercadoPagoAccessToken as string | undefined)?.trim();
    if (!token) continue;

    try {
      const payment = await getPayment(paymentId, token);
      return { payment, accessToken: token, ownerId: doc.id };
    } catch {
      continue;
    }
  }

  return null;
}
