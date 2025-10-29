
"use client";

import React, { useRef, createRef, useEffect, useState } from "react";
import type { GenerationResult, EventParameters, TicketData } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { downloadFile } from "@/lib/utils";
import { Download, ArrowLeft, Loader2, CheckCircle, AlertCircle, FileDown, PlusCircle, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { isValidDataURL, waitForImagesInContainer } from "@/lib/image-utils";

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );


async function handleGeneratePdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();   // 210
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297

  // Márgenes y ajustes
  const gutterX = 14;
  const gutterY = 12;
  const maxW = pageWidth - 2 * gutterX;
  const maxH = pageHeight - 2 * gutterY;
  const safeBottomMargin = 6; // margen de seguridad extra

  // Contenedor offscreen
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: -9999px;
    width: 1200px;
    background: white;
    display: block;
    margin: 0;
    padding: 0;
    visibility: visible;
  `;
  document.body.appendChild(tempContainer);

  try {
    let yCursor = gutterY;

    for (let i = 0; i < ticketRefs.length; i++) {
      const ref = ticketRefs[i];
      if (!ref.current) continue;

      const cloned = ref.current.cloneNode(true) as HTMLDivElement;
      cloned.style.cssText = `
        width: 1200px;
        display: block;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      `;

      // Convertir QR a <img>
      cloned.querySelectorAll('canvas').forEach((c) => {
        const can = c as HTMLCanvasElement;
        try {
          const img = document.createElement('img');
          img.src = can.toDataURL('image/png');
          img.width = can.width;
          img.height = can.height;
          img.style.width = `${can.width}px`;
          img.style.height = `${can.height}px`;
          can.replaceWith(img);
        } catch {}
      });

      tempContainer.innerHTML = '';
      tempContainer.appendChild(cloned);

      // Esperar layout e imágenes
      await new Promise(resolve => requestAnimationFrame(resolve));
      if ((document as any).fonts?.ready) { try { await (document as any).fonts.ready; } catch {} }

      const imgs = Array.from(cloned.querySelectorAll('img'));
      await Promise.all(imgs.map(img => new Promise<void>((res) => {
        if (img.complete) return res();
        img.onload = () => res();
        img.onerror = () => res();
      })));

      // Captura
      const canvas = await html2canvas(cloned, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 10000,
      });

      const imgData = canvas.toDataURL('image/png', 1.0);

      // Escalado proporcional con margen de seguridad
      let targetW = maxW;
      let targetH = (canvas.height / canvas.width) * targetW;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = (canvas.width / canvas.height) * targetH;
      }
      targetH *= 0.985; // ajuste fino para evitar corte

      // Salto de página si no entra completo
      if (yCursor + targetH + safeBottomMargin > pageHeight) {
        pdf.addPage();
        yCursor = gutterY;
      }

      // Centrar horizontalmente
      const x = (pageWidth - targetW) / 2;

      pdf.addImage(imgData, 'PNG', x, yCursor, targetW, targetH, undefined, 'FAST');

      yCursor += targetH + gutterY;
    }

    const fileName = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tickets.pdf`;
    pdf.save(fileName);
  } finally {
    tempContainer.remove();
  }
}


type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

