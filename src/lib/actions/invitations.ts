'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  verifyIdTokenAndGetUser,
  requireManageEvents,
  isSuperAdmin,
} from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  createInvitationCampaignSchema,
  previewInvitationAudienceSchema,
  sendInvitationPreviewSchema,
  sendInvitationBatchSchema,
  submitInvitationRsvpSchema,
  declineInvitationSchema,
} from '@/lib/validations';
import { generateSecureToken } from '@/lib/tokens';
import { requireEventAccess } from '@/lib/tenant';
import { normalizeEventDoc, serializeInvitationCampaign, serializeInvitationRecipient } from '@/lib/serialize';
import { collectInvitationAudience } from '@/lib/services/invitation-audience';
import {
  getEmailFromConfig,
  invitationRsvpUrl,
  sendInvitationBatch as sendInvitationBatchService,
  sendInvitationEmail,
  retryFailedInvitations,
} from '@/lib/services/invitation-send';
import {
  declineInvitationRsvp,
  getInvitationRecipientByToken,
  submitInvitationRsvp,
} from '@/lib/services/invitation-rsvp';
import { sumPendingPaymentReservations } from '@/lib/services/payment-link-reservations';
import { formatEventDateForDisplay } from '@/lib/format-event-date';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  EventInvitationStats,
  InvitationAudiencePreview,
  InvitationCampaign,
  InvitationRecipient,
  SerializedInvitationCampaign,
  SerializedInvitationRecipient,
} from '@/lib/models';

async function eventExtras(eventId: string): Promise<{ eventName: string; eventDate: string }> {
  const snap = await getAdminDb().collection(COLLECTIONS.events).doc(eventId).get();
  if (!snap.exists) return { eventName: '', eventDate: '' };
  const event = normalizeEventDoc(snap.id, snap.data()!);
  return {
    eventName: event.name,
    eventDate: event.date.toDate().toISOString(),
  };
}

export async function getInvitationEmailConfig(
  idToken: string
): Promise<ActionResult<{ ready: boolean; from: string | null; appUrl: string }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    return ok(getEmailFromConfig());
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function previewInvitationAudience(
  idToken: string,
  input: unknown
): Promise<ActionResult<InvitationAudiencePreview>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const parsed = previewInvitationAudienceSchema.parse(input);
    await requireEventAccess(user, parsed.eventId);
    const { preview } = await collectInvitationAudience(getAdminDb(), user, parsed);
    return ok(preview);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al armar la audiencia');
  }
}

