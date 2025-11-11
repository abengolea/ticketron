'use client';

import type { jsPDF } from "jspdf";

// -------- Helpers --------
function inlineAllComputedStylesDeep(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);

  const keepProps = new Set<string>([
    // Layout
    "display","position","top","left","right","bottom","z-index",
    "box-sizing","width","height","min-width","min-height","max-width","max-height",
    "padding","padding-top","padding-right","padding-bottom","padding-left",
    "margin","margin-top","margin-right","margin-bottom","margin-left",
    "overflow","overflow-x","overflow-y",
    "transform","transform-origin",
    "opacity","visibility",

    // Fondo / bordes
    "background","background-color","background-image","background-size",
    "background-position","background-repeat","background-clip",
    "border-radius","border-top-left-radius","border-top-right-radius",
    "border-bottom-left-radius","border-bottom-right-radius",

    // Texto
    "color","font","font-family","font-size","font-weight","line-height",
    "letter-spacing","text-transform","text-decoration","text-align",
    "white-space","word-break","word-wrap",

    // Imagen
    "object-fit","object-position",

    // Para gradientes modernos
    "background-origin","filter"
  ]);

  const apply = (el: Element) => {
    const cs = getComputedStyle(el);
    // serializamos sólo propiedades “confiables”
    let style = "";
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (prop.startsWith("--")) continue; // ignorar custom props
      if (!keepProps.has(prop)) continue;
      const val = cs.getPropertyValue(prop);
      if (val) style += `${prop}:${val};`;
    }
    (el as HTMLElement).setAttribute("style", style);
  };

  apply(root);
  let n = walker.nextNode();
  while (n) { apply(n as Element); n = walker.nextNode(); }
}

function stripBordersAndShadowsOnly(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  const clear = (el: HTMLElement) => {
    const s = el.style;
    s.border = "none";
    s.borderWidth = "0";
    s.borderColor = "transparent";
    s.outline = "none";
    s.boxShadow = "none";
    s.textShadow = "none";
    (s as any)["-webkit-text-stroke"] = "0";
  };
  clear(root);
  let n = walker.nextNode() as HTMLElement | null;
  while (n) { clear(n); n = walker.nextNode() as HTMLElement | null; }
}

function mmToPx(mm: number, ppi = 300) {
  return Math.round((ppi / 25.4) * mm);
}

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

  // 3) Inlinear estilos (prop x prop) — clave para conservar gradientes/colores
  inlineAllComputedStylesDeep(cloned);

  // 4) Quitar sólo bordes/sombras (NO tocar background/color)
  stripBordersAndShadowsOnly(cloned);

  // 5) Host offscreen
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;background:#fff;display:inline-block;";
  host.appendChild(cloned);
  document.body.appendChild(host);

  // 6) Escalado para llenar el slot
  const r = cloned.getBoundingClientRect();
  let outW = Math.max(1, Math.round(r.width));
  let outH = Math.max(1, Math.round(r.height));

  if (targetMm) {
    outW = mmToPx(targetMm.w, ppi);
    outH = mmToPx(targetMm.h, ppi);
    const k = Math.min(outW / r.width, outH / r.height);
    cloned.style.transform = `scale(${k})`;
    cloned.style.transformOrigin = "top left";
  }

  // 7) Captura sin leer cssRules (anti-CORS)
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
