import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { generateTicketCode } from '@/lib/tokens';
import { buildQrPayload } from '@/lib/qr';
import type { BarOrder } from '@/lib/models';

/** Prefijo en external_reference de MP para distinguir órdenes de bar de paymentLinks */
export const BAR_ORDER_REF_PREFIX = 'bar:';

export function parseBarOrderExternalReference(
  externalReference: string | undefined
): string | null {
  if (!externalReference?.startsWith(BAR_ORDER_REF_PREFIX)) return null;
  const id = externalReference.slice(BAR_ORDER_REF_PREFIX.length).trim();
  return id || null;
}

/**
 * Marca la orden de bar como pagada y emite el voucher QR — IDEMPOTENTE.
 * Si el webhook llega varias veces, no regenera el voucher.
 */
export async function fulfillBarOrder(
  barOrderId: string,
  mercadoPagoPaymentId: string
): Promise<{ created: boolean; voucherCode?: string }> {
  const db = getAdminDb();
  const orderRef = db.collection(COLLECTIONS.barOrders).doc(barOrderId);

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new Error(`BarOrder no encontrada: ${barOrderId}`);
    }

    const order = snap.data() as Omit<BarOrder, 'id'>;

    if (order.status === 'CANCELLED') {
      throw new Error('Orden de bar cancelada, no se emite voucher');
    }

    if (order.status === 'PAID' && order.voucherCode) {
      return { created: false, voucherCode: order.voucherCode };
    }

    const voucherCode = order.voucherCode ?? generateTicketCode();
    const voucherQrPayload = order.voucherQrPayload ?? buildQrPayload(voucherCode);

    tx.update(orderRef, {
      status: 'PAID',
      mercadoPagoPaymentId,
      voucherCode,
      voucherQrPayload,
      voucherStatus: order.voucherStatus ?? 'VALID',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { created: true, voucherCode };
  });

  return outcome;
}

/** Busca orden de bar por external_reference (bar:{id}) o por preferenceId */
export async function findBarOrderForPayment(
  preferenceId: string | undefined,
  externalReference: string | undefined
): Promise<BarOrder | null> {
  const db = getAdminDb();

  const orderId = parseBarOrderExternalReference(externalReference);
  if (orderId) {
    const doc = await db.collection(COLLECTIONS.barOrders).doc(orderId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() } as BarOrder;
  }

  if (preferenceId) {
    const q = await db
      .collection(COLLECTIONS.barOrders)
      .where('mercadoPagoPreferenceId', '==', preferenceId)
      .limit(1)
      .get();
    if (!q.empty) {
      const d = q.docs[0]!;
      return { id: d.id, ...d.data() } as BarOrder;
    }
  }

  return null;
}
