'use client';

import { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/role-guard';
import { DigitalTicketsSection } from '@/components/digital-tickets-section';
import { getMyTickets, type BuyerTicketItem } from '@/lib/actions/buyers';
import { useIdToken } from '@/hooks/use-id-token';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Ticket } from 'lucide-react';

function MyTicketsContent() {
  const { getIdToken } = useIdToken();
  const [tickets, setTickets] = useState<BuyerTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getIdToken();
      if (!token) {
        setError('Sesión requerida');
        setLoading(false);
        return;
      }
      const res = await getMyTickets(token);
      if (!res.success) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setTickets(res.data);
      setLoading(false);
    }
    load();
  }, [getIdToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (tickets.length === 0) {
    return (
      <Alert className="max-w-md mx-auto">
        <Ticket className="h-4 w-4" />
        <AlertTitle>Sin entradas</AlertTitle>
        <AlertDescription>
          No encontramos entradas asociadas a tu cuenta. Si compraste recientemente, revisá el
          correo con el link de tus tickets.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="space-y-6">
      <header className="text-center space-y-2">
        <h1 className="text-2xl font-headline font-bold">Mis entradas</h1>
        <p className="text-muted-foreground text-sm">
          {tickets.length === 1
            ? '1 entrada en tu cuenta'
            : `${tickets.length} entradas en tu cuenta`}
        </p>
      </header>
      <DigitalTicketsSection
        tickets={tickets.map((ticket) => ({
          eventName: ticket.eventName,
          eventDate: ticket.eventDate,
          buyerName: ticket.buyerName,
          ticketCode: ticket.ticketCode,
          qrPayload: ticket.qrPayload,
          status: ticket.status,
        }))}
      />
    </section>
  );
}

export default function MyTicketsPage() {
  return (
    <RoleGuard allowedRoles={['buyer']}>
      <MyTicketsContent />
    </RoleGuard>
  );
}
