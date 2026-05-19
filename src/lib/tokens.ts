import { randomBytes } from 'crypto';

/** Token URL-safe para links de checkout (no secuencial) */
export function generateSecureToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Código público del ticket (legible, no secuencial) */
export function generateTicketCode(): string {
  return randomBytes(8).toString('base64url').toUpperCase().slice(0, 12);
}
