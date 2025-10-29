'use client';

import type { jsPDF } from "jspdf";
import type domtoimage from "dom-to-image-more";

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

const pad = (n: number) => String(n).padStart(4, "0");

/** Deshabilita stylesheets cross-origin durante la captura y los restablece al final */
function withSafeStyles<T>(fn: () => Promise<T>): Promise<T> {
  const disabled: CSSStyleSheet[] = [];
  // Desactivar stylesheets que no permiten leer cssRules (p.ej., Google Fonts)
  for (const sheet of Array.from(document.styleSheets) as CSSStyleSheet[]) {
    try {
      // Si esto tira SecurityError, es cross-origin
      // @ts-ignore forzamos acceso para probar
      void sheet.cssRules;
    } catch {
      sheet.disabled = true;
      disabled.push(sheet);
    }
  }

  return fn().finally(() => {
    // Restaurar stylesheets
    for (const s of disabled) s.disabled = false;
  });
}

export async function captureTicketPNG(node: HTMLElement): Promise<string> {
  const domtoimage: typeof import('dom-to-image-more').default = (await import('dom-to-image-more')).default;
  // Clonado + canvas->img (como ya tenías)
  const cloned = node.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll("canvas").forEach((c) => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement("img");
      img.src = can.toDataURL("image/png");
      img.width = can.width;
      img.height = can.height;
      img.style.width = `${can.width}px`;
      img.style.height = `${can.height}px`;
      can.replaceWith(img);
    } catch {}
  });

  const temp = document.createElement("div");
  temp.style.cssText = `
    position: fixed; left: -99999px; top: 0;
    background:#fff; margin:0; padding:0; z-index:-1;
    width:${node.clientWidth || 420}px;
  `;
  temp.appendChild(cloned);
  document.body.appendChild(temp);

  try {
    // Ejecutar la captura con los stylesheets cross-origin desactivados
    return await withSafeStyles(() =>
      domtoimage.toPng(cloned, {
        cacheBust: true,
        quality: 1,
        // Filtro opcional por si tuvieras <link> dentro del clon (normalmente no)
        filter: (n: Node) => {
          // Excluir links a Google Fonts si aparecieran en el árbol
          if (n instanceof HTMLLinkElement && /fonts\.googleapis\.com/.test(n.href)) return false;
          return true;
        },
        style: {
          // Asegura colores y fuentes aplicadas en el clon
          background: "#ffffff",
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      })
    );
  } finally {
    temp.remove();
  }
}

export function addImagesStackedA4(pdf: jsPDF, images: string[]) {
  const margin = 5;       // márgenes
  const gap = 3.5;        // espacio entre tickets
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;

  let y = margin;

  for (const dataUrl of images) {
    const props = pdf.getImageProperties(dataUrl);
    const imgW = usableW;
    const imgH = (props.height * imgW) / props.width;

    if (y + imgH + margin > pageH) {
      pdf.addPage();
      y = margin;
    }
    pdf.addImage(dataUrl, "PNG", margin, y, imgW, imgH, undefined, "NONE");
    y += imgH + gap;
  }
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
  const { default: jsPDF } = await import("jspdf");

  const start = batchIndex * perFile;            // índice inicial (0-based)
  const end = Math.min(start + perFile, ticketRefs.length);

  const images: string[] = [];
  for (let i = start; i < end; i++) {
    const ref = ticketRefs[i];
    if (!ref?.current) continue;
    const png = await captureTicketPNG(ref.current);
    images.push(png);
    // ceder el hilo para no congelar
    if ((i - start + 1) % 10 === 0) await new Promise(r => setTimeout(r, 20));
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addImagesStackedA4(pdf, images);

  const base = slugify(eventName);
  // numeración humana (1-based) con 4 dígitos
  const humanStart = pad(start + 1);
  const humanEnd = pad(end);
  pdf.save(`${base}_${humanStart}-${humanEnd}.pdf`);
}
