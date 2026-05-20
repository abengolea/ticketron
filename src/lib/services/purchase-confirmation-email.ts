import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { buildPurchaseConfirmationEmailHtml } from '@/lib/email/templates/purchase-confirmation';
import type { EmailTicketQr } from '@/lib/email/templates/purchase-confirmation';
import {
  qrPayloadToPngBase64,
  ticketQrContentId,
} from '@/lib/email/qr-data-url';
import { sendEmailViaResend } from '@/lib/email/resend-send';
import type { ResendInlineAttachment } from '@/lib/email/resend-send';
import { createActivationLinkForEmail } from '@/lib/services/buyer-activation';
import type { PaymentLink, PlatformTicket } from '@/lib/models';

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );
}

function formatEventDate(date: Date): string {
  return date.toLocaleString('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

export interface PurchaseConfirmationEmailContent {
  subject: string;
  html: string;
  attachments: ResendInlineAttachment[];
  ticketsUrl: string;
}

/** Arma el HTML y adjuntos de confirmación a partir de un payment link PAID con tickets. */
export async function buildPurchaseConfirmationEmailContent(
  paymentLinkId: string
): Promise<PurchaseConfirmationEmailContent> {
  const db = getAdminDb();
  const linkSnap = await db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId).get();

  if (!linkSnap.exists) {
    throw new Error(`PaymentLink no encontrado: ${paymentLinkId}`);
  }

  const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;

  if (link.status !== 'PAID') {
    throw new Error(`PaymentLink en estado ${link.status}; se requiere PAID`);
  }

  const eventSnap = await db.collection(COLLECTIONS.events).doc(link.eventId).get();
  if (!eventSnap.exists) {
    throw new Error('Evento no encontrado');
  }

  const event = eventSnap.data()!;
  const buyerName =
    [link.buyerName, link.buyerLastName].filter(Boolean).join(' ') || 'Comprador';
  const ticketQuantity = link.ticketQuantity ?? 1;
  const ticketsUrl = `${getAppUrl()}/ticket?token=${encodeURIComponent(link.token)}`;
  const eventDate = formatEventDate(event.date.toDate());

  const ticketsSnap = await db
    .collection(COLLECTIONS.tickets)
    .where('paymentLinkId', '==', paymentLinkId)
    .get();

  const platformTickets = ticketsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as PlatformTicket)
    .sort((a, b) => a.ticketCode.localeCompare(b.ticketCode));

  if (platformTickets.length === 0) {
    throw new Error('El link no tiene tickets emitidos');
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

  const appUrl = getAppUrl();
  const buyerEmail = link.buyerEmail?.trim().toLowerCase();
  let accountUrl: string | undefined;
  if (buyerEmail) {
    try {
      accountUrl = await createActivationLinkForEmail(buyerEmail, buyerName);
    } catch {
      accountUrl = undefined;
    }
  }

  const subject = `Tus entradas — ${event.name}`;
  const html = buildPurchaseConfirmationEmailHtml({
    buyerName,
    eventName: event.name,
    eventDate,
    eventLocation: event.location,
    ticketQuantity,
    tickets,
    ticketsUrl,
    appUrl,
    accountUrl,
  });

  return { subject, html, attachments, ticketsUrl };
}

/**
 * Envía email de confirmación al comprador tras pago aprobado (idempotente).
 */
export async function sendPurchaseConfirmationEmail(
  paymentLinkId: string
): Promise<{ sent: boolean; skipped?: string }> {
  const db = getAdminDb();
  const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    return { sent: false, skipped: 'link_not_found' };
  }

  const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;

  if (link.status !== 'PAID') {
    return { sent: false, skipped: 'not_paid' };
  }

  const buyerEmail = link.buyerEmail?.trim().toLowerCase();
  if (!buyerEmail) {
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

  try {
    const { subject, html, attachments } =
      await buildPurchaseConfirmationEmailContent(paymentLinkId);

    await sendEmailViaResend({
      to: buyerEmail,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
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
