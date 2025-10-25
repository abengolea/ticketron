"use client";

import type { GenerationResult } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { downloadFile } from "@/lib/utils";
import { Download, Printer, ArrowLeft } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type TicketPreviewProps = {
  result: GenerationResult;
};

// Helper to chunk array
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

export function TicketPreview({ result }: TicketPreviewProps) {
  const { tickets, secretKey, eventParams } = result;

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

## 1. Important: Secure your Secret Key

The file \`secret_key.txt\` is critical for validating tickets. **DO NOT SHARE IT PUBLICLY.** Keep it safe. You will need it for the validation process.

## 2. Offline Validation Method (Recommended)

Use the web validator tool provided with this application.

1. Go to the "Validator" page in the application.
2. Copy the content of \`secret_key.txt\` and paste it into the "Secret Key" field on the validator page.
3. Use a QR code scanner (like your phone's camera app or a USB scanner) to scan the ticket's QR code.
4. Copy the text from the QR code and paste it into the "QR Code Payload" field.
5. Click "Validate Ticket". The tool will tell you if the ticket is VALID, INVALID, or has ALREADY BEEN REDEEMED.
6. The validator will keep track of redeemed tickets in your browser's local storage for the duration of your session.

## 3. Manual Validation (Backup Method)

If the scanner or validator tool fails, you can use the \`tickets.csv\` file for manual lookup.

1. Open \`tickets.csv\` in a spreadsheet program (like Excel, Google Sheets, or Numbers).
2. Ask the guest for their ticket number (e.g., #0042) or the 7-character verification code.
3. Use the spreadsheet's search or filter function to find the corresponding row.
4. Manually mark the ticket as redeemed in your spreadsheet. This method does not have cryptographic verification, so it should only be used as a last resort.
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
