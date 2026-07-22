import { FieldValue } from 'firebase-admin/firestore';
import type { ProducerBillingProfile, ProducerIvaCondicion } from '@/lib/models';

export type BillingHubResult =
  | {
      ok: true;
      facturaId?: string;
      CAE?: string;
      CAEFchVto?: string;
      voucherNumber?: number;
      ptoVta?: number;
      cbteTipo?: number;
      tipoComprobante?: string;
      netoGravado?: number;
      iva?: number;
      total?: number;
      alreadyIssued?: boolean;
    }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string; status?: number };

function billingEmitUrl(): string | undefined {
  const explicit =
    process.env.NOTIFICASHUB_BILLING_EMIT_URL ||
    process.env.NOTIFICAS_HUB_BILLING_EMIT_URL;
  if (explicit?.trim()) return explicit.trim();

  const hubBase = process.env.NOTIFICASHUB_URL?.trim().replace(/\/+$/, '');
  if (!hubBase) return undefined;
  return `${hubBase}/api/integrations/notificas/billing/emit`;
}

function billingSharedSecret(): string | undefined {
  const raw =
    process.env.NOTIFICAS_BILLING_SHARED_SECRET ||
    process.env.NOTIFICASHUB_BILLING_SHARED_SECRET;
  return raw?.trim() || undefined;
}

function hubEmitEnabled(): boolean {
  return (
    process.env.MERCADOPAGO_HUB_EMIT_FACTURA === 'true' ||
    process.env.TICKETRON_HUB_EMIT_FACTURA === 'true' ||
    process.env.NOTIFICASHUB_BILLING_FORCE_EMIT === 'true'
  );
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function digits(value: unknown, max = 32): string | undefined {
  const d = asString(value)?.replace(/\D/g, '').slice(0, max);
  return d || undefined;
}

function limitText(value: string | undefined, max = 500): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function ivaCondicionForHub(cond: ProducerIvaCondicion | undefined): string {
  switch (cond) {
    case 'responsable_inscripto':
      return 'responsable_inscripto';
    case 'monotributo':
      return 'monotributo';
    default:
      return 'consumidor_final';
  }
}

function cbteTipoForProfile(profile?: ProducerBillingProfile): 'A' | 'B' | undefined {
  if (profile?.ivaCondicion === 'responsable_inscripto') return 'A';
  if (profile?.ivaCondicion === 'monotributo') return 'B';
  return 'B';
}

/**
 * Emite factura ARCA vía NotificasHub (emisor: Notificas SRL).
 */
export async function requestHubInvoiceForTicketronFee(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any;
  chargeDocId: string;
  paymentId: string;
  amount: number;
  preferenceId?: string;
  externalReference?: string;
  eventName: string;
  ticketsIssued: number;
  buyer: {
    email?: string;
    profile?: ProducerBillingProfile;
  };
}): Promise<BillingHubResult> {
  const paymentIdStr = String(params.paymentId).trim();
  if (!paymentIdStr) return { ok: false, error: 'paymentId vacío' };

  const chargeRef = params.adminDb.collection('eventFeeCharges').doc(params.chargeDocId);

  const persist = async (billingHub: Record<string, unknown>) => {
    await chargeRef.set({ billingHub, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  };

  if (!hubEmitEnabled()) {
    await persist({
      status: 'failed',
      reason: 'hub_emit_factura_not_enabled',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, skipped: true, reason: 'hub_emit_factura_not_enabled' };
  }

  const url = billingEmitUrl();
  const secret = billingSharedSecret();
  if (!url || !secret) {
    await persist({
      status: 'failed',
      reason: 'hub_billing_not_configured',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, skipped: true, reason: 'hub_billing_not_configured' };
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    await persist({
      status: 'failed',
      error: 'Importe inválido',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, error: 'Importe inválido para facturación Hub' };
  }

  const profile = params.buyer.profile;
  const cbteTipoEnv = process.env.MERCADOPAGO_HUB_CBTE_TIPO;
  const cbteTipo =
    cbteTipoEnv === 'A' || cbteTipoEnv === 'B' || cbteTipoEnv === 'C'
      ? cbteTipoEnv
      : cbteTipoForProfile(profile);

  const description = `Ticketron — fee entradas emitidas (${params.ticketsIssued}) — ${params.eventName}`;

  const payload = {
    idempotencyKey: `ticketron_fee_mp_${paymentIdStr}`,
    paymentId: paymentIdStr,
    preferenceId: params.preferenceId,
    amount: params.amount,
    amountIncludesVat: true,
    cbteTipo,
    buyer: {
      email: params.buyer.email,
      razonSocial: profile?.razonSocial?.trim() || undefined,
      cuit: digits(profile?.cuit, 11),
      ivaCondicion: ivaCondicionForHub(profile?.ivaCondicion),
      domicilio: profile?.domicilio?.trim() || undefined,
    },
    item: {
      description,
      planName: 'Fee Ticketron',
    },
    metadata: {
      source_app: 'ticketron',
      external_reference: params.externalReference,
      charge_id: params.chargeDocId,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'No se pudo contactar al Hub';
    await persist({
      status: 'failed',
      error: limitText(msg),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, error: msg };
  }

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { error: text.slice(0, 300) };
  }

  if (!response.ok) {
    const error =
      asString(json.error) || asString(json.message) || `Hub HTTP ${response.status}`;
    await persist({
      status: 'failed',
      error: limitText(error),
      httpStatus: response.status,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, status: response.status, error };
  }

  if (json.ok === false) {
    const reason = asString(json.status) || asString(json.message) || 'hub_invoice_not_ready';
    await persist({
      status: 'pending',
      reason: limitText(reason),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, skipped: true, reason };
  }

  const result: BillingHubResult = {
    ok: true,
    facturaId: asString(json.facturaId),
    CAE: asString(json.CAE),
    CAEFchVto: asString(json.CAEFchVto),
    voucherNumber: typeof json.voucherNumber === 'number' ? json.voucherNumber : undefined,
    ptoVta: typeof json.ptoVta === 'number' ? json.ptoVta : undefined,
    cbteTipo: typeof json.cbteTipo === 'number' ? json.cbteTipo : undefined,
    tipoComprobante: asString(json.tipoComprobante),
    netoGravado: typeof json.netoGravado === 'number' ? json.netoGravado : undefined,
    iva: typeof json.iva === 'number' ? json.iva : undefined,
    total: typeof json.total === 'number' ? json.total : undefined,
    alreadyIssued: json.alreadyIssued === true,
  };

  await persist({
    status: 'issued',
    facturaId: result.facturaId ?? null,
    cae: result.CAE ?? null,
    caeFchVto: result.CAEFchVto ?? null,
    voucherNumber: result.voucherNumber ?? null,
    ptoVta: result.ptoVta ?? null,
    cbteTipo: result.cbteTipo ?? null,
    tipoComprobante: result.tipoComprobante ?? null,
    netoGravado: result.netoGravado ?? null,
    iva: result.iva ?? null,
    total: result.total ?? params.amount,
    alreadyIssued: result.alreadyIssued ?? false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return result;
}
