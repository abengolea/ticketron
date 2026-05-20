'use client';

import type { jsPDF } from "jspdf";

type ImprentaTemplate = {
  page: { format: "a4"; orientation: "portrait" | "landscape" };
  slots: Array<{ x: number; y: number; w: number; h: number }>; // mm
};

function round2(n: number) { return Math.round(n * 100) / 100; }

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

async function pngToJpegDataUrl(pngDataUrl: string, quality = 0.95): Promise<string> {
    const img = new Image();
    img.src = pngDataUrl;
    await new Promise(r => img.onload = r);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', quality);
}

export type DigitalTicketPdfEntry = {
  eventName: string;
  eventDate: string;
  buyerName: string;
  ticketCode: string;
  qrDataUrl: string;
};

/** PDF simple para el comprador: una entrada por hoja A4 con QR centrado. */
export async function buildDigitalTicketsPdf(
  entries: DigitalTicketPdfEntry[],
  fileName: string
): Promise<void> {
  if (entries.length === 0) return;

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;

  for (let i = 0; i < entries.length; i++) {
    if (i > 0) pdf.addPage();
    const e = entries[i];
    let y = 32;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(0);
    const titleLines = pdf.splitTextToSize(e.eventName, contentW) as string[];
    pdf.text(titleLines, pageW / 2, y, { align: "center" });
    y += titleLines.length * 8 + 6;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const dateStr = new Date(e.eventDate).toLocaleString("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
    });
    pdf.text(dateStr, pageW / 2, y, { align: "center" });
    y += 12;

    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(e.buyerName, pageW / 2, y, { align: "center" });
    y += 10;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text(e.ticketCode, pageW / 2, y, { align: "center" });
    pdf.setTextColor(0);
    y += 14;

    const qrSize = 80;
    const qrX = (pageW - qrSize) / 2;
    const imgDataUrl = await pngToJpegDataUrl(e.qrDataUrl);
    pdf.addImage(imgDataUrl, "JPEG", qrX, y, qrSize, qrSize);
    y += qrSize + 10;

    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text("Presentá este QR en la puerta del evento", pageW / 2, y, {
      align: "center",
    });
    pdf.setTextColor(0);
  }

  pdf.save(fileName);
}

export async function buildPdfFromPngsWithTemplate(
  pngs: string[],
  fileName: string,
  template: ImprentaTemplate,
  autoSave = true
): Promise<jsPDF> {
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
    const imgDataUrl = await pngToJpegDataUrl(pngs[i]);


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

    pdf.addImage(imgDataUrl, "JPEG", ix, iy, iw, ih, undefined, "FAST");
  }

  if (autoSave) {
    pdf.save(fileName);
  }
  
  return pdf;
}

// -------- Helpers para captura --------

function walk(root: HTMLElement, fn: (el: HTMLElement)=>void) {
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
    // casos raros que generan “marcos”
    (s as any)["-webkit-text-stroke"] = "0";
    s.backgroundClip = "padding-box";
  });
}

/** Fuerza fondos neutros donde haga falta (evita halos) */
function normalizeBackgrounds(root: HTMLElement) {
  walk(root, (el) => {
    // si es contenedor tipo QR o panel derecho, garantizamos blanco sólido
    if (el.dataset?.printBg === "white") {
      el.style.background = "#ffffff";
    }
  });
}

function mmToPx(mm: number, ppi = 300) {
  // 1 inch = 25.4 mm → px = (ppi / 25.4) * mm
  return Math.round((ppi / 25.4) * mm);
}

const waitRAF = () => new Promise<void>(r => requestAnimationFrame(() => r()));

// -------- Captura --------
export async function captureTicketPNG(
  node: HTMLElement,
  targetMm?: { w: number; h: number },
  ppi = 300
): Promise<string> {
  const { default: domtoimage } = await import("dom-to-image-more");
  try { await (document as any).fonts?.ready; } catch {}

  // 1) Clonar
  const cloned = node.cloneNode(true) as HTMLElement;

  // 2) canvas → img (QR)
  cloned.querySelectorAll("canvas").forEach((c) => {
    try {
      const can = c as HTMLCanvasElement;
      const img = document.createElement("img");
      img.src = can.toDataURL("image/png");
      img.width = can.width; img.height = can.height;
      img.style.width = `${can.width}px`;
      img.style.height = `${can.height}px`;
      can.replaceWith(img);
    } catch {}
  });

  // 3) Quitar sólo bordes/sombras (NO tocar background/color)
  stripBordersAndShadows(cloned);
  normalizeBackgrounds(cloned);

  // 4) Host offscreen
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;background:#fff;display:inline-block;";
  host.appendChild(cloned);
  document.body.appendChild(host);
  await waitRAF();

  // 5) Escalado para llenar el slot
  const r = cloned.getBoundingClientRect();
  let outW = Math.max(1, Math.round(r.width));
  let outH = Math.max(1, Math.round(r.height));

  if (targetMm) {
    outW = mmToPx(targetMm.w, ppi);
    outH = mmToPx(targetMm.h, ppi);
    const k = Math.min(outW / r.width, outH / r.height);
    cloned.style.transform = `scale(${k})`;
    cloned.style.transformOrigin = "top left";
    await waitRAF();
  }

  // 6) Captura sin leer cssRules (anti-CORS)
  try {
    const dataUrl = await domtoimage.toPng(cloned, {
      width: outW,
      height: outH,
      bgcolor: "#ffffff",
      quality: 1,
      cacheBust: true,
      copyStyles: false, // <- importantísimo, evita SecurityError
      filter: (n) => !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement),
      style: { background: "#ffffff" },
    });
    return dataUrl;
  } finally {
    host.remove();
  }
}
