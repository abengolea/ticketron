
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
    <Card className="ticket-card w-[105mm] h-[74.25mm] flex p-2 bg-card shadow-lg border border-dashed border-gray-300">
      <div className="flex flex-col items-center justify-center gap-1 p-1 border-r pr-2 w-[58px]">
          <Image
            src={qrUrl}
            alt={`Código QR para el ticket ${formattedTicketNumber}`}
            width={48}
            height={48}
            className="rounded-sm"
            crossOrigin="anonymous"
            unoptimized
            priority
          />
           <p className="text-[6px] text-muted-foreground text-center leading-tight">Escanear para entrar</p>
        </div>
      <div className="flex-grow flex flex-col justify-between pl-2">
        <div className="text-center">
            <h2 className="text-base font-headline text-primary leading-tight">{eventName}</h2>
            <p className="text-[8px] text-muted-foreground">{dateTime} @ {venue}</p>
        </div>

        <div className="flex items-center justify-around gap-2">
            <div className="text-center">
                <p className="text-[8px] text-muted-foreground">Nº Ticket</p>
                <p className="text-xl font-bold tracking-tighter">{formattedTicketNumber}</p>
            </div>
            <div className="text-center">
                <p className="text-[8px] text-muted-foreground">Verificación</p>
                <p className="font-mono text-xs tracking-widest">{shortCode}</p>
            </div>
        </div>

        <p className="text-[6px] text-muted-foreground text-center leading-tight mt-1">
          Válida 1 ingreso. No transferible una vez escaneada. Prohibida su reproducción.
        </p>
      </div>
    </Card>
  );
}

    