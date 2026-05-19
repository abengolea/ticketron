import { getTicketByCode } from '@/lib/actions/tickets';
import { DigitalTicket } from '@/components/digital-ticket';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PageProps {
  params: Promise<{ ticketCode: string }>;
}

export default async function TicketByCodePage({ params }: PageProps) {
  const { ticketCode } = await params;
  const result = await getTicketByCode(ticketCode);

  if (!result.success) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>Entrada no encontrada</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      </section>
    );
  }

  const ticket = result.data;

  return (
    <section className="py-8">
      <DigitalTicket
        eventName={ticket.eventName}
        eventDate={ticket.eventDate}
        buyerName={ticket.buyerName}
        ticketCode={ticket.ticketCode}
        qrPayload={ticket.qrPayload}
        status={ticket.status}
      />
    </section>
  );
}
