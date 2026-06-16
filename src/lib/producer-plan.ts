import { Timestamp } from 'firebase-admin/firestore';
import type { ProducerPlan, QuotaType } from '@/lib/models';

const QUOTA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeProducerPlan(raw: ProducerPlan): ProducerPlan {
  return {
    maxEvents: raw.maxEvents ?? 0,
    quotaType: raw.quotaType ?? 'lifetime',
    eventsUsed: raw.eventsUsed ?? 0,
    quotaPeriodStart: raw.quotaPeriodStart,
    pricePerEvent: raw.pricePerEvent ?? 0,
    planActive: raw.planActive ?? true,
    planNotes: raw.planNotes,
    createdBy: raw.createdBy,
  };
}

/** Renueva el cupo mensual si pasaron 30 días desde quotaPeriodStart. */
export function refreshQuotaPeriodIfNeeded(plan: ProducerPlan): ProducerPlan {
  if (plan.quotaType !== 'monthly') return plan;

  const periodStart = plan.quotaPeriodStart.toMillis();
  if (Date.now() - periodStart < QUOTA_PERIOD_MS) return plan;

  return {
    ...plan,
    eventsUsed: 0,
    quotaPeriodStart: Timestamp.now(),
  };
}

export function canCreateEvent(plan: ProducerPlan): { ok: true } | { ok: false; reason: string } {
  const refreshed = refreshQuotaPeriodIfNeeded(plan);

  if (!refreshed.planActive) {
    return { ok: false, reason: 'Tu plan está desactivado. Contactá al administrador.' };
  }

  if (refreshed.quotaType === 'unlimited') {
    return { ok: true };
  }

  if (refreshed.eventsUsed >= refreshed.maxEvents) {
    if (refreshed.quotaType === 'monthly') {
      return {
        ok: false,
        reason: `Alcanzaste el límite de ${refreshed.maxEvents} eventos en este período de 30 días.`,
      };
    }
    return {
      ok: false,
      reason: `Alcanzaste el límite de ${refreshed.maxEvents} eventos de tu plan.`,
    };
  }

  return { ok: true };
}

export function defaultProducerPlan(
  createdBy: string,
  opts: {
    maxEvents: number;
    quotaType: QuotaType;
    pricePerEvent: number;
    planNotes?: string;
  }
): ProducerPlan {
  return {
    maxEvents: opts.maxEvents,
    quotaType: opts.quotaType,
    eventsUsed: 0,
    quotaPeriodStart: Timestamp.now(),
    pricePerEvent: opts.pricePerEvent,
    planActive: true,
    planNotes: opts.planNotes,
    createdBy,
  };
}
