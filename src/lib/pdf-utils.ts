'use client';

import type { jsPDF } from "jspdf";

// --- Helpers para manejar las fuentes cross-origin ---
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

/** Quita sombras/bordes durante la captura */
function applyCaptureStyles(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('*').forEach(n => {
    n.style.boxShadow = 'none';
    n.style.textShadow = 'none';
    n.style.outline = 'none';
    n.style.border = '0'; // quitar cualquier borde
    n.style.borderImage = 'initial';
    n.style.backgroundClip = 'padding-box'; // evita “sangrado” de fondos
  });
}

async function pngToJpegDataUrl(pngDataUrl: string, quality = 0.95): Promise<string> {
    const { default: domtoimage } = await import('dom-to-image-more');
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = pngDataUrl;
    });
}

/** Captura segura, sin CORS y sin hairlines alrededor */
export async function captureTicketPNG(node: HTMLElement): Promise<string> {
    const { default: domtoimage } = await import('dom-to-image-more');
    try { await (document as any).fonts?.ready; } catch { }

    const removedLinks = detachCrossOriginStyleLinks();
    const SCALE = 2; // factor 2x

    try {
        const cloned = node.cloneNode(true) as HTMLElement;

        // Canvas → IMG (QR)
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
            } catch { }
        });

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          background:#ffffff;
          padding:1px;          /* bleed anti-borde */
          border-radius:18px;
          display:inline-block;
        `;
        wrapper.appendChild(cloned);

        const temp = document.createElement('div');
        temp.style.cssText = `position:fixed; left:-99999px; top:0; z-index:-1;`;
        temp.appendChild(wrapper);
        document.body.appendChild(temp);

        applyCaptureStyles(wrapper);

        // Dimensiones reales del wrapper
        const { width, height } = wrapper.getBoundingClientRect();

        const dataUrl = await domtoimage.toPng(wrapper, {
            cacheBust: true,
            bgcolor: '#ffffff',
            copyStyles: false,
            filter: (n) => !(n instanceof HTMLLinkElement),
            width: Math.max(1, Math.round(width * SCALE)),
            height: Math.max(1, Math.round(height * SCALE)),
            style: {
                transform: `scale(${SCALE})`,
                transformOrigin: 'top left',
                background: '#ffffff',
            },
        });

        temp.remove();
        return dataUrl;

    } catch (error) {
        console.error("Error al generar imagen del ticket:", error);
        throw new Error("Error generando imagen del ticket");
    } finally {
        reattachStyleLinks(removedLinks);
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
  const { default: jsPDF } = await import('jspdf');
  const marginX = opts?.marginXmm ?? 10;
  const marginY = opts?.marginYmm ?? 10;
  const spacing = opts?.spacingMm ?? 10;
  const overlap = 0.2; // solape anti-hairline

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const drawW = pageW - marginX * 2;

  let y = marginY;

  for (let i = 0; i < pngs.length; i++) {
    const png = pngs[i];
    const jpeg = await pngToJpegDataUrl(png, 0.95);
    
    const imgProps = pdf.getImageProperties(jpeg);
    const drawH = round2((imgProps.height / imgProps.width) * drawW);

    if (y + drawH + marginY > pageH) {
      pdf.addPage();
      y = marginY;
    }
    
    const xPos = Math.round(marginX);
    const yPos = Math.round(y);

    pdf.addImage(jpeg, 'JPEG', xPos, yPos, drawW, drawH, undefined, 'FAST');

    y = y + drawH + spacing - overlap;
  }

  pdf.save(fileName);
}

const pad = (n: number) => String(n).padStart(4, "0");
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();


export async function generateOneBatchPdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
  perFile: number,
  batchIndex: number
) {
  const start = batchIndex * perFile;
  const end = Math.min(start + perFile, ticketRefs.length);

  const images: string[] = [];
  try {
    for (let i = start; i < end; i++) {
      const ref = ticketRefs[i];
      if (!ref?.current) continue;
      
      const png = await captureTicketPNG(ref.current);
      images.push(png);
      
      if ((i - start + 1) % 10 === 0) await new Promise(r => setTimeout(r, 50));
    }

    const base = slugify(eventName);
    const humanStart = pad(start + 1);
    const humanEnd = pad(end);
    const fileName = `${base}_${humanStart}-${humanEnd}.pdf`;

    await buildPdfFromPngs(images, fileName, { spacingMm: 3.5, marginXmm: 5, marginYmm: 5 });

  } catch (error) {
    console.error(`Error generando lote ${batchIndex}:`, error);
    // Re-throw para que la UI pueda manejarlo.
    throw error;
  }
}
