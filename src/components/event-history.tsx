"use client";

import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { collection } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { FileQuestion } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

type Event = {
  id: string;
  eventName: string;
  dateTime: string;
  venue: string;
  ticketCount: number;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
};

export function EventHistory() {
  const firestore = useFirestore();
  
  const eventsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'events');
  }, [firestore]);

  const { data: events, loading, error } = useCollection<Event>(eventsQuery);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cargando Eventos...</CardTitle>
          <CardDescription>Obteniendo el historial de eventos desde la base de datos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error al Cargar el Historial</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!events || events.length === 0) {
    return (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <FileQuestion className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium text-muted-foreground">No se Encontraron Eventos</h3>
            <p className="mt-1 text-sm text-muted-foreground">Parece que aún no has generado ningún ticket.</p>
        </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus Eventos</CardTitle>
        <CardDescription>Una lista de todos los eventos que has creado.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre del Evento</TableHead>
              <TableHead>Lugar</TableHead>
              <TableHead>Fecha y Hora</TableHead>
              <TableHead>Creado el</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.map((event) => (
              <TableRow key={event.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link href={`/history/${event.id}`} className="block w-full h-full">
                        {event.eventName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/history/${event.id}`} className="block w-full h-full">
                        {event.venue}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/history/${event.id}`} className="block w-full h-full">
                        {event.dateTime}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/history/${event.id}`} className="block w-full h-full">
                        {format(new Date(event.createdAt.seconds * 1000), "PPP p")}
                    </Link>
                  </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
