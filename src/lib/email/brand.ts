/** Colores y tipografías alineados con `src/app/globals.css` */
export const EMAIL_BRAND = {
  primary: '#4D9BF9',
  primaryHover: '#3B82F6',
  primarySoft: 'rgba(77, 155, 249, 0.15)',
  accent: '#FF6B9D',
  accentSoft: 'rgba(255, 107, 157, 0.12)',
  background: '#09090b',
  card: '#18181b',
  cardBorder: '#27272a',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
  success: '#22c55e',
  fontHeadline: 'Georgia, "Times New Roman", Times, serif',
  fontBody:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

/** Ícono ticket (Lucide-style) en base64 para clientes de correo */
export const TICKET_ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM0RDlCRjkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMiA5YTMgMyAwIDAgMSAzLTNoMTRhMyAzIDAgMCAxIDMgM3YxYTIgMiAwIDAgMCAwIDR2MWEzIDMgMCAwIDEtMyAzSDVhMyAzIDAgMCAxLTMtM3YtMWEyIDIgMCAwIDAgMC00WiIvPjxwYXRoIGQ9Ik0xMyA1djIiLz48cGF0aCBkPSJNMTMgMTd2MiIvPjxwYXRoIGQ9Ik0xMyAxMXYyIi8+PC9zdmc+';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
