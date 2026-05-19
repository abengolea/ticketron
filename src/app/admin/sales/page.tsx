'use client';

import { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/role-guard';
import { useIdToken } from '@/hooks/use-id-token';
import { listSalesAdmin } from '@/lib/actions/payment-links';
import { exportTicketsCsv } from '@/lib/actions/tickets';
import { cancelPaymentLink } from '@/lib/actions/payment-links';
import type { SerializedPaymentLink } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Download } from 'lucide-react';
import { downloadFile } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente',
  PAID: 'Pagado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

export default function AdminSalesPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <SalesContent />
    </RoleGuard>
  );
}

function SalesContent() {
  const { getIdToken } = useIdToken();
  const { toast } = useToast();
  const [links, setLinks] = useState<SerializedPaymentLink[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = await getIdToken();
    if (!token) return;
    const res = await listSalesAdmin(token);
    if (res.success) setLinks(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport() {
    const token = await getIdToken();
    if (!token) return;
    const res = await exportTicketsCsv(token);
    if (res.success) {
      downloadFile('tickets.csv', res.data, 'text/csv');
    }
  }

  async function handleCancel(id: string) {
    const token = await getIdToken();
    if (!token) return;
    const res = await cancelPaymentLink(token, { paymentLinkId: id });
    if (res.success) {
      toast({ title: 'Link cancelado' });
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
    <section className="space-y-6">
      <section className="flex justify-between items-center">
        <h1 className="text-2xl font-headline font-bold">Ventas</h1>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" /> Exportar tickets CSV
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Links de pago ({links.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprador</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    {[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell>{link.ticketQuantity ?? 1}</TableCell>
                  <TableCell>${link.amount}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[link.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(link.createdAt).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell>
                    {link.status === 'PENDING_PAYMENT' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancel(link.id)}
                      >
                        Cancelar
                      </Button>
                    )}
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
