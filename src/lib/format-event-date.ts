/** Zona horaria de referencia para eventos (Argentina no usa horario de verano). */
export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Fecha/hora del evento para mostrar al usuario (emails, PDFs en servidor, etc.). */
export function formatEventDateForDisplay(date: Date): string {
  return date.toLocaleString('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: ARGENTINA_TIME_ZONE,
  });
}
