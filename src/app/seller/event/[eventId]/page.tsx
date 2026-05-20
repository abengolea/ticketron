'use client';



import { useEffect, useState } from 'react';

import { useParams } from 'next/navigation';

import { RoleGuard } from '@/components/role-guard';

import { useIdToken } from '@/hooks/use-id-token';

import { listSellerPaymentLinks } from '@/lib/actions/payment-links';

import { getSellerDashboard } from '@/lib/actions/sellers';

import { CreatePaymentLinkDialog } from '@/components/create-payment-link-dialog';
import { CreateComplimentaryLinkDialog } from '@/components/create-complimentary-link-dialog';

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

import { Loader2, MessageCircle, Copy } from 'lucide-react';



const STATUS_LABELS: Record<string, string> = {

  PENDING_PAYMENT: 'Pendiente',

  PAID: 'Pagado',

  EXPIRED: 'Vencido',

  CANCELLED: 'Cancelado',

};

function isComplimentaryLink(link: SerializedPaymentLink) {
  return link.linkType === 'complimentary';
}



export default function SellerEventPage() {

  return (

    <RoleGuard allowedRoles={['seller']}>

      <SellerEventContent />

    </RoleGuard>

  );

}



function SellerEventContent() {

  const { eventId } = useParams<{ eventId: string }>();

  const { getIdToken } = useIdToken();

  const { toast } = useToast();

  const [links, setLinks] = useState<SerializedPaymentLink[]>([]);

  const [eventName, setEventName] = useState('');

  const [unitPrice, setUnitPrice] = useState(0);

  const [maxTickets, setMaxTickets] = useState(1);

  const [loading, setLoading] = useState(true);



  async function load() {

    const token = await getIdToken();

    if (!token) return;

    const [linksRes, dashRes] = await Promise.all([

      listSellerPaymentLinks(token, eventId),

      getSellerDashboard(token),

    ]);

    if (linksRes.success) setLinks(linksRes.data);

    if (dashRes.success) {

      const ev = dashRes.data.find((a) => a.eventId === eventId);

      if (ev) {

        setEventName(ev.eventName);

        setUnitPrice(ev.price);

        setMaxTickets(ev.remaining > 0 ? Math.min(ev.remaining, 20) : 0);

      }

    }

    setLoading(false);

  }



  useEffect(() => {

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [eventId]);



  function shareWhatsApp(url: string, cortesia = false) {

    const text = cortesia
      ? `Te enviamos tu entrada de cortesía: ${url}`
      : `Comprá tu entrada acá: ${url}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');

  }



  function copyUrl(url: string) {

    navigator.clipboard.writeText(url);

    toast({ title: 'Copiado' });

  }



  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';



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

        <h1 className="text-2xl font-headline font-bold">Links de pago</h1>

        {maxTickets > 0 ? (
          <section className="flex flex-wrap gap-2">
            <CreatePaymentLinkDialog
              eventId={eventId}
              eventName={eventName}
              unitPrice={unitPrice}
              maxTickets={maxTickets}
              getIdToken={getIdToken}
              onCreated={load}
            />
            <CreateComplimentaryLinkDialog
              eventId={eventId}
              eventName={eventName}
              maxTickets={maxTickets}
              getIdToken={getIdToken}
              onCreated={load}
            />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Cupo agotado</p>
        )}

      </section>



      <Card>

        <CardHeader>

          <CardTitle>Mis links</CardTitle>

        </CardHeader>

        <CardContent>

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>Entradas</TableHead>

                <TableHead>Monto</TableHead>

                <TableHead>Estado</TableHead>

                <TableHead>Comprador</TableHead>

                <TableHead>Validez</TableHead>

                <TableHead>Acciones</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {links.map((link) => {

                const cortesia = isComplimentaryLink(link);

                const url = cortesia
                  ? `${appUrl}/ticket?token=${encodeURIComponent(link.token)}`
                  : `${appUrl}/checkout/${link.token}`;

                return (

                  <TableRow key={link.id}>

                    <TableCell>{link.ticketQuantity ?? 1}</TableCell>

                    <TableCell>{cortesia ? 'Cortesía' : `$${link.amount}`}</TableCell>

                    <TableCell>

                      <Badge variant="outline">
                        {cortesia ? 'Cortesía' : STATUS_LABELS[link.status]}
                      </Badge>

                    </TableCell>

                    <TableCell>

                      {[link.buyerName, link.buyerLastName].filter(Boolean).join(' ') ||
                        link.buyerEmail ||
                        '—'}

                    </TableCell>

                    <TableCell>

                      {cortesia
                        ? '—'
                        : link.linkType === 'cash'
                          ? new Date(link.expiresAt).toLocaleString('es-AR')
                          : link.status === 'PENDING_PAYMENT'
                            ? 'Hasta pagar'
                            : link.status === 'PAID'
                              ? 'Usado'
                              : STATUS_LABELS[link.status]}

                    </TableCell>

                    <TableCell className="flex gap-2">

                      {cortesia && link.status === 'PAID' && (

                        <>

                          <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>

                            <Copy className="w-3 h-3" />

                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => shareWhatsApp(url, true)}
                          >

                            <MessageCircle className="w-3 h-3" />

                          </Button>

                        </>

                      )}

                      {!cortesia && link.status === 'PENDING_PAYMENT' && (

                        <>

                          <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>

                            <Copy className="w-3 h-3" />

                          </Button>

                          <Button size="sm" variant="outline" onClick={() => shareWhatsApp(url)}>

                            <MessageCircle className="w-3 h-3" />

                          </Button>

                        </>

                      )}

                    </TableCell>

                  </TableRow>

                );

              })}

            </TableBody>

          </Table>

        </CardContent>

      </Card>

    </section>

  );

}