const PDF_CHUNK_SIZE = 100;
const TICKETS_PER_PAGE = 8; // No cambiar, 8 tickets (2x4) por página A4

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams } = result;
  const { secretKey } = result;
  const { toast } = useToast();

  const ticketRefs = React.useMemo(() =>
    Array.from({ length: tickets.length }, () => createRef<HTMLDivElement>()),
    [tickets]
  );
  
  const [isSaved, setIsSaved] = useState(isRegeneration);
  const [printingChunk, setPrintingChunk] = useState<number | null>(null);
  
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [moreQuantity, setMoreQuantity] = useState(10);
  const [showGenerateMoreDialog, setShowGenerateMoreDialog] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
      eventName: eventParams.event_name,
      dateTime: eventParams.date_time,
      venue: eventParams.venue,
  });

  useEffect(() => {
    if (!isRegeneration) {
        const timer = setTimeout(() => setIsSaved(true), 2000);
        return () => clearTimeout(timer);
    }
  }, [isRegeneration]);

  const triggerPdfGeneration = async () => {
    setPrintingChunk(0); // Use a single state for all chunks
    
    try {
      await handleGeneratePdf(ticketRefs, eventParams.event_name);
      toast({
        title: "PDF Generado",
        description: `El archivo ${eventParams.event_name}.pdf se ha descargado.`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error de PDF",
        description: `No se pudo generar el PDF: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setPrintingChunk(null);
    }
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleEditEvent = async () => {
    setIsEditing(true);
    if (onEventUpdate) {
        onEventUpdate({
            event_name: editFormData.eventName,
            date_time: editFormData.dateTime,
            venue: editFormData.venue,
        });
    }
    toast({ title: "Evento actualizado", description: "Los cambios se han guardado." });
    setShowEditDialog(false);
    setIsEditing(false);
  };

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
  
  return (
    <div className="w-full">
      <div className="bg-card/80 backdrop-blur-sm border rounded-lg p-4 mb-8 flex flex-wrap justify-between items-center gap-4 sticky top-[70px] z-40 no-print">
        <div>
          <h2 className="text-2xl font-headline">{isRegeneration ? 'Detalles del Evento' : '¡Generación Completa!'}</h2>
          <p className="text-muted-foreground">{isRegeneration ? `Viendo ${tickets.length} tickets para ${eventParams.event_name}` : `${tickets.length} tickets generados con éxito.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.location.href = isRegeneration ? '/history' : '/'}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {isRegeneration ? 'Volver al Historial' : 'Empezar de Nuevo'}
            </Button>
             
            {isRegeneration && (
              <>
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                    <DialogTrigger asChild><Button variant="outline"><Pencil className="mr-2 h-4 w-4" /> Editar Evento</Button></DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Editar Detalles del Evento</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                            <Label htmlFor="eventName">Nombre</Label><Input id="eventName" value={editFormData.eventName} onChange={handleEditFormChange} />
                            <Label htmlFor="dateTime">Fecha y Hora</Label><Input id="dateTime" value={editFormData.dateTime} onChange={handleEditFormChange} />
                            <Label htmlFor="venue">Lugar</Label><Input id="venue" value={editFormData.venue} onChange={handleEditFormChange} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setShowEditDialog(false)} disabled={isEditing}>Cancelar</Button>
                            <Button type="button" onClick={handleEditEvent} disabled={isEditing}>{isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={showGenerateMoreDialog} onOpenChange={setShowGenerateMoreDialog}>
                    <DialogTrigger asChild><Button><PlusCircle className="mr-2 h-4 w-4" /> Generar Más</Button></DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader><DialogTitle>Generar Más Tickets</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                            <Label htmlFor="quantity">Cantidad</Label>
                            <Input id="quantity" type="number" value={moreQuantity} onChange={(e) => setMoreQuantity(Number(e.target.value))} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setShowGenerateMoreDialog(false)} disabled={isGeneratingMore}>Cancelar</Button>
                            <Button type="button" disabled={isGeneratingMore}>{isGeneratingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
              </>
            )}

            <Button onClick={triggerPdfGeneration} disabled={printingChunk !== null}>
                {printingChunk !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                {printingChunk !== null ? 'Generando...' : 'Descargar PDF'}
            </Button>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="secondary" size="icon" onClick={() => { if (secretKey) handleDownloadSecret(); handleDownloadCsv(); if (secretKey) handleDownloadJson(); handleDownloadReadme();}} disabled={!isSaved}>
                            <Download />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{secretKey ? "Descargar todos los activos" : "Descargar CSV"}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>

        </div>
      </div>

      {!isSaved && (
          <Alert className="mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Guardando tickets...</AlertTitle>
              <AlertDescription>Sincronizando los tickets generados con la base de datos.</AlertDescription>
          </Alert>
      )}
      {isSaved && !isRegeneration && (
           <Alert variant="default" className="mb-4 bg-green-100 dark:bg-green-900/50">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Sincronización Completa</AlertTitle>
              <AlertDescription>Todos los tickets se han guardado en la base de datos.</AlertDescription>
          </Alert>
      )}
      
      {/* Contenedor para la vista previa en pantalla */}
      <div className="all-tickets-container grid grid-cols-1 md:grid-cols-2 gap-4">
        {tickets.map((ticket, index) => (
          <div key={`ticket-container-${ticket.ticketId}`} className="flex justify-center">
            {/* Le pasamos la ref al TicketCard, que es lo que queremos capturar */}
            <div ref={ticketRefs[index]}>
              <TicketCard
                eventName={eventParams.event_name}
                dateTime={eventParams.date_time}
                venue={eventParams.venue}
                ticketNumber={ticket.ticketNumber}
                qrPayload={ticket.qrPayload}
                shortCode={ticket.shortCode}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
