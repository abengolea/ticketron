import { createHmac, timingSafeEqual } from 'crypto';

export interface QrPayloadData {
  ticketCode: string;
  sig: string;
}

function getSigningSecret(): string | null {
  const raw = process.env.TICKET_SIGNING_SECRET;
  if (!raw) return null;
  const secret = raw.trim();
  return secret.length >= 16 ? secret : null;
}

/** Normaliza el texto leído por el escáner (espacios, BOM, etc.). */
export function normalizeQrScanInput(raw: string): string {
  return raw.trim().replace(/^\uFEFF/, '');
}

/** Genera payload firmado para el QR — validar siempre en servidor */
export function buildQrPayload(ticketCode: string): string {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error(
      'TICKET_SIGNING_SECRET no configurado. Definir en .env.local (mín. 16 caracteres).'
    );
  }
  const code = ticketCode.trim();
  const sig = createHmac('sha256', secret).update(code).digest('base64url');
  return JSON.stringify({ ticketCode: code, sig } satisfies QrPayloadData);
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
  const secret = getSigningSecret();
  if (!secret) return false;
  const code = ticketCode.trim();
  const signature = sig.trim();
  const expected = createHmac('sha256', secret).update(code).digest('base64url');
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Coincide con el payload persistido al emitir la entrada (tolerante a rotación de secreto). */
export function qrPayloadMatchesStored(scanned: string, stored: string): boolean {
  return normalizeQrScanInput(scanned) === normalizeQrScanInput(stored);
}
