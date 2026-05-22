'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  cancelPaymentLink,
  listSellerPaymentLinks,
} from '@/lib/actions/payment-links';
import { getSellerDashboard } from '@/lib/actions/sellers';
import { CreatePaymentLinkDialog } from '@/components/create-payment-link-dialog';
import { CreateCashSaleDialog } from '@/components/create-cash-sale-dialog';
import {
  computePaymentLinkRevenue,
  formatArs,
  isPaymentLinkAwaitingPayment,
} from '@/lib/payment-link-utils';
import type { SerializedPaymentLink } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  Banknote,
  Calendar,
  Clock,
  Loader2,
  MessageCircle,
  Copy,
  Ticket,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Sin pagar',
  PAID: 'Pagado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

type LinkFilter = 'pending' | 'all';

function isComplimentaryLink(link: SerializedPaymentLink) {
  return link.linkType === 'complimentary';
}

function isCashLink(link: SerializedPaymentLink) {
  return link.linkType === 'cash';
}

function isPaidTicketLink(link: SerializedPaymentLink) {
  return (
    link.status === 'PAID' && (isComplimentaryLink(link) || isCashLink(link))
  );
}

function isMercadoPagoPaymentLink(link: SerializedPaymentLink) {
  return (link.linkType ?? 'payment') === 'payment';
}

