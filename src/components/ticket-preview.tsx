"use client";

import type { GenerationResult } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { downloadFile } from "@/lib/utils";
import { Download, Printer, ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useFirestore } from "@/firebase";
import { collection, writeBatch, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";


// Helper to chunk array
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

export function TicketPreview({ result }: { result: GenerationResult }) {
  const { tickets, secretKey, eventParams } = result;
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
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
        const ticketsCollectionRef = collection(firestore, 'events', eventId, 'tickets');

        // Firestore limits batches to 500 operations.
        const ticketChunks = chunk(tickets, 499);

        // First, set the event details in a separate operation or its own batch
        const eventBatch = writeBatch(firestore);
        eventBatch.set(eventDocRef, { 
            eventName: eventParams.event_name,
            dateTime: eventParams.date_time,
            venue: eventParams.venue,
            createdAt: new Date(),
        }, { merge: true });
        await eventBatch.commit();

        // Then, process tickets in batches
        for (const ticketChunk of ticketChunks) {
            const ticketBatch = writeBatch(firestore);
            ticketChunk.forEach((ticket) => {
              const ticketDocRef = doc(ticketsCollectionRef, ticket.ticketId);
              ticketBatch.set(ticketDocRef, {
                ticketNumber: ticket.ticketNumber,
                shortCode: ticket.shortCode,
                redeemed: false,
                redeemedAt: null,
              });
            });
            await ticketBatch.commit();
        }

        setIsSaved(true);
        toast({
          title: "Tickets saved online",
          description: `${tickets.length} tickets have been synced with the database.`,
        });
      } catch (error: any) {
        console.error("Error saving tickets to Firestore:", error);
        let detailedError = `Failed to save tickets online. Please check your Firestore security rules and internet connection.`;
        if (error.code === 'permission-denied') {
            const customData = (error as { customData?: { _operation?: string; _path?: { segments: string[] } } }).customData;
            const operation = customData?._operation || "unknown";
            const path = customData?._path?.segments.join('/') || "unknown";
            detailedError = `Firestore Security Rules do not allow this operation. [OPERATION: ${operation}, PATH: ${path}]`;
        } else {
            detailedError += ` Error: ${error.message}`;
        }
        setSaveError(detailedError);
      } finally {
        setIsSaving(false);
      }
    };

    saveTicketsToFirestore();
  }, [firestore, tickets, eventParams, toast, isSaved]);


  const handleDownloadSecret = () => {
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
          <h2 className="text-2xl font-headline">Generation Complete!</h2>
          <p className="text-muted-foreground">{tickets.length} tickets generated successfully.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Start Over
            </Button>
            <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print All Tickets
            </Button>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="secondary" size="icon" onClick={() => {
                            handleDownloadSecret();
                            handleDownloadCsv();
                            handleDownloadJson();
                            handleDownloadReadme();
                        }}>
                            <Download />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Download all assets (.txt, .csv, .json, .md)</p>
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
        {isSaved && (
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
          <div key={pageIndex} className="print-page bg-card shadow-lg rounded-lg mx-auto p-5 grid grid-cols-2 grid-rows-2 gap-0 relative w-[210mm] h-[297mm]">
            {/* Cutting guides */}
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-300 border-b border-dashed"></div>
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gray-300 border-r border-dashed"></div>

            {page.map((ticket) => (
              <div key={ticket.ticketNumber} className="flex items-center justify-center">
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
              <div key={`empty-${i}`}></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

    