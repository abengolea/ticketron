import { NextRequest, NextResponse } from 'next/server';
import { expirePendingPaymentLinks } from '@/lib/services/expire-links';
import { isValidCronRequest } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Expira paymentLinks vencidos (PENDING_PAYMENT → EXPIRED).
 *
 * Programación:
 * - Local: npm run cron:expire:watch
 * - Producción (Firebase/GCP): scripts/setup-cloud-scheduler.ps1
 * - GitHub Actions: .github/workflows/cron-expire-links.yml
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
async function handleExpire(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado en el servidor' },
      { status: 500 }
    );
  }

  if (!isValidCronRequest(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const expired = await expirePendingPaymentLinks();
  return NextResponse.json({
    ok: true,
    expired,
    at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    return await handleExpire(request);
  } catch (error) {
    console.error('cron/expire-links:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

/** GET para Cloud Scheduler y health checks con el mismo Bearer */
export async function GET(request: NextRequest) {
  return POST(request);
}
