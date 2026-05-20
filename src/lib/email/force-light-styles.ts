import { EMAIL_BRAND } from '@/lib/email/brand';

/** Evita que Gmail/Apple inviertan fondos en modo oscuro. */
export const EMAIL_FORCE_LIGHT_STYLES = `<style type="text/css">
  :root { color-scheme: light only; supported-color-schemes: light; }
  body, .email-outer, .email-outer > table, .email-outer td { background-color: ${EMAIL_BRAND.card} !important; }
  .email-card, .email-card > table, .email-card td { background-color: ${EMAIL_BRAND.card} !important; }
  .email-section, .email-section td { background-color: ${EMAIL_BRAND.sectionBg} !important; }
  .email-text, .email-text strong { color: ${EMAIL_BRAND.text} !important; }
  .email-muted { color: ${EMAIL_BRAND.textMuted} !important; }
  .email-dim { color: ${EMAIL_BRAND.textDim} !important; }
  @media (prefers-color-scheme: dark) {
    body, .email-outer, .email-outer > table, .email-outer td { background-color: ${EMAIL_BRAND.card} !important; }
    .email-card, .email-card > table, .email-card td { background-color: ${EMAIL_BRAND.card} !important; }
    .email-section, .email-section td { background-color: ${EMAIL_BRAND.sectionBg} !important; }
    .email-text, .email-text strong { color: ${EMAIL_BRAND.text} !important; }
    .email-muted { color: ${EMAIL_BRAND.textMuted} !important; }
    .email-dim { color: ${EMAIL_BRAND.textDim} !important; }
    .email-qr-cell, .email-qr-cell td { background-color: #ffffff !important; }
    .email-qr-cell img { filter: none !important; -webkit-filter: none !important; }
  }
</style>`;

/** Fondo que Gmail suele respetar en modo oscuro (truco linear-gradient). */
export function emailBgStyle(color: string): string {
  return `background-color: ${color}; background-image: linear-gradient(${color}, ${color});`;
}
