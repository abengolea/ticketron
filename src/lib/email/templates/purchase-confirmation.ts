import {
  EMAIL_BRAND,
  TICKET_ICON_DATA_URI,
  escapeHtml,
} from '@/lib/email/brand';

export interface EmailTicketQr {
  index: number;
  total: number;
  ticketCode: string;
  qrDataUrl: string;
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
}

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
                  <td style="padding: 0 0 16px 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.background}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 10px;">
                      <tr>
                        <td align="center" style="padding: 20px;">
                          <p style="margin: 0 0 12px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${EMAIL_BRAND.textMuted};">
                            ${escapeHtml(label)}
                          </p>
                          <img src="${ticket.qrDataUrl}" width="220" height="220" alt="Código QR de entrada" style="display: block; margin: 0 auto 12px auto; border: 0; border-radius: 8px; background-color: #ffffff;" />
                          <p style="margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: ${EMAIL_BRAND.textDim}; letter-spacing: 0.04em;">
                            ${ticketCode}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
    })
    .join('');

  return `
                <!-- Códigos QR -->
                <tr>
                  <td style="padding: 0 28px 8px 28px;">
                    <p style="margin: 0 0 16px 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 18px; color: ${EMAIL_BRAND.text};">
                      Tus códigos QR
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      ${cards}
                    </table>
                    <p style="margin: 8px 0 0 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.5; color: ${EMAIL_BRAND.textMuted}; text-align: center;">
                      Presentá cualquiera de estos QR en la puerta del evento.
                    </p>
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
  const ticketLabel =
    params.ticketQuantity === 1
      ? '1 entrada'
      : `${params.ticketQuantity} entradas`;

  const ticketsQrSection = buildTicketsQrSection(params.tickets);

  const locationRow = eventLocation
    ? `
      <tr>
        <td style="padding: 8px 0; color: ${EMAIL_BRAND.textMuted}; font-size: 13px; width: 72px; vertical-align: top;">Lugar</td>
        <td style="padding: 8px 0; color: ${EMAIL_BRAND.text}; font-size: 14px; font-weight: 600;">${eventLocation}</td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Tus entradas — Ticketron</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.background}; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.background};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; margin: 0 auto;">
          <!-- Header marca -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color: ${EMAIL_BRAND.primarySoft}; border-radius: 10px; padding: 10px; vertical-align: middle;">
                    <img src="${TICKET_ICON_DATA_URI}" width="28" height="28" alt="" style="display: block; border: 0;" />
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <span style="font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 26px; font-weight: 700; color: ${EMAIL_BRAND.text}; letter-spacing: 0.02em;">Ticketron</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tarjeta principal -->
          <tr>
            <td style="background-color: ${EMAIL_BRAND.card}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px; overflow: hidden;">
              <!-- Franja superior acento -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height: 4px; background: linear-gradient(90deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.accent} 100%); font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding: 28px 28px 8px 28px;">
                    <span style="display: inline-block; background-color: rgba(34, 197, 94, 0.15); color: ${EMAIL_BRAND.success}; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 12px; border-radius: 999px;">
                      ✓ Pago confirmado
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 28px 8px 28px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 16px; line-height: 1.6; color: ${EMAIL_BRAND.text};">
                    Hola <strong>${buyerName}</strong>,
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 20px 28px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; line-height: 1.6; color: ${EMAIL_BRAND.textMuted};">
                    Tu compra fue acreditada. Tus códigos QR están abajo — guardá este correo para presentarlos en la puerta.
                  </td>
                </tr>

                <!-- Detalle del evento -->
                <tr>
                  <td style="padding: 0 28px 24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.background}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 10px;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 16px 0; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 22px; line-height: 1.3; color: ${EMAIL_BRAND.primary}; font-weight: 400;">
                            ${eventName}
                          </p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-family: ${EMAIL_BRAND.fontBody};">
                            <tr>
                              <td style="padding: 8px 0; color: ${EMAIL_BRAND.textMuted}; font-size: 13px; width: 72px; vertical-align: top;">Fecha</td>
                              <td style="padding: 8px 0; color: ${EMAIL_BRAND.text}; font-size: 14px; font-weight: 600;">${eventDate}</td>
                            </tr>
                            ${locationRow}
                            <tr>
                              <td style="padding: 8px 0; color: ${EMAIL_BRAND.textMuted}; font-size: 13px; vertical-align: top;">Cantidad</td>
                              <td style="padding: 8px 0; color: ${EMAIL_BRAND.text}; font-size: 14px; font-weight: 600;">${escapeHtml(ticketLabel)}</td>
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
                  <td align="center" style="padding: 0 28px 28px 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                          <a href="${ticketsUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px;">
                            Ver mis entradas
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Link alternativo -->
                <tr>
                  <td style="padding: 0 28px 28px 28px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.5; color: ${EMAIL_BRAND.textDim}; text-align: center;">
                    Si el botón no funciona, copiá este enlace:<br />
                    <a href="${ticketsUrl}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${ticketsUrl}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 24px 16px 8px 16px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; line-height: 1.6; color: ${EMAIL_BRAND.textDim};">
              Presentá el código QR en la puerta del evento.<br />
              Este es un mensaje automático — no respondas a este correo.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 16px; font-family: ${EMAIL_BRAND.fontHeadline}; font-size: 14px; color: ${EMAIL_BRAND.textMuted};">
              Ticketron
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
