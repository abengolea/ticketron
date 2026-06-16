/**
 * Crea o actualiza un usuario en Firestore con rol superadmin.
 *
 * Uso:
 *   npx tsx scripts/bootstrap-superadmin.ts abengolea1@gmail.com
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { Timestamp } from 'firebase-admin/firestore';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: npx tsx scripts/bootstrap-superadmin.ts <email>');
    process.exit(1);
  }

  const { getAdminAuth, getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');

  let authUser;
  try {
    authUser = await getAdminAuth().getUserByEmail(email);
  } catch {
    console.error(`No existe usuario de Auth con email: ${email}`);
    process.exit(1);
  }

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.users).doc(authUser.uid);
  const now = Timestamp.now();

  await ref.set(
    {
      email,
      displayName: authUser.displayName ?? email.split('@')[0],
      role: 'superadmin',
      active: true,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  console.log(`Superadmin configurado: ${email} (${authUser.uid})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
