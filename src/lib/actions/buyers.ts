'use server';

import { verifyIdTokenAndGetUser, requireRole } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { serializeTicket } from '@/lib/serialize';
import {
  buyerHasTickets,
  completeBuyerAccountSetup,
  getActivationTokenInfo,
  sendBuyerActivationEmail,
} from '@/lib/services/buyer-activation';
import {
  completeBuyerActivationSchema,
  requestBuyerAccessSchema,
} from '@/lib/validations';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { PlatformTicket, SerializedTicket } from '@/lib/models';

export type ActivationPreview =
  | { status: 'valid'; email: string; displayName?: string }
  | { status: 'expired' }
  | { status: 'used'; email: string }
  | { status: 'invalid' };

export async function getActivationPreview(
  code: string
): Promise<ActionResult<ActivationPreview>> {
  try {
    const info = await getActivationTokenInfo(code);
    return ok(info);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}

export async function completeBuyerActivation(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  try {
    const parsed = completeBuyerActivationSchema.parse(input);
    const result = await completeBuyerAccountSetup(
      parsed.code,
      parsed.password,
      parsed.displayName
    );
    return ok({ email: result.email });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al activar cuenta');
  }
}

/** Reenvío de link desde login — siempre responde ok al cliente (no filtra emails). */
export async function requestBuyerAccess(
  input: unknown
): Promise<ActionResult<{ message: string }>> {
  try {
    const { email } = requestBuyerAccessSchema.parse(input);
    const normalized = email.trim().toLowerCase();

    const hasTickets = await buyerHasTickets(normalized);
    if (hasTickets) {
      await sendBuyerActivationEmail(normalized);
    }

    return ok({
      message:
        'Si tenés entradas con este email, te enviamos un link para crear tu contraseña y acceder a tus tickets.',
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error al procesar solicitud');
  }
}

export type BuyerTicketItem = SerializedTicket & {
  eventName: string;
  eventDate: string;
};

export async function getMyTickets(
  idToken: string
): Promise<ActionResult<BuyerTicketItem[]>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    requireRole(user, 'buyer');

    const email = user.email.trim().toLowerCase();
    const snap = await getAdminDb()
      .collection(COLLECTIONS.tickets)
      .where('buyerEmail', '==', email)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const db = getAdminDb();
    const eventCache = new Map<string, { name: string; date: string }>();
    const result: BuyerTicketItem[] = [];

    for (const doc of snap.docs) {
      const ticket = { id: doc.id, ...doc.data() } as PlatformTicket;
      if (ticket.archived) continue;

      let eventInfo = eventCache.get(ticket.eventId);
      if (!eventInfo) {
        const eventSnap = await db.collection(COLLECTIONS.events).doc(ticket.eventId).get();
        if (!eventSnap.exists) continue;
        const event = eventSnap.data()!;
        eventInfo = {
          name: event.name as string,
          date: event.date.toDate().toISOString(),
        };
        eventCache.set(ticket.eventId, eventInfo);
      }

      result.push({
        ...serializeTicket(ticket),
        eventName: eventInfo.name,
        eventDate: eventInfo.date,
      });
    }

    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error');
  }
}
