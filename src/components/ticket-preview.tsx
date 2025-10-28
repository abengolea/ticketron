
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
  console.log('🎫 Iniciando generación de PDF...');
  console.log(`📊 Total de tickets: ${ticketRefs.length}`);
  
  let tempContainer: HTMLDivElement | null = null;

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Dividir en páginas de 8 tickets
    const ticketsPerPage = 8;
    const ticketChunks = chunk(ticketRefs, ticketsPerPage);
    console.log(`📄 Total de páginas a generar: ${ticketChunks.length}`);

    // Crear contenedor temporal VISIBLE
    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-temp-container-' + Date.now();
    
    // Hacer el contenedor VISIBLE pero fuera de vista
    tempContainer.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 794px !important;
      height: 1123px !important;
      background: white !important;
      z-index: 999999 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      overflow: hidden !important;
    `;
    
    document.body.appendChild(tempContainer);
    console.log('✓ Contenedor temporal creado');

    // Procesar cada página
    for (let pageIndex = 0; pageIndex < ticketChunks.length; pageIndex++) {
      console.log(`\n📄 Procesando página ${pageIndex + 1}/${ticketChunks.length}`);
      
      const pageTickets = ticketChunks[pageIndex];
      console.log(`  - Tickets en esta página: ${pageTickets.length}`);

      // Crear el elemento de página con grid
      const pageElement = document.createElement('div');
      pageElement.id = `pdf-page-${pageIndex}`;
      pageElement.style.cssText = `
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        grid-template-rows: repeat(4, 1fr) !important;
        gap: 0 !important;
        width: 794px !important;
        height: 1123px !important;
        background: white !important;
        padding: 0 !important;
        margin: 0 !important;
      `;

      // Clonar cada ticket en esta página
      let clonedCount = 0;
      for (const ticketRef of pageTickets) {
        if (ticketRef.current) {
          const clonedTicket = ticketRef.current.cloneNode(true) as HTMLDivElement;
          
          clonedTicket.style.cssText = `
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            height: 100% !important;
            visibility: visible !important;
            opacity: 1 !important;
          `;
          
          pageElement.appendChild(clonedTicket);
          clonedCount++;
        }
      }

      console.log(`  ✓ ${clonedCount} tickets clonados`);

      // Añadir la página al contenedor
      tempContainer.innerHTML = '';
      tempContainer.appendChild(pageElement);

      // CRÍTICO: Esperar suficiente tiempo
      console.log(`  ⏳ Esperando render (1.5 segundos)...`);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verificar imágenes
      const images = pageElement.querySelectorAll('img');
      console.log(`  🖼️ Imágenes encontradas: ${images.length}`);
      
      // Esperar que las imágenes carguen
      if (images.length > 0) {
        console.log(`  ⏳ Esperando carga de imágenes...`);
        await waitForImagesInContainer(pageElement);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Verificar dimensiones
      const dimensions = {
        width: pageElement.offsetWidth,
        height: pageElement.offsetHeight,
      };
      console.log(`  📏 Dimensiones:`, dimensions);

      if (dimensions.width === 0 || dimensions.height === 0) {
        throw new Error(`Página ${pageIndex + 1} tiene dimensiones cero`);
      }

      // Capturar con html2canvas
      console.log(`  📸 Capturando página...`);
      
      const canvas = await html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        width: pageElement.offsetWidth,
        height: pageElement.offsetHeight,
      });

      console.log(`  ✓ Canvas: ${canvas.width}x${canvas.height}px`);

      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Canvas de página ${pageIndex + 1} tiene dimensiones cero`);
      }

      // Convertir a imagen
      console.log(`  🔄 Convirtiendo a imagen...`);
      
      let imgData: string;
      try {
        imgData = canvas.toDataURL('image/png', 1.0);
      } catch (err) {
        console.error(`  ❌ Error en toDataURL:`, err);
        throw new Error(`No se pudo convertir canvas a imagen en página ${pageIndex + 1}`);
      }

      // Validar imagen
      const imgSize = (imgData.length / 1024).toFixed(2);
      console.log(`  📊 Imagen: ${imgSize} KB`);

      if (!imgData || imgData.length < 1000) {
        throw new Error(`Imagen de página ${pageIndex + 1} es muy pequeña (${imgData.length} chars)`);
      }

      if (!imgData.startsWith('data:image/png')) {
        throw new Error(`Imagen de página ${pageIndex + 1} no es PNG válida`);
      }

      // Validar con la función auxiliar si existe
      if (typeof isValidDataURL === 'function' && !isValidDataURL(imgData)) {
        throw new Error(`Los datos del canvas para la página ${pageIndex + 1} son inválidos.`);
      }

      console.log(`  ✓ Imagen válida`);

      // Añadir página al PDF
      if (pageIndex > 0) {
        pdf.addPage();
      }

      try {
        pdf.addImage(
          imgData,
          'PNG',
          0,
          0,
          pageWidth,
          pageHeight,
          `page-${pageIndex}`,
          'FAST'
        );
        console.log(`  ✅ Página ${pageIndex + 1} añadida al PDF`);
      } catch (pdfErr) {
        console.error(`  ❌ Error añadiendo al PDF:`, pdfErr);
        throw new Error(`No se pudo añadir página ${pageIndex + 1} al PDF`);
      }
    }

    // Guardar PDF
    const fileName = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tickets.pdf`;
    console.log(`\n💾 Guardando: ${fileName}`);
    pdf.save(fileName);
    
    console.log(`✅ PDF generado exitosamente con ${ticketChunks.length} páginas\n`);

  } catch (error) {
    console.error('\n❌ ERROR FATAL DURANTE LA GENERACIÓN DEL PDF');
    if (error instanceof Error) {
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
    } else {
        console.error('Error:', JSON.stringify(error, null, 2));
    }
    throw error;
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
      console.log('✓ Contenedor temporal eliminado\n');
    }
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

  const triggerPdfGeneration = async (chunkIndex: number, chunkSize: number) => {
    setPrintingChunk(chunkIndex);
    
    const start = chunkIndex * chunkSize;
    const end = start + chunkSize;
    const relevantTicketRefs = ticketRefs.slice(start, end);
    const fileNameSuffix = tickets.length > chunkSize ? `_${start + 1}-${Math.min(end, tickets.length)}` : "";

    try {
      await handleGeneratePdf(relevantTicketRefs, `${eventParams.event_name}${fileNameSuffix}`);
      toast({
        title: "PDF Generado",
        description: `El archivo ${eventParams.event_name}${fileNameSuffix}.pdf se ha descargado.`,
      });
    } catch (error) {
      console.error("Error generating PDF chunk:", error);
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
  
  const pdfTicketChunks = Array.from({ length: Math.ceil(tickets.length / PDF_CHUNK_SIZE) }, (_, i) => i);

  // Divide todos los tickets en páginas de 8
  const pages = chunk(tickets, TICKETS_PER_PAGE);

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
                <Button key={chunkIndex} onClick={() => triggerPdfGeneration(chunkIndex, PDF_CHUNK_SIZE)} disabled={printingChunk !== null}>
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

    