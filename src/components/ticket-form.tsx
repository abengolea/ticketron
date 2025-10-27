
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
import type { GenerationResult, TicketData, EventParameters } from "@/lib/types";
import { useFirestore, useUser } from "@/firebase";
import { createHmac } from 'crypto-browserify';
import { base32Encode } from "@/lib/utils";
import { doc, writeBatch, serverTimestamp, getDoc, type Firestore } from "firebase/firestore";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  event_name: z.string().min(3, "El nombre del evento debe tener al menos 3 caracteres."),
  event_id: z.string().min(3, "El ID del evento debe tener al menos 3 caracteres."),
  date_time: z.string().min(5, "La fecha y hora son requeridas."),
  venue: z.string().min(3, "El lugar es requerido."),
  quantity: z.coerce.number().int().positive().max(1000, "La cantidad no puede exceder los 1000."),
  tickets_per_page: z.literal(4),
  page_size: z.enum(["A4", "Letter"]),
});

type FormValues = z.infer<typeof formSchema>;

async function generateAndStoreTickets(
    firestore: Firestore,
    values: FormValues,
    onGenerate: (result: GenerationResult | null, error: string | null) => void,
    setIsLoading: (loading: boolean) => void,
    ownerId: string,
    toast: (options: { title: string, description: string, variant?: 'default' | 'destructive' }) => void
) {
    setIsLoading(true);
    onGenerate(null, null);

    try {
        const eventId = values.event_id;
        const eventRef = doc(firestore, 'events', eventId);
        const eventDoc = await getDoc(eventRef);

        if (eventDoc.exists()) {
            throw new Error("El ID del evento ya existe. Por favor, usa uno diferente.");
        }

        const secretBytes = new Uint8Array(32);
        crypto.getRandomValues(secretBytes);
        const secretKey = btoa(String.fromCharCode.apply(null, Array.from(secretBytes)));

        const tickets: TicketData[] = [];
        for (let i = 0; i < values.quantity; i++) {
            const ticketNumber = i + 1;
            const ticketId = crypto.randomUUID();
            const version = 1;
            const payloadToSign = `${eventId}|${ticketId}|${version}`;

            const hmac = createHmac("sha256", Buffer.from(secretKey, "base64"));
            hmac.update(payloadToSign);
            const sig = hmac.digest().slice(0, 12).toString("base64").replace(/\+/g, '-').replace(/\//g, '_');

            const qrPayload = JSON.stringify({ v: version, eid: eventId, tid: ticketId, sig });
            const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
            const shortCode = base32Encode(shortCodeSource).substring(0, 7);

            tickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
        }

        const batch = writeBatch(firestore);

        const eventData = {
            ownerId: ownerId,
            eventName: values.event_name,
            dateTime: values.date_time,
            venue: values.venue,
            ticketCount: values.quantity,
            createdAt: serverTimestamp()
        };
        batch.set(eventRef, eventData);

        const secretRef = doc(firestore, 'event_secrets', eventId);
        const secretData = {
            ownerId: ownerId,
            secretKey,
            createdAt: serverTimestamp()
        };
        batch.set(secretRef, secretData);
        
        tickets.forEach(ticket => {
            const ticketDocRef = doc(firestore, 'events', eventId, 'tickets', ticket.ticketId);
            const ticketData = {
                ownerId: ownerId,
                ticketNumber: ticket.ticketNumber,
                shortCode: ticket.shortCode,
                redeemed: false,
                redeemedAt: null,
            };
            batch.set(ticketDocRef, ticketData);
        });

        await batch.commit();

        onGenerate({ tickets, secretKey, eventParams: values }, null);

    } catch (e: any) {
        onGenerate(null, `Un error ocurrió: ${e.message}`);
        toast({
          variant: "destructive",
          title: "Error al Crear el Evento",
          description: e.message || "No se pudo guardar el evento. Revisa los permisos o los datos."
        })
    } finally {
        setIsLoading(false);
    }
}


type TicketFormProps = {
  onGenerate: (result: GenerationResult | null, error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
};

export function TicketForm({ onGenerate, setIsLoading }: TicketFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      event_name: "Fiesta Privada",
      event_id: `EVENTO-${format(new Date(), 'yyyyMMdd-HHmm')}`,
      date_time: "Fecha y hora a confirmar",
      venue: "Lugar a confirmar",
      quantity: 100,
      tickets_per_page: 4,
      page_size: "A4",
    },
  });

  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const handleTicketGeneration = (values: FormValues) => {
    if (!firestore) {
      onGenerate(null, "Firestore no está disponible.");
      return;
    }
    if (!user) {
      onGenerate(null, "Debes iniciar sesión para crear un evento.");
      return;
    }
    generateAndStoreTickets(firestore, values, onGenerate, setIsLoading, user.uid, toast);
  };

  const onSubmit = (values: FormValues) => {
    handleTicketGeneration(values);
  };

  const onTestSubmit = () => {
    const values = form.getValues();
    const testValues = { ...values, quantity: 10 };
    
    const validation = formSchema.safeParse(testValues);
    if (!validation.success) {
      form.trigger();
      return;
    }
    
    handleTicketGeneration(testValues);
  };

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
                        </Trigger>
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
          <CardFooter className="flex-col gap-4">
             {!user && (
              <Alert>
                <LogIn className="h-4 w-4" />
                <AlertTitle>¡Inicia Sesión para Continuar!</AlertTitle>
                <AlertDescription>
                  Necesitas iniciar sesión para poder generar tickets. Utiliza el botón en la cabecera.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-4 w-full">
                <Button type="button" variant="outline" onClick={onTestSubmit} disabled={!user}>Generar 10 Tickets de Prueba</Button>
                <Button type="submit" disabled={!user}>Generar Tickets</Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
