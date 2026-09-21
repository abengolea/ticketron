'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  getInvitationCampaign,
  retryFailedInvitationCampaign,
  sendInvitationCampaignBatch,
} from '@/lib/actions/invitations';
import type {
  SerializedInvitationCampaign,
  SerializedInvitationRecipient,
} from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';

const RECIPIENT_STATUS: Record<SerializedInvitationRecipient['status'], string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Falló',
  rsvping: 'Reservando',
  rsvped: 'Reservó',
  declined: 'No va',
};

function CampaignDetailContent() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const sendingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [campaign, setCampaign] = useState<SerializedInvitationCampaign | null>(null);
  const [recipients, setRecipients] = useState<SerializedInvitationRecipient[]>([]);

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await getInvitationCampaign(token, campaignId);
    if (res.success) {
      setCampaign(res.data.campaign);
      setRecipients(res.data.recipients);
    } else {
      toast({ variant: 'destructive', title: res.error });
    }
    setLoading(false);
  }, [campaignId, getIdToken, toast]);

  const flushQueue = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      while (true) {
        const token = await getIdToken();
        if (!token) break;
        const res = await sendInvitationCampaignBatch(token, { campaignId, limit: 8 });
        if (!res.success) {
          toast({ variant: 'destructive', title: 'Error al enviar', description: res.error });
          break;
        }
        await load();
        if (res.data.remaining === 0) break;
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [campaignId, getIdToken, load, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!campaign || autoStartedRef.current) return;
    const pending = recipients.some((recipient) => recipient.status === 'pending');
    if (campaign.status === 'sending' || pending) {
      autoStartedRef.current = true;
      flushQueue();
    }
  }, [campaign, recipients, flushQueue]);

  async function handleRetry() {
    const token = await getIdToken();
    if (!token) return;
    setRetrying(true);
    const res = await retryFailedInvitationCampaign(token, campaignId);
    setRetrying(false);
    if (!res.success) {
      toast({ variant: 'destructive', title: res.error });
      return;
    }
    toast({ title: `Reencolados ${res.data.reset} envíos` });
    await load();
    autoStartedRef.current = true;
    flushQueue();
  }

  if (loading || !campaign) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="h-10 w-10 animate-spin" />
      </section>
    );
  }

  const progress =
    campaign.recipientCount === 0
      ? 0
      : Math.round(((campaign.sentCount + campaign.failedCount) / campaign.recipientCount) * 100);
  const failedCount = recipients.filter((recipient) => recipient.status === 'failed').length;

  return (
    <section className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link href="/admin/invites">
          <ArrowLeft className="mr-2 h-4 w-4" /> Invitaciones
        </Link>
      </Button>

      <header className="space-y-2">
        <section className="flex flex-wrap items-center gap-2">
          <h1 className="font-headline text-2xl font-bold">{campaign.eventName}</h1>
          <Badge>{campaign.status === 'sent' ? 'Enviada' : 'En curso'}</Badge>
        </section>
        <p className="text-sm text-muted-foreground">
          {campaign.eventDate ? formatEventDateForDisplay(new Date(campaign.eventDate)) : ''}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardDescription>Enviados</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {campaign.sentCount}/{campaign.recipientCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardDescription>Reservas confirmadas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{campaign.rsvpCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardDescription>Entradas bloqueadas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{campaign.reservedTickets}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardDescription>No asisten</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{campaign.declinedCount}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Envío</CardTitle>
          <CardDescription>{campaign.subject}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground">
            {sending
              ? 'Enviando por Resend…'
              : campaign.failedCount > 0
                ? `${campaign.failedCount} fallaron`
                : 'Listo'}
          </p>
          {failedCount > 0 && (
            <Button variant="outline" onClick={handleRetry} disabled={retrying || sending}>
              {retrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reintentar fallidos
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatarios</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell>
                    <p>{recipient.email}</p>
                    {recipient.guestName && (
                      <p className="text-xs text-muted-foreground">{recipient.guestName}</p>
                    )}
                    {recipient.error && (
                      <p className="text-xs text-destructive">{recipient.error}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        recipient.status === 'rsvped'
                          ? 'default'
                          : recipient.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {RECIPIENT_STATUS[recipient.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {recipient.ticketQuantity ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

export default function InvitationCampaignPage() {
  return (
    <RoleGuard allowedRoles={['producer', 'superadmin']}>
      <CampaignDetailContent />
    </RoleGuard>
  );
}
