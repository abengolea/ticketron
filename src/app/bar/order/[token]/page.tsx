'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { getBarOrderByToken } from '@/lib/actions/bar';
import { useQRAsBase64 } from '@/hooks/useQRAsBase64';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedBarOrder } from '@/lib/models';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';

type OrderWithEvent = SerializedBarOrder & { eventName: string };

export default function BarOrderPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;

    async function load() {
      const res = await getBarOrderByToken(token);
      if (stopped) return;
      if (res.success) {
        setOrder(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(() => {
      // Dejar de pollear cuando ya hay voucher emitido
      if (!stopped) load();
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [token]);

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>Pedido de barra</AlertTitle>
          <AlertDescription>{error ?? 'Orden no encontrada'}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (order.status !== 'PAID') {
    return (
      <section className="max-w-md mx-auto py-12 space-y-4">
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Procesando tu pago</AlertTitle>
          <AlertDescription>
            {order.productName} x{order.quantity} · {formatArs(order.amount)}. Cuando se
            acredite el pago, acá va a aparecer tu QR para retirar. Esta página se
            actualiza sola.
          </AlertDescription>
        </Alert>
        <p className="text-center text-sm text-muted-foreground">
          Guardá este link para volver a ver tu voucher.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto space-y-4 py-6">
      <BarVoucher order={order} />
    </section>
  );
}

function BarVoucher({ order }: { order: OrderWithEvent }) {
  const { dataUrl } = useQRAsBase64(order.voucherQrPayload ?? '', { size: 280 });
  const used = order.voucherStatus === 'USED';

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="font-headline">{order.eventName} — Barra</CardTitle>
        <p className="text-sm text-muted-foreground">
          {order.productName} x{order.quantity} · {formatArs(order.amount)}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Badge variant={used ? 'destructive' : 'default'}>
          {used ? 'Ya canjeado' : 'Pagado — listo para retirar'}
        </Badge>
        {order.buyerName && <p className="font-semibold text-lg">{order.buyerName}</p>}
        {order.voucherCode && (
          <p className="font-mono text-sm text-muted-foreground">{order.voucherCode}</p>
        )}
        {used ? (
          <Alert className="border-green-200 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Pedido entregado</AlertTitle>
            <AlertDescription>
              Este voucher ya fue canjeado en la barra
              {order.usedAt
                ? ` el ${new Date(order.usedAt).toLocaleString('es-AR')}`
                : ''}
              .
            </AlertDescription>
          </Alert>
        ) : dataUrl ? (
          <Image
            src={dataUrl}
            alt="QR voucher de barra"
            width={280}
            height={280}
            className="rounded-lg"
            unoptimized
          />
        ) : (
          <Loader2 className="w-48 h-48 animate-spin" />
        )}
        {!used && (
          <p className="text-xs text-center text-muted-foreground">
            Mostrá este QR en la barra para retirar tu pedido
          </p>
        )}
      </CardContent>
    </Card>
  );
}
