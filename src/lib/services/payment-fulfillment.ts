import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { generateTicketCode } from '@/lib/tokens';
import { buildQrPayload } from '@/lib/qr';
import type { PaymentLink, PlatformTicket } from '@/lib/models';

/**
 * Emite tickets tras pago aprobado — IDEMPOTENTE.
 * Crea tantos tickets como indique ticketQuantity en el link.
 */
export async function fulfillPaymentLink(
  paymentLinkId: string,
  mercadoPagoPaymentId: string
): Promise<{ created: boolean; ticketCodes?: string[] }> {
  const db = getAdminDb();

  return db.runTransaction(async (tx) => {
    const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
    const linkSnap = await tx.get(linkRef);

    if (!linkSnap.exists) {
      throw new Error(`PaymentLink no encontrado: ${paymentLinkId}`);
    }

    const link = { id: linkSnap.id, ...linkSnap.data() } as PaymentLink;
    const ticketQuantity = link.ticketQuantity ?? 1;

    const existingTickets = await tx.get(
      db.collection(COLLECTIONS.tickets).where('paymentLinkId', '==', paymentLinkId)
    );

    if (existingTickets.size >= ticketQuantity) {
      const codes = existingTickets.docs.map(
        (d) => (d.data() as PlatformTicket).ticketCode
      );
      if (link.status !== 'PAID') {
        tx.update(linkRef, {
          status: 'PAID',
          mercadoPagoPaymentId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { created: false, ticketCodes: codes };
    }

    if (link.status === 'CANCELLED' || link.status === 'EXPIRED') {
      throw new Error(`PaymentLink en estado ${link.status}, no se emite ticket`);
    }

    const now = Timestamp.now();
    if (link.expiresAt.toMillis() < now.toMillis() && link.status === 'PENDING_PAYMENT') {
      tx.update(linkRef, { status: 'EXPIRED', updatedAt: FieldValue.serverTimestamp() });
      throw new Error('PaymentLink vencido');
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
        buyerName: buyerName || 'Comprador',
        buyerPhone: link.buyerPhone,
        buyerEmail: link.buyerEmail,
        status: 'VALID',
        qrPayload,
        createdAt: now,
      };
      tx.set(ticketRef, ticket);
      newCodes.push(ticketCode);
    }

    tx.update(linkRef, {
      status: 'PAID',
      mercadoPagoPaymentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
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

/** Busca paymentLink por preferenceId o external_reference (paymentLinkId) */
export async function findPaymentLinkForPayment(
  preferenceId: string | undefined,
  externalReference: string | undefined
): Promise<PaymentLink | null> {
  const db = getAdminDb();

  if (externalReference) {
    const doc = await db.collection(COLLECTIONS.paymentLinks).doc(externalReference).get();
    if (doc.exists) return { id: doc.id, ...doc.data() } as PaymentLink;
  }

  if (preferenceId) {
    const q = await db
      .collection(COLLECTIONS.paymentLinks)
      .where('mercadoPagoPreferenceId', '==', preferenceId)
      .limit(1)
      .get();
    if (!q.empty) {
      const d = q.docs[0]!;
      return { id: d.id, ...d.data() } as PaymentLink;
    }
  }

  return null;
}
