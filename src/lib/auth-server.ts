import { getAdminAuth, getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import type { AppUser, UserRole } from '@/lib/models';

export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INACTIVE' = 'UNAUTHORIZED'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Verifica ID token de Firebase y devuelve usuario de Firestore */
export async function verifyIdTokenAndGetUser(
  idToken: string | null | undefined
): Promise<AppUser> {
  if (!idToken) {
    throw new AuthError('Sesión requerida', 'UNAUTHORIZED');
  }

  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const userDoc = await getAdminDb()
    .collection(COLLECTIONS.users)
    .doc(decoded.uid)
    .get();

  if (!userDoc.exists) {
    throw new AuthError('Usuario no autorizado en el sistema', 'FORBIDDEN');
  }

  const user = userDoc.data() as AppUser;
  if (!user.active) {
    if (user.role === 'producer' && user.approvalStatus === 'pending') {
      throw new AuthError(
        'Tu cuenta de productor está pendiente de aprobación. Te avisamos por email cuando esté lista.',
        'INACTIVE'
      );
    }
    if (user.role === 'producer' && user.approvalStatus === 'rejected') {
      throw new AuthError(
        'Tu solicitud de productor no fue aprobada. Contactanos si creés que es un error.',
        'INACTIVE'
      );
    }
    throw new AuthError('Tu cuenta está deshabilitada', 'INACTIVE');
  }

  return { ...user, uid: decoded.uid };
}

export function requireRole(user: AppUser, ...roles: UserRole[]): void {
  if (!roles.includes(user.role)) {
    throw new AuthError('No tenés permisos para esta acción', 'FORBIDDEN');
  }
}

export function isSuperAdmin(user: AppUser): boolean {
  return user.role === 'superadmin';
}

export function isProducer(user: AppUser): boolean {
  return user.role === 'producer';
}

export function isDirigente(user: AppUser): boolean {
  return user.role === 'dirigente';
}

export function canManageEvents(user: AppUser): boolean {
  return isSuperAdmin(user) || isProducer(user);
}

export function canManageAccess(user: AppUser): boolean {
  return isSuperAdmin(user) || isDirigente(user);
}

/** @deprecated Usar canManageEvents */
export function isAdmin(user: AppUser): boolean {
  return canManageEvents(user);
}

export function requireManageEvents(user: AppUser): void {
  if (!canManageEvents(user)) {
    throw new AuthError('No tenés permisos para esta acción', 'FORBIDDEN');
  }
}

export function requireManageAccess(user: AppUser): void {
  if (!canManageAccess(user)) {
    throw new AuthError('No tenés permisos para control de visitantes', 'FORBIDDEN');
  }
}

export function requireSuperAdmin(user: AppUser): void {
  if (!isSuperAdmin(user)) {
    throw new AuthError('Solo el super administrador puede realizar esta acción', 'FORBIDDEN');
  }
}

export function canAccessGate(user: AppUser): boolean {
  return canManageEvents(user) || canManageAccess(user) || user.role === 'gate';
}
