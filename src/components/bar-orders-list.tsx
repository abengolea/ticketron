'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBarOrders, redeemBarOrderManually } from '@/lib/actions/bar';
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

type StatusFilter = 'all' | 'to-deliver' | 'delivered' | 'unpaid';

function orderStatusBadge(o: SerializedBarOrder) {
  if (o.status === 'CANCELLED') return <Badge variant="outline">Cancelado</Badge>;
  if (o.status === 'PENDING_PAYMENT') return <Badge variant="outline">Sin pagar</Badge>;
  if (o.voucherStatus === 'USED') return <Badge variant="secondary">Entregado</Badge>;
  return <Badge>Por entregar</Badge>;
}

interface BarOrdersListProps {
  eventId: string;
}

/** Vista completa de pedidos y pagos de barra para admin / jefe de barra */
export function BarOrdersList({ eventId }: BarOrdersListProps) {
  const { getIdToken, user } = useIdToken();
  const { toast } = useToast();
  const [orders, setOrders] = useState<SerializedBarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await listBarOrders(token, eventId);
    if (res.success) setOrders(res.data);
    setLoading(false);
    setRefreshing(false);
  }, [eventId, getIdToken]);

  useEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, 20000);
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
      toast({ title: 'Pedido entregado', description: order.itemsLabel });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
      load();
    }
  }

  const paid = useMemo(() => orders.filter((o) => o.status === 'PAID'), [orders]);
  const delivered = paid.filter((o) => o.voucherStatus === 'USED');
  const toDeliver = paid.filter((o) => o.voucherStatus !== 'USED');
  const revenue = paid.reduce((sum, o) => sum + o.amount, 0);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter === 'to-deliver') {
      list = list.filter((o) => o.status === 'PAID' && o.voucherStatus !== 'USED');
    } else if (statusFilter === 'delivered') {
      list = list.filter((o) => o.status === 'PAID' && o.voucherStatus === 'USED');
    } else if (statusFilter === 'unpaid') {
      list = list.filter((o) => o.status === 'PENDING_PAYMENT');
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      [o.buyerName, o.itemsLabel, o.voucherCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [orders, search, statusFilter]);

  if (!user) return null;

  const filterButtons: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: `Todos (${orders.length})` },
    { value: 'to-deliver', label: `Por entregar (${toDeliver.length})` },
    { value: 'delivered', label: `Entregados (${delivered.length})` },
    { value: 'unpaid', label: 'Sin pagar' },
  ];

  return (
    <section className="space-y-4">
      <section className="grid grid-cols-3 gap-2">
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardDescription className="text-xs">Recaudado</CardDescription>
            <CardTitle className="text-lg">{formatArs(revenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardDescription className="text-xs">Por entregar</CardDescription>
            <CardTitle className="text-lg">{toDeliver.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardDescription className="text-xs">Entregados</CardDescription>
            <CardTitle className="text-lg">{delivered.length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader className="space-y-3">
          <section className="flex items-start justify-between gap-2">
            <section>
              <CardTitle className="text-lg">Pedidos de barra</CardTitle>
              <CardDescription>Pagos y entregas del evento. Se actualiza solo.</CardDescription>
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
          <section className="flex flex-wrap gap-1.5">
            {filterButtons.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={statusFilter === f.value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
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
                ? 'Aún no hay pedidos de barra'
                : 'Ningún pedido coincide con el filtro'}
            </p>
          ) : (
            <section className="space-y-2">
              {filtered.map((o) => {
                const canDeliver = o.status === 'PAID' && o.voucherStatus !== 'USED';
                return (
                  <section
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <section className="min-w-0">
                      <section className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">
                          {o.buyerName || (
                            <span className="text-muted-foreground">Sin nombre</span>
                          )}
                        </p>
                        {orderStatusBadge(o)}
                      </section>
                      <p className="text-sm text-muted-foreground truncate">{o.itemsLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatArs(o.amount)} ·{' '}
                        {new Date(o.createdAt).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {o.voucherStatus === 'USED' && o.usedAt
                          ? ` · entregado ${new Date(o.usedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </p>
                    </section>
                    {canDeliver && (
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
                    )}
                  </section>
                );
              })}
            </section>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
