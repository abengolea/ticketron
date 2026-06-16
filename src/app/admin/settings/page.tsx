'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  getProducerSettings,
  updateProducerMercadoPago,
} from '@/lib/actions/producers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <RoleGuard allowedRoles={['producer', 'superadmin']}>
      <SettingsContent />
    </RoleGuard>
  );
}

function SettingsContent() {
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasMercadoPago, setHasMercadoPago] = useState(false);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    async function load() {
      const idToken = await getIdToken();
      if (!idToken) return;
      const res = await getProducerSettings(idToken);
      if (res.success) {
        setHasMercadoPago(res.data.hasMercadoPago);
        setEmail(res.data.email);
      }
      setLoading(false);
    }
    load();
  }, [getIdToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const idToken = await getIdToken();
    if (!idToken) return;
    const res = await updateProducerMercadoPago(idToken, {
      mercadoPagoAccessToken: token,
    });
    setSaving(false);
    if (res.success) {
      toast({ title: 'Mercado Pago vinculado' });
      setHasMercadoPago(true);
      setToken('');
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  if (loading) {
    return (
      <section className="flex justify-center py-16">
        <Loader2 className="w-10 h-10 animate-spin" />
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-8 max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/events">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a eventos
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago</CardTitle>
          <CardDescription>
            Vinculá tu cuenta de Mercado Pago para cobrar ventas de entradas y barra.
            Cuenta: {email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasMercadoPago && (
            <Alert>
              <AlertTitle>Cuenta vinculada</AlertTitle>
              <AlertDescription>
                Ya tenés un token configurado. Podés reemplazarlo ingresando uno nuevo.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <section className="space-y-2">
              <Label htmlFor="mp-token">Access Token</Label>
              <Input
                id="mp-token"
                type="password"
                required
                placeholder="APP_USR-..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Obtenelo en{' '}
                <a
                  href="https://www.mercadopago.com.ar/developers/panel/app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Mercado Pago Developers
                </a>
                . Configurá el webhook:{' '}
                <code className="text-xs">/api/mercadopago/webhook</code>
              </p>
            </section>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
