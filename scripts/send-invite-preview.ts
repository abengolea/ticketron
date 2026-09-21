/**
 * Envía un mail de prueba de invitación (carta M&A + botón RSVP).
 *
 * Uso:
 *   npx tsx scripts/send-invite-preview.ts
 *   npx tsx scripts/send-invite-preview.ts otro@email.com
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const DEFAULT_TO = 'abengolea1@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ticketron.com.ar';

async function main() {
  const to = (process.argv[2]?.trim() || DEFAULT_TO).toLowerCase();
  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const { generateSecureToken } = await import('../src/lib/tokens');
  const { defaultInvitationCopy } = await import('../src/lib/invitation-copy');
  const { invitationRsvpUrl, sendInvitationEmail, getEmailFromConfig } = await import(
    '../src/lib/services/invitation-send'
  );
  const { normalizeEventDoc } = await import('../src/lib/serialize');

  const configEmail = getEmailFromConfig();
  if (!configEmail.ready) {
    throw new Error('Falta RESEND_API_KEY o EMAIL_FROM en .env.local');
  }

  const db = getAdminDb();
  const eventsSnap = await db.collection(COLLECTIONS.events).get();
  if (eventsSnap.empty) {
    throw new Error('No hay eventos en Firestore');
  }

  const events = eventsSnap.docs.map((doc) => normalizeEventDoc(doc.id, doc.data()));
  events.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  const event =
    events.find((item) => /m&a|música|musica|fest/i.test(item.name)) ?? events[0]!;

  const copy = defaultInvitationCopy(event.name);
  const campaignId = `preview_script_${event.id}`;
  const campaignRef = db.collection(COLLECTIONS.invitationCampaigns).doc(campaignId);
  const now = Timestamp.now();

  const existing = await db
    .collection(COLLECTIONS.invitationRecipients)
    .where('campaignId', '==', campaignId)
    .get();
  const mine = existing.docs.find(
    (doc) => (doc.data().email as string | undefined)?.toLowerCase() === to
  );

  let token = mine?.id;
  if (mine) {
    const status = mine.data().status as string;
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
    await db.collection(COLLECTIONS.invitationRecipients).doc(token).set({
      campaignId,
      eventId: event.id,
      token,
      email: to,
      displayName: 'Prueba',
      source: 'manual',
      status: 'sent',
      preview: true,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!token) {
    throw new Error('No se pudo crear el link de prueba');
  }

  await campaignRef.set(
    {
      eventId: event.id,
      ownerId: event.ownerId || 'script',
      subject: copy.subject,
      headline: copy.headline,
      message: copy.message,
      maxTicketsPerInvite: 6,
      status: 'sent',
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      rsvpCount: 0,
      declinedCount: 0,
      reservedTickets: 0,
      preview: true,
      createdBy: 'script',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const rsvpUrl = invitationRsvpUrl(token, APP_URL);
  await sendInvitationEmail({
    to,
    subject: copy.subject,
    headline: copy.headline,
    message: copy.message,
    event,
    rsvpUrl,
    maxTicketsPerInvite: 6,
    isPreview: true,
  });

  console.log('Enviado.');
  console.log('  To:     ', to);
  console.log('  Evento: ', event.name, `(${event.id})`);
  console.log('  RSVP:   ', rsvpUrl);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
