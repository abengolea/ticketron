
'use client';

import type { jsPDF } from "jspdf";

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
    const img = new Image();
    img.src = pngDataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', quality);
}

export async function captureTicketPNG(node: HTMLElement): Promise<string> {
  const { default: domtoimage } = await import('dom-to-image-more');
  const removedLinks = detachCrossOriginStyleLinks();
  const SCALE = 2; 

  try {
    const cloned = node.cloneNode(true) as HTMLElement;

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

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      background:#ffffff;
      padding:1px;
      border-radius:18px;
      display:inline-block;
    `;
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
    console.error("Error capturando ticket:", error);
    throw error; // Re-throw para que el caller lo maneje
  } finally {
    reattachStyleLinks(removedLinks);
  }
}


function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type GridOptions = {
    cols: number;
    rows: number;
    marginMm: number;
    gutterXmm: number;
    gutterYmm: number;
    orientation: "portrait" | "landscape";
}

export async function buildPdfFromPngs(
  pngs: string[],
  fileName: string,
  opts?: GridOptions
) {
  const { default: jsPDF } = await import('jspdf');

  const options: GridOptions = opts ?? {
    cols: 3,
    rows: 3,
    marginMm: 4,
    gutterXmm: 3.0,
    gutterYmm: 4.0,
    orientation: "portrait",
  };

  const pdf = new jsPDF({ orientation: options.orientation, unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ticketsPerPage = options.cols * options.rows;

  const contentW = pageW - options.marginMm * 2;
  const contentH = pageH - options.marginMm * 2;
  
  const cellW = (contentW - (options.cols - 1) * options.gutterXmm) / options.cols;
  const cellH = (contentH - (options.rows - 1) * options.gutterYmm) / options.rows;

  let ticketIndex = 0;

  for (let page = 0; page < Math.ceil(pngs.length / ticketsPerPage); page++) {
    if (page > 0) pdf.addPage();
    
    for (let i = 0; i < ticketsPerPage; i++) {
      if (ticketIndex >= pngs.length) break;

      const row = Math.floor(i / options.cols);
      const col = i % options.cols;
      
      const x = options.marginMm + col * (cellW + options.gutterXmm);
      const y = options.marginMm + row * (cellH + options.gutterYmm);

      const pngData = pngs[ticketIndex];
      const jpegData = await pngToJpegDataUrl(pngData, 0.95);
      const imgProps = pdf.getImageProperties(jpegData);
      
      const imgAspect = imgProps.width / imgProps.height;
      
      let imgW = cellW;
      let imgH = imgW / imgAspect;

      if (imgH > cellH) {
          imgH = cellH;
          imgW = imgH * imgAspect;
      }

      const imgX = x + (cellW - imgW) / 2;
      const imgY = y + (cellH - imgH) / 2;

      pdf.addImage(jpegData, 'JPEG', round2(imgX), round2(imgY), round2(imgW), round2(imgH), undefined, 'FAST');
      
      ticketIndex++;
    }
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
      
      if ((i - start + 1) % 6 === 0) await new Promise(r => setTimeout(r, 60));
    }

    await new Promise(r => setTimeout(r, 150));

    const base = slugify(eventName);
    const humanStart = pad(start + 1);
    const humanEnd = pad(end);
    const fileName = `${base}_${humanStart}-${humanEnd}.pdf`;
    
    await buildPdfFromPngs(images, fileName, {
        cols: 3,
        rows: 3,
        orientation: "portrait",
        marginMm: 4,
        gutterXmm: 3.0,
        gutterYmm: 4.0,
    });

  } catch (error) {
    console.error(`Error generando lote ${batchIndex}:`, error);
    throw error;
  }
}
