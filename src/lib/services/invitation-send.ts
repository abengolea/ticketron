import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { sendEmailViaResend } from '@/lib/email/resend-send';
import { buildEventInvitationEmailHtml } from '@/lib/email/templates/event-invitation';
import { formatEventDateForDisplay } from '@/lib/format-event-date';
import type { InvitationCampaign, InvitationRecipient, PlatformEvent } from '@/lib/models';
import { normalizeEventDoc } from '@/lib/serialize';

export function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );
}

export function resolveAppUrl(override?: string): string {
  const raw = override?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      // usar la URL pública configurada
    }
  }
  return getPublicAppUrl();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function invitationRsvpUrl(token: string, baseUrl?: string): string {
  return `${resolveAppUrl(baseUrl)}/invite/${encodeURIComponent(token)}`;
}

export function getEmailFromConfig(): {
  ready: boolean;
  from: string | null;
  appUrl: string;
} {
  const from = process.env.EMAIL_FROM?.trim() || null;
  const ready = Boolean(process.env.RESEND_API_KEY?.trim() && from);
  return { ready, from, appUrl: getPublicAppUrl() };
}

export async function sendInvitationEmail(params: {
  to: string;
  subject: string;
  headline: string;
  message: string;
  event: Pick<PlatformEvent, 'name' | 'date' | 'location'>;
  rsvpUrl: string;
  maxTicketsPerInvite: number;
  isPreview?: boolean;
}): Promise<void> {
  const html = buildEventInvitationEmailHtml({
    headline: params.headline,
    message: params.message,
    eventName: params.event.name,
    eventDate: formatEventDateForDisplay(params.event.date.toDate()),
    eventLocation: params.event.location,
    rsvpUrl: params.rsvpUrl,
    maxTicketsPerInvite: params.maxTicketsPerInvite,
    isPreview: params.isPreview,
  });

  await sendEmailViaResend({
    to: params.to,
    subject: params.isPreview ? `[Prueba] ${params.subject}` : params.subject,
    html,
  });
}

export async function sendInvitationBatch(params: {
  campaignId: string;
  limit?: number;
}): Promise<{
  sent: number;
  failed: number;
  remaining: number;
  status: InvitationCampaign['status'];
}> {
  const db = getAdminDb();
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 25);
  const campaignRef = db.collection(COLLECTIONS.invitationCampaigns).doc(params.campaignId);
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists) {
    throw new Error('Campaña no encontrada');
  }

  const campaign = {
    id: campaignSnap.id,
    ...campaignSnap.data(),
  } as InvitationCampaign;

  if (campaign.status === 'cancelled') {
    throw new Error('La campaña fue cancelada');
  }

  const eventSnap = await db.collection(COLLECTIONS.events).doc(campaign.eventId).get();
  if (!eventSnap.exists) {
    throw new Error('Evento no encontrado');
  }
  const event = normalizeEventDoc(eventSnap.id, eventSnap.data()!);

  let pendingDocs: QueryDocumentSnapshot[] = [];
  try {
    const indexed = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaign.id)
      .where('status', '==', 'pending')
      .limit(limit)
      .get();
    pendingDocs = indexed.docs;
  } catch {
    const all = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaign.id)
      .get();
    pendingDocs = all.docs
      .filter((doc) => doc.data().status === 'pending')
      .slice(0, limit);
  }

  let sent = 0;
  let failed = 0;

  for (const doc of pendingDocs) {
    const recipient = { id: doc.id, ...doc.data() } as InvitationRecipient;
    try {
      await sendInvitationEmail({
        to: recipient.email,
        subject: campaign.subject,
        headline: campaign.headline,
        message: campaign.message,
        event,
        rsvpUrl: invitationRsvpUrl(recipient.token),
        maxTicketsPerInvite: campaign.maxTicketsPerInvite,
      });
      await doc.ref.update({
        status: 'sent',
        sentAt: Timestamp.now(),
        error: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      sent += 1;
    } catch (error) {
      await doc.ref.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Error al enviar',
        updatedAt: FieldValue.serverTimestamp(),
      });
      failed += 1;
    }
    await sleep(180);
  }

  if (sent > 0 || failed > 0) {
    await campaignRef.update({
      sentCount: FieldValue.increment(sent),
      failedCount: FieldValue.increment(failed),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const remaining = pendingDocs.length < limit ? 0 : 1;

  const nextStatus: InvitationCampaign['status'] = remaining === 0 ? 'sent' : 'sending';

  await campaignRef.update({
    status: nextStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    sent,
    failed,
    remaining,
    status: nextStatus,
  };
}

export async function retryFailedInvitations(campaignId: string): Promise<number> {
  const db = getAdminDb();
  let docs: QueryDocumentSnapshot[] = [];
  try {
    const snap = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaignId)
      .where('status', '==', 'failed')
      .get();
    docs = snap.docs;
  } catch {
    const snap = await db
      .collection(COLLECTIONS.invitationRecipients)
      .where('campaignId', '==', campaignId)
      .get();
    docs = snap.docs.filter((doc) => doc.data().status === 'failed');
  }

  if (docs.length === 0) return 0;

  let reset = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) {
      batch.update(doc.ref, {
        status: 'pending',
        error: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      reset += 1;
    }
    await batch.commit();
  }

  await db.collection(COLLECTIONS.invitationCampaigns).doc(campaignId).update({
    status: 'sending',
    failedCount: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return reset;
}
