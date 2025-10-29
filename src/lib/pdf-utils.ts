
'use client';

import type { jsPDF } from "jspdf";
import type domtoimage from "dom-to-image-more";

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

/**
 * Captures a ticket card as a PNG DataURL.
 * Uses dom-to-image-more.
 */
export async function captureTicketPNG(node: HTMLElement): Promise<string> {
    const domtoimage: typeof import('dom-to-image-more').default = (await import('dom-to-image-more')).default;
    
    const CAPTURE_WIDTH_PX = 1200;

    const cloned = node.cloneNode(true) as HTMLElement;
    cloned.style.cssText += `
        width: ${CAPTURE_WIDTH_PX}px !important;
        max-width: ${CAPTURE_WIDTH_PX}px !important;
        box-shadow: none !important;
        transform: none !important;
        filter: none !important;
    `;

    cloned.querySelectorAll("canvas").forEach((c) => {
        try {
            const can = c as HTMLCanvasElement;
            const img = document.createElement("img");
            img.src = can.toDataURL("image/png");
            img.width = can.width;
            img.height = can.height;
            img.style.width = `${can.width}px`;
            img.style.height = `${can.height}px`;
            can.replaceWith(img);
        } catch {}
    });

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        overflow: visible;
        padding: 24px 0;
        width: ${CAPTURE_WIDTH_PX}px;
        transform: translateZ(0);
        will-change: transform;
    `;
    wrapper.appendChild(cloned);

    const temp = document.createElement("div");
    temp.style.cssText = `
        position: fixed; left: -9999px; top: 0; width: ${CAPTURE_WIDTH_PX}px;
        background: white; padding: 0; margin: 0; z-index: -1;
    `;
    temp.appendChild(wrapper);
    document.body.appendChild(temp);

    try {
        const dataUrl = await domtoimage.toPng(wrapper, {
            cacheBust: true,
            quality: 1,
            bgcolor: "#ffffff",
            style: {
                margin: '0',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                transform: 'scale(1)',
                transformOrigin: 'top left',
                '-webkit-font-smoothing': 'antialiased',
                'text-rendering': 'optimizeLegibility',
            },
            filter: (node: Node) => {
                if (node instanceof HTMLElement) {
                    const s = window.getComputedStyle(node);
                    if (s.display === 'none' || s.visibility === 'hidden') return false;
                    node.style.border = "none";
                    node.style.boxShadow = "none";
                    node.style.outline = "none";
                }
                return true;
            },
        });
        return dataUrl;
    } finally {
        temp.remove();
    }
}


/**
 * Creates a PDF from multiple ticket images, arranging them 3 per A4 page.
 */
export async function createPdfFromImages(
  images: string[],
  fileNameBase: string
) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const marginMM = 10;
  const gapMM = 6;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - marginMM * 2;
  const BLEED = 0.2;
  const SNAP = 0.1;
  const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;
  let y = marginMM;

  images.forEach((imgData) => {
    const props = pdf.getImageProperties(imgData);
    const imgWmm = usableW;
    const imgHmm = (props.height * imgWmm) / props.width;
    
    const contentBottom = pageH - marginMM;
    if (y + imgHmm + BLEED > contentBottom) {
      pdf.addPage();
      y = marginMM;
    }
    
    const x_pos = snap(marginMM);
    const y_pos = snap(y);
    const w_pos = snap(imgWmm);
    const h_pos = snap(imgHmm + BLEED);

    pdf.addImage(imgData, "PNG", x_pos, y_pos, w_pos, h_pos, undefined, "NONE");
    
    y = y_pos + snap(imgHmm) + gapMM;
  });

  pdf.save(fileNameBase);
}


/**
 * Orchestrates the PDF generation process in chunks.
 */
export async function generatePdfsInChunks(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
  chunkSize = 100,
  onProgress: (chunk: number, total: number) => void
) {
  const batches = chunk(ticketRefs, chunkSize);
  const baseName = slugify(eventName);

  for (let i = 0; i < batches.length; i++) {
    onProgress(i, batches.length);
    
    const batch = batches[i];
    const images: string[] = [];
    
    for (const ref of batch) {
      if (ref.current) {
        // Since captureTicketPNG is also client-side only, this is safe.
        const dataUrl = await captureTicketPNG(ref.current);
        images.push(dataUrl);
      }
    }

    const startNum = i * chunkSize + 1;
    const endNum = i * chunkSize + images.length;
    const fileName = `${baseName}_${String(startNum).padStart(4, "0")}-${String(endNum).padStart(4, "0")}.pdf`;

    // createPdfFromImages also uses dynamic import, so it's safe.
    await createPdfFromImages(images, fileName);
    
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  onProgress(batches.length, batches.length);
}
