'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createCashSaleSchema } from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { serializePaymentLink } from '@/lib/serialize';
import { issueTicketsForLink } from '@/lib/services/issue-tickets';
import { sumPendingPaymentReservations } from '@/lib/services/payment-link-reservations';
import { sendPurchaseConfirmationEmail } from '@/lib/services/purchase-confirmation-email';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { PaymentLink, SerializedPaymentLink } from '@/lib/models';

export async function createCashSale(
  idToken: string,
  input: unknown
): Promise<
  ActionResult<{
    ticketsUrl: string;
    link: SerializedPaymentLink;
    emailSent: boolean;
    emailError?: string;
  }>
> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'seller', 'producer', 'superadmin');

    const parsed = createCashSaleSchema.parse(input);
    const {
      eventId,
      ticketQuantity,
      buyerName,
      buyerLastName,
      buyerPhone,
      buyerEmail,
      sendEmail,
    } = parsed;

    const db = getAdminDb();
    const eventSnap = await db.collection(COLLECTIONS.events).doc(eventId).get();
    if (!eventSnap.exists) return fail('Evento no encontrado');
    const event = eventSnap.data()!;
    if (!event.active) return fail('Evento inactivo');

    const pendingEvent = await sumPendingPaymentReservations(db, { eventId });
    const issuedEvent = (event.sold ?? 0) + pendingEvent;
    const remainingCapacity = event.capacity - issuedEvent;
    if (ticketQuantity > remainingCapacity) {
      if (remainingCapacity <= 0) {
        return fail('Cupo de entradas emitidas agotado.');
      }
      return fail(
        `Solo quedan ${remainingCapacity} entradas para emitir (${pendingEvent} en links sin pagar)`
      );
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
      const pendingSeller = await sumPendingPaymentReservations(db, {
        eventId,
        sellerId: user.uid,
      });
      const issuedSeller = (access.sold ?? 0) + pendingSeller;
      const sellerRemaining = access.quota - issuedSeller;
      if (ticketQuantity > sellerRemaining) {
        if (sellerRemaining <= 0) {
          return fail('Tu cupo de entradas emitidas está agotado.');
        }
        return fail(
          `Tu cupo permite emitir hasta ${sellerRemaining} entradas más (${pendingSeller} en links sin pagar)`
        );
      }
    }

    const token = generateSecureToken();
    const ref = db.collection(COLLECTIONS.paymentLinks).doc();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const trimmedEmail = buyerEmail?.trim().toLowerCase();
    const trimmedName = buyerName?.trim();
    const trimmedLastName = buyerLastName?.trim();
    const trimmedPhone = buyerPhone?.trim();
    const amount = event.price * ticketQuantity;

    const linkData: Omit<PaymentLink, 'id'> = {
      token,
      eventId,
      sellerId: user.uid,
      ticketQuantity,
      linkType: 'cash',
      amount,
      status: 'PAID',
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ...(trimmedName ? { buyerName: trimmedName } : {}),
      ...(trimmedLastName ? { buyerLastName: trimmedLastName } : {}),
      ...(trimmedPhone ? { buyerPhone: trimmedPhone } : {}),
      ...(trimmedEmail ? { buyerEmail: trimmedEmail } : {}),
    };

    await ref.set(linkData);
    await issueTicketsForLink(ref.id);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
    const ticketsUrl = `${appUrl}/ticket?token=${encodeURIComponent(token)}`;

    let emailSent = false;
    let emailError: string | undefined;
    const shouldSendEmail = sendEmail !== false && Boolean(trimmedEmail);

    if (shouldSendEmail) {
      try {
        const emailResult = await sendPurchaseConfirmationEmail(ref.id);
        emailSent = emailResult.sent;
        if (!emailResult.sent && emailResult.skipped) {
          emailError = `No se envió el email (${emailResult.skipped})`;
        }
      } catch (e) {
        emailError = e instanceof Error ? e.message : 'Error al enviar email';
      }
    }

    return ok({
      ticketsUrl,
      link: serializePaymentLink({ id: ref.id, ...linkData }),
      emailSent,
      emailError,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al registrar cobro en efectivo');
  }
}
