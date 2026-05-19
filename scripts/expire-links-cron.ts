/**
 * Expira paymentLinks vencidos en PENDING_PAYMENT.
 *
 * Uso:
 *   npx tsx scripts/expire-links-cron.ts          # una vez
 *   npx tsx scripts/expire-links-cron.ts --watch  # cada 5 min (desarrollo)
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const INTERVAL_MS = parseInt(process.env.CRON_EXPIRE_INTERVAL_MS ?? '300000', 10); // 5 min

async function runOnce(): Promise<number> {
  const { expirePendingPaymentLinks } = await import(
    '../src/lib/services/expire-links'
  );
  return expirePendingPaymentLinks();
}

async function main() {
  const watch = process.argv.includes('--watch');

  async function tick() {
    const ts = new Date().toISOString();
    try {
      const count = await runOnce();
      console.log(`[${ts}] Links expirados: ${count}`);
    } catch (err) {
      console.error(`[${ts}] Error:`, err instanceof Error ? err.message : err);
    }
  }

  await tick();

  if (watch) {
    console.log(`Modo watch: cada ${INTERVAL_MS / 1000}s (Ctrl+C para salir)`);
    setInterval(tick, INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
