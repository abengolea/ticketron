import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';
import {
  defaultInvitationCopy,
  INVITE_LINK_PLACEHOLDER,
} from '@/lib/invitation-copy';

export { defaultInvitationCopy };

export interface EventInvitationEmailParams {
  headline: string;
  message: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  rsvpUrl: string;
  maxTicketsPerInvite: number;
  isPreview?: boolean;
}

const EMAIL_HEAD_STYLES = `<style type="text/css">
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
</style>`;

const LINK_SPLIT = new RegExp(
  `\\[\\s*LINK DE RESERVA\\s*\\]|${INVITE_LINK_PLACEHOLDER.replace(/[{}]/g, '\\$&')}`,
  'i'
);

function messageToHtml(message: string): string {
  return escapeHtml(message).replace(/\r\n|\n|\r/g, '<br />');
}

function messageBlock(text: string): string {
  const html = messageToHtml(text.trim());
  if (!html) return '';
  return `
                <tr>
                  <td style="padding: 0 28px 16px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.75; color: ${EMAIL_BRAND.textMuted};">${html}</p>
                  </td>
                </tr>`;
}

function rsvpButtonBlock(rsvpUrl: string): string {
  return `
                <tr>
                  <td align="center" style="padding: 8px 28px 8px 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${EMAIL_BRAND.primary}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                          <a href="${rsvpUrl}" target="_blank" style="display: inline-block; padding: 15px 40px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; letter-spacing: 0.02em; color: #ffffff; text-decoration: none; border-radius: 8px;">Reservar mis entradas</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 28px 20px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                      Si el botón no funciona, copiá este enlace:<br />
                      <a href="${rsvpUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${rsvpUrl}</a>
                    </p>
                  </td>
                </tr>`;
}

export function buildEventInvitationEmailHtml(
  params: EventInvitationEmailParams
): string {
  const headline = escapeHtml(params.headline);
  const eventName = escapeHtml(params.eventName);
  const rsvpUrl = escapeHtml(params.rsvpUrl);
  const parts = params.message.split(LINK_SPLIT);
  const hasInlineLink = parts.length > 1;
  const messageRows = parts
    .map((part, index) => messageBlock(part) + (index < parts.length - 1 ? rsvpButtonBlock(rsvpUrl) : ''))
    .join('');
  const trailingCta = hasInlineLink ? '' : rsvpButtonBlock(rsvpUrl);

  const previewBanner = params.isPreview
    ? `
                <tr>
                  <td style="padding: 20px 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.5; color: #92400e;">Esto es una prueba. El botón sí funciona: podés reservar para ver el flujo.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline} — ${eventName}</title>
  ${EMAIL_HEAD_STYLES}
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background}; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL_BRAND.background}" style="background-color: ${EMAIL_BRAND.background};">
    <tr>
      <td align="center" style="padding: 36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; margin: 0 auto;">

          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: ${EMAIL_BRAND.accent};">Música &amp; Amigos</p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${EMAIL_BRAND.card}" style="background-color: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 16px; overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

                <tr>
                  <td height="5" bgcolor="#2563eb" style="height: 5px; background: linear-gradient(90deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.accent} 100%); font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                </tr>

                ${previewBanner}

                <tr>
                  <td style="padding: 28px 28px 12px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 28px; font-weight: 700; line-height: 1.25; color: ${EMAIL_BRAND.text};">${headline}</p>
                  </td>
                </tr>

                ${messageRows}
                ${trailingCta}

              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 24px 16px 20px 16px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.7; color: ${EMAIL_BRAND.textDim};">Este enlace es personal. No reenvíes el mail: cada invitación reserva cupo a tu nombre.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
