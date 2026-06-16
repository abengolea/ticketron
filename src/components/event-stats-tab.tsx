'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEventPostStats } from '@/lib/actions/event-stats';
import { formatArs } from '@/lib/payment-link-utils';
import type { EventPostStats } from '@/lib/models';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Users, Ticket, DoorOpen, Beer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface EventStatsTabProps {
  eventId: string;
  getIdToken: () => Promise<string | null>;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{title}</CardDescription>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function EventStatsTab({ eventId, getIdToken }: EventStatsTabProps) {
  const [stats, setStats] = useState<EventPostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const res = await getEventPostStats(token, eventId);
    if (res.success) {
      setStats(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [eventId, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-8 h-8" />
      </section>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error ?? 'No se pudieron cargar las estadísticas'}
        </CardContent>
      </Card>
    );
  }

  const { tickets, revenue, bySeller, entryTimeline, bar } = stats;
  const chartData = entryTimeline.map((h) => ({
    name: h.label.replace(/^[^,]+,\s*/, ''),
    entradas: h.count,
    fullLabel: h.label,
  }));

  const hasBarActivity = bar.ordersPaid > 0;

  return (
    <section className="space-y-6">
      {!stats.isPastEvent && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          El evento aún no pasó. Estos números se actualizan en vivo conforme se escanean entradas.
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Entradas emitidas"
          value={String(tickets.active)}
          description={`${tickets.used} usadas · ${tickets.valid} sin ingresar`}
          icon={Ticket}
        />
        <StatCard
          title="Asistencia"
          value={`${stats.attendanceRate}%`}
          description={`${tickets.used} de ${tickets.active} ingresaron`}
          icon={DoorOpen}
        />
        <StatCard
          title="Recaudación entradas"
          value={formatArs(revenue.collected)}
          description={
            revenue.pending > 0
              ? `${formatArs(revenue.pending)} pendiente de cobro`
              : 'Links pagados confirmados'
          }
          icon={TrendingUp}
        />
        <StatCard
          title="Capacidad"
          value={`${tickets.active} / ${stats.event.capacity}`}
          description={
            stats.event.capacity > 0
              ? `${Math.round((tickets.active / stats.event.capacity) * 100)}% vendido`
              : undefined
          }
          icon={Users}
        />
      </section>

      {(tickets.cancelled > 0 || tickets.archived > 0) && (
        <section className="flex flex-wrap gap-2">
          {tickets.cancelled > 0 && (
            <Badge variant="secondary">{tickets.cancelled} canceladas</Badge>
          )}
          {tickets.archived > 0 && (
            <Badge variant="outline">{tickets.archived} archivadas</Badge>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ingresos por hora</CardTitle>
            <CardDescription>
              {stats.firstEntryAt && stats.lastEntryAt
                ? `Primera entrada ${new Date(stats.firstEntryAt).toLocaleString('es-AR')} · última ${new Date(stats.lastEntryAt).toLocaleString('es-AR')}`
                : 'Aún no hay entradas escaneadas'}
              {stats.peakEntryHour && ` · pico: ${stats.peakEntryHour}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entryTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Todavía no se registraron ingresos en puerta.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                    <Tooltip
                      formatter={(value: number) => [`${value} entradas`, 'Ingresos']}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fullLabel ?? ''
                      }
                    />
                    <Bar dataKey="entradas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por medio de pago</CardTitle>
            <CardDescription>Entradas activas (no canceladas ni archivadas)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <section className="flex justify-between items-center">
              <span className="text-sm">Mercado Pago</span>
              <span className="text-sm font-medium">
                {revenue.byMethod.mercadopago.count} · {formatArs(revenue.byMethod.mercadopago.revenue)}
              </span>
            </section>
            <section className="flex justify-between items-center">
              <span className="text-sm">Efectivo</span>
              <span className="text-sm font-medium">
                {revenue.byMethod.cash.count} · {formatArs(revenue.byMethod.cash.revenue)}
              </span>
            </section>
            <section className="flex justify-between items-center">
              <span className="text-sm">Cortesía</span>
              <span className="text-sm font-medium">
                {revenue.byMethod.complimentary.count} · {formatArs(0)}
              </span>
            </section>
            <section className="border-t pt-4 flex justify-between items-center">
              <span className="text-sm font-medium">Total recaudado</span>
              <span className="font-bold">{formatArs(revenue.collected)}</span>
            </section>
          </CardContent>
        </Card>
      </section>

      {bySeller.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por vendedor</CardTitle>
            <CardDescription>Vendidas vs ingresaron vs recaudación</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Vendidas</TableHead>
                  <TableHead className="text-right">Ingresaron</TableHead>
                  <TableHead className="text-right">Asistencia</TableHead>
                  <TableHead className="text-right">Recaudación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySeller.map((row) => {
                  const rate =
                    row.sold > 0 ? Math.round((row.used / row.sold) * 100) : 0;
                  return (
                    <TableRow key={row.sellerId}>
                      <TableCell className="font-medium">{row.sellerName}</TableCell>
                      <TableCell className="text-right">{row.sold}</TableCell>
                      <TableCell className="text-right">{row.used}</TableCell>
                      <TableCell className="text-right">{rate}%</TableCell>
                      <TableCell className="text-right">{formatArs(row.revenue)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {hasBarActivity && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Beer className="h-5 w-5 text-muted-foreground" />
            <section>
              <CardTitle className="text-lg">Barra</CardTitle>
              <CardDescription>Ventas y entregas de vouchers</CardDescription>
            </section>
          </CardHeader>
          <CardContent>
            <section className="grid gap-4 sm:grid-cols-3">
              <section>
                <p className="text-sm text-muted-foreground">Recaudado</p>
                <p className="text-xl font-bold">{formatArs(bar.revenue)}</p>
              </section>
              <section>
                <p className="text-sm text-muted-foreground">Órdenes pagadas</p>
                <p className="text-xl font-bold">{bar.ordersPaid}</p>
              </section>
              <section>
                <p className="text-sm text-muted-foreground">Entregados</p>
                <p className="text-xl font-bold">
                  {bar.vouchersRedeemed}
                  {bar.vouchersPending > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({bar.vouchersPending} pendientes)
                    </span>
                  )}
                </p>
              </section>
            </section>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
