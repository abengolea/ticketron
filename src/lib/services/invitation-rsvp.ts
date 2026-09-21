import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { generateSecureToken } from '@/lib/tokens';
import { issueTicketsForLink } from '@/lib/services/issue-tickets';
import { sendComplimentaryTicketEmail } from '@/lib/services/complimentary-ticket-email';
import { sumPendingPaymentReservations } from '@/lib/services/payment-link-reservations';
import { PAYMENT_LINK_INDEFINITE_EXPIRES_AT } from '@/lib/payment-link-expiry';
import { normalizeEventDoc } from '@/lib/serialize';
import type {
  InvitationCampaign,
  InvitationRecipient,
  PaymentLink,
} from '@/lib/models';

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );
}

export async function getInvitationRecipientByToken(
  token: string
): Promise<InvitationRecipient | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTIONS.invitationRecipients).doc(token).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as InvitationRecipient;
}

export async function submitInvitationRsvp(params: {
  token: string;
  guestName: string;
  guestPhone?: string;
  ticketQuantity: number;
}): Promise<{
  ticketsUrl: string;
  ticketQuantity: number;
  emailSent: boolean;
  emailError?: string;
}> {
  const db = getAdminDb();
  const recipientRef = db.collection(COLLECTIONS.invitationRecipients).doc(params.token);
  const recipientSnap = await recipientRef.get();
  if (!recipientSnap.exists) {
    throw new Error('Invitación no encontrada');
  }

  const recipient = {
    id: recipientSnap.id,
    ...recipientSnap.data(),
  } as InvitationRecipient;

  if (recipient.status === 'rsvped') {
    if (recipient.ticketsUrl) {
      return {
        ticketsUrl: recipient.ticketsUrl,
        ticketQuantity: recipient.ticketQuantity ?? params.ticketQuantity,
        emailSent: true,
      };
    }
    throw new Error('Esta invitación ya fue confirmada');
  }
  if (recipient.status === 'declined') {
    throw new Error('Esta invitación ya fue rechazada');
  }
  if (recipient.status === 'rsvping') {
    throw new Error('Estamos procesando tu reserva. Recargá en unos segundos.');
  }

  const campaignSnap = await db
    .collection(COLLECTIONS.invitationCampaigns)
    .doc(recipient.campaignId)
    .get();
  if (!campaignSnap.exists) {
    throw new Error('Campaña no encontrada');
  }
  const campaign = {
    id: campaignSnap.id,
    ...campaignSnap.data(),
  } as InvitationCampaign;

  if (campaign.status === 'cancelled') {
    throw new Error('Esta invitación ya no está activa');
  }

  if (params.ticketQuantity > campaign.maxTicketsPerInvite) {
    throw new Error(
      `Podés reservar como máximo ${campaign.maxTicketsPerInvite} entrada${campaign.maxTicketsPerInvite === 1 ? '' : 's'}`
    );
  }

  const eventSnap = await db.collection(COLLECTIONS.events).doc(recipient.eventId).get();
  if (!eventSnap.exists) {
    throw new Error('Evento no encontrado');
  }
  const event = normalizeEventDoc(eventSnap.id, eventSnap.data()!);
  if (!event.active) {
    throw new Error('El evento ya no acepta reservas');
  }

  const pendingPayment = await sumPendingPaymentReservations(db, {
    eventId: event.id,
  });
  const remaining = event.capacity - event.sold - pendingPayment;
  if (params.ticketQuantity > remaining) {
    if (remaining <= 0) {
      throw new Error('Se agotaron las entradas para este evento');
    }
    throw new Error(`Solo quedan ${remaining} entradas disponibles`);
  }

  const guestName = params.guestName.trim();
  const guestPhone = params.guestPhone?.trim();

  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(recipientRef);
    if (!fresh.exists) return 'missing';
    const status = fresh.data()?.status as InvitationRecipient['status'];
    if (status === 'rsvped') return 'already';
    if (status === 'declined') return 'declined';
    if (status === 'rsvping') return 'in_progress';
    tx.update(recipientRef, {
      status: 'rsvping',
      guestName,
      ticketQuantity: params.ticketQuantity,
      ...(guestPhone ? { guestPhone } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'ok';
  });

  if (claimed === 'already') {
    const latest = await recipientRef.get();
    const data = latest.data() as InvitationRecipient;
    if (data.ticketsUrl) {
      return {
        ticketsUrl: data.ticketsUrl,
        ticketQuantity: data.ticketQuantity ?? params.ticketQuantity,
        emailSent: true,
      };
    }
    throw new Error('Esta invitación ya fue confirmada');
  }
  if (claimed === 'declined') {
    throw new Error('Esta invitación ya fue rechazada');
  }
  if (claimed === 'in_progress') {
    throw new Error('Estamos procesando tu reserva. Recargá en unos segundos.');
  }
  if (claimed !== 'ok') {
    throw new Error('Invitación no encontrada');
  }

  const token = generateSecureToken();
  const linkRef = db.collection(COLLECTIONS.paymentLinks).doc();
  const now = Timestamp.now();
  const linkData: Omit<PaymentLink, 'id'> = {
    token,
    eventId: event.id,
    sellerId: campaign.createdBy,
    ticketQuantity: params.ticketQuantity,
    linkType: 'complimentary',
    recipientLabel: `Invitación ${recipient.email}`,
    buyerEmail: recipient.email,
    buyerName: guestName,
    amount: 0,
    status: 'PAID',
    expiresAt: PAYMENT_LINK_INDEFINITE_EXPIRES_AT,
    complimentaryMessage: campaign.headline,
    createdAt: now,
    updatedAt: now,
    ...(guestPhone ? { buyerPhone: guestPhone } : {}),
  };

  try {
    await linkRef.set(linkData);
    await issueTicketsForLink(linkRef.id);
  } catch (error) {
    await recipientRef.update({
      status: recipient.status === 'pending' ? 'pending' : 'sent',
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw error instanceof Error ? error : new Error('No se pudieron emitir las entradas');
  }

  const ticketsUrl = `${getAppUrl()}/ticket?token=${encodeURIComponent(token)}`;

  await recipientRef.update({
    status: 'rsvped',
    ticketQuantity: params.ticketQuantity,
    guestName,
    paymentLinkId: linkRef.id,
    ticketsUrl,
    rsvpedAt: Timestamp.now(),
    ...(guestPhone ? { guestPhone } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection(COLLECTIONS.invitationCampaigns).doc(campaign.id).update({
    rsvpCount: FieldValue.increment(1),
    reservedTickets: FieldValue.increment(params.ticketQuantity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  let emailSent = false;
  let emailError: string | undefined;
  try {
    const emailResult = await sendComplimentaryTicketEmail(linkRef.id);
    emailSent = emailResult.sent;
    if (!emailResult.sent && emailResult.skipped) {
      emailError = `No se envió el email (${emailResult.skipped})`;
    }
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Error al enviar email';
  }

  return {
    ticketsUrl,
    ticketQuantity: params.ticketQuantity,
    emailSent,
    emailError,
  };
}

export async function declineInvitationRsvp(token: string): Promise<void> {
  const db = getAdminDb();
  const recipientRef = db.collection(COLLECTIONS.invitationRecipients).doc(token);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(recipientRef);
    if (!snap.exists) return 'missing' as const;
    const data = snap.data() as InvitationRecipient;
    if (data.status === 'declined') return 'ok' as const;
    if (data.status === 'rsvped' || data.status === 'rsvping') {
      return 'already_rsvped' as const;
    }
    tx.update(recipientRef, {
      status: 'declined',
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(db.collection(COLLECTIONS.invitationCampaigns).doc(data.campaignId), {
      declinedCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'ok' as const;
  });

  if (result === 'missing') {
    throw new Error('Invitación no encontrada');
  }
  if (result === 'already_rsvped') {
    throw new Error('Ya reservaste entradas con esta invitación');
  }
}
