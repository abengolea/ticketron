
"use client";

import React, { useRef, createRef } from "react";
import type { GenerationResult, EventParameters, TicketData } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { downloadFile, base32Encode, createHmacSha256 } from "@/lib/utils";
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
import { writeBatch, doc, serverTimestamp, runTransaction, collection, updateDoc, getDoc, FieldValue, increment } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { isValidDataURL } from "@/lib/image-utils";


// Helper to chunk array
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};


// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ULTRA-DEBUG PDF GENERATION FUNCTION
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
interface TicketRef {
  current: HTMLDivElement | null;
}

async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  if (images.length === 0) {
    console.log('  - No images found to wait for.');
    return;
  }

  await Promise.all(
    images.map((img, idx) => {
      console.log(`    - Waiting for image ${idx}: ${img.src.substring(0, 50)}...`);
      if (img.complete && img.naturalHeight !== 0) {
        console.log(`      ✓ Image ${idx} already loaded.`);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        img.onload = () => {
          console.log(`      ✓ Image ${idx} loaded successfully.`);
          resolve();
        };
        img.onerror = () => {
          console.warn(`      ⚠️ Image ${idx} failed to load.`);
          resolve(); // Resolve anyway to not block the process
        };
        // Failsafe timeout
        setTimeout(() => {
          console.warn(`      ⏳ Timeout for image ${idx}.`);
          resolve();
        }, 10000);
      });
    })
  );
}

