/**
 * Reprocesa un cargo fee ya pagado en MP (cuando el webhook no corrió).
 *
 *   npx tsx scripts/fulfill-fee-payment.ts
 *   npx tsx scripts/fulfill-fee-payment.ts --charge=LnSRRQi1NoBre1KkzR8s
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

function parseArgs() {
  let chargeId = 'LnSRRQi1NoBre1KkzR8s';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--charge=')) chargeId = arg.slice('--charge='.length).trim();
  }
  return { chargeId };
}

async function main() {
  const { chargeId } = parseArgs();
  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const { getPlatformMercadoPagoToken } = await import('../src/lib/platform-mercadopago');
  const { fulfillEventFeeCharge } = await import('../src/lib/services/event-fee-charges');

  const db = getAdminDb();
  const snap = await db.collection(COLLECTIONS.eventFeeCharges).doc(chargeId).get();
  if (!snap.exists) throw new Error('Cargo no encontrado: ' + chargeId);

  const data = snap.data()!;
  console.log('Cargo actual:', data.status, 'amount=', data.amount);

  const token = getPlatformMercadoPagoToken();
  const url =
    'https://api.mercadopago.com/v1/payments/search?external_reference=ticketron_fee_' +
    chargeId +
    '&sort=date_created&criteria=desc';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const json = (await res.json()) as {
    results?: Array<{ id: number; status: string; preference_id?: string }>;
  };
  const approved = (json.results ?? []).find((p) => p.status === 'approved');
  if (!approved) throw new Error('No hay pago approved en MP para este cargo');

  console.log('Pago MP:', approved.id, approved.status);
  const result = await fulfillEventFeeCharge(
    chargeId,
    String(approved.id),
    approved.preference_id || (data.mercadoPagoPreferenceId as string | undefined)
  );
  console.log('Fulfill:', result);

  const after = await db.collection(COLLECTIONS.eventFeeCharges).doc(chargeId).get();
  const d = after.data()!;
  console.log(
    JSON.stringify(
      {
        status: d.status,
        paymentId: d.mercadoPagoPaymentId ?? null,
        paidAt: d.paidAt?.toDate?.()?.toISOString?.() ?? null,
        billingHub: d.billingHub ?? null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
