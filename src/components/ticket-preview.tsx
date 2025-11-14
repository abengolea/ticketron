
"use client";

import React, { useState } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCardPrint } from "./ticket-card-print";
import { Button } from "./ui/button";
import { Download, ArrowLeft, Loader2, FileDown, Archive } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";
import { buildPdfFromPngsWithTemplate, captureTicketPNG, getPlanoCDRTemplate, getImprentaBTemplate } from "@/lib/pdf-utils";
import { waitForImagesInContainer } from "@/lib/image-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import JSZip from "jszip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Progress } from "./ui/progress";

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
  const [isZipping, setIsZipping] = useState(false);
  const [template, setTemplate] = useState<"A" | "B">("A");
  
  // Estados para el progreso del ZIP
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);

  const batches = Math.ceil(tickets.length / PER_FILE);

  const generatePdfBlob = async (batchIndex: number): Promise<{fileName: string, blob: Blob}> => {
    const isTemplateB = template === 'B';
    const pdfTemplate = isTemplateB ? getImprentaBTemplate() : getPlanoCDRTemplate();
    const ticketRefsToUse = isTemplateB ? ticketRefsSmall.current : ticketRefsLarge.current;
    const slotSize = { w: pdfTemplate.slots[0].w, h: pdfTemplate.slots[0].h };

    const start = batchIndex * PER_FILE;
    const end = Math.min(start + PER_FILE, tickets.length);
    
    const ticketsToRender = tickets.slice(start, end);
    const refsToProcess = ticketRefsToUse.slice(start, end);

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
    
    const pdfInstance = await buildPdfFromPngsWithTemplate(images, fileName, pdfTemplate, false);
    const blob = pdfInstance.output('blob');

    return { fileName, blob };
  };

  async function handleBatchClick(batchIdx: number) {
    setRunningBatch(batchIdx);
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      toast({ title: "Iniciando generación de PDF...", description: `Procesando tickets del ${batchIdx * PER_FILE + 1} al ${Math.min((batchIdx + 1) * PER_FILE, tickets.length)}.` });
      const { fileName, blob } = await generatePdfBlob(batchIdx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "PDF generado", description: `${fileName} listo para descargar.` });
    } catch (e: any) {
      console.error("Fallo la generacion del PDF:", e);
      toast({ title: "Error de PDF", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunningBatch(null);
    }
  }

  const handleDownloadAllAsZip = async () => {
    setIsZipping(true);
    setProgressMessage("Iniciando...");
    setProgressPercent(0);
    
    try {
        const zip = new JSZip();
        for (let i = 0; i < batches; i++) {
            const progress = Math.round(((i) / batches) * 100);
            setProgressPercent(progress);
            setProgressMessage(`Generando lote de PDFs ${i+1} de ${batches}...`);

            const { fileName, blob } = await generatePdfBlob(i);
            zip.file(fileName, blob);
        }

        setProgressPercent(95);
        setProgressMessage("Comprimiendo archivos en formato ZIP...");

        const zipBlob = await zip.generateAsync({type:"blob"});
        
        const zipFileName = `${eventParams.event_id}_ALL_TICKETS.zip`;
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setProgressPercent(100);
        setProgressMessage("¡Completado!");
        toast({ title: "¡Éxito!", description: "El archivo ZIP con todos los tickets ha sido descargado." });

    } catch(e: any) {
        console.error("Fallo la generacion del ZIP:", e);
        toast({ title: "Error al generar el ZIP", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
        // Dejar el diálogo de éxito un momento antes de cerrarlo
        setTimeout(() => {
            setIsZipping(false);
        }, 1500);
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
        <Dialog open={isZipping}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Generando Archivo ZIP</DialogTitle>
              <DialogDescription>
                Este proceso puede tardar varios minutos. Por favor, no cierres esta pestaña.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-4">
                <Progress value={progressPercent} className="w-full" />
                <p className="text-sm text-center text-muted-foreground">{progressMessage}</p>
            </div>
          </DialogContent>
        </Dialog>


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
                <Select value={template} onValueChange={(value: "A" | "B") => setTemplate(value)} disabled={isZipping || runningBatch !== null}>
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
                <h3 className="font-headline text-xl mb-2">2. Descargar Tickets</h3>
                <p className="text-sm text-muted-foreground mb-4">Puedes descargar todos los lotes en un solo archivo ZIP, o descargar lotes individuales de 50 tickets.</p>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleDownloadAllAsZip} disabled={runningBatch !== null || isZipping}>
                        {isZipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                        Descargar Todo (ZIP)
                    </Button>
                </div>
                 <div className="flex flex-wrap gap-2 mt-4">
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
                        disabled={runningBatch !== null || isZipping}
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

    