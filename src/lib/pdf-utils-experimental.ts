
'use client';

import type { jsPDF } from "jspdf";

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

function mm2(n: number) { return Math.round(n * 100) / 100; }

async function pngToJpegDataUrl(pngDataUrl: string, quality = 0.95): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get 2D context from canvas."));
            return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = pngDataUrl;
  });
}

function drawCropMarks(pdf: any, x: number, y: number, w: number, h: number, len = 3) {
  const lw = pdf.getLineWidth();
  pdf.setLineWidth(0.2);
  pdf.line(x - len, y, x, y);
  pdf.line(x, y - len, x, y);
  pdf.line(x + w, y - len, x + w, y);
  pdf.line(x + w, y, x + w + len, y);
  pdf.line(x - len, y + h, x, y + h);
  pdf.line(x, y + h, x, y + h + len);
  pdf.line(x + w, y + h, x + w + len, y + h);
  pdf.line(x + w, y + h - len, x + w, y + h);
  pdf.setLineWidth(lw);
}


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
    // Clone node to handle canvas replacement safely
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

export async function buildPdfFromPngs(
  pngs: string[],
  fileName: string,
  opts: ExperimentalLayoutOpts = {}
) {
  const { default: jsPDF } = await import("jspdf");

  const M_LEFT = opts.marginLeft ?? 15;
  const M_RIGHT = opts.marginRight ?? 15;
  const M_TOP = opts.marginTop ?? 20;
  const M_BOTTOM = opts.marginBottom ?? 20;
  const TICKET_W = opts.ticketWidth ?? 180;
  const TICKET_H = opts.ticketHeight ?? 65;
  const ROWS = opts.rows ?? 3;
  const COLS = opts.cols ?? 1;
  const GUTTER_X = opts.gutterX ?? 0;
  const GUTTER_Y = opts.gutterY ?? 14.5;

  const pdf = new jsPDF({ 
    orientation: opts.pageOrientation ?? "portrait", 
    unit: "mm", 
    format: opts.pageFormat ?? "a4" 
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const usableW = pageW - M_LEFT - M_RIGHT;
  const usableH = pageH - M_TOP - M_BOTTOM;
  const requireH = ROWS * TICKET_H + (ROWS - 1) * GUTTER_Y;

  const baseX = M_LEFT + (usableW - (COLS * TICKET_W + (COLS - 1) * GUTTER_X)) / 2;
  const baseY = M_TOP + (usableH - requireH) / 2;

  const perPage = ROWS * COLS;
  for (let i = 0; i < pngs.length; i++) {
    const iInPage = i % perPage;
    if (i > 0 && iInPage === 0) pdf.addPage();

    const row = Math.floor(iInPage / COLS);
    const col = iInPage % COLS;

    const x = mm2(baseX + col * (TICKET_W + GUTTER_X));
    const y = mm2(baseY + row * (TICKET_H + GUTTER_Y));

    const img = await pngToJpegDataUrl(pngs[i], 0.95);
    pdf.addImage(img, "JPEG", x, y, mm2(TICKET_W), mm2(TICKET_H), undefined, "FAST");

    if (opts.cropMarks) {
      drawCropMarks(pdf, x, y, mm2(TICKET_W), mm2(TICKET_H), 3);
    }
  }

  pdf.save(fileName);
}
