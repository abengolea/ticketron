
"use client";

import React, { useState, useEffect } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCardPrint } from "./ticket-card-print";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";
import { buildPdfFromPngsWithTemplate, captureTicketPNG, getPlanoCDRTemplate, getImprentaBTemplate } from "@/lib/pdf-utils";
import { waitForImagesInContainer } from "@/lib/image-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";

type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

const PER_FILE = 50; // tamaño del lote

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams, secretKey } = result;
  const { toast } = useToast();
  
  const ticketRefsLarge = React.useRef<React.RefObject<HTMLDivElement>[]>([]);
  const ticketRefsSmall = React.useRef<React.RefObject<HTMLDivElement>[]>([]);

  if (ticketRefsLarge.current.length !== tickets.length) {
    ticketRefsLarge.current = tickets.map((_, i) => ticketRefsLarge.current[i] ?? React.createRef());
    ticketRefsSmall.current = tickets.map((_, i) => ticketRefsSmall.current[i] ?? React.createRef());
  }
  
  const [runningBatch, setRunningBatch] = useState<number | null>(null);
  const [template, setTemplate] = useState<"A" | "B">("A");

  const batches = Math.ceil(tickets.length / PER_FILE);

  async function handleBatchClick(batchIdx: number) {
    setRunningBatch(batchIdx);
    
    // Pequeña pausa para que el estado se actualice y el loader aparezca
    await new Promise(resolve => setTimeout(resolve, 50));

    const isTemplateB = template === 'B';
    const pdfTemplate = isTemplateB ? getImprentaBTemplate() : getPlanoCDRTemplate();
    const ticketRefsToUse = isTemplateB ? ticketRefsSmall.current : ticketRefsLarge.current;
    const slotSize = { w: pdfTemplate.slots[0].w, h: pdfTemplate.slots[0].h };

    try {
        const start = batchIdx * PER_FILE;
        const end = Math.min(start + PER_FILE, tickets.length);
        
        const ticketsToRender = tickets.slice(start, end);
        const refsToProcess = ticketRefsToUse.slice(start, end);

        toast({ title: "Iniciando captura...", description: `Procesando tickets del ${start + 1} al ${end}.` });

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

        const baseName = eventParams.event_id.normalize("NFKD").replace(/[^\w-]+/g, "_");
        const humanStart = String(start + 1).padStart(4, "0");
        const humanEnd = String(end).padStart(4, "0");
        const fileName = `${baseName}_${humanStart}-${humanEnd}_TPL-${template}.pdf`;
        
        await buildPdfFromPngsWithTemplate(images, fileName, pdfTemplate);

        toast({ title: "PDF generado", description: `Lote ${batchIdx + 1} listo: ${fileName}` });
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

        <div className="no-print p-4 border rounded-lg mb-8 bg-card space-y-4">
            <div>
                <h3 className="font-headline text-xl mb-2">1. Selecciona la Plantilla de Impresión</h3>
                <Select value={template} onValueChange={(value: "A" | "B") => setTemplate(value)}>
                    <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="A">Plantilla A (3 por hoja A4 Vertical)</SelectItem>
                        <SelectItem value="B">Plantilla B (8 por hoja A4 Horizontal)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div>
                <h3 className="font-headline text-xl mb-2">2. Descargar Tickets en PDF por Lotes</h3>
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
        </div>
      
      {/* Contenedor para renderizar los tickets fuera de pantalla */}
      <div className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none">
        {/* Versión Grande (para Plantilla A) */}
        {tickets.map((ticket, i) => (
          <div key={`large-${ticket.ticketId}`} ref={ticketRefsLarge.current[i]} className="ticket-print mb-4 inline-block">
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
        {/* Versión Pequeña (para Plantilla B) */}
        {tickets.map((ticket, i) => (
          <div key={`small-${ticket.ticketId}`} ref={ticketRefsSmall.current[i]} className="ticket-print mb-4 inline-block">
             <TicketCardPrint
                variant="small"
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

      <div className="space-y-4">
        <h3 className="font-headline text-xl">Previsualización (primeros 3 tickets, tamaño grande)</h3>
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
