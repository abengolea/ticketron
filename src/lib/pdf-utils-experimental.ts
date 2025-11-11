
'use client';

import type { jsPDF } from "jspdf";

// ---------- LÓGICA DE PLANTILLAS DE IMPRENTA ----------

type ImprentaTemplate = {
  page: { format: "a4"; orientation: "portrait" | "landscape" };
  slots: Array<{ x: number; y: number; w: number; h: number }>; // mm
};

/** Plantilla para Imprenta A: 3 tickets de 180x65mm en A4 vertical. */
export function getPlanoCDRTemplate(): ImprentaTemplate {
  // A4 vertical — posiciones exactas del plano
  return {
    page: { format: "a4", orientation: "portrait" },
    slots: [
      { x: 15, y: 20,   w: 180, h: 65 },   // fila 1
      { x: 15, y: 99.5, w: 180, h: 65 },   // fila 2 (20 + 65 + 14.5)
      { x: 15, y: 179,  w: 180, h: 65 },   // fila 3 (99.5 + 65 + 14.5)
    ],
  };
}

/** Plantilla para Imprenta B: 8 tickets de 145x50mm en A4 horizontal. */
export function getImprentaBTemplate(): ImprentaTemplate {
    return {
      page: { format: "a4", orientation: "landscape" },
      slots: [
        { x: 3.5, y: 3.5, w: 145, h: 50 },
        { x: 148.5, y: 3.5, w: 145, h: 50 },
  
        { x: 3.5, y: 54.5, w: 145, h: 50 },
        { x: 148.5, y: 54.5, w: 145, h: 50 },
  
        { x: 3.5, y: 105.5, w: 145, h: 50 },
        { x: 148.5, y: 105.5, w: 145, h: 50 },
  
        { x: 3.5, y: 156.5, w: 145, h: 50 },
        { x: 148.5, y: 156.5, w: 145, h: 50 },
      ],
    };
  }


function round2(n: number) { return Math.round(n * 100) / 100; }

async function pngToJpegDataUrl(pngDataUrl: string, quality = 0.95): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        if (!ctx) {
            reject(new Error("Could not get 2D context from canvas."));
            return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = pngDataUrl;
  });
}


export async function buildPdfFromPngsWithTemplate(
  pngs: string[],
  fileName: string,
  template: ImprentaTemplate
) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "mm",
    format: template.page.format,
    orientation: template.page.orientation,
  });

  const perPage = template.slots.length;
  for (let i = 0; i < pngs.length; i++) {
    const idxInPage = i % perPage;
    if (i > 0 && idxInPage === 0) pdf.addPage();

    const slot = template.slots[idxInPage];
    const img = await pngToJpegDataUrl(pngs[i], 0.95);

    pdf.addImage(
      img,
      "JPEG",
      round2(slot.x),
      round2(slot.y),
      round2(slot.w),
      round2(slot.h),
      undefined,
      "FAST"
    );
  }

  pdf.save(fileName);
}

// --- HELPERS ---

function inlineComputedStyles(root: HTMLElement) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let n = root as HTMLElement;
  while (n) { (n.style as any).cssText = getComputedStyle(n).cssText; n = w.nextNode() as HTMLElement; }
}

const waitRAF = () => new Promise<void>(r => requestAnimationFrame(() => r()));

function mmToPx(mm: number, ppi = 300) {
  // 1 inch = 25.4 mm → px = (ppi / 25.4) * mm
  return Math.round((ppi / 25.4) * mm);
}

/**
 * Captura un ticket SIN bordes y al tamaño deseado.
 * - targetMm: tamaño del slot (mm) para llenar la imagen
 * - ppi: resolución objetivo (300 recomendado)
 */
export async function captureTicketPNG(
  node: HTMLElement,
  targetMm?: { w: number; h: number },
  ppi = 300
): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');

  // 1) clonar + inlinear estilos
  const cloned = node.cloneNode(true) as HTMLElement;

  // reemplazar canvas → img (QR)
  cloned.querySelectorAll('canvas').forEach(c => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement('img');
      img.src = can.toDataURL('image/png');
      img.width = can.width; img.height = can.height;
      img.style.width = `${can.width}px`; img.style.height = `${can.height}px`;
      can.replaceWith(img);
    } catch {}
  });

  inlineComputedStyles(cloned);

  // 2) contenedor offscreen
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;background:#fff;display:inline-block;';
  host.appendChild(cloned);
  document.body.appendChild(host);
  await waitRAF();

  // 3) calcular tamaño deseado en px (para llenar sin “aire”)
  const base = cloned.getBoundingClientRect(); // tamaño en px del DOM real
  let outW = Math.max(1, Math.round(base.width));
  let outH = Math.max(1, Math.round(base.height));

  if (targetMm) {
    // queremos una imagen que LLENE exactamente el slot del PDF
    outW = mmToPx(targetMm.w, ppi);
    outH = mmToPx(targetMm.h, ppi);

    // escalar el CLON para que ocupe todo el canvas sin dejar bordes
    const kx = outW / base.width;
    const ky = outH / base.height;
    const k = Math.min(kx, ky);                   // mantener relación de aspecto del ticket
    cloned.style.transform = `scale(${k})`;
    cloned.style.transformOrigin = 'top left';
    await waitRAF();
  }

  try {
    const dataUrl = await domtoimage.toPng(cloned, {
      width: outW,
      height: outH,
      bgcolor: '#ffffff',
      quality: 1,
      cacheBust: true,
      copyStyles: false,                                   // clave → NO leer cssRules
      filter: (n) => !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement),
      style: { background: '#ffffff' },
    });
    return dataUrl;
  } finally {
    host.remove();
  }
}
