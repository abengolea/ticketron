
'use client';

import type { jsPDF } from "jspdf";

// --- Helpers de Saneamiento y Captura ---

function walk<T extends HTMLElement>(root: T, fn: (n: HTMLElement) => void) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  fn(root);
  let n = w.nextNode() as HTMLElement | null;
  while (n) { fn(n); n = w.nextNode() as HTMLElement | null; }
}

/** Quita TODO rastro de bordes/sombras/outline del clon */
function stripBordersAndShadows(root: HTMLElement) {
  walk(root, (el) => {
    const s = (el.style as CSSStyleDeclaration);
    s.border = "none";
    s.borderWidth = "0";
    s.borderColor = "transparent";
    s.outline = "none";
    s.boxShadow = "none";
    s.textShadow = "none";
    s.filter = "none";
    (s as any)["-webkit-text-stroke"] = "0";
    s.backgroundClip = "padding-box";
  });
}

function normalizeBackgrounds(root: HTMLElement) {
  walk(root, (el) => {
    if (el.dataset?.printBg === "white") {
      el.style.background = "#ffffff";
    }
  });
}

const waitRAF = () => new Promise<void>(r => requestAnimationFrame(() => r()));

function mmToPx(mm: number, ppi = 300) {
  return Math.round((ppi / 25.4) * mm);
}

/**
 * Captura un ticket SIN bordes y al tamaño deseado.
 */
export async function captureTicketPNG(
  node: HTMLElement,
  targetMm?: { w: number; h: number },
  ppi = 300
): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');
  try { await (document as any).fonts?.ready; } catch {}

  const cloned = node.cloneNode(true) as HTMLElement;

  // Reemplazar canvas por imágenes (para el QR)
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

  // Limpiar bordes/sombras Y normalizar fondos
  stripBordersAndShadows(cloned);
  normalizeBackgrounds(cloned);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;background:#fff;display:inline-block;';
  host.appendChild(cloned);
  document.body.appendChild(host);
  await waitRAF();

  const base = cloned.getBoundingClientRect();
  let outW = Math.max(1, Math.round(base.width));
  let outH = Math.max(1, Math.round(base.height));

  if (targetMm) {
    outW = mmToPx(targetMm.w, ppi);
    outH = mmToPx(targetMm.h, ppi);
    const kx = outW / base.width;
    const ky = outH / base.height;
    const k = Math.min(kx, ky);
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
      copyStyles: false,
      filter: (n) => !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement),
      style: { background: '#ffffff', transform: cloned.style.transform, transformOrigin: 'top left' },
    });
    
    // Convertir a JPEG para asegurar fondo blanco opaco
    const img = new Image();
    img.src = dataUrl;
    await new Promise(resolve => img.onload = resolve);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);

  } finally {
    host.remove();
  }
}

// --- Lógica de Plantillas y Creación de PDF ---

type ImprentaTemplate = {
  page: { format: "a4"; orientation: "portrait" | "landscape" };
  slots: Array<{ x: number; y: number; w: number; h: number }>; // mm
};

export function getPlanoCDRTemplate(): ImprentaTemplate {
  return {
    page: { format: "a4", orientation: "portrait" },
    slots: [
      { x: 15, y: 20,   w: 180, h: 65 },
      { x: 15, y: 99.5, w: 180, h: 65 },
      { x: 15, y: 179,  w: 180, h: 65 },
    ],
  };
}

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

export async function buildPdfFromPngsWithTemplate(
  images: string[],
  fileName: string,
  template: ImprentaTemplate
) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "mm",
    format: template.page.format,
    orientation: template.page.orientation,
  });

  const UNDERPAINT = 0.15;
  const BLEED = 0.25;

  const perPage = template.slots.length;

  for (let i = 0; i < images.length; i++) {
    const idx = i % perPage;
    if (i > 0 && idx === 0) pdf.addPage();

    const slot = template.slots[idx];
    const imgData = images[i];

    const ux = round2(slot.x - UNDERPAINT);
    const uy = round2(slot.y - UNDERPAINT);
    const uw = round2(slot.w + UNDERPAINT * 2);
    const uh = round2(slot.h + UNDERPAINT * 2);

    pdf.setDrawColor(255, 255, 255);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(ux, uy, uw, uh, "F");

    const ix = round2(slot.x - BLEED);
    const iy = round2(slot.y - BLEED);
    const iw = round2(slot.w + BLEED * 2);
    const ih = round2(slot.h + BLEED * 2);

    pdf.addImage(imgData, "JPEG", ix, iy, iw, ih, undefined, "FAST");
  }

  pdf.save(fileName);
}
