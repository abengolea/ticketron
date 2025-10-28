

"use client";

import { useQRAsBase64 } from '@/hooks/useQRAsBase64';
import { Skeleton } from './ui/skeleton';

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
  
  // The QR URL is constructed, but might not be used if qrPayload is empty
  const qrUrl = qrPayload ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}&qzone=1&margin=0` : null;
  const { base64: qrBase64, loading: qrLoading, error: qrError } = useQRAsBase64(qrUrl);


  return (
    <div className="ticket-card w-[180mm] h-[65mm] flex bg-gray-900 text-white shadow-lg rounded-xl overflow-hidden">
      
      {/* Sección Izquierda - Información del Evento (75%) */}
      <div className="w-3/4 p-6 flex flex-col justify-between bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700">
        <div>
          <p className="text-sm opacity-80">Entrada General</p>
          <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tighter mt-1">{eventName}</h2>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs opacity-80 font-semibold">Fecha y Hora</p>
            <p className="text-base font-bold">{dateTime}</p>
            <p className="text-xs opacity-80 font-semibold mt-2">Lugar</p>
            <p className="text-base font-bold">{venue}</p>
          </div>
           <div className="text-right">
              <p className="text-xs opacity-80 font-semibold">Nº Ticket</p>
              <p className="text-3xl font-bold tracking-tighter">{formattedTicketNumber}</p>
          </div>
        </div>
      </div>

      {/* Sección Derecha - QR y Código de Verificación (25%) */}
      <div className="w-1/4 bg-gray-100 flex flex-col items-center justify-center p-3">
        <div className="w-full aspect-square p-2 bg-white rounded-lg shadow-inner flex items-center justify-center">
            {qrLoading && <Skeleton className="w-full h-full" />}
            {qrError && <div className="text-xs text-red-500 text-center">Error QR</div>}
            {!qrLoading && !qrError && qrBase64 && (
                 <img
                    src={qrBase64}
                    alt={`Código QR para el ticket ${formattedTicketNumber}`}
                    className="w-full h-full"
                    crossOrigin="anonymous"
                 />
            )}
        </div>
        <div className="mt-3 text-center">
            <p className="text-[9px] text-gray-500 font-semibold">Verificación Manual</p>
            <p className="font-mono text-lg tracking-widest text-gray-800 font-bold">{shortCode}</p>
        </div>
      </div>
    </div>
  );
}
