
"use client";

import React, { useState, useMemo, useEffect } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCardPrint } from "./ticket-card-print";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";
import { buildPdfFromPngsWithTemplate, captureTicketPNG, getPlanoCDRTemplate } from "@/lib/pdf-utils";
import { waitForImagesInContainer } from "@/lib/image-utils";

type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

const PER_FILE = 50; // tamaño del lote

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams, secretKey } = result;
  const { toast } = useToast();
  
  // Create refs directly. No need for useMemo here as the component re-renders when `tickets` changes.
  const ticketRefs = React.useRef<React.RefObject<HTMLDivElement>[]>([]);
  ticketRefs.current = tickets.map((_, i) => ticketRefs.current[i] ?? React.createRef());
  
  const [runningBatch, setRunningBatch] = useState<number | null>(null);

  const batches = useMemo(
    () => Math.ceil(tickets.length / PER_FILE),
    [tickets.length]
  );

  async function handleBatchClick(batchIdx: number) {
    // Add a small delay to allow the browser to paint the components.
    // This is the key to fixing the blank PDF issue on the main page.
    await new Promise(resolve => setTimeout(resolve, 100));

    setRunningBatch(batchIdx);
    const pdfTemplate = getPlanoCDRTemplate();
    const slotSize = { w: pdfTemplate.slots[0].w, h: pdfTemplate.slots[0].h };

    try {
        const start = batchIdx * PER_FILE;
        const end = Math.min(start + PER_FILE, tickets.length);
        
        const ticketsToRender = tickets.slice(start, end);
        const refsToProcess = ticketRefs.current.slice(start, end);

        const images: string[] = [];
        for (let i = 0; i < ticketsToRender.length; i++) {
          const ref = refsToProcess[i];
          if (!ref?.current) continue;
          
          await waitForImagesInContainer(ref.current);
          
          const png = await captureTicketPNG(ref.current, slotSize, 300);
          images.push(png);
          
          if ((i + 1) % 8 === 0) await new Promise(r => setTimeout(r, 40));
        }
        
        await new Promise(r => setTimeout(r, 150));

        const base = eventParams.event_name.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
        const humanStart = String(start + 1).padStart(4, "0");
        const humanEnd = String(end).padStart(4, "0");
        const fileName = `${base}_${humanStart}-${humanEnd}.pdf`;
        
        await buildPdfFromPngsWithTemplate(images, fileName, pdfTemplate);

        toast({ title: "PDF generado", description: `Lote ${batchIdx + 1} listo.` });
    } catch (e: any) {
      console.error("Fallo la generacion del PDF:", e);
      toast({ title: "Error de PDF", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunningBatch(null);
    }
  }

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
    downloadFile("tickets.csv", csvContent, "text/csv;charset=utf-t;");
  };
  
  const handleDownloadJson = () => {
    const jsonContent = JSON.stringify({ tickets, eventParams, secretKey }, null, 2);
    downloadFile("event_data.json", jsonContent, "application/json");
  };

  const handleDownloadReadme = () => {
    const readmeContent = `# Instrucciones de Validación de Tickets`;
    downloadFile("README_VALIDACION.md", readmeContent.trim(), "text/markdown");
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

        <div className="no-print p-4 border rounded-lg mb-8 bg-card">
            <h3 className="font-headline text-xl mb-4">Descargar Tickets en PDF</h3>
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: batches }).map((_, idx) => {
                const start = idx * PER_FILE + 1;
                const end = Math.min((idx + 1) * PER_FILE, tickets.length);
                const label = `${String(start).padStart(4, "0")}–${String(end).padStart(4, "0")}`;
                const busy = runningBatch === idx;

                return (
                    <Button
                    key={idx}
                    size="sm"
                    variant="secondary"
                    onClick={() => handleBatchClick(idx)}
                    disabled={runningBatch !== null}
                    title={`Descargar ${label}`}
                    >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                    {label}
                    </Button>
                );
                })}
            </div>
        </div>
      
      {/* Hidden container for rendering tickets for capture */}
      <div className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none">
        {tickets.map((ticket, i) => (
          <div key={ticket.ticketId} ref={ticketRefs.current[i]} className="ticket-print mb-4 inline-block">
             <TicketCardPrint
                variant="large"
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

      {/* Visible preview for the user (only a few tickets) */}
      <div className="space-y-4">
        <h3 className="font-headline text-xl">Previsualización (primeros 3 tickets)</h3>
        {tickets.slice(0, 3).map((ticket) => (
          <div key={`preview-${ticket.ticketId}`} className="flex justify-center">
            <TicketCardPrint
              variant="large"
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
