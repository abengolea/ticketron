
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

// --- helpers nuevos ---
function inlineComputedStyles(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let node = root as HTMLElement;
  while (node) {
    const cs = window.getComputedStyle(node);
    // Copiamos TODA la regla computada (rápido y efectivo)
    (node.style as any).cssText = cs.cssText; // cssText está soportado en Chromium
    node = walker.nextNode() as HTMLElement;
  }
}

function waitRAF() {
  return new Promise<void>(r => requestAnimationFrame(() => r()));
}

// --- reemplazar tu captureTicketPNG por esta versión ---
export async function captureTicketPNG(node: HTMLElement, scale = 3): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');

  // 1) Asegurar fuentes listas (siempre que existan)
  try { await (document as any).fonts?.ready; } catch {}

  // 2) Clonar el nodo para trabajar aislado
  const cloned = node.cloneNode(true) as HTMLElement;

  // 3) Reemplazar canvas por imágenes (ej. QR)
  cloned.querySelectorAll('canvas').forEach((c) => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement('img');
      img.src = can.toDataURL('image/png');
      img.width = can.width;
      img.height = can.height;
      img.style.width = `${can.width}px`;
      img.style.height = `${can.height}px`;
      can.replaceWith(img);
    } catch {}
  });

  // 4) Inlinear estilos computados para NO depender de CSS externo
  inlineComputedStyles(cloned);

  // 5) Contenedor off-screen con fondo blanco
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed; left: -99999px; top: 0; z-index: -1;
    background: #ffffff; padding: 1px; display: inline-block;
  `;
  wrapper.appendChild(cloned);
  document.body.appendChild(wrapper);

  await waitRAF(); // asegurar layout
  const rect = cloned.getBoundingClientRect();
  const outW = Math.max(1, Math.round(rect.width * scale));
  const outH = Math.max(1, Math.round(rect.height * scale));

  try {
    const dataUrl = await domtoimage.toPng(wrapper, {
      // CLAVE: NO copiar hojas de estilo → evita leer document.styleSheets
      copyStyles: false,
      // Evitar que se cuele un <link>/<style> residual
      filter: (n) => !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement),
      width: outW,
      height: outH,
      quality: 1,
      bgcolor: '#ffffff',
      style: {
        background: '#ffffff',
        transform: 'scale(1)',
        transformOrigin: 'top left'
      },
      cacheBust: true,
    });

    return dataUrl;
  } finally {
    wrapper.remove();
  }
}
