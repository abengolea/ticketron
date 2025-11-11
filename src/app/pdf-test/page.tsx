
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
import { buildPdfFromPngsWithTemplate, captureTicketPNG, getPlanoCDRTemplate, getImprentaBTemplate } from '@/lib/pdf-utils-experimental';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription } from '@/components/ui/form';
import { TicketCardPrint } from '@/components/ticket-card-print';


const layoutSchema = z.object({
  ppi: z.coerce.number().min(150).max(600).default(300),
  quantity: z.coerce.number().int().positive().max(50).default(3),
});

type LayoutFormValues = z.infer<typeof layoutSchema>;

function PDFTestPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingA, setIsGeneratingA] = useState(false);
  const [isGeneratingB, setIsGeneratingB] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  
  const formA = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutSchema),
    defaultValues: { ppi: 300, quantity: 3 },
  });
  
  const formB = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutSchema),
    defaultValues: { ppi: 300, quantity: 8 },
  });

  const quantityA = formA.watch('quantity');
  const quantityB = formB.watch('quantity');
  
  const ticketRefsA = useMemo(() => Array.from({ length: quantityA }, () => createRef<HTMLDivElement>()), [quantityA]);
  const ticketRefsB = useMemo(() => Array.from({ length: quantityB }, () => createRef<HTMLDivElement>()), [quantityB]);


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

  const handleGeneratePdf = async (values: LayoutFormValues, template: 'A' | 'B') => {
    if (!generationResult) return;
    
    const isTemplateB = template === 'B';
    const currentRefs = isTemplateB ? ticketRefsB : ticketRefsA;
    const setGenerating = isTemplateB ? setIsGeneratingB : setIsGeneratingA;
    const imprenta = isTemplateB ? 'B' : 'A';
    
    setGenerating(true);
    toast({ title: `Iniciando generación de PDF (Imprenta ${imprenta})...`, description: "Capturando imágenes de los tickets, por favor espera." });

    const ticketsToRender = generationResult.tickets.slice(0, values.quantity);
    
    try {
        const pdfTemplate = isTemplateB ? getImprentaBTemplate() : getPlanoCDRTemplate();
        const slotSize = { w: pdfTemplate.slots[0].w, h: pdfTemplate.slots[0].h };

        const images: string[] = [];
        for (let i = 0; i < ticketsToRender.length; i++) {
          const ref = currentRefs[i];
          if (!ref?.current) {
            console.warn(`Ref para el ticket ${i} no encontrada. Saltando.`);
            continue;
          }
          
          const png = await captureTicketPNG(ref.current, slotSize, values.ppi);
          images.push(png);
          
          if ((i + 1) % 8 === 0) await new Promise(r => setTimeout(r, 40)); // Pausa para no congelar UI
        }
      
        await new Promise(r => setTimeout(r, 150));

        const fileName = `TEST_IMPRENTA_${imprenta}_${generationResult.eventParams.event_id}_${values.quantity}_tickets.pdf`;

        await buildPdfFromPngsWithTemplate(images, fileName, pdfTemplate);

      toast({ title: `PDF de prueba (Imprenta ${imprenta}) generado`, description: "La descarga debería comenzar en breve." });
    } catch (e: any) {
      console.error(`Fallo la generacion del PDF para Imprenta ${imprenta}:`, e);
      toast({ title: `Error de PDF (Imprenta ${imprenta})`, description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
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
  
  const templateA = getPlanoCDRTemplate();
  const templateB = getImprentaBTemplate();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-headline text-primary">Test de Impresión de Alta Precisión</h1>
        <p className="text-muted-foreground mt-2">
          Esta página utiliza plantillas de coordenadas fijas para generar PDFs listos para imprenta.
        </p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Panel Imprenta A */}
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle className='flex items-center gap-2'><Settings /> Parámetros de Prueba (Imprenta A)</CardTitle>
            <CardDescription>Genera un PDF con 3 tickets por hoja A4 vertical.</CardDescription>
          </CardHeader>
          <Form {...formA}>
            <form onSubmit={formA.handleSubmit((values) => handleGeneratePdf(values, 'A'))}>
              <CardContent className="space-y-4 pr-4">
                  <FormField control={formA.control} name="quantity" render={({ field }) => ( <FormItem> <Label>Tickets a Generar</Label> <Input type="number" {...field} /> <FormMessage /> </FormItem> )}/>
                  <FormField control={formA.control} name="ppi" render={({ field }) => ( <FormItem> <Label>Resolución (PPI)</Label> <Input type="number" step="50" {...field} /> <FormDescription>300 PPI es estándar para impresión. Sube para más nitidez.</FormDescription> <FormMessage /> </FormItem> )}/>
                  <Card className="bg-muted/50"><CardHeader><CardTitle className="text-base">Plantilla Activa</CardTitle></CardHeader><CardContent className="text-xs space-y-2 font-mono">
                      <p>Formato: {templateA.page.format.toUpperCase()} {templateA.page.orientation}</p>
                      <p>Tickets por Hoja: {templateA.slots.length}</p>
                      <p>Dimensiones Ticket: {templateA.slots[0].w}mm x {templateA.slots[0].h}mm</p>
                  </CardContent></Card>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isGeneratingA || isGeneratingB}>
                  {isGeneratingA ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Generar PDF (Imprenta A)
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        {/* Previsualización Imprenta A */}
        <div className="space-y-4">
             <Alert><AlertTitle>Previsualización (Imprenta A)</AlertTitle><AlertDescription>Mostrando los primeros {quantityA} tickets a 180x65mm.</AlertDescription></Alert>
            {generationResult.tickets.slice(0, quantityA).map((ticket, i) => (
                <div key={ticket.ticketId} ref={ticketRefsA[i]} className="ticket-print mb-4 inline-block">
                    <TicketCardPrint {...generationResult.eventParams} ticketNumber={ticket.ticketNumber} qrPayload={ticket.qrPayload} shortCode={ticket.shortCode} variant="large" eventName={generationResult.eventParams.event_name} dateTime={generationResult.eventParams.date_time} venue={generationResult.eventParams.venue} />
                </div>
            ))}
        </div>

        {/* Panel Imprenta B */}
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle className='flex items-center gap-2'><Settings /> Parámetros de Prueba 2 (Imprenta B)</CardTitle>
            <CardDescription>Genera un PDF con 8 tickets por hoja A4 horizontal.</CardDescription>
          </CardHeader>
          <Form {...formB}>
            <form onSubmit={formB.handleSubmit((values) => handleGeneratePdf(values, 'B'))}>
              <CardContent className="space-y-4 pr-4">
                  <FormField control={formB.control} name="quantity" render={({ field }) => ( <FormItem> <Label>Tickets a Generar</Label> <Input type="number" {...field} /> <FormMessage /> </FormItem> )}/>
                  <FormField control={formB.control} name="ppi" render={({ field }) => ( <FormItem> <Label>Resolución (PPI)</Label> <Input type="number" step="50" {...field} /> <FormDescription>300 PPI es estándar para impresión. Sube para más nitidez.</FormDescription> <FormMessage /> </FormItem> )}/>
                  <Card className="bg-muted/50"><CardHeader><CardTitle className="text-base">Plantilla Activa</CardTitle></CardHeader><CardContent className="text-xs space-y-2 font-mono">
                      <p>Formato: {templateB.page.format.toUpperCase()} {templateB.page.orientation}</p>
                      <p>Tickets por Hoja: {templateB.slots.length}</p>
                      <p>Dimensiones Ticket: {templateB.slots[0].w}mm x {templateB.slots[0].h}mm</p>
                  </CardContent></Card>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isGeneratingA || isGeneratingB}>
                  {isGeneratingB ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Generar PDF (Imprenta B)
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        {/* Previsualización Imprenta B */}
        <div className="space-y-4">
            <Alert><AlertTitle>Previsualización (Imprenta B)</AlertTitle><AlertDescription>Mostrando los primeros {quantityB} tickets a 145x50mm.</AlertDescription></Alert>
            {generationResult.tickets.slice(0, quantityB).map((ticket, i) => (
                <div key={ticket.ticketId} ref={ticketRefsB[i]} className="ticket-print mb-4 inline-block">
                    <TicketCardPrint {...generationResult.eventParams} ticketNumber={ticket.ticketNumber} qrPayload={ticket.qrPayload} shortCode={ticket.shortCode} variant="small" eventName={generationResult.eventParams.event_name} dateTime={generationResult.eventParams.date_time} venue={generationResult.eventParams.venue} />
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
