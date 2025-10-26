

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
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
            setSaveError("Firestore is not available. Tickets cannot be saved online.");
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
                title: "Tickets saved online",
                description: `${tickets.length} new tickets have been synced with the database.`,
            });
        } catch (error: any) {
            console.error("Error saving tickets to Firestore:", error);
             let detailedError = `Failed to save tickets online. Please check your Firestore security rules and internet connection.`;
            if (error.code === 'permission-denied') {
                 detailedError = `Firestore Security Rules do not allow this operation. Raw Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
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
        title: "Generating PDF...",
        description: "This may take a moment for a large number of tickets."
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
        title: "PDF Generated",
        description: "Your ticket PDF has been downloaded.",
    });
  };

  const handleGenerateMore = async () => {
    if (!moreQuantity || moreQuantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Quantity",
        description: "Please enter a positive number of tickets to generate.",
      });
      return;
    }

    setIsGeneratingMore(true);
    toast({ title: "Generating more tickets..." });

    const result = await generateTicketsAction({
      ...eventParams,
      quantity: moreQuantity,
    });
    
    if (result.success) {
        toast({
            title: "Generation Complete",
            description: `${moreQuantity} new tickets have been generated. The page will now reload.`
        });
        // We reload the page to fetch the new tickets from the server
        window.location.reload();
    } else {
        toast({
            variant: "destructive",
            title: "Generation Failed",
            description: result.error,
        });
        setIsGeneratingMore(false);
    }
  };

  const handleEditEvent = async () => {
    if (!firestore) {
        toast({ variant: 'destructive', title: "Firestore not available." });
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
        
        toast({ title: "Event Updated", description: "Event details have been successfully updated." });
        setShowEditDialog(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Update Failed", description: error.message });
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
        toast({variant: 'destructive', title: 'Cannot download secret', description: 'The secret key is not available for past events.'})
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
# Ticket Validation Instructions

## 1. Online Validation (Recommended)

Use the "Validator" page in this application. It requires an internet connection.

1. Go to the "Validator" page.
2. Click "Scan QR" and use your device's camera to scan the ticket's QR code.
3. The tool will check the ticket against the online database and show if it's VALID, INVALID, or has ALREADY BEEN REDEEMED.

## 2. Offline Validation (Backup Method)

If you don't have internet at the venue, you can use the offline validator. This requires sharing the secret key with the validation staff.

1.  Download the validation assets using the Download button. You will get a \`secret_key.txt\` file.
2.  **DO NOT SHARE THE SECRET KEY PUBLICLY.**
3.  On the "Validator" page, paste the content of \`secret_key.txt\` into the "Secret Key" field.
4.  Scan a QR code or paste its content. The tool will cryptographically verify the ticket.
5.  Note: The offline validator keeps a list of redeemed tickets ONLY on that specific device. It does not sync with other devices.

## 3. Manual Validation (Last Resort)

Use the \`tickets.csv\` file for manual lookup if all else fails.

1. Open \`tickets.csv\` in a spreadsheet program.
2. Find the ticket by its number or verification code.
3. Manually mark it as redeemed. This method has no security verification.
    `;
    downloadFile("README_VALIDACION.md", readmeContent.trim(), "text/markdown");
  };


  const ticketPages = chunk(tickets, eventParams.tickets_per_page);

  return (
    <div className="w-full">
      <div className="bg-card/80 backdrop-blur-sm border rounded-lg p-4 mb-8 flex flex-wrap justify-between items-center gap-4 sticky top-[70px] z-40 no-print">
        <div>
          <h2 className="text-2xl font-headline">{isRegeneration ? 'Event Details' : 'Generation Complete!'}</h2>
          <p className="text-muted-foreground">{isRegeneration ? `Viewing ${tickets.length} tickets for ${eventParams.event_name}` : `${tickets.length} tickets generated successfully.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.location.href = isRegeneration ? '/history' : '/'}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {isRegeneration ? 'Back to History' : 'Start Over'}
            </Button>
             
            {isRegeneration && (
              <>
                {/* Edit Event Dialog */}
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Pencil className="mr-2 h-4 w-4" /> Edit Event
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Event Details</DialogTitle>
                            <DialogDescription>
                                Modify the event information. These changes will be reflected on the printed tickets.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="eventName" className="text-right">Event Name</Label>
                                <Input id="eventName" value={editFormData.eventName} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="dateTime" className="text-right">Date & Time</Label>
                                <Input id="dateTime" value={editFormData.dateTime} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="venue" className="text-right">Venue</Label>
                                <Input id="venue" value={editFormData.venue} onChange={handleEditFormChange} className="col-span-3" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setShowEditDialog(false)} disabled={isEditing}>Cancel</Button>
                            <Button type="button" onClick={handleEditEvent} disabled={isEditing}>
                                {isEditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Generate More Tickets Dialog */}
                <Dialog open={showGenerateMoreDialog} onOpenChange={setShowGenerateMoreDialog}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Generate More
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                        <DialogTitle>Generate More Tickets</DialogTitle>
                        <DialogDescription>
                            How many additional tickets would you like to generate for "{eventParams.event_name}"?
                        </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">
                            Quantity
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
                            <Button type="button" variant="secondary" onClick={() => setShowGenerateMoreDialog(false)} disabled={isGeneratingMore}>Cancel</Button>
                            <Button type="submit" onClick={handleGenerateMore} disabled={isGeneratingMore}>
                                {isGeneratingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Generate
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
              </>
            )}

            <Button onClick={handleGeneratePdf} disabled={isPrinting}>
                {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                {isPrinting ? 'Generating...' : 'Download PDF'}
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
                        {secretKey ? <p>Download all assets (.txt, .csv, .json, .md)</p> : <p>Download CSV of tickets</p>}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

        </div>
      </div>

        {isSaving && (
            <Alert className="mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Saving tickets...</AlertTitle>
                <AlertDescription>
                    Syncing generated tickets to the online database. Please wait.
                </AlertDescription>
            </Alert>
        )}
        {isSaved && !isRegeneration && (
             <Alert variant="default" className="mb-4 bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Sync Complete</AlertTitle>
                <AlertDescription>
                    All tickets have been saved to the online database.
                </AlertDescription>
            </Alert>
        )}
        {saveError && (
            <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Online Sync Failed</AlertTitle>
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

