
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
  // A4 horizontal (297x210mm) - Layout 8-up
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

export async function captureTicketPNG(node: HTMLElement, scale: number = 3): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');
  const removedLinks = detachCrossOriginStyleLinks();
  
  try {
    // Clone the node to avoid modifying the original
    const clonedNode = node.cloneNode(true) as HTMLElement;

    // Replace canvas elements with images to ensure they are captured
    const canvases = clonedNode.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const image = new Image();
      image.src = canvas.toDataURL();
      image.width = canvas.width;
      image.height = canvas.height;
      canvas.parentNode?.replaceChild(image, canvas);
    });

    // Create a temporary wrapper for consistent rendering
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        display: inline-block;
        padding: 0;
        margin: 0;
        background: white;
    `;
    wrapper.appendChild(clonedNode);
    document.body.appendChild(wrapper);
    
    // Ensure fonts and images are loaded
    await new Promise(resolve => setTimeout(resolve, 200));

    const { width, height } = clonedNode.getBoundingClientRect();
    
    const dataUrl = await domtoimage.toPng(wrapper, {
      width: Math.round(width),
      height: Math.round(height),
      style: {
        transform: `scale(${scale})`,
        'transform-origin': 'top left',
        background: 'white',
      },
      quality: 1,
      cacheBust: true,
    });
    
    document.body.removeChild(wrapper);
    return dataUrl;

  } catch (error) {
    console.error("Error capturing ticket:", error);
    throw error;
  } finally {
    reattachStyleLinks(removedLinks);
  }
}
