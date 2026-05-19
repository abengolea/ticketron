'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTicketsByPaymentLinkToken } from '@/lib/actions/tickets';
import { DigitalTicket } from '@/components/digital-ticket';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import type { SerializedTicket } from '@/lib/models';

function EmailNotice({ email }: { email?: string }) {
  return (
    <Alert className="border-green-200 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100">
      <Mail className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Revisá tu email
      </AlertTitle>
      <AlertDescription>
        {email ? (
          <>
            Te enviamos un correo a <strong>{email}</strong> con el link para ver
            tus entradas. Si no lo ves, revisá spam o correo no deseado.
          </>
        ) : (
          <>
            Te enviamos un correo con el link para ver tus entradas. Si no lo
            ves, revisá spam o correo no deseado.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

function TicketByTokenContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [tickets, setTickets] = useState<
    (SerializedTicket & { eventName: string; eventDate: string })[]
  >([]);
  const [buyerEmail, setBuyerEmail] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado');
      setLoading(false);
      return;
    }

    async function load() {
      const ticketRes = await getTicketsByPaymentLinkToken(token!);
      if (!ticketRes.success) {
        setError(ticketRes.error);
        setPending(false);
        setLoading(false);
        return;
      }

      if (ticketRes.data.status === 'pending') {
        setPending(true);
        setBuyerEmail(ticketRes.data.buyerEmail);
        setTickets([]);
        setError(null);
        setLoading(false);
        return;
      }

      const { tickets: loaded, eventName, eventDate, buyerEmail: email } =
        ticketRes.data;
      setPending(false);
      setBuyerEmail(email);
      setTickets(
        loaded.map((t) => ({
          ...t,
          eventName,
          eventDate,
        }))
      );
      setError(null);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>Entrada</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (pending) {
    return (
      <section className="max-w-md mx-auto py-12 space-y-4">
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Procesando tu pago</AlertTitle>
          <AlertDescription>
            Tu pago está siendo confirmado. Esta página se actualiza sola en unos
            segundos.
            {buyerEmail && (
              <>
                {' '}
                Cuando se acredite, te enviaremos las entradas a{' '}
                <strong>{buyerEmail}</strong>.
              </>
            )}
          </AlertDescription>
        </Alert>
        {buyerEmail && (
          <p className="text-center text-sm text-muted-foreground">
            También podés volver a esta página desde el link del correo.
          </p>
        )}
      </section>
    );
  }

  if (tickets.length === 0) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert>
          <AlertTitle>Entrada</AlertTitle>
          <AlertDescription>No disponible</AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section className="py-8 space-y-6 max-w-md mx-auto">
      <EmailNotice email={buyerEmail} />
      {tickets.length > 1 && (
        <p className="text-center text-muted-foreground">
          {tickets.length} entradas para este pago
        </p>
      )}
      {tickets.map((ticket) => (
        <DigitalTicket
          key={ticket.id}
          eventName={ticket.eventName}
          eventDate={ticket.eventDate}
          buyerName={ticket.buyerName}
          ticketCode={ticket.ticketCode}
          qrPayload={ticket.qrPayload}
          status={ticket.status}
        />
      ))}
    </section>
  );
}

export default function TicketByTokenPage() {
  return (
    <Suspense
      fallback={
        <section className="flex justify-center py-12">
          <Loader2 className="animate-spin w-10 h-10" />
        </section>
      }
    >
      <TicketByTokenContent />
    </Suspense>
  );
}
