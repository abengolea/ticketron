'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole, canAccessGate } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  createBarProductSchema,
  updateBarProductSchema,
  createBarOrderSchema,
  barValidateSchema,
} from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { createPreference } from '@/lib/mercadopago';
import { serializeBarProduct, serializeBarOrder } from '@/lib/serialize';
import { BAR_ORDER_REF_PREFIX } from '@/lib/services/bar-fulfillment';
import {
  normalizeQrScanInput,
  parseQrPayload,
  qrPayloadMatchesStored,
  verifyQrSignature,
} from '@/lib/qr';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  BarOrder,
  BarProduct,
  BarValidationResult,
  SerializedBarOrder,
  SerializedBarProduct,
} from '@/lib/models';

// ---------- Productos (admin) ----------

export async function listBarProducts(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedBarProduct[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    // Sin orderBy en Firestore: eventId + createdAt requeriría índice compuesto.
    const snap = await getAdminDb()
      .collection(COLLECTIONS.barProducts)
      .where('eventId', '==', eventId)
      .limit(200)
      .get();

    const products = snap.docs
      .map((d) => serializeBarProduct({ id: d.id, ...d.data() } as BarProduct))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return ok(products);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function createBarProduct(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedBarProduct>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const { eventId, name, price } = createBarProductSchema.parse(input);
    const db = getAdminDb();

    const eventSnap = await db.collection(COLLECTIONS.events).doc(eventId).get();
    if (!eventSnap.exists) return fail('Evento no encontrado');

    const now = Timestamp.now();
    const ref = db.collection(COLLECTIONS.barProducts).doc();
    const product: Omit<BarProduct, 'id'> = {
      eventId,
      name,
      price,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(product);

    return ok(serializeBarProduct({ id: ref.id, ...product }));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear producto');
  }
}

export async function updateBarProduct(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const { productId, ...changes } = updateBarProductSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.barProducts).doc(productId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Producto no encontrado');

    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (changes.name !== undefined) updates.name = changes.name;
    if (changes.price !== undefined) updates.price = changes.price;
    if (changes.active !== undefined) updates.active = changes.active;

    await ref.update(updates);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al actualizar producto');
  }
}

export async function listBarOrders(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedBarOrder[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const snap = await getAdminDb()
      .collection(COLLECTIONS.barOrders)
      .where('eventId', '==', eventId)
      .limit(500)
      .get();

    const orders = snap.docs
      .map((d) => serializeBarOrder({ id: d.id, ...d.data() } as BarOrder))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return ok(orders);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

// ---------- Compra (público) ----------

export async function getBarProductPublic(
  eventId: string,
  productId: string
): Promise<
  ActionResult<{ product: SerializedBarProduct; eventName: string }>
> {
  try {
    const db = getAdminDb();
    const [productSnap, eventSnap] = await Promise.all([
      db.collection(COLLECTIONS.barProducts).doc(productId).get(),
      db.collection(COLLECTIONS.events).doc(eventId).get(),
    ]);

    if (!productSnap.exists) return fail('Producto no encontrado');
    const product = { id: productSnap.id, ...productSnap.data() } as BarProduct;
    if (product.eventId !== eventId) return fail('Producto no encontrado');
    if (!product.active) return fail('Este producto no está disponible');

    if (!eventSnap.exists) return fail('Evento no encontrado');
    const event = eventSnap.data()!;
    if (!event.active) return fail('Evento inactivo');

    return ok({
      product: serializeBarProduct(product),
      eventName: event.name as string,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function createBarOrder(
  input: unknown
): Promise<ActionResult<{ initPoint: string; orderToken: string }>> {
  try {
    const parsed = createBarOrderSchema.parse(input);
    const buyerName = parsed.buyerName?.trim() || undefined;
    const db = getAdminDb();

    const [productSnap, eventSnap] = await Promise.all([
      db.collection(COLLECTIONS.barProducts).doc(parsed.productId).get(),
      db.collection(COLLECTIONS.events).doc(parsed.eventId).get(),
    ]);

    if (!productSnap.exists) return fail('Producto no encontrado');
    const product = { id: productSnap.id, ...productSnap.data() } as BarProduct;
    if (product.eventId !== parsed.eventId) return fail('Producto no encontrado');
    if (!product.active) return fail('Este producto no está disponible');

    if (!eventSnap.exists) return fail('Evento no encontrado');
    if (!eventSnap.data()!.active) return fail('Evento inactivo');

    const token = generateSecureToken();
    const ref = db.collection(COLLECTIONS.barOrders).doc();
    const now = Timestamp.now();
    const amount = product.price * parsed.quantity;

    const orderData: Omit<BarOrder, 'id'> = {
      token,
      eventId: parsed.eventId,
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      quantity: parsed.quantity,
      amount,
      ...(buyerName ? { buyerName } : {}),
      status: 'PENDING_PAYMENT',
      createdAt: now,
      updatedAt: now,
    };

    const preference = await createPreference({
      title: `${product.name} x${parsed.quantity} — Barra`,
      unitPrice: product.price,
      quantity: parsed.quantity,
      externalReference: `${BAR_ORDER_REF_PREFIX}${ref.id}`,
      returnPath: `/bar/order/${token}`,
    });

    await ref.set({
      ...orderData,
      mercadoPagoPreferenceId: preference.id,
    });

    const isProd = process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('APP_USR');
    const initPoint = isProd
      ? preference.init_point
      : (preference.sandbox_init_point ?? preference.init_point);

    return ok({ initPoint, orderToken: token });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear la orden');
  }
}

export async function getBarOrderByToken(
  token: string
): Promise<ActionResult<SerializedBarOrder & { eventName: string }>> {
  try {
    if (!token || token.length < 10) return fail('Token inválido');

    const db = getAdminDb();
    const snap = await db
      .collection(COLLECTIONS.barOrders)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return fail('Orden no encontrada');
    const doc = snap.docs[0]!;
    const order = { id: doc.id, ...doc.data() } as BarOrder;

    const eventSnap = await db.collection(COLLECTIONS.events).doc(order.eventId).get();
    const eventName = (eventSnap.data()?.name as string | undefined) ?? '';

    return ok({ ...serializeBarOrder(order), eventName });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

// ---------- Canje en barra (admin / gate) ----------

export interface BarValidationResponse {
  result: BarValidationResult;
  message: string;
  productName?: string;
  quantity?: number;
  buyerName?: string;
  voucherCode?: string;
}

export async function validateBarVoucher(
  idToken: string,
  input: unknown
): Promise<ActionResult<BarValidationResponse>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) {
      return fail('No autorizado para validar en barra');
    }

    const { eventId, qrPayload } = barValidateSchema.parse(input);
    const normalizedPayload = normalizeQrScanInput(qrPayload);
    const parsed = parseQrPayload(normalizedPayload);

    if (!parsed) {
      return ok({ result: 'INVALID', message: 'QR inválido o corrupto' });
    }

    const voucherCode = parsed.ticketCode.trim();
    const db = getAdminDb();

    const lookup = await db
      .collection(COLLECTIONS.barOrders)
      .where('voucherCode', '==', voucherCode)
      .limit(1)
      .get();

    if (lookup.empty) {
      return ok({ result: 'INVALID', message: 'Voucher no encontrado' });
    }

    const storedPayload = lookup.docs[0]!.data().voucherQrPayload as string | undefined;
    const signatureOk =
      verifyQrSignature(voucherCode, parsed.sig) ||
      (typeof storedPayload === 'string' &&
        qrPayloadMatchesStored(normalizedPayload, storedPayload));

    if (!signatureOk) {
      return ok({
        result: 'INVALID',
        message:
          'Firma QR inválida. Verificá que TICKET_SIGNING_SECRET sea el mismo en todos los entornos.',
      });
    }

    const orderRef = lookup.docs[0]!.ref;

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { kind: 'INVALID' as const, message: 'Voucher no encontrado' };
      }

      const order = snap.data() as Omit<BarOrder, 'id'>;
      const base = {
        productName: order.productName,
        quantity: order.quantity,
        buyerName: order.buyerName,
        voucherCode,
      };

      if (order.eventId !== eventId) {
        return {
          kind: 'WRONG_EVENT' as const,
          message: 'Este voucher es de otro evento',
          ...base,
        };
      }

      if (order.status !== 'PAID') {
        return {
          kind: 'NOT_PAID' as const,
          message: `La orden no está pagada (estado: ${order.status})`,
          ...base,
        };
      }

      if (order.voucherStatus === 'USED') {
        const usedAt = order.usedAt;
        return {
          kind: 'ALREADY_USED' as const,
          message: `Ya canjeado el ${usedAt?.toDate?.()?.toLocaleString('es-AR') ?? 'anteriormente'}`,
          ...base,
        };
      }

      tx.update(orderRef, {
        voucherStatus: 'USED',
        usedAt: Timestamp.now(),
        usedBy: user.uid,
        updatedAt: Timestamp.now(),
      });

      return {
        kind: 'VALID' as const,
        message: `Entregar: ${order.productName} x${order.quantity}`,
        ...base,
      };
    });

    return ok({
      result: outcome.kind,
      message: outcome.message,
      productName: 'productName' in outcome ? outcome.productName : undefined,
      quantity: 'quantity' in outcome ? outcome.quantity : undefined,
      buyerName: 'buyerName' in outcome ? outcome.buyerName : undefined,
      voucherCode: 'voucherCode' in outcome ? outcome.voucherCode : undefined,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error de validación');
  }
}
