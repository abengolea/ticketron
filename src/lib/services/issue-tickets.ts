import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { generateTicketCode } from '@/lib/tokens';
import { buildQrPayload } from '@/lib/qr';
import type { PaymentLink, PlatformTicket } from '@/lib/models';

/**
 * Emite tickets para un paymentLink ya en estado PAID — IDEMPOTENTE.
 */
export async function issueTicketsForLink(
  paymentLinkId: string
): Promise<{ created: boolean; ticketCodes: string[] }> {
  const db = getAdminDb();

  return db.runTransaction(async (tx) => {
    const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
    const linkSnap = await tx.get(linkRef);

    if (!linkSnap.exists) {
      throw new Error(`PaymentLink no encontrado: ${paymentLinkId}`);
    }

    const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;
    const ticketQuantity = link.ticketQuantity ?? 1;

    if (link.status !== 'PAID') {
      throw new Error(`PaymentLink en estado ${link.status}, no se emite ticket`);
    }

    const existingTickets = await tx.get(
      db.collection(COLLECTIONS.tickets).where('paymentLinkId', '==', paymentLinkId)
    );

    if (existingTickets.size >= ticketQuantity) {
      return {
        created: false,
        ticketCodes: existingTickets.docs.map(
          (d) => (d.data() as PlatformTicket).ticketCode
        ),
      };
    }

    const eventRef = db.collection(COLLECTIONS.events).doc(link.eventId);
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists) throw new Error('Evento no encontrado');
    const event = eventSnap.data()!;
    if (!event.active) throw new Error('Evento inactivo');

    const toCreate = ticketQuantity - existingTickets.size;
    if (event.sold + toCreate > event.capacity) {
      throw new Error('Evento sin capacidad disponible');
    }

    const accessQuery = db
      .collection(COLLECTIONS.sellerEventAccess)
      .where('sellerId', '==', link.sellerId)
      .where('eventId', '==', link.eventId)
      .limit(1);
    const accessSnap = await tx.get(accessQuery);

    let accessDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    if (!accessSnap.empty) {
      accessDoc = accessSnap.docs[0]!;
      const access = accessDoc.data();
      if (!access.active) throw new Error('Acceso vendedor inactivo');
      if (access.sold + toCreate > access.quota) {
        throw new Error('Cupo vendedor agotado');
      }
    } else {
      const sellerSnap = await tx.get(
        db.collection(COLLECTIONS.users).doc(link.sellerId)
      );
      if (!sellerSnap.exists || sellerSnap.data()?.role !== 'admin') {
        throw new Error('Acceso vendedor no encontrado');
      }
    }

    const buyerName = [link.buyerName, link.buyerLastName].filter(Boolean).join(' ');
    const now = Timestamp.now();
    const newCodes: string[] = [];

    for (let i = 0; i < toCreate; i++) {
      const ticketCode = generateTicketCode();
      const qrPayload = buildQrPayload(ticketCode);
      const ticketRef = db.collection(COLLECTIONS.tickets).doc();
      const ticket: Omit<PlatformTicket, 'id'> = {
        ticketCode,
        paymentLinkId: link.id,
        eventId: link.eventId,
        sellerId: link.sellerId,
        buyerName: buyerName || 'Invitado',
        status: 'VALID',
        qrPayload,
        createdAt: now,
        ...(link.buyerPhone ? { buyerPhone: link.buyerPhone } : {}),
        ...(link.buyerEmail ? { buyerEmail: link.buyerEmail } : {}),
      };
      tx.set(ticketRef, ticket);
      newCodes.push(ticketCode);
    }

    tx.update(eventRef, {
      sold: FieldValue.increment(toCreate),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (accessDoc) {
      tx.update(accessDoc.ref, {
        sold: FieldValue.increment(toCreate),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const existingCodes = existingTickets.docs.map(
      (d) => (d.data() as PlatformTicket).ticketCode
    );
    return { created: true, ticketCodes: [...existingCodes, ...newCodes] };
  });
}
