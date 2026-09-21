import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';
import { defaultInvitationCopy } from '@/lib/invitation-copy';

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

function messageToHtml(message: string): string {
  return escapeHtml(message).replace(/\r\n|\n|\r/g, '<br />');
}

export function buildEventInvitationEmailHtml(
  params: EventInvitationEmailParams
): string {
  const headline = escapeHtml(params.headline);
  const eventName = escapeHtml(params.eventName);
  const eventDate = escapeHtml(params.eventDate);
  const eventLocation = params.eventLocation
    ? escapeHtml(params.eventLocation)
    : '';
  const rsvpUrl = escapeHtml(params.rsvpUrl);
  const messageHtml = messageToHtml(params.message);
  const maxTickets = String(params.maxTicketsPerInvite);
  const ticketHint =
    params.maxTicketsPerInvite === 1
      ? '1 entrada'
      : `hasta ${maxTickets} entradas`;

  const locationRow = eventLocation
    ? `
                            <tr>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 16px 10px 0; width: 80px; vertical-align: top;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${EMAIL_BRAND.textDim};">Lugar</p>
                              </td>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 0; vertical-align: top;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 600; color: ${EMAIL_BRAND.text};">${eventLocation}</p>
                              </td>
                            </tr>`
    : '';

  const previewBanner = params.isPreview
    ? `
                <tr>
                  <td style="padding: 20px 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.5; color: #92400e;">Esto es una prueba. El botón sí funciona: podés reservar para ver el flujo. Si confirmás, se emiten entradas reales.</p>
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
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="${EMAIL_BRAND.primary}" style="background-color: ${EMAIL_BRAND.primary}; border-radius: 10px; padding: 10px 13px; vertical-align: middle;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1;">T</p>
                  </td>
                  <td style="padding-left: 11px; vertical-align: middle;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 22px; font-weight: 800; color: ${EMAIL_BRAND.text}; letter-spacing: -0.03em;">Ticketron</p>
                  </td>
                </tr>
              </table>
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
                  <td style="padding: 28px 28px 0 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td bgcolor="${EMAIL_BRAND.accentSoft}" style="background-color: ${EMAIL_BRAND.accentSoft}; border-radius: 999px; padding: 6px 16px;">
                          <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${EMAIL_BRAND.accent};">Invitación</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 18px 28px 6px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 26px; font-weight: 700; line-height: 1.25; color: ${EMAIL_BRAND.text};">${headline}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 28px 24px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.7; color: ${EMAIL_BRAND.textMuted};">${messageHtml}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 0 28px 24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.sectionBg}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px; overflow: hidden;">
                      <tr>
                        <td height="3" bgcolor="#db2777" style="height: 3px; background: linear-gradient(90deg, ${EMAIL_BRAND.accent} 0%, ${EMAIL_BRAND.primary} 100%); font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td style="padding: 18px 20px 14px 20px;">
                          <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 20px; font-weight: 700; line-height: 1.3; color: ${EMAIL_BRAND.text};">${eventName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 20px 16px 20px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 16px 10px 0; width: 80px; vertical-align: top;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${EMAIL_BRAND.textDim};">Fecha</p>
                              </td>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 0; vertical-align: top;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 600; color: ${EMAIL_BRAND.text};">${eventDate}</p>
                              </td>
                            </tr>
                            ${locationRow}
                            <tr>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 16px 0 0; width: 80px; vertical-align: middle;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${EMAIL_BRAND.textDim};">Cupo</p>
                              </td>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 0 0 0; vertical-align: middle;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 600; color: ${EMAIL_BRAND.primary};">Reservá ${escapeHtml(ticketHint)}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding: 4px 28px 12px 28px;">
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
                  <td style="padding: 0 28px 28px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                      Este enlace es personal. Indicá cuántas personas van con vos para bloquear el cupo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 28px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                      Si el botón no funciona, copiá este enlace:<br />
                      <a href="${rsvpUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${rsvpUrl}</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 24px 16px 6px 16px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.7; color: ${EMAIL_BRAND.textDim};">Este es un mensaje automático &mdash; no respondas a este correo.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 13px; color: ${EMAIL_BRAND.textMuted}; letter-spacing: 0.04em;">Ticketron</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
