'use client';

import { useEffect, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageCircle, Copy, XCircle } from 'lucide-react';

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

  async function handleCancelLink(linkId: string) {
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

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <section className="flex justify-between items-center flex-wrap gap-4">
        <section>
          <h1 className="text-2xl font-headline font-bold">Links de pago</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emitidas {issued} / {quota} · Vendidas {sold}
            {pendingPayment > 0 ? ` · ${pendingPayment} sin pagar` : ''}
          </p>
        </section>
        {maxTickets > 0 ? (
          <section className="flex flex-wrap gap-2">
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

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recaudado (confirmado)</CardDescription>
            <CardTitle className="text-xl">{formatArs(revenue.collected)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Links pagados y ventas en efectivo</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Por cobrar</CardDescription>
            <CardTitle className="text-xl">{formatArs(revenue.pending)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingPayment > 0
                ? `${pendingLinks.length} link${pendingLinks.length === 1 ? '' : 's'} sin pagar`
                : 'Sin pendientes'}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Proyección</CardDescription>
            <CardTitle className="text-xl">{formatArs(revenue.projected)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Si se cobran todos los links pendientes</p>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>Mis links</CardTitle>
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
                placeholder="Comprador, email, teléfono"
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                              onClick={() => handleCancelLink(link.id)}
                              title="Cancelar y liberar cupo"
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
