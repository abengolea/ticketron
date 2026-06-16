'use client';

export type DigitalTicketPdfEntry = {
  eventName: string;
  eventDate: string;
  buyerName: string;
  ticketCode: string;
  qrDataUrl: string;
};

async function pngToJpegDataUrl(pngDataUrl: string, quality = 0.95): Promise<string> {
  const img = new Image();
  img.src = pngDataUrl;
  await new Promise((r) => (img.onload = r));
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', quality);
}

/** PDF simple para el comprador: una entrada por hoja A4 con QR centrado. */
export async function buildDigitalTicketsPdf(
  entries: DigitalTicketPdfEntry[],
  fileName: string
): Promise<void> {
  if (entries.length === 0) return;

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;

  for (let i = 0; i < entries.length; i++) {
    if (i > 0) pdf.addPage();
    const e = entries[i];
    let y = 32;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(0);
    const titleLines = pdf.splitTextToSize(e.eventName, contentW) as string[];
    pdf.text(titleLines, pageW / 2, y, { align: 'center' });
    y += titleLines.length * 8 + 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    const dateStr = new Date(e.eventDate).toLocaleString('es-AR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    pdf.text(dateStr, pageW / 2, y, { align: 'center' });
    y += 12;

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(e.buyerName, pageW / 2, y, { align: 'center' });
    y += 10;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text(e.ticketCode, pageW / 2, y, { align: 'center' });
    pdf.setTextColor(0);
    y += 14;

    const qrSize = 80;
    const qrX = (pageW - qrSize) / 2;
    const imgDataUrl = await pngToJpegDataUrl(e.qrDataUrl);
    pdf.addImage(imgDataUrl, 'JPEG', qrX, y, qrSize, qrSize);
    y += qrSize + 10;

    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text('Presentá este QR en la puerta del evento', pageW / 2, y, {
      align: 'center',
    });
    pdf.setTextColor(0);
  }

  pdf.save(fileName);
}
