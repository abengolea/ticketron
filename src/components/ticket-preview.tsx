
"use client";

import React, { useState } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";


function disableCrossOriginStyleSheets(): HTMLLinkElement[] {
  const disabled: HTMLLinkElement[] = [];
  for (const ss of Array.from(document.styleSheets)) {
    const owner = ss.ownerNode as (HTMLLinkElement | null);
    if (!owner || owner.tagName !== 'LINK') continue;

    const href = owner.href;
    if (!href) continue;
    const sameOrigin = new URL(href, location.href).origin === location.origin;
    if (!sameOrigin) {
      owner.disabled = true;
      disabled.push(owner);
    }
  }
  return disabled;
}
function restoreStyleSheets(links: HTMLLinkElement[]) {
  links.forEach(l => (l.disabled = false));
}

async function waitImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll("img"));
  return Promise.all(
    imgs.map(img => new Promise<void>(res => {
      if ((img as HTMLImageElement).complete) return res();
      img.onload = () => res(); img.onerror = () => res();
    }))
  );
}

function imgNaturalSize(src: string): Promise<{ w:number; h:number }> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = reject;
    im.src = src;
  });
}

export async function handleGeneratePdfDomToImage(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string
): Promise<void> {
  if (typeof window === "undefined") throw new Error("Run on client");

  const [{ default: jsPDF }, { default: domtoimage }] = await Promise.all([
    import("jspdf"),
    import("dom-to-image-more"),
  ]);

  const disabledLinks = disableCrossOriginStyleSheets();

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const gap = 6;
  const imgWmm = pageW - margin * 2;
  const CAPTURE_W = 1200;
  
  const SNAP = 0.1;
  const BLEED = 0.2;
  const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;

  const temp = document.createElement("div");
  temp.style.cssText = `
    position: fixed; left:-10000px; top:0; width:${CAPTURE_W}px;
    background:#fff; z-index:-1; pointer-events:none;
  `;
  document.body.appendChild(temp);
  
  const scrub = (root: HTMLElement) => {
      root.style.border = "none";
      root.style.outline = "none";
      root.style.boxShadow = "none";
      root.style.backgroundClip = "padding-box";
      root.querySelectorAll<HTMLElement>("*").forEach(el => {
        el.style.border = "none";
        el.style.outline = "none";
        el.style.boxShadow = "none";
        el.style.backgroundClip = "padding-box";
        el.style.textShadow = "none";
      });
    };

  try {
    let y = margin;

    for (const ref of ticketRefs) {
      if (!ref.current) continue;

      const cloned = ref.current.cloneNode(true) as HTMLElement;
      cloned.style.cssText += `width:${CAPTURE_W}px; max-width:${CAPTURE_W}px;`;
      scrub(cloned);
      
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
        width: ${CAPTURE_W}px;
        transform: translateZ(0);
        will-change: transform;
      `;
      wrapper.appendChild(cloned);
      temp.innerHTML = ""; temp.appendChild(wrapper);

      await waitImages(wrapper);

      const dataUrl = await domtoimage.toPng(wrapper, {
        cacheBust: true,
        quality: 1,
        bgcolor: "#ffffff",
        style: {
          margin: "0",
          border: "none",
          outline: "none",
          boxShadow: "none",
          transform: "scale(1)",
          transformOrigin: "top left",
          "-webkit-font-smoothing": "antialiased",
          "text-rendering": "optimizeLegibility",
        },
        filter: (node: Node) => {
            if (node instanceof HTMLElement) {
              const cs = window.getComputedStyle(node);
              if (cs.display === "none" || cs.visibility === "hidden") return false;
              node.style.border = "none";
              node.style.outline = "none";
              node.style.boxShadow = "none";
            }
            return true;
        },
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const imgW_mm = imgWmm;
      const imgH_mm = (imgProps.height / imgProps.width) * imgW_mm;

      if (y + imgH_mm + margin > pageH) {
        pdf.addPage();
        y = margin;
      }
      
      const x_pos = snap(margin);
      const y_pos = snap(y);
      const w_pos = snap(imgW_mm);
      const h_pos = snap(imgH_mm + BLEED);

      pdf.addImage(dataUrl, "PNG", x_pos, y_pos, w_pos, h_pos, undefined, 'NONE');
      
      y = y_pos + snap(imgH_mm) + gap;
    }

    pdf.save(`${eventName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_tickets.pdf`);
  } finally {
    restoreStyleSheets(disabledLinks);
    temp.remove();
  }
}


type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams, secretKey } = result;
  const { toast } = useToast();
  
  const ticketRefs = React.useMemo(
    () => Array.from({ length: tickets.length }, () => React.createRef<HTMLDivElement>()),
    [tickets]
  );
  
  const [printing, setPrinting] = useState(false);

  const handleDownloadSecret = () => {
    if (secretKey) {
      downloadFile("secret_key.txt", secretKey, "text/plain");
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = [
      "Ticket Number,Short Code,QR Payload,Redeemed",
      ...tickets.map(t => `${t.ticketNumber},${t.shortCode},"${t.qrPayload.replace(/"/g, '""')}",false`)
    ].join("\n");
    downloadFile("tickets.csv", csvContent, "text/csv;charset=utf-8;");
  };
  
  const handleDownloadJson = () => {
    const jsonContent = JSON.stringify({ tickets, eventParams, secretKey }, null, 2);
    downloadFile("event_data.json", jsonContent, "application/json");
  };

  const handleDownloadReadme = () => {
    const readmeContent = `# Instrucciones de Validación de Tickets`;
    downloadFile("README_VALIDACION.md", readmeContent.trim(), "text/markdown");
  };

  const triggerPdfGeneration = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      await handleGeneratePdfDomToImage(ticketRefs, eventParams.event_name);
      toast({ title: "PDF Generado", description: `Se descargó ${eventParams.event_name}.pdf` });
    } catch (error) {
      console.error("[PDF] error:", error);
      toast({
        title: "Error de PDF",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPrinting(false);
    }
  };


  return (
    <div className="w-full">
        <div className="no-print bg-card/80 backdrop-blur-sm border rounded-lg p-4 mb-8 flex flex-wrap justify-between items-center gap-4 sticky top-[70px] z-40">
            <div>
            <h2 className="text-2xl font-headline">{isRegeneration ? 'Detalles del Evento' : '¡Generación Completa!'}</h2>
            <p className="text-muted-foreground">{isRegeneration ? `Viendo ${tickets.length} tickets para ${eventParams.event_name}` : `${tickets.length} tickets generados con éxito.`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => window.location.href = isRegeneration ? '/history' : '/'}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> {isRegeneration ? 'Volver al Historial' : 'Empezar de Nuevo'}
                </Button>
                
                <Button onClick={triggerPdfGeneration} disabled={printing}>
                    {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                    {printing ? 'Generando...' : 'Descargar PDF'}
                </Button>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="secondary" size="icon" onClick={() => { if (secretKey) handleDownloadSecret(); handleDownloadCsv(); if (secretKey) handleDownloadJson(); handleDownloadReadme();}}>
                                <Download />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{secretKey ? "Descargar todos los activos" : "Descargar CSV"}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>

            </div>
        </div>
      
      <div>
        {tickets.map((ticket, i) => (
          <div key={ticket.ticketId} ref={ticketRefs[i]} className="ticket-print mb-4 flex justify-center">
             <TicketCard
                eventName={eventParams.event_name}
                dateTime={eventParams.date_time}
                venue={eventParams.venue}
                ticketNumber={ticket.ticketNumber}
                qrPayload={ticket.qrPayload}
                shortCode={ticket.shortCode}
              />
          </div>
        ))}
      </div>
    </div>
  );
}
