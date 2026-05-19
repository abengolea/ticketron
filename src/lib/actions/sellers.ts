'use server';

import {
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminAuth, getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createSellerAccessSchema, createSellerSchema, updateUserSchema } from '@/lib/validations';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { SerializedSellerAccess, UserRole } from '@/lib/models';

export interface UserListItem {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}

export async function listUsers(idToken: string): Promise<ActionResult<UserListItem[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const snap = await getAdminDb().collection(COLLECTIONS.users).get();
    const users = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: data.email as string,
        displayName: data.displayName as string,
        role: data.role as UserRole,
        active: data.active as boolean,
      };
    });
    return ok(users);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function createSeller(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ uid: string }>> {
  try {
    const admin = await verifyIdTokenAndGetUser(idToken);
    requireRole(admin, 'admin');

    const parsed = createSellerSchema.parse(input);
    const auth = getAdminAuth();

    const userRecord = await auth.createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.displayName,
    });

    const now = Timestamp.now();
    await getAdminDb().collection(COLLECTIONS.users).doc(userRecord.uid).set({
      email: parsed.email,
      displayName: parsed.displayName,
      role: 'seller',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    return ok({ uid: userRecord.uid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg.includes('email-already-exists')) {
      return fail('Ya existe un usuario con ese email');
    }
    return fail(msg);
  }
}

export async function updateUser(
  idToken: string,
  input: unknown
): Promise<ActionResult<UserListItem>> {
  try {
    const admin = await verifyIdTokenAndGetUser(idToken);
    requireRole(admin, 'admin');

    const parsed = updateUserSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.users).doc(parsed.uid);
    const snap = await ref.get();
    if (!snap.exists) return fail('Usuario no encontrado');

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (parsed.role !== undefined) update.role = parsed.role;
    if (parsed.active !== undefined) update.active = parsed.active;
    if (parsed.displayName !== undefined) update.displayName = parsed.displayName;

    await ref.update(update);
    const updated = await ref.get();
    const data = updated.data()!;
    return ok({
      uid: parsed.uid,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      active: data.active,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function assignSellerAccess(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    const parsed = createSellerAccessSchema.parse(input);
    const db = getAdminDb();

    const seller = await db.collection(COLLECTIONS.users).doc(parsed.sellerId).get();
    if (!seller.exists || seller.data()?.role !== 'seller') {
      return fail('Vendedor no válido');
    }

    const event = await db.collection(COLLECTIONS.events).doc(parsed.eventId).get();
    if (!event.exists) return fail('Evento no encontrado');

    const existing = await db
      .collection(COLLECTIONS.sellerEventAccess)
      .where('sellerId', '==', parsed.sellerId)
      .where('eventId', '==', parsed.eventId)
      .limit(1)
      .get();

    if (!existing.empty) return fail('Ya existe acceso para este vendedor y evento');

    const ref = db.collection(COLLECTIONS.sellerEventAccess).doc();
    const now = Timestamp.now();
    await ref.set({
      sellerId: parsed.sellerId,
      eventId: parsed.eventId,
      quota: parsed.quota,
      sold: 0,
      active: true,
      commissionRate: parsed.commissionRate ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return ok({ id: ref.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function listSellerAccessAdmin(
  idToken: string,
  filters?: { sellerId?: string; eventId?: string }
): Promise<ActionResult<SerializedSellerAccess[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'admin');

    let query: Query = getAdminDb().collection(COLLECTIONS.sellerEventAccess);
    if (filters?.sellerId) query = query.where('sellerId', '==', filters.sellerId);
    if (filters?.eventId) query = query.where('eventId', '==', filters.eventId);

    const snap = await query.get();
    const result = await buildSellerAccessList(snap.docs);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getSellerDashboard(
  idToken: string
): Promise<ActionResult<SerializedSellerAccess[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'seller');

    const snap = await getAdminDb()
      .collection(COLLECTIONS.sellerEventAccess)
      .where('sellerId', '==', user.uid)
      .where('active', '==', true)
      .get();

    const result = await buildSellerAccessList(snap.docs);
    return ok(result.filter((a) => a.active));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

async function buildSellerAccessList(
  docs: QueryDocumentSnapshot[]
): Promise<SerializedSellerAccess[]> {
  const db = getAdminDb();
  const result: SerializedSellerAccess[] = [];

  for (const doc of docs) {
    const access = doc.data();
    const eventSnap = await db.collection(COLLECTIONS.events).doc(access.eventId).get();
    if (!eventSnap.exists) continue;
    const event = eventSnap.data()!;
    result.push({
      id: doc.id,
      sellerId: access.sellerId,
      eventId: access.eventId,
      eventName: event.name,
      eventDate: event.date.toDate().toISOString(),
      quota: access.quota,
      sold: access.sold,
      remaining: Math.max(0, access.quota - access.sold),
      price: event.price,
      active: access.active && event.active,
    });
  }
  return result;
}
