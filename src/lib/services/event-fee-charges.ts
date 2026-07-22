import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { normalizeProducerPlan } from '@/lib/producer-plan';
import { createPreference } from '@/lib/mercadopago';
import {
  buildEventFeeExternalReference,
  getPlatformMercadoPagoToken,
  isPlatformMercadoPagoConfigured,
} from '@/lib/platform-mercadopago';
import { requestHubInvoiceForTicketronFee } from '@/lib/hub-billing';
import type {
  EventFeeCharge,
  ProducerBillingProfile,
  ProducerPlan,
  SerializedEventFeeCharge,
} from '@/lib/models';

function serializeCharge(
  id: string,
  data: FirebaseFirestore.DocumentData
): SerializedEventFeeCharge {
  return {
    id,
    eventId: data.eventId as string,
    eventName: data.eventName as string,
    eventDate: (data.eventDate as Timestamp).toDate().toISOString(),
    ticketsIssued: data.ticketsIssued as number,
    pricePerTicket: data.pricePerTicket as number,
    pricePerEvent: (data.pricePerEvent as number) ?? 0,
    amount: data.amount as number,
    status: data.status,
    mercadoPagoInitPoint: data.mercadoPagoInitPoint as string | undefined,
    paidAt: data.paidAt
      ? (data.paidAt as Timestamp).toDate().toISOString()
      : undefined,
    billingHubStatus: data.billingHub?.status as string | undefined,
    facturaId: data.billingHub?.facturaId as string | undefined,
  };
}

export function computeEventFeeAmount(opts: {
  ticketsIssued: number;
  pricePerTicket: number;
  pricePerEvent: number;
}): number {
  const tickets = Math.max(0, opts.ticketsIssued) * Math.max(0, opts.pricePerTicket);
  const eventFee = Math.max(0, opts.pricePerEvent);
  return tickets + eventFee;
}

async function getOwnerPlan(ownerId: string): Promise<ProducerPlan | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.users).doc(ownerId).get();
  const raw = snap.data()?.producerPlan;
  if (!raw) return null;
  return normalizeProducerPlan(raw as ProducerPlan);
}

/**
 * Asegura un cargo de fee para un evento ya ocurrido.
 * No bloquea la creación del evento: solo se genera post-fecha.
 */
