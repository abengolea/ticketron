
"use client";

import React, { useRef } from "react";
import type { GenerationResult, EventParameters } from "@/lib/types";
import { TicketCard } from "./ticket-card";
import { Button } from "./ui/button";
import { Download, ArrowLeft, PlusCircle, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/utils";

// Imprime en NUEVA VENTANA usando Blob URL + copia de CSS del documento
export async function printWithBlobURL(containerRef: React.RefObject<HTMLElement>) {
  const src = containerRef.current;
  if (!src) {
    alert('No hay contenido para imprimir');
    return;
  }

  // Esperar imágenes del DOM original (para no imprimir vacíos)
  const imgs = Array.from(src.querySelectorAll('img'));
  await Promise.all(imgs.map(img => new Promise<void>(res => {
    if (img.complete) return res();
    img.onload = () => res();
    img.onerror = () => res();
  })));

  const inner = src.innerHTML;

  // Copiar CSS de la página actual (Tailwind/Next)
  const headPieces: string[] = [];

  // <link rel="stylesheet" ...>
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = (link as HTMLLinkElement).href; // href absoluto
    if (href) headPieces.push(`<link rel="stylesheet" href="${href}">`);
  });

  // <style> inline
  document.querySelectorAll('style').forEach(style => {
    headPieces.push(`<style>${style.innerHTML}</style>`);
  });

  // CSS mínimo para A4 y evitar cortes
  headPieces.push(`
    <style>
      @page { size: A4; margin: 12mm; }
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ticket-print { width: 100%; break-inside: avoid; page-break-inside: avoid; margin: 0 0 12mm 0; }
        .ticket-card { box-shadow: none !important; border-radius: 0 !important; }
      }
      html,body{margin:0;padding:0;background:#fff;}
    </style>
  `);

  // Documento HTML completo que se auto-imprime
  const htmlDoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${window.location.origin}">
${headPieces.join('\n')}
</head>
<body>
<div id="print-root">
${inner}
</div>
<script>
  // Esperar a que el CSS cargue y luego imprimir
  (function() {
    function ready(fn){ if (document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
    ready(function(){
      try { window.focus(); window.print(); } catch(e){}
      setTimeout(function(){ try{ window.close(); }catch(e){} }, 300);
    });
  })();
</script>
</body>
</html>`;

  // Crear Blob URL
  const blob = new Blob([htmlDoc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Abrir popup con el Blob URL
  const win = window.open(url, '_blank', 'noopener,noreferrer,width=1000,height=800');
  if (!win) {
    URL.revokeObjectURL(url);
    alert('El navegador bloqueó la ventana emergente. Permití los pop-ups para este sitio e intentá de nuevo.');
    return;
  }

  // Revocar cuando termine
  const revoke = () => { try { URL.revokeObjectURL(url); } catch {} };
  // por si el usuario cancela o se cierra
  const t = setInterval(() => {
    if (win.closed) { clearInterval(t); revoke(); }
  }, 1000);
}


type TicketPreviewProps = {
  result: GenerationResult;
  isRegeneration?: boolean;
  onEventUpdate?: (updatedParams: Partial<EventParameters>) => void;
};

export function TicketPreview({ result, isRegeneration = false, onEventUpdate }: TicketPreviewProps) {
  const { tickets, eventParams, secretKey } = result;
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownloadSecret = () => {
    if (secretKey) {
      downloadFile("secret_key.txt", secretKey, "text/plain");
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = [
      "Ticket Number,Short Code,QR Payload,Redeemed",
      ...tickets.map(t => `${t.ticketNumber},${t.shortCode},"${t.qrPayload.replace(/"/g, '""')}",false`)
    ].join("\n");
    downloadFile("tickets.csv", csvContent, "text/csv;charset=utf-8;");
  };
  
  const handleDownloadJson = () => {
    const jsonContent = JSON.stringify({ tickets, eventParams, secretKey }, null, 2);
    downloadFile("event_data.json", jsonContent, "application/json");
  };

  const handleDownloadReadme = () => {
    const readmeContent = `# Instrucciones de Validación de Tickets`;
    downloadFile("README_VALIDACION.md", readmeContent.trim(), "text/markdown");
  };

  return (
    <div className="w-full">
        <div className="no-print bg-card/80 backdrop-blur-sm border rounded-lg p-4 mb-8 flex flex-wrap justify-between items-center gap-4 sticky top-[70px] z-40">
            <div>
            <h2 className="text-2xl font-headline">{isRegeneration ? 'Detalles del Evento' : '¡Generación Completa!'}</h2>
            <p className="text-muted-foreground">{isRegeneration ? `Viendo ${tickets.length} tickets para ${eventParams.event_name}` : `${tickets.length} tickets generados con éxito.`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => window.location.href = isRegeneration ? '/history' : '/'}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> {isRegeneration ? 'Volver al Historial' : 'Empezar de Nuevo'}
                </Button>
                
                <Button onClick={(e) => { e.preventDefault(); printWithBlobURL(printRef); }}>
                    Imprimir / Guardar PDF
                </Button>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="secondary" size="icon" onClick={() => { if (secretKey) handleDownloadSecret(); handleDownloadCsv(); if (secretKey) handleDownloadJson(); handleDownloadReadme();}}>
                                <Download />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{secretKey ? "Descargar todos los activos" : "Descargar CSV"}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>

            </div>
        </div>
      
      {/* Contenido para impresion y vista en pantalla */}
      <div ref={printRef}>
        {tickets.map((ticket, i) => (
          <div key={ticket.ticketId} className="ticket-print">
            <div className="ticket-card">
                 <TicketCard
                    eventName={eventParams.event_name}
                    dateTime={eventParams.date_time}
                    venue={eventParams.venue}
                    ticketNumber={ticket.ticketNumber}
                    qrPayload={ticket.qrPayload}
                    shortCode={ticket.shortCode}
                  />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
