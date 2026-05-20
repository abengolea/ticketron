'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole, isAdmin, canAccessGate } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createEventSchema, updateEventSchema } from '@/lib/validations';
import { serializeEvent } from '@/lib/serialize';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { SerializedEvent } from '@/lib/models';

export async function listEvents(
  idToken: string
): Promise<ActionResult<SerializedEvent[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const snap = await getAdminDb()
      .collection(COLLECTIONS.events)
      .orderBy('date', 'desc')
      .get();

    const events = snap.docs.map((d) =>
      serializeEvent({ id: d.id, ...d.data() } as Parameters<typeof serializeEvent>[0])
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
    requireRole(user, 'admin');

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
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(data);
    return ok(serializeEvent({ id: ref.id, ...data } as Parameters<typeof serializeEvent>[0]));
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
    requireRole(user, 'admin');

    const parsed = updateEventSchema.parse(input);
    const { id, ...rest } = parsed;
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
    return ok(
      serializeEvent({ id, ...updated.data() } as Parameters<typeof serializeEvent>[0])
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al actualizar evento');
  }
}

/** Eventos activos visibles en el hub de puerta (sin login). */
export async function listActiveEventsPublic(): Promise<ActionResult<SerializedEvent[]>> {
  try {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.events)
      .orderBy('date', 'desc')
      .get();

    const events = snap.docs
      .map((d) =>
        serializeEvent({ id: d.id, ...d.data() } as Parameters<typeof serializeEvent>[0])
      )
      .filter((e) => e.active);
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

    const snap = await getAdminDb()
      .collection(COLLECTIONS.events)
      .orderBy('date', 'desc')
      .get();

    const events = snap.docs
      .map((d) =>
        serializeEvent({ id: d.id, ...d.data() } as Parameters<typeof serializeEvent>[0])
      )
      .filter((e) => e.active);
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
    requireRole(user, 'admin');

    const snap = await getAdminDb().collection(COLLECTIONS.events).doc(eventId).get();
    if (!snap.exists) return fail('Evento no encontrado');
    return ok(
      serializeEvent({ id: snap.id, ...snap.data() } as Parameters<typeof serializeEvent>[0])
    );
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
    return ok(serializeEvent({ id: snap.id, ...data } as Parameters<typeof serializeEvent>[0]));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
