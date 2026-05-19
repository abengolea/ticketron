'use client';

import { useRef, useState } from 'react';
import { TicketCardPrint } from '@/components/ticket-card-print';
import { Button } from '@/components/ui/button';
import {
  buildPdfFromPngsWithTemplate,
  captureTicketPNG,
  getPlanoCDRTemplate,
} from '@/lib/pdf-utils';
import { waitForImagesInContainer } from '@/lib/image-utils';
import type { SerializedTicket } from '@/lib/models';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Printer } from 'lucide-react';

interface EventTicketsPdfExportProps {
  tickets: SerializedTicket[];
  eventName: string;
  eventDate: string;
  eventLocation?: string;
}

export function EventTicketsPdfExport({
  tickets,
  eventName,
  eventDate,
  eventLocation,
}: EventTicketsPdfExportProps) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const validTickets = tickets.filter((t) => t.status === 'VALID');
  const dateLabel = new Date(eventDate).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const venue = eventLocation || '—';

  async function handleExport() {
    if (validTickets.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin entradas',
        description: 'No hay entradas válidas para imprimir',
      });
      return;
    }

    setExporting(true);
    try {
      const template = getPlanoCDRTemplate();
      const slotSize = { w: template.slots[0].w, h: template.slots[0].h };
      const images: string[] = [];

      for (let i = 0; i < validTickets.length; i++) {
        const node = refs.current[i];
        if (!node) continue;
        await waitForImagesInContainer(node);
        const png = await captureTicketPNG(node, slotSize, 300);
        images.push(png);
        if ((i + 1) % 3 === 0) await new Promise((r) => setTimeout(r, 40));
      }

      const safeName = eventName.normalize('NFKD').replace(/[^\w-]+/g, '_');
      const fileName = `${safeName}_${validTickets.length}_entradas.pdf`;
      await buildPdfFromPngsWithTemplate(images, fileName, template);
      toast({ title: 'PDF generado', description: fileName });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error al generar PDF',
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <section className="fixed left-[-99999px] top-0 z-[-1] opacity-0 pointer-events-none" aria-hidden>
        {validTickets.map((ticket, i) => (
          <section
            key={ticket.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
          >
            <TicketCardPrint
              eventName={eventName}
              dateTime={dateLabel}
              venue={venue}
              ticketNumber={i + 1}
              qrPayload={ticket.qrPayload}
              shortCode={ticket.ticketCode}
              variant="large"
            />
          </section>
        ))}
      </section>

      <Button onClick={handleExport} disabled={exporting || validTickets.length === 0}>
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Printer className="w-4 h-4 mr-2" />
        )}
        Imprimir PDF ({validTickets.length})
      </Button>
    </>
  );
}
