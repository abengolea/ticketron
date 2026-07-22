import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';
import { formatArs } from '@/lib/payment-link-utils';

export interface ProducerWelcomeEmailParams {
  displayName: string;
  organizationName?: string;
  loginUrl: string;
  pricePerEvent: number;
  pricePerTicket: number;
}

export function buildProducerWelcomeEmailHtml(
  params: ProducerWelcomeEmailParams
): string {
  const displayName = escapeHtml(params.displayName);
  const org = params.organizationName
    ? escapeHtml(params.organizationName)
    : null;
  const loginUrl = escapeHtml(params.loginUrl);
  const feeEvent = escapeHtml(formatArs(params.pricePerEvent));
  const feeTicket = escapeHtml(formatArs(params.pricePerTicket));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bienvenido a Ticketron</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.background};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px;">
          <tr>
            <td bgcolor="${EMAIL_BRAND.card}" style="background-color: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 16px; padding: 32px 28px;">
              <p style="margin: 0 0 4px 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: ${EMAIL_BRAND.primary};">Ticketron</p>
              <p style="margin: 0 0 8px 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 22px; font-weight: 700; color: ${EMAIL_BRAND.text};">¡Bienvenido, ${displayName}!</p>
              <p style="margin: 0 0 24px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.7; color: ${EMAIL_BRAND.textMuted};">
                ${org ? `Tu productora <strong style="color:${EMAIL_BRAND.text}">${org}</strong> fue aprobada.` : 'Tu cuenta de productor fue aprobada.'}
                Ya podés crear eventos, vender entradas y cobrar con Mercado Pago.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.sectionBg}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <p style="margin: 0 0 8px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: ${EMAIL_BRAND.textDim};">Fees de plataforma</p>
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; color: ${EMAIL_BRAND.text}; line-height: 1.6;">
                      <strong>${feeEvent}</strong> por evento · <strong>${feeTicket}</strong> por entrada emitida
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${EMAIL_BRAND.primary}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none;">Ingresar a Ticketron</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                Usá el email y la contraseña con los que te registraste.<br />
                <a href="${loginUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 20px 8px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; color: ${EMAIL_BRAND.textDim};">Ticketron — mensaje automático</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
