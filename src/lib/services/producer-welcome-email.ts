import { sendEmailViaResend } from '@/lib/email/resend-send';
import { buildProducerWelcomeEmailHtml } from '@/lib/email/templates/producer-welcome';

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002').replace(
    /\/$/,
    ''
  );
}

export async function sendProducerWelcomeEmail(params: {
  to: string;
  displayName: string;
  organizationName?: string;
  pricePerEvent: number;
  pricePerTicket: number;
}): Promise<void> {
  const loginUrl = `${appBaseUrl()}/login`;
  const html = buildProducerWelcomeEmailHtml({
    displayName: params.displayName,
    organizationName: params.organizationName,
    loginUrl,
    pricePerEvent: params.pricePerEvent,
    pricePerTicket: params.pricePerTicket,
  });

  await sendEmailViaResend({
    to: params.to,
    subject: 'Bienvenido a Ticketron — tu cuenta fue aprobada',
    html,
  });
}
