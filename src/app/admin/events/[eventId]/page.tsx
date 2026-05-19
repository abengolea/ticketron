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
import { EventTicketsPdfExport } from '@/components/event-tickets-pdf-export';
import type { SerializedEvent, SerializedPaymentLink, SerializedTicket } from '@/lib/models';
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
  Link2,
  Loader2,
  MessageCircle,
  Users,
} from 'lucide-react';

const LINK_STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente',
  PAID: 'Pagado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

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
  const [tickets, setTickets] = useState<SerializedTicket[]>([]);
  const [access, setAccess] = useState<SerializedSellerAccess[]>([]);
  const [sellers, setSellers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
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

    if (evRes.success) setEvent(evRes.data);
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

  function shareWhatsApp(url: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Comprá tu entrada: ${url}`)}`, '_blank');
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
              <DoorOpen className="w-4 h-4 mr-2" /> Control puerta
            </Link>
          </Button>
          {maxLinkTickets > 0 && (
            <CreatePaymentLinkDialog
              eventId={event.id}
              eventName={event.name}
              unitPrice={event.price}
              maxTickets={maxLinkTickets}
              getIdToken={getIdToken}
              onCreated={load}
              triggerLabel="Generar link de pago"
            />
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

      <Tabs defaultValue="links" className="space-y-4">
        <TabsList>
          <TabsTrigger value="links">
            <Link2 className="w-4 h-4 mr-2" /> Links de pago
          </TabsTrigger>
          <TabsTrigger value="sellers">
            <Users className="w-4 h-4 mr-2" /> Vendedores
          </TabsTrigger>
          <TabsTrigger value="tickets">Entradas</TabsTrigger>
        </TabsList>

        <TabsContent value="links">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <section>
                <CardTitle>Links de pago</CardTitle>
                <CardDescription>{links.length} links para este evento</CardDescription>
              </section>
              {maxLinkTickets > 0 && (
                <CreatePaymentLinkDialog
                  eventId={event.id}
                  eventName={event.name}
                  unitPrice={event.price}
                  maxTickets={maxLinkTickets}
                  getIdToken={getIdToken}
                  onCreated={load}
                />
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entradas</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                        Sin links. Generá uno indicando cuántas entradas incluye.
                      </TableCell>
                    </TableRow>
                  ) : (
                    links.map((link) => {
                      const url = `${appUrl}/checkout/${link.token}`;
                      return (
                        <TableRow key={link.id}>
                          <TableCell>{link.ticketQuantity ?? 1}</TableCell>
                          <TableCell>${link.amount}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{LINK_STATUS[link.status]}</Badge>
                          </TableCell>
                          <TableCell>
                            {[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                              '—'}
                          </TableCell>
                          <TableCell className="flex gap-1">
                            {link.status === 'PENDING_PAYMENT' && (
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
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Aún no hay entradas vendidas
                      </TableCell>
                    </TableRow>
                  ) : (
                    tickets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">{t.ticketCode}</TableCell>
                        <TableCell>{t.buyerName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TICKET_STATUS[t.status] ?? t.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(t.createdAt).toLocaleString('es-AR')}
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
