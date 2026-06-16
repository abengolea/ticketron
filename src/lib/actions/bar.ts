'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireManageEvents, canAccessGate } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  createBarProductSchema,
  updateBarProductSchema,
  createBarOrderSchema,
  barValidateSchema,
  setBarProductActiveSchema,
  reorderBarProductsSchema,
  redeemBarOrderSchema,
} from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { createPreference, isProdToken } from '@/lib/mercadopago';
import {
  serializeBarProduct,
  serializeBarOrder,
  barOrderItems,
  barOrderItemsLabel,
  barProductAvailable,
  compareBarProducts,
} from '@/lib/serialize';
import { BAR_ORDER_REF_PREFIX } from '@/lib/services/bar-fulfillment';
import {
  normalizeQrScanInput,
  parseQrPayload,
  qrPayloadMatchesStored,
  verifyQrSignature,
} from '@/lib/qr';
import { requireEventAccess, getMercadoPagoTokenForEvent } from '@/lib/tenant';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  BarOrder,
  BarOrderItem,
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
    requireManageEvents(user);
    await requireEventAccess(user, eventId);

    // Sin orderBy en Firestore: eventId + createdAt requeriría índice compuesto.
    const snap = await getAdminDb()
      .collection(COLLECTIONS.barProducts)
      .where('eventId', '==', eventId)
      .limit(200)
      .get();

    const products = snap.docs
      .map((d) => serializeBarProduct({ id: d.id, ...d.data() } as BarProduct))
      .sort(compareBarProducts);
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
    requireManageEvents(user);

    const { eventId, name, price, stock } = createBarProductSchema.parse(input);
    await requireEventAccess(user, eventId);
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
      stock: stock ?? null,
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
    requireManageEvents(user);

    const { productId, ...changes } = updateBarProductSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.barProducts).doc(productId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Producto no encontrado');

    await requireEventAccess(user, snap.data()!.eventId as string);

    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (changes.name !== undefined) updates.name = changes.name;
    if (changes.price !== undefined) updates.price = changes.price;
    if (changes.active !== undefined) updates.active = changes.active;
    if (changes.stock !== undefined) updates.stock = changes.stock;

    await ref.update(updates);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al actualizar producto');
  }
}

/** Guarda el orden del menú: el índice de cada producto en la lista define su posición */
export async function reorderBarProducts(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const { eventId, productIds } = reorderBarProductsSchema.parse(input);
    await requireEventAccess(user, eventId);
    const db = getAdminDb();

    const refs = productIds.map((id) => db.collection(COLLECTIONS.barProducts).doc(id));
    const snaps = await db.getAll(...refs);

    const batch = db.batch();
    const now = Timestamp.now();
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i]!;
      if (!snap.exists || snap.data()!.eventId !== eventId) {
        return fail('Producto no encontrado');
      }
      batch.update(snap.ref, { sortOrder: i, updatedAt: now });
    }
    await batch.commit();

    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al reordenar productos');
  }
}

// ---------- Stock (admin / gestor de barra) ----------

/** Lista productos del evento para el personal de barra (admin o gate) */
export async function listBarProductsStaff(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedBarProduct[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) return fail('No autorizado');

    const snap = await getAdminDb()
      .collection(COLLECTIONS.barProducts)
      .where('eventId', '==', eventId)
      .limit(200)
      .get();

    const products = snap.docs
      .map((d) => serializeBarProduct({ id: d.id, ...d.data() } as BarProduct))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return ok(products);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

/** Activa/desactiva un producto (sin stock). Permitido a admin y gestor de barra (gate). */
export async function setBarProductActive(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) return fail('No autorizado');

    const { productId, active } = setBarProductActiveSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.barProducts).doc(productId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Producto no encontrado');

    await ref.update({ active, updatedAt: Timestamp.now() });
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al actualizar producto');
  }
}

