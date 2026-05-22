'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyIdTokenAndGetUser, canAccessGate } from '@/lib/auth-server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { gateValidateSchema } from '@/lib/validations';
import { parseQrPayload, verifyQrSignature } from '@/lib/qr';
import { ok, fail, type ActionResult } from '@/lib/actions/types';
import type { GateValidationResult } from '@/lib/models';

export interface GateValidationResponse {
  result: GateValidationResult;
  message: string;
  buyerName?: string;
  ticketCode?: string;
}

export async function validateTicketAtGate(
  idToken: string,
  input: unknown
): Promise<ActionResult<GateValidationResponse>> {
  try {
    const user = await verifyIdTokenAndGetUser(idToken);
    if (!canAccessGate(user)) {
      return fail('No autorizado para control de puerta');
    }

    const { eventId, qrPayload } = gateValidateSchema.parse(input);
    const parsed = parseQrPayload(qrPayload);

    if (!parsed) {
      return ok({ result: 'INVALID', message: 'QR inválido o corrupto' });
    }

    if (!verifyQrSignature(parsed.ticketCode, parsed.sig)) {
      return ok({ result: 'INVALID', message: 'Firma QR inválida' });
    }

    const lookup = await getAdminDb()
      .collection(COLLECTIONS.tickets)
      .where('ticketCode', '==', parsed.ticketCode)
      .limit(1)
      .get();

    if (lookup.empty) {
      return ok({ result: 'INVALID', message: 'Entrada no encontrada' });
    }

    const ticketRef = lookup.docs[0]!.ref;
    const db = getAdminDb();

    const outcome = await db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        return { kind: 'INVALID' as const, message: 'Entrada no encontrada' };
      }

      const ticket = ticketSnap.data()!;

      if (ticket.eventId !== eventId) {
        return {
          kind: 'WRONG_EVENT' as const,
          message: 'Esta entrada es para otro evento',
          buyerName: ticket.buyerName as string | undefined,
          ticketCode: ticket.ticketCode as string,
        };
      }

      if (ticket.status === 'CANCELLED') {
        return {
          kind: 'CANCELLED' as const,
          message: 'Entrada cancelada',
          buyerName: ticket.buyerName as string | undefined,
          ticketCode: ticket.ticketCode as string,
        };
      }

      if (ticket.status === 'USED') {
        const usedAt = ticket.usedAt as Timestamp | undefined;
        return {
          kind: 'ALREADY_USED' as const,
          message: `Ya usada el ${usedAt?.toDate?.()?.toLocaleString('es-AR') ?? 'anteriormente'}`,
          buyerName: ticket.buyerName as string | undefined,
          ticketCode: ticket.ticketCode as string,
        };
      }

      if (ticket.status !== 'VALID') {
        return {
          kind: 'INVALID' as const,
          message: `Estado de entrada no válido (${String(ticket.status)})`,
          ticketCode: ticket.ticketCode as string | undefined,
        };
      }

      tx.update(ticketRef, {
        status: 'USED',
        usedAt: Timestamp.now(),
        usedBy: user.uid,
      });

      return {
        kind: 'VALID' as const,
        message: 'Entrada válida — acceso permitido',
        buyerName: ticket.buyerName as string | undefined,
        ticketCode: ticket.ticketCode as string,
      };
    });

    switch (outcome.kind) {
      case 'VALID':
        return ok({
          result: 'VALID',
          message: outcome.message,
          buyerName: outcome.buyerName,
          ticketCode: outcome.ticketCode,
        });
      case 'ALREADY_USED':
        return ok({
          result: 'ALREADY_USED',
          message: outcome.message,
          buyerName: outcome.buyerName,
          ticketCode: outcome.ticketCode,
        });
      case 'CANCELLED':
        return ok({
          result: 'CANCELLED',
          message: outcome.message,
          buyerName: outcome.buyerName,
          ticketCode: outcome.ticketCode,
        });
      case 'WRONG_EVENT':
        return ok({
          result: 'WRONG_EVENT',
          message: outcome.message,
          buyerName: outcome.buyerName,
          ticketCode: outcome.ticketCode,
        });
      default:
        return ok({
          result: 'INVALID',
          message: outcome.message,
          ticketCode: 'ticketCode' in outcome ? outcome.ticketCode : undefined,
        });
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error de validación');
  }
}