export async function sendInvitationPreviewEmail(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ to: string; rsvpUrl: string }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const parsed = sendInvitationPreviewSchema.parse(input);
    const event = await requireEventAccess(user, parsed.eventId);
    const config = getEmailFromConfig();
    if (!config.ready) {
      return fail('Falta configurar RESEND_API_KEY y EMAIL_FROM');
    }

    const db = getAdminDb();
    const now = Timestamp.now();
    const campaignId = `preview_${user.uid}_${parsed.eventId}`;
    const campaignRef = db.collection(COLLECTIONS.invitationCampaigns).doc(campaignId);
    const email = user.email.trim().toLowerCase();

    const existingRecipients = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaignId)
      .get();
    const mine = existingRecipients.docs.find(
      (doc) => (doc.data().email as string | undefined)?.toLowerCase() === email
    );

    let token = mine?.id;
    if (mine) {
      const status = mine.data().status as InvitationRecipient['status'];
      if (status !== 'rsvped' && status !== 'rsvping') {
        await mine.ref.update({
          status: 'sent',
          preview: true,
          error: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      token = generateSecureToken();
      const recipient: Omit<InvitationRecipient, 'id'> = {
        campaignId,
        eventId: event.id,
        token,
        email,
        displayName: user.displayName,
        source: 'manual',
        status: 'sent',
        preview: true,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.invitationRecipients).doc(token).set(recipient);
    }

    if (!token) {
      return fail('No se pudo crear el link de prueba');
    }

    const campaign: Omit<InvitationCampaign, 'id'> = {
      eventId: event.id,
      ownerId: event.ownerId || user.uid,
      subject: parsed.subject.trim(),
      headline: parsed.headline.trim(),
      message: parsed.message.trim(),
      maxTicketsPerInvite: parsed.maxTicketsPerInvite,
      status: 'sent',
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      rsvpCount: 0,
      declinedCount: 0,
      reservedTickets: 0,
      preview: true,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };
    await campaignRef.set(campaign, { merge: true });

    const rsvpUrl = invitationRsvpUrl(token, parsed.appUrl);
    await sendInvitationEmail({
      to: email,
      subject: parsed.subject,
      headline: parsed.headline,
      message: parsed.message,
      event,
      rsvpUrl,
      maxTicketsPerInvite: parsed.maxTicketsPerInvite,
      isPreview: true,
    });

    return ok({ to: email, rsvpUrl });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al enviar la prueba');
  }
}

export async function createInvitationCampaign(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedInvitationCampaign>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const parsed = createInvitationCampaignSchema.parse(input);
    const event = await requireEventAccess(user, parsed.eventId);
    const config = getEmailFromConfig();
    if (!config.ready) {
      return fail('Falta configurar RESEND_API_KEY y EMAIL_FROM');
    }

    const db = getAdminDb();
    const { contacts } = await collectInvitationAudience(db, user, parsed);
    if (contacts.length === 0) {
      return fail('No hay emails para invitar. Agregá destinatarios extra o revisá la base.');
    }

    const now = Timestamp.now();
    const campaignRef = db.collection(COLLECTIONS.invitationCampaigns).doc();
    const campaign: Omit<InvitationCampaign, 'id'> = {
      eventId: event.id,
      ownerId: event.ownerId || user.uid,
      subject: parsed.subject.trim(),
      headline: parsed.headline.trim(),
      message: parsed.message.trim(),
      maxTicketsPerInvite: parsed.maxTicketsPerInvite,
      status: 'sending',
      recipientCount: contacts.length,
      sentCount: 0,
      failedCount: 0,
      rsvpCount: 0,
      declinedCount: 0,
      reservedTickets: 0,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await campaignRef.set(campaign);

    for (let i = 0; i < contacts.length; i += 400) {
      const batch = db.batch();
      for (const contact of contacts.slice(i, i + 400)) {
        const token = generateSecureToken();
        const ref = db.collection(COLLECTIONS.invitationRecipients).doc(token);
        const recipient: Omit<InvitationRecipient, 'id'> = {
          campaignId: campaignRef.id,
          eventId: event.id,
          token,
          email: contact.email,
          source: contact.source,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          ...(contact.displayName ? { displayName: contact.displayName } : {}),
        };
        batch.set(ref, recipient);
      }
      await batch.commit();
    }

    return ok(
      serializeInvitationCampaign(
        { id: campaignRef.id, ...campaign },
        {
          eventName: event.name,
          eventDate: event.date.toDate().toISOString(),
        }
      )
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear la campaña');
  }
}

export async function sendInvitationCampaignBatch(
  idToken: string,
  input: unknown
): Promise<
  ActionResult<{
    sent: number;
    failed: number;
    remaining: number;
    status: InvitationCampaign['status'];
  }>
> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const parsed = sendInvitationBatchSchema.parse(input);
    const db = getAdminDb();
    const snap = await db.collection(COLLECTIONS.invitationCampaigns).doc(parsed.campaignId).get();
    if (!snap.exists) return fail('Campaña no encontrada');
    const campaign = snap.data() as InvitationCampaign;
    await requireEventAccess(user, campaign.eventId);
    const result = await sendInvitationBatchService({
      campaignId: parsed.campaignId,
      limit: parsed.limit,
    });
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al enviar invitaciones');
  }
}

export async function retryFailedInvitationCampaign(
  idToken: string,
  campaignId: string
): Promise<ActionResult<{ reset: number }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const db = getAdminDb();
    const snap = await db.collection(COLLECTIONS.invitationCampaigns).doc(campaignId).get();
    if (!snap.exists) return fail('Campaña no encontrada');
    await requireEventAccess(user, (snap.data() as InvitationCampaign).eventId);
    const reset = await retryFailedInvitations(campaignId);
    return ok({ reset });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al reintentar');
  }
}

