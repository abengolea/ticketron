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

/**
 * Webhook Mercado Pago — configurar en panel MP de cada productor:
 *   {NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook
 * Eventos: payment
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      type?: string;
      action?: string;
      data?: { id?: string };
    };

    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return NextResponse.json({ received: true, skipped: true });
    }

    const paymentId = body.data?.id?.toString();
    if (!paymentId) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
    }

    const resolved = await resolveMercadoPagoPayment(paymentId);
    if (!resolved) {
      console.error('No se pudo resolver el pago MP con ningún token de productor', paymentId);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const { payment } = resolved;

    if (payment.status !== 'approved') {
      return NextResponse.json({ received: true, status: payment.status });
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
