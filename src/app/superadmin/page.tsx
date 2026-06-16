'use client';

import { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  listProducers,
  createProducer,
  updateProducer,
} from '@/lib/actions/producers';
import { listAllEventsSuperAdmin } from '@/lib/actions/events';
import type { SerializedEvent, SerializedProducer } from '@/lib/models';
import type { QuotaType } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatArs } from '@/lib/payment-link-utils';
import { Loader2, Plus, Shield } from 'lucide-react';

const QUOTA_LABELS: Record<QuotaType, string> = {
  monthly: '30 días',
  lifetime: 'Única vez',
  unlimited: 'Ilimitado',
};

export default function SuperAdminPage() {
  return (
    <RoleGuard allowedRoles={['superadmin']}>
      <SuperAdminContent />
    </RoleGuard>
  );
}

function SuperAdminContent() {
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [producers, setProducers] = useState<SerializedProducer[]>([]);
  const [globalEvents, setGlobalEvents] = useState<
    (SerializedEvent & { ownerEmail?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    maxEvents: 5,
    quotaType: 'monthly' as QuotaType,
    pricePerEvent: 0,
    planNotes: '',
    mercadoPagoAccessToken: '',
  });

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const [prodRes, eventsRes] = await Promise.all([
      listProducers(token),
      listAllEventsSuperAdmin(token),
    ]);
    if (prodRes.success) setProducers(prodRes.data);
    if (eventsRes.success) setGlobalEvents(eventsRes.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [getIdToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const token = await getIdToken();
    if (!token) return;
    const res = await createProducer(token, form);
    setCreating(false);
    if (res.success) {
      toast({ title: 'Productor creado' });
      setCreateOpen(false);
      setForm({
        email: '',
        password: '',
        displayName: '',
        maxEvents: 5,
        quotaType: 'monthly',
        pricePerEvent: 0,
        planNotes: '',
        mercadoPagoAccessToken: '',
      });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function toggleProducerActive(p: SerializedProducer) {
    const token = await getIdToken();
    if (!token) return;
    const res = await updateProducer(token, { uid: p.uid, active: !p.active });
    if (res.success) load();
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
  }

  async function togglePlanActive(p: SerializedProducer) {
    const token = await getIdToken();
    if (!token) return;
    const res = await updateProducer(token, {
      uid: p.uid,
      planActive: !(p.producerPlan?.planActive ?? true),
    });
    if (res.success) load();
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
  }

  const estimatedBilling = producers.reduce((sum, p) => {
    const used = p.producerPlan?.eventsUsed ?? 0;
    const price = p.producerPlan?.pricePerEvent ?? 0;
    return sum + used * price;
  }, 0);

  if (loading) {
    return (
      <section className="flex justify-center py-16">
        <Loader2 className="w-10 h-10 animate-spin" />
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-8 space-y-8">
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <section>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Super Admin
          </h1>
          <p className="text-muted-foreground">
            Productores, planes y eventos de toda la plataforma
          </p>
        </section>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo productor
        </Button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Productores</CardDescription>
            <CardTitle className="text-2xl">{producers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Eventos totales</CardDescription>
            <CardTitle className="text-2xl">{globalEvents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Facturación estimada</CardDescription>
            <CardTitle className="text-2xl">{formatArs(estimatedBilling)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Productores</CardTitle>
          <CardDescription>Cuentas con plan de cupo y Mercado Pago</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>MP</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.map((p) => (
                <TableRow key={p.uid}>
                  <TableCell>
                    <p className="font-medium">{p.displayName}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </TableCell>
                  <TableCell>
                    {p.producerPlan ? (
                      <section className="text-sm">
                        <p>
                          {p.producerPlan.maxEvents} eventos ·{' '}
                          {QUOTA_LABELS[p.producerPlan.quotaType]}
                        </p>
                        <p className="text-muted-foreground">
                          {formatArs(p.producerPlan.pricePerEvent)}/evento
                        </p>
                      </section>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {p.producerPlan
                      ? `${p.producerPlan.eventsUsed}/${p.producerPlan.quotaType === 'unlimited' ? '∞' : p.producerPlan.maxEvents}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.hasMercadoPago ? 'default' : 'outline'}>
                      {p.hasMercadoPago ? 'Vinculado' : 'Sin MP'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-y-2">
                    <section className="flex items-center gap-2">
                      <Switch
                        checked={p.active}
                        onCheckedChange={() => toggleProducerActive(p)}
                        aria-label="Activar cuenta"
                      />
                      <span className="text-xs">Cuenta</span>
                    </section>
                    {p.producerPlan && (
                      <section className="flex items-center gap-2">
                        <Switch
                          checked={p.producerPlan.planActive}
                          onCheckedChange={() => togglePlanActive(p)}
                          aria-label="Activar plan"
                        />
                        <span className="text-xs">Plan</span>
                      </section>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todos los eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Productor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {globalEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.ownerEmail ?? e.ownerId ?? '—'}
                  </TableCell>
                  <TableCell>
                    {new Date(e.date).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.active ? 'default' : 'secondary'}>
                      {e.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo productor</DialogTitle>
            <DialogDescription>
              Creá la cuenta con email, contraseña y plan de cupo
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <section className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="displayName">Nombre</Label>
              <Input
                id="displayName"
                required
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </section>
            <section className="grid grid-cols-2 gap-3">
              <section className="space-y-2">
                <Label htmlFor="maxEvents">Cupo eventos</Label>
                <Input
                  id="maxEvents"
                  type="number"
                  min={0}
                  value={form.maxEvents}
                  onChange={(e) =>
                    setForm({ ...form, maxEvents: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </section>
              <section className="space-y-2">
                <Label>Tipo de cupo</Label>
                <Select
                  value={form.quotaType}
                  onValueChange={(v) =>
                    setForm({ ...form, quotaType: v as QuotaType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">30 días</SelectItem>
                    <SelectItem value="lifetime">Única vez</SelectItem>
                    <SelectItem value="unlimited">Ilimitado</SelectItem>
                  </SelectContent>
                </Select>
              </section>
            </section>
            <section className="space-y-2">
              <Label htmlFor="pricePerEvent">Precio por evento (ARS)</Label>
              <Input
                id="pricePerEvent"
                type="number"
                min={0}
                value={form.pricePerEvent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pricePerEvent: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="mpToken">Token MP (opcional)</Label>
              <Input
                id="mpToken"
                type="password"
                placeholder="APP_USR-..."
                value={form.mercadoPagoAccessToken}
                onChange={(e) =>
                  setForm({ ...form, mercadoPagoAccessToken: e.target.value })
                }
              />
            </section>
            <DialogFooter>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Crear productor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
