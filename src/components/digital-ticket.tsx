'use client';

import { useQRAsBase64 } from '@/hooks/useQRAsBase64';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

interface DigitalTicketProps {
  eventName: string;
  /** Texto ya formateado en servidor (evita hydration mismatch Node vs navegador). */
  eventDateLabel: string;
  buyerName: string;
  ticketCode: string;
  qrPayload: string;
  status: string;
}

export function DigitalTicket({
  eventName,
  eventDateLabel,
  buyerName,
  ticketCode,
  qrPayload,
  status,
}: DigitalTicketProps) {
  const { dataUrl: qrDataUrl } = useQRAsBase64(qrPayload, { size: 280 });
  const loading = !qrDataUrl && !!qrPayload;

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="font-headline">{eventName}</CardTitle>
        <p className="text-sm text-muted-foreground">{eventDateLabel}</p>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Badge variant={status === 'VALID' ? 'default' : 'destructive'}>{status}</Badge>
        <p className="font-semibold text-lg">{buyerName}</p>
        <p className="font-mono text-sm text-muted-foreground">{ticketCode}</p>
        {loading ? (
          <Loader2 className="w-48 h-48 animate-spin" />
        ) : qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt="QR entrada"
            width={280}
            height={280}
            className="rounded-lg"
            unoptimized
          />
        ) : null}
        <p className="text-xs text-center text-muted-foreground">
          Presentá este QR en la puerta del evento
        </p>
      </CardContent>
    </Card>
  );
}
