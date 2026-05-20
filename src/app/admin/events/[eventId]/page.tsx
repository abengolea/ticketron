'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { getEvent, updateEvent } from '@/lib/actions/events';
import { listSalesAdmin, cancelPaymentLink } from '@/lib/actions/payment-links';
import {
  listUsers,
  assignSellerAccess,
  listSellerAccessAdmin,
} from '@/lib/actions/sellers';
import { listTicketsForEvent, exportTicketsCsv } from '@/lib/actions/tickets';
import { CreatePaymentLinkDialog } from '@/components/create-payment-link-dialog';
import { CreateComplimentaryLinkDialog } from '@/components/create-complimentary-link-dialog';
import { CreateCashSaleDialog } from '@/components/create-cash-sale-dialog';
import { EventTicketsPdfExport } from '@/components/event-tickets-pdf-export';
import type {
  SerializedEvent,
  SerializedPaymentLink,
  SerializedTicketWithPayment,
} from '@/lib/models';
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
import { useToast } from '@/hooks/use-toast';
import { downloadFile } from '@/lib/utils';
import {
  ArrowLeft,
  Copy,
  DoorOpen,
  Download,
  Loader2,
  MessageCircle,
  QrCode,
  Settings2,
  Users,
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

const LINK_STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente',
  PAID: 'Pagado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

function isComplimentaryLink(link: SerializedPaymentLink) {
  return link.linkType === 'complimentary';
}

function isCashLink(link: SerializedPaymentLink) {
  return link.linkType === 'cash';
}

function isInstantPaidLink(link: SerializedPaymentLink) {
  return isComplimentaryLink(link) || isCashLink(link);
}

const TICKET_STATUS: Record<string, string> = {
  VALID: 'Válida',
  USED: 'Usada',
  CANCELLED: 'Cancelada',
};

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
  const [links, setLinks] = useState<SerializedPaymentLink[]>([]);
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    const [evRes, linksRes, ticketsRes, accessRes, usersRes] = await Promise.all([
      getEvent(token, eventId),
      listSalesAdmin(token, { eventId }),
      listTicketsForEvent(token, eventId),
      listSellerAccessAdmin(token, { eventId }),
      listUsers(token),
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
    if (linksRes.success) setLinks(linksRes.data);
    if (ticketsRes.success) setTickets(ticketsRes.data);
    if (accessRes.success) setAccess(accessRes.data);
    if (usersRes.success) setSellers(usersRes.data.filter((u) => u.role === 'seller' && u.active));
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

  async function handleCancelLink(id: string) {
    const token = await getIdToken();
    if (!token) return;
    const res = await cancelPaymentLink(token, { paymentLinkId: id });
    if (res.success) {
      toast({ title: 'Link cancelado' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: 'Copiado' });
  }

  function shareWhatsApp(url: string, favor = false) {
    const text = favor
      ? `Te enviamos tu entrada de favor: ${url}`
      : `Comprá tu entrada: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  if (loading || !event) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  const remaining = event.capacity - event.sold;
  const maxLinkTickets = event.active && remaining > 0 ? Math.min(remaining, 20) : 0;
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
        <section>
          <h1 className="text-2xl font-headline font-bold">{event.name}</h1>
          <p className="text-muted-foreground mt-1">
            {new Date(event.date).toLocaleString('es-AR')}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </section>
        <section className="flex flex-wrap gap-2">
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

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendidas / Capacidad</CardDescription>
            <CardTitle className="text-2xl">
              {event.sold} / {event.capacity}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Disponibles</CardDescription>
            <CardTitle className="text-2xl">{remaining}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Precio</CardDescription>
            <CardTitle className="text-2xl">${event.price}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estado</CardDescription>
            <section className="flex items-center gap-2 pt-1">
              <Switch checked={event.active} onCheckedChange={toggleActive} />
              <span className="text-sm font-medium">{event.active ? 'Activo' : 'Inactivo'}</span>
            </section>
          </CardHeader>
        </Card>
      </section>

      <Tabs defaultValue="management" className="space-y-4">
        <TabsList>
          <TabsTrigger value="management">
            <Settings2 className="w-4 h-4 mr-2" /> Gestión
          </TabsTrigger>
          <TabsTrigger value="sellers">
            <Users className="w-4 h-4 mr-2" /> Vendedores
          </TabsTrigger>
          <TabsTrigger value="tickets">Entradas</TabsTrigger>
        </TabsList>

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

          <Card>
            <CardHeader>
              <CardTitle>Links generados</CardTitle>
              <CardDescription>
                {links.length} links · usá los botones de arriba para crear nuevos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entradas</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground text-center py-8">
                        Sin links todavía.
                      </TableCell>
                    </TableRow>
                  ) : (
                    links.map((link) => {
                      const favor = isComplimentaryLink(link);
                      const cash = isCashLink(link);
                      const instant = isInstantPaidLink(link);
                      const url = instant
                        ? `${appUrl}/ticket?token=${encodeURIComponent(link.token)}`
                        : `${appUrl}/checkout/${link.token}`;
                      const typeLabel = favor
                        ? 'Favor'
                        : cash
                          ? 'Efectivo'
                          : 'Mercado Pago';
                      return (
                        <TableRow key={link.id}>
                          <TableCell>{link.ticketQuantity ?? 1}</TableCell>
                          <TableCell>
                            <Badge variant={cash ? 'secondary' : 'outline'}>
                              {typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>{favor ? '—' : `$${link.amount}`}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {favor ? 'Favor' : LINK_STATUS[link.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                              link.buyerEmail ||
                              '—'}
                          </TableCell>
                          <TableCell className="flex gap-1">
                            {instant && link.status === 'PAID' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => shareWhatsApp(url, favor)}
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {!instant && link.status === 'PENDING_PAYMENT' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => shareWhatsApp(url)}
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleCancelLink(link.id)}
                                >
                                  Cancelar
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
                    <TableHead>Vendidos / Cupo</TableHead>
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
                    access.map((a) => {
                      const seller = sellers.find((s) => s.uid === a.sellerId);
                      return (
                      <TableRow key={a.id}>
                        <TableCell>
                          {seller ? `${seller.displayName} (${seller.email})` : a.sellerId}
                        </TableCell>
                        <TableCell>
                          {a.sold} / {a.quota}
                        </TableCell>
                        <TableCell>{a.remaining}</TableCell>
                        <TableCell>
                          <Badge variant={a.active ? 'default' : 'secondary'}>
                            {a.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <section>
                <CardTitle>Entradas emitidas</CardTitle>
                <CardDescription>{tickets.length} entradas</CardDescription>
              </section>
              <section className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleExportCsv}>
                  <Download className="w-4 h-4 mr-2" /> CSV
                </Button>
                <EventTicketsPdfExport
                  tickets={tickets}
                  eventName={event.name}
                  eventDate={event.date}
                  eventLocation={event.location}
                />
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
                    <TableHead className="w-[1%] text-right">QR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Aún no hay entradas vendidas
                      </TableCell>
                    </TableRow>
                  ) : (
                    tickets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">{t.ticketCode}</TableCell>
                        <TableCell>{t.buyerName}</TableCell>
                        <TableCell className="text-sm">{t.paymentFormatted}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TICKET_STATUS[t.status] ?? t.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(t.createdAt).toLocaleString('es-AR')}
                        </TableCell>
                        <TableCell className="text-right">
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
