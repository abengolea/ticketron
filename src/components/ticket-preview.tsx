
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


// VERSIÓN DE PRUEBA - SOLO PARA DIAGNOSTICAR
// Reemplaza temporalmente tu handleGeneratePdf con esta versión

async function handleGeneratePdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string,
): Promise<void> {
  console.log('🎫 PRUEBA SIMPLE - Generando PDF con 1 ticket');
  
  let tempContainer: HTMLDivElement | null = null;

  try {
    // Verificar que tenemos tickets
    console.log('📊 Total tickets:', ticketRefs.length);
    
    if (!ticketRefs || ticketRefs.length === 0) {
      throw new Error('No hay tickets para procesar');
    }

    // Tomar solo el PRIMER ticket
    const firstTicket = ticketRefs[0];
    
    if (!firstTicket.current) {
      throw new Error('El primer ticket es null');
    }

    console.log('✓ Primer ticket encontrado');

    // Crear PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Crear contenedor VISIBLE
    tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
      position: fixed !important;
      top: 50px !important;
      left: 50px !important;
      width: 400px !important;
      height: 600px !important;
      background: white !important;
      z-index: 999999 !important;
      border: 5px solid red !important;
      padding: 20px !important;
    `;
    
    document.body.appendChild(tempContainer);
    console.log('✓ Contenedor creado (deberías verlo en pantalla con borde rojo)');

    // Clonar el primer ticket
    const clonedTicket = firstTicket.current.cloneNode(true) as HTMLDivElement;
    clonedTicket.style.cssText = `
      display: block !important;
      visibility: visible !important;
      width: 100% !important;
    `;
    
    tempContainer.appendChild(clonedTicket);
    console.log('✓ Ticket clonado y añadido');

    // Esperar mucho tiempo
    console.log('⏳ Esperando 3 segundos...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verificar imágenes
    const images = clonedTicket.querySelectorAll('img');
    console.log(`🖼️ Imágenes en el ticket: ${images.length}`);
    
    images.forEach((img, i) => {
      console.log(`  Imagen ${i}:`, {
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.src.substring(0, 100)
      });
    });

    // Verificar dimensiones
    console.log('📏 Dimensiones del contenedor:', {
      offsetWidth: tempContainer.offsetWidth,
      offsetHeight: tempContainer.offsetHeight,
    });

    console.log('📏 Dimensiones del ticket:', {
      offsetWidth: clonedTicket.offsetWidth,
      offsetHeight: clonedTicket.offsetHeight,
    });

    // Capturar
    console.log('📸 Capturando...');
    const canvas = await html2canvas(clonedTicket, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: true,
    });

    console.log('✓ Canvas capturado:', {
      width: canvas.width,
      height: canvas.height,
    });

    // Convertir
    console.log('🔄 Convirtiendo a imagen...');
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    console.log('📊 DataURL generado:', {
      length: imgData.length,
      sizeKB: (imgData.length / 1024).toFixed(2),
      starts: imgData.substring(0, 50),
    });

    // Validar manualmente
    if (!imgData || imgData.length < 100) {
      throw new Error(`DataURL muy corto: ${imgData.length} chars`);
    }

    if (!imgData.startsWith('data:image/')) {
      throw new Error(`DataURL no empieza con data:image/`);
    }

    console.log('✓ DataURL parece válido');

    // Añadir al PDF
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    pdf.addImage(imgData, 'PNG', 10, 10, pageWidth - 20, pageHeight - 20);
    
    console.log('✓ Añadido al PDF');

    // Guardar
    pdf.save('test_single_ticket.pdf');
    
    console.log('✅ PDF GENERADO EXITOSAMENTE');

  } catch (error) {
    console.error('❌ ERROR:', error);
    console.error('❌ MENSAJE:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    // Esperar 2 segundos antes de limpiar para que puedas ver el contenedor
    console.log('⏳ Esperando 2 segundos antes de limpiar...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (tempContainer?.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
      console.log('✓ Contenedor eliminado');
    }
  }
}



type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

const PDF_CHUNK_SIZE = 100;
const TICKETS_PER_PAGE = 4;

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams } = result;
  const { secretKey } = result;
  const { toast } = useToast();

  const ticketRefs = React.useMemo(() =>
    Array.from({ length: tickets.length }, () => createRef<HTMLDivElement>()),
    [tickets.length]
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

  const triggerPdfGeneration = async (chunkIndex: number) => {
    setPrintingChunk(chunkIndex);
    
    const start = chunkIndex * PDF_CHUNK_SIZE;
    const end = start + PDF_CHUNK_SIZE;
    const relevantTicketRefs = ticketRefs.slice(start, end);
    const fileNameSuffix = tickets.length > PDF_CHUNK_SIZE ? `_${start + 1}-${Math.min(end, tickets.length)}` : "";

    try {
      await handleGeneratePdf(relevantTicketRefs, eventParams.event_name);
      toast({
        title: "PDF Generado",
        description: `El PDF de prueba se ha descargado.`,
      });
    } catch (error) {
      console.error("Error generating PDF chunk:", error);
      toast({
        title: "Error de PDF",
        description: `No se pudo generar el PDF de prueba: ${error instanceof Error ? error.message : String(error)}`,
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
  
  const pdfTicketChunks = Array.from({ length: Math.ceil(tickets.length / PDF_CHUNK_SIZE) }, (_, i) => i);


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

            {pdfTicketChunks.map(chunkIndex => {
              const start = chunkIndex * PDF_CHUNK_SIZE + 1;
              const end = Math.min((chunkIndex + 1) * PDF_CHUNK_SIZE, tickets.length);
              const label = tickets.length > PDF_CHUNK_SIZE ? `Tickets ${start}-${end}` : 'Descargar PDF';
              
              return (
                <Button key={chunkIndex} onClick={() => triggerPdfGeneration(chunkIndex)} disabled={printingChunk !== null}>
                  {printingChunk === chunkIndex ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  {printingChunk === chunkIndex ? 'Generando...' : label}
                </Button>
              )
            })}

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
      
      {/* This area is for VISIBLE preview and PDF generation */}
      <div className="all-tickets-container space-y-4">
        {tickets.map((ticket, index) => (
          <div key={`ticket-container-${ticket.ticketId}`} ref={ticketRefs[index]} className="inline-block">
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
