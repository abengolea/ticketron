'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listActiveEventsPublic } from '@/lib/actions/events';
import type { SerializedEvent } from '@/lib/models';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DoorOpen, Loader2, ShieldCheck } from 'lucide-react';
import { useUser } from '@/firebase';

export default function GateHubPage() {
  const { user } = useUser();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await listActiveEventsPublic();
      if (res.success) {
        setEvents(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <section className="space-y-6 max-w-lg mx-auto">
      <section className="text-center">
        <DoorOpen className="w-12 h-12 mx-auto text-primary mb-3" />
        <h1 className="text-3xl font-headline font-bold text-primary">Validador digital</h1>
        <p className="text-muted-foreground mt-2">
          Elegí el evento y escaneá los QR de entradas vendidas online, en efectivo o de cortesía.
        </p>
      </section>

      {!user && (
        <Alert>
          <AlertDescription>
            Podés elegir el evento sin iniciar sesión. Para escanear y validar entradas,{' '}
            <Link href="/login" className="font-medium text-primary underline underline-offset-2">
              ingresá con tu cuenta
            </Link>{' '}
            (admin o puerta).
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <section className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </section>
      ) : error ? (
        <p className="text-center text-destructive">{error}</p>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay eventos activos para validar.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{event.name}</CardTitle>
                  <CardDescription>
                    {new Date(event.date).toLocaleString('es-AR', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    })}
                    {event.location ? ` · ${event.location}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href={`/gate/${event.id}`}>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Abrir validador
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
