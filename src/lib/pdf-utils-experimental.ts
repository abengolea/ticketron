
'use client';

import type { jsPDF } from "jspdf";

// ---------- NUEVA LÓGICA BASADA EN PLANTILLA DE IMPRENTA ----------

type ImprentaTemplate = {
  page: { format: "a4"; orientation: "portrait" | "landscape" };
  slots: Array<{ x: number; y: number; w: number; h: number }>; // mm
};

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
  template: ImprentaTemplate = getPlanoCDRTemplate()
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


// --- LÓGICA ANTERIOR Y HELPERS (AÚN DISPONIBLES SI SE NECESITAN) ---

export type ExperimentalLayoutOpts = {
  pageOrientation?: "portrait" | "landscape";
  cropMarks?: boolean;
  pageFormat?: "a4" | "letter";
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  ticketWidth?: number;
  ticketHeight?: number;
  rows?: number;
  cols?: number;
  gutterX?: number;
  gutterY?: number;
};


function detachCrossOriginStyleLinks(): HTMLLinkElement[] {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  const detached: HTMLLinkElement[] = [];
  for (const l of links) {
    const href = l.getAttribute("href") || "";
    if (/^https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)/i.test(href)) {
      l.parentElement?.removeChild(l);
      detached.push(l);
    }
  }
  return detached;
}

function reattachStyleLinks(links: HTMLLinkElement[]) {
  const head = document.head || document.getElementsByTagName("head")[0];
  for (const l of links) head.appendChild(l);
}

function applyCaptureStyles(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('*').forEach(n => {
    n.style.boxShadow = 'none';
    n.style.textShadow = 'none';
    n.style.outline = 'none';
    n.style.border = '0';
    n.style.borderImage = 'initial';
    n.style.backgroundClip = 'padding-box';
  });
}

export async function captureTicketPNG(node: HTMLElement, scale: number = 3): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');
  const removedLinks = detachCrossOriginStyleLinks();
  
  try {
    const cloned = node.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll('canvas').forEach((c) => {
      try {
        const img = document.createElement('img');
        img.src = c.toDataURL('image/png');
        img.width = c.width;
        img.height = c.height;
        c.replaceWith(img);
      } catch {}
    });

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `background:#ffffff; padding:1px; border-radius:18px; display:inline-block;`;
    wrapper.appendChild(cloned);
    
    const temp = document.createElement('div');
    temp.style.cssText = `position:fixed; left:-99999px; top:0; z-index:-1;`;
    temp.appendChild(wrapper);
    document.body.appendChild(temp);

    applyCaptureStyles(wrapper);
    const { width, height } = wrapper.getBoundingClientRect();

    const dataUrl = await domtoimage.toPng(wrapper, {
      cacheBust: true,
      bgcolor: '#ffffff',
      copyStyles: false,
      filter: (n) => !(n instanceof HTMLLinkElement),
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      style: { transform: `scale(${scale})`, transformOrigin: 'top left', background: '#ffffff' },
    });

    temp.remove();
    return dataUrl;
  } catch (error) {
    console.error("Error capturing ticket:", error);
    throw error;
  } finally {
    reattachStyleLinks(removedLinks);
  }
}
