'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerProducer } from '@/lib/actions/producers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function RegisterProducerPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    organizationName: '',
    email: '',
    phone: '',
    password: '',
    registrationNotes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await registerProducer({
        ...form,
        acceptTerms: acceptTerms ? true : undefined,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex justify-center py-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Registro de productor</CardTitle>
          <CardDescription>
            Completá tus datos. Revisamos la solicitud y, al aprobarte, te llega un email de
            bienvenida para ingresar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Solicitud enviada</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Te avisamos por email cuando tu cuenta esté habilitada. Mientras tanto no
                  podés ingresar al panel.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo registrar</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName">Tu nombre</Label>
                <Input
                  id="displayName"
                  required
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationName">Nombre de la productora</Label>
                <Input
                  id="organizationName"
                  required
                  value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Contanos sobre tus eventos (opcional)</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.registrationNotes}
                  onChange={(e) => setForm({ ...form, registrationNotes: e.target.value })}
                  placeholder="Tipo de eventos, ciudad, volumen estimado…"
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <Checkbox
                  id="acceptTerms"
                  checked={acceptTerms}
                  onCheckedChange={(v) => setAcceptTerms(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug text-muted-foreground">
                  Acepto las{' '}
                  <Link
                    href="/bases-y-condiciones"
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    Bases y Condiciones
                  </Link>{' '}
                  de Ticketron (NOTIFICAS SRL).
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !acceptTerms}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar solicitud
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                ¿Ya te aprobaron?{' '}
                <Link href="/login" className="text-primary hover:underline">
                  Ingresar
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
