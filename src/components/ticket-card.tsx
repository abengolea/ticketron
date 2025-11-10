
"use client";

import { useQRAsBase64 } from '@/hooks/useQRAsBase64';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

type TicketCardProps = {
  eventName: string;
  dateTime: string;
  venue: string;
  ticketNumber: number;
  qrPayload: string;
  shortCode: string;
  size?: 'large' | 'small';
};

export function TicketCard({ eventName, dateTime, venue, ticketNumber, qrPayload, shortCode, size = 'large' }: TicketCardProps) {
  const formattedTicketNumber = `#${String(ticketNumber).padStart(4, '0')}`;
  
  const qrSize = size === 'large' ? 200 : 150;
  const { dataUrl: qrBase64, error: qrError } = useQRAsBase64(qrPayload, { size: qrSize, margin: 1 });
  const qrLoading = !qrBase64 && !qrError;

  return (
    <div className={cn(
      "ticket-card flex bg-gray-900 text-white shadow-lg rounded-xl overflow-hidden",
      size === 'large' ? "w-[180mm] h-[65mm]" : "w-[145mm] h-[50mm]"
    )}>
      
      {/* Sección Izquierda - Información del Evento */}
      <div className={cn(
        "w-3/4 p-4 flex flex-col justify-between bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700",
        size === 'large' && "p-6"
      )}>
        <div>
          <p className={cn("opacity-80", size === 'large' ? "text-sm" : "text-xs")}>Entrada General</p>
          <h2 className={cn(
            "font-extrabold text-white leading-tight tracking-tighter mt-1",
            size === 'large' ? "text-4xl" : "text-2xl"
          )}>{eventName}</h2>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <p className={cn("opacity-80 font-semibold", size === 'large' ? "text-xs" : "text-[10px]")}>Fecha y Hora</p>
            <p className={cn("font-bold", size === 'large' ? "text-base" : "text-sm")}>{dateTime}</p>
            <p className={cn("opacity-80 font-semibold mt-1", size === 'large' ? "text-xs mt-2" : "text-[10px]")}>Lugar</p>
            <p className={cn("font-bold", size === 'large' ? "text-base" : "text-sm")}>{venue}</p>
          </div>
           <div className="text-right">
              <p className={cn("opacity-80 font-semibold", size === 'large' ? "text-xs" : "text-[10px]")}>Nº Ticket</p>
              <p className={cn("font-bold tracking-tighter", size === 'large' ? "text-3xl" : "text-2xl")}>{formattedTicketNumber}</p>
          </div>
        </div>
      </div>

      {/* Sección Derecha - QR y Código de Verificación */}
      <div className="w-1/4 bg-gray-100 flex flex-col items-center justify-center p-2">
        <div className="w-full aspect-square p-1 bg-white rounded-lg shadow-inner flex items-center justify-center">
            {qrLoading && <Skeleton className="w-full h-full" />}
            {qrError && <div className="text-xs text-red-500 text-center">Error QR</div>}
            {!qrLoading && !qrError && qrBase64 && (
                 <img
                    src={qrBase64}
                    alt={`Código QR para el ticket ${formattedTicketNumber}`}
                    className="w-full h-full"
                 />
            )}
        </div>
        <div className="mt-2 text-center">
            <p className={cn("text-gray-500 font-semibold", size === 'large' ? "text-[9px]" : "text-[8px]")}>Verificación Manual</p>
            <p className={cn("font-mono text-gray-800 font-bold", size === 'large' ? "text-lg tracking-widest" : "text-sm tracking-wider")}>{shortCode}</p>
        </div>
      </div>
    </div>
  );
}
