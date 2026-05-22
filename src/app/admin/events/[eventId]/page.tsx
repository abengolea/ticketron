'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { getEvent, updateEvent } from '@/lib/actions/events';
import {
  listUsers,
  assignSellerAccess,
  listSellerAccessAdmin,
} from '@/lib/actions/sellers';
import {
  listSalesAdmin,
  cancelPaymentLink,
  getEventReservationStats,
} from '@/lib/actions/payment-links';
import { listTicketsForEvent, exportTicketsCsv, archiveTicket } from '@/lib/actions/tickets';
import { computeTicketTotals, countsTowardRevenue } from '@/lib/ticket-totals';
import { CreatePaymentLinkDialog } from '@/components/create-payment-link-dialog';
import { CreateComplimentaryLinkDialog } from '@/components/create-complimentary-link-dialog';
import { CreateCashSaleDialog } from '@/components/create-cash-sale-dialog';
import { EventTicketsPdfExport } from '@/components/event-tickets-pdf-export';
import type {
  EventReservationStats,
  SerializedEvent,
  SerializedPaymentLink,
  SerializedTicketWithPayment,
} from '@/lib/models';
import {
  computePaymentLinkRevenue,
  formatArs,
  isPaymentLinkAwaitingPayment,
} from '@/lib/payment-link-utils';
import { getTicketPaymentMethod } from '@/lib/payment-display';
import type { SerializedSellerAccess } from '@/lib/models';
import type { UserListItem } from '@/lib/actions/sellers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { downloadFile } from '@/lib/utils';
import {
  Archive,
  ArrowLeft,
  Copy,
  DoorOpen,
  Download,
  Link2,
  Loader2,
  MessageCircle,
  MoreVertical,
  QrCode,
  Settings2,
  Users,
  XCircle,
} from 'lucide-react';

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventToEditForm(event: SerializedEvent) {
  return {
    name: event.name,
    date: toDatetimeLocalValue(event.date),
    location: event.location ?? '',
    capacity: event.capacity,
    price: event.price,
    active: event.active,
  };
}

const TICKET_STATUS: Record<string, string> = {
  VALID: 'Válida',
  USED: 'Usada',
  CANCELLED: 'Cancelada',
};

type PaymentFilter = 'all' | 'paid' | 'mercadopago' | 'cash' | 'complimentary';
type StatusFilter = 'all' | 'VALID' | 'USED' | 'CANCELLED';
type PaymentLinkFilter = 'pending' | 'all';

const PAYMENT_LINK_STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'Sin pagar',
  PAID: 'Pagado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

function computeSellerQuotaSummary(access: SerializedSellerAccess[], capacity: number) {
  const active = access.filter((a) => a.active);
  const assignedQuota = active.reduce((sum, a) => sum + a.quota, 0);
  const soldBySellers = active.reduce((sum, a) => sum + a.sold, 0);
  const pendingBySellers = active.reduce((sum, a) => sum + (a.pendingPayment ?? 0), 0);
  const remainingWithSellers = active.reduce((sum, a) => sum + a.remaining, 0);
  const unassignedQuota = Math.max(0, capacity - assignedQuota);
  const overAssigned = Math.max(0, assignedQuota - capacity);
  return {
    assignedQuota,
    soldBySellers,
    pendingBySellers,
    remainingWithSellers,
    unassignedQuota,
    overAssigned,
    sellerCount: active.length,
  };
}

const LINK_TYPE_LABELS: Record<string, string> = {
  payment: 'Link de pago',
  complimentary: 'Cortesía',
  cash: 'Efectivo',
};