export async function listInvitationCampaigns(
  idToken: string,
  eventId?: string
): Promise<ActionResult<SerializedInvitationCampaign[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const db = getAdminDb();
    let snap;
    if (eventId) {
      await requireEventAccess(user, eventId);
      snap = await db
        .collection(COLLECTIONS.invitationCampaigns)
        .where('eventId', '==', eventId)
        .get();
    } else if (!isSuperAdmin(user)) {
      snap = await db
        .collection(COLLECTIONS.invitationCampaigns)
        .where('ownerId', '==', user.uid)
        .get();
    } else {
      snap = await db.collection(COLLECTIONS.invitationCampaigns).get();
    }
    const extras = new Map<string, { eventName: string; eventDate: string }>();
    const eventIds = [...new Set(snap.docs.map((d) => d.data().eventId as string))];
    await Promise.all(
      eventIds.map(async (id) => {
        extras.set(id, await eventExtras(id));
      })
    );

    return ok(
      snap.docs
        .filter((doc) => doc.data().preview !== true)
        .map((doc) => {
          const campaign = { id: doc.id, ...doc.data() } as InvitationCampaign;
          return serializeInvitationCampaign(campaign, extras.get(campaign.eventId));
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al listar campañas');
  }
}

export async function getInvitationCampaign(
  idToken: string,
  campaignId: string
): Promise<
  ActionResult<{
    campaign: SerializedInvitationCampaign;
    recipients: SerializedInvitationRecipient[];
  }>
> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const db = getAdminDb();
    const snap = await db.collection(COLLECTIONS.invitationCampaigns).doc(campaignId).get();
    if (!snap.exists) return fail('Campaña no encontrada');
    const campaign = { id: snap.id, ...snap.data() } as InvitationCampaign;
    await requireEventAccess(user, campaign.eventId);

    const recipientsSnap = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaignId)
      .get();

    const recipients = recipientsSnap.docs
      .map((doc) => serializeInvitationRecipient({ id: doc.id, ...doc.data() } as InvitationRecipient))
      .sort((a, b) => a.email.localeCompare(b.email));

    const extras = await eventExtras(campaign.eventId);
    return ok({
      campaign: serializeInvitationCampaign(campaign, extras),
      recipients,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al cargar la campaña');
  }
}

export async function getEventInvitationStats(
  idToken: string,
  eventId: string
): Promise<ActionResult<EventInvitationStats>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    await requireEventAccess(user, eventId);
    const db = getAdminDb();
    const snap = await db
      .collection(COLLECTIONS.invitationCampaigns)
      .where('eventId', '==', eventId)
      .get();

    const stats: EventInvitationStats = {
      campaigns: 0,
      sent: 0,
      rsvpCount: 0,
      declinedCount: 0,
      reservedTickets: 0,
    };
    for (const doc of snap.docs) {
      const data = doc.data() as InvitationCampaign;
      if (data.preview) continue;
      stats.campaigns += 1;
      stats.sent += data.sentCount ?? 0;
      stats.rsvpCount += data.rsvpCount ?? 0;
      stats.declinedCount += data.declinedCount ?? 0;
      stats.reservedTickets += data.reservedTickets ?? 0;
    }
    return ok(stats);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getPublicInvite(token: string): Promise<
  ActionResult<{
    eventName: string;
    eventDate: string;
    eventLocation?: string;
    headline: string;
    message: string;
    maxTicketsPerInvite: number;
    remainingCapacity: number;
    status: InvitationRecipient['status'];
    invitedEmail: string;
    guestName?: string;
    ticketQuantity?: number;
    ticketsUrl?: string;
  }>
> {
  try {
    const recipient = await getInvitationRecipientByToken(token);
    if (!recipient) return fail('Invitación no encontrada');

    const db = getAdminDb();
    const [campaignSnap, eventSnap] = await Promise.all([
      db.collection(COLLECTIONS.invitationCampaigns).doc(recipient.campaignId).get(),
      db.collection(COLLECTIONS.events).doc(recipient.eventId).get(),
    ]);
    if (!campaignSnap.exists || !eventSnap.exists) {
      return fail('Invitación no disponible');
    }

    const campaign = campaignSnap.data() as InvitationCampaign;
    const event = normalizeEventDoc(eventSnap.id, eventSnap.data()!);
    const pendingPayment = await sumPendingPaymentReservations(db, {
      eventId: event.id,
    });
    const remainingCapacity = Math.max(0, event.capacity - event.sold - pendingPayment);

    return ok({
      eventName: event.name,
      eventDate: formatEventDateForDisplay(event.date.toDate()),
      eventLocation: event.location,
      headline: campaign.headline,
      message: campaign.message,
      maxTicketsPerInvite: campaign.maxTicketsPerInvite,
      remainingCapacity,
      status: recipient.status,
      invitedEmail: recipient.email,
      guestName: recipient.guestName,
      ticketQuantity: recipient.ticketQuantity,
      ticketsUrl: recipient.ticketsUrl,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al cargar la invitación');
  }
}

export async function submitPublicInvitationRsvp(
  input: unknown
): Promise<
  ActionResult<{
    ticketsUrl: string;
    ticketQuantity: number;
    emailSent: boolean;
    emailError?: string;
  }>
> {
  try {
    const parsed = submitInvitationRsvpSchema.parse(input);
    const result = await submitInvitationRsvp({
      token: parsed.token,
      guestName: parsed.guestName,
      guestPhone: parsed.guestPhone?.trim() || undefined,
      ticketQuantity: parsed.ticketQuantity,
    });
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'No se pudo confirmar la reserva');
  }
}

export async function declinePublicInvitation(
  input: unknown
): Promise<ActionResult<{ declined: true }>> {
  try {
    const parsed = declineInvitationSchema.parse(input);
    await declineInvitationRsvp(parsed.token);
    return ok({ declined: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'No se pudo registrar la respuesta');
  }
}
