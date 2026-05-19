'use client';

import { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import {
  listUsers,
  createSeller,
  updateUser,
  assignSellerAccess,
  listSellerAccessAdmin,
} from '@/lib/actions/sellers';
import { listEvents } from '@/lib/actions/events';
import type { SerializedEvent } from '@/lib/models';
import type { UserListItem } from '@/lib/actions/sellers';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function AdminSellersPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <SellersContent />
    </RoleGuard>
  );
}

function SellersContent() {
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [access, setAccess] = useState<
    import('@/lib/models').SerializedSellerAccess[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [assignForm, setAssignForm] = useState({
    sellerId: '',
    eventId: '',
    quota: 10,
  });
  const [showCreateSeller, setShowCreateSeller] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    displayName: '',
  });
  const [creatingSeller, setCreatingSeller] = useState(false);

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const [u, e, a] = await Promise.all([
      listUsers(token),
      listEvents(token),
      listSellerAccessAdmin(token),
    ]);
    if (u.success) setUsers(u.data.filter((x) => x.role === 'seller'));
    if (e.success) setEvents(e.data);
    if (a.success) setAccess(a.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleUser(uid: string, active: boolean) {
    const token = await getIdToken();
    if (!token) return;
    await updateUser(token, { uid, active: !active });
    load();
  }

  async function handleCreateSeller(e: React.FormEvent) {
    e.preventDefault();
    setCreatingSeller(true);
    const token = await getIdToken();
    if (!token) return;
    const res = await createSeller(token, createForm);
    setCreatingSeller(false);
    if (res.success) {
      toast({ title: 'Vendedor creado', description: createForm.email });
      setCreateForm({ email: '', password: '', displayName: '' });
      setShowCreateSeller(false);
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    const token = await getIdToken();
    if (!token) return;
    const res = await assignSellerAccess(token, assignForm);
    if (res.success) {
      toast({ title: 'Cupo asignado' });
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-wrap justify-between items-start gap-4">
        <section>
          <h1 className="text-2xl font-headline font-bold">Vendedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cuentas de vendedores y cupos por evento.
          </p>
        </section>
        <Button onClick={() => setShowCreateSeller(!showCreateSeller)}>
          {showCreateSeller ? 'Cancelar' : 'Nuevo vendedor'}
        </Button>
      </section>

      {showCreateSeller && (
        <Card>
          <CardHeader>
            <CardTitle>Crear vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSeller} className="grid gap-4 md:grid-cols-3">
              <section>
                <Label>Nombre</Label>
                <Input
                  value={createForm.displayName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, displayName: e.target.value })
                  }
                  required
                />
              </section>
              <section>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                />
              </section>
              <section>
                <Label>Contraseña inicial</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                  minLength={6}
                  required
                />
              </section>
              <Button type="submit" disabled={creatingSeller} className="md:col-span-3">
                {creatingSeller && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Crear vendedor
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Asignar cupo a evento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAssign} className="grid gap-4 md:grid-cols-4">
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
                  {users.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      Creá un vendedor primero
                    </SelectItem>
                  ) : (
                    users.map((u) => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {u.displayName} ({u.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </section>
            <section>
              <Label>Evento</Label>
              <Select
                value={assignForm.eventId}
                onValueChange={(v) => setAssignForm({ ...assignForm, eventId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir evento" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
            <section>
              <Label>Cupo</Label>
              <Input
                type="number"
                value={assignForm.quota}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, quota: parseInt(e.target.value, 10) })
                }
              />
            </section>
            <Button type="submit" className="self-end">
              Asignar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendedores habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell>{u.displayName}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Switch checked={u.active} onCheckedChange={() => toggleUser(u.uid, u.active)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cupos por evento</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Vendidos / Cupo</TableHead>
                <TableHead>Restante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {access.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.eventName}</TableCell>
                  <TableCell>
                    {a.sold} / {a.quota}
                  </TableCell>
                  <TableCell>{a.remaining}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
