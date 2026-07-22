'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  getProducerSettings,
  updateProducerMercadoPago,
} from '@/lib/actions/producers';
import {
  getProducerBillingProfile,
  updateProducerBillingProfile,
} from '@/lib/actions/event-fees';
import type { ProducerIvaCondicion } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [savingBilling, setSavingBilling] = useState(false);
  const [hasMercadoPago, setHasMercadoPago] = useState(false);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [billing, setBilling] = useState({
    ivaCondicion: 'monotributo' as ProducerIvaCondicion,
    cuit: '',
    razonSocial: '',
    domicilio: '',
  });

  useEffect(() => {
    async function load() {
      const idToken = await getIdToken();
      if (!idToken) return;
      const [mpRes, billRes] = await Promise.all([
        getProducerSettings(idToken),
        getProducerBillingProfile(idToken),
      ]);
      if (mpRes.success) {
        setHasMercadoPago(mpRes.data.hasMercadoPago);
        setEmail(mpRes.data.email);
      }
      if (billRes.success && billRes.data) {
        setBilling({
          ivaCondicion: billRes.data.ivaCondicion,
          cuit: billRes.data.cuit ?? '',
          razonSocial: billRes.data.razonSocial ?? '',
          domicilio: billRes.data.domicilio ?? '',
        });
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

  async function handleBillingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingBilling(true);
    const idToken = await getIdToken();
    if (!idToken) return;
    const res = await updateProducerBillingProfile(idToken, billing);
    setSavingBilling(false);
    if (res.success) {
      toast({ title: 'Datos fiscales guardados' });
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
    <section className="max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/events">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a eventos
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Facturación de fees Ticketron</CardTitle>
          <CardDescription>
            Después de cada evento, el fee por entradas emitidas se factura a nombre de
            Notificas SRL. Elegí si sos responsable inscripto (Factura A) o monotributista
            (Factura B).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBillingSubmit} className="space-y-4">
            <section className="space-y-2">
              <Label>Condición frente al IVA</Label>
              <Select
                value={billing.ivaCondicion}
                onValueChange={(v) =>
                  setBilling({ ...billing, ivaCondicion: v as ProducerIvaCondicion })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responsable_inscripto">
                    Responsable inscripto (Factura A)
                  </SelectItem>
                  <SelectItem value="monotributo">Monotributista (Factura B)</SelectItem>
                  <SelectItem value="consumidor_final">
                    Consumidor final (Factura B)
                  </SelectItem>
                </SelectContent>
              </Select>
            </section>
            <section className="space-y-2">
              <Label htmlFor="razonSocial">Razón social / Nombre</Label>
              <Input
                id="razonSocial"
                value={billing.razonSocial}
                onChange={(e) => setBilling({ ...billing, razonSocial: e.target.value })}
                placeholder="Como figurará en la factura"
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="cuit">
                CUIT{billing.ivaCondicion === 'responsable_inscripto' ? ' (obligatorio)' : ''}
              </Label>
              <Input
                id="cuit"
                value={billing.cuit}
                onChange={(e) => setBilling({ ...billing, cuit: e.target.value })}
                placeholder="XX-XXXXXXXX-X"
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="domicilio">Domicilio fiscal (opcional)</Label>
              <Input
                id="domicilio"
                value={billing.domicilio}
                onChange={(e) => setBilling({ ...billing, domicilio: e.target.value })}
              />
            </section>
            <Button type="submit" disabled={savingBilling}>
              {savingBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar datos fiscales'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago (tus ventas)</CardTitle>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