export async function handleGeneratePdf(
  ticketRefs: React.RefObject<HTMLDivElement>[],
  eventName: string
): Promise<void> {
  console.log('═══════════════════════════════════════');
  console.log('🎫 INICIANDO GENERACIÓN DE PDF');
  console.log('═══════════════════════════════════════');
  console.log('Evento:', eventName);
  console.log('Tickets a procesar:', ticketRefs.length);
  
  let tempContainer: HTMLDivElement | null = null;
  const { toast } = useToast();

  toast({
    title: 'Iniciando generación de PDF...',
    description: 'Este proceso puede tardar. Revisa la consola para ver el progreso.'
  })

  try {
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let processedTickets = 0;

    // ═══════════════════════════════════════
    // PASO 1: CREAR CONTENEDOR TEMPORAL
    // ═══════════════════════════════════════
    console.log('\n┌─────────────────────────────────────┐');
    console.log('│ PASO 1: Creando contenedor temporal│');
    console.log('└─────────────────────────────────────┘');
    
    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-temp-container-' + Date.now();
    
    tempContainer.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 105mm !important;
      height: 74.25mm !important;
      background-color: white !important;
      z-index: 999999 !important;
      padding: 0 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      overflow: visible !important;
      pointer-events: none !important;
    `;
    
    document.body.appendChild(tempContainer);
    
    console.log('✓ Contenedor creado:', tempContainer.id);
    console.log('✓ Contenedor en DOM:', document.body.contains(tempContainer));
    console.log('✓ Estilos aplicados:', tempContainer.style.position, tempContainer.style.zIndex);

    // ═══════════════════════════════════════
    // PASO 2: PROCESAR CADA TICKET
    // ═══════════════════════════════════════
    const ticketsPerPage = 8;
    const ticketChunks = chunk(ticketRefs, ticketsPerPage);

    for (let pageIndex = 0; pageIndex < ticketChunks.length; pageIndex++) {
        const pageTicketRefs = ticketChunks[pageIndex];
        console.log(`\n\n📄 Procesando página de PDF ${pageIndex + 1}/${ticketChunks.length}`);

        // Create a page element to hold the tickets
        const pageElement = document.createElement('div');
        pageElement.className = "print-page bg-card shadow-lg rounded-lg mx-auto p-5 grid grid-cols-2 grid-rows-4 gap-0 relative w-[210mm] h-[297mm]";

        pageTicketRefs.forEach(ticketRef => {
            if (ticketRef.current) {
                const clonedTicket = ticketRef.current.cloneNode(true) as HTMLDivElement;
                const wrapper = document.createElement('div');
                wrapper.className = "flex items-center justify-center";
                wrapper.appendChild(clonedTicket);
                pageElement.appendChild(wrapper);
            }
        });
        
        // Fill empty slots on the last page
        const emptySlots = ticketsPerPage - pageTicketRefs.length;
        for (let i = 0; i < emptySlots; i++) {
             pageElement.appendChild(document.createElement('div'));
        }

        tempContainer.innerHTML = '';
        tempContainer.appendChild(pageElement);
        console.log(`  ✓ Página ${pageIndex + 1} clonada y añadida a contenedor temporal`);

        await new Promise(resolve => setTimeout(resolve, 500)); // wait for render

        const rect = pageElement.getBoundingClientRect();
        console.log(`  ✓ Dimensiones de la página clonada: ${rect.width}x${rect.height}`);

        if (rect.width === 0 || rect.height === 0) {
            console.error(`❌ ERROR: Página ${pageIndex + 1} tiene dimensiones cero. Saltando.`);
            continue;
        }

        console.log(`  ⏳ Esperando imágenes en página ${pageIndex + 1}...`);
        await waitForImages(pageElement);
        console.log(`  ✓ Imágenes cargadas en página ${pageIndex + 1}.`);
        await new Promise(resolve => setTimeout(resolve, 300)); // extra buffer

        try {
            console.log(`  📸 Capturando canvas para página ${pageIndex + 1}...`);
            const canvas = await html2canvas(pageElement, {
                scale: 2,
                useCORS: true,
                allowTaint: true, // Crucial for external images
                backgroundColor: '#ffffff',
                logging: true,
            });

            console.log(`  ✓ Canvas capturado: ${canvas.width}x${canvas.height}`);
            if (canvas.width === 0 || canvas.height === 0) throw new Error("Canvas is empty");

            const imgData = canvas.toDataURL('image/png', 1.0);
            const sizeKB = (imgData.length / 1024).toFixed(2);
            console.log(`  ✓ Imagen generada: ${sizeKB} KB`);

            if (!isValidDataURL(imgData)) throw new Error("Invalid Data URL");
            
            if (pageIndex > 0) {
                pdf.addPage();
            }
            pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
            console.log(`  ✅ Página ${pageIndex + 1} añadida al PDF.`);
            processedTickets += pageTicketRefs.length;

        } catch (pageError: any) {
             console.error(`❌ ERROR al procesar la página de PDF ${pageIndex + 1}:`, pageError);
        }
    }


    // ═══════════════════════════════════════
    // PASO 3: FINALIZAR Y GUARDAR
    // ═══════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║         FINALIZANDO PDF              ║');
    console.log('╚═══════════════════════════════════════╝');
    
    if (processedTickets === 0) {
      toast({
        variant: "destructive",
        title: "Error al generar PDF",
        description: "No se pudo procesar ningún ticket. Revisa la consola para más detalles."
      })
      throw new Error('No se pudo procesar ningún ticket');
    }

    const fileName = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tickets.pdf`;
    console.log('💾 Guardando:', fileName);
    pdf.save(fileName);
    
    toast({
        title: "PDF Generado",
        description: `${processedTickets} tickets guardados en ${fileName}`
    });
    console.log('\n═══════════════════════════════════════');
    console.log(`✅ PDF GENERADO: ${processedTickets} tickets`);
    console.log('═══════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n═══════════════════════════════════════');
    console.error('❌ ERROR FATAL');
    console.error('═══════════════════════════════════════');
    console.error(error);
    toast({
        variant: "destructive",
        title: "Error Fatal",
        description: error.message || "Ocurrió un error inesperado. Revisa la consola."
    })
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
      console.log('✓ Contenedor temporal eliminado');
    }
  }
}



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

  // This effect is now only for showing the initial save state on new event creation.
  useEffect(() => {
    if (isRegeneration) {
        setIsSaving(false);
        setIsSaved(true);
    } else {
        // This is a new event, show "saving" for a moment then "saved"
        setIsSaving(true);
        const timer1 = setTimeout(() => {
            setIsSaving(false);
            setIsSaved(true);
            toast({
                title: "Tickets guardados online",
                description: `${tickets.length} tickets han sido creados y guardados en la base de datos.`,
            });
        }, 1500); // Simulate saving delay

        return () => clearTimeout(timer1);
    }
  }, [isRegeneration, tickets.length, toast]);

  const triggerPdfGeneration = async () => {
    setIsPrinting(true);
    await handleGeneratePdf(ticketRefs, eventParams.event_id);
    setIsPrinting(false);
  };
  
  const handleGenerateMore = async () => {
    if (!moreQuantity || moreQuantity <= 0) {
      toast({
        variant: "destructive",
        title: "Cantidad Inválida",
        description: "Por favor, introduce un número positivo de tickets a generar.",
      });
      return;
    }
    if (!firestore) {
        toast({ variant: 'destructive', title: "Firestore no disponible." });
        return;
    }

    setIsGeneratingMore(true);
    setShowGenerateMoreDialog(false);
    toast({ title: "Generando más tickets..." });
    
    const eventId = eventParams.event_id;
    const secretRef = doc(firestore, 'event_secrets', eventId);
    
    try {
        const secretDoc = await getDoc(secretRef);
        if (!secretDoc.exists()) {
            throw new Error("No se encontró la clave secreta para este evento. No se pueden generar más tickets.");
        }
        const eventSecretKey = secretDoc.data()?.secretKey;
        if (!eventSecretKey) {
             throw new Error("La clave secreta del evento es inválida.");
        }
        
        const newTickets: TicketData[] = [];
        const startingTicketNumber = tickets.length + 1;

        for (let i = 0; i < moreQuantity; i++) {
            const ticketNumber = startingTicketNumber + i;
            const ticketId = crypto.randomUUID();
            const version = 1;
            const payloadToSign = `${eventId}|${ticketId}|${version}`;
            
            const sig = await createHmacSha256(eventSecretKey, payloadToSign);

            const qrPayload = JSON.stringify({ v: version, eid: eventId, tid: ticketId, sig });
            const shortCodeSource = new TextEncoder().encode(ticketId.substring(0, 8) + sig.substring(0, 4));
            const shortCode = base32Encode(Buffer.from(shortCodeSource)).substring(0, 7);
            newTickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
        }

        const eventRef = doc(firestore, 'events', eventId);
        const ticketsCollectionRef = collection(firestore, 'events', eventId, 'tickets');

        const ticketChunks = chunk(newTickets, 499);
        const allPromises: Promise<void>[] = [];

        for (const ticketChunk of ticketChunks) {
            const batch = writeBatch(firestore);
            const batchData: Record<string, any> = {};
            ticketChunk.forEach((ticket) => {
                const ticketDocRef = doc(ticketsCollectionRef, ticket.ticketId);
                const ticketData = {
                    ticketNumber: ticket.ticketNumber,
                    shortCode: ticket.shortCode,
                    redeemed: false,
                    redeemedAt: null,
                };
                batch.set(ticketDocRef, ticketData);
                batchData[ticket.ticketId] = ticketData;
            });
            const batchPromise = batch.commit().catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                  path: ticketsCollectionRef.path,
                  operation: 'create',
                  requestResourceData: batchData,
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError; // Propagate error
            });
            allPromises.push(batchPromise);
        }
        
        const updateData = { ticketCount: increment(moreQuantity) };
        const updatePromise = updateDoc(eventRef, updateData).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: eventRef.path,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError; // Propagate error
        });
        allPromises.push(updatePromise);
        
        await Promise.all(allPromises);

        toast({
            title: "Generación en Progreso",
            description: `${moreQuantity} nuevos tickets se están guardando. La página se recargará en breve.`
        });
        
        setTimeout(() => window.location.reload(), 2500);

    } catch(e: any) {
        if (e.name !== 'FirestorePermissionError' && !e.message.toLowerCase().includes('permission-denied')) {
             toast({
                variant: "destructive",
                title: "Falló la Generación",
                description: e.message,
            });
        }
        setIsGeneratingMore(false);
    }
  };

  const handleEditEvent = async () => {
    if (!firestore) {
        toast({ variant: 'destructive', title: "Firestore no disponible." });
        return;
    }

    setIsEditing(true);
    const eventDocRef = doc(firestore, 'events', eventParams.event_id);
    const updateData = {
        eventName: editFormData.eventName,
        dateTime: editFormData.dateTime,
        venue: editFormData.venue,
    };
    updateDoc(eventDocRef, updateData)
      .then(() => {
        if (onEventUpdate) {
            onEventUpdate({
                event_name: editFormData.eventName,
                date_time: editFormData.dateTime,
                venue: editFormData.venue
            });
        }
        
        toast({ title: "Evento Actualizado", description: "Los detalles del evento han sido actualizados con éxito." });
        setShowEditDialog(false);
        setIsEditing(false);
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: eventDocRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        // The listener will show the toast
        setIsEditing(false);
      });
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setEditFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleDownloadSecret = () => {
    if (!secretKey) {
        toast({variant: 'destructive', title: 'No se puede descargar el secreto', description: 'La clave secreta no está disponible para eventos pasados.'})
        return;
    }
    downloadFile("secret_key.txt", secretKey, "text/plain");
  };

  const handleDownloadCsv = () => {
    const header = "ticket_number,ticket_id,event_id,version,sig,short_code,qr_payload,printed_sheet,position_in_sheet\n";
    const rows = tickets.map((ticket, index) => {
      try {
        const qrData = JSON.parse(ticket.qrPayload);
        const sheetNumber = Math.floor(index / eventParams.tickets_per_page) + 1;
        const position = (index % eventParams.tickets_per_page) + 1;
        return `${ticket.ticketNumber},${qrData.tid},${qrData.eid},${qrData.v},${qrData.sig},${ticket.shortCode},"${ticket.qrPayload.replace(/"/g, '""')}",${sheetNumber},${position}`;
      } catch (e) {
        return "";
      }
    }).filter(Boolean);
    downloadFile("tickets.csv", header + rows.join("\n"), "text/csv");
  };

  const handleDownloadJson = () => {
     const validTickets = tickets.reduce((acc, ticket) => {
        try {
            const qrData = JSON.parse(ticket.qrPayload);
            acc[qrData.tid] = qrData.sig;
        } catch(e) {}
        return acc;
     }, {} as Record<string, string>);
    downloadFile("valid_tickets.json", JSON.stringify(validTickets, null, 2), "application/json");
  };

  const handleDownloadReadme = () => {
    const readmeContent = `
# Instrucciones de Validación de Tickets

## 1. Validación Online (Recomendado)

Usa la página "Validador" en esta aplicación. Requiere conexión a internet.

1. Ve a la página "Validador".
2. Haz clic en "Escanear QR" y usa la cámara de tu dispositivo para escanear el código QR del ticket.
3. La herramienta verificará el ticket contra la base de datos online y mostrará si es VÁLIDO, INVÁLIDO, o si YA HA SIDO CANJEADO.

## 2. Validación Offline (Método de Respaldo)

Si no tienes internet en el lugar del evento, puedes usar el validador offline. Esto requiere compartir la clave secreta con el personal de validación.

1. Descarga los activos de validación usando el botón de Descarga. Obtendrás un archivo \`secret_key.txt\`.
2. **NO COMPARTAS LA CLAVE SECRETA PÚBLICAMENTE.**
3. En la página "Validador", en la pestaña "Validador Offline", pega el contenido de \`secret_key.txt\` en el campo "Clave Secreta".
4. Escanea un código QR o pega su contenido. La herramienta verificará criptográficamente el ticket.
5. Nota: El validador offline mantiene una lista de tickets canjeados SOLO en ese dispositivo específico. No se sincroniza con otros dispositivos.

## 3. Validación Manual (Último Recurso)

Usa el archivo \`tickets.csv\` para una búsqueda manual si todo lo demás falla.

1. Abre \`tickets.csv\` en un programa de hojas de cálculo.
2. Busca el ticket por su número o código de verificación.
3. Marca manualmente que ha sido canjeado. Este método no tiene verificación de seguridad.
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
        {tickets.map((ticket, index) => (
          <div key={ticket.ticketId} ref={ticketRefs[index]}>
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
