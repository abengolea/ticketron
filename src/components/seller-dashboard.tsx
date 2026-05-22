'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useIdToken } from '@/hooks/use-id-token';
import { getSessionUser } from '@/lib/actions/auth';
import { getSellerDashboard } from '@/lib/actions/sellers';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedSellerAccess } from '@/lib/models';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Calendar, Loader2 } from 'lucide-react';

function eventTiming(eventDate: string): 'upcoming' | 'today' | 'past' {
  const d = new Date(eventDate);
  const now = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (start.getTime() === today.getTime()) return 'today';
  if (start < today) return 'past';
  return 'upcoming';
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function quotaPercent(issued: number, quota: number) {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((issued / quota) * 100));
}

export function SellerDashboard() {
  const { getIdToken } = useIdToken();
  const [events, setEvents] = useState<SerializedSellerAccess[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getIdToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const [dashRes, sessionRes] = await Promise.all([
        getSellerDashboard(token),
        getSessionUser(token),
      ]);
      if (dashRes.success) setEvents(dashRes.data);
      if (sessionRes.success) setDisplayName(sessionRes.data.displayName);
      setLoading(false);
    }
    load();
  }, [getIdToken]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const ta = eventTiming(a.eventDate);
      const tb = eventTiming(b.eventDate);
      const order = { today: 0, upcoming: 1, past: 2 };
      if (order[ta] !== order[tb]) return order[ta] - order[tb];
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    });
  }, [events]);

  if (loading) {
    return (
      <section className="flex justify-center py-16">
        <Loader2 className="animate-spin w-10 h-10 text-muted-foreground" />
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Mis ventas</p>
        <h1 className="text-3xl font-headline font-bold tracking-tight">
          {displayName ? `Hola, ${displayName}` : 'Eventos asignados'}
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Elegí un evento para abrir el panel de control: métricas, links pendientes,
          actividad y gestión de ventas.
        </p>
      </header>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No tenés eventos habilitados. Pedile al administrador que te asigne eventos y cupo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedEvents.map((ev) => {
            const timing = eventTiming(ev.eventDate);
            const pct = quotaPercent(ev.issued, ev.quota);
            const lowQuota = ev.remaining > 0 && ev.remaining <= 5;

            return (
              <Card
                key={ev.id}
                className={timing === 'today' ? 'border-primary/50 shadow-sm' : undefined}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-snug">{ev.eventName}</CardTitle>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {timing === 'today' && <Badge>Hoy</Badge>}
                      {timing === 'upcoming' && <Badge variant="secondary">Próximo</Badge>}
                      {timing === 'past' && <Badge variant="outline">Finalizado</Badge>}
                      {ev.remaining === 0 && <Badge variant="destructive">Sin cupo</Badge>}
                      {lowQuota && ev.remaining > 0 && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          Poco cupo
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {formatEventDate(ev.eventDate)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Precio</span>
                    <span className="font-medium">{formatArs(ev.price)}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cupo</span>
                      <span>
                        <strong>{ev.issued}</strong> / {ev.quota}
                        {ev.remaining > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({ev.remaining} libres)
                          </span>
                        )}
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Vendidas: <strong className="text-foreground">{ev.sold}</strong>
                      </span>
                      {ev.pendingPayment > 0 && (
                        <span className="text-amber-700 dark:text-amber-400">
                          Sin pagar: <strong>{ev.pendingPayment}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <Button asChild className="w-full">
                    <Link href={`/seller/event/${ev.eventId}`}>
                      Abrir panel de control
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