function matchesPaymentLinkListFilters(
  link: SerializedPaymentLink,
  filter: PaymentLinkFilter,
  search: string
) {
  if (filter === 'pending' && !isPaymentLinkAwaitingPayment(link)) return false;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const haystack = [
      link.recipientLabel,
      link.buyerName,
      link.buyerLastName,
      link.buyerEmail,
      link.buyerPhone,
      link.token,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function matchesTicketFilters(
  ticket: SerializedTicketWithPayment,
  paymentFilter: PaymentFilter,
  statusFilter: StatusFilter,
  search: string
) {
  if (paymentFilter === 'paid') {
    if (ticket.paymentMethod === 'complimentary') return false;
  } else if (paymentFilter !== 'all' && ticket.paymentMethod !== paymentFilter) {
    return false;
  }
  if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const haystack = [ticket.buyerName, ticket.buyerEmail, ticket.ticketCode]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export default function AdminEventDetailPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <EventDetailContent />
    </RoleGuard>
  );
}

function EventDetailContent() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const { getIdToken } = useIdToken();
  const { toast } = useToast();

  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [tickets, setTickets] = useState<SerializedTicketWithPayment[]>([]);
  const [access, setAccess] = useState<SerializedSellerAccess[]>([]);
  const [sellers, setSellers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    date: '',
    location: '',
    capacity: 100,
    price: 1000,
    active: true,
  });
  const [assignForm, setAssignForm] = useState({ sellerId: '', quota: 10 });
  const [showArchived, setShowArchived] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [buyerSearch, setBuyerSearch] = useState('');
  const [paymentLinks, setPaymentLinks] = useState<SerializedPaymentLink[]>([]);
  const [reservationStats, setReservationStats] = useState<EventReservationStats | null>(
    null
  );
  const [paymentLinkFilter, setPaymentLinkFilter] = useState<PaymentLinkFilter>('all');
  const [paymentLinkSearch, setPaymentLinkSearch] = useState('');

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    const [evRes, ticketsRes, accessRes, usersRes, linksRes, statsRes] = await Promise.all([
      getEvent(token, eventId),
      listTicketsForEvent(token, eventId, { includeArchived: true }),
      listSellerAccessAdmin(token, { eventId }),
      listUsers(token),
      listSalesAdmin(token, { eventId }),
      getEventReservationStats(token, eventId),
    ]);

    if (evRes.success) {
      setEvent(evRes.data);
      setEditForm(eventToEditForm(evRes.data));
    }
    else {
      toast({ variant: 'destructive', title: 'Evento no encontrado' });
      router.push('/admin/events');
      return;
    }
    if (ticketsRes.success) setTickets(ticketsRes.data);
    if (accessRes.success) setAccess(accessRes.data);
    if (usersRes.success) setSellers(usersRes.data.filter((u) => u.role === 'seller' && u.active));
    if (linksRes.success) {
      setPaymentLinks(linksRes.data);
    } else {
      setPaymentLinks([]);
      toast({
        variant: 'destructive',
        title: 'No se pudieron cargar los links',
        description: linksRes.error,
      });
    }
    if (statsRes.success) setReservationStats(statsRes.data);
    setLoading(false);
  }, [eventId, getIdToken, router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive() {
    if (!event) return;
    const token = await getIdToken();
    if (!token) return;
    await updateEvent(token, { id: event.id, active: !event.active });
    load();
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;

    if (editForm.capacity < event.sold) {
      toast({
        variant: 'destructive',
        title: 'Capacidad inválida',
        description: `Ya hay ${event.sold} entradas vendidas. La capacidad debe ser al menos ${event.sold}.`,
      });
      return;
    }

    setSavingEvent(true);
    const token = await getIdToken();
    if (!token) {
      setSavingEvent(false);
      return;
    }

    const res = await updateEvent(token, {
      id: event.id,
      name: editForm.name,
      date: new Date(editForm.date).toISOString(),
      location: editForm.location.trim() || undefined,
      capacity: editForm.capacity,
      price: editForm.price,
      active: editForm.active,
    });
    setSavingEvent(false);

    if (res.success) {
      toast({ title: 'Evento actualizado' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function handleAssignSeller(e: React.FormEvent) {
    e.preventDefault();
    const token = await getIdToken();
    if (!token) return;
    const res = await assignSellerAccess(token, {
      sellerId: assignForm.sellerId,
      eventId,
      quota: assignForm.quota,
    });
    if (res.success) {
      toast({ title: 'Vendedor asignado' });
      setAssignForm({ sellerId: '', quota: 10 });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function handleExportCsv() {
    const token = await getIdToken();
    if (!token) return;
    const res = await exportTicketsCsv(token, eventId);
    if (res.success) {
      downloadFile(`entradas-${eventId}.csv`, res.data, 'text/csv');
    }
  }

  async function handleCancelPaymentLink(linkId: string, label?: string) {
    const detail = label ? ` (${label})` : '';
    if (
      !window.confirm(
        `¿Anular este link de pago${detail}? Se liberan las entradas reservadas y el comprador ya no podrá pagar.`
      )
    ) {
      return;
    }
    const token = await getIdToken();
    if (!token) return;
    const res = await cancelPaymentLink(token, { paymentLinkId: linkId });
    if (res.success) {
      toast({ title: 'Link cancelado', description: 'El cupo quedó liberado.' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  function copyCheckoutUrl(linkToken: string) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const url = `${appUrl}/checkout/${linkToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado' });
  }

  function sharePaymentLinkWhatsApp(link: SerializedPaymentLink) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const url = `${appUrl}/checkout/${link.token}`;
    const buyer = [link.buyerName, link.buyerLastName].filter(Boolean).join(' ');
    const text = buyer
      ? `Hola ${buyer}, tu link para pagar la entrada: ${url}`
      : `Comprá tu entrada acá: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function handleArchiveTicket(id: string) {
    const token = await getIdToken();
    if (!token) return;
    const res = await archiveTicket(token, { ticketId: id });
    if (res.success) {
      toast({ title: 'Entrada archivada', description: 'No se incluye en los totales.' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  if (loading || !event) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  const ticketTotals = computeTicketTotals(tickets);
  const soldCount = reservationStats?.sold ?? event.sold;
  const pendingPayment = reservationStats?.pendingPayment ?? 0;
  const issuedCount = reservationStats?.issued ?? soldCount + pendingPayment;
  const remainingForLinks = reservationStats?.remainingForLinks ?? 0;
  const sellerQuota = computeSellerQuotaSummary(access, event.capacity);
  const maxLinkTickets =
    event.active && remainingForLinks > 0 ? Math.min(remainingForLinks, 20) : 0;

  const linkRevenue = computePaymentLinkRevenue(paymentLinks);
  const collectedRevenue = ticketTotals.totalRevenue;
  const pendingRevenue = linkRevenue.pending;
  const projectedRevenue = collectedRevenue + pendingRevenue;

  const filteredPaymentLinks = paymentLinks.filter((link) =>
    matchesPaymentLinkListFilters(link, paymentLinkFilter, paymentLinkSearch)
  );
  const pendingMpLinks = paymentLinks.filter(isPaymentLinkAwaitingPayment);
  const pendingMpTickets = pendingMpLinks.reduce(
    (sum, link) => sum + (link.ticketQuantity ?? 1),
    0
  );
  const activeTickets = tickets.filter((t) => !t.archived);
  const ticketsForList = showArchived ? tickets : activeTickets;

  const filteredTickets = ticketsForList.filter((t) =>
    matchesTicketFilters(t, paymentFilter, statusFilter, buyerSearch)
  );

  const filteredTotals = computeTicketTotals(filteredTickets);

  const hasActiveFilters =
    paymentFilter !== 'all' || statusFilter !== 'all' || buyerSearch.trim().length > 0;

  function clearTicketFilters() {
    setPaymentFilter('all');
    setStatusFilter('all');
    setBuyerSearch('');
  }

  return (
    <section className="space-y-6">
      <section className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/events">
            <ArrowLeft className="w-4 h-4 mr-2" /> Eventos
          </Link>
        </Button>
      </section>

      <section className="flex flex-wrap justify-between items-start gap-4">
        <section className="min-w-0 flex-1 space-y-2">
          <section className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-headline font-bold">{event.name}</h1>
            <Badge variant={event.active ? 'default' : 'secondary'}>
              {event.active ? 'Activo' : 'Inactivo'}
            </Badge>
          </section>
          <p className="text-muted-foreground">
            {new Date(event.date).toLocaleString('es-AR')}
            {event.location ? ` · ${event.location}` : ''}
            {' · '}${event.price.toLocaleString('es-AR')} por entrada
          </p>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <Switch checked={event.active} onCheckedChange={toggleActive} />
            <span className="text-sm text-muted-foreground">Visible para venta</span>
          </label>
        </section>
        <section className="flex flex-wrap gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href={`/gate/${event.id}`}>
              <DoorOpen className="w-4 h-4 mr-2" /> Validador digital
            </Link>
          </Button>
          {maxLinkTickets > 0 && (
            <>
              <CreatePaymentLinkDialog
                eventId={event.id}
                eventName={event.name}
                unitPrice={event.price}
                maxTickets={maxLinkTickets}
                getIdToken={getIdToken}
                onCreated={load}
                triggerLabel="Generar link de pago"
              />
              <CreateComplimentaryLinkDialog
                eventId={event.id}
                eventName={event.name}
                maxTickets={maxLinkTickets}
                getIdToken={getIdToken}
                onCreated={load}
              />
              <CreateCashSaleDialog
                eventId={event.id}
                eventName={event.name}
                unitPrice={event.price}
                maxTickets={maxLinkTickets}
                getIdToken={getIdToken}
                onCreated={load}
              />
            </>
          )}
        </section>
      </section>

      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="management">
            <Settings2 className="w-4 h-4 mr-2" /> Gestión
          </TabsTrigger>
          <TabsTrigger value="sellers">
            <Users className="w-4 h-4 mr-2" /> Vendedores
          </TabsTrigger>
          <TabsTrigger value="tickets">Entradas vendidas</TabsTrigger>
          <TabsTrigger value="payment-links">
            <Link2 className="w-4 h-4 mr-2" />
            Links de pago
            {pendingPayment > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingPayment}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Resumen
        </h2>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/40 bg-primary/5 sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardDescription>Recaudado (confirmado)</CardDescription>
              <CardTitle className="text-3xl">{formatArs(collectedRevenue)}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                MP y efectivo; sin cortesía
              </p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Por cobrar</CardDescription>
              <CardTitle className="text-2xl">{formatArs(pendingRevenue)}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingPayment > 0
                  ? `${pendingPayment} entrada${pendingPayment === 1 ? '' : 's'} en links pendientes`
                  : 'Sin links pendientes'}
              </p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Proyección</CardDescription>
              <CardTitle className="text-2xl">{formatArs(projectedRevenue)}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Si pagan todos los links pendientes
              </p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Emitidas / capacidad</CardDescription>
              <CardTitle className="text-2xl">
                {issuedCount} / {event.capacity}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {soldCount} pagadas
                {pendingPayment > 0 ? ` · ${pendingPayment} en links` : ''}
                {remainingForLinks > 0 ? ` · ${remainingForLinks} disponibles para links` : ''}
              </p>
            </CardHeader>
          </Card>
        </section>

        <Accordion type="single" collapsible className="rounded-lg border px-4">
          <AccordionItem value="cupos" className="border-0">
            <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
              Cupos, links e vendedores
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-2">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Vendidas (pagadas)</CardDescription>
                    <CardTitle className="text-xl">{soldCount}</CardTitle>
                    {ticketTotals.activeTickets !== soldCount && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {ticketTotals.activeTickets} activas en listado
                      </p>
                    )}
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Links sin pagar</CardDescription>
                    <CardTitle className="text-xl">{pendingPayment}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Reservan cupo hasta pagar</p>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Disponibles para links</CardDescription>
                    <CardTitle className="text-xl">{remainingForLinks}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cupo libre para nuevos links de pago
                    </p>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Entradas en listado</CardDescription>
                    <CardTitle className="text-xl">{ticketTotals.activeTickets}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Activas (sin archivadas)</p>
                  </CardHeader>
                </Card>
              </section>
              <section className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Vendedores
                </h3>
                <section className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Cupo asignado</CardDescription>
                      <CardTitle className="text-xl">{sellerQuota.assignedQuota}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {sellerQuota.sellerCount === 0
                          ? 'Sin vendedores activos'
                          : `${sellerQuota.sellerCount} vendedor${sellerQuota.sellerCount === 1 ? '' : 'es'} · ${sellerQuota.soldBySellers} vendidas`}
                      </p>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>En manos de vendedores</CardDescription>
                      <CardTitle className="text-xl">{sellerQuota.remainingWithSellers}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Cupo sin usar aún</p>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Sin asignar</CardDescription>
                      <CardTitle className="text-xl">{sellerQuota.unassignedQuota}</CardTitle>
                      {sellerQuota.overAssigned > 0 ? (
                        <p className="text-xs text-destructive mt-1">
                          Cupos exceden capacidad en {sellerQuota.overAssigned}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No reservado en vendedores</p>
                      )}
                    </CardHeader>
                  </Card>
                </section>
              </section>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

        <TabsContent value="management" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Datos del evento</CardTitle>
              <CardDescription>
                Modificá nombre, fecha, ubicación, capacidad y precio. Las vendidas ({event.sold}) no se pueden borrar; la capacidad debe ser mayor o igual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveEvent} className="grid gap-4 md:grid-cols-2 max-w-3xl">
                <section className="md:col-span-2">
                  <Label htmlFor="eventName">Nombre</Label>
                  <Input
                    id="eventName"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </section>
                <section>
                  <Label htmlFor="eventDate">Fecha y hora</Label>
                  <Input
                    id="eventDate"
                    type="datetime-local"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    required
                  />
                </section>
                <section>
                  <Label htmlFor="eventLocation">Ubicación</Label>
                  <Input
                    id="eventLocation"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="Opcional"
                  />
                </section>
                <section>
                  <Label htmlFor="eventCapacity">Capacidad</Label>
                  <Input
                    id="eventCapacity"
                    type="number"
                    min={event.sold}
                    value={editForm.capacity}
                    onChange={(e) =>
                      setEditForm({ ...editForm, capacity: parseInt(e.target.value, 10) || 0 })
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Mínimo: {event.sold} (vendidas)
                  </p>
                </section>
                <section>
                  <Label htmlFor="eventPrice">Precio (ARS)</Label>
                  <Input
                    id="eventPrice"
                    type="number"
                    min={1}
                    value={editForm.price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, price: parseInt(e.target.value, 10) || 0 })
                    }
                    required
                  />
                </section>
                <section className="flex items-center gap-3 md:col-span-2">
                  <Switch
                    id="eventActive"
                    checked={editForm.active}
                    onCheckedChange={(active) => setEditForm({ ...editForm, active })}
                  />
                  <Label htmlFor="eventActive">Evento activo (visible para venta)</Label>
                </section>
                <section className="md:col-span-2 flex gap-2">
                  <Button type="submit" disabled={savingEvent}>
                    {savingEvent && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Guardar cambios
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditForm(eventToEditForm(event))}
                    disabled={savingEvent}
                  >
                    Descartar
                  </Button>
                </section>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sellers">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Asignar vendedor</CardTitle>
              <CardDescription>Define el cupo de ventas para este evento</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAssignSeller} className="grid gap-4 md:grid-cols-3">
                <section>
                  <Label>Vendedor</Label>
                  <Select
                    value={assignForm.sellerId}
                    onValueChange={(v) => setAssignForm({ ...assignForm, sellerId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          Creá vendedores en Admin → Vendedores
                        </SelectItem>
                      ) : (
                        sellers.map((s) => (
                          <SelectItem key={s.uid} value={s.uid}>
                            {s.displayName} ({s.email})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </section>
                <section>
                  <Label>Cupo</Label>
                  <Input
                    type="number"
                    min={1}
                    value={assignForm.quota}
                    onChange={(e) =>
                      setAssignForm({ ...assignForm, quota: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </section>
                <Button type="submit" className="self-end" disabled={!assignForm.sellerId}>
                  Asignar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vendedores del evento</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Emitidos / Cupo</TableHead>
                    <TableHead>Restante</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {access.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        Ningún vendedor asignado
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {access.map((a) => {
                        const seller = sellers.find((s) => s.uid === a.sellerId);
                        return (
                          <TableRow key={a.id}>
                            <TableCell>
                              {seller ? `${seller.displayName} (${seller.email})` : a.sellerId}
                            </TableCell>
                            <TableCell>
                              {a.issued} / {a.quota}
                              {(a.pendingPayment ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {a.sold} vendidas · {a.pendingPayment} pendientes
                                </p>
                              )}
                            </TableCell>
                            <TableCell>{a.remaining}</TableCell>
                            <TableCell>
                              <Badge variant={a.active ? 'default' : 'secondary'}>
                                {a.active ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {access.some((a) => a.active) && (
                        <TableRow className="bg-muted/50 font-medium">
                          <TableCell>Total (activos)</TableCell>
                          <TableCell>
                            {sellerQuota.soldBySellers} / {sellerQuota.assignedQuota}
                          </TableCell>
                          <TableCell>{sellerQuota.remainingWithSellers}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-links" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3">
              <section>
                <CardTitle>Links de pago emitidos</CardTitle>
                <CardDescription>
                  Cada link reserva cupo hasta que se pague o lo anules. Usá la referencia al
                  crear el link para recordar a quién se lo mandaste.
                </CardDescription>
              </section>
              <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <section className="grid gap-3 sm:grid-cols-2 flex-1 min-w-0">
                  <section>
                    <Label htmlFor="paymentLinkFilter" className="text-xs text-muted-foreground">
                      Estado
                    </Label>
                    <Select
                      value={paymentLinkFilter}
                      onValueChange={(v) => setPaymentLinkFilter(v as PaymentLinkFilter)}
                    >
                      <SelectTrigger id="paymentLinkFilter" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Sin pagar (para avisar)</SelectItem>
                        <SelectItem value="all">Todos los links de pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </section>
                  <section>
                    <Label htmlFor="paymentLinkSearch" className="text-xs text-muted-foreground">
                      Buscar
                    </Label>
                    <Input
                      id="paymentLinkSearch"
                      className="mt-1"
                      placeholder="Referencia, comprador, email, teléfono"
                      value={paymentLinkSearch}
                      onChange={(e) => setPaymentLinkSearch(e.target.value)}
                    />
                  </section>
                </section>
              </section>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Entradas</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentLinks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {paymentLinks.length === 0 && pendingPayment > 0
                          ? 'Hay entradas reservadas pero no se cargó el listado. Recargá la página.'
                          : paymentLinkFilter === 'pending'
                            ? 'No hay links de Mercado Pago sin pagar'
                            : paymentLinkSearch.trim()
                              ? 'Ningún link coincide con la búsqueda'
                              : 'No hay links emitidos para este evento'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPaymentLinks.map((link) => {
                      const seller = sellers.find((s) => s.uid === link.sellerId);
                      const buyer =
                        [link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                        '—';
                      const contact = link.buyerEmail || link.buyerPhone || '';
                      return (
                        <TableRow key={link.id}>
                          <TableCell>
                            {new Date(link.createdAt).toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {LINK_TYPE_LABELS[link.linkType ?? 'payment'] ?? link.linkType}
                          </TableCell>
                          <TableCell>
                            {link.recipientLabel ? (
                              <span className="font-medium">{link.recipientLabel}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {seller ? seller.displayName : link.sellerId}
                          </TableCell>
                          <TableCell>{link.ticketQuantity ?? 1}</TableCell>
                          <TableCell>
                            {getTicketPaymentMethod(link) === 'complimentary'
                              ? '—'
                              : `$${link.amount.toLocaleString('es-AR')}`}
                          </TableCell>
                          <TableCell>
                            <span className="block">{buyer}</span>
                            {contact && (
                              <span className="text-xs text-muted-foreground">{contact}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {PAYMENT_LINK_STATUS[link.status] ?? link.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {link.status === 'PENDING_PAYMENT' && (
                              <section className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => copyCheckoutUrl(link.token)}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => sharePaymentLinkWhatsApp(link)}
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Anular link y liberar cupo"
                                  onClick={() =>
                                    handleCancelPaymentLink(
                                      link.id,
                                      link.recipientLabel ||
                                        [link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                                        undefined
                                    )
                                  }
                                >
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </section>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {(pendingPayment > 0 || pendingRevenue > 0 || paymentLinks.length > 0) && (
                <p className="text-sm text-muted-foreground mt-4">
                  {pendingMpLinks.length > 0 && (
                    <>
                      {pendingMpTickets} entrada{pendingMpTickets === 1 ? '' : 's'} en{' '}
                      {pendingMpLinks.length} link{pendingMpLinks.length === 1 ? '' : 's'} sin pagar
                      {pendingRevenue > 0 && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="font-medium text-foreground">
                            {formatArs(pendingRevenue)} por cobrar
                          </span>
                        </>
                      )}
                      {' · '}
                    </>
                  )}
                  Proyección total del evento: {formatArs(projectedRevenue)}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3">
              <section className="flex flex-row flex-wrap items-start justify-between gap-2">
                <section>
                  <CardTitle>Entradas emitidas</CardTitle>
                  <CardDescription>
                    {activeTickets.length} activas
                    {showArchived && ticketTotals.archivedTickets > 0
                      ? ` · ${ticketTotals.archivedTickets} archivadas`
                      : ''}
                  </CardDescription>
                </section>
                <section className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4 mr-2" /> CSV
                  </Button>
                  <EventTicketsPdfExport
                    tickets={activeTickets}
                    eventName={event.name}
                    eventDate={event.date}
                    eventLocation={event.location}
                  />
                </section>
              </section>
              <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <section className="grid gap-3 sm:grid-cols-3 flex-1 min-w-0">
                  <section>
                    <Label htmlFor="paymentFilter" className="text-xs text-muted-foreground">
                      Medio de pago
                    </Label>
                    <Select
                      value={paymentFilter}
                      onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}
                    >
                      <SelectTrigger id="paymentFilter" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="paid">Abonadas (MP + efectivo)</SelectItem>
                        <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="complimentary">Cortesía</SelectItem>
                      </SelectContent>
                    </Select>
                  </section>
                  <section>
                    <Label htmlFor="statusFilter" className="text-xs text-muted-foreground">
                      Estado de la entrada
                    </Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                    >
                      <SelectTrigger id="statusFilter" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="VALID">Válidas</SelectItem>
                        <SelectItem value="USED">Usadas (ingresó)</SelectItem>
                        <SelectItem value="CANCELLED">Canceladas</SelectItem>
                      </SelectContent>
                    </Select>
                  </section>
                  <section>
                    <Label htmlFor="buyerSearch" className="text-xs text-muted-foreground">
                      Buscar
                    </Label>
                    <Input
                      id="buyerSearch"
                      className="mt-1"
                      placeholder="Comprador, email o código"
                      value={buyerSearch}
                      onChange={(e) => setBuyerSearch(e.target.value)}
                    />
                  </section>
                </section>
                <section className="flex flex-wrap items-center gap-3 shrink-0">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Switch checked={showArchived} onCheckedChange={setShowArchived} />
                    Ver archivadas
                  </label>
                  {hasActiveFilters && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearTicketFilters}>
                      Limpiar filtros
                    </Button>
                  )}
                </section>
              </section>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-[1%] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTickets.length === 0 && !showArchived ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Aún no hay entradas vendidas
                      </TableCell>
                    </TableRow>
                  ) : filteredTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Ninguna entrada coincide con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTickets.map((t) => (
                      <TableRow key={t.id} className={t.archived ? 'opacity-50' : undefined}>
                        <TableCell className="font-mono text-sm">{t.ticketCode}</TableCell>
                        <TableCell>{t.buyerName}</TableCell>
                        <TableCell className="text-sm">{t.paymentFormatted}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t.archived
                              ? 'Archivada'
                              : (TICKET_STATUS[t.status] ?? t.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(t.createdAt).toLocaleString('es-AR')}
                        </TableCell>
                        <TableCell className="text-right">
                          <section className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/ticket/${t.ticketCode}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <QrCode className="w-4 h-4 mr-1" />
                                Ver QR
                              </Link>
                            </Button>
                            {!t.archived && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="w-4 h-4" />
                                    <span className="sr-only">Más acciones</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleArchiveTicket(t.id)}>
                                    <Archive className="w-4 h-4 mr-2" />
                                    Archivar (prueba)
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </section>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {activeTickets.length > 0 && (
                <section className="mt-4 flex flex-wrap justify-between gap-4 border-t pt-4 text-sm">
                  <span className="text-muted-foreground">
                    {hasActiveFilters ? (
                      <>
                        Mostrando {filteredTickets.length} de {ticketsForList.length}
                        {filteredTotals.activeTickets > 0 && (
                          <> · {filteredTotals.activeTickets} activas en filtro</>
                        )}
                      </>
                    ) : (
                      <>{ticketTotals.activeTickets} entradas activas</>
                    )}
                  </span>
                  <section className="flex flex-wrap justify-end gap-6">
                    {hasActiveFilters && (
                      <span className="text-muted-foreground">
                        Subtotal filtro:{' '}
                        <span className="font-medium text-foreground">
                          $
                          {filteredTickets
                            .filter(countsTowardRevenue)
                            .reduce((s, t) => s + t.paymentAmount, 0)
                            .toLocaleString('es-AR')}
                        </span>
                      </span>
                    )}
                    <span className="font-semibold text-lg">
                      Total ingresos: ${ticketTotals.totalRevenue.toLocaleString('es-AR')}
                    </span>
                  </section>
                </section>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
