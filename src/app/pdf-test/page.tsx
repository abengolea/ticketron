
'use client';

import { Suspense, useEffect, useState, useMemo, createRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import PrivateRoute from '@/components/private-route';
import { Loader2, Printer, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { GenerationResult, EventParameters } from '@/lib/types';
import { createHmacSha256 } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildPdfFromPngsWithTemplate, captureTicketPNG, getPlanoCDRTemplate } from '@/lib/pdf-utils-experimental';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { TicketCard } from '@/components/ticket-card';


const layoutSchema = z.object({
  scale: z.coerce.number().min(1).max(5).default(3),
  quantity: z.coerce.number().int().positive().max(50).default(20),
});

type LayoutFormValues = z.infer<typeof layoutSchema>;

function PDFTestPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const ticketRefs = useMemo(() => Array.from({ length: 50 }, () => createRef<HTMLDivElement>()), []);

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutSchema),
    defaultValues: {
      scale: 3,
      quantity: 20,
    },
  });

  useEffect(() => {
    async function fetchEventData() {
      if (!firestore || !eventId) {
        setError('ID de evento no encontrado en la URL.');
        setLoading(false);
        return;
      }
      try {
        const eventRef = doc(firestore, 'events', eventId);
        const eventSnap = await getDoc(eventRef);
        if (!eventSnap.exists()) throw new Error('Evento no encontrado.');
        const eventData = eventSnap.data();

        const secretRef = doc(firestore, 'event_secrets', eventId);
        const secretSnap = await getDoc(secretRef);
        if (!secretSnap.exists()) throw new Error('Clave secreta no encontrada.');
        const { secretKey } = secretSnap.data();

        const ticketsRef = collection(firestore, 'events', eventId, 'tickets');
        const ticketsSnap = await getDocs(ticketsRef);

        const ticketsPromises = ticketsSnap.docs.map(async (docSnap) => {
          const ticketDocData = docSnap.data();
          const version = 1;
          const payloadToSign = `${eventId}|${docSnap.id}|${version}`;
          const sig = await createHmacSha256(secretKey, payloadToSign);
          const qrPayload = JSON.stringify({ v: version, eid: eventId, tid: docSnap.id, sig });
          return {
            ticketNumber: ticketDocData.ticketNumber,
            ticketId: docSnap.id,
            qrPayload: qrPayload,
            shortCode: ticketDocData.shortCode,
          };
        });

        const tickets = await Promise.all(ticketsPromises);
        tickets.sort((a, b) => a.ticketNumber - b.ticketNumber);

        const eventParams: EventParameters = {
            event_name: eventData.eventName,
            event_id: eventId,
            date_time: eventData.dateTime,
            venue: eventData.venue,
            quantity: eventData.ticketCount,
            tickets_per_page: 3,
            page_size: 'A4',
        };

        setGenerationResult({
          tickets,
          eventParams,
          secretKey,
        });

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchEventData();
  }, [firestore, eventId]);

  const handleGeneratePdf = async (values: LayoutFormValues) => {
    if (!generationResult) return;

    setIsGenerating(true);
    toast({ title: "Iniciando generación de PDF...", description: "Capturando imágenes de los tickets, por favor espera." });

    const ticketsToRender = generationResult.tickets.slice(0, values.quantity);
    
    try {
        const images: string[] = [];
        for (let i = 0; i < ticketsToRender.length; i++) {
          const ref = ticketRefs[i];
          if (!ref?.current) continue;
          
          const png = await captureTicketPNG(ref.current, values.scale);
          images.push(png);
        }
      
        await new Promise(r => setTimeout(r, 150));

        const fileName = `TEST_IMPRENTA_${generationResult.eventParams.event_id}_${values.quantity}_tickets.pdf`;

        await buildPdfFromPngsWithTemplate(images, fileName, getPlanoCDRTemplate());

      toast({ title: "PDF de prueba de imprenta generado", description: "La descarga debería comenzar en breve." });
    } catch (e: any) {
      console.error("Fallo la generacion del PDF:", e);
      toast({ title: "Error de PDF", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center my-8">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Cargando datos del evento...</p>
      </div>
    );
  }

  if (error) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  if (!generationResult) {
    return <Alert>No se encontraron datos de generación.</Alert>;
  }
  
  const quantity = form.watch('quantity');
  const template = getPlanoCDRTemplate();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-headline text-primary">Test de Impresión de Alta Precisión</h1>
        <p className="text-muted-foreground mt-2">
          Esta página utiliza una plantilla de coordenadas fijas para generar un PDF listo para imprenta.
        </p>
      </div>
      
      <div className="grid md:grid-cols-3 gap-8 items-start">
        <Card className="md:col-span-1 sticky top-20">
          <CardHeader>
            <CardTitle className='flex items-center gap-2'><Settings /> Parámetros de Prueba</CardTitle>
            <CardDescription>Ajusta la cantidad de tickets y la calidad de la captura.</CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleGeneratePdf)}>
              <CardContent className="space-y-4 pr-4">
                  <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                           <FormItem>
                              <Label>Tickets a Generar en la Prueba</Label>
                              <Input type="number" {...field} />
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField
                        control={form.control}
                        name="scale"
                        render={({ field }) => (
                           <FormItem>
                              <Label>Escala de Captura (Calidad)</Label>
                              <Input type="number" step="0.1" {...field} />
                              <FormDescription>Un valor más alto (ej: 3) genera imágenes más nítidas para impresión.</FormDescription>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </div>
                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">Plantilla de Imprenta Activa</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 font-mono">
                      <p>Formato: {template.page.format.toUpperCase()} {template.page.orientation}</p>
                      <p>Tickets por Hoja: {template.slots.length}</p>
                      <p>Dimensiones Ticket: {template.slots[0].w}mm x {template.slots[0].h}mm</p>
                    </CardContent>
                  </Card>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Generar PDF de Prueba ({quantity} tickets)
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        <div className="md:col-span-2 space-y-4">
             <Alert>
                <AlertTitle>Previsualización de Tickets</AlertTitle>
                <AlertDescription>
                    Mostrando los primeros {quantity} tickets que se usarán para generar el PDF de prueba.
                </AlertDescription>
            </Alert>
            {generationResult.tickets.slice(0, quantity).map((ticket, i) => (
                <div key={ticket.ticketId} ref={ticketRefs[i]} className="ticket-print mb-4 flex justify-center">
                    <TicketCard
                        eventName={generationResult.eventParams.event_name}
                        dateTime={generationResult.eventParams.date_time}
                        venue={generationResult.eventParams.venue}
                        ticketNumber={ticket.ticketNumber}
                        qrPayload={ticket.qrPayload}
                        shortCode={ticket.shortCode}
                    />
                </div>
            ))}
        </div>

      </div>
    </div>
  );
}


export default function PDFTestWrapper() {
  return (
    <PrivateRoute>
      <Suspense fallback={<Loader2 className="mx-auto my-12 h-10 w-10 animate-spin" />}>
        <PDFTestPage />
      </Suspense>
    </PrivateRoute>
  )
}

    