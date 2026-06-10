import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;
let adminAuth: Auth | undefined;

function initAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (serviceAccountKey) {
    const parsed = JSON.parse(serviceAccountKey) as Record<string, string>;
    return initializeApp({ credential: cert(parsed) });
  }

  // GOOGLE_APPLICATION_CREDENTIALS o credenciales por defecto en entorno GCP
  return initializeApp();
}

export function getAdminApp(): App {
  if (!adminApp) {
    adminApp = initAdmin();
  }
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

/** Colecciones Firestore */
export const COLLECTIONS = {
  users: 'users',
  events: 'events',
  sellerEventAccess: 'sellerEventAccess',
  paymentLinks: 'paymentLinks',
  tickets: 'tickets',
  buyerActivationTokens: 'buyerActivationTokens',
  barProducts: 'barProducts',
  barOrders: 'barOrders',
} as const;
