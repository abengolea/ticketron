'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { cancelTicketSchema, archiveTicketSchema } from '@/lib/validations';
import { serializeTicket } from '@/lib/serialize';
import { getTicketPaymentDisplay } from '@/lib/payment-display';
import { loadSerializedPaymentLinksByIds } from '@/lib/services/payment-links-batch';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  SerializedTicket,
  SerializedTicketWithPayment,
  PlatformTicket,
} from '@/lib/models';

export async function getTicketByCode(
  ticketCode: string
): Promise<ActionResult<SerializedTicket & { eventName: string; eventDate: string }>> {
  try {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.tickets)
      .where('ticketCode', '==', ticketCode.toUpperCase())
      .limit(1)
      .get();

    if (snap.empty) return fail('Entrada no encontrada', 'NOT_FOUND');

    const doc = snap.docs[0]!;
    const ticket = { id: doc.id, ...doc.data() } as PlatformTicket;
    const eventSnap = await getAdminDb().collection(COLLECTIONS.events).doc(ticket.eventId).get();
    const event = eventSnap.data()!;

    return ok({
      ...serializeTicket(ticket),
      eventName: event.name,
      eventDate: event.date.toDate().toISOString(),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export type TicketPageByTokenData =
  | {
      status: 'pending';
      buyerEmail?: string;
    }
  | {
      status: 'ready';
      tickets: SerializedTicket[];
      eventName: string;
      eventDate: string;
      buyerEmail?: string;
    };

export async function getTicketsByPaymentLinkToken(
  token: string
): Promise<ActionResult<TicketPageByTokenData>> {
  try {
    const linkSnap = await getAdminDb()
      .collection(COLLECTIONS.paymentLinks)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (linkSnap.empty) return fail('Link no encontrado');

    const link = linkSnap.docs[0]!;
    const linkData = link.data();
    const buyerEmail = linkData.buyerEmail as string | undefined;

    if (linkData.status !== 'PAID') {
      return ok({ status: 'pending', buyerEmail });
    }

    const ticketSnap = await getAdminDb()
      .collection(COLLECTIONS.tickets)
      .where('paymentLinkId', '==', link.id)
      .get();

    if (ticketSnap.empty) {
      return ok({ status: 'pending', buyerEmail });
    }

    const eventSnap = await getAdminDb()
      .collection(COLLECTIONS.events)
      .doc(linkData.eventId)
      .get();
    const event = eventSnap.data()!;

    const tickets = ticketSnap.docs.map((d) =>
      serializeTicket({ id: d.id, ...d.data() } as PlatformTicket)
    );
    return ok({
      status: 'ready',
      tickets,
      eventName: event.name,
      eventDate: event.date.toDate().toISOString(),
      buyerEmail,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export type ListTicketsForEventResult = {
  tickets: SerializedTicketWithPayment[];
  hasMore: boolean;
};

const DEFAULT_TICKETS_PAGE_SIZE = 20;

export async function listTicketsForEvent(
  idToken: string,
  eventId: string,
  options?: {
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }
): Promise<ActionResult<ListTicketsForEventResult>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const db = getAdminDb();
    const pageSize = options?.limit ?? DEFAULT_TICKETS_PAGE_SIZE;

    let ticketsQuery = db
      .collection(COLLECTIONS.tickets)
      .where('eventId', '==', eventId)
      .orderBy('createdAt', 'desc');

    if (options?.cursor) {
      const cursorSnap = await db.collection(COLLECTIONS.tickets).doc(options.cursor).get();
      if (cursorSnap.exists) {
        ticketsQuery = ticketsQuery.startAfter(cursorSnap);
      }
    }

    const [snap, eventSnap] = await Promise.all([
      ticketsQuery.limit(pageSize + 1).get(),
      db.collection(COLLECTIONS.events).doc(eventId).get(),
    ]);

    if (!eventSnap.exists) return fail('Evento no encontrado');
    const unitPrice = eventSnap.data()!.price as number;

    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    let tickets = pageDocs.map((d) =>
      serializeTicket({ id: d.id, ...d.data() } as PlatformTicket)
    );

    if (!options?.includeArchived) {
      tickets = tickets.filter((t) => !t.archived);
    }

    const linkById = await loadSerializedPaymentLinksByIds(
      tickets.map((t) => t.paymentLinkId)
    );

    const withPayment: SerializedTicketWithPayment[] = tickets.map((t) => {
      const payment = getTicketPaymentDisplay(linkById.get(t.paymentLinkId), {
        unitPrice,
      });
      return {
        ...t,
        paymentFormatted: payment.formatted,
        paymentAmount: payment.amountPerTicket,
        paymentMethod: payment.method,
      };
    });

    return ok({ tickets: withPayment, hasMore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function archiveTicket(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const { ticketId } = archiveTicketSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.tickets).doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Entrada no encontrada');

    const ticket = snap.data()!;
    if (ticket.archived) return ok(undefined);

    await ref.update({
      archived: true,
      archivedAt: Timestamp.now(),
    });
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function cancelTicket(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const { ticketId } = cancelTicketSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.tickets).doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Ticket no encontrado');

    await ref.update({ status: 'CANCELLED' });
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function exportTicketsCsv(
  idToken: string,
  eventId?: string
): Promise<ActionResult<string>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    let query = getAdminDb().collection(COLLECTIONS.tickets) as FirebaseFirestore.Query;
    if (eventId) query = query.where('eventId', '==', eventId);

    const snap = await query.get();
    const linkIds = snap.docs.map((d) => d.data().paymentLinkId as string);
    const linkById = await loadSerializedPaymentLinksByIds(linkIds);

    let unitPrice: number | undefined;
    if (eventId) {
      const eventSnap = await getAdminDb().collection(COLLECTIONS.events).doc(eventId).get();
      if (eventSnap.exists) unitPrice = eventSnap.data()!.price as number;
    }

    const header =
      'ticketCode,buyerName,buyerEmail,buyerPhone,paymentMethod,paymentAmount,status,eventId,sellerId,createdAt\n';
    const rows = snap.docs.map((d) => {
      const t = d.data();
      const payment = getTicketPaymentDisplay(linkById.get(t.paymentLinkId), {
        unitPrice,
      });
      return [
        t.ticketCode,
        `"${(t.buyerName ?? '').replace(/"/g, '""')}"`,
        t.buyerEmail ?? '',
        t.buyerPhone ?? '',
        payment.label,
        payment.amountPerTicket,
        t.status,
        t.eventId,
        t.sellerId,
        t.createdAt?.toDate?.()?.toISOString() ?? '',
      ].join(',');
    });

    return ok(header + rows.join('\n'));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
