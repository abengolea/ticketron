
"use client";

import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { downloadFile } from "@/lib/utils";
import { Download, Printer, ArrowLeft, Loader2, CheckCircle, AlertCircle, FileDown, PlusCircle, Pencil } from "lucide-react";
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
import { collection, writeBatch, doc, serverTimestamp, setDoc, runTransaction, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { generateTicketsAction } from "@/lib/actions";

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

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, secretKey, eventParams } = result;
  const firestore = useFirestore();
  const { toast } = useToast();

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
    if (isRegeneration) return;

    const saveTicketsToFirestore = async () => {
        if (!firestore) {
            setSaveError("Firestore no está disponible. Los tickets no pueden guardarse online.");
            setIsSaving(false);
            return;
        }
        if(isSaved || tickets.length === 0) {
            setIsSaving(false);
            return;
        };

        setIsSaving(true);
        setSaveError(null);

        try {
            const eventId = eventParams.event_id;
            const eventDocRef = doc(firestore, 'events', eventId);
            
            await runTransaction(firestore, async (transaction) => {
              const eventDoc = await transaction.get(eventDocRef);
              let newTicketCount = tickets.length;
              
              if (eventDoc.exists()) {
                const currentCount = eventDoc.data().ticketCount || 0;
                newTicketCount += currentCount;
              }

              const eventData = { 
                  eventName: eventParams.event_name,
                  dateTime: eventParams.date_time,
                  venue: eventParams.venue,
                  ticketCount: newTicketCount,
                  createdAt: serverTimestamp(),
              };

              if (eventDoc.exists()) {
                transaction.update(eventDocRef, {
                  ticketCount: newTicketCount
                });
              } else {
                transaction.set(eventDocRef, eventData);
              }

              const ticketsCollectionRef = collection(firestore, 'events', eventId, 'tickets');
              const ticketChunks = chunk(tickets, 499);
              
              for (const ticketChunk of ticketChunks) {
                  const batch = writeBatch(firestore);
                  ticketChunk.forEach((ticket) => {
                      const ticketDocRef = doc(ticketsCollectionRef, ticket.ticketId);
                      batch.set(ticketDocRef, {
                          ticketNumber: ticket.ticketNumber,
                          shortCode: ticket.shortCode,
                          redeemed: false,
                          redeemedAt: null,
                      });
                  });
                  await batch.commit();
              }
            });

            setIsSaved(true);
            toast({
                title: "Tickets guardados online",
                description: `${tickets.length} nuevos tickets han sido sincronizados con la base de datos.`,
            });
        } catch (error: any) {
            console.error("Error guardando tickets en Firestore:", error);
            let detailedError = `Falló al guardar los tickets online. Por favor, revisa tus reglas de seguridad de Firestore y tu conexión a internet.`;
            if (error.code === 'permission-denied') {
                detailedError = `Las reglas de seguridad de Firestore no permiten esta operación. Raw Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
            } else {
                detailedError += ` Error: ${error.message}`;
            }
            setSaveError(detailedError);
        } finally {
            setIsSaving(false);
        }
    };

    saveTicketsToFirestore();
  }, [firestore, tickets, eventParams, toast, isSaved, isRegeneration]);


  const handlePrint = () => {
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  };

  const handleGeneratePdf = async () => {
    setIsPrinting(true);
    toast({
        title: "Generando PDF...",
        description: "Esto puede tardar un momento para una gran cantidad de tickets."
    });

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const pageElements = document.querySelectorAll('.print-page');
    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;

    for (let i = 0; i < pageElements.length; i++) {
        const page = pageElements[i] as HTMLElement;
        
        // Temporarily make the element visible for capturing
        page.classList.remove('no-print-pdf-hide');

        const canvas = await html2canvas(page, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            logging: false,
            width: page.offsetWidth,
            height: page.offsetHeight,
        });

        // Hide it back
        page.classList.add('no-print-pdf-hide');

        const imgData = canvas.toDataURL('image/png');
        
        if (i > 0) {
            pdf.addPage();
        }
        
        pdf.addImage(imgData, 'PNG', 0, 0, A4_WIDTH, A4_HEIGHT);
    }
    
    pdf.save(`tickets-${eventParams.event_id}.pdf`);
    setIsPrinting(false);
    toast({
        title: "PDF Generado",
        description: "Tu PDF de tickets ha sido descargado.",
    });
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

    setIsGeneratingMore(true);
    toast({ title: "Generando más tickets..." });

    const result = await generateTicketsAction({
      ...eventParams,
      quantity: moreQuantity,
      starting_ticket_number: tickets.length + 1
    });
    
    if (result.success) {
        toast({
            title: "Generación Completa",
            description: `${moreQuantity} nuevos tickets han sido generados. La página se recargará ahora.`
        });
        // We reload the page to fetch the new tickets from the server
        window.location.reload();
    } else {
        toast({
            variant: "destructive",
            title: "Falló la Generación",
            description: result.error,
        });
        setIsGeneratingMore(false);
    }
  };

  const handleEditEvent = async () => {
    if (!firestore) {
        toast({ variant: 'destructive', title: "Firestore no disponible." });
        return;
    }

    setIsEditing(true);
    try {
        const eventDocRef = doc(firestore, 'events', eventParams.event_id);
        await updateDoc(eventDocRef, {
            eventName: editFormData.eventName,
            dateTime: editFormData.dateTime,
            venue: editFormData.venue,
        });

        if (onEventUpdate) {
            onEventUpdate({
                event_name: editFormData.eventName,
                date_time: editFormData.dateTime,
                venue: editFormData.venue
            });
        }
        
        toast({ title: "Evento Actualizado", description: "Los detalles del evento han sido actualizados con éxito." });
        setShowEditDialog(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Falló la Actualización", description: error.message });
    } finally {
        setIsEditing(false);
    }
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

  const ticketPages = chunk(tickets, eventParams.tickets_per_page);

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

            <Button onClick={handleGeneratePdf} disabled={isPrinting}>
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
                        disabled={!secretKey && !isRegeneration}
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
        {ticketPages.map((page, pageIndex) => (
          <div key={pageIndex} className="print-page bg-card shadow-lg rounded-lg mx-auto p-5 grid grid-cols-2 grid-rows-2 gap-0 relative w-[210mm] h-[297mm] no-print-pdf-hide">
            {/* Cutting guides */}
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-300 border-b border-dashed"></div>
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gray-300 border-r border-dashed"></div>

            {page.map((ticket) => (
              <div key={ticket.ticketId} className="flex items-center justify-center">
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
             {/* Fill empty slots on the last page */}
            {Array.from({ length: 4 - page.length }).map((_, i) => (
              <div key={`empty-${pageIndex}-${i}`}></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
