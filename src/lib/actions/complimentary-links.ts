'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createComplimentaryLinkSchema } from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { serializePaymentLink } from '@/lib/serialize';
import { issueTicketsForLink } from '@/lib/services/issue-tickets';
import { sendComplimentaryTicketEmail } from '@/lib/services/complimentary-ticket-email';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { PaymentLink, SerializedPaymentLink } from '@/lib/models';

export async function createComplimentaryLink(
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
    requireRole(user, 'seller', 'admin');

    const parsed = createComplimentaryLinkSchema.parse(input);
    const {
      eventId,
      ticketQuantity,
      beneficiaryEmail,
      beneficiaryName,
      message,
    } = parsed;

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
        return fail(`Tu cupo permite emitir hasta ${sellerRemaining} entradas más`);
      }
    }

    const token = generateSecureToken();
    const ref = db.collection(COLLECTIONS.paymentLinks).doc();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const trimmedMessage = message?.trim();
    const trimmedName = beneficiaryName?.trim();

    const linkData: Omit<PaymentLink, 'id'> = {
      token,
      eventId,
      sellerId: user.uid,
      ticketQuantity,
      linkType: 'complimentary',
      buyerEmail: beneficiaryEmail.toLowerCase(),
      amount: 0,
      status: 'PAID',
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ...(trimmedMessage ? { complimentaryMessage: trimmedMessage } : {}),
      ...(trimmedName ? { buyerName: trimmedName } : {}),
    };

    await ref.set(linkData);
    await issueTicketsForLink(ref.id);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
    const ticketsUrl = `${appUrl}/ticket?token=${encodeURIComponent(token)}`;

    let emailSent = false;
    let emailError: string | undefined;
    try {
      const emailResult = await sendComplimentaryTicketEmail(ref.id);
      emailSent = emailResult.sent;
      if (!emailResult.sent && emailResult.skipped) {
        emailError = `No se envió el email (${emailResult.skipped})`;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'Error al enviar email';
    }

    return ok({
      ticketsUrl,
      link: serializePaymentLink({ id: ref.id, ...linkData }),
      emailSent,
      emailError,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear entrada de favor');
  }
}
