
"use client";

import React, { useRef, useState } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

async function handleGeneratePdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
): Promise<void> {

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const gutterX = 10;
  const gutterY = 10;
  const SAFE    = 0.8;

  const ticketWidthMM = pageWidth - 2 * gutterX;

  // dpi CSS ~ 96 px por pulgada → 96 / 25.4 = 3.7795 px/mm
  const PX_PER_MM = 96 / 25.4;

  // Ancho de captura en píxeles: usar un mínimo alto para evitar responsive
  const captureWidthPx = Math.max(1200, Math.round(ticketWidthMM * PX_PER_MM));

  // ===== contenedor temporal =====
  const temp = document.createElement('div');
  temp.style.cssText = `
    position: fixed; left: -10000px; top: 0;
    width: ${captureWidthPx}px;   /* 👈 ancho grande */
    height: auto;
    background: #fff; z-index: 999999;
    display: block; overflow: visible; padding: 0; margin: 0;
  `;
  document.body.appendChild(temp);

  try {
    let y = gutterY;

    for (let i = 0; i < ticketRefs.length; i++) {
      const ref = ticketRefs[i];
      if (!ref.current) continue;

      // clonar y preparar
      const cloned = ref.current!.cloneNode(true) as HTMLDivElement;
      cloned.style.cssText = `
        display:block;
        width: 100%;          /* ocupar TODO el ancho grande del contenedor */
        max-width: none;      /* evitar límites responsive */
        padding-bottom: 8px;  /* colchón interno anti mordisco */
      `;

      // convertir <canvas> → <img> si los hubiera (QR)
      cloned.querySelectorAll('canvas').forEach((c) => {
        try {
          const can = c as HTMLCanvasElement;
          const img = document.createElement('img');
          img.src = can.toDataURL('image/png');
          img.style.width  = `${can.width}px`;
          img.style.height = `${can.height}px`;
          can.replaceWith(img);
        } catch {}
      });

      temp.innerHTML = '';
      temp.appendChild(cloned);

      // esperar imágenes del clon
      const imgs = [...cloned.querySelectorAll('img')];
      await Promise.all(imgs.map(img => new Promise<void>(res => {
        if (img.complete) return res();
        img.onload = () => res();
        img.onerror = () => res();
      })));

      // 📸 capturar a ese ancho grande
      const canvas = await html2canvas(cloned, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 10000,
        logging: false,
        width: captureWidthPx,
        windowWidth: captureWidthPx,
      });

      const imgData = canvas.toDataURL('image/png', 1.0);

      // mantener proporción y salto con colchón
      const imgHeightMM = (canvas.height / canvas.width) * ticketWidthMM;
      const contentBottom = pageHeight - gutterY;
      if (y + imgHeightMM + SAFE > contentBottom) {
        pdf.addPage();
        y = gutterY;
      }

      pdf.addImage(imgData, 'PNG', gutterX, y, ticketWidthMM, imgHeightMM, undefined, 'FAST');
      y += imgHeightMM + gutterY;
    }

    const fileName = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tickets.pdf`;
    pdf.save(fileName);

  } finally {
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

  const triggerPdfGeneration = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (printing) return;
    setPrinting(true);
    try {
      await handleGeneratePdf(ticketRefs, eventParams.event_name);
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
