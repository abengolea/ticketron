'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  verifyIdTokenAndGetUser,
  requireSuperAdmin,
  requireManageEvents,
  isProducer,
} from '@/lib/auth-server';
import { getAdminAuth, getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  createProducerSchema,
  updateProducerSchema,
  updateProducerSettingsSchema,
  registerProducerSchema,
  approveProducerSchema,
  rejectProducerSchema,
  updatePlatformBillingSchema,
} from '@/lib/validations';
import { defaultProducerPlan } from '@/lib/producer-plan';
import {
  getPlatformBilling,
  setPlatformBilling,
} from '@/lib/platform-billing';
import { sendProducerWelcomeEmail } from '@/lib/services/producer-welcome-email';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { SerializedProducer } from '@/lib/models';

function serializeProducer(
  uid: string,
  data: FirebaseFirestore.DocumentData
): SerializedProducer {
  const plan = data.producerPlan;
  return {
    uid,
    email: data.email as string,
    displayName: data.displayName as string,
    active: data.active as boolean,
    approvalStatus: data.approvalStatus,
    organizationName: data.organizationName as string | undefined,
    phone: data.phone as string | undefined,
    registrationNotes: data.registrationNotes as string | undefined,
    producerPlan: plan
      ? {
          maxEvents: plan.maxEvents,
          quotaType: plan.quotaType,
          eventsUsed: plan.eventsUsed ?? 0,
          quotaPeriodStart: plan.quotaPeriodStart.toDate().toISOString(),
          pricePerEvent: plan.pricePerEvent,
          pricePerTicket: plan.pricePerTicket ?? 0,
          planActive: plan.planActive ?? true,
          planNotes: plan.planNotes,
          createdBy: plan.createdBy,
        }
      : undefined,
    hasMercadoPago: !!(data.mercadoPagoAccessToken as string | undefined)?.trim(),
    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
  };
}

export async function getPublicPlatformFees(): Promise<
  ActionResult<{ pricePerEvent: number; pricePerTicket: number }>
> {
  try {
    const fees = await getPlatformBilling();
    return ok(fees);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getPlatformFees(
  idToken: string
): Promise<ActionResult<{ pricePerEvent: number; pricePerTicket: number }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(user);
    const fees = await getPlatformBilling();
    return ok(fees);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function updatePlatformFees(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ pricePerEvent: number; pricePerTicket: number }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(user);
    const parsed = updatePlatformBillingSchema.parse(input);
    const fees = await setPlatformBilling(parsed, user.uid);
    return ok(fees);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

/** Registro público de productor — queda pendiente hasta aprobación. */
export async function registerProducer(
  input: unknown
): Promise<ActionResult<{ message: string }>> {
  try {
    const parsed = registerProducerSchema.parse(input);
    const auth = getAdminAuth();
    const email = parsed.email.trim().toLowerCase();

    const existing = await getAdminDb()
      .collection(COLLECTIONS.users)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existing.empty) {
      return fail('Ya existe una cuenta con ese email');
    }

    const userRecord = await auth.createUser({
      email,
      password: parsed.password,
      displayName: parsed.displayName.trim(),
      disabled: false,
    });

    const now = Timestamp.now();
    await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(userRecord.uid)
      .set({
        email,
        displayName: parsed.displayName.trim(),
        role: 'producer',
        active: false,
        approvalStatus: 'pending',
        organizationName: parsed.organizationName.trim(),
        phone: parsed.phone.trim(),
        ...(parsed.registrationNotes?.trim()
          ? { registrationNotes: parsed.registrationNotes.trim() }
          : {}),
        createdAt: now,
        updatedAt: now,
      });

    return ok({
      message:
        'Recibimos tu solicitud. Te avisamos por email cuando el equipo de Ticketron la apruebe.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg.includes('email-already-exists')) {
      return fail('Ya existe un usuario con ese email');
    }
    return fail(msg);
  }
}

export async function listProducers(
  idToken: string
): Promise<ActionResult<SerializedProducer[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(user);

    const snap = await getAdminDb()
      .collection(COLLECTIONS.users)
      .where('role', '==', 'producer')
      .get();

    const producers = snap.docs
      .map((d) => serializeProducer(d.id, d.data()))
      .sort((a, b) => {
        const pendingA = a.approvalStatus === 'pending' ? 0 : 1;
        const pendingB = b.approvalStatus === 'pending' ? 0 : 1;
        if (pendingA !== pendingB) return pendingA - pendingB;
        return a.displayName.localeCompare(b.displayName);
      });

    return ok(producers);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function createProducer(
  idToken: string,
  input: unknown
): Promise<ActionResult<{ uid: string }>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = createProducerSchema.parse(input);
    const auth = getAdminAuth();
    const mpToken = parsed.mercadoPagoAccessToken?.trim() || undefined;

    const userRecord = await auth.createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.displayName,
    });

    const now = Timestamp.now();
    const producerPlan = defaultProducerPlan(superAdmin.uid, {
      maxEvents: parsed.maxEvents,
      quotaType: parsed.quotaType,
      pricePerEvent: parsed.pricePerEvent,
      pricePerTicket: parsed.pricePerTicket ?? 0,
      planNotes: parsed.planNotes?.trim() || undefined,
    });

    await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(userRecord.uid)
      .set({
        email: parsed.email,
        displayName: parsed.displayName,
        role: 'producer',
        active: true,
        approvalStatus: 'approved',
        producerPlan,
        approvedAt: now,
        approvedBy: superAdmin.uid,
        ...(mpToken ? { mercadoPagoAccessToken: mpToken } : {}),
        createdAt: now,
        updatedAt: now,
      });

    return ok({ uid: userRecord.uid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg.includes('email-already-exists')) {
      return fail('Ya existe un usuario con ese email');
    }
    return fail(msg);
  }
}

