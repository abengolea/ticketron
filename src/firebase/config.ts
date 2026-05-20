/**
 * Firebase Client Config
 * Configurar variables NEXT_PUBLIC_FIREBASE_* en .env.local
 * Ver .env.example
 */

/** Evita URLs inválidas si el secreto en Cloud Secret Manager trae saltos de línea al final. */
function env(name: string, fallback: string): string {
  const value = process.env[name];
  return (value === undefined || value === '' ? fallback : value).trim();
}

export const firebaseConfig = {
  apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY', 'AIzaSyDm1C-IgdbKPKOA831B1zkF0Z00TOmRgn4'),
  authDomain: env(
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'studio-9893505602-68edc.firebaseapp.com',
  ),
  projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'studio-9893505602-68edc'),
  storageBucket: env(
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'studio-9893505602-68edc.appspot.com',
  ),
  messagingSenderId: env(
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    '978726699068',
  ),
  appId: env(
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    '1:978726699068:web:aa858650256f3628594339',
  ),
};
