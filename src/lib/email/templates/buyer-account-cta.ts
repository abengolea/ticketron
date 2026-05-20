import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';

export function buildBuyerAccountCtaHtml(accountUrl: string): string {
  const url = escapeHtml(accountUrl);
  return `
                <tr>
                  <td style="padding: 0 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.sectionBg}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px;">
                      <tr>
                        <td style="padding: 24px 24px 20px 24px;">
                          <p style="margin: 0 0 6px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 16px; font-weight: 700; color: ${EMAIL_BRAND.text}; line-height: 1.3;">¿Querés ver todas tus entradas en un solo lugar?</p>
                          <p style="margin: 0 0 20px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; line-height: 1.6; color: ${EMAIL_BRAND.textMuted};">Creá tu cuenta con un click, elegí una contraseña y accedé cuando quieras desde la plataforma.</p>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" bgcolor="${EMAIL_BRAND.primary}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.primary};">
                                <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 28px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 700; letter-spacing: 0.01em; color: #ffffff; text-decoration: none; border-radius: 8px;">Crear mi cuenta</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 12px 0 0 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 12px; color: ${EMAIL_BRAND.textDim};">
                            Link directo: <a href="${url}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${url}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}
