
"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from 'next/navigation'
import { useFirestore, useUser } from "@/firebase";
import { doc, getDoc, collection, getDocs, writeBatch, query, where, serverTimestamp, updateDoc, increment } from "firebase/firestore";
import { TicketPreview } from "@/components/ticket-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, PlusCircle, MinusCircle, Ticket, Activity, CheckCheck, XCircle } from "lucide-react";
import type { GenerationResult, EventParameters, TicketData, TicketStatus } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { base32Encode, createHmacSha256 } from "@/lib/utils";

type EventData = {
  eventName: string;
  dateTime: string;
  venue: string;
  ticketCount: number;
  ownerId: string;
};

type TicketDoc = {
    id: string;
    ticketNumber: number;
    shortCode: string;
    status: TicketStatus;
    redeemedAt: any;
}

type EventStats = {
  total: number;
  active: number;
  redeemed: number;
  voided: number;
};

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // States for new forms
  const [moreTickets, setMoreTickets] = useState('');
  const [voidStart, setVoidStart] = useState('');
  const [voidEnd, setVoidEnd] = useState('');

  const fetchEventDetails = useMemo(() => async () => {
    if (!firestore || !eventId) {
        if (!eventId) setError("Falta el ID del evento.");
        if (!firestore) setError("La conexión a Firestore no está disponible.");
        setLoading(false);
        return;
    };
    
    setLoading(true);
    try {
      const eventRef = doc(firestore, 'events', eventId);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) {
        throw new Error("Evento no encontrado.");
      }
      
      const eventData = eventSnap.data() as EventData;

      const ticketsRef = collection(firestore, 'events', eventId, 'tickets');
      const ticketsSnap = await getDocs(ticketsRef);

      const eventStats: EventStats = { total: 0, active: 0, redeemed: 0, voided: 0 };
      
      const tickets: TicketData[] = ticketsSnap.docs.map(docSnap => {
          const ticketDocData = docSnap.data() as TicketDoc;

          // Update stats
          eventStats.total++;
          if (ticketDocData.status === 'redeemed') eventStats.redeemed++;
          else if (ticketDocData.status === 'voided') eventStats.voided++;
          else eventStats.active++;

          const qrPayload = JSON.stringify({
              v: 1,
              eid: eventId,
              tid: docSnap.id,
              sig: 'REGENERADO_-FALLARA_EN_VALIDACION_OFFLINE'
          });

          return {
              ticketNumber: ticketDocData.ticketNumber,
              ticketId: docSnap.id,
              qrPayload: qrPayload,
              shortCode: ticketDocData.shortCode
          }
      });
      
      tickets.sort((a,b) => a.ticketNumber - b.ticketNumber);
      setStats(eventStats);

      const eventParams: EventParameters = {
          event_name: eventData.eventName,
          event_id: eventId,
          date_time: eventData.dateTime,
          venue: eventData.venue,
          quantity: eventData.ticketCount,
          tickets_per_page: 4, 
          page_size: 'A4'
      };
      
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
  }, [firestore, eventId]);

  useEffect(() => {
    fetchEventDetails();
  }, [fetchEventDetails]);

  const handleGenerateMore = async () => {
    if (!firestore || !user || !generationResult) return;
    const quantity = parseInt(moreTickets, 10);
    if (isNaN(quantity) || quantity <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, introduce una cantidad válida.' });
      return;
    }

    setIsProcessing(true);
    try {
      const secretRef = doc(firestore, 'event_secrets', eventId);
      const secretSnap = await getDoc(secretRef);
      if (!secretSnap.exists()) throw new Error("No se encontró la clave secreta para este evento.");
      const { secretKey } = secretSnap.data();

      const currentTicketCount = generationResult.eventParams.quantity;
      const batch = writeBatch(firestore);
      const ticketsCollectionRef = collection(firestore, 'events', eventId, 'tickets');

      for (let i = 0; i < quantity; i++) {
        const ticketNumber = currentTicketCount + i + 1;
        const ticketId = crypto.randomUUID();
        const payloadToSign = `${eventId}|${ticketId}|1`;
        const sig = await createHmacSha256(secretKey, payloadToSign);
        
        const ticketData = {
          ownerId: user.uid,
          ticketNumber,
          shortCode: base32Encode(Buffer.from(new TextEncoder().encode(ticketId.substring(0, 8) + sig.substring(0, 4)))).substring(0, 7),
          status: 'active',
          redeemedAt: null,
        };
        const ticketDocRef = doc(ticketsCollectionRef, ticketId);
        batch.set(ticketDocRef, ticketData);
      }
      
      const eventRef = doc(firestore, 'events', eventId);
      batch.update(eventRef, { ticketCount: increment(quantity) });
      
      await batch.commit();

      toast({ title: 'Éxito', description: `${quantity} nuevos tickets generados.` });
      setMoreTickets('');
      await fetchEventDetails(); // Refresh data
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error al generar tickets', description: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoidTickets = async () => {
    if (!firestore) return;
    const start = parseInt(voidStart, 10);
    const end = parseInt(voidEnd, 10);

    if (isNaN(start) || isNaN(end) || start <= 0 || end < start) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, introduce un rango de tickets válido.' });
      return;
    }

    setIsProcessing(true);
    try {
      const ticketsRef = collection(firestore, 'events', eventId, 'tickets');
      const q = query(ticketsRef, where("ticketNumber", ">=", start), where("ticketNumber", "<=", end));
      
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        throw new Error("No se encontraron tickets en el rango especificado.");
      }

      const batch = writeBatch(firestore);
      querySnapshot.forEach(ticketDoc => {
        batch.update(ticketDoc.ref, { status: 'voided', voidedReason: 'Anulado por el administrador.' });
      });

      await batch.commit();
      
      toast({ title: 'Éxito', description: `Tickets del ${start} al ${end} han sido anulados.` });
      setVoidStart('');
      setVoidEnd('');
      await fetchEventDetails(); // Refresh data

    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error al anular tickets', description: e.message });
    } finally {
      setIsProcessing(false);
    }
  };


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
              Cargando detalles del evento y tickets...
            </p>
          </div>
        </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto">
        <AlertTitle>Error al Cargar el Evento</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (generationResult) {
    return (
      <>
        {stats && (
            <div className="mb-8 no-print">
                <h2 className="text-2xl font-headline mb-4">Dashboard del Evento</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total de Tickets</CardTitle>
                            <Ticket className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Activos (Sin canjear)</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.active}</div></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Canjeados</CardTitle>
                            <CheckCheck className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.redeemed}</div></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Anulados</CardTitle>
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.voided}</div></CardContent>
                    </Card>
                </div>
            </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 mb-8 no-print">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlusCircle /> Generar Más Tickets</CardTitle>
              <CardDescription>Añade más tickets a este evento. Se continuará la numeración existente.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="more-tickets">Cantidad a Generar</Label>
                <Input 
                  id="more-tickets" 
                  type="number" 
                  placeholder="Ej: 50"
                  value={moreTickets}
                  onChange={(e) => setMoreTickets(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleGenerateMore} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generar
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MinusCircle /> Anular Tickets</CardTitle>
              <CardDescription>Anula un rango de tickets por su número.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <div className="space-y-2 flex-1">
                <Label htmlFor="void-start">Nº Desde</Label>
                <Input 
                  id="void-start" 
                  type="number" 
                  placeholder="Ej: 1"
                  value={voidStart}
                  onChange={(e) => setVoidStart(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label htmlFor="void-end">Nº Hasta</Label>
                <Input 
                  id="void-end" 
                  type="number" 
                  placeholder="Ej: 10"
                  value={voidEnd}
                  onChange={(e) => setVoidEnd(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleVoidTickets} variant="destructive" disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Anular Tickets
              </Button>
            </CardFooter>
          </Card>
        </div>
        <TicketPreview result={generationResult} isRegeneration={true} onEventUpdate={handleEventUpdate} />
      </>
    )
  }

  return null;
}

    