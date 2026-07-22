'use client';

import { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  listProducers,
  createProducer,
  updateProducer,
  approveProducer,
  rejectProducer,
  getPlatformFees,
  updatePlatformFees,
} from '@/lib/actions/producers';
import {
  listDirigentes,
  createDirigente,
  updateDirigente,
} from '@/lib/actions/dirigentes';
import { listAllEventsSuperAdmin } from '@/lib/actions/events';
import type { SerializedEvent, SerializedProducer, SerializedDirigente } from '@/lib/models';
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
import { Loader2, Plus, Shield, Check, X } from 'lucide-react';

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
  const [dirigentes, setDirigentes] = useState<SerializedDirigente[]>([]);
  const [globalEvents, setGlobalEvents] = useState<
    (SerializedEvent & { ownerEmail?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirigenteOpen, setCreateDirigenteOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvingProducer, setApprovingProducer] = useState<SerializedProducer | null>(
    null
  );
  const [creating, setCreating] = useState(false);
  const [creatingDirigente, setCreatingDirigente] = useState(false);
  const [approving, setApproving] = useState(false);
  const [savingFees, setSavingFees] = useState(false);
  const [platformFees, setPlatformFees] = useState({
    pricePerEvent: 0,
    pricePerTicket: 0,
  });
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    maxEvents: 5,
    quotaType: 'monthly' as QuotaType,
    pricePerEvent: 0,
    pricePerTicket: 0,
    planNotes: '',
    mercadoPagoAccessToken: '',
  });
  const [approveForm, setApproveForm] = useState({
    maxEvents: 5,
    quotaType: 'monthly' as QuotaType,
    pricePerEvent: 0,
    pricePerTicket: 0,
    planNotes: '',
  });
  const [dirigenteForm, setDirigenteForm] = useState({
    email: '',
    password: '',
    displayName: '',
    clubName: '',
  });

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const [prodRes, dirRes, eventsRes, feesRes] = await Promise.all([
      listProducers(token),
      listDirigentes(token),
      listAllEventsSuperAdmin(token),
      getPlatformFees(token),
    ]);
    if (prodRes.success) setProducers(prodRes.data);
    if (dirRes.success) setDirigentes(dirRes.data);
    if (eventsRes.success) setGlobalEvents(eventsRes.data);
    if (feesRes.success) {
      setPlatformFees(feesRes.data);
      setForm((f) => ({
        ...f,
        pricePerEvent: feesRes.data.pricePerEvent,
        pricePerTicket: feesRes.data.pricePerTicket,
      }));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [getIdToken]);

  const pendingProducers = producers.filter((p) => p.approvalStatus === 'pending');
  const activeProducers = producers.filter((p) => p.approvalStatus !== 'pending');

  async function handleSaveFees(e: React.FormEvent) {
    e.preventDefault();
    setSavingFees(true);
    const token = await getIdToken();
    if (!token) return;
    const res = await updatePlatformFees(token, platformFees);
    setSavingFees(false);
    if (res.success) {
      toast({ title: 'Fees actualizados' });
      setPlatformFees(res.data);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

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
        pricePerEvent: platformFees.pricePerEvent,
        pricePerTicket: platformFees.pricePerTicket,
        planNotes: '',
        mercadoPagoAccessToken: '',
      });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  function openApprove(p: SerializedProducer) {
    setApprovingProducer(p);
    setApproveForm({
      maxEvents: 5,
      quotaType: 'monthly',
      pricePerEvent: platformFees.pricePerEvent,
      pricePerTicket: platformFees.pricePerTicket,
      planNotes: '',
    });
    setApproveOpen(true);
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!approvingProducer) return;
    setApproving(true);
    const token = await getIdToken();
    if (!token) return;
    const res = await approveProducer(token, {
      uid: approvingProducer.uid,
      ...approveForm,
    });
    setApproving(false);
    if (res.success) {
      toast({
        title: 'Productor aprobado',
        description: 'Se envió el email de bienvenida',
      });
      setApproveOpen(false);
      setApprovingProducer(null);
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function handleReject(p: SerializedProducer) {
    const token = await getIdToken();
    if (!token) return;
    const res = await rejectProducer(token, { uid: p.uid });
    if (res.success) {
      toast({ title: 'Solicitud rechazada' });
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

  async function handleCreateDirigente(e: React.FormEvent) {
    e.preventDefault();
    setCreatingDirigente(true);
    const token = await getIdToken();
    if (!token) return;
    const res = await createDirigente(token, dirigenteForm);
    setCreatingDirigente(false);
    if (res.success) {
      toast({ title: 'Dirigente creado' });
      setCreateDirigenteOpen(false);
      setDirigenteForm({ email: '', password: '', displayName: '', clubName: '' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function toggleDirigenteActive(d: SerializedDirigente) {
    const token = await getIdToken();
    if (!token) return;
    const res = await updateDirigente(token, { uid: d.uid, active: !d.active });
    if (res.success) load();
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
  }

  const estimatedBilling = activeProducers.reduce((sum, p) => {
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
    <section className="space-y-8">
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <section>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Super Admin
          </h1>
          <p className="text-muted-foreground">
            Productores, fees, planes y eventos de toda la plataforma
          </p>
        </section>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo productor
        </Button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-2xl">{pendingProducers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Productores</CardDescription>
            <CardTitle className="text-2xl">{activeProducers.length}</CardTitle>
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
          <CardTitle>Fees de plataforma</CardTitle>
          <CardDescription>
            Valores por defecto al aprobar productores. También se muestran en la landing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSaveFees}
            className="flex flex-wrap items-end gap-4"
          >
            <section className="space-y-2">
              <Label htmlFor="fee-event">Por evento (ARS)</Label>
              <Input
                id="fee-event"
                type="number"
                min={0}
                value={platformFees.pricePerEvent}
                onChange={(e) =>
                  setPlatformFees({
                    ...platformFees,
                    pricePerEvent: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-40"
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="fee-ticket">Por entrada emitida (ARS)</Label>
              <Input
                id="fee-ticket"
                type="number"
                min={0}
                value={platformFees.pricePerTicket}
                onChange={(e) =>
                  setPlatformFees({
                    ...platformFees,
                    pricePerTicket: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-40"
              />
            </section>
            <Button type="submit" disabled={savingFees}>
              {savingFees && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Guardar fees
            </Button>
          </form>
        </CardContent>
      </Card>

      {pendingProducers.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Solicitudes pendientes</CardTitle>
            <CardDescription>
              Productores que se registraron desde la landing. Al aprobar se envía el mail de
              bienvenida.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Productor</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingProducers.map((p) => (
                  <TableRow key={p.uid}>
                    <TableCell>
                      <p className="font-medium">{p.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.organizationName ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{p.email}</p>
                      <p className="text-xs text-muted-foreground">{p.phone ?? '—'}</p>
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm text-muted-foreground">
                      {p.registrationNotes || '—'}
                    </TableCell>
                    <TableCell>
                      <section className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => openApprove(p)}>
                          <Check className="w-4 h-4 mr-1" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(p)}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Rechazar
                        </Button>
                      </section>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                <TableHead>Plan / Fees</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>MP</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeProducers.map((p) => (
                <TableRow key={p.uid}>
                  <TableCell>
                    <p className="font-medium">{p.displayName}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                    {p.organizationName && (
                      <p className="text-xs text-muted-foreground">{p.organizationName}</p>
                    )}
                    {p.approvalStatus === 'rejected' && (
                      <Badge variant="destructive" className="mt-1">
                        Rechazado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.producerPlan ? (
                      <section className="text-sm">
                        <p>
                          {p.producerPlan.maxEvents} eventos ·{' '}
                          {QUOTA_LABELS[p.producerPlan.quotaType]}
                        </p>
                        <p className="text-muted-foreground">
                          {formatArs(p.producerPlan.pricePerEvent)}/evento ·{' '}
                          {formatArs(p.producerPlan.pricePerTicket)}/entrada
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
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <section>
            <CardTitle>Dirigentes de club</CardTitle>
            <CardDescription>
              Gestionan control de visitantes (Ticketron Access), sin venta de entradas
            </CardDescription>
          </section>
          <Button variant="outline" onClick={() => setCreateDirigenteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo dirigente
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dirigentes.map((d) => (
                <TableRow key={d.uid}>
                  <TableCell>
                    <p className="font-medium">{d.displayName}</p>
                    <p className="text-xs text-muted-foreground">{d.email}</p>
                  </TableCell>
                  <TableCell>{d.clubName ?? '—'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={d.active}
                      onCheckedChange={() => toggleDirigenteActive(d)}
                      aria-label="Activar dirigente"
                    />
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

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aprobar productor</DialogTitle>
            <DialogDescription>
              {approvingProducer
                ? `${approvingProducer.displayName} · ${approvingProducer.organizationName ?? approvingProducer.email}`
                : 'Definí cupo y fees'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApprove} className="space-y-4">
            <section className="grid grid-cols-2 gap-3">
              <section className="space-y-2">
                <Label htmlFor="ap-max">Cupo eventos</Label>
                <Input
                  id="ap-max"
                  type="number"
                  min={0}
                  value={approveForm.maxEvents}
                  onChange={(e) =>
                    setApproveForm({
                      ...approveForm,
                      maxEvents: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </section>
              <section className="space-y-2">
                <Label>Tipo de cupo</Label>
                <Select
                  value={approveForm.quotaType}
                  onValueChange={(v) =>
                    setApproveForm({ ...approveForm, quotaType: v as QuotaType })
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
            <section className="grid grid-cols-2 gap-3">
              <section className="space-y-2">
                <Label htmlFor="ap-event">Fee por evento</Label>
                <Input
                  id="ap-event"
                  type="number"
                  min={0}
                  value={approveForm.pricePerEvent}
                  onChange={(e) =>
                    setApproveForm({
                      ...approveForm,
                      pricePerEvent: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </section>
              <section className="space-y-2">
                <Label htmlFor="ap-ticket">Fee por entrada</Label>
                <Input
                  id="ap-ticket"
                  type="number"
                  min={0}
                  value={approveForm.pricePerTicket}
                  onChange={(e) =>
                    setApproveForm({
                      ...approveForm,
                      pricePerTicket: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </section>
            </section>
            <DialogFooter>
              <Button type="submit" disabled={approving}>
                {approving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Aprobar y enviar mail
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            <section className="grid grid-cols-2 gap-3">
              <section className="space-y-2">
                <Label htmlFor="pricePerEvent">Fee por evento</Label>
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
                <Label htmlFor="pricePerTicket">Fee por entrada</Label>
                <Input
                  id="pricePerTicket"
                  type="number"
                  min={0}
                  value={form.pricePerTicket}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pricePerTicket: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </section>
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

      <Dialog open={createDirigenteOpen} onOpenChange={setCreateDirigenteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo dirigente</DialogTitle>
            <DialogDescription>
              Cuenta para control de ingreso de clubes visitantes
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDirigente} className="space-y-4">
            <section className="space-y-2">
              <Label htmlFor="dir-email">Email</Label>
              <Input
                id="dir-email"
                type="email"
                required
                value={dirigenteForm.email}
                onChange={(e) =>
                  setDirigenteForm({ ...dirigenteForm, email: e.target.value })
                }
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="dir-password">Contraseña</Label>
              <Input
                id="dir-password"
                type="password"
                required
                minLength={6}
                value={dirigenteForm.password}
                onChange={(e) =>
                  setDirigenteForm({ ...dirigenteForm, password: e.target.value })
                }
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="dir-name">Nombre</Label>
              <Input
                id="dir-name"
                required
                value={dirigenteForm.displayName}
                onChange={(e) =>
                  setDirigenteForm({ ...dirigenteForm, displayName: e.target.value })
                }
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="dir-club">Club</Label>
              <Input
                id="dir-club"
                required
                value={dirigenteForm.clubName}
                onChange={(e) =>
                  setDirigenteForm({ ...dirigenteForm, clubName: e.target.value })
                }
              />
            </section>
            <DialogFooter>
              <Button type="submit" disabled={creatingDirigente}>
                {creatingDirigente && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Crear dirigente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
