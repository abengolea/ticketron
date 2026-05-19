'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { listEvents, createEvent, updateEvent } from '@/lib/actions/events';
import type { SerializedEvent } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Settings2 } from 'lucide-react';

export default function AdminEventsPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <AdminEventsContent />
    </RoleGuard>
  );
}

function AdminEventsContent() {
  const router = useRouter();
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    date: '',
    location: '',
    capacity: 100,
    price: 1000,
    active: true,
  });

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const res = await listEvents(token);
    if (res.success) setEvents(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = await getIdToken();
    if (!token) return;
    const res = await createEvent(token, {
      ...form,
      date: new Date(form.date).toISOString(),
    });
    if (res.success) {
      toast({ title: 'Evento creado' });
      setShowForm(false);
      router.push(`/admin/events/${res.data.id}`);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function toggleActive(event: SerializedEvent) {
    const token = await getIdToken();
    if (!token) return;
    await updateEvent(token, { id: event.id, active: !event.active });
    load();
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
          <h1 className="text-2xl font-headline font-bold">Eventos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Venta digital: Mercado Pago, links de pago y entradas de favor.
          </p>
        </section>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo evento
        </Button>
      </section>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Crear evento</CardTitle>
            <CardDescription>Completá los datos y guardá para gestionar el evento.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <section>
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </section>
              <section>
                <Label>Fecha y hora</Label>
                <Input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </section>
              <section>
                <Label>Ubicación</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </section>
              <section>
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: parseInt(e.target.value, 10) })
                  }
                />
              </section>
              <section>
                <Label>Precio (ARS)</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) =>
                    setForm({ ...form, price: parseFloat(e.target.value) })
                  }
                />
              </section>
              <Button type="submit" className="md:col-span-2">
                Guardar y gestionar evento
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>{events.length} eventos</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Vendidos / Cap.</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay eventos. Creá uno con el botón de arriba.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <Link
                        href={`/admin/events/${ev.id}`}
                        className="font-medium hover:underline"
                      >
                        {ev.name}
                      </Link>
                    </TableCell>
                    <TableCell>{new Date(ev.date).toLocaleString('es-AR')}</TableCell>
                    <TableCell>
                      {ev.sold} / {ev.capacity}
                    </TableCell>
                    <TableCell>${ev.price}</TableCell>
                    <TableCell>
                      <Switch
                        checked={ev.active}
                        onCheckedChange={() => toggleActive(ev)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="default" size="sm">
                        <Link href={`/admin/events/${ev.id}`}>
                          <Settings2 className="w-4 h-4 mr-2" /> Gestionar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
