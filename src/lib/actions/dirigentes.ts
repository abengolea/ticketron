'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, requireSuperAdmin } from '@/lib/auth-server';
import { getAdminAuth, getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { createDirigenteSchema, updateDirigenteSchema } from '@/lib/validations';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { SerializedDirigente } from '@/lib/models';

function serializeDirigente(
  uid: string,
  data: FirebaseFirestore.DocumentData
): SerializedDirigente {
  return {
    uid,
    email: data.email as string,
    displayName: data.displayName as string,
    active: data.active as boolean,
    clubName: (data.clubName as string | undefined) || undefined,
    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
  };
}

export async function listDirigentes(
  idToken: string
): Promise<ActionResult<SerializedDirigente[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(user);

    const snap = await getAdminDb()
      .collection(COLLECTIONS.users)
      .where('role', '==', 'dirigente')
      .get();

    const dirigentes = snap.docs
      .map((d) => serializeDirigente(d.id, d.data()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return ok(dirigentes);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function createDirigente(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ uid: string }>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = createDirigenteSchema.parse(input);
    const auth = getAdminAuth();

    const userRecord = await auth.createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.displayName,
    });

    const now = Timestamp.now();
    await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(userRecord.uid)
      .set({
        email: parsed.email,
        displayName: parsed.displayName,
        role: 'dirigente',
        active: true,
        clubName: parsed.clubName.trim(),
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

export async function updateDirigente(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedDirigente>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = updateDirigenteSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.users).doc(parsed.uid);
    const snap = await ref.get();
    if (!snap.exists) return fail('Dirigente no encontrado');
    if (snap.data()?.role !== 'dirigente') return fail('El usuario no es dirigente');

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (parsed.active !== undefined) update.active = parsed.active;
    if (parsed.displayName !== undefined) update.displayName = parsed.displayName;
    if (parsed.clubName !== undefined) update.clubName = parsed.clubName.trim();

    await ref.update(update);
    const updated = await ref.get();
    return ok(serializeDirigente(parsed.uid, updated.data()!));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
