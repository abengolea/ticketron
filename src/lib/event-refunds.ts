import { getTicketPaymentMethod } from '@/lib/payment-display';
import type {
  EventRefundTransfer,
  SerializedEventRefundRow,
  SerializedEventRefundSummary,
  SerializedPaymentLink,
} from '@/lib/models';

export function eventRefundGroupKey(link: {
  id: string;
  buyerEmail?: string;
}): string {
  const email = link.buyerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return `link:${link.id}`;
}

export function encodeRefundStorageKey(groupKey: string): string {
  return Buffer.from(groupKey, 'utf8').toString('base64url');
}

function buyerDisplayName(link: SerializedPaymentLink): string | undefined {
  const name = [link.buyerName, link.buyerLastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (link.recipientLabel?.trim()) return link.recipientLabel.trim();
  return undefined;
}

function isRefundablePaidLink(link: SerializedPaymentLink): boolean {
  if (link.status !== 'PAID') return false;
  if ((link.linkType ?? 'payment') === 'complimentary') return false;
  return (link.amount ?? 0) > 0;
}

export function buildEventRefundSummary(
  links: SerializedPaymentLink[],
  transfers: Record<string, EventRefundTransfer | { transferred?: boolean; transferredAt?: { toDate?: () => Date } | string }>
): SerializedEventRefundSummary {
  type Acc = {
    key: string;
    email?: string;
    names: Set<string>;
    buyerPhone?: string;
    ticketQuantity: number;
    amount: number;
    methods: Set<'mercadopago' | 'cash'>;
    purchaseCount: number;
  };

  const groups = new Map<string, Acc>();

  for (const link of links) {
    if (!isRefundablePaidLink(link)) continue;

    const key = eventRefundGroupKey(link);
    const method = getTicketPaymentMethod(link);
    if (method === 'complimentary') continue;

    const email = link.buyerEmail?.trim().toLowerCase() || undefined;
    const existing = groups.get(key);
    const name = buyerDisplayName(link);

    if (!existing) {
      groups.set(key, {
        key,
        email,
        names: new Set(name ? [name] : []),
        buyerPhone: link.buyerPhone?.trim() || undefined,
        ticketQuantity: link.ticketQuantity ?? 1,
        amount: link.amount ?? 0,
        methods: new Set([method]),
        purchaseCount: 1,
      });
      continue;
    }

    if (name) existing.names.add(name);
    if (!existing.buyerPhone && link.buyerPhone?.trim()) {
      existing.buyerPhone = link.buyerPhone.trim();
    }
    existing.ticketQuantity += link.ticketQuantity ?? 1;
    existing.amount += link.amount ?? 0;
    existing.methods.add(method);
    existing.purchaseCount += 1;
  }

  const rows: SerializedEventRefundRow[] = [...groups.values()].map((g) => {
    const stored = transfers[encodeRefundStorageKey(g.key)];
    const transferred = stored?.transferred === true;
    let transferredAt: string | undefined;
    const rawAt = stored?.transferredAt;
    if (rawAt && typeof rawAt === 'object' && typeof rawAt.toDate === 'function') {
      transferredAt = rawAt.toDate().toISOString();
    } else if (typeof rawAt === 'string') {
      transferredAt = rawAt;
    }

    return {
      key: g.key,
      email: g.email,
      buyerNames: [...g.names],
      buyerPhone: g.buyerPhone,
      ticketQuantity: g.ticketQuantity,
      amount: g.amount,
      paymentMethods: [...g.methods],
      purchaseCount: g.purchaseCount,
      transferred,
      transferredAt,
    };
  });

  rows.sort((a, b) => {
    if (a.transferred !== b.transferred) return a.transferred ? 1 : -1;
    if (b.amount !== a.amount) return b.amount - a.amount;
    return (a.email ?? a.buyerNames[0] ?? a.key).localeCompare(
      b.email ?? b.buyerNames[0] ?? b.key,
      'es'
    );
  });

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const transferredAmount = rows
    .filter((r) => r.transferred)
    .reduce((sum, r) => sum + r.amount, 0);

  return {
    rows,
    totalAmount,
    transferredAmount,
    pendingAmount: totalAmount - transferredAmount,
    totalCount: rows.length,
    transferredCount: rows.filter((r) => r.transferred).length,
  };
}
