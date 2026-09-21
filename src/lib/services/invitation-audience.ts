import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase-admin';
import { isSuperAdmin } from '@/lib/auth-server';
import { getOwnedEventIds } from '@/lib/tenant';
import type {
  AppUser,
  InvitationAudiencePreview,
  InvitationRecipientSource,
  UserRole,
} from '@/lib/models';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AUDIENCE = 2000;
const STAFF_ROLES: UserRole[] = [
  'superadmin',
  'producer',
  'dirigente',
  'seller',
  'gate',
];

export interface AudienceContact {
  email: string;
  displayName?: string;
  source: InvitationRecipientSource;
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function parseExtraEmails(raw: string | undefined): {
  emails: string[];
  skippedInvalid: number;
} {
  if (!raw?.trim()) return { emails: [], skippedInvalid: 0 };
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const emails: string[] = [];
  let skippedInvalid = 0;
  const seen = new Set<string>();
  for (const part of parts) {
    const email = normalizeEmail(part);
    if (!email) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { emails, skippedInvalid };
}

function remember(
  map: Map<string, AudienceContact>,
  email: string | undefined,
  displayName: string | undefined,
  source: InvitationRecipientSource
) {
  const normalized = email ? normalizeEmail(email) : null;
  if (!normalized) return;
  const existing = map.get(normalized);
  const name = displayName?.trim();
  if (!existing) {
    map.set(normalized, {
      email: normalized,
      source,
      ...(name ? { displayName: name } : {}),
    });
    return;
  }
  if (!existing.displayName && name) {
    existing.displayName = name;
  }
}

async function loadTicketedEmails(
  db: Firestore,
  eventId: string
): Promise<Set<string>> {
  const snap = await db
    .collection(COLLECTIONS.tickets)
    .where('eventId', '==', eventId)
    .select('buyerEmail', 'status')
    .get();
  const emails = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === 'CANCELLED') continue;
    const email = normalizeEmail(String(data.buyerEmail ?? ''));
    if (email) emails.add(email);
  }
  return emails;
}

async function loadAlreadyInvitedEmails(
  db: Firestore,
  eventId: string
): Promise<Set<string>> {
  const snap = await db
    .collection(COLLECTIONS.invitationRecipients)
    .where('eventId', '==', eventId)
    .select('email', 'status', 'preview')
    .get();
  const emails = new Set<string>();
  for (const doc of snap.docs) {
    if (doc.data().preview === true) continue;
    const status = doc.data().status as string;
    if (status === 'failed' || status === 'declined') continue;
    const email = normalizeEmail(String(doc.data().email ?? ''));
    if (email) emails.add(email);
  }
  return emails;
}

async function collectFromUsers(
  db: Firestore,
  includeStaff: boolean
): Promise<AudienceContact[]> {
  const snap = await db
    .collection(COLLECTIONS.users)
    .select('email', 'displayName', 'role', 'active')
    .get();
  const map = new Map<string, AudienceContact>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.active === false) continue;
    const role = data.role as UserRole | undefined;
    if (!includeStaff && role && STAFF_ROLES.includes(role)) continue;
    remember(map, data.email as string | undefined, data.displayName as string | undefined, 'user');
  }
  return [...map.values()];
}

async function collectFromEventDocs(
  db: Firestore,
  eventIds: string[]
): Promise<AudienceContact[]> {
  const map = new Map<string, AudienceContact>();
  const chunks: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    chunks.push(eventIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const [ticketsSnap, linksSnap] = await Promise.all([
      Promise.all(
        chunk.map((eventId) =>
          db
            .collection(COLLECTIONS.tickets)
            .where('eventId', '==', eventId)
            .select('buyerEmail', 'buyerName')
            .get()
        )
      ),
      Promise.all(
        chunk.map((eventId) =>
          db
            .collection(COLLECTIONS.paymentLinks)
            .where('eventId', '==', eventId)
            .select('buyerEmail', 'buyerName')
            .get()
        )
      ),
    ]);

    for (const snap of ticketsSnap) {
      for (const doc of snap.docs) {
        const data = doc.data();
        remember(
          map,
          data.buyerEmail as string | undefined,
          data.buyerName as string | undefined,
          'ticket'
        );
      }
    }
    for (const snap of linksSnap) {
      for (const doc of snap.docs) {
        const data = doc.data();
        remember(
          map,
          data.buyerEmail as string | undefined,
          data.buyerName as string | undefined,
          'paymentLink'
        );
      }
    }
  }

  return [...map.values()];
}

