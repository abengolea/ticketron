'use server';

import { Timestamp, type Query } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  createPaymentLinkSchema,
  buyerCheckoutSchema,
  cancelPaymentLinkSchema,
  archivePaymentLinkSchema,
} from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { createPreference } from '@/lib/mercadopago';
import { serializePaymentLink } from '@/lib/serialize';
import { ensureLinkNotExpired } from '@/lib/services/expire-links';
import { PAYMENT_LINK_INDEFINITE_EXPIRES_AT } from '@/lib/payment-link-expiry';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { PaymentLink, SerializedPaymentLink } from '@/lib/models';

export async function createPaymentLink(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ checkoutUrl: string; link: SerializedPaymentLink }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'seller', 'admin');

    const { eventId, ticketQuantity } = createPaymentLinkSchema.parse(input);
    const db = getAdminDb();

    const eventSnap = await db.collection(COLLECTIONS.events).doc(eventId).get();
    if (!eventSnap.exists) return fail('Evento no encontrado');
    const event = eventSnap.data()!;
    if (!event.active) return fail('Evento inactivo');

    const remainingCapacity = event.capacity - event.sold;
    if (ticketQuantity > remainingCapacity) {
      return fail(`Solo quedan ${remainingCapacity} entradas disponibles`);
    }

    if (user.role === 'seller') {
      const accessSnap = await db
        .collection(COLLECTIONS.sellerEventAccess)
        .where('sellerId', '==', user.uid)
        .where('eventId', '==', eventId)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (accessSnap.empty) return fail('No tenés acceso a este evento');
      const access = accessSnap.docs[0]!.data();
      const sellerRemaining = access.quota - access.sold;
      if (ticketQuantity > sellerRemaining) {
        return fail(`Tu cupo permite vender hasta ${sellerRemaining} entradas más`);
      }
    }

    const token = generateSecureToken();
    const expiresAt = PAYMENT_LINK_INDEFINITE_EXPIRES_AT;
    const ref = db.collection(COLLECTIONS.paymentLinks).doc();
    const now = Timestamp.now();
    const amount = event.price * ticketQuantity;

    const linkData: Omit<PaymentLink, 'id'> = {
      token,
      eventId,
      sellerId: user.uid,
      ticketQuantity,
      linkType: 'payment',
      amount,
      status: 'PENDING_PAYMENT',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    const preference = await createPreference({
      title: `${event.name} (${ticketQuantity} entrada${ticketQuantity > 1 ? 's' : ''})`,
      unitPrice: event.price,
      quantity: ticketQuantity,
      externalReference: ref.id,
      checkoutToken: token,
    });

    await ref.set({
      ...linkData,
      mercadoPagoPreferenceId: preference.id,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
    const checkoutUrl = `${appUrl}/checkout/${token}`;

    return ok({
      checkoutUrl,
      link: serializePaymentLink({
        id: ref.id,
        ...linkData,
        mercadoPagoPreferenceId: preference.id,
      }),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear link');
  }
}

export async function listSellerPaymentLinks(
  idToken: string,
  eventId?: string
): Promise<ActionResult<SerializedPaymentLink[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'seller');

    let query: Query = getAdminDb()
      .collection(COLLECTIONS.paymentLinks)
      .where('sellerId', '==', user.uid);

    if (eventId) query = query.where('eventId', '==', eventId);

    const snap = await query.orderBy('createdAt', 'desc').limit(100).get();
    const links = snap.docs.map((d) =>
      serializePaymentLink({ id: d.id, ...d.data() } as PaymentLink)
    );
    return ok(links);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getCheckoutByToken(
  token: string
): Promise<
  ActionResult<{
    link: SerializedPaymentLink;
    eventName: string;
    eventDate: string;
    eventLocation?: string;
    unitPrice: number;
    initPoint?: string;
  }>
> {
  try {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.paymentLinks)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return fail('Link inválido o no encontrado', 'INVALID');

    const doc = snap.docs[0]!;
    const link = { id: doc.id, ...doc.data() } as PaymentLink;

    const expiry = await ensureLinkNotExpired(link.id);
    if (expiry === 'expired') {
      return fail('Este link de pago venció', 'EXPIRED');
    }

    const eventSnap = await getAdminDb().collection(COLLECTIONS.events).doc(link.eventId).get();
    if (!eventSnap.exists) return fail('Evento no encontrado');
    const event = eventSnap.data()!;

    if (link.status === 'PAID') {
      return fail('Este link ya fue pagado', 'PAID');
    }
    if (link.status === 'CANCELLED') {
      return fail('Este link fue cancelado', 'CANCELLED');
    }
    if (link.status === 'EXPIRED') {
      return fail('Este link venció', 'EXPIRED');
    }

    return ok({
      link: serializePaymentLink(link),
      eventName: event.name,
      eventDate: event.date.toDate().toISOString(),
      eventLocation: event.location,
      unitPrice: event.price,
      initPoint: undefined,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function updateCheckoutBuyer(
  token: string,
  input: unknown
): Promise<ActionResult<{ preferenceInitPoint: string }>> {
  try {
    const parsed = buyerCheckoutSchema.parse(input);
    const { buyerEmailConfirm: _confirm, ...buyer } = parsed;
    const buyerEmail = buyer.buyerEmail.toLowerCase();
    const snap = await getAdminDb()
      .collection(COLLECTIONS.paymentLinks)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return fail('Link inválido');

    const doc = snap.docs[0]!;
    const link = doc.data() as PaymentLink;

    if (link.status !== 'PENDING_PAYMENT') {
      return fail(`Link en estado ${link.status}`);
    }

    const expiry = await ensureLinkNotExpired(doc.id);
    if (expiry === 'expired') return fail('Link vencido', 'EXPIRED');

    await doc.ref.update({
      buyerName: buyer.buyerName,
      buyerLastName: buyer.buyerLastName,
      buyerPhone: buyer.buyerPhone || null,
      buyerEmail,
      updatedAt: Timestamp.now(),
    });

    const eventSnap = await getAdminDb().collection(COLLECTIONS.events).doc(link.eventId).get();
    const event = eventSnap.data()!;
    const ticketQuantity = link.ticketQuantity ?? 1;

    const preference = await createPreference({
      title: `${event.name} (${ticketQuantity} entrada${ticketQuantity > 1 ? 's' : ''})`,
      unitPrice: event.price,
      quantity: ticketQuantity,
      externalReference: doc.id,
      payerEmail: buyerEmail,
      checkoutToken: token,
    });

    await doc.ref.update({ mercadoPagoPreferenceId: preference.id });

    const isProd = process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('APP_USR');
    const initPoint = isProd ? preference.init_point : (preference.sandbox_init_point ?? preference.init_point);

    return ok({ preferenceInitPoint: initPoint });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function cancelPaymentLink(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin', 'seller');

    const { paymentLinkId } = cancelPaymentLinkSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Link no encontrado');

    const link = snap.data()!;
    if (user.role === 'seller' && link.sellerId !== user.uid) {
      return fail('No autorizado');
    }
    if (link.status === 'PAID') return fail('No se puede cancelar un link ya pagado');

    await ref.update({ status: 'CANCELLED', updatedAt: Timestamp.now() });
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function archivePaymentLink(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const { paymentLinkId } = archivePaymentLinkSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Link no encontrado');

    const link = snap.data()!;
    if (link.archived) return ok(undefined);

    await ref.update({
      archived: true,
      archivedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function listSalesAdmin(
  idToken: string,
  filters?: { eventId?: string; sellerId?: string; includeArchived?: boolean }
): Promise<ActionResult<SerializedPaymentLink[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    let query: Query = getAdminDb().collection(COLLECTIONS.paymentLinks);
    if (filters?.eventId) query = query.where('eventId', '==', filters.eventId);
    if (filters?.sellerId) query = query.where('sellerId', '==', filters.sellerId);

    const snap = await query.orderBy('createdAt', 'desc').limit(500).get();
    let links = snap.docs.map((d) =>
      serializePaymentLink({ id: d.id, ...d.data() } as PaymentLink)
    );
    if (!filters?.includeArchived) {
      links = links.filter((l) => !l.archived);
    }
    return ok(links);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
