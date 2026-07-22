import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const { getPlatformMercadoPagoToken } = await import('../src/lib/platform-mercadopago');

  const db = getAdminDb();
  const id = 'LnSRRQi1NoBre1KkzR8s';
  const snap = await db.collection(COLLECTIONS.eventFeeCharges).doc(id).get();
  if (!snap.exists) {
    console.log('Cargo no existe');
    return;
  }
  const d = snap.data()!;
  console.log(
    JSON.stringify(
      {
        status: d.status,
        amount: d.amount,
        preferenceId: d.mercadoPagoPreferenceId,
        paymentId: d.mercadoPagoPaymentId ?? null,
        paidAt: d.paidAt?.toDate?.()?.toISOString?.() ?? null,
        billingHub: d.billingHub ?? null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      },
      null,
      2
    )
  );

  const token = getPlatformMercadoPagoToken();
  const url =
    'https://api.mercadopago.com/v1/payments/search?external_reference=ticketron_fee_' +
    id +
    '&sort=date_created&criteria=desc';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const json = (await res.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  const results = json.results ?? [];
  console.log('\nPagos MP encontrados:', results.length);
  for (const p of results.slice(0, 5)) {
    console.log(
      JSON.stringify(
        {
          id: p.id,
          status: p.status,
          status_detail: p.status_detail,
          transaction_amount: p.transaction_amount,
          date_approved: p.date_approved,
          external_reference: p.external_reference,
        },
        null,
        2
      )
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
