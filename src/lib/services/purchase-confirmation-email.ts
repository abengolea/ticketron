import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { buildPurchaseConfirmationEmailHtml } from '@/lib/email/templates/purchase-confirmation';
import type { EmailTicketQr } from '@/lib/email/templates/purchase-confirmation';
import { qrPayloadToDataUrl } from '@/lib/email/qr-data-url';
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

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY o EMAIL_FROM no configurados');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
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

  const eventSnap = await db.collection(COLLECTIONS.events).doc(link.eventId).get();
  if (!eventSnap.exists) {
    return { sent: false, skipped: 'event_not_found' };
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

  const tickets: EmailTicketQr[] = await Promise.all(
    platformTickets.map(async (ticket, i) => ({
      index: i + 1,
      total: platformTickets.length || ticketQuantity,
      ticketCode: ticket.ticketCode,
      qrDataUrl: await qrPayloadToDataUrl(ticket.qrPayload),
    }))
  );

  const appUrl = getAppUrl();
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
  });

  try {
    await sendViaResend(buyerEmail, subject, html);
    return { sent: true };
  } catch (error) {
    await linkRef.update({
      confirmationEmailSentAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }
}