/** Órdenes de bar del evento — para admin (pestaña Bar) y jefe de barra (gate) */
export async function listBarOrders(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedBarOrder[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) return fail('No autorizado');

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

export async function listBarProductsPublic(
  eventId: string
): Promise<ActionResult<{ products: SerializedBarProduct[]; eventName: string }>> {
  try {
    const db = getAdminDb();
    const eventSnap = await db.collection(COLLECTIONS.events).doc(eventId).get();
    if (!eventSnap.exists) return fail('Evento no encontrado');
    const event = eventSnap.data()!;
    if (!event.active) return fail('Evento inactivo');

    const snap = await db
      .collection(COLLECTIONS.barProducts)
      .where('eventId', '==', eventId)
      .where('active', '==', true)
      .limit(200)
      .get();

    const products = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as BarProduct)
      .filter(barProductAvailable)
      .map(serializeBarProduct)
      .sort(compareBarProducts);

    return ok({ products, eventName: event.name as string });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

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
    if (!barProductAvailable(product)) return fail('Este producto está agotado');

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
    const buyerName = parsed.buyerName.trim();
    const db = getAdminDb();

    // Consolidar duplicados (mismo producto repetido en el carrito)
    const quantityByProduct = new Map<string, number>();
    for (const item of parsed.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }
    const productIds = [...quantityByProduct.keys()];

    const [eventSnap, ...productSnaps] = await Promise.all([
      db.collection(COLLECTIONS.events).doc(parsed.eventId).get(),
      ...productIds.map((id) => db.collection(COLLECTIONS.barProducts).doc(id).get()),
    ]);

    if (!eventSnap.exists) return fail('Evento no encontrado');
    if (!eventSnap.data()!.active) return fail('Evento inactivo');

    const items: BarOrderItem[] = [];
    for (const snap of productSnaps) {
      if (!snap.exists) return fail('Producto no encontrado');
      const product = { id: snap.id, ...snap.data() } as BarProduct;
      if (product.eventId !== parsed.eventId) return fail('Producto no encontrado');
      if (!product.active) return fail(`"${product.name}" ya no está disponible`);
      const requested = quantityByProduct.get(product.id)!;
      if (typeof product.stock === 'number' && product.stock < requested) {
        return fail(
          product.stock <= 0
            ? `"${product.name}" está agotado`
            : `De "${product.name}" quedan solo ${product.stock} unidades`
        );
      }
      items.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: requested,
      });
    }

    const token = generateSecureToken();
    const ref = db.collection(COLLECTIONS.barOrders).doc();
    const now = Timestamp.now();
    const amount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const orderData: Omit<BarOrder, 'id'> = {
      token,
      eventId: parsed.eventId,
      items,
      amount,
      ...(buyerName ? { buyerName } : {}),
      status: 'PENDING_PAYMENT',
      createdAt: now,
      updatedAt: now,
    };

    const mpToken = await getMercadoPagoTokenForEvent(parsed.eventId);

    const preference = await createPreference(
      {
        title: 'Barra',
        unitPrice: amount,
        items: items.map((i) => ({
          title: `${i.productName} — Barra`,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
        })),
        externalReference: `${BAR_ORDER_REF_PREFIX}${ref.id}`,
        returnPath: `/bar/order/${token}`,
      },
      mpToken
    );

    await ref.set({
      ...orderData,
      mercadoPagoPreferenceId: preference.id,
    });

    const initPoint = isProdToken(mpToken)
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

// ---------- Entrega manual por nombre (admin / gate) ----------

/** Pedidos pagados sin entregar, para que la barra entregue por nombre */
export async function listPendingBarOrdersStaff(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedBarOrder[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) return fail('No autorizado');

    const snap = await getAdminDb()
      .collection(COLLECTIONS.barOrders)
      .where('eventId', '==', eventId)
      .where('status', '==', 'PAID')
      .limit(500)
      .get();

    const orders = snap.docs
      .map((d) => serializeBarOrder({ id: d.id, ...d.data() } as BarOrder))
      .filter((o) => o.voucherStatus !== 'USED')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return ok(orders);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

/** Marca un pedido como entregado sin escanear el QR (entrega por nombre) */
export async function redeemBarOrderManually(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ itemsLabel: string; buyerName?: string }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) return fail('No autorizado');

    const { orderId } = redeemBarOrderSchema.parse(input);
    const db = getAdminDb();
    const orderRef = db.collection(COLLECTIONS.barOrders).doc(orderId);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return { error: 'Pedido no encontrado' };

      const order = snap.data() as Omit<BarOrder, 'id'>;
      if (order.status !== 'PAID') {
        return { error: `El pedido no está pagado (estado: ${order.status})` };
      }
      if (order.voucherStatus === 'USED') {
        const usedAt = order.usedAt;
        return {
          error: `Ya entregado el ${usedAt?.toDate?.()?.toLocaleString('es-AR') ?? 'anteriormente'}`,
        };
      }

      tx.update(orderRef, {
        voucherStatus: 'USED',
        usedAt: Timestamp.now(),
        usedBy: user.uid,
        updatedAt: Timestamp.now(),
      });

      return {
        itemsLabel: barOrderItemsLabel(barOrderItems(order)),
        buyerName: order.buyerName,
      };
    });

    if ('error' in outcome) return fail(outcome.error!);
    return ok({ itemsLabel: outcome.itemsLabel!, buyerName: outcome.buyerName });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al entregar pedido');
  }
}

// ---------- Canje en barra (admin / gate) ----------

export interface BarValidationResponse {
  result: BarValidationResult;
  message: string;
  items?: BarOrderItem[];
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
      const items = barOrderItems(order);
      const base = {
        items,
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
        message: `Entregar: ${barOrderItemsLabel(items)}`,
        ...base,
      };
    });

    return ok({
      result: outcome.kind,
      message: outcome.message,
      items: 'items' in outcome ? outcome.items : undefined,
      buyerName: 'buyerName' in outcome ? outcome.buyerName : undefined,
      voucherCode: 'voucherCode' in outcome ? outcome.voucherCode : undefined,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error de validación');
  }
}
