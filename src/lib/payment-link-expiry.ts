import { Timestamp } from 'firebase-admin/firestore';
import type { PaymentLinkType } from '@/lib/models';

/** Valor de expiresAt en Firestore para links MP sin vencimiento por tiempo */
export const PAYMENT_LINK_INDEFINITE_EXPIRES_AT = Timestamp.fromDate(
  new Date('2099-12-31T23:59:59.000Z')
);

/** Cortesía y venta en efectivo siguen con vencimiento por tiempo */
export function hasTimedExpiry(link: { linkType?: PaymentLinkType }): boolean {
  return link.linkType === 'complimentary' || link.linkType === 'cash';
}
