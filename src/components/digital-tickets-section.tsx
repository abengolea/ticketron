'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { DigitalTicket } from '@/components/digital-ticket';
import { Button } from '@/components/ui/button';
import { buildDigitalTicketsPdf } from '@/lib/pdf-utils';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2 } from 'lucide-react';

export type DigitalTicketItem = {
  eventName: string;
  eventDate: string;
  buyerName: string;
  ticketCode: string;
  qrPayload: string;
  status: string;
};

interface DigitalTicketsSectionProps {
  tickets: DigitalTicketItem[];
}

export function DigitalTicketsSection({ tickets }: DigitalTicketsSectionProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPdf() {
    const withQr = tickets.filter((t) => t.qrPayload);
    if (withQr.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin QR',
        description: 'No hay códigos QR disponibles para exportar.',
      });
      return;
    }

    setDownloading(true);
    try {
      const entries = await Promise.all(
        withQr.map(async (t) => ({
          eventName: t.eventName,
          eventDate: t.eventDate,
          buyerName: t.buyerName,
          ticketCode: t.ticketCode,
          qrDataUrl: await QRCode.toDataURL(t.qrPayload, {
            width: 280,
            margin: 1,
            errorCorrectionLevel: 'M',
          }),
        }))
      );

      const fileName =
        entries.length === 1
          ? `entrada_${entries[0].ticketCode}.pdf`
          : `entradas_${entries.length}.pdf`;

      await buildDigitalTicketsPdf(entries, fileName);
      toast({
        title: 'PDF descargado',
        description: fileName,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error al generar PDF',
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="py-8 space-y-6 max-w-md mx-auto">
      <div className="flex justify-center">
        <Button
          onClick={handleDownloadPdf}
          disabled={downloading || tickets.length === 0}
          variant="outline"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Descargar PDF
          {tickets.length > 1 ? ` (${tickets.length} entradas)` : ''}
        </Button>
      </div>
      {tickets.map((ticket) => (
        <DigitalTicket
          key={ticket.ticketCode}
          eventName={ticket.eventName}
          eventDate={ticket.eventDate}
          buyerName={ticket.buyerName}
          ticketCode={ticket.ticketCode}
          qrPayload={ticket.qrPayload}
          status={ticket.status}
        />
      ))}
    </section>
  );
}
