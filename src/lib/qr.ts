import { createHmac, timingSafeEqual } from 'crypto';

export interface QrPayloadData {
  ticketCode: string;
  sig: string;
}

/** Genera payload firmado para el QR — validar siempre en servidor */
export function buildQrPayload(ticketCode: string): string {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'TICKET_SIGNING_SECRET no configurado. Definir en .env.local (mín. 16 caracteres).'
    );
  }
  const sig = createHmac('sha256', secret).update(ticketCode).digest('base64url');
  return JSON.stringify({ ticketCode, sig } satisfies QrPayloadData);
}

export function parseQrPayload(raw: string): QrPayloadData | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'ticketCode' in parsed &&
      'sig' in parsed &&
      typeof (parsed as QrPayloadData).ticketCode === 'string' &&
      typeof (parsed as QrPayloadData).sig === 'string'
    ) {
      return parsed as QrPayloadData;
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyQrSignature(ticketCode: string, sig: string): boolean {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(ticketCode).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
