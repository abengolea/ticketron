
"use client";

import React, { useRef, useState } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";

/**
 * Genera un PDF A4 vertical con 1 ticket por fila, sin cortes en el borde inferior ni en el QR.
 * Usa dom-to-image-more para rasterizar cada tarjeta y jsPDF para armar el PDF.
 *
 * @param ticketRefs  Array de refs a los contenedores de cada TicketCard
 * @param eventName   Nombre del evento para el nombre del archivo
 */
export async function handleGeneratePdfDomToImage(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string
): Promise<void> {
  // Ejecutar sólo en cliente
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF generation must run in the browser (client-side).");
  }

  // ⚠️ Importes dinámicos para evitar SSR
  const [{ default: jsPDF }, { default: domtoimage }] = await Promise.all([
    import("jspdf"),
    import("dom-to-image-more"),
  ]);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidthMM = pdf.internal.pageSize.getWidth();
  const pageHeightMM = pdf.internal.pageSize.getHeight();
  const marginMM = 10;
  const gapBetweenTicketsMM = 6;
  const imgWidthMM = pageWidthMM - marginMM * 2;

  const CAPTURE_WIDTH_PX = 1200;

  const temp = document.createElement("div");
  temp.id = `pdf-temp-${Date.now()}`;
  temp.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: ${CAPTURE_WIDTH_PX}px;
    background: #ffffff;
    z-index: -1;
    pointer-events: none;
  `;
  document.body.appendChild(temp);

  try {
    let cursorYMM = marginMM;

    for (let i = 0; i < ticketRefs.length; i++) {
      const ref = ticketRefs[i];
      if (!ref.current) continue;

      const cloned = ref.current.cloneNode(true) as HTMLElement;
      cloned.style.cssText += `
        width: ${CAPTURE_WIDTH_PX}px !important;
        max-width: ${CAPTURE_WIDTH_PX}px !important;
        box-shadow: none !important;
        transform: none !important;
        filter: none !important;
      `;

      // Canvas → IMG por compatibilidad extra
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
        display: block;
        background: #ffffff;
        padding: 0 0 24px 0; /* acolchado para evitar cortes inferiores */
        overflow: visible;
        width: ${CAPTURE_WIDTH_PX}px;
      `;
      wrapper.appendChild(cloned);

      temp.innerHTML = "";
      temp.appendChild(wrapper);

      await waitImages(wrapper);

      const dataUrl = await domtoimage.toPng(wrapper, {
        bgcolor: "#ffffff",
        quality: 1,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
          margin: "0",
        },
      });

      const img = await loadImage(dataUrl);
      const aspect = img.naturalHeight / img.naturalWidth;
      const imgHeightMM = imgWidthMM * aspect;

      if (cursorYMM + imgHeightMM > pageHeightMM - marginMM) {
        pdf.addPage();
        cursorYMM = marginMM;
      }

      pdf.addImage(
        dataUrl,
        "PNG",
        marginMM,
        cursorYMM,
        imgWidthMM,
        imgHeightMM,
        undefined,
        "FAST"
      );

      cursorYMM += imgHeightMM + gapBetweenTicketsMM;
    }

    const filename = `${eventName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_tickets.pdf`;
    pdf.save(filename);
  } finally {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
  }
}

async function waitImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const el = img as HTMLImageElement;
          if (el.complete) return resolve();
          el.onload = () => resolve();
          el.onerror = () => resolve();
        })
    )
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
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
      
      {/* Contenido para impresion y vista en pantalla */}
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
