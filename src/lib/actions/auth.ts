'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, isDirigente } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { setMyClubNameSchema } from '@/lib/validations';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { UserRole } from '@/lib/models';

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  clubName?: string;
}

export async function setMyClubName(
  idToken: string,
  input: unknown
): Promise<ActionResult<SessionUser>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!isDirigente(user)) {
      return fail('Solo los dirigentes pueden configurar su club');
    }

    const parsed = setMyClubNameSchema.parse(input);
    const clubName = parsed.clubName.trim();

    await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).update({
      clubName,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return ok({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      active: user.active,
      clubName,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getSessionUser(
  idToken: string
): Promise<ActionResult<SessionUser>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    return ok({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      active: user.active,
      ...(user.clubName ? { clubName: user.clubName } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de autenticación';
    return fail(msg, 'UNAUTHORIZED');
  }
}