function matchesLinkFilters(
  link: SerializedPaymentLink,
  filter: LinkFilter,
  search: string
) {
  if (!isMercadoPagoPaymentLink(link)) {
    if (filter === 'pending') return false;
    return true;
  }
  if (filter === 'pending' && !isPaymentLinkAwaitingPayment(link)) return false;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const haystack = [
      link.recipientLabel,
      link.buyerName,
      link.buyerLastName,
      link.buyerEmail,
      link.buyerPhone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export default function SellerEventPage() {
  return (
    <RoleGuard allowedRoles={['seller']}>
      <SellerEventContent />
    </RoleGuard>
  );
}

function SellerEventContent() {
  const { eventId } = useParams<{ eventId: string }>();
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [links, setLinks] = useState<SerializedPaymentLink[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [unitPrice, setUnitPrice] = useState(0);
  const [maxTickets, setMaxTickets] = useState(1);
  const [issued, setIssued] = useState(0);
  const [sold, setSold] = useState(0);
  const [pendingPayment, setPendingPayment] = useState(0);
  const [quota, setQuota] = useState(0);
  const [loading, setLoading] = useState(true);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('pending');
  const [linkSearch, setLinkSearch] = useState('');

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const [linksRes, dashRes] = await Promise.all([
      listSellerPaymentLinks(token, eventId),
      getSellerDashboard(token),
    ]);
    if (linksRes.success) setLinks(linksRes.data);
    if (dashRes.success) {
      const ev = dashRes.data.find((a) => a.eventId === eventId);
      if (ev) {
        setEventName(ev.eventName);
        setEventDate(ev.eventDate);
        setUnitPrice(ev.price);
        setQuota(ev.quota);
        setSold(ev.sold);
        setPendingPayment(ev.pendingPayment);
        setIssued(ev.issued);
        setMaxTickets(ev.remaining > 0 ? Math.min(ev.remaining, 20) : 0);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function shareWhatsApp(
    url: string,
    opts: { cortesia?: boolean; efectivo?: boolean; buyerLabel?: string } = {}
  ) {
    let text: string;
    if (opts.cortesia) {
      text = `Te enviamos tu entrada de cortesía: ${url}`;
    } else if (opts.efectivo) {
      text = opts.buyerLabel
        ? `Hola ${opts.buyerLabel}, acá están tus entradas (pago en efectivo): ${url}`
        : `Acá están tus entradas (pago en efectivo): ${url}`;
    } else {
      text = `Comprá tu entrada acá: ${url}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function sharePendingReminder(link: SerializedPaymentLink, url: string) {
    const buyer = [link.buyerName, link.buyerLastName].filter(Boolean).join(' ');
    const text = buyer
      ? `Hola ${buyer}, recordá completar el pago de tu entrada: ${url}`
      : `Recordá completar el pago de tu entrada: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: 'Copiado' });
  }

  async function handleCancelLink(linkId: string, label?: string) {
    const detail = label ? ` (${label})` : '';
    if (
      !window.confirm(
        `¿Anular este link de pago${detail}? Se liberan las entradas reservadas.`
      )
    ) {
      return;
    }
    const token = await getIdToken();
    if (!token) return;
    const res = await cancelPaymentLink(token, { paymentLinkId: linkId });
    if (res.success) {
      toast({ title: 'Link cancelado', description: 'Cupos liberados.' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const filteredLinks = links.filter((link) => matchesLinkFilters(link, linkFilter, linkSearch));
  const pendingLinks = links.filter(
    (l) => isMercadoPagoPaymentLink(l) && isPaymentLinkAwaitingPayment(l)
  );
  const revenue = computePaymentLinkRevenue(links);
  const recentLinks = links.slice(0, 8);
  const remaining = Math.max(0, quota - issued);
  const quotaPct = quota > 0 ? Math.min(100, Math.round((issued / quota) * 100)) : 0;

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <nav className="text-sm">
        <Link
          href="/seller"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver a mis eventos
        </Link>
      </nav>

      <header className="space-y-4">
        <section className="flex justify-between items-start flex-wrap gap-4">
          <section className="space-y-2 min-w-0">
            <h1 className="text-2xl font-headline font-bold">{eventName || 'Evento'}</h1>
            {eventDate && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                {new Date(eventDate).toLocaleString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tu cupo</span>
                <span>
                  <strong>{issued}</strong> / {quota} emitidas
                  {remaining > 0 && (
                    <span className="text-muted-foreground"> · {remaining} libres</span>
                  )}
                </span>
              </div>
              <Progress value={quotaPct} className="h-2" />
            </div>
          </section>
          {maxTickets > 0 ? (
            <section className="flex flex-wrap gap-2 shrink-0">
              <CreatePaymentLinkDialog
                eventId={eventId}
                eventName={eventName}
                unitPrice={unitPrice}
                maxTickets={maxTickets}
                getIdToken={getIdToken}
                onCreated={load}
              />
              <CreateCashSaleDialog
                eventId={eventId}
                eventName={eventName}
                unitPrice={unitPrice}
                maxTickets={maxTickets}
                getIdToken={getIdToken}
                onCreated={load}
              />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Cupo de entradas emitidas agotado</p>
          )}
        </section>
      </header>

      <section className="space-y-6" aria-labelledby="event-control-heading">
        <div>
          <h2 id="event-control-heading" className="text-xl font-semibold">
            Panel de control
          </h2>
          <p className="text-sm text-muted-foreground">
            Métricas, seguimiento y gestión de links de este evento
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5" />
                Entradas vendidas
              </CardDescription>
              <CardTitle className="text-2xl">{sold}</CardTitle>
              <p className="text-xs text-muted-foreground">
                De {quota} asignadas · {remaining} cupo libre
              </p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Reservadas sin pagar
              </CardDescription>
              <CardTitle className="text-2xl">{pendingPayment}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {pendingLinks.length} link{pendingLinks.length === 1 ? '' : 's'} activo
                {pendingLinks.length === 1 ? '' : 's'}
              </p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                Recaudado
              </CardDescription>
              <CardTitle className="text-2xl">{formatArs(revenue.collected)}</CardTitle>
              <p className="text-xs text-muted-foreground">Links pagados y efectivo</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Por cobrar / proyección
              </CardDescription>
              <CardTitle className="text-2xl">{formatArs(revenue.pending)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Si cobrás todo: {formatArs(revenue.projected)}
              </p>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Links sin pagar
              </CardTitle>
              <CardDescription>
                Copiá el checkout o recordá el pago por WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tenés links pendientes de cobro en este evento
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingLinks.map((link) => {
                      const url = `${appUrl}/checkout/${link.token}`;
                      return (
                        <TableRow key={link.id}>
                          <TableCell>
                            {link.recipientLabel || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{formatArs(link.amount ?? 0)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyUrl(url)}
                                title="Copiar link"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sharePendingReminder(link, url)}
                                title="Recordar por WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handleCancelLink(
                                    link.id,
                                    link.recipientLabel ||
                                      [link.buyerName, link.buyerLastName]
                                        .filter(Boolean)
                                        .join(' ') ||
                                      undefined
                                  )
                                }
                                title="Anular link"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Banknote className="w-5 h-5" />
                Actividad reciente
              </CardTitle>
              <CardDescription>Últimos links y ventas de este evento</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Todavía no generaste links en este evento
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLinks.map((link) => {
                      const cortesia = isComplimentaryLink(link);
                      const efectivo = isCashLink(link);
                      return (
                        <TableRow key={link.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {cortesia
                                ? 'Cortesía'
                                : efectivo
                                  ? 'Efectivo'
                                  : (STATUS_LABELS[link.status] ?? link.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {cortesia ? '—' : formatArs(link.amount ?? 0)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(link.createdAt).toLocaleString('es-AR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>Gestión de links</CardTitle>
          <CardDescription>
            Listado completo con filtros, búsqueda y acciones por comprador
          </CardDescription>
          <section className="grid gap-3 sm:grid-cols-2 max-w-xl">
            <section>
              <Label htmlFor="linkFilter" className="text-xs text-muted-foreground">
                Mostrar
              </Label>
              <Select
                value={linkFilter}
                onValueChange={(v) => setLinkFilter(v as LinkFilter)}
              >
                <SelectTrigger id="linkFilter" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Sin pagar (para avisar)</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </section>
            <section>
              <Label htmlFor="linkSearch" className="text-xs text-muted-foreground">
                Buscar
              </Label>
              <Input
                id="linkSearch"
                className="mt-1"
                placeholder="Referencia, comprador, email, teléfono"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
              />
            </section>
          </section>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {linkFilter === 'pending'
                      ? 'No tenés links sin pagar'
                      : 'No hay links para mostrar'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLinks.map((link) => {
                  const cortesia = isComplimentaryLink(link);
                  const efectivo = isCashLink(link);
                  const paidTicket = isPaidTicketLink(link);
                  const url = paidTicket
                    ? `${appUrl}/ticket?token=${encodeURIComponent(link.token)}`
                    : `${appUrl}/checkout/${link.token}`;

                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        {link.recipientLabel ? (
                          <span className="font-medium">{link.recipientLabel}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{link.ticketQuantity ?? 1}</TableCell>
                      <TableCell>
                        {cortesia ? 'Cortesía' : efectivo ? `$${link.amount} (efectivo)` : `$${link.amount}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {cortesia
                            ? 'Cortesía'
                            : efectivo
                              ? 'Efectivo'
                              : (STATUS_LABELS[link.status] ?? link.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                          link.buyerEmail ||
                          '—'}
                        {link.buyerPhone && (
                          <span className="block text-xs text-muted-foreground">
                            {link.buyerPhone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(link.createdAt).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="flex gap-2">
                        {paidTicket && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                shareWhatsApp(url, {
                                  cortesia,
                                  efectivo,
                                  buyerLabel: [link.buyerName, link.buyerLastName]
                                    .filter(Boolean)
                                    .join(' '),
                                })
                              }
                            >
                              <MessageCircle className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {!paidTicket && link.status === 'PENDING_PAYMENT' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sharePendingReminder(link, url)}
                              title="Recordar pago por WhatsApp"
                            >
                              <MessageCircle className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleCancelLink(
                                  link.id,
                                  link.recipientLabel ||
                                    [link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                                    undefined
                                )
                              }
                              title="Anular link y liberar cupo"
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
