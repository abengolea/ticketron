'use client';

import type { jsPDF } from "jspdf";
import type domtoimage from "dom-to-image-more";

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

const pad = (n: number) => String(n).padStart(4, "0");

/** Quita sombras/bordes durante la captura */
function applyCaptureStyles(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('*').forEach(n => {
    n.style.boxShadow = 'none';
    n.style.textShadow = 'none';
    n.style.outline = 'none';
    n.style.borderImage = 'initial';
  });
}

/** Restaura estilos (por si capturás el DOM original en lugar del clon) */
function removeCaptureStyles(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('*').forEach(n => {
    n.style.boxShadow = '';
    n.style.textShadow = '';
    n.style.outline = '';
    n.style.borderImage = '';
  });
}

/** Captura segura, sin CORS y sin hairlines alrededor */
export async function captureTicketPNG(node: HTMLElement): Promise<string> {
  const domtoimage: typeof import('dom-to-image-more').default = (await import('dom-to-image-more')).default;
  // CLON limpio
  const cloned = node.cloneNode(true) as HTMLElement;

  // Reemplazo de canvas → img (ej.: QR)
  cloned.querySelectorAll('canvas').forEach((c) => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement('img');
      img.src = can.toDataURL('image/png');
      img.width = can.width;
      img.height = can.height;
      img.style.width = `${can.width}px`;
      img.style.height = `${can.height}px`;
      c.replaceWith(img);
    } catch {}
  });

  // Wrapper con fondo blanco y 1px de padding (bleed) para “comerse” el borde
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    background:#ffffff; 
    padding:1px;                /* ← bleed */
    border-radius:18px;         /* opcional: acompaña tu card */
    display:inline-block;
  `;
  wrapper.appendChild(cloned);

  // Contenedor offscreen
  const temp = document.createElement('div');
  temp.style.cssText = `
    position:fixed; left:-99999px; top:0; z-index:-1;
  `;
  temp.appendChild(wrapper);
  document.body.appendChild(temp);

  // Estilos de captura (sin sombras/bordes)
  applyCaptureStyles(wrapper);

  try {
    const dataUrl = await domtoimage.toPng(wrapper, {
      cacheBust: true,
      quality: 1,
      bgcolor: '#ffffff',   // fondo sólido (evita halos)
      copyStyles: false,    // no intentar inlinar CSS externo (evita CORS)
      filter: (n) => {
        // Ignorá Google Fonts y cualquier <link> externo
        if (n instanceof HTMLLinkElement) {
          const href = n.getAttribute('href') || '';
          return !href.includes('fonts.googleapis.com') && !href.includes('fonts.gstatic.com');
        }
        return true;
      },
      style: {
        background: '#ffffff',
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
    });

    return dataUrl;
  } finally {
    // Limpieza
    removeCaptureStyles(wrapper);
    temp.remove();
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function buildPdfFromPngs(
  pngs: string[],
  fileName: string,
  opts?: { marginXmm?: number; marginYmm?: number; spacingMm?: number }
) {
  const { default: jsPDF } = await import("jspdf");
  const marginX = opts?.marginXmm ?? 10;
  const marginY = opts?.marginYmm ?? 10;
  const spacing = opts?.spacingMm ?? 10;  // tu separación entre tickets
  const overlap = 0.2;                    // ← solape anti-hairline en mm

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const drawW = pageW - marginX * 2;

  let y = marginY;

  for (let i = 0; i < pngs.length; i++) {
    const img = pngs[i];

    // Medidas reales del PNG
    const imgProps = pdf.getImageProperties(img);
    const drawH = round2((imgProps.height / imgProps.width) * drawW);

    // ¿Cabe en esta página?
    if (y + drawH + marginY > pageH) {
      pdf.addPage();
      y = marginY;
    }

    // Coordenadas redondeadas
    const x = round2(marginX);
    const yPos = round2(y);

    // Colocar imagen (usa 'FAST' si todo ok, o probá sin el 7mo arg si ves artefactos)
    pdf.addImage(img, 'PNG', x, yPos, drawW, drawH);

    // Avanza con un pequeño solape negativo para “tapar” cualquier hairline
    y = y + drawH + spacing - overlap;
  }

  pdf.save(fileName);
}

/**
 * Genera un PDF de un lote específico.
 * @param ticketRefs refs de TODAS las tarjetas
 * @param eventName  nombre del evento para el archivo
 * @param perFile    tamaño del lote (100)
 * @param batchIndex índice del lote (0-based). Ej: 0 => 0001-0100
 */
export async function generateOneBatchPdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
  perFile: number,
  batchIndex: number
) {
  const start = batchIndex * perFile;
  const end = Math.min(start + perFile, ticketRefs.length);

  const images: string[] = [];
  for (let i = start; i < end; i++) {
    const ref = ticketRefs[i];
    if (!ref?.current) continue;
    const png = await captureTicketPNG(ref.current);
    images.push(png);
    if ((i - start + 1) % 10 === 0) await new Promise(r => setTimeout(r, 20));
  }

  const base = slugify(eventName);
  const humanStart = pad(start + 1);
  const humanEnd = pad(end);
  const fileName = `${base}_${humanStart}-${humanEnd}.pdf`;

  await buildPdfFromPngs(images, fileName, { spacingMm: 3.5, marginXmm: 5, marginYmm: 5 });
}
