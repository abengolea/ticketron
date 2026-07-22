'use server';

import { FieldValue } from 'firebase-admin/firestore';
import {
  verifyIdTokenAndGetUser,
  requireManageEvents,
  isSuperAdmin,
} from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { updateProducerBillingProfileSchema } from '@/lib/validations';
import {
  listUnpaidEventFeeChargesForOwner,
  createEventFeePaymentPreference,
  ensureEventFeeChargeForEvent,
} from '@/lib/services/event-fee-charges';
import { isPlatformMercadoPagoConfigured } from '@/lib/platform-mercadopago';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  ProducerBillingProfile,
  SerializedEventFeeCharge,
} from '@/lib/models';

export async function listPendingEventFees(
  idToken: string
): Promise<
  ActionResult<{
    charges: SerializedEventFeeCharge[];
    platformPaymentsConfigured: boolean;
    hasBillingProfile: boolean;
  }>
> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const ownerId = isSuperAdmin(user) ? user.uid : user.uid;
    const charges = await listUnpaidEventFeeChargesForOwner(ownerId);

    const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
    const profile = snap.data()?.billingProfile as ProducerBillingProfile | undefined;

    return ok({
      charges,
      platformPaymentsConfigured: isPlatformMercadoPagoConfigured(),
      hasBillingProfile: Boolean(profile?.ivaCondicion),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getEventFeeForEvent(
  idToken: string,
  eventId: string
): Promise<ActionResult<SerializedEventFeeCharge | null>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const charge = await ensureEventFeeChargeForEvent(eventId);
    if (charge && !isSuperAdmin(user)) {
      const snap = await getAdminDb()
        .collection(COLLECTIONS.eventFeeCharges)
        .doc(charge.id)
        .get();
      if (snap.data()?.ownerId !== user.uid) return fail('No autorizado');
    }
    return ok(charge);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function startEventFeePayment(
  idToken: string,
  chargeId: string
): Promise<ActionResult<{ initPoint: string; amount: number }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
    const profile = snap.data()?.billingProfile as ProducerBillingProfile | undefined;

    const result = await createEventFeePaymentPreference({
      chargeId,
      ownerId: user.uid,
      ownerEmail: user.email,
      billingProfile: profile,
    });

    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al crear el link de pago');
  }
}

export async function getProducerBillingProfile(
  idToken: string
): Promise<ActionResult<ProducerBillingProfile | null>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
    const profile = snap.data()?.billingProfile as ProducerBillingProfile | undefined;
    return ok(profile ?? null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function updateProducerBillingProfile(
  idToken: string,
  input: unknown
): Promise<ActionResult<ProducerBillingProfile>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const parsed = updateProducerBillingProfileSchema.parse(input);
    const cuit = parsed.cuit?.replace(/\D/g, '') || undefined;

    if (parsed.ivaCondicion === 'responsable_inscripto' && (!cuit || cuit.length !== 11)) {
      return fail('CUIT obligatorio para responsable inscripto');
    }

    const profile: ProducerBillingProfile = {
      ivaCondicion: parsed.ivaCondicion,
      ...(cuit ? { cuit } : {}),
      ...(parsed.razonSocial?.trim()
        ? { razonSocial: parsed.razonSocial.trim() }
        : {}),
      ...(parsed.domicilio?.trim() ? { domicilio: parsed.domicilio.trim() } : {}),
    };

    await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(user.uid)
      .update({
        billingProfile: profile,
        updatedAt: FieldValue.serverTimestamp(),
      });

    return ok(profile);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
