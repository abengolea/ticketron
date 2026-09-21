import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { sumPendingPaymentReservations } from '@/lib/services/payment-link-reservations';
import { normalizeEventDoc } from '@/lib/serialize';
import type { InvitationCampaign, InvitationRecipient } from '@/lib/models';

/** Reservas de invitación que todavía no emitieron entradas (no están en sold). */
export async function sumInvitationHolds(
  db: Firestore,
  eventId: string
): Promise<number> {
  let docs;
  try {
    const snap = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('eventId', '==', eventId)
      .where('status', '==', 'rsvped')
      .get();
    docs = snap.docs;
  } catch {
    const snap = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('eventId', '==', eventId)
      .get();
    docs = snap.docs.filter((doc) => doc.data().status === 'rsvped');
  }

  return docs.reduce((sum, doc) => {
    const data = doc.data() as InvitationRecipient;
    if (data.paymentLinkId) return sum;
    return sum + (data.ticketQuantity ?? 1);
  }, 0);
}

export async function remainingEventCapacity(
  db: Firestore,
  eventId: string,
  sold: number,
  capacity: number
): Promise<number> {
  const [pendingPayment, invitationHolds] = await Promise.all([
    sumPendingPaymentReservations(db, { eventId }),
    sumInvitationHolds(db, eventId),
  ]);
  return Math.max(0, capacity - sold - pendingPayment - invitationHolds);
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
  guestEmail: string;
  ticketQuantity: number;
}): Promise<{ ticketQuantity: number }> {
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
    return {
      ticketQuantity: recipient.ticketQuantity ?? params.ticketQuantity,
    };
  }
  if (recipient.status === 'declined') {
    throw new Error('Esta invitación ya fue rechazada');
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

  const maxAllowed = Math.min(campaign.maxTicketsPerInvite || 6, 6);
  if (params.ticketQuantity > maxAllowed) {
    throw new Error(
      `Podés reservar como máximo ${maxAllowed} entrada${maxAllowed === 1 ? '' : 's'}`
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

  const remaining = await remainingEventCapacity(
    db,
    event.id,
    event.sold,
    event.capacity
  );
  if (params.ticketQuantity > remaining) {
    if (remaining <= 0) {
      throw new Error('Se agotaron las entradas para este evento');
    }
    throw new Error(`Solo quedan ${remaining} entradas disponibles`);
  }

  const guestEmail = params.guestEmail.trim().toLowerCase();

  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(recipientRef);
    if (!fresh.exists) return 'missing';
    const status = fresh.data()?.status as InvitationRecipient['status'];
    if (status === 'rsvped') return 'already';
    if (status === 'declined') return 'declined';
    tx.update(recipientRef, {
      status: 'rsvped',
      email: guestEmail,
      ticketQuantity: params.ticketQuantity,
      rsvpedAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(db.collection(COLLECTIONS.invitationCampaigns).doc(campaign.id), {
      rsvpCount: FieldValue.increment(1),
      reservedTickets: FieldValue.increment(params.ticketQuantity),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'ok';
  });

  if (claimed === 'already') {
    const latest = await recipientRef.get();
    const data = latest.data() as InvitationRecipient;
    return {
      ticketQuantity: data.ticketQuantity ?? params.ticketQuantity,
    };
  }
  if (claimed === 'declined') {
    throw new Error('Esta invitación ya fue rechazada');
  }
  if (claimed !== 'ok') {
    throw new Error('Invitación no encontrada');
  }

  return {
    ticketQuantity: params.ticketQuantity,
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
