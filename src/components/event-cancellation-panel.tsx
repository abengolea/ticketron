'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  cancelEvent,
  getEventRefunds,
  markEventRefundTransferred,
} from '@/lib/actions/events';
import type {
  SerializedEvent,
  SerializedEventRefundRow,
  SerializedEventRefundSummary,
} from '@/lib/models';
import { formatArs } from '@/lib/payment-link-utils';
import { cn, copyTextSafe } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Ban, Copy, Loader2 } from 'lucide-react';

const METHOD_LABELS: Record<'mercadopago' | 'cash', string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
};

interface CancellationAuthProps {
  event: SerializedEvent;
  getIdToken: () => Promise<string | null>;
}

interface CancelEventButtonProps extends CancellationAuthProps {
  onCancelled: (event: SerializedEvent, refunds: SerializedEventRefundSummary) => void;
}

export function CancelEventButton({ event, getIdToken, onCancelled }: CancelEventButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      const token = await getIdToken();
      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Sesión expirada',
          description: 'Volvé a iniciar sesión e intentá de nuevo',
        });
        return;
      }
      const res = await cancelEvent(token, { eventId: event.id });
      if (!res.success) {
        toast({ variant: 'destructive', title: 'No se pudo cancelar', description: res.error });
        return;
      }
      setOpen(false);
      onCancelled(res.data.event, res.data.refunds);
      toast({
        title: 'Evento cancelado',
        description:
          res.data.refunds.totalCount > 0
            ? `Marcá las transferencias a ${res.data.refunds.totalCount} ${res.data.refunds.totalCount === 1 ? 'comprador' : 'compradores'}.`
            : 'No hay pagos para devolver.',
      });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="w-full sm:w-auto">
          <Ban className="w-4 h-4 mr-2" />
          Cancelar evento
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar "{event.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            El evento deja de estar a la venta, las entradas válidas se invalidan y se abre el
            listado de plata a devolver a cada email que pagó. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={cancelling}
            onClick={(e) => {
              e.preventDefault();
              void handleCancel();
            }}
          >
            {cancelling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Cancelar evento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface EventRefundsCardProps extends CancellationAuthProps {
  initialRefunds?: SerializedEventRefundSummary | null;
}

export function EventRefundsCard({ event, getIdToken, initialRefunds }: EventRefundsCardProps) {
  const { toast } = useToast();
  const [refunds, setRefunds] = useState<SerializedEventRefundSummary | null>(
    initialRefunds ?? null
  );
  const [loading, setLoading] = useState(!initialRefunds);
  const [markingKey, setMarkingKey] = useState<string | null>(null);

  const loadRefunds = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await getEventRefunds(token, event.id);
    if (res.success) {
      setRefunds(res.data);
    } else {
      toast({ variant: 'destructive', title: 'No se pudieron cargar los reembolsos', description: res.error });
    }
    setLoading(false);
  }, [event.id, getIdToken, toast]);

  useEffect(() => {
    if (initialRefunds) {
      setLoading(false);
      return;
    }
    void loadRefunds();
  }, [initialRefunds, loadRefunds]);

  async function toggleTransferred(row: SerializedEventRefundRow) {
    const token = await getIdToken();
    if (!token || !refunds) return;

    const nextTransferred = !row.transferred;
    setMarkingKey(row.key);
    setRefunds(optimisticRefunds(refunds, row.key, nextTransferred));

    const res = await markEventRefundTransferred(token, {
      eventId: event.id,
      refundKey: row.key,
      transferred: nextTransferred,
    });
    setMarkingKey(null);

    if (res.success) {
      setRefunds(res.data);
    } else {
      setRefunds(optimisticRefunds(refunds, row.key, row.transferred));
      toast({ variant: 'destructive', title: 'No se pudo marcar', description: res.error });
    }
  }

  async function copyValue(label: string, value: string) {
    const copied = await copyTextSafe(value);
    toast({
      title: copied ? `${label} copiado` : 'No se pudo copiar',
      description: copied ? value : undefined,
    });
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle>Reembolsos por transferencia</CardTitle>
        <CardDescription>
          Tocá cada fila a medida que mandás la plata. El tilde queda guardado.
        </CardDescription>
        {refunds && refunds.totalCount > 0 && (
          <p className="text-sm pt-1">
            <span className="font-medium">{formatArs(refunds.pendingAmount)}</span>
            {' pendientes · '}
            {refunds.transferredCount}/{refunds.totalCount} hechas
            {refunds.transferredAmount > 0 ? ` · ${formatArs(refunds.transferredAmount)} enviados` : ''}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading || !refunds ? (
          <section className="flex justify-center py-8">
            <Loader2 className="animate-spin w-6 h-6" />
          </section>
        ) : refunds.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No hay compras pagadas para devolver. Las cortesías no se reembolsan.
          </p>
        ) : (
          <ul className="space-y-2">
            {refunds.rows.map((row) => {
              const title = row.email ?? row.buyerNames[0] ?? 'Compra sin email';
              const methods = row.paymentMethods.map((m) => METHOD_LABELS[m]).join(' · ');
              return (
                <li key={row.key}>
                  <section
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50',
                      row.transferred && 'opacity-60'
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() => void toggleTransferred(row)}
                      disabled={markingKey === row.key}
                      aria-label={
                        row.transferred
                          ? `Desmarcar transferencia a ${title}`
                          : `Marcar transferencia de ${formatArs(row.amount)} a ${title}`
                      }
                    >
                      <Checkbox
                        checked={row.transferred}
                        className="mt-1 pointer-events-none"
                        aria-hidden
                      />
                      <section className="min-w-0 flex-1 space-y-0.5">
                        <p className={cn('font-medium break-all', row.transferred && 'line-through')}>
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            row.email ? row.buyerNames.join(', ') : null,
                            `${row.ticketQuantity} ${row.ticketQuantity === 1 ? 'entrada' : 'entradas'}`,
                            row.purchaseCount > 1 ? `${row.purchaseCount} compras` : null,
                            methods || null,
                            row.buyerPhone,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </section>
                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        {formatArs(row.amount)}
                      </p>
                    </button>
                    <section className="flex shrink-0 flex-col gap-1">
                      {row.email && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Copiar email"
                          onClick={() => void copyValue('Email', row.email!)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Copiar monto"
                        onClick={() => void copyValue('Monto', String(row.amount))}
                      >
                        <span className="text-[10px] font-semibold">$</span>
                      </Button>
                    </section>
                  </section>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function optimisticRefunds(
  current: SerializedEventRefundSummary,
  key: string,
  transferred: boolean
): SerializedEventRefundSummary {
  const rows = current.rows.map((row) =>
    row.key === key
      ? {
          ...row,
          transferred,
          transferredAt: transferred ? new Date().toISOString() : undefined,
        }
      : row
  );
  const transferredAmount = rows.filter((r) => r.transferred).reduce((sum, r) => sum + r.amount, 0);
  rows.sort((a, b) => {
    if (a.transferred !== b.transferred) return a.transferred ? 1 : -1;
    if (b.amount !== a.amount) return b.amount - a.amount;
    return (a.email ?? a.buyerNames[0] ?? a.key).localeCompare(
      b.email ?? b.buyerNames[0] ?? b.key,
      'es'
    );
  });
  return {
    ...current,
    rows,
    transferredAmount,
    pendingAmount: current.totalAmount - transferredAmount,
    transferredCount: rows.filter((r) => r.transferred).length,
  };
}
