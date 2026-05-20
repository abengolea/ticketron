import { EMAIL_BRAND, escapeHtml } from '@/lib/email/brand';

/** Bloque HTML para el mail de entradas: invita a crear cuenta online. */
export function buildBuyerAccountCtaHtml(accountUrl: string): string {
  const url = escapeHtml(accountUrl);
  return `
                <!-- Cuenta online -->
                <tr>
                  <td style="padding: 0 28px 20px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${EMAIL_BRAND.sectionBg}; border: 1px solid ${EMAIL_BRAND.cardBorder}; border-radius: 12px; overflow: hidden;">
                      <tr>
                        <td style="padding: 18px 20px;">
                          <p style="margin: 0 0 8px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 700; color: ${EMAIL_BRAND.text};">¿Querés ver todas tus entradas en un solo lugar?</p>
                          <p style="margin: 0 0 14px 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 13px; line-height: 1.6; color: ${EMAIL_BRAND.textMuted};">Creá tu cuenta con un click, elegí una contraseña y accedé cuando quieras desde la plataforma.</p>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" bgcolor="${EMAIL_BRAND.accent}" style="border-radius: 8px; background-color: ${EMAIL_BRAND.accent};">
                                <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 28px; font-family: ${EMAIL_BRAND.fontBody}; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px;">Crear mi cuenta</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 12px 0 0 0; font-family: ${EMAIL_BRAND.fontBody}; font-size: 11px; line-height: 1.5; color: ${EMAIL_BRAND.textDim};">
                            Link directo: <a href="${url}" style="color: ${EMAIL_BRAND.primary}; word-break: break-all;">${url}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`.trim();
}
