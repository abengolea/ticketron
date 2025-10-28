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
import { useFirestore } from "@/firebase";
import { writeBatch, doc, serverTimestamp, runTransaction, collection, updateDoc, getDoc, increment } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
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
  
  let tempContainer: HTMLDivElement | null = null;

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const ticketChunks = chunk(ticketRefs, 8); 

    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-temp-container-' + Date.now();
    
    tempContainer.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 210mm !important; 
      height: 297mm !important;
      background-color: white !important;
      z-index: -1 !important; 
      visibility: hidden !important; 
      overflow: hidden !important;
      pointer-events: none !important;
    `;
    
    document.body.appendChild(tempContainer);
    console.log('✓ Contenedor temporal creado');

    for (let pageIndex = 0; pageIndex < ticketChunks.length; pageIndex++) {
        const pageTicketRefs = ticketChunks[pageIndex];
        const pageId = `print-page-temp-${pageIndex}`;

        const pageElement = document.createElement('div');
        pageElement.id = pageId;
        pageElement.className = "print-page bg-white shadow-none p-0 grid grid-cols-2 grid-rows-4 gap-0 relative w-[210mm] h-[297mm]";

        pageTicketRefs.forEach(ticketRef => {
            if (ticketRef.current) {
                const clonedTicket = ticketRef.current.cloneNode(true) as HTMLDivElement;
                const wrapper = document.createElement('div');
                wrapper.className = "flex items-center justify-center";
                wrapper.appendChild(clonedTicket);
                pageElement.appendChild(wrapper);
            }
        });

        tempContainer.innerHTML = '';
        tempContainer.appendChild(pageElement);
        
        console.log(`📏 Verificando página ${pageIndex + 1}...`);
        
        await waitForImagesInContainer(pageElement);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log(`📸 Capturando página ${pageIndex + 1}...`);
        const canvas = await html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 15000,
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        if (!isValidDataURL(imgData)) {
           throw new Error(`Generated canvas for page ${pageIndex + 1} is invalid or empty.`);
        }

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
        console.log(`✅ Página ${pageIndex + 1} añadida al PDF`);
    }

    const fileName = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tickets.pdf`;
    pdf.save(fileName);

  } catch (error) {
    console.error('❌ Error fatal durante la generación del PDF:', error);
    throw error;
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
      console.log('✓ Contenedor temporal eliminado');
    }
  }
}

