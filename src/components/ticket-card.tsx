import Image from 'next/image';
import { Card, CardContent } from './ui/card';
import { Separator } from './ui/separator';

type TicketCardProps = {
  eventName: string;
  dateTime: string;
  venue: string;
  ticketNumber: number;
  qrPayload: string;
  shortCode: string;
};

export function TicketCard({ eventName, dateTime, venue, ticketNumber, qrPayload, shortCode }: TicketCardProps) {
  const formattedTicketNumber = `#${String(ticketNumber).padStart(4, '0')}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrPayload)}`;

  return (
    <Card className="ticket-card w-[148mm] h-[105mm] flex flex-col p-4 bg-card shadow-lg border border-dashed border-gray-300">
      <div className="text-center">
        <h2 className="text-2xl font-headline text-primary">{eventName}</h2>
        <p className="text-sm text-muted-foreground">{dateTime}</p>
        <p className="text-sm font-bold">{venue}</p>
      </div>
      <Separator className="my-3" />
      <CardContent className="flex-grow flex items-center justify-between gap-4 p-0">
        <div className="flex-grow flex flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">Nº de Ticket</p>
          <p className="text-6xl font-bold tracking-tighter">{formattedTicketNumber}</p>
          <Separator className="w-24 my-3" />
          <p className="text-sm text-muted-foreground">Código de Verificación</p>
          <p className="font-mono text-xl tracking-widest">{shortCode}</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 p-2 border rounded-lg">
          <Image
            src={qrUrl}
            alt={`Código QR para el ticket ${formattedTicketNumber}`}
            width={120}
            height={120}
            className="rounded-md"
          />
           <p className="text-xs text-muted-foreground">Escanear para entrar</p>
        </div>
      </CardContent>
      <Separator className="my-3" />
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          Válida 1 ingreso. No transferible una vez escaneada. Prohibida su reproducción.
        </p>
      </div>
    </Card>
  );
}
