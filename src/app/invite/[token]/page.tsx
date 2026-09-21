'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  declinePublicInvitation,
  getPublicInvite,
  submitPublicInvitationRsvp,
} from '@/lib/actions/invitations';
import type { InvitationRecipientStatus } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, PartyPopper } from 'lucide-react';

type InviteData = {
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  maxTicketsPerInvite: number;
  remainingCapacity: number;
  status: InvitationRecipientStatus;
  invitedEmail: string;
  ticketQuantity?: number;
};

export default function PublicInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [done, setDone] = useState<{ email: string; ticketQuantity: number } | null>(null);
  const [declined, setDeclined] = useState(false);

  async function load() {
    const res = await getPublicInvite(token);
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setInvite(res.data);
    setGuestEmail(res.data.invitedEmail ?? '');
    setQuantity(Math.min(res.data.ticketQuantity ?? 1, 6));
    if (res.data.status === 'rsvped') {
      setDone({
        email: res.data.invitedEmail,
        ticketQuantity: res.data.ticketQuantity ?? 1,
      });
    }
    if (res.data.status === 'declined') {
      setDeclined(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const maxTickets = useMemo(() => {
    if (!invite) return 1;
    const cap = Math.min(invite.maxTicketsPerInvite, 6);
    return Math.max(1, Math.min(cap, invite.remainingCapacity || cap));
  }, [invite]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await submitPublicInvitationRsvp({
      token,
      guestEmail,
      ticketQuantity: quantity,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDone({
      email: guestEmail,
      ticketQuantity: res.data.ticketQuantity,
    });
  }

  async function handleDecline() {
    setDeclining(true);
    setError(null);
    const res = await declinePublicInvitation({ token });
    setDeclining(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDeclined(true);
  }

  if (loading) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </section>
    );
  }

  if (!invite) {
    return (
      <section className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4">
        <Alert variant="destructive">
          <AlertTitle>Invitación no válida</AlertTitle>
          <AlertDescription>{error ?? 'Este enlace ya no está disponible.'}</AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden px-4 py-10 sm:py-16">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_42%),radial-gradient(circle_at_bottom,_rgba(219,39,119,0.12),_transparent_40%)]"
        aria-hidden
      />
      <section className="relative mx-auto w-full max-w-lg space-y-6">
        <section className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Música & Amigos
          </p>
          <h1 className="mt-2 font-headline text-3xl tracking-wide sm:text-4xl">Reservá tus entradas</h1>
        </section>

        <Card className="border-primary/20 bg-card/90 shadow-lg shadow-primary/10">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">{invite.eventName}</CardTitle>
            <CardDescription>
              {invite.eventDate}
              {invite.eventLocation ? ` · ${invite.eventLocation}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>No se pudo completar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {declined ? (
              <section className="space-y-3 text-center">
                <p className="text-lg font-medium">Te vamos a extrañar</p>
                <p className="text-sm text-muted-foreground">
                  Registramos que no vas a poder venir. Si cambia algo, escribinos.
                </p>
              </section>
            ) : done ? (
              <section className="space-y-3 text-center">
                <PartyPopper className="mx-auto h-10 w-10 text-primary" />
                <p className="text-lg font-medium">
                  Reservamos {done.ticketQuantity}{' '}
                  {done.ticketQuantity === 1 ? 'entrada' : 'entradas'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Quedó a nombre de {done.email}. Hasta el domingo 27 de septiembre podés
                  completar el pago al valor actual.
                </p>
              </section>
            ) : invite.remainingCapacity <= 0 ? (
              <Alert>
                <AlertTitle>Cupo completo</AlertTitle>
                <AlertDescription>
                  Ya se reservaron todas las entradas de esta fiesta.
                </AlertDescription>
              </Alert>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <section className="space-y-2">
                  <Label htmlFor="guest-email">Tu email</Label>
                  <Input
                    id="guest-email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </section>
                <section className="space-y-2">
                  <Label htmlFor="ticket-qty">¿Cuántas entradas necesitás?</Label>
                  <QuantityStepper
                    id="ticket-qty"
                    value={quantity}
                    min={1}
                    max={maxTickets}
                    onChange={setQuantity}
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo {invite.maxTicketsPerInvite} por persona. Reservamos ese cupo para vos.
                  </p>
                </section>
                <section className="flex flex-col gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reservar {quantity} {quantity === 1 ? 'entrada' : 'entradas'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDecline}
                    disabled={declining || submitting}
                  >
                    {declining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    No voy a poder ir
                  </Button>
                </section>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
