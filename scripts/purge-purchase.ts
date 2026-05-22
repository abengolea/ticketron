/**
 * Elimina de Firestore una operación de compra (payment link + tickets)
 * y revierte los contadores sold del evento y del vendedor.
 *
 * Uso:
 *   npx tsx scripts/purge-purchase.ts YR2RKEO0J6S --dry-run
 *   npx tsx scripts/purge-purchase.ts YR2RKEO0J6S --confirm
 *
 * El argumento puede ser ticketCode o paymentLinkId.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { FieldValue } from 'firebase-admin/firestore';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const arg = process.argv[2]?.trim().toUpperCase();
  const dryRun = process.argv.includes('--dry-run');
  const confirm = process.argv.includes('--confirm');

  if (!arg) {
    console.error('Uso: npx tsx scripts/purge-purchase.ts <ticketCode|paymentLinkId> [--dry-run|--confirm]');
    process.exit(1);
  }

  if (!dryRun && !confirm) {
    console.error('Indicá --dry-run para previsualizar o --confirm para borrar.');
    process.exit(1);
  }

  const { getAdminDb, COLLECTIONS } = await import('../src/lib/firebase-admin');
  const db = getAdminDb();

  let ticketSnap = await db
    .collection(COLLECTIONS.tickets)
    .where('ticketCode', '==', arg)
    .limit(1)
    .get();

  let paymentLinkId: string;

  if (!ticketSnap.empty) {
    paymentLinkId = ticketSnap.docs[0]!.data().paymentLinkId as string;
  } else {
    const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(arg);
    const linkDoc = await linkRef.get();
    if (!linkDoc.exists) {
      console.error(`No se encontró entrada con código "${arg}" ni payment link con id "${arg}".`);
      process.exit(1);
    }
    paymentLinkId = linkDoc.id;
  }

  const linkRef = db.collection(COLLECTIONS.paymentLinks).doc(paymentLinkId);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    console.error(`Payment link ${paymentLinkId} no existe.`);
    process.exit(1);
  }

  const link = linkSnap.data()!;
  const ticketsSnap = await db
    .collection(COLLECTIONS.tickets)
    .where('paymentLinkId', '==', paymentLinkId)
    .get();

  const tickets = ticketsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  console.log('--- Resumen ---');
  console.log(`Payment link: ${paymentLinkId}`);
  console.log(`Estado link:  ${link.status}`);
  console.log(`Comprador:    ${[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') || '(sin nombre)'}`);
  console.log(`Monto:        ${link.amount}`);
  console.log(`Evento:       ${link.eventId}`);
  console.log(`Tickets (${tickets.length}):`);
  for (const t of tickets) {
    console.log(
      `  - ${t.ticketCode} (${t.id}) status=${t.status} archived=${t.archived === true}`
    );
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No se modificó la base.');
    return;
  }

  const ticketCount = tickets.length;

  const eventRef = db.collection(COLLECTIONS.events).doc(link.eventId as string);
  const accessQuery = db
    .collection(COLLECTIONS.sellerEventAccess)
    .where('sellerId', '==', link.sellerId)
    .where('eventId', '==', link.eventId)
    .limit(1);

  await db.runTransaction(async (tx) => {
    const [freshLink, eventSnap, accessSnap] = await Promise.all([
      tx.get(linkRef),
      tx.get(eventRef),
      tx.get(accessQuery),
    ]);

    if (!freshLink.exists) throw new Error('Payment link desapareció durante la transacción');
    if (!eventSnap.exists) throw new Error('Evento no encontrado');

    for (const doc of ticketsSnap.docs) {
      tx.delete(doc.ref);
    }
    tx.delete(linkRef);

    if (ticketCount > 0) {
      tx.update(eventRef, {
        sold: FieldValue.increment(-ticketCount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (!accessSnap.empty) {
        tx.update(accessSnap.docs[0]!.ref, {
          sold: FieldValue.increment(-ticketCount),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });

  console.log(`\nEliminados: payment link ${paymentLinkId}, ${ticketCount} ticket(s).`);
  console.log(`Revertido sold: -${ticketCount} en evento y vendedor (si aplica).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
