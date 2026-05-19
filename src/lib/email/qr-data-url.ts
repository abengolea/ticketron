import QRCode from 'qrcode';

/** Genera imagen QR como data URL (PNG) para incrustar en HTML de correo. */
export async function qrPayloadToDataUrl(
  payload: string,
  size = 220
): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}
