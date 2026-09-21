'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { listEvents, listAllEventsSuperAdmin } from '@/lib/actions/events';
import {
  createInvitationCampaign,
  getInvitationEmailConfig,
  listInvitationCampaigns,
  previewInvitationAudience,
  sendInvitationPreviewEmail,
} from '@/lib/actions/invitations';
import { defaultInvitationCopy } from '@/lib/invitation-copy';
import type {
  InvitationAudiencePreview,
  SerializedEvent,
  SerializedInvitationCampaign,
} from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatEventDateForDisplay } from '@/lib/format-event-date';
import { Loader2, Mail, Plus, Send } from 'lucide-react';

const CAMPAIGN_STATUS: Record<SerializedInvitationCampaign['status'], string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviada',
  cancelled: 'Cancelada',
};

function InvitationCampaignsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedEventId = searchParams.get('eventId') ?? '';
  const { getIdToken } = useIdToken();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [campaigns, setCampaigns] = useState<SerializedInvitationCampaign[]>([]);
  const [emailConfig, setEmailConfig] = useState<{
    ready: boolean;
    from: string | null;
    appUrl: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(Boolean(preselectedEventId));
  const [eventId, setEventId] = useState(preselectedEventId);
  const [subject, setSubject] = useState('');
  const [headline, setHeadline] = useState('Hola!');
  const [message, setMessage] = useState('');
  const [maxTicketsPerInvite, setMaxTicketsPerInvite] = useState(6);
  const [extraEmails, setExtraEmails] = useState('');
  const [includeStaff, setIncludeStaff] = useState(false);
  const [audience, setAudience] = useState<InvitationAudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewSending, setPreviewSending] = useState(false);
  const [origin, setOrigin] = useState('');

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId]
  );

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const [eventsRes, allEventsRes, campaignsRes, configRes] = await Promise.all([
      listEvents(token),
      listAllEventsSuperAdmin(token),
      listInvitationCampaigns(token, preselectedEventId || undefined),
      getInvitationEmailConfig(token),
    ]);

    if (allEventsRes.success) {
      setEvents(allEventsRes.data);
    } else if (eventsRes.success) {
      setEvents(eventsRes.data);
    }

    if (campaignsRes.success) setCampaigns(campaignsRes.data);
    if (configRes.success) setEmailConfig(configRes.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    const copy = defaultInvitationCopy(selectedEvent.name);
    setSubject((current) => (current ? current : copy.subject));
    setHeadline((current) => (current ? current : copy.headline));
    setMessage((current) => (current ? current : copy.message));
  }, [selectedEvent]);

  async function loadAudience() {
    if (!eventId) return;
    const token = await getIdToken();
    if (!token) return;
    setAudienceLoading(true);
    const res = await previewInvitationAudience(token, {
      eventId,
      extraEmails,
      includeStaff,
    });
    setAudienceLoading(false);
    if (res.success) {
      setAudience(res.data);
    } else {
      toast({ variant: 'destructive', title: 'No se pudo armar la audiencia', description: res.error });
    }
  }

  useEffect(() => {
    if (!showForm || !eventId) return;
    const handle = window.setTimeout(() => {
      loadAudience();
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, eventId, extraEmails, includeStaff]);

  async function handlePreview() {
    if (!eventId) return;
    const token = await getIdToken();
    if (!token) return;
    setPreviewSending(true);
    const res = await sendInvitationPreviewEmail(token, {
      eventId,
      subject,
      headline,
      message,
      maxTicketsPerInvite,
    });
    setPreviewSending(false);
    if (res.success) {
      toast({
        title: 'Prueba enviada',
        description: `Revisá ${res.data.to}. El botón abre ${res.data.rsvpUrl}`,
      });
    } else {
      toast({ variant: 'destructive', title: 'No se pudo enviar la prueba', description: res.error });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) {
      toast({ variant: 'destructive', title: 'Elegí un evento' });
      return;
    }
    const token = await getIdToken();
    if (!token) return;
    setCreating(true);
    const res = await createInvitationCampaign(token, {
      eventId,
      subject,
      headline,
      message,
      maxTicketsPerInvite,
      extraEmails,
      includeStaff,
    });
    setCreating(false);
    if (res.success) {
      toast({ title: 'Campaña creada', description: 'Empezamos a enviar los mails.' });
      router.push(`/admin/invites/${res.data.id}`);
    } else {
      toast({ variant: 'destructive', title: 'No se pudo crear la campaña', description: res.error });
    }
  }

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="h-10 w-10 animate-spin" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <section>
          <h1 className="font-headline text-2xl font-bold">Invitaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviá un mail a la base y que cada invitado reserve cuántas entradas necesita.
          </p>
        </section>
        <Button onClick={() => setShowForm((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva campaña
        </Button>
      </section>

      {emailConfig && !emailConfig.ready && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg">Falta configurar Resend</CardTitle>
            <CardDescription>
              Completá <code>RESEND_API_KEY</code> y <code>EMAIL_FROM</code> en el entorno. El
              remitente tiene que estar verificado en Resend, por ejemplo{' '}
              <code>Ticketron &lt;entradas@tudominio.com&gt;</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {emailConfig?.ready && emailConfig.from && (
        <section className="space-y-1 text-sm text-muted-foreground">
          <p>
            Se envía desde <span className="font-medium text-foreground">{emailConfig.from}</span>
          </p>
          <p>
            La prueba y las campañas usan links de{' '}
            <span className="font-medium text-foreground">{emailConfig.appUrl}</span>
            {origin && emailConfig.appUrl !== origin
              ? ` (este entorno es ${origin}).`
              : '.'}
          </p>
        </section>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva invitación</CardTitle>
            <CardDescription>
              Cada persona recibe un link único para decir cuántas entradas quiere. Al confirmar,
              bloqueamos ese cupo. No hace falta cuenta ni login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleCreate}>
              <section className="space-y-2">
                <Label>Evento</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí la fiesta" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Primero creá el evento en{' '}
                    <Link href="/admin/events" className="text-primary underline">
                      Eventos
                    </Link>
                    .
                  </p>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <section className="space-y-2">
                  <Label htmlFor="invite-subject">Asunto</Label>
                  <Input
                    id="invite-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={120}
                    required
                  />
                </section>
                <section className="space-y-2">
                  <Label htmlFor="invite-headline">Título en el mail</Label>
                  <Input
                    id="invite-headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    maxLength={80}
                    required
                  />
                </section>
              </section>

              <section className="space-y-2">
                <Label htmlFor="invite-message">Mensaje</Label>
                <Textarea
                  id="invite-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={18}
                  maxLength={4000}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Poné <code>{'{{link}}'}</code> donde quieras el botón de reserva. Queda en el
                  medio del texto, como en el modelo.
                </p>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <section className="space-y-2">
                  <Label htmlFor="invite-max">Máximo de entradas por invitado</Label>
                  <Input
                    id="invite-max"
                    type="number"
                    min={1}
                    max={6}
                    value={maxTicketsPerInvite}
                    onChange={(e) => setMaxTicketsPerInvite(Number(e.target.value) || 1)}
                  />
                </section>
                <section className="flex items-end">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <Switch checked={includeStaff} onCheckedChange={setIncludeStaff} />
                    <span className="text-sm">Incluir cuentas internas</span>
                  </label>
                </section>
              </section>

              <section className="space-y-2">
                <Label htmlFor="invite-extra">Emails extra (opcional)</Label>
                <Textarea
                  id="invite-extra"
                  value={extraEmails}
                  onChange={(e) => setExtraEmails(e.target.value)}
                  rows={4}
                  placeholder="uno@mail.com, otro@mail.com"
                />
                <p className="text-xs text-muted-foreground">
                  Separalos por coma o salto de línea. No se reenvía a quien ya tiene entrada o
                  invitación para este evento.
                </p>
              </section>

              <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Audiencia</CardTitle>
                  <CardDescription>
                    Superadmin: todos los emails únicos de Ticketron. Productor: compradores de tus
                    eventos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {audienceLoading && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Contando destinatarios…
                    </p>
                  )}
                  {audience && !audienceLoading && (
                    <>
                      <p>
                        <span className="font-semibold tabular-nums">{audience.total}</span> emails
                        listos para enviar
                      </p>
                      <p className="text-muted-foreground">
                        Base: {audience.fromDatabase}
                        {audience.extra > 0 ? ` · Extra: ${audience.extra}` : ''}
                        {audience.skippedAlreadyTicketed > 0
                          ? ` · Ya con entrada: ${audience.skippedAlreadyTicketed}`
                          : ''}
                        {audience.skippedAlreadyInvited > 0
                          ? ` · Ya invitados: ${audience.skippedAlreadyInvited}`
                          : ''}
                      </p>
                      {audience.sample.length > 0 && (
                        <ul className="space-y-1 text-muted-foreground">
                          {audience.sample.map((item) => (
                            <li key={item.email}>
                              {item.email}
                              {item.displayName ? ` · ${item.displayName}` : ''}
                            </li>
                          ))}
                          {audience.total > audience.sample.length && (
                            <li>… y {audience.total - audience.sample.length} más</li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <section className="flex flex-wrap gap-2">
                <Button type="submit" disabled={creating || emailConfig?.ready === false}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Crear y enviar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreview}
                  disabled={previewSending || !eventId || emailConfig?.ready === false}
                >
                  {previewSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Enviarme una prueba
                </Button>
              </section>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campañas</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no enviaste invitaciones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Entradas bloqueadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/admin/invites/${campaign.id}`} className="font-medium hover:underline">
                        {campaign.eventName || campaign.subject}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {campaign.eventDate
                          ? formatEventDateForDisplay(new Date(campaign.eventDate))
                          : campaign.subject}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === 'sent' ? 'default' : 'secondary'}>
                        {CAMPAIGN_STATUS[campaign.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {campaign.sentCount}/{campaign.recipientCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{campaign.rsvpCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {campaign.reservedTickets}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function AdminInvitesPage() {
  return (
    <RoleGuard allowedRoles={['producer', 'superadmin']}>
      <Suspense
        fallback={
          <section className="flex justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin" />
          </section>
        }
      >
        <InvitationCampaignsContent />
      </Suspense>
    </RoleGuard>
  );
}
