/**
 * Llama al endpoint HTTP /api/cron/expire-links (producción / staging).
 * Usado por GitHub Actions y Cloud Scheduler.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  const secret = process.env.CRON_SECRET;

  if (!baseUrl) {
    console.error('Falta NEXT_PUBLIC_APP_URL o APP_URL');
    process.exit(1);
  }
  if (!secret) {
    console.error('Falta CRON_SECRET');
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/cron/expire-links`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.text();
  console.log(res.status, body);

  if (!res.ok) process.exit(1);
}

main();
