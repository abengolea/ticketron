
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { GenerationResult, EventParameters, TicketData } from "@/lib/types";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { createHmac, randomBytes, randomUUID } from "crypto";
import { base32Encode, downloadFile } from "@/lib/utils";
import { doc, runTransaction, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";


const formSchema = z.object({
  event_name: z.string().min(3, "El nombre del evento debe tener al menos 3 caracteres."),
  event_id: z.string().min(3, "El ID del evento debe tener al menos 3 caracteres."),
  date_time: z.string().min(5, "La fecha y hora son requeridas."),
  venue: z.string().min(3, "El lugar es requerido."),
  quantity: z.coerce.number().int().positive().max(1000, "La cantidad no puede exceder los 1000."),
  tickets_per_page: z.literal(4),
  page_size: z.enum(["A4", "Letter"]),
});

type TicketFormProps = {
  onGenerate: (result: GenerationResult | null, error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
};

// Helper to chunk array
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );


export function TicketForm({ onGenerate, setIsLoading }: TicketFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      event_name: "Fiesta +40 — San Nicolás",
      event_id: "SN-FIESTA-2025-12-20",
      date_time: "Sábado 20/12/2025 – 22:00 hs",
      venue: "A informar por WhatsApp",
      quantity: 1000,
      tickets_per_page: 4,
      page_size: "A4",
    },
  });

  const firestore = useFirestore();
  const { toast } = useToast();

  const handleTicketGeneration = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    onGenerate(null, null);

    if (!firestore) {
      onGenerate(null, "Firestore no está disponible.");
      setIsLoading(false);
      return;
    }

    try {
        const secretKey = randomBytes(32).toString('base64');
        const tickets: TicketData[] = [];
        
        for (let i = 0; i < values.quantity; i++) {
            const ticketNumber = i + 1;
            const ticketId = randomUUID();
            const version = 1;
            const payloadToSign = `${values.event_id}|${ticketId}|${version}`;
            
            const hmac = createHmac("sha256", Buffer.from(secretKey, "base64"));
            hmac.update(payloadToSign);
            const sig = hmac.digest().slice(0, 12).toString("base64url");

            const qrPayload = JSON.stringify({ v: version, eid: values.event_id, tid: ticketId, sig });
            const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
            const shortCode = base32Encode(shortCodeSource).substring(0, 7);
            tickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
        }
        
        const secretRef = doc(firestore, 'event_secrets', values.event_id);
        const eventRef = doc(firestore, 'events', values.event_id);

        await runTransaction(firestore, async (transaction) => {
          const eventDoc = await transaction.get(eventRef);
          if (eventDoc.exists()) {
            throw new Error("El ID del evento ya existe. Por favor, usa uno diferente.");
          }

          const secretData = { secretKey };
          transaction.set(secretRef, secretData);
          
          const eventData = {
            eventName: values.event_name,
            dateTime: values.date_time,
            venue: values.venue,
            ticketCount: values.quantity,
            createdAt: serverTimestamp()
          };
          transaction.set(eventRef, eventData);

          const ticketsCollectionRef = collection(firestore, 'events', values.event_id, 'tickets');
          const ticketChunks = chunk(tickets, 499);
          for (const ticketChunk of ticketChunks) {
            const batch = writeBatch(firestore);
            ticketChunk.forEach((ticket) => {
                const ticketDocRef = doc(ticketsCollectionRef, ticket.ticketId);
                const ticketData = {
                    ticketNumber: ticket.ticketNumber,
                    shortCode: ticket.shortCode,
                    redeemed: false,
                    redeemedAt: null,
                };
                batch.set(ticketDocRef, ticketData);
            });
            await batch.commit();
          }
        }).catch(async (serverError: any) => {
          if (serverError.message.includes("permission-denied") || serverError.message.includes("insufficient permissions")) {
            const permissionError = new FirestorePermissionError({
              path: eventRef.path,
              operation: 'create',
              message: serverError.message
            });
            errorEmitter.emit('permission-error', permissionError);
          }
          throw serverError; // re-throw original error
        });
        
        onGenerate({ tickets, secretKey, eventParams: values }, null);

    } catch (e: any) {
        console.error("Error in ticket generation:", e);
        onGenerate(null, e.message || "Un error desconocido ocurrió durante la generación de tickets.");
    }

    setIsLoading(false);
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await handleTicketGeneration(values);
  }

  async function onTestSubmit() {
    const values = form.getValues();
    const testValues = { ...values, quantity: 10 };
    
    const validation = formSchema.safeParse(testValues);
    if (!validation.success) {
      form.trigger();
      return;
    }
    
    await handleTicketGeneration(testValues);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Parámetros del Evento</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="event_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Evento</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Mi Fiesta Increíble" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="event_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID del Evento</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: MI-FIESTA-2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y Hora</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 25 Dic, 2024 - 21:00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lugar</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Av. Siempre Viva 123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Tickets</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>Máximo 1000 tickets.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-6">
                <FormField
                control={form.control}
                name="tickets_per_page"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Tickets por Página</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={String(field.value)} disabled>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="page_size"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Tamaño de Página</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="A4">A4</SelectItem>
                            <SelectItem value="Letter">Carta (Letter)</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={onTestSubmit}>Generar 10 Tickets de Prueba</Button>
            <Button type="submit">Generar Tickets</Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
