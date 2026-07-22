'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdToken } from '@/hooks/use-id-token';
import {
  listPendingEventFees,
  startEventFeePayment,
} from '@/lib/actions/event-fees';
import type { SerializedEventFeeCharge } from '@/lib/models';
import { formatArs } from '@/lib/payment-link-utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Receipt } from 'lucide-react';

export function PendingEventFeesBanner() {
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [charges, setCharges] = useState<SerializedEventFeeCharge[]>([]);
  const [hasBillingProfile, setHasBillingProfile] = useState(true);
  const [platformOk, setPlatformOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getIdToken();
      if (!token) return;
      const res = await listPendingEventFees(token);
      if (res.success) {
        setCharges(res.data.charges);
        setHasBillingProfile(res.data.hasBillingProfile);
        setPlatformOk(res.data.platformPaymentsConfigured);
      }
      setLoading(false);
    }
    void load();
  }, [getIdToken]);

  async function handlePay(charge: SerializedEventFeeCharge) {
    if (!hasBillingProfile) {
      toast({
        variant: 'destructive',
        title: 'Faltan datos fiscales',
        description: 'Completá responsable inscripto o monotributo en Ajustes.',
      });
      return;
    }
    setPayingId(charge.id);
    const token = await getIdToken();
    if (!token) return;
    const res = await startEventFeePayment(token, charge.id);
    setPayingId(null);
    if (!res.success) {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
      return;
    }
    window.location.href = res.data.initPoint;
  }

  if (loading || charges.length === 0) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5">
      <Receipt className="h-4 w-4" />
      <AlertTitle>Fees pendientes de abonar</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          Después del evento, Ticketron cobra un fee fijo por entradas emitidas (sin
          porcentaje sobre el precio). El pago va a Notificas SRL y se emite factura según
          tu condición fiscal.
        </p>
        {!hasBillingProfile && (
          <p className="text-sm">
            Primero completá tus datos fiscales en{' '}
            <Link href="/admin/settings" className="text-primary underline">
              Ajustes
            </Link>
            .
          </p>
        )}
        {!platformOk && (
          <p className="text-sm text-destructive">
            El cobro de fees aún no está configurado en el servidor. Contactá a soporte.
          </p>
        )}
        <ul className="space-y-3">
          {charges.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium text-foreground">{c.eventName}</p>
                <p className="text-muted-foreground">
                  {c.ticketsIssued} entrada{c.ticketsIssued === 1 ? '' : 's'} ×{' '}
                  {formatArs(c.pricePerTicket)}
                  {c.pricePerEvent > 0 ? ` + ${formatArs(c.pricePerEvent)} evento` : ''}{' '}
                  = <strong className="text-foreground">{formatArs(c.amount)}</strong>
                </p>
              </div>
              <Button
                size="sm"
                disabled={!platformOk || !hasBillingProfile || payingId === c.id}
                onClick={() => handlePay(c)}
              >
                {payingId === c.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Pagar con Mercado Pago
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
