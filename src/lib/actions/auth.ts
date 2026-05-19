'use server';

import { verifyIdTokenAndGetUser } from '@/lib/auth-server';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { UserRole } from '@/lib/models';

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de autenticación';
    return fail(msg, 'UNAUTHORIZED');
  }
}