export async function ensureEventFeeChargeForEvent(
  eventId: string
): Promise<SerializedEventFeeCharge | null> {
  const db = getAdminDb();
  const eventSnap = await db.collection(COLLECTIONS.events).doc(eventId).get();
  if (!eventSnap.exists) return null;

  const event = eventSnap.data()!;
  const eventDate = event.date as Timestamp;
  if (eventDate.toMillis() > Date.now()) return null;

  const ownerId = event.ownerId as string;
  if (!ownerId) return null;

  const plan = await getOwnerPlan(ownerId);
  if (!plan) return null;

  const ticketsIssued = (event.sold as number) ?? 0;
  const amount = computeEventFeeAmount({
    ticketsIssued,
    pricePerTicket: plan.pricePerTicket,
    pricePerEvent: plan.pricePerEvent,
  });

  if (amount <= 0) return null;

  const existing = await db
    .collection(COLLECTIONS.eventFeeCharges)
    .where('eventId', '==', eventId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0]!;
    const data = doc.data();
    // Actualizar conteo si sigue pendiente y vendieron más entradas
    if (data.status === 'pending' || data.status === 'awaiting_payment') {
      const nextAmount = computeEventFeeAmount({
        ticketsIssued,
        pricePerTicket: plan.pricePerTicket,
        pricePerEvent: plan.pricePerEvent,
      });
      if (
        ticketsIssued !== data.ticketsIssued ||
        nextAmount !== data.amount ||
        plan.pricePerTicket !== data.pricePerTicket
      ) {
        await doc.ref.update({
          ticketsIssued,
          pricePerTicket: plan.pricePerTicket,
          pricePerEvent: plan.pricePerEvent,
          amount: nextAmount,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const refreshed = await doc.ref.get();
        return serializeCharge(doc.id, refreshed.data()!);
      }
    }
    return serializeCharge(doc.id, data);
  }

  const now = Timestamp.now();
  const ref = db.collection(COLLECTIONS.eventFeeCharges).doc();
  const payload: Omit<EventFeeCharge, 'id'> = {
    eventId,
    ownerId,
    eventName: event.name as string,
    eventDate,
    ticketsIssued,
    pricePerTicket: plan.pricePerTicket,
    pricePerEvent: plan.pricePerEvent,
    amount,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(payload);
  return serializeCharge(ref.id, payload);
}

export async function listUnpaidEventFeeChargesForOwner(
  ownerId: string
): Promise<SerializedEventFeeCharge[]> {
  const db = getAdminDb();

  // Asegurar cargos para eventos pasados del productor
  const eventsSnap = await db
    .collection(COLLECTIONS.events)
    .where('ownerId', '==', ownerId)
    .get();

  await Promise.all(
    eventsSnap.docs.map(async (d) => {
      const date = d.data().date as Timestamp | undefined;
      if (date && date.toMillis() < Date.now()) {
        await ensureEventFeeChargeForEvent(d.id);
      }
    })
  );

  const snap = await db
    .collection(COLLECTIONS.eventFeeCharges)
    .where('ownerId', '==', ownerId)
    .where('status', 'in', ['pending', 'awaiting_payment'])
    .get();

  return snap.docs
    .map((d) => serializeCharge(d.id, d.data()))
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
}

export async function createEventFeePaymentPreference(opts: {
  chargeId: string;
  ownerId: string;
  ownerEmail: string;
  billingProfile?: ProducerBillingProfile;
}): Promise<{ initPoint: string; amount: number }> {
  if (!isPlatformMercadoPagoConfigured()) {
    throw new Error(
      'El cobro de fees aún no está configurado. Contactá a soporte de Ticketron.'
    );
  }

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.eventFeeCharges).doc(opts.chargeId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Cargo no encontrado');

  const data = snap.data()!;
  if (data.ownerId !== opts.ownerId) throw new Error('No autorizado');
  if (data.status === 'paid' || data.status === 'waived') {
    throw new Error('Este cargo ya está saldado');
  }
  if ((data.amount as number) <= 0) throw new Error('Importe en cero');

  const profile = opts.billingProfile;
  if (!profile?.ivaCondicion) {
    throw new Error(
      'Completá tus datos fiscales en Ajustes (responsable inscripto o monotributo) antes de pagar.'
    );
  }
  if (
    profile.ivaCondicion === 'responsable_inscripto' &&
    (!profile.cuit || profile.cuit.replace(/\D/g, '').length !== 11)
  ) {
    throw new Error('Para factura A necesitás cargar CUIT en Ajustes.');
  }

  const platformToken = getPlatformMercadoPagoToken();
  const externalReference = buildEventFeeExternalReference(opts.chargeId);
  const tickets = data.ticketsIssued as number;
  const title = `Ticketron — fee ${tickets} entrada${tickets === 1 ? '' : 's'} — ${data.eventName}`;

  const hubEmit =
    process.env.MERCADOPAGO_HUB_EMIT_FACTURA === 'true' ||
    process.env.TICKETRON_HUB_EMIT_FACTURA === 'true';

  const preference = await createPreference(
    {
      title,
      unitPrice: data.amount as number,
      quantity: 1,
      externalReference,
      payerEmail: opts.ownerEmail,
      returnPath: '/admin/events?fee=paid',
      metadata: {
        hub_emit_factura: hubEmit ? 'true' : 'false',
        hub_app_id: 'ticketron',
        hub_concepto: title.slice(0, 100),
        hub_charge_id: opts.chargeId,
        ...(profile.cuit
          ? { hub_cuit_comprador: profile.cuit.replace(/\D/g, '').slice(0, 11) }
          : {}),
        ...(profile.razonSocial
          ? { hub_razon_social: profile.razonSocial.slice(0, 100) }
          : {}),
        ...(profile.ivaCondicion === 'responsable_inscripto'
          ? { hub_cbte_tipo: 'A' }
          : { hub_cbte_tipo: 'B' }),
      },
    },
    platformToken
  );

  const initPoint = preference.init_point || preference.sandbox_init_point;
  if (!initPoint) throw new Error('Mercado Pago no devolvió link de pago');

  await ref.update({
    status: 'awaiting_payment',
    mercadoPagoPreferenceId: preference.id,
    mercadoPagoInitPoint: initPoint,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { initPoint, amount: data.amount as number };
}

export async function fulfillEventFeeCharge(
  chargeId: string,
  paymentId: string,
  preferenceId?: string
): Promise<{ created: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.eventFeeCharges).doc(chargeId);

  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Fee charge no encontrado: ${chargeId}`);
    const data = snap.data()!;

    if (data.status === 'paid') {
      return false;
    }

    tx.update(ref, {
      status: 'paid',
      mercadoPagoPaymentId: paymentId,
      ...(preferenceId ? { mercadoPagoPreferenceId: preferenceId } : {}),
      paidAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!created) return { created: false };

  const snap = await ref.get();
  const data = snap.data()!;
  const ownerSnap = await db.collection(COLLECTIONS.users).doc(data.ownerId as string).get();
  const owner = ownerSnap.data();

  try {
    await requestHubInvoiceForTicketronFee({
      adminDb: db,
      chargeDocId: chargeId,
      paymentId,
      amount: data.amount as number,
      preferenceId: (data.mercadoPagoPreferenceId as string) || preferenceId,
      externalReference: buildEventFeeExternalReference(chargeId),
      eventName: data.eventName as string,
      ticketsIssued: data.ticketsIssued as number,
      buyer: {
        email: owner?.email as string | undefined,
        profile: owner?.billingProfile as ProducerBillingProfile | undefined,
      },
    });
  } catch (e) {
    console.error('Hub invoice fee error:', e);
  }

  return { created: true };
}

export async function findEventFeeChargeForPayment(
  preferenceId: string | undefined,
  externalReference: string | undefined
): Promise<{ id: string } | null> {
  const db = getAdminDb();
  const { parseEventFeeExternalReference } = await import('@/lib/platform-mercadopago');
  const chargeId = parseEventFeeExternalReference(externalReference);
  if (chargeId) {
    const snap = await db.collection(COLLECTIONS.eventFeeCharges).doc(chargeId).get();
    if (snap.exists) return { id: snap.id };
  }

  if (preferenceId) {
    const snap = await db
      .collection(COLLECTIONS.eventFeeCharges)
      .where('mercadoPagoPreferenceId', '==', preferenceId)
      .limit(1)
      .get();
    if (!snap.empty) return { id: snap.docs[0]!.id };
  }

  return null;
}
