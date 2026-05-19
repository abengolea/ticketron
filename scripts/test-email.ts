/**
 * Prueba de envío con Resend (usa .env.local + Firestore).
 *
 * Uso:
 *   npx tsx scripts/test-email.ts
 *   npx tsx scripts/test-email.ts otro@email.com
 *   npx tsx scripts/test-email.ts --token=abc123
 *
 * Por defecto envía a abengolea1@gmail.com y usa una compra PAID real:
 *   1. RESEND_TEST_TOKEN en .env.local, o
 *   2. la compra PAID más reciente con tickets (prioriza el email de prueba).
 */
import { config } from 'dotenv';
import { resolve } from 'path';

const DEFAULT_TEST_TO = 'abengolea1@gmail.com';

const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

config({ path: envLocalPath });
config({ path: envPath });

function parseArgs() {
  const args = process.argv.slice(2);
  let to = process.env.RESEND_TEST_TO?.trim() || DEFAULT_TEST_TO;
  let token = process.env.RESEND_TEST_TOKEN?.trim();

  for (const arg of args) {
    if (arg.startsWith('--token=')) {
      token = arg.slice('--token='.length).trim();
    } else if (arg.includes('@')) {
      to = arg.trim();
    } else if (!token) {
      token = arg.trim();
    }
  }

  return { to, token };
}

function printEnvDiagnostics() {
  console.error('\n--- Diagnóstico .env ---');
  console.error('cwd:', process.cwd());
  console.error(
    'RESEND_API_KEY:',
    process.env.RESEND_API_KEY ? `sí (${process.env.RESEND_API_KEY.length} chars)` : 'NO'
  );
  console.error(
    'EMAIL_FROM:',
    process.env.EMAIL_FROM ? `sí → ${process.env.EMAIL_FROM}` : 'NO'
  );
  console.error(
    'NEXT_PUBLIC_APP_URL:',
    process.env.NEXT_PUBLIC_APP_URL ?? '(default localhost:9002)'
  );
  console.error(
    'RESEND_TEST_TOKEN:',
    process.env.RESEND_TEST_TOKEN ? 'definido' : '(no — se busca compra PAID reciente)'
  );
  console.error(
    '\nSi falta algo, guardá .env.local (Ctrl+S) y volvé a ejecutar.\n'
  );
}

async function resolvePaymentLinkId(opts: {
  token?: string;
  preferBuyerEmail?: string;
}): Promise<{ paymentLinkId: string; token: string }> {
  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const db = getAdminDb();

  if (opts.token) {
    const snap = await db
      .collection(COLLECTIONS.paymentLinks)
      .where('token', '==', opts.token)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new Error(`No hay payment link con token "${opts.token}"`);
    }

    const doc = snap.docs[0]!;
    const data = doc.data();
    if (data.status !== 'PAID') {
      throw new Error(`El link existe pero está en estado ${data.status} (se requiere PAID)`);
    }

    return { paymentLinkId: doc.id, token: opts.token };
  }

  const paidSnap = await db
    .collection(COLLECTIONS.paymentLinks)
    .where('status', '==', 'PAID')
    .limit(40)
    .get();

  if (paidSnap.empty) {
    throw new Error(
      'No hay compras PAID en Firestore. Hacé una compra de prueba o definí RESEND_TEST_TOKEN en .env.local'
    );
  }

  type Candidate = { paymentLinkId: string; token: string; updatedAt: number };
  const candidates: Candidate[] = [];

  for (const doc of paidSnap.docs) {
    const data = doc.data();
    const ticketSnap = await db
      .collection(COLLECTIONS.tickets)
      .where('paymentLinkId', '==', doc.id)
      .limit(1)
      .get();

    if (ticketSnap.empty) continue;

    const updatedAt =
      typeof data.updatedAt?.toMillis === 'function'
        ? data.updatedAt.toMillis()
        : typeof data.createdAt?.toMillis === 'function'
          ? data.createdAt.toMillis()
          : 0;

    candidates.push({
      paymentLinkId: doc.id,
      token: data.token as string,
      updatedAt,
    });
  }

  if (candidates.length === 0) {
    throw new Error(
      'Hay links PAID pero ninguno tiene tickets. Completá un pago de prueba o usá RESEND_TEST_TOKEN'
    );
  }

  const preferEmail = opts.preferBuyerEmail?.trim().toLowerCase();
  if (preferEmail) {
    for (const doc of paidSnap.docs) {
      const buyerEmail = (doc.data().buyerEmail as string | undefined)?.trim().toLowerCase();
      if (buyerEmail !== preferEmail) continue;
      const match = candidates.find((c) => c.paymentLinkId === doc.id);
      if (match) {
        return { paymentLinkId: match.paymentLinkId, token: match.token };
      }
    }
  }

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  const best = candidates[0]!;
  return { paymentLinkId: best.paymentLinkId, token: best.token };
}

async function main() {
  const { to, token: tokenArg } = parseArgs();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey) {
    console.error('Falta RESEND_API_KEY en .env.local');
    printEnvDiagnostics();
    process.exit(1);
  }

  if (!from) {
    console.error('Falta EMAIL_FROM en .env.local');
    printEnvDiagnostics();
    process.exit(1);
  }

  const { paymentLinkId, token } = await resolvePaymentLinkId({
    token: tokenArg,
    preferBuyerEmail: to,
  });

  const { buildPurchaseConfirmationEmailContent } = await import(
    '../src/lib/services/purchase-confirmation-email'
  );
  const { sendEmailViaResend } = await import('../src/lib/email/resend-send');

  const { subject, html, attachments, ticketsUrl } =
    await buildPurchaseConfirmationEmailContent(paymentLinkId);

  console.log('Enviando prueba (compra real)...');
  console.log('  From:       ', from);
  console.log('  To:         ', to);
  console.log('  PaymentLink:', paymentLinkId);
  console.log('  Token:      ', token);
  console.log('  Ver entradas:', ticketsUrl);

  await sendEmailViaResend({
    to,
    subject: `[PRUEBA] ${subject}`,
    html,
    attachments: attachments.length ? attachments : undefined,
  });

  console.log('Enviado correctamente.');
  console.log('El botón del mail abre:', ticketsUrl);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
