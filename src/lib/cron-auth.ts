import { NextRequest } from 'next/server';

/** Valida Authorization: Bearer <CRON_SECRET> o header x-cron-secret */
export function isValidCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  return false;
}
