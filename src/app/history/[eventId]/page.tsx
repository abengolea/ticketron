"use client";

import { useEffect, useState } from "react";
import { useParams } from 'next/navigation'
import { useFirestore } from "@/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { TicketPreview } from "@/components/ticket-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import type { GenerationResult, EventParameters, TicketData } from "@/lib/types";

type EventData = {
  eventName: string;
  dateTime: string;
  venue: string;
  ticketCount: number;
};

type TicketDoc = {
    id: string;
    ticketNumber: number;
    shortCode: string;
    redeemed: boolean;
    redeemedAt: any;
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const firestore = useFirestore();
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !eventId) {
        if (!eventId) setError("Event ID is missing.");
        if (!firestore) setError("Firestore connection not available.");
        setLoading(false);
        return;
    };

    const fetchEventDetails = async () => {
      setLoading(true);
      try {
        const eventRef = doc(firestore, 'events', eventId);
        const eventSnap = await getDoc(eventRef);

        if (!eventSnap.exists()) {
          throw new Error("Event not found.");
        }
        
        const eventData = eventSnap.data() as EventData;

        const ticketsRef = collection(firestore, 'events', eventId, 'tickets');
        const ticketsSnap = await getDocs(ticketsRef);
        
        const tickets: TicketData[] = ticketsSnap.docs.map(docSnap => {
            const ticketDocData = docSnap.data() as TicketDoc;
            // Reconstruct the QR payload. Note that the signature is missing.
            // QR codes from this view will only work with the Online validator.
            const qrPayload = JSON.stringify({
                v: 1,
                eid: eventId,
                tid: docSnap.id,
                sig: 'REGENERATED_-WILL_FAIL_OFFLINE_VALIDATION'
            });

            return {
                ticketNumber: ticketDocData.ticketNumber,
                ticketId: docSnap.id,
                qrPayload: qrPayload,
                shortCode: ticketDocData.shortCode
            }
        });
        
        // Sort tickets by ticket number
        tickets.sort((a,b) => a.ticketNumber - b.ticketNumber);

        const eventParams: EventParameters = {
            event_name: eventData.eventName,
            event_id: eventId,
            date_time: eventData.dateTime,
            venue: eventData.venue,
            quantity: eventData.ticketCount,
            tickets_per_page: 4, // This is a fixed value in our app
            page_size: 'A4' // Assume A4 for regeneration, or store it in event doc
        };
        
        // Note: secretKey is not stored, so it will be an empty string.
        // This means offline validation assets cannot be recreated from this view.
        setGenerationResult({
            tickets,
            eventParams,
            secretKey: "" 
        });

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEventDetails();
  }, [firestore, eventId]);

  const handleEventUpdate = (updatedParams: Partial<EventParameters>) => {
    setGenerationResult(prev => {
        if (!prev) return null;
        return {
            ...prev,
            eventParams: {
                ...prev.eventParams,
                ...updatedParams
            }
        }
    });
  }

  if (loading) {
    return (
        <div className="flex justify-center items-center my-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Loading event details and tickets...
            </p>
          </div>
        </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto">
        <AlertTitle>Error Loading Event</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (generationResult) {
    return <TicketPreview result={generationResult} isRegeneration={true} onEventUpdate={handleEventUpdate} />;
  }

  return null;
}
