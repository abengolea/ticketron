'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPendingBarOrdersStaff, redeemBarOrderManually } from '@/lib/actions/bar';
import { useIdToken } from '@/hooks/use-id-token';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedBarOrder } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react';

const REFRESH_INTERVAL_MS = 15000;

interface BarPendingOrdersProps {
  eventId: string;
}

/** Pedidos pagados sin entregar: la barra entrega por nombre, sin escanear */
export function BarPendingOrders({ eventId }: BarPendingOrdersProps) {
  const { getIdToken, user } = useIdToken();
  const { toast } = useToast();
  const [orders, setOrders] = useState<SerializedBarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await listPendingBarOrdersStaff(token, eventId);
    if (res.success) setOrders(res.data);
    setLoading(false);
    setRefreshing(false);
  }, [eventId, getIdToken]);

  useEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, load]);

  async function handleDeliver(order: SerializedBarOrder) {
    if (
      !window.confirm(
        `¿Entregar a ${order.buyerName ?? 'sin nombre'}: ${order.itemsLabel}?`
      )
    ) {
      return;
    }
    setDeliveringId(order.id);
    const token = await getIdToken();
    if (!token) {
      setDeliveringId(null);
      return;
    }
    const res = await redeemBarOrderManually(token, { orderId: order.id });
    setDeliveringId(null);
    if (res.success) {
      toast({
        title: 'Pedido entregado',
        description: `${res.data.buyerName ? `${res.data.buyerName} · ` : ''}${res.data.itemsLabel}`,
      });
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
      load();
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.buyerName, o.itemsLabel, o.voucherCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [orders, search]);

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <section className="flex items-start justify-between gap-2">
          <section>
            <CardTitle className="text-lg">
              Pedidos por entregar
              {orders.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {orders.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              El comprador dice su nombre, verificás qué compró y tocás Entregar. Se
              actualiza solo.
            </CardDescription>
          </section>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            disabled={refreshing}
            aria-label="Actualizar pedidos"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </section>
        <section className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>
      </CardHeader>
      <CardContent>
        {loading ? (
          <section className="flex justify-center py-6">
            <Loader2 className="animate-spin w-6 h-6" />
          </section>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            {orders.length === 0
              ? 'No hay pedidos pendientes de entrega'
              : 'Ningún pedido coincide con la búsqueda'}
          </p>
        ) : (
          <section className="space-y-2">
            {filtered.map((o) => (
              <section
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <section className="min-w-0">
                  <p className="font-semibold truncate">
                    {o.buyerName || <span className="text-muted-foreground">Sin nombre</span>}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{o.itemsLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatArs(o.amount)} ·{' '}
                    {new Date(o.createdAt).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </section>
                <Button
                  size="sm"
                  onClick={() => handleDeliver(o)}
                  disabled={deliveringId === o.id}
                  className="shrink-0"
                >
                  {deliveringId === o.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Entregar
                    </>
                  )}
                </Button>
              </section>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
