import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AuthError, isProducer, isSuperAdmin } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  canCreateEvent,
  normalizeProducerPlan,
  refreshQuotaPeriodIfNeeded,
} from '@/lib/producer-plan';
import { normalizeEventDoc } from '@/lib/serialize';
import type { AppUser, PlatformEvent, ProducerPlan } from '@/lib/models';

export type EventWithId = PlatformEvent & { id: string };

export async function getEventById(eventId: string): Promise<EventWithId | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.events).doc(eventId).get();
  if (!snap.exists) return null;
  return normalizeEventDoc(snap.id, snap.data()!);
}

export async function requireEventAccess(
  user: AppUser,
  eventId: string
): Promise<EventWithId> {
  const event = await getEventById(eventId);
  if (!event) throw new AuthError('Evento no encontrado', 'FORBIDDEN');

  if (isSuperAdmin(user) || (isProducer(user) && event.ownerId === user.uid)) {
    return event;
  }

  throw new AuthError('No autorizado para este evento', 'FORBIDDEN');
}

export async function getOwnedEventIds(user: AppUser): Promise<string[]> {
  if (isSuperAdmin(user)) {
    const snap = await getAdminDb().collection(COLLECTIONS.events).select().get();
    return snap.docs.map((d) => d.id);
  }

  const snap = await getAdminDb()
    .collection(COLLECTIONS.events)
    .where('ownerId', '==', user.uid)
    .select()
    .get();
  return snap.docs.map((d) => d.id);
}

export async function getMercadoPagoTokenForEvent(eventId: string): Promise<string> {
  const event = await getEventById(eventId);
  if (!event?.ownerId) {
    throw new Error('Evento sin productor asignado');
  }
  return getMercadoPagoTokenForOwner(event.ownerId);
}

export async function getMercadoPagoTokenForOwner(ownerId: string): Promise<string> {
  const snap = await getAdminDb().collection(COLLECTIONS.users).doc(ownerId).get();
  if (!snap.exists) {
    throw new Error('Productor del evento no encontrado');
  }

  const token = snap.data()?.mercadoPagoAccessToken as string | undefined;
  if (!token?.trim()) {
    throw new Error(
      'El productor no tiene vinculada su cuenta de Mercado Pago. Configurala en Ajustes.'
    );
  }
  return token.trim();
}

export async function assertProducerCanCreateEvent(user: AppUser): Promise<void> {
  if (isSuperAdmin(user)) return;
  if (!isProducer(user)) {
    throw new AuthError('No tenés permisos para crear eventos', 'FORBIDDEN');
  }

  const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
  const rawPlan = snap.data()?.producerPlan as ProducerPlan | undefined;
  if (!rawPlan) {
    throw new AuthError('Tu cuenta no tiene un plan activo', 'FORBIDDEN');
  }

  let plan = normalizeProducerPlan(rawPlan);
  plan = refreshQuotaPeriodIfNeeded(plan);

  const check = canCreateEvent(plan);
  if (!check.ok) {
    throw new AuthError(check.reason, 'FORBIDDEN');
  }

  const needsPersist =
    plan.eventsUsed !== rawPlan.eventsUsed ||
    plan.quotaPeriodStart.toMillis() !== rawPlan.quotaPeriodStart.toMillis();

  if (needsPersist) {
    await snap.ref.update({
      producerPlan: plan,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function incrementProducerEventUsage(user: AppUser): Promise<void> {
  if (isSuperAdmin(user)) return;
  if (!isProducer(user)) return;

  const ref = getAdminDb().collection(COLLECTIONS.users).doc(user.uid);
  const snap = await ref.get();
  const rawPlan = snap.data()?.producerPlan as ProducerPlan | undefined;
  if (!rawPlan) return;

  let plan = normalizeProducerPlan(rawPlan);
  plan = refreshQuotaPeriodIfNeeded(plan);

  if (plan.quotaType !== 'unlimited') {
    plan = { ...plan, eventsUsed: plan.eventsUsed + 1 };
  }

  await ref.update({
    producerPlan: plan,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
