
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
  variant?: 'large' | 'small';
};

export function TicketCard({ eventName, dateTime, venue, ticketNumber, qrPayload, shortCode, variant = 'large' }: TicketCardProps) {
  const formattedTicketNumber = `#${String(ticketNumber).padStart(4, '0')}`;
  
  const isSmall = variant === 'small';

  const qrSize = isSmall ? 140 : 200;
  const { dataUrl: qrBase64, error: qrError } = useQRAsBase64(qrPayload, { size: qrSize, margin: 1 });
  const qrLoading = !qrBase64 && !qrError;

  return (
    <div
      className={cn(
        "ticket-card flex bg-gray-900 text-white shadow-lg rounded-xl overflow-hidden",
        isSmall ? "w-[145mm] h-[50mm]" : "w-[180mm] h-[65mm]"
      )}
    >
      {/* Sección Izquierda - Información del Evento */}
      <div className={cn(
        "w-3/4 flex flex-col justify-between bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700",
        isSmall ? "p-4" : "p-6"
      )}>
        <div>
          <p className={cn("opacity-80", isSmall ? "text-xs" : "text-sm")}>Entrada General</p>
          <h2 className={cn(
            "font-extrabold text-white leading-tight tracking-tighter mt-1",
            isSmall ? "text-2xl" : "text-4xl"
          )}>{eventName}</h2>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <p className={cn("opacity-80 font-semibold", isSmall ? "text-[10px]" : "text-xs")}>Fecha y Hora</p>
            <p className={cn("font-bold", isSmall ? "text-sm" : "text-base")}>{dateTime}</p>
            <p className={cn("opacity-80 font-semibold mt-1", isSmall ? "text-[10px] mt-1" : "text-xs mt-2")}>Lugar</p>
            <p className={cn("font-bold", isSmall ? "text-sm" : "text-base")}>{venue}</p>
          </div>
           <div className="text-right">
              <p className={cn("opacity-80 font-semibold", isSmall ? "text-[10px]" : "text-xs")}>Nº Ticket</p>
              <p className={cn("font-bold tracking-tighter", isSmall ? "text-xl" : "text-3xl")}>{formattedTicketNumber}</p>
          </div>
        </div>
      </div>

      {/* Sección Derecha - QR y Código de Verificación */}
      <div className={cn(
          "w-1/4 bg-gray-100 flex flex-col items-center justify-center",
          isSmall ? "p-1.5" : "p-2"
        )}>
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
        <div className="mt-1 text-center">
            <p className={cn("text-gray-500 font-semibold", isSmall ? "text-[7px]" : "text-[9px]")}>Verificación Manual</p>
            <p className={cn("font-mono text-gray-800 font-bold", isSmall ? "text-xs tracking-wider" : "text-lg tracking-widest")}>{shortCode}</p>
        </div>
      </div>
    </div>
  );
}