export async function collectInvitationAudience(
  db: Firestore,
  user: AppUser,
  options: {
    eventId: string;
    extraEmails?: string;
    includeStaff?: boolean;
  }
): Promise<{
  contacts: AudienceContact[];
  preview: InvitationAudiencePreview;
}> {
  const includeStaff = options.includeStaff === true;
  const extraParsed = parseExtraEmails(options.extraEmails);
  const map = new Map<string, AudienceContact>();

  if (isSuperAdmin(user)) {
    const [users, allTickets, allLinks] = await Promise.all([
      collectFromUsers(db, includeStaff),
      db.collection(COLLECTIONS.tickets).select('buyerEmail', 'buyerName').get(),
      db.collection(COLLECTIONS.paymentLinks).select('buyerEmail', 'buyerName').get(),
    ]);
    for (const contact of users) remember(map, contact.email, contact.displayName, contact.source);
    for (const doc of allTickets.docs) {
      const data = doc.data();
      remember(
        map,
        data.buyerEmail as string | undefined,
        data.buyerName as string | undefined,
        'ticket'
      );
    }
    for (const doc of allLinks.docs) {
      const data = doc.data();
      remember(
        map,
        data.buyerEmail as string | undefined,
        data.buyerName as string | undefined,
        'paymentLink'
      );
    }
  } else {
    const eventIds = await getOwnedEventIds(user);
    const fromEvents = await collectFromEventDocs(db, eventIds);
    for (const contact of fromEvents) {
      remember(map, contact.email, contact.displayName, contact.source);
    }
  }

  const fromDatabase = map.size;
  const [alreadyTicketed, alreadyInvited] = await Promise.all([
    loadTicketedEmails(db, options.eventId),
    loadAlreadyInvitedEmails(db, options.eventId),
  ]);

  let skippedAlreadyTicketed = 0;
  let skippedAlreadyInvited = 0;
  for (const email of [...map.keys()]) {
    if (alreadyTicketed.has(email)) {
      map.delete(email);
      skippedAlreadyTicketed += 1;
      continue;
    }
    if (alreadyInvited.has(email)) {
      map.delete(email);
      skippedAlreadyInvited += 1;
    }
  }

  let extra = 0;
  for (const email of extraParsed.emails) {
    if (alreadyTicketed.has(email) || alreadyInvited.has(email) || map.has(email)) {
      continue;
    }
    map.set(email, { email, source: 'manual' });
    extra += 1;
  }

  const contacts = [...map.values()].sort((a, b) => a.email.localeCompare(b.email));
  const capped = contacts.slice(0, MAX_AUDIENCE);
  const bySource: Record<InvitationRecipientSource, number> = {
    user: 0,
    ticket: 0,
    paymentLink: 0,
    manual: 0,
  };
  for (const contact of capped) {
    bySource[contact.source] += 1;
  }

  return {
    contacts: capped,
    preview: {
      total: capped.length,
      fromDatabase,
      extra,
      skippedAlreadyTicketed,
      skippedAlreadyInvited,
      skippedInvalid: extraParsed.skippedInvalid,
      bySource,
      sample: capped.slice(0, 8).map((c) => ({
        email: c.email,
        source: c.source,
        ...(c.displayName ? { displayName: c.displayName } : {}),
      })),
    },
  };
}
