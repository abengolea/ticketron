import { NextRequest, NextResponse } from 'next/server';
import {
  findPaymentLinkForPayment,
  fulfillPaymentLink,
} from '@/lib/services/payment-fulfillment';
import {
  findBarOrderForPayment,
  fulfillBarOrder,
  parseBarOrderExternalReference,
} from '@/lib/services/bar-fulfillment';
import { sendPurchaseConfirmationEmail } from '@/lib/services/purchase-confirmation-email';
import { resolveMercadoPagoPayment } from '@/lib/services/mercadopago-resolve';
import { getPayment } from '@/lib/mercadopago';
import {
  getPlatformMercadoPagoToken,
  isPlatformMercadoPagoConfigured,
  parseEventFeeExternalReference,
} from '@/lib/platform-mercadopago';
import {
  findEventFeeChargeForPayment,
  fulfillEventFeeCharge,
} from '@/lib/services/event-fee-charges';

/**
 * Webhook Mercado Pago — entradas (token productor) + fees plataforma (token Notificas SRL).
 *   {NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      type?: string;
      action?: string;
      data?: { id?: string };
    };

    if (
      body.type !== 'payment' &&
      body.action !== 'payment.created' &&
      body.action !== 'payment.updated'
    ) {
      return NextResponse.json({ received: true, skipped: true });
    }

    const paymentId = body.data?.id?.toString();
    if (!paymentId) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
    }

    // 1) Intentar fee de plataforma (cuenta Notificas SRL)
    if (isPlatformMercadoPagoConfigured()) {
      try {
        const platformToken = getPlatformMercadoPagoToken();
        const payment = await getPayment(paymentId, platformToken);
        const feeChargeId =
          parseEventFeeExternalReference(payment.external_reference) ||
          (
            await findEventFeeChargeForPayment(
              payment.preference_id,
              payment.external_reference
            )
          )?.id;

        if (feeChargeId) {
          if (payment.status !== 'approved') {
            return NextResponse.json({ received: true, status: payment.status, fee: true });
          }
          const result = await fulfillEventFeeCharge(
            feeChargeId,
            paymentId,
            payment.preference_id
          );
          return NextResponse.json({
            received: true,
            fulfilled: true,
            fee: true,
            created: result.created,
          });
        }
      } catch {
        /* no es pago de plataforma — seguir con productores */
      }
    }

    const resolved = await resolveMercadoPagoPayment(paymentId);
    if (!resolved) {
      console.error('No se pudo resolver el pago MP con ningún token', paymentId);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const { payment } = resolved;

    if (payment.status !== 'approved') {
      return NextResponse.json({ received: true, status: payment.status });
    }

    // Fee detectado vía preferencia aunque haya fallado el token platform arriba
    const feeHit = await findEventFeeChargeForPayment(
      payment.preference_id,
      payment.external_reference
    );
    if (feeHit) {
      const result = await fulfillEventFeeCharge(
        feeHit.id,
        paymentId,
        payment.preference_id
      );
      return NextResponse.json({
        received: true,
        fulfilled: true,
        fee: true,
        created: result.created,
      });
    }

    if (parseBarOrderExternalReference(payment.external_reference)) {
      const barOrder = await findBarOrderForPayment(
        payment.preference_id,
        payment.external_reference
      );
      if (!barOrder) {
        console.error('BarOrder no encontrada para pago', paymentId);
        return NextResponse.json({ error: 'Bar order not found' }, { status: 404 });
      }
      const barResult = await fulfillBarOrder(barOrder.id, paymentId);
      return NextResponse.json({
        received: true,
        fulfilled: true,
        bar: true,
        created: barResult.created,
        voucherCode: barResult.voucherCode,
      });
    }

    const paymentLink = await findPaymentLinkForPayment(
      payment.preference_id,
      payment.external_reference
    );

    if (!paymentLink) {
      const barOrder = await findBarOrderForPayment(payment.preference_id, undefined);
      if (barOrder) {
        const barResult = await fulfillBarOrder(barOrder.id, paymentId);
        return NextResponse.json({
          received: true,
          fulfilled: true,
          bar: true,
          created: barResult.created,
          voucherCode: barResult.voucherCode,
        });
      }
      console.error('PaymentLink no encontrado para pago', paymentId);
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    const result = await fulfillPaymentLink(paymentLink.id, paymentId);

    if (result.ticketCodes?.length) {
      try {
        await sendPurchaseConfirmationEmail(paymentLink.id);
      } catch (emailError) {
        console.error('Error enviando email de confirmación:', emailError);
      }
    }

    return NextResponse.json({
      received: true,
      fulfilled: true,
      created: result.created,
      ticketCodes: result.ticketCodes,
    });
  } catch (error) {
    console.error('Webhook MP error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'mercadopago-webhook' });
}
