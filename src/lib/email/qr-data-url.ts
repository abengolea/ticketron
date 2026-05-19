import QRCode from 'qrcode';

const QR_OPTIONS = {
  width: 220,
  margin: 4,
  errorCorrectionLevel: 'M' as const,
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
} as const;

/** Content-ID para adjunto inline en correo (Gmail no muestra data: URIs). */
export function ticketQrContentId(index: number): string {
  return `ticket-qr-${index}`;
}

/** PNG en base64 (sin prefijo data:) para adjuntos Resend con content_id. */
export async function qrPayloadToPngBase64(
  payload: string,
  size = QR_OPTIONS.width
): Promise<string> {
  const dataUrl = await QRCode.toDataURL(payload, { ...QR_OPTIONS, width: size });
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
