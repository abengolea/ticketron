import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { buildComplimentaryTicketEmailHtml } from '@/lib/email/templates/complimentary-ticket';
import type { EmailTicketQr } from '@/lib/email/templates/purchase-confirmation';
import {
  qrPayloadToPngBase64,
  ticketQrContentId,
} from '@/lib/email/qr-data-url';
import { sendEmailViaResend } from '@/lib/email/resend-send';
import type { ResendInlineAttachment } from '@/lib/email/resend-send';
import { createActivationLinkForEmail } from '@/lib/services/buyer-activation';
import type { PaymentLink, PlatformTicket } from '@/lib/models';
import { formatEventDateForDisplay } from '@/lib/format-event-date';

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );
}

/** Envía email con QR al beneficiario de una entrada de cortesía (idempotente). */
export async function sendComplimentaryTicketEmail(
  paymentLinkId: string
): Promise<{ sent: boolean; skipped?: string }> {
  const db = getAdminDb();
  const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    return { sent: false, skipped: 'link_not_found' };
  }

  const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;

  if (link.linkType !== 'complimentary') {
    return { sent: false, skipped: 'not_complimentary' };
  }

  if (link.status !== 'PAID') {
    return { sent: false, skipped: 'not_paid' };
  }

  const beneficiaryEmail = link.buyerEmail?.trim().toLowerCase();
  if (!beneficiaryEmail) {
    return { sent: false, skipped: 'no_email' };
  }

  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(linkRef);
    if (!fresh.exists) return false;
    if (fresh.data()?.confirmationEmailSentAt) return false;
    tx.update(linkRef, {
      confirmationEmailSentAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) {
    return { sent: false, skipped: 'already_sent' };
  }

  const eventSnap = await db.collection(COLLECTIONS.events).doc(link.eventId).get();
  if (!eventSnap.exists) {
    return { sent: false, skipped: 'event_not_found' };
  }

  const event = eventSnap.data()!;
  const beneficiaryName = link.buyerName?.trim() || 'Invitado';
  const ticketQuantity = link.ticketQuantity ?? 1;
  const ticketsUrl = `${getAppUrl()}/ticket?token=${encodeURIComponent(link.token)}`;
  const eventDate = formatEventDateForDisplay(event.date.toDate());

  const ticketsSnap = await db
    .collection(COLLECTIONS.tickets)
    .where('paymentLinkId', '==', paymentLinkId)
    .get();

  const platformTickets = ticketsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as PlatformTicket)
    .sort((a, b) => a.ticketCode.localeCompare(b.ticketCode));

  if (platformTickets.length === 0) {
    return { sent: false, skipped: 'no_tickets' };
  }

  const tickets: EmailTicketQr[] = platformTickets.map((ticket, i) => ({
    index: i + 1,
    total: platformTickets.length || ticketQuantity,
    ticketCode: ticket.ticketCode,
    qrCid: ticketQrContentId(i + 1),
  }));

  const attachments: ResendInlineAttachment[] = await Promise.all(
    platformTickets.map(async (ticket, i) => ({
      filename: `entrada-${i + 1}.png`,
      content: await qrPayloadToPngBase64(ticket.qrPayload),
      content_id: ticketQrContentId(i + 1),
      content_type: 'image/png',
    }))
  );

  let accountUrl: string | undefined;
  try {
    accountUrl = await createActivationLinkForEmail(beneficiaryEmail, beneficiaryName);
  } catch {
    accountUrl = undefined;
  }

  const subject = `Tu entrada de cortesía — ${event.name}`;
  const html = buildComplimentaryTicketEmailHtml({
    beneficiaryName,
    eventName: event.name,
    eventDate,
    eventLocation: event.location,
    ticketQuantity,
    tickets,
    ticketsUrl,
    message: link.complimentaryMessage,
    accountUrl,
  });

  try {
    await sendEmailViaResend({
      to: beneficiaryEmail,
      subject,
      html,
      attachments,
    });
    return { sent: true };
  } catch (error) {
    await linkRef.update({
      confirmationEmailSentAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }
}
