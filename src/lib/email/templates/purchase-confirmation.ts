import {
  EMAIL_BRAND,
  TICKET_ICON_DATA_URI,
  escapeHtml,
} from '@/lib/email/brand';
import { buildBuyerAccountCtaHtml } from '@/lib/email/templates/buyer-account-cta';
import { buildEmailQrImgHtml } from '@/lib/email/qr-email-block';

export interface EmailTicketQr {
  index: number;
  total: number;
  ticketCode: string;
  /** Content-ID del adjunto inline (referenciar como cid:xxx en el HTML). */
  qrCid: string;
}

export interface PurchaseConfirmationEmailParams {
  buyerName: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  ticketQuantity: number;
  tickets: EmailTicketQr[];
  ticketsUrl: string;
  appUrl: string;
  accountUrl?: string;
}

const QR_HEAD_STYLES = `<style type="text/css">
  @media (prefers-color-scheme: dark) {
    .email-qr-cell, .email-qr-cell td { background-color: #ffffff !important; }
    .email-qr-cell img { background-color: #ffffff !important; filter: none !important; -webkit-filter: none !important; }
  }
</style>`;

function buildTicketsQrSection(tickets: EmailTicketQr[]): string {
  if (tickets.length === 0) return '';

  const cards = tickets
    .map((ticket) => {
      const label =
        ticket.total === 1
          ? 'Tu entrada'
          : `Entrada ${ticket.index} de ${ticket.total}`;
      const ticketCode = escapeHtml(ticket.ticketCode);
      return `
                <tr>
                  <td style="padding: 0 0 14px 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px; overflow: hidden;">
                      <tr>
                        <td height="3" bgcolor="#2563eb" style="height: 3px; background: linear-gradient(90deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.accent} 100%); font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td align="center" style="padding: 24px 20px 20px 20px;">
                          <p style="margin: 0 0 18px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${EMAIL_BRAND.textMuted};">${escapeHtml(label)}</p>
                          ${buildEmailQrImgHtml(ticket.qrCid)}
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 12px auto 0 auto;">
                            <tr>
                              <td style="background-color: ${EMAIL_BRAND.sectionBg}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 6px; padding: 5px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: ${EMAIL_BRAND.textDim}; letter-spacing: 0.1em;">${ticketCode}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
    })
    .join('');

  return `
                <tr>
                  <td style="padding: 0 28px 4px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr><td height="1" bgcolor="#e4e4e7" style="height: 1px; font-size: 0; line-height: 0; padding: 0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 28px 16px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${EMAIL_BRAND.textMuted};">Tus códigos QR</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      ${cards}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 24px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">Presentá este QR en la puerta del evento.</p>
                  </td>
                </tr>`;
}

export function buildPurchaseConfirmationEmailHtml(
  params: PurchaseConfirmationEmailParams
): string {
  const buyerName = escapeHtml(params.buyerName);
  const eventName = escapeHtml(params.eventName);
  const eventDate = escapeHtml(params.eventDate);
  const eventLocation = params.eventLocation
    ? escapeHtml(params.eventLocation)
    : '';
  const ticketsUrl = escapeHtml(params.ticketsUrl);
  const accountCtaSection = params.accountUrl
    ? buildBuyerAccountCtaHtml(params.accountUrl)
    : '';
  const ticketLabel =
    params.ticketQuantity === 1
      ? '1 entrada'
      : `${params.ticketQuantity} entradas`;

  const ticketsQrSection = buildTicketsQrSection(params.tickets);

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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tus entradas — Ticketron</title>
  ${QR_HEAD_STYLES}
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background}; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL_BRAND.background}" style="background-color: ${EMAIL_BRAND.background};">
    <tr>
      <td align="center" style="padding: 36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; margin: 0 auto;">

          <!-- Marca -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="${EMAIL_BRAND.primarySoft}" style="background-color: ${EMAIL_BRAND.primarySoft}; border-radius: 10px; padding: 10px; vertical-align: middle;">
                    <img src="${TICKET_ICON_DATA_URI}" width="28" height="28" alt="" style="display: block; border: 0;" />
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 24px; font-weight: 700; color: ${EMAIL_BRAND.text}; letter-spacing: 0.01em;">Ticketron</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tarjeta principal -->
          <tr>
            <td bgcolor="${EMAIL_BRAND.card}" style="background-color: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 16px; overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

                <!-- Franja gradiente -->
                <tr>
                  <td height="5" bgcolor="#2563eb" style="height: 5px; background: linear-gradient(90deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.accent} 100%); font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                </tr>

                <!-- Badge -->
                <tr>
                  <td style="padding: 28px 28px 0 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td bgcolor="${EMAIL_BRAND.successBg}" style="background-color: ${EMAIL_BRAND.successBg}; border-radius: 999px; padding: 6px 16px;">
                          <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${EMAIL_BRAND.success};">✓&nbsp; Pago confirmado</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Saludo -->
                <tr>
                  <td style="padding: 20px 28px 4px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 22px; font-weight: 700; line-height: 1.3; color: ${EMAIL_BRAND.text};">Hola, ${buyerName}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 28px 28px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.7; color: ${EMAIL_BRAND.textMuted};">Tu compra fue acreditada. Tus códigos QR están abajo &mdash; guardá este correo para presentarlos en la puerta.</p>
                  </td>
                </tr>

                <!-- Detalle del evento -->
                <tr>
                  <td style="padding: 0 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.sectionBg}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px; overflow: hidden;">
                      <tr>
                        <td height="3" bgcolor="#2563eb" style="height: 3px; background: linear-gradient(90deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.accent} 100%); font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
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
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${EMAIL_BRAND.textDim};">Cantidad</p>
                              </td>
                              <td style="border-top: 1px solid ${EMAIL_BRAND.cardBorder}; padding: 10px 0 0 0; vertical-align: middle;">
                                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; color: ${EMAIL_BRAND.primary};">${escapeHtml(ticketLabel)}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${ticketsQrSection}

                <!-- CTA -->
                <tr>
                  <td align="center" style="padding: 8px 28px 28px 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${EMAIL_BRAND.primary}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                          <a href="${ticketsUrl}" target="_blank" style="display: inline-block; padding: 14px 40px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; letter-spacing: 0.02em; color: #ffffff; text-decoration: none; border-radius: 8px;">Ver mis entradas</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Link alternativo -->
                <tr>
                  <td style="padding: 0 28px 28px 28px;">
                    <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                      Si el botón no funciona, copiá este enlace:<br />
                      <a href="${ticketsUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${ticketsUrl}</a>
                    </p>
                  </td>
                </tr>

                ${accountCtaSection}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 24px 16px 6px 16px;">
              <p style="margin: 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.7; color: ${EMAIL_BRAND.textDim};">Presentá el código QR en la puerta del evento.<br />Este es un mensaje automático &mdash; no respondas a este correo.</p>
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