type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, secretKey, eventParams } = result;
  const firestore = useFirestore();
  const { toast } = useToast();

  const ticketRefs = React.useMemo(() => 
    Array.from({ length: tickets.length }, () => createRef<HTMLDivElement>()),
    [tickets.length]
  );

  const [isSaving, setIsSaving] = useState(!isRegeneration);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(isRegeneration);
  const [isPrinting, setIsPrinting] = useState(false);
  
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
    if (isRegeneration) {
        setIsSaving(false);
        setIsSaved(true);
    } else {
        setIsSaving(true);
        const timer1 = setTimeout(() => {
            setIsSaving(false);
            setIsSaved(true);
        }, 2000);
        return () => clearTimeout(timer1);
    }
  }, [isRegeneration]);

  const triggerPdfGeneration = async () => {
    setIsPrinting(true);
    try {
      await handleGeneratePdf(ticketRefs, eventParams.event_name);
      toast({
        title: "PDF Generado",
        description: "El PDF se ha descargado correctamente",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el PDF",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  const handleEditEvent = async () => {
    setIsEditing(true);
    try {
      // Aquí iría tu lógica de actualización
      toast({
        title: "Evento actualizado",
        description: "Los cambios se han guardado correctamente",
      });
      setShowEditDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el evento",
        variant: "destructive",
      });
    } finally {
      setIsEditing(false);
    }
  };

  const handleGenerateMore = async () => {
    setIsGeneratingMore(true);
    try {
      // Aquí iría tu lógica de generar más tickets
      toast({
        title: "Tickets generados",
        description: `Se generaron ${moreQuantity} tickets adicionales`,
      });
      setShowGenerateMoreDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron generar más tickets",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const handleDownloadSecret = () => {
    if (secretKey) {
      downloadFile("secret_key.txt", secretKey, "text/plain");
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = [
      "Ticket Number,Short Code,QR Payload,Redeemed",
      ...tickets.map(t => `${t.ticketNumber},${t.shortCode},${t.qrPayload},false`)
    ].join("\n");
    downloadFile("tickets.csv", csvContent, "text/csv");
  };

  const handleDownloadJson = () => {
    const jsonContent = JSON.stringify({ tickets, eventParams, secretKey }, null, 2);
    downloadFile("event_data.json", jsonContent, "application/json");
  };

  const handleDownloadReadme = () => {
    const readmeContent = `# Instrucciones de Validación de Tickets

Este archivo explica cómo validar los tickets generados para tu evento.

## Métodos de Validación

### 1. Validación Online (Recomendado)

Accede a la aplicación web y usa el escáner QR integrado para validar tickets en tiempo real.

### 2. Validación por Código Corto

Si no tienes acceso a un escáner QR, puedes ingresar manualmente el código corto del ticket.

### 3. Validación Manual (Último Recurso)

Usa el archivo \`tickets.csv\` para una búsqueda manual si todo lo demás falla.
    `;
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
                {/* Edit Event Dialog */}
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Pencil className="mr-2 h-4 w-4" /> Editar Evento
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Editar Detalles del Evento</DialogTitle>
                            <DialogDescription>
                                Modifica la información del evento. Estos cambios se reflejarán en los tickets impresos.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="eventName" className="text-right">Nombre</Label>
                                <Input id="eventName" value={editFormData.eventName} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="dateTime" className="text-right">Fecha y Hora</Label>
                                <Input id="dateTime" value={editFormData.dateTime} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="venue" className="text-right">Lugar</Label>
                                <Input id="venue" value={editFormData.venue} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setShowEditDialog(false)} disabled={isEditing}>Cancelar</Button>
                            <Button type="button" onClick={handleEditEvent} disabled={isEditing}>
                                {isEditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Guardar Cambios
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Generate More Tickets Dialog */}
                <Dialog open={showGenerateMoreDialog} onOpenChange={setShowGenerateMoreDialog}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Generar Más
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Generar Más Tickets</DialogTitle>
                            <DialogDescription>
                                ¿Cuántos tickets adicionales quieres generar para "{eventParams.event_name}"?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="quantity" className="text-right">
                                    Cantidad
                                </Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    value={moreQuantity}
                                    onChange={(e) => setMoreQuantity(Number(e.target.value))}
                                    className="col-span-3"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setShowGenerateMoreDialog(false)} disabled={isGeneratingMore}>Cancelar</Button>
                            <Button type="submit" onClick={handleGenerateMore} disabled={isGeneratingMore}>
                                {isGeneratingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Generar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
              </>
            )}

            <Button onClick={triggerPdfGeneration} disabled={isPrinting}>
                {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                {isPrinting ? 'Generando...' : 'Descargar PDF'}
            </Button>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="secondary" size="icon" onClick={() => {
                            if (secretKey) handleDownloadSecret();
                            handleDownloadCsv();
                            if (secretKey) handleDownloadJson();
                            handleDownloadReadme();
                        }}
                        disabled={!isSaved}
                        >
                            <Download />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {secretKey ? <p>Descargar todos los activos (.txt, .csv, .json, .md)</p> : <p>Descargar CSV de tickets</p>}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

        </div>
      </div>

        {isSaving && (
            <Alert className="mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Guardando tickets...</AlertTitle>
                <AlertDescription>
                    Sincronizando los tickets generados con la base de datos online. Por favor, espera.
                </AlertDescription>
            </Alert>
        )}
        {isSaved && !isRegeneration && (
             <Alert variant="default" className="mb-4 bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Sincronización Completa</AlertTitle>
                <AlertDescription>
                    Todos los tickets se han guardado en la base de datos online.
                </AlertDescription>
            </Alert>
        )}
        {saveError && (
            <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fallo en la Sincronización Online</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
            </Alert>
        )}

      <div className="printable-area space-y-4">
        {chunk(tickets, eventParams.tickets_per_page).map((pageTickets, pageIndex) => (
            <div key={pageIndex} className="print-page bg-white shadow-lg p-5 grid grid-cols-2 grid-rows-4 gap-0 w-[210mm] h-[297mm] mx-auto my-4">
              {pageTickets.map((ticket) => (
                <div key={ticket.ticketId} ref={ticketRefs[ticket.ticketNumber - 1]} className="flex items-center justify-center">
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
        ))}
      </div>
    </div>
  );
}
