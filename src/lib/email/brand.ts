/** Paleta para correos transaccionales (tema claro — mejor legibilidad en Gmail/Apple Mail). */
export const EMAIL_BRAND = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: 'rgba(37, 99, 235, 0.1)',
  accent: '#db2777',
  accentSoft: 'rgba(219, 39, 119, 0.08)',
  /** Fondo exterior del cuerpo del mail */
  background: '#f4f4f5',
  /** Tarjeta principal */
  card: '#ffffff',
  cardBorder: '#e4e4e7',
  /** Cajas internas (evento, QR) */
  sectionBg: '#f9fafb',
  text: '#18181b',
  textMuted: '#52525b',
  textDim: '#71717a',
  success: '#15803d',
  successBg: '#dcfce7',
  fontHeadline:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontBody:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

/** Ícono ticket (Lucide-style) en base64 para clientes de correo */
export const TICKET_ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzZWIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMiA5YTMgMyAwIDAgMSAzLTNoMTRhMyAzIDAgMCAxIDMgM3YxYTIgMiAwIDAgMCAwIDR2MWEzIDMgMCAwIDEtMyAzSDVhMyAzIDAgMCAxLTMtM3YtMWEyIDIgMCAwIDAgMC00WiIvPjxwYXRoIGQ9Ik0xMyA1djIiLz48cGF0aCBkPSJNMTMgMTd2MiIvPjxwYXRoIGQ9Ik0xMyAxMXYyIi8+PC9zdmc+';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
