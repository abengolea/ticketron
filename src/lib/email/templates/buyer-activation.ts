import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';

export interface BuyerActivationEmailParams {
  buyerName: string;
  activationUrl: string;
}

export function buildBuyerActivationEmailHtml(params: BuyerActivationEmailParams): string {
  const buyerName = escapeHtml(params.buyerName);
  const activationUrl = escapeHtml(params.activationUrl);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Activá tu cuenta — Ticketron</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.background};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px;">
          <tr>
            <td bgcolor="${EMAIL_BRAND.card}" style="background-color: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 16px; padding: 32px 28px;">
              <p style="margin: 0 0 8px 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 22px; font-weight: 700; color: ${EMAIL_BRAND.text};">Hola, ${buyerName}</p>
              <p style="margin: 0 0 24px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.7; color: ${EMAIL_BRAND.textMuted};">
                Activá tu cuenta en Ticketron para ver y descargar todas tus entradas desde un solo lugar.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${EMAIL_BRAND.primary}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                    <a href="${activationUrl}" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none;">Elegir mi contraseña</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                El link vence en 7 días.<br />
                <a href="${activationUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${activationUrl}</a>
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
