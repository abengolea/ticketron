
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

  // Ajustes anti-hairline (en mm)
  const UNDERPAINT = 0.15; // pinta fondo blanco un poquito más grande
  const BLEED     = 0.25;  // agranda la imagen para que se solape

  const perPage = template.slots.length;

  for (let i = 0; i < pngs.length; i++) {
    const idx = i % perPage;
    if (i > 0 && idx === 0) pdf.addPage();

    const slot = template.slots[idx];
    const imgJpeg = pngs[i]; // ya viene en JPEG

    // 1) “Underpaint” blanco (mata cualquier costura / halo)
    const ux = round2(slot.x - UNDERPAINT);
    const uy = round2(slot.y - UNDERPAINT);
    const uw = round2(slot.w + UNDERPAINT * 2);
    const uh = round2(slot.h + UNDERPAINT * 2);

    pdf.setDrawColor(255, 255, 255);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(ux, uy, uw, uh, "F");

    // 2) Imagen con pequeño BLEED (invade bordes del slot)
    const ix = round2(slot.x - BLEED);
    const iy = round2(slot.y - BLEED);
    const iw = round2(slot.w + BLEED * 2);
    const ih = round2(slot.h + BLEED * 2);

    pdf.addImage(imgJpeg, "JPEG", ix, iy, iw, ih, undefined, "FAST");
  }

  pdf.save(fileName);
}


// --- HELPERS ---

function inlineComputedStyles(root: HTMLElement) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let n = root as HTMLElement;
  while (n) {
    const cs = getComputedStyle(n);
    (n.style as any).cssText = cs.cssText; // inlinéa TODO el estilo computado
    n = w.nextNode() as HTMLElement;
  }
}

function walk(root: HTMLElement, fn: (el: HTMLElement)=>void) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  fn(root);
  let n = w.nextNode() as HTMLElement | null;
  while (n) { fn(n); n = w.nextNode() as HTMLElement | null; }
}

function stripBordersAndShadows(root: HTMLElement) {
  walk(root, (el) => {
    const s = el.style;
    s.border = "none";
    s.borderWidth = "0";
    s.borderColor = "transparent";
    s.outline = "none";
    s.boxShadow = "none";
    s.textShadow = "none";
    (s as any)["-webkit-text-stroke"] = "0";
  });
}

function mmToPx(mm: number, ppi = 300) {
  return Math.round((ppi / 25.4) * mm);
}

const waitRAF = () => new Promise<void>(r => requestAnimationFrame(() => r()));

export async function captureTicketPNG(
  node: HTMLElement,
  targetMm?: { w: number; h: number },
  ppi = 300
): Promise<string> {
  const { default: domtoimage } = await import("dom-to-image-more");

  const cloned = node.cloneNode(true) as HTMLElement;

  // canvas → img (QR)
  cloned.querySelectorAll("canvas").forEach((c) => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement("img");
      img.src = can.toDataURL("image/png");
      img.width = can.width; img.height = can.height;
      img.style.width = `${can.width}px`; img.style.height = `${can.height}px`;
      can.replaceWith(img);
    } catch {}
  });

  // 1) INLINE estilos computados (clave para no perder gradiente/colores)
  inlineComputedStyles(cloned);

  // 2) Quitar únicamente bordes/sombras/outline (sin tocar background/color)
  stripBordersAndShadows(cloned);

  // Host off-screen
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;background:#fff;display:inline-block;";
  host.appendChild(cloned);
  document.body.appendChild(host);

  await waitRAF();

  // Medidas y escala para llenar el slot
  const rect = cloned.getBoundingClientRect();
  let outW = Math.max(1, Math.round(rect.width));
  let outH = Math.max(1, Math.round(rect.height));
  if (targetMm) {
    outW = mmToPx(targetMm.w, ppi);
    outH = mmToPx(targetMm.h, ppi);
    const kx = outW / rect.width;
    const ky = outH / rect.height;
    const k = Math.min(kx, ky);
    cloned.style.transform = `scale(${k})`;
    cloned.style.transformOrigin = "top left";
    await waitRAF();
  }

  try {
    const dataUrl = await domtoimage.toPng(cloned, {
      width: outW,
      height: outH,
      bgcolor: "#ffffff",
      quality: 1,
      cacheBust: true,
      copyStyles: false, // anti-CORS
      filter: (n) => !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement),
      style: { background: "#ffffff" },
    });
    
    // Convertir a JPEG para reducir tamaño y asegurar fondo blanco
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
