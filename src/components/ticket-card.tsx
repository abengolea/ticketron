
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
    <Card className="ticket-card w-[120mm] h-[65mm] flex p-2 bg-white text-black shadow-lg border border-dashed border-gray-400">
      <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-gray-300 pr-3 w-[75px]">
          <Image
            src={qrUrl}
            alt={`Código QR para el ticket ${formattedTicketNumber}`}
            width={64}
            height={64}
            className="rounded-sm"
            crossOrigin="anonymous"
            unoptimized
            priority
          />
           <p className="text-[7px] text-gray-600 text-center leading-tight">Escanear para entrar</p>
        </div>
      <div className="flex-grow flex flex-col justify-between pl-3">
        <div className="text-center">
            <h2 className="text-lg font-headline text-black leading-tight">{eventName}</h2>
            <p className="text-[9px] text-gray-700">{dateTime} @ {venue}</p>
        </div>

        <div className="flex items-end justify-around gap-2">
            <div className="text-center">
                <p className="text-[9px] text-gray-600">Nº Ticket</p>
                <p className="text-2xl font-bold tracking-tighter">{formattedTicketNumber}</p>
            </div>
            <div className="text-center">
                <p className="text-[9px] text-gray-600">Verificación</p>
                <p className="font-mono text-sm tracking-widest">{shortCode}</p>
            </div>
        </div>

        <p className="text-[7px] text-gray-500 text-center leading-tight mt-1">
          Válida 1 ingreso. No transferible una vez escaneada. Prohibida su reproducción.
        </p>
      </div>
    </Card>
  );
}
