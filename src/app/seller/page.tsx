'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { getSellerDashboard } from '@/lib/actions/sellers';
import type { SerializedSellerAccess } from '@/lib/models';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Ticket } from 'lucide-react';

export default function SellerPage() {
  return (
    <RoleGuard allowedRoles={['seller']}>
      <SellerDashboard />
    </RoleGuard>
  );
}

function SellerDashboard() {
  const { getIdToken } = useIdToken();
  const [events, setEvents] = useState<SerializedSellerAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getIdToken();
      if (!token) return;
      const res = await getSellerDashboard(token);
      if (res.success) setEvents(res.data);
      setLoading(false);
    }
    load();
  }, [getIdToken]);

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-headline font-bold">Mis eventos</h1>
      {events.length === 0 ? (
        <p className="text-muted-foreground">No tenés eventos habilitados.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {events.map((ev) => (
            <Card key={ev.id}>
              <CardHeader>
                <CardTitle>{ev.eventName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.eventDate).toLocaleString('es-AR')}
                </p>
                <p>
                  Cupo: <strong>{ev.remaining}</strong> disponibles de {ev.quota}
                </p>
                <p>
                  Precio: <strong>${ev.price}</strong>
                </p>
                <Button asChild className="w-full">
                  <Link href={`/seller/event/${ev.eventId}`}>
                    <Ticket className="w-4 h-4 mr-2" /> Generar links
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </section>
  );
}
