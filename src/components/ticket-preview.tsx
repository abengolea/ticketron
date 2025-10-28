
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
  fileNameSuffix: string = ""
): Promise<void> {
  console.log('═══════════════════════════════════');
  console.log('🎫 INICIANDO GENERACIÓN DE PDF');
  console.log('═══════════════════════════════════');
  
  let tempContainer: HTMLDivElement | null = null;

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const ticketChunks = chunk(ticketRefs, 4); 
    console.log(`📊 Total de páginas: ${ticketChunks.length}`);

    // CREAR CONTENEDOR TEMPORAL VISIBLE
    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-temp-container-' + Date.now();
    
    // We are now using the CSS classes defined in globals.css
    tempContainer.className = 'pdf-capture-area';
    
    document.body.appendChild(tempContainer);
    document.body.classList.add('pdf-generating');
    console.log('✓ Contenedor temporal creado y VISIBLE');

    for (let pageIndex = 0; pageIndex < ticketChunks.length; pageIndex++) {
        console.log(`\n┌─────────────────────────────────────┐`);
        console.log(`│ PÁGINA ${pageIndex + 1}/${ticketChunks.length}                        │`);
        console.log(`└─────────────────────────────────────┘`);
        
        const pageTicketRefs = ticketChunks[pageIndex];

        // Crear elemento de página
        const pageElement = document.createElement('div');
        pageElement.id = `print-page-temp-${pageIndex}`;
        pageElement.className = 'print-page bg-white p-5 grid grid-cols-2 grid-rows-2 gap-0 w-[210mm] h-[297mm]';
        
        // Limpiar contenedor y añadir nueva página
        tempContainer.innerHTML = '';
        tempContainer.appendChild(pageElement);

        // Clonar tickets en la página
        console.log(`📋 Clonando ${pageTicketRefs.length} tickets...`);
        let ticketsCloned = 0;
        
        pageTicketRefs.forEach((ticketRef, idx) => {
            if (ticketRef.current) {
                const clonedTicket = ticketRef.current.cloneNode(true) as HTMLDivElement;
                
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center justify-center';
                wrapper.appendChild(clonedTicket);
                pageElement.appendChild(wrapper);
                ticketsCloned++;
            } else {
                console.warn(`  ⚠ Ticket ref ${idx} es null`);
            }
        });
        
        console.log(`✓ ${ticketsCloned} tickets clonados`);

        // PASO 1: Esperar render largo
        console.log(`⏳ Esperando render (1 segundo)...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // PASO 2: Verificar dimensiones
        console.log(`📏 Verificando dimensiones...`);
        console.log(`  - offsetWidth: ${pageElement.offsetWidth}px`);
        console.log(`  - offsetHeight: ${pageElement.offsetHeight}px`);
        
        if (pageElement.offsetWidth === 0 || pageElement.offsetHeight === 0) {
          throw new Error(`La página ${pageIndex + 1} tiene dimensiones cero`);
        }
        
        // PASO 3: Verificar imágenes
        const images = pageElement.querySelectorAll('img');
        console.log(`🖼️ Verificando ${images.length} imágenes...`);
        
        images.forEach((img, imgIdx) => {
          console.log(`  Imagen ${imgIdx}: complete=${img.complete}, naturalWidth=${img.naturalWidth}, src=${img.src.substring(0, 80)}...`);
        });
        
        // PASO 4: Esperar imágenes
        console.log(`⏳ Esperando carga de imágenes...`);
        await waitForImagesInContainer(pageElement);
        
        // PASO 5: Pausa adicional después de que las imágenes carguen
        console.log(`⏳ Pausa adicional (500ms)...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // PASO 6: Capturar con html2canvas
        console.log(`📸 Iniciando captura con html2canvas...`);
        
        let canvas: HTMLCanvasElement;
        try {
          canvas = await html2canvas(pageElement, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: true,
            onclone: (clonedDoc) => {
              console.log(`  🔄 html2canvas clonó el documento`);
              const clonedPage = clonedDoc.getElementById(`print-page-temp-${pageIndex}`);
              if (clonedPage) {
                console.log(`  ✓ Página clonada encontrada en documento clonado`);
              } else {
                console.warn(`  ⚠ No se encontró la página en el documento clonado`);
              }
            }
          });
        } catch (canvasError) {
          console.error(`❌ Error en html2canvas:`, canvasError);
          throw new Error(`html2canvas falló en página ${pageIndex + 1}: ${canvasError}`);
        }

        console.log(`✓ Canvas capturado exitosamente`);
        console.log(`  - Dimensiones: ${canvas.width}x${canvas.height}px`);

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          throw new Error(`Canvas tiene dimensiones inválidas: ${canvas.width}x${canvas.height}`);
        }
        
        // PASO 7: Convertir a dataURL
        console.log(`🔄 Convirtiendo canvas a imagen...`);
        const imgData = canvas.toDataURL('image/png', 1.0);

        console.log(`📊 Validando imagen generada...`);
        console.log(`  - Longitud: ${imgData.length} caracteres`);
        if (!isValidDataURL(imgData)) {
          throw new Error(`Canvas data for page ${pageIndex + 1} is invalid.`);
        }
        console.log(`✓ Imagen válida`);

        // PASO 8: Añadir al PDF
        console.log(`📄 Añadiendo al PDF...`);
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
        console.log(`✅ Página ${pageIndex + 1} añadida exitosamente al PDF`);
    }

    const cleanEventName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${cleanEventName}_tickets${fileNameSuffix}.pdf`;
    pdf.save(fileName);
    
    console.log(`\n═══════════════════════════════════`);
    console.log(`✅ PDF GENERADO EXITOSAMENTE`);
    console.log(`═══════════════════════════════════\n`);

  } catch (error) {
    console.error('\n═══════════════════════════════════');
    console.error('❌ ERROR FATAL EN GENERACIÓN DE PDF');
    console.error('═══════════════════════════════════');
    
    // Imprimir el mensaje del error
    if (error instanceof Error) {
      console.error('Mensaje:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Error:', JSON.stringify(error, null, 2));
    }
    
    console.error('═══════════════════════════════════\n');
    throw error;
  } finally {
    if (tempContainer) {
      document.body.removeChild(tempContainer);
      document.body.classList.remove('pdf-generating');
      console.log('✓ Contenedor temporal eliminado');
    }
  }
}



type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

const PDF_CHUNK_SIZE = 100;

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
    
    const startTicketIndex = chunkIndex * PDF_CHUNK_SIZE;
    const endTicketIndex = startTicketIndex + PDF_CHUNK_SIZE;
    const ticketRefsChunk = ticketRefs.slice(startTicketIndex, endTicketIndex);

    const startTicketNum = chunkIndex * PDF_CHUNK_SIZE + 1;
    const endTicketNum = Math.min((chunkIndex + 1) * PDF_CHUNK_SIZE, tickets.length);
    const fileNameSuffix = tickets.length > PDF_CHUNK_SIZE ? `_${startTicketNum}-${endTicketNum}` : "";

    try {
      await handleGeneratePdf(ticketRefsChunk, eventParams.event_name, fileNameSuffix);
      toast({
        title: "PDF Generado",
        description: `El lote de tickets ${startTicketNum}-${endTicketNum} se ha descargado.`,
      });
    } catch (error) {
      console.error("Error generating PDF chunk:", error);
      toast({
        title: "Error de PDF",
        description: `No se pudo generar el lote ${startTicketNum}-${endTicketNum}: ${error instanceof Error ? error.message : String(error)}`,
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

      {/* This area is only for preview, not for PDF generation */}
      <div className="visible-preview space-y-4">
        <div className="print-page bg-white shadow-lg p-5 grid grid-cols-2 grid-rows-2 gap-0 w-[210mm] h-[148.5mm] mx-auto my-4">
            {tickets.slice(0, 4).map((ticket, index) => (
              <div key={`preview-ticket-${ticket.ticketId}`} ref={ticketRefs[index]} className="flex items-center justify-center">
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
      
      {/* Hidden container for all tickets, for referencing */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px'}}>
        {tickets.map((ticket, index) => (
           <div key={`hidden-ticket-${ticket.ticketId}`} ref={ticketRefs[index]}>
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

    