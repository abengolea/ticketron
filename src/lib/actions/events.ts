'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  verifyIdTokenAndGetUser,
  requireManageEvents,
  isSuperAdmin,
  canAccessGate,
} from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createEventSchema, updateEventSchema } from '@/lib/validations';
import { normalizeEventDoc, serializeEvent } from '@/lib/serialize';
import {
  assertProducerCanCreateEvent,
  incrementProducerEventUsage,
  requireEventAccess,
} from '@/lib/tenant';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { PlatformEvent, SerializedEvent } from '@/lib/models';

function eventsQueryForUser(user: { uid: string; role: string }) {
  return getAdminDb()
    .collection(COLLECTIONS.events)
    .where('ownerId', '==', user.uid);
}

function sortEventsByDateDesc(events: SerializedEvent[]): SerializedEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function listEvents(
  idToken: string
): Promise<ActionResult<SerializedEvent[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const snap = await eventsQueryForUser(user).get();

    const events = sortEventsByDateDesc(
      snap.docs.map((d) => serializeEvent(normalizeEventDoc(d.id, d.data())))
    );
    return ok(events);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al listar eventos');
  }
}

export async function listAllEventsSuperAdmin(
  idToken: string
): Promise<ActionResult<(SerializedEvent & { ownerEmail?: string })[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!isSuperAdmin(user)) return fail('No autorizado');

    const snap = await getAdminDb().collection(COLLECTIONS.events).get();

    const ownerIds = [...new Set(snap.docs.map((d) => d.data().ownerId as string).filter(Boolean))];
    const ownerEmails = new Map<string, string>();
    await Promise.all(
      ownerIds.map(async (uid) => {
        const u = await getAdminDb().collection(COLLECTIONS.users).doc(uid).get();
        if (u.exists) ownerEmails.set(uid, u.data()!.email as string);
      })
    );

    const events = sortEventsByDateDesc(
      snap.docs.map((d) => {
        const normalized = normalizeEventDoc(d.id, d.data());
        const serialized = serializeEvent(normalized);
        return {
          ...serialized,
          ownerEmail: normalized.ownerId
            ? ownerEmails.get(normalized.ownerId)
            : undefined,
        };
      })
    );
    return ok(events);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al listar eventos');
  }
}

export async function createEvent(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedEvent>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    await assertProducerCanCreateEvent(user);

    const parsed = createEventSchema.parse(input);
    const db = getAdminDb();
    const ref = db.collection(COLLECTIONS.events).doc();
    const now = Timestamp.now();

    const data = {
      name: parsed.name,
      date: Timestamp.fromDate(new Date(parsed.date)),
      location: parsed.location ?? null,
      active: parsed.active,
      capacity: parsed.capacity,
      sold: 0,
      price: parsed.price,
      ownerId: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(data);
    await incrementProducerEventUsage(user);

    return ok(serializeEvent({ id: ref.id, ...data } as PlatformEvent));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear evento');
  }
}

export async function updateEvent(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedEvent>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const parsed = updateEventSchema.parse(input);
    const { id, ...rest } = parsed;
    await requireEventAccess(user, id);

    const db = getAdminDb();
    const ref = db.collection(COLLECTIONS.events).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail('Evento no encontrado');

    const current = snap.data()!;
    if (rest.capacity !== undefined && rest.capacity < (current.sold ?? 0)) {
      return fail(
        `La capacidad no puede ser menor a las ${current.sold} entradas ya vendidas`
      );
    }

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (rest.name !== undefined) update.name = rest.name;
    if (rest.date !== undefined) update.date = Timestamp.fromDate(new Date(rest.date));
    if (rest.location !== undefined) update.location = rest.location || null;
    if (rest.active !== undefined) update.active = rest.active;
    if (rest.capacity !== undefined) update.capacity = rest.capacity;
    if (rest.price !== undefined) update.price = rest.price;

    await ref.update(update);
    const updated = await ref.get();
    return ok(serializeEvent({ id, ...updated.data() } as PlatformEvent));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al actualizar evento');
  }
}

/** Eventos activos visibles en el hub de puerta (sin login). */
export async function listActiveEventsPublic(): Promise<ActionResult<SerializedEvent[]>> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.events).get();

    const events = sortEventsByDateDesc(
      snap.docs
        .map((d) => serializeEvent(normalizeEventDoc(d.id, d.data())))
        .filter((e) => e.active)
    );
    return ok(events);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al listar eventos');
  }
}

/** Eventos activos para elegir en el validador digital (puerta). */
export async function listEventsForGate(
  idToken: string
): Promise<ActionResult<SerializedEvent[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) {
      return fail('No autorizado');
    }

    const snap = await getAdminDb().collection(COLLECTIONS.events).get();

    const events = sortEventsByDateDesc(
      snap.docs
        .map((d) => serializeEvent(normalizeEventDoc(d.id, d.data())))
        .filter((e) => e.active)
    );
    return ok(events);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al listar eventos');
  }
}

export async function getEvent(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedEvent>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const event = await requireEventAccess(user, eventId);
    return ok(serializeEvent(event));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getEventPublic(
  eventId: string
): Promise<ActionResult<SerializedEvent>> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.events).doc(eventId).get();
    if (!snap.exists) return fail('Evento no encontrado');
    const data = snap.data()!;
    if (!data.active) return fail('Evento no disponible');
    return ok(serializeEvent(normalizeEventDoc(snap.id, data)));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
