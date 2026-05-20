/**
 * Bloque HTML del QR en correos, compatible con Apple Mail (modo oscuro).
 * Sin el contenedor blanco forzado, Mail invierte el PNG y aparece un cuadrado negro.
 */

/** Imagen inline (cid:) con fondo blanco opaco para clientes Apple. */
export function buildEmailQrImgHtml(qrCid: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="email-qr-cell" style="margin: 0 auto 12px auto; background-color: #ffffff !important; border: 1px solid #e4e4e7; border-radius: 8px;">
  <tr>
    <td align="center" bgcolor="#FFFFFF" style="background-color: #ffffff !important; padding: 12px; border-radius: 8px;">
      <img src="cid:${qrCid}" width="196" height="196" alt="Código QR de entrada" style="display: block; width: 196px; height: 196px; max-width: 196px; border: 0; background-color: #ffffff !important; -webkit-filter: none !important; filter: none !important;" />
    </td>
  </tr>
</table>`;
}
