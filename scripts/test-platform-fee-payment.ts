/**
 * Prueba de cobro de fee de plataforma ($10 ARS) vía MP Notificas SRL.
 *
 * Uso:
 *   npx tsx scripts/test-platform-fee-payment.ts
 *   npx tsx scripts/test-platform-fee-payment.ts --amount=10
 *   npx tsx scripts/test-platform-fee-payment.ts --email=tu@mail.com
 *
 * Crea un cargo de prueba en Firestore + preferencia Mercado Pago.
 * Abrí el init_point, pagá, y el webhook debería marcar paid + intentar factura Hub.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

function parseArgs() {
  let amount = 10;
  let email = process.env.FEE_TEST_EMAIL?.trim() || 'abengolea1@gmail.com';

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--amount=')) {
      amount = Number(arg.slice('--amount='.length)) || 10;
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length).trim();
    } else if (arg.includes('@')) {
      email = arg.trim();
    }
  }

  return { amount, email };
}

async function main() {
  const { amount, email } = parseArgs();

  console.log('\n=== Ticketron — test fee plataforma ===\n');
  console.log('Importe:', amount, 'ARS');
  console.log('Payer email:', email);
  console.log(
    'MERCADOPAGO_PLATFORM_ACCESS_TOKEN:',
    process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN ||
      process.env.MERCADOPAGO_ACCESS_TOKEN
      ? 'sí'
      : 'NO'
  );
  console.log('NOTIFICASHUB_URL:', process.env.NOTIFICASHUB_URL ? 'sí' : 'NO');
  console.log(
    'NOTIFICAS_BILLING_SHARED_SECRET:',
    process.env.NOTIFICAS_BILLING_SHARED_SECRET ? 'sí' : 'NO'
  );
  console.log(
    'MERCADOPAGO_HUB_EMIT_FACTURA:',
    process.env.MERCADOPAGO_HUB_EMIT_FACTURA ?? '(no)'
  );
  console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);

  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const { createPreference } = await import('../src/lib/mercadopago');
  const {
    getPlatformMercadoPagoToken,
    buildEventFeeExternalReference,
  } = await import('../src/lib/platform-mercadopago');

  const platformToken = getPlatformMercadoPagoToken();
  const db = getAdminDb();

  // Buscar un productor para asociar el cargo de prueba
  const producers = await db
    .collection(COLLECTIONS.users)
    .where('role', '==', 'producer')
    .limit(5)
    .get();

  let ownerId: string | null = null;
  let ownerEmail = email;

  for (const doc of producers.docs) {
    const data = doc.data();
    if (data.active !== false) {
      ownerId = doc.id;
      ownerEmail = (data.email as string) || email;
      // Preferir el que ya tiene billing profile
      if (data.billingProfile?.ivaCondicion) break;
    }
  }

  if (!ownerId) {
    const superadmins = await db
      .collection(COLLECTIONS.users)
      .where('role', '==', 'superadmin')
      .limit(1)
      .get();
    if (!superadmins.empty) {
      ownerId = superadmins.docs[0]!.id;
      ownerEmail = (superadmins.docs[0]!.data().email as string) || email;
    }
  }

  if (!ownerId) {
    throw new Error('No hay productor ni superadmin en Firestore para asociar el cargo');
  }

  console.log('\nOwner del cargo:', ownerId, ownerEmail);

  const now = Timestamp.now();
  const chargeRef = db.collection(COLLECTIONS.eventFeeCharges).doc();
  const chargeId = chargeRef.id;

  await chargeRef.set({
    eventId: `test-event-${Date.now()}`,
    ownerId,
    eventName: 'Prueba fee plataforma $10',
    eventDate: now,
    ticketsIssued: 1,
    pricePerTicket: amount,
    pricePerEvent: 0,
    amount,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    test: true,
  });

  console.log('Cargo creado:', chargeId);

  const externalReference = buildEventFeeExternalReference(chargeId);
  const hubEmit =
    process.env.MERCADOPAGO_HUB_EMIT_FACTURA === 'true' ||
    process.env.TICKETRON_HUB_EMIT_FACTURA === 'true';

  const preference = await createPreference(
    {
      title: `Ticketron — prueba fee $${amount}`,
      unitPrice: amount,
      quantity: 1,
      externalReference,
      payerEmail: email,
      returnPath: '/admin/events?fee=test',
      metadata: {
        hub_emit_factura: hubEmit ? 'true' : 'false',
        hub_app_id: 'ticketron',
        hub_concepto: `Prueba fee Ticketron $${amount}`,
        hub_charge_id: chargeId,
        hub_cbte_tipo: 'B',
      },
    },
    platformToken
  );

  const initPoint = preference.init_point || preference.sandbox_init_point;
  if (!initPoint) {
    throw new Error('MP no devolvió init_point');
  }

  await chargeRef.update({
    status: 'awaiting_payment',
    mercadoPagoPreferenceId: preference.id,
    mercadoPagoInitPoint: initPoint,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log('\n--- Listo ---');
  console.log('Preference ID:', preference.id);
  console.log('External ref:', externalReference);
  console.log('\nAbrí este link y pagá $' + amount + ':\n');
  console.log(initPoint);
  console.log(
    '\nWebhook esperado:',
    `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/mercadopago/webhook`
  );
  console.log(
    '\nDespués del pago, en Firestore: eventFeeCharges/' +
      chargeId +
      ' → status paid (+ billingHub si Hub está ok).\n'
  );
}

main().catch((e) => {
  console.error('\nERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
