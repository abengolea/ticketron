import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { buildBuyerActivationEmailHtml } from '@/lib/email/templates/buyer-activation';
import { sendEmailViaResend } from '@/lib/email/resend-send';
import { generateActivationCode } from '@/lib/tokens';
import type { AppUser } from '@/lib/models';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(/\/$/, '');
}

export function buildActivationShortUrl(code: string): string {
  return `${getAppUrl()}/a/${encodeURIComponent(code)}`;
}

export async function buyerHasTickets(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const snap = await getAdminDb()
    .collection(COLLECTIONS.tickets)
    .where('buyerEmail', '==', normalized)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Crea token de activación y devuelve el código corto. */
export async function createBuyerActivationToken(
  buyerEmail: string,
  buyerName?: string
): Promise<string> {
  const email = buyerEmail.trim().toLowerCase();
  let code = generateActivationCode();
  const db = getAdminDb();
  const tokensRef = db.collection(COLLECTIONS.buyerActivationTokens);

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await tokensRef.doc(code).get();
    if (!existing.exists) break;
    code = generateActivationCode();
  }

  const now = Timestamp.now();
  await tokensRef.doc(code).set({
    code,
    buyerEmail: email,
    ...(buyerName?.trim() ? { buyerName: buyerName.trim() } : {}),
    expiresAt: Timestamp.fromMillis(Date.now() + TOKEN_TTL_MS),
    createdAt: now,
  });

  return code;
}

export type ActivationTokenInfo =
  | { status: 'valid'; email: string; displayName?: string }
  | { status: 'expired' }
  | { status: 'used'; email: string }
  | { status: 'invalid' };

export async function getActivationTokenInfo(code: string): Promise<ActivationTokenInfo> {
  const normalized = code.trim();
  if (!normalized) return { status: 'invalid' };

  const doc = await getAdminDb()
    .collection(COLLECTIONS.buyerActivationTokens)
    .doc(normalized)
    .get();

  if (!doc.exists) return { status: 'invalid' };

  const data = doc.data()!;
  const email = data.buyerEmail as string;

  if (data.usedAt) return { status: 'used', email };
  if ((data.expiresAt as Timestamp).toMillis() < Date.now()) return { status: 'expired' };

  return {
    status: 'valid',
    email,
    displayName: data.buyerName as string | undefined,
  };
}

async function getFirestoreUserByUid(uid: string): Promise<AppUser | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.users).doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...(snap.data() as Omit<AppUser, 'uid'>) };
}

/** Crea o actualiza cuenta comprador con contraseña (vía Admin SDK). */
export async function completeBuyerAccountSetup(
  code: string,
  password: string,
  displayName?: string
): Promise<{ email: string; uid: string }> {
  const tokenInfo = await getActivationTokenInfo(code);
  if (tokenInfo.status !== 'valid') {
    throw new Error(
      tokenInfo.status === 'expired'
        ? 'El link expiró. Pedí uno nuevo desde el login.'
        : tokenInfo.status === 'used'
          ? 'Este link ya fue usado. Iniciá sesión con tu email y contraseña.'
          : 'Link inválido'
    );
  }

  const email = tokenInfo.email;
  const hasTickets = await buyerHasTickets(email);
  if (!hasTickets) {
    throw new Error('No hay entradas asociadas a este email');
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  const name =
    displayName?.trim() ||
    tokenInfo.displayName?.trim() ||
    email.split('@')[0] ||
    'Comprador';

  let uid: string;

  try {
    const existingAuth = await auth.getUserByEmail(email);
    uid = existingAuth.uid;
    const firestoreUser = await getFirestoreUserByUid(uid);

    if (firestoreUser && firestoreUser.role !== 'buyer') {
      throw new Error(
        'Este email pertenece a una cuenta del equipo. Usá otro email o contactá soporte.'
      );
    }

    await auth.updateUser(uid, { password, displayName: name });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email,
        password,
        displayName: name,
        emailVerified: true,
      });
      uid = created.uid;
    } else {
      throw e instanceof Error ? e : new Error(err.message ?? 'Error al crear cuenta');
    }
  }

  const userRef = db.collection(COLLECTIONS.users).doc(uid);
  const userSnap = await userRef.get();
  const now = Timestamp.now();

  if (!userSnap.exists) {
    await userRef.set({
      email,
      displayName: name,
      role: 'buyer',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const data = userSnap.data()!;
    if (data.role !== 'buyer') {
      throw new Error('Este email ya tiene otra cuenta en el sistema');
    }
    await userRef.update({
      displayName: name,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await db.collection(COLLECTIONS.buyerActivationTokens).doc(code.trim()).update({
    usedAt: Timestamp.now(),
  });

  return { email, uid };
}

export async function sendBuyerActivationEmail(
  buyerEmail: string,
  buyerName?: string
): Promise<void> {
  const code = await createBuyerActivationToken(buyerEmail, buyerName);
  const activationUrl = buildActivationShortUrl(code);
  const name = buyerName?.trim() || buyerEmail.split('@')[0] || 'Comprador';

  await sendEmailViaResend({
    to: buyerEmail.trim().toLowerCase(),
    subject: 'Activá tu cuenta en Ticketron',
    html: buildBuyerActivationEmailHtml({
      buyerName: name,
      activationUrl,
    }),
  });
}

/** Token + URL corta para incluir en email de entradas. */
export async function createActivationLinkForEmail(
  buyerEmail: string,
  buyerName?: string
): Promise<string> {
  const code = await createBuyerActivationToken(buyerEmail, buyerName);
  return buildActivationShortUrl(code);
}
