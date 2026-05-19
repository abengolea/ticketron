/**
 * Prueba de envío con Resend (usa .env.local).
 *
 * Uso:
 *   npx tsx scripts/test-email.ts tu@gmail.com
 */
import { config } from 'dotenv';
import { resolve } from 'path';

const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

const loadedLocal = config({ path: envLocalPath });
const loadedEnv = config({ path: envPath });

function envKeysFromFile(filePath: string): string[] {
  try {
    const fs = require('fs') as typeof import('fs');
    const text = fs.readFileSync(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0]?.trim())
      .filter((key): key is string => Boolean(key));
  } catch {
    return [];
  }
}

function printEnvDiagnostics() {
  console.error('\n--- Diagnóstico .env ---');
  console.error('cwd:', process.cwd());
  console.error('.env.local:', envLocalPath, loadedLocal.error ? `(error: ${loadedLocal.error.message})` : '(leído)');
  console.error('.env:', envPath, loadedEnv.error ? `(error: ${loadedEnv.error.message})` : '(leído)');

  const keysInFile = envKeysFromFile(envLocalPath);
  const resendLike = keysInFile.filter((k) =>
    /resend|email_from|mail/i.test(k)
  );
  console.error(
    'Claves en .env.local relacionadas con email:',
    resendLike.length ? resendLike.join(', ') : '(ninguna)'
  );
  console.error(
    'RESEND_API_KEY en process.env:',
    process.env.RESEND_API_KEY ? `sí (${process.env.RESEND_API_KEY.length} chars)` : 'NO'
  );
  console.error(
    'EMAIL_FROM en process.env:',
    process.env.EMAIL_FROM ? `sí → ${process.env.EMAIL_FROM}` : 'NO'
  );
  console.error(
    '\nSi agregaste las variables en el editor, guardá el archivo (Ctrl+S) y volvé a ejecutar.\n'
  );
}

async function main() {
  const to = process.argv[2]?.trim() || process.env.RESEND_TEST_TO?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!to) {
    console.error('Uso: npx tsx scripts/test-email.ts <email-destino>');
    console.error('  o definí RESEND_TEST_TO en .env.local');
    printEnvDiagnostics();
    process.exit(1);
  }

  if (!apiKey) {
    console.error('Falta RESEND_API_KEY (no está en process.env después de cargar .env.local)');
    printEnvDiagnostics();
    process.exit(1);
  }

  if (!from) {
    console.error('Falta EMAIL_FROM en .env.local');
    printEnvDiagnostics();
    process.exit(1);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );

  const { buildPurchaseConfirmationEmailHtml } = await import(
    '../src/lib/email/templates/purchase-confirmation'
  );
  const { buildQrPayload } = await import('../src/lib/qr');
  const { qrPayloadToDataUrl } = await import('../src/lib/email/qr-data-url');

  const demoCodes = ['DEMO-0001', 'DEMO-0002'];
  const tickets = await Promise.all(
    demoCodes.map(async (ticketCode, i) => ({
      index: i + 1,
      total: demoCodes.length,
      ticketCode,
      qrDataUrl: await qrPayloadToDataUrl(buildQrPayload(ticketCode)),
    }))
  );

  const html = buildPurchaseConfirmationEmailHtml({
    buyerName: 'Comprador de prueba',
    eventName: 'Evento Demo Ticketron',
    eventDate: new Date().toLocaleString('es-AR', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    eventLocation: 'Buenos Aires, Argentina',
    ticketQuantity: 2,
    tickets,
    ticketsUrl: `${appUrl}/ticket?token=prueba-email`,
    appUrl,
  });

  console.log('Enviando prueba (plantilla real)...');
  console.log('  From:', from);
  console.log('  To:  ', to);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Tus entradas — Evento Demo Ticketron',
      html,
    }),
  });

  const body = await res.text();

  if (!res.ok) {
    console.error('Error', res.status, body);
    process.exit(1);
  }

  console.log('Enviado correctamente.');
  console.log('Respuesta:', body);
  console.log('Revisá la bandeja (y spam) de', to);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
