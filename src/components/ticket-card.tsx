
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
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;

  return (
    <div className="ticket-card w-[105mm] h-[74mm] flex flex-col p-4 bg-white text-black shadow-lg border-dashed border-gray-300 border relative">
      {/* Main Content */}
      <div className="flex-grow flex items-center gap-4">
        {/* QR Code Section */}
        <div className="flex flex-col items-center justify-center gap-1 w-2/5">
            <Image
              src={qrUrl}
              alt={`Código QR para el ticket ${formattedTicketNumber}`}
              width={150}
              height={150}
              className="rounded-md"
              crossOrigin="anonymous"
              unoptimized
              priority
            />
            <p className="text-[9px] text-gray-600 text-center leading-tight mt-1">Escanear para validar la entrada</p>
        </div>
        
        {/* Separator */}
        <div className="w-px h-full bg-gray-200 border-l border-dashed border-gray-300"></div>

        {/* Info Section */}
        <div className="flex-grow flex flex-col justify-between w-3/5 pl-2">
          <div className="text-right">
              <h2 className="text-xl font-headline text-black leading-tight">{eventName}</h2>
              <p className="text-[10px] text-gray-700">{dateTime} @ {venue}</p>
          </div>

          <div className="flex items-end justify-between gap-2 mt-4">
              <div className="text-left">
                  <p className="text-[10px] text-gray-600">Nº Ticket</p>
                  <p className="text-3xl font-bold tracking-tighter">{formattedTicketNumber}</p>
              </div>
              <div className="text-right">
                  <p className="text-[10px] text-gray-600">Verificación</p>
                  <p className="font-mono text-base tracking-widest">{shortCode}</p>
              </div>
          </div>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="mt-2 pt-2 border-t border-dashed border-gray-300">
        <p className="text-[7px] text-gray-500 text-center leading-tight">
          Este ticket es válido para un único ingreso. Prohibida su reventa o duplicación.
        </p>
      </div>
    </div>
  );
}

    