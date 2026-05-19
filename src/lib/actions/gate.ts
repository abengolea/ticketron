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

    const snap = await getAdminDb()
      .collection(COLLECTIONS.tickets)
      .where('ticketCode', '==', parsed.ticketCode)
      .limit(1)
      .get();

    if (snap.empty) {
      return ok({ result: 'INVALID', message: 'Entrada no encontrada' });
    }

    const doc = snap.docs[0]!;
    const ticket = doc.data();

    if (ticket.eventId !== eventId) {
      return ok({
        result: 'WRONG_EVENT',
        message: 'Esta entrada es para otro evento',
        ticketCode: ticket.ticketCode,
      });
    }

    if (ticket.status === 'CANCELLED') {
      return ok({
        result: 'CANCELLED',
        message: 'Entrada cancelada',
        buyerName: ticket.buyerName,
        ticketCode: ticket.ticketCode,
      });
    }

    if (ticket.status === 'USED') {
      return ok({
        result: 'ALREADY_USED',
        message: `Ya usada el ${ticket.usedAt?.toDate?.()?.toLocaleString('es-AR') ?? ''}`,
        buyerName: ticket.buyerName,
        ticketCode: ticket.ticketCode,
      });
    }

    await doc.ref.update({
      status: 'USED',
      usedAt: Timestamp.now(),
      usedBy: user.uid,
    });

    return ok({
      result: 'VALID',
      message: 'Entrada válida — acceso permitido',
      buyerName: ticket.buyerName,
      ticketCode: ticket.ticketCode,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error de validación');
  }
}
