/**
 * Crea o actualiza un usuario en Firestore con rol admin.
 *
 * Uso:
 *   npx tsx scripts/bootstrap-admin.ts abengolea1@gmail.com
 *
 * El email debe existir en Firebase Authentication (login previo con Google).
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { Timestamp } from 'firebase-admin/firestore';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: npx tsx scripts/bootstrap-admin.ts <email>');
    process.exit(1);
  }

  const { getAdminAuth, getAdminDb, COLLECTIONS } = await import(
    '../src/lib/firebase-admin'
  );

  let authUser;
  try {
    authUser = await getAdminAuth().getUserByEmail(email);
  } catch {
    console.error(
      `No hay usuario en Firebase Auth con email "${email}".\n` +
        'Primero iniciá sesión con Google en /login (aunque falle el acceso), luego volvé a ejecutar este script.'
    );
    process.exit(1);
  }

  const ref = getAdminDb().collection(COLLECTIONS.users).doc(authUser.uid);
  const existing = await ref.get();
  const now = Timestamp.now();

  const data = {
    email: authUser.email ?? email,
    displayName:
      authUser.displayName ?? authUser.email?.split('@')[0] ?? 'Admin',
    role: 'producer' as const,
    active: true,
    updatedAt: now,
    ...(existing.exists ? {} : { createdAt: now }),
  };

  await ref.set(data, { merge: true });

  console.log('Usuario admin configurado:');
  console.log(`  uid:   ${authUser.uid}`);
  console.log(`  email: ${data.email}`);
  console.log(`  role:  producer`);
  console.log('\nPodés volver a iniciar sesión en /login');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
