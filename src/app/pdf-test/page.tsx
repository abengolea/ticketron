
'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import PrivateRoute from '@/components/private-route';
import { Loader2, Printer, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { GenerationResult, EventParameters, TicketData } from '@/lib/types';
import { createHmacSha256 } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TicketPreview } from '@/components/ticket-preview';
import { buildPdfFromPngs as buildPdfExperimental, captureTicketPNG } from '@/lib/pdf-utils-experimental';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';


const layoutSchema = z.object({
  pageFormat: z.enum(['a4', 'letter']).default('a4'),
  pageOrientation: z.enum(['portrait', 'landscape']).default('portrait'),
  marginLeft: z.coerce.number().default(15),
  marginRight: z.coerce.number().default(15),
  marginTop: z.coerce.number().default(20),
  marginBottom: z.coerce.number().default(20),
  ticketWidth: z.coerce.number().default(180),
  ticketHeight: z.coerce.number().default(65),
  rows: z.coerce.number().int().positive().default(3),
  cols: zcoerce.number().int().positive().default(1),
  gutterX: z.coerce.number().default(0),
  gutterY: z.coerce.number().default(14.5),
  cropMarks: z.boolean().default(false),
  scale: z.coerce.number().min(1).max(5).default(3),
  quantity: z.coerce.number().int().positive().max(50).default(20),
});

type LayoutFormValues = z.infer<typeof layoutSchema>;

function PDFTestPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const ticketRefs = useMemo(() => Array.from({ length: 50 }, () => React.createRef<HTMLDivElement>()), []);

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutSchema),
    defaultValues: {
      pageFormat: 'a4',
      pageOrientation: 'portrait',
      marginLeft: 15,
      marginRight: 15,
      marginTop: 20,
      marginBottom: 20,
      ticketWidth: 180,
      ticketHeight: 65,
      rows: 3,
      cols: 1,
      gutterX: 0,
      gutterY: 14.5,
      cropMarks: false,
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

        const fileName = `TEST_${generationResult.eventParams.event_id}_${values.quantity}_tickets.pdf`;

        await buildPdfExperimental(images, fileName, {
            ...values
        });

      toast({ title: "PDF de prueba generado", description: "La descarga debería comenzar en breve." });
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

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-headline text-primary">Test de Impresión PDF</h1>
        <p className="text-muted-foreground mt-2">
          Ajusta los parámetros de imprenta y genera un PDF de prueba para el evento: {generationResult.eventParams.event_name}
        </p>
      </div>
      
      <div className="grid md:grid-cols-3 gap-8 items-start">
        <Card className="md:col-span-1 sticky top-20">
          <CardHeader>
            <CardTitle className='flex items-center gap-2'><Settings /> Parámetros de Impresión</CardTitle>
            <CardDescription>Modifica estos valores para ajustar el layout del PDF final.</CardDescription>
          </CardHeader>
          <form onSubmit={form.handleSubmit(handleGeneratePdf)}>
            <CardContent className="space-y-4 max-h-[65vh] overflow-y-auto pr-4">
                <div className='grid grid-cols-2 gap-4'>
                    <Controller name="pageFormat" control={form.control} render={({ field }) => (
                         <FormItem>
                            <Label>Formato Página</Label>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="a4">A4</SelectItem><SelectItem value="letter">Letter</SelectItem></SelectContent>
                            </Select>
                        </FormItem>
                    )} />
                     <Controller name="pageOrientation" control={form.control} render={({ field }) => (
                         <FormItem>
                            <Label>Orientación</Label>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="portrait">Vertical</SelectItem><SelectItem value="landscape">Horizontal</SelectItem></SelectContent>
                            </Select>
                        </FormItem>
                    )} />
                </div>
                <Label>Márgenes (mm)</Label>
                <div className='grid grid-cols-2 lg:grid-cols-4 gap-2'>
                    <FormItem><Input type="number" placeholder='Sup.' {...form.register('marginTop')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Inf.' {...form.register('marginBottom')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Izq.' {...form.register('marginLeft')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Der.' {...form.register('marginRight')} /></FormItem>
                </div>
                 <Label>Dimensiones Ticket (mm)</Label>
                <div className='grid grid-cols-2 gap-2'>
                    <FormItem><Input type="number" placeholder='Ancho' {...form.register('ticketWidth')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Alto' {...form.register('ticketHeight')} /></FormItem>
                </div>
                <Label>Grilla y Espaciado (mm)</Label>
                <div className='grid grid-cols-2 lg:grid-cols-4 gap-2'>
                    <FormItem><Input type="number" placeholder='Filas' {...form.register('rows')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Cols' {...form.register('cols')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Gutter X' {...form.register('gutterX')} /></FormItem>
                    <FormItem><Input type="number" placeholder='Gutter Y' {...form.register('gutterY')} /></FormItem>
                </div>
                <Label>Opciones de Renderizado</Label>
                 <div className='grid grid-cols-2 gap-4'>
                    <FormItem>
                        <Label>Escala Captura</Label>
                        <Input type="number" step="0.1" {...form.register('scale')} />
                    </FormItem>
                     <FormItem>
                        <Label>Tickets a Generar</Label>
                        <Input type="number" {...form.register('quantity')} />
                    </FormItem>
                </div>
                 <Controller name="cropMarks" control={form.control} render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        <Label className='font-normal'>Incluir Marcas de Corte</Label>
                    </FormItem>
                )} />

            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                Generar PDF de Prueba ({quantity} tickets)
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <div className="md:col-span-2 space-y-4">
             <Alert>
                <AlertTitle>Previsualización</AlertTitle>
                <AlertDescription>
                    Mostrando los primeros {quantity} tickets para la captura. El PDF final usará los parámetros del panel.
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
