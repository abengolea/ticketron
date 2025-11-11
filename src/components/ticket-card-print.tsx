"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useQRAsBase64 } from "@/hooks/useQRAsBase64";

type TicketCardPrintProps = {
  eventName: string;
  dateTime: string;
  venue: string;
  ticketNumber: number;
  qrPayload: string;
  shortCode: string;
  /** "large" = 180×65 mm (Imprenta A) | "small" = 145×50 mm (Imprenta B) */
  variant?: "large" | "small";
};

export function TicketCardPrint({
  eventName,
  dateTime,
  venue,
  ticketNumber,
  qrPayload,
  shortCode,
  variant = "large",
}: TicketCardPrintProps) {
  const formattedTicket = `#${String(ticketNumber).padStart(4, "0")}`;
  const isSmall = variant === "small";

  // QR sin borde/inner-shadow
  const qrSize = isSmall ? 140 : 200;
  const { dataUrl: qrBase64, error: qrError } = useQRAsBase64(qrPayload, { size: qrSize, margin: 1 });
  const qrLoading = !qrBase64 && !qrError;

  return (
    <div
      className={cn(
        "flex overflow-hidden",
        isSmall ? "w-[145mm] h-[50mm]" : "w-[180mm] h-[65mm]"
      )}
      style={{
        background: "none",       // sin fondo oscuro
        border: "none",           // sin bordes
        boxShadow: "none",        // sin sombras
      }}
    >
      {/* Panel izquierdo (gradiente “plano”, sin sombras) */}
      <div
        className={cn("w-3/4 flex flex-col justify-between", isSmall ? "p-4" : "p-6")}
        style={{
          // gradiente directo (sin depender de Tailwind para la captura)
          background: "linear-gradient(135deg,#EC4899 0%, #8B5CF6 55%, #4F46E5 100%)",
          boxShadow: "none",
          border: "none",
        }}
      >
        <div>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: isSmall ? 10 : 12, fontWeight: 600, margin: 0 }}>
            Entrada General
          </p>
          <h2
            style={{
              color: "#fff",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              margin: "4px 0 0 0",
              fontSize: isSmall ? 24 : 36,
            }}
          >
            {eventName}
          </h2>
        </div>

        <div className="flex justify-between items-end">
          <div>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: isSmall ? 10 : 12, fontWeight: 600, margin: 0 }}>
              Fecha y Hora
            </p>
            <p style={{ color: "#fff", fontSize: isSmall ? 14 : 16, fontWeight: 700, margin: 0 }}>
              {dateTime}
            </p>

            <p
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: isSmall ? 10 : 12,
                fontWeight: 600,
                margin: isSmall ? "4px 0 0" : "8px 0 0",
              }}
            >
              Lugar
            </p>
            <p style={{ color: "#fff", fontSize: isSmall ? 14 : 16, fontWeight: 700, margin: 0 }}>
              {venue}
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: isSmall ? 10 : 12, fontWeight: 600, margin: 0 }}>
              Nº Ticket
            </p>
            <p style={{ color: "#fff", fontSize: isSmall ? 20 : 28, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              {formattedTicket}
            </p>
          </div>
        </div>
      </div>

      {/* Panel derecho (QR + short code) — TODO plano, sin shadow */}
      <div
        className={cn("w-1/4 flex flex-col items-center justify-center", isSmall ? "p-2" : "p-3")}
        data-print-bg="white"
        style={{ background: "#fff", border: "none", boxShadow: "none" }}
      >
        <div
          className="w-full aspect-square flex items-center justify-center"
          data-print-bg="white"
          style={{ background: "#fff", border: "none", boxShadow: "none", padding: isSmall ? 4 : 6, borderRadius: 8 }}
        >
          {qrLoading && <Skeleton className="w-full h-full" />}
          {qrError && <div style={{ fontSize: 10, color: "#ef4444" }}>Error QR</div>}
          {!qrLoading && !qrError && qrBase64 && (
            <img src={qrBase64} alt={`QR ${formattedTicket}`} style={{ width: "100%", height: "100%" }} />
          )}
        </div>

        <div style={{ marginTop: 4, textAlign: "center" }}>
          <p style={{ color: "#6B7280", fontWeight: 700, fontSize: isSmall ? 8 : 10, margin: 0 }}>
            Verificación Manual
          </p>
          <p style={{ color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 800, letterSpacing: "0.08em", fontSize: isSmall ? 12 : 16, margin: 0 }}>
            {shortCode}
          </p>
        </div>
      </div>
    </div>
  );
}
