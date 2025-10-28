
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
  const formattedTicketNumber = `#${String(ticketNumber).padStart(4, '0_')}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;

  return (
    <Card className="ticket-card w-[120mm] h-[60mm] flex p-3 bg-white text-black shadow-lg border border-dashed border-gray-400">
      {/* QR Code Section */}
      <div className="flex flex-col items-center justify-center gap-1 p-2 border-r-2 border-dashed border-gray-300 pr-4 w-[80mm]">
          <Image
            src={qrUrl}
            alt={`Código QR para el ticket ${formattedTicketNumber}`}
            width={90}
            height={90}
            className="rounded-md"
            crossOrigin="anonymous"
            unoptimized
            priority
          />
           <p className="text-[8px] text-gray-600 text-center leading-tight mt-1">Escanear para validar la entrada</p>
        </div>
      
      {/* Info Section */}
      <div className="flex-grow flex flex-col justify-between pl-4">
        <div className="text-center">
            <h2 className="text-xl font-headline text-black leading-tight">{eventName}</h2>
            <p className="text-[10px] text-gray-700">{dateTime} @ {venue}</p>
        </div>

        <div className="flex items-end justify-around gap-2">
            <div className="text-center">
                <p className="text-[10px] text-gray-600">Nº Ticket</p>
                <p className="text-3xl font-bold tracking-tighter">{formattedTicketNumber}</p>
            </div>
            <div className="text-center">
                <p className="text-[10px] text-gray-600">Verificación</p>
                <p className="font-mono text-base tracking-widest">{shortCode}</p>
            </div>
        </div>

        <p className="text-[7px] text-gray-500 text-center leading-tight mt-1">
          Este ticket es válido para un único ingreso. Prohibida su reventa o duplicación.
        </p>
      </div>
    </Card>
  );
}