export async function approveProducer(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedProducer>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = approveProducerSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.users).doc(parsed.uid);
    const snap = await ref.get();
    if (!snap.exists) return fail('Productor no encontrado');

    const data = snap.data()!;
    if (data.role !== 'producer') return fail('El usuario no es productor');
    if (data.approvalStatus === 'approved' && data.active) {
      return fail('Este productor ya está aprobado');
    }

    const now = Timestamp.now();
    const producerPlan = defaultProducerPlan(superAdmin.uid, {
      maxEvents: parsed.maxEvents,
      quotaType: parsed.quotaType,
      pricePerEvent: parsed.pricePerEvent,
      pricePerTicket: parsed.pricePerTicket,
      planNotes: parsed.planNotes?.trim() || undefined,
      planActive: true,
    });

    await ref.update({
      active: true,
      approvalStatus: 'approved',
      producerPlan,
      approvedAt: now,
      approvedBy: superAdmin.uid,
      rejectedAt: FieldValue.delete(),
      rejectedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await sendProducerWelcomeEmail({
        to: data.email as string,
        displayName: data.displayName as string,
        organizationName: data.organizationName as string | undefined,
        pricePerEvent: parsed.pricePerEvent,
        pricePerTicket: parsed.pricePerTicket,
      });
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr);
    }

    const updated = await ref.get();
    return ok(serializeProducer(parsed.uid, updated.data()!));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function rejectProducer(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedProducer>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = rejectProducerSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.users).doc(parsed.uid);
    const snap = await ref.get();
    if (!snap.exists) return fail('Productor no encontrado');

    const data = snap.data()!;
    if (data.role !== 'producer') return fail('El usuario no es productor');

    await ref.update({
      active: false,
      approvalStatus: 'rejected',
      rejectedAt: Timestamp.now(),
      rejectedBy: superAdmin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await getAdminAuth().updateUser(parsed.uid, { disabled: true });
    } catch {
      /* ignore */
    }

    const updated = await ref.get();
    return ok(serializeProducer(parsed.uid, updated.data()!));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function updateProducer(
  idToken: string,
  input: unknown
): Promise<ActionResult<SerializedProducer>> {
  try {
    const superAdmin = await verifyIdTokenAndGetUser(idToken);
    requireSuperAdmin(superAdmin);

    const parsed = updateProducerSchema.parse(input);
    const ref = getAdminDb().collection(COLLECTIONS.users).doc(parsed.uid);
    const snap = await ref.get();
    if (!snap.exists) return fail('Productor no encontrado');
    if (snap.data()?.role !== 'producer') return fail('El usuario no es productor');

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (parsed.active !== undefined) update.active = parsed.active;
    if (parsed.displayName !== undefined) update.displayName = parsed.displayName;

    const mpToken = parsed.mercadoPagoAccessToken?.trim();
    if (mpToken) update.mercadoPagoAccessToken = mpToken;

    const currentPlan = snap.data()?.producerPlan;
    if (currentPlan) {
      const planUpdate = { ...currentPlan };
      let planChanged = false;

      if (parsed.maxEvents !== undefined) {
        planUpdate.maxEvents = parsed.maxEvents;
        planChanged = true;
      }
      if (parsed.quotaType !== undefined) {
        planUpdate.quotaType = parsed.quotaType;
        planChanged = true;
      }
      if (parsed.pricePerEvent !== undefined) {
        planUpdate.pricePerEvent = parsed.pricePerEvent;
        planChanged = true;
      }
      if (parsed.pricePerTicket !== undefined) {
        planUpdate.pricePerTicket = parsed.pricePerTicket;
        planChanged = true;
      }
      if (parsed.planActive !== undefined) {
        planUpdate.planActive = parsed.planActive;
        planChanged = true;
      }
      if (parsed.planNotes !== undefined) {
        planUpdate.planNotes = parsed.planNotes.trim() || null;
        planChanged = true;
      }

      if (planChanged) update.producerPlan = planUpdate;
    }

    await ref.update(update);
    const updated = await ref.get();
    return ok(serializeProducer(parsed.uid, updated.data()!));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getProducerSettings(
  idToken: string
): Promise<ActionResult<{ hasMercadoPago: boolean; email: string }>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);

    const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
    const data = snap.data()!;
    return ok({
      hasMercadoPago: !!(data.mercadoPagoAccessToken as string | undefined)?.trim(),
      email: data.email as string,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function updateProducerMercadoPago(
  idToken: string,
  input: unknown
): Promise<ActionResult<void>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    if (!isProducer(user) && user.role !== 'superadmin') {
      return fail('No autorizado');
    }

    const parsed = updateProducerSettingsSchema.parse(input);
    await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).update({
      mercadoPagoAccessToken: parsed.mercadoPagoAccessToken.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function getProducerPlanSummary(
  idToken: string
): Promise<
  ActionResult<{
    planActive: boolean;
    maxEvents: number;
    eventsUsed: number;
    quotaType: string;
    pricePerEvent: number;
    pricePerTicket: number;
    canCreate: boolean;
    message?: string;
  } | null>
> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (user.role === 'superadmin') return ok(null);

    if (!isProducer(user)) return fail('No autorizado');

    const snap = await getAdminDb().collection(COLLECTIONS.users).doc(user.uid).get();
    const plan = snap.data()?.producerPlan;
    if (!plan) return fail('Sin plan asignado');

    const { canCreateEvent, refreshQuotaPeriodIfNeeded, normalizeProducerPlan } = await import(
      '@/lib/producer-plan'
    );
    const normalized = refreshQuotaPeriodIfNeeded(normalizeProducerPlan(plan));
    const check = canCreateEvent(normalized);

    return ok({
      planActive: normalized.planActive,
      maxEvents: normalized.maxEvents,
      eventsUsed: normalized.eventsUsed,
      quotaType: normalized.quotaType,
      pricePerEvent: normalized.pricePerEvent,
      pricePerTicket: normalized.pricePerTicket,
      canCreate: check.ok,
      message: check.ok ? undefined : check.reason,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
