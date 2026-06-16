'use server';

import { verifyIdTokenAndGetUser, requireManageEvents } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import {
  serializeEvent,
  serializeTicket,
  serializeBarOrder,
  serializePaymentLink,
} from '@/lib/serialize';
import { requireEventAccess } from '@/lib/tenant';
import { getTicketPaymentDisplay } from '@/lib/payment-display';
import { computePaymentLinkRevenue } from '@/lib/payment-link-utils';
import { countsTowardRevenue, isActiveTicket } from '@/lib/ticket-totals';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type {
  BarOrder,
  EventPostStats,
  EventPostStatsEntryHour,
  EventPostStatsSellerRow,
  PaymentLink,
  PlatformEvent,
  PlatformTicket,
  SerializedTicketWithPayment,
} from '@/lib/models';

const AR_TZ = 'America/Argentina/Buenos_Aires';

function formatEntryHourLabel(date: Date): string {
  return date.toLocaleString('es-AR', {
    timeZone: AR_TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function entryHourKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`;
}

function buildEntryTimeline(usedAtList: string[]): EventPostStatsEntryHour[] {
  const buckets = new Map<string, { label: string; count: number }>();

  for (const iso of usedAtList) {
    const date = new Date(iso);
    const key = entryHourKey(date);
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, { label: formatEntryHourLabel(date), count: 1 });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, { label, count }]) => ({ hour, label, count }));
}

export async function getEventPostStats(
  idToken: string,
  eventId: string
): Promise<ActionResult<EventPostStats>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireManageEvents(user);
    const event = await requireEventAccess(user, eventId);

    const db = getAdminDb();
    const [ticketsSnap, linksSnap, barOrdersSnap] = await Promise.all([
      db.collection(COLLECTIONS.tickets).where('eventId', '==', eventId).get(),
      db.collection(COLLECTIONS.paymentLinks).where('eventId', '==', eventId).get(),
      db.collection(COLLECTIONS.barOrders).where('eventId', '==', eventId).get(),
    ]);

    const unitPrice = event.price;
    const serializedLinks = linksSnap.docs.map((d) =>
      serializePaymentLink({ id: d.id, ...d.data() } as PaymentLink)
    );
    const linkById = new Map(serializedLinks.map((l) => [l.id, l]));

    const linkRevenue = computePaymentLinkRevenue(serializedLinks);

    const tickets: SerializedTicketWithPayment[] = ticketsSnap.docs.map((d) => {
      const raw = { id: d.id, ...d.data() } as PlatformTicket;
      const serialized = serializeTicket(raw);
      const payment = getTicketPaymentDisplay(linkById.get(raw.paymentLinkId), {
        unitPrice,
      });
      return {
        ...serialized,
        paymentFormatted: payment.formatted,
        paymentAmount: payment.amountPerTicket,
        paymentMethod: payment.method,
      };
    });

    const activeTickets = tickets.filter(isActiveTicket);
    const usedTickets = activeTickets.filter((t) => t.status === 'USED');
    const validTickets = activeTickets.filter((t) => t.status === 'VALID');
    const attendanceBase = activeTickets.length;
    const attendanceRate =
      attendanceBase > 0 ? Math.round((usedTickets.length / attendanceBase) * 1000) / 10 : 0;

    const byMethod = {
      mercadopago: { count: 0, revenue: 0 },
      cash: { count: 0, revenue: 0 },
      complimentary: { count: 0, revenue: 0 },
    };

    for (const t of activeTickets) {
      const row = byMethod[t.paymentMethod];
      row.count += 1;
      if (countsTowardRevenue(t)) {
        row.revenue += t.paymentAmount;
      }
    }

    const sellerIds = [...new Set(activeTickets.map((t) => t.sellerId).filter(Boolean))];
    const sellerNames = new Map<string, string>();
    if (sellerIds.length > 0) {
      const userSnaps = await Promise.all(
        sellerIds.map((id) => db.collection(COLLECTIONS.users).doc(id).get())
      );
      for (const snap of userSnaps) {
        if (!snap.exists) continue;
        const data = snap.data()!;
        sellerNames.set(snap.id, (data.displayName as string) || (data.email as string) || snap.id);
      }
    }

    const sellerMap = new Map<string, EventPostStatsSellerRow>();
    for (const t of activeTickets) {
      const sid = t.sellerId || 'unknown';
      let row = sellerMap.get(sid);
      if (!row) {
        row = {
          sellerId: sid,
          sellerName: sellerNames.get(sid) ?? 'Sin vendedor',
          sold: 0,
          used: 0,
          revenue: 0,
        };
        sellerMap.set(sid, row);
      }
      row.sold += 1;
      if (t.status === 'USED') row.used += 1;
      if (countsTowardRevenue(t)) row.revenue += t.paymentAmount;
    }

    const usedAtList = usedTickets
      .map((t) => t.usedAt)
      .filter((v): v is string => Boolean(v))
      .sort();

    const entryTimeline = buildEntryTimeline(usedAtList);
    const peakEntry =
      entryTimeline.length > 0
        ? entryTimeline.reduce((best, cur) => (cur.count > best.count ? cur : best))
        : null;

    const paidBarOrders = barOrdersSnap.docs
      .map((d) => serializeBarOrder({ id: d.id, ...d.data() } as BarOrder))
      .filter((o) => o.status === 'PAID');

    const barRedeemed = paidBarOrders.filter((o) => o.voucherStatus === 'USED').length;

    const serializedEvent = serializeEvent(event as PlatformEvent);

    return ok({
      event: serializedEvent,
      isPastEvent: new Date(serializedEvent.date).getTime() < Date.now(),
      tickets: {
        total: tickets.length,
        active: activeTickets.length,
        used: usedTickets.length,
        valid: validTickets.length,
        cancelled: tickets.filter((t) => t.status === 'CANCELLED').length,
        archived: tickets.filter((t) => t.archived).length,
      },
      attendanceRate,
      noShowCount: validTickets.length,
      revenue: {
        collected: linkRevenue.collected,
        pending: linkRevenue.pending,
        byMethod,
      },
      bySeller: [...sellerMap.values()].sort((a, b) => b.sold - a.sold),
      entryTimeline,
      peakEntryHour: peakEntry?.label ?? null,
      firstEntryAt: usedAtList[0] ?? null,
      lastEntryAt: usedAtList[usedAtList.length - 1] ?? null,
      bar: {
        revenue: paidBarOrders.reduce((sum, o) => sum + o.amount, 0),
        ordersPaid: paidBarOrders.length,
        vouchersRedeemed: barRedeemed,
        vouchersPending: paidBarOrders.length - barRedeemed,
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al cargar estadísticas');
  }
}
