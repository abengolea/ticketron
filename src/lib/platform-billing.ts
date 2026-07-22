import { Timestamp } from 'firebase-admin/firestore';
import {
  getAdminDb,
  COLLECTIONS,
  PLATFORM_CONFIG_DOCS,
} from '@/lib/firebase-admin';
import type { PlatformBillingConfig } from '@/lib/models';

export const DEFAULT_PLATFORM_BILLING: Pick<
  PlatformBillingConfig,
  'pricePerEvent' | 'pricePerTicket'
> = {
  pricePerEvent: 0,
  pricePerTicket: 0,
};

export async function getPlatformBilling(): Promise<{
  pricePerEvent: number;
  pricePerTicket: number;
}> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.platformConfig)
    .doc(PLATFORM_CONFIG_DOCS.billing)
    .get();

  if (!snap.exists) {
    return { ...DEFAULT_PLATFORM_BILLING };
  }

  const data = snap.data() as PlatformBillingConfig;
  return {
    pricePerEvent: data.pricePerEvent ?? 0,
    pricePerTicket: data.pricePerTicket ?? 0,
  };
}

export async function setPlatformBilling(
  fees: { pricePerEvent: number; pricePerTicket: number },
  updatedBy: string
): Promise<{ pricePerEvent: number; pricePerTicket: number }> {
  const payload = {
    pricePerEvent: fees.pricePerEvent,
    pricePerTicket: fees.pricePerTicket,
    updatedAt: Timestamp.now(),
    updatedBy,
  };

  await getAdminDb()
    .collection(COLLECTIONS.platformConfig)
    .doc(PLATFORM_CONFIG_DOCS.billing)
    .set(payload, { merge: true });

  return {
    pricePerEvent: payload.pricePerEvent,
    pricePerTicket: payload.pricePerTicket,
  };
}
