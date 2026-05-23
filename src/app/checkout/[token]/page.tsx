'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  getCheckoutByToken,
  updateCheckoutBuyer,
} from '@/lib/actions/payment-links';
import { buyerCheckoutSchema, type BuyerCheckoutInput } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CreditCard } from 'lucide-react';
function CheckoutPageContent() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mpStatus = searchParams.get('mp');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [checkout, setCheckout] = useState<{
    eventName: string;
    eventDate: string;
    eventLocation?: string;
    amount: number;
    ticketQuantity: number;
    unitPrice: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<BuyerCheckoutInput>({
    resolver: zodResolver(buyerCheckoutSchema),
    defaultValues: {
      buyerName: '',
      buyerLastName: '',
      buyerPhone: '',
      buyerEmail: '',
      buyerEmailConfirm: '',
    },
  });

  useEffect(() => {
    if (mpStatus === 'approved') {
      router.replace(`/ticket?token=${token}`);
    }
  }, [mpStatus, token, router]);

  useEffect(() => {
    async function load() {
      const res = await getCheckoutByToken(token);
      if (!res.success) {
        setError({ message: res.error, code: res.code });
        setLoading(false);
        return;
      }
      setCheckout({
        eventName: res.data.eventName,
        eventDate: res.data.eventDate,
        eventLocation: res.data.eventLocation,
        amount: res.data.link.amount,
        ticketQuantity: res.data.link.ticketQuantity ?? 1,
        unitPrice: res.data.unitPrice,
      });
      if (res.data.link.buyerName) {
        form.setValue('buyerName', res.data.link.buyerName);
      }
      if (res.data.link.buyerLastName) {
        form.setValue('buyerLastName', res.data.link.buyerLastName);
      }
      if (res.data.link.buyerEmail) {
        form.setValue('buyerEmail', res.data.link.buyerEmail);
        form.setValue('buyerEmailConfirm', res.data.link.buyerEmail);
      }
      setLoading(false);
    }
    load();
  }, [token, form]);

  async function onSubmit(values: BuyerCheckoutInput) {
    setSubmitting(true);
    const res = await updateCheckoutBuyer(token, values);
    setSubmitting(false);
    if (res.success) {
      window.location.href = res.data.preferenceInitPoint;
    } else {
      setError({ message: res.error, code: res.code });
    }
  }

  if (mpStatus === 'approved') {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
        <p className="ml-3 text-muted-foreground">Redirigiendo a tu entrada...</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  if (error && !checkout) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>
            {error.code === 'EXPIRED'
              ? 'Link vencido'
              : error.code === 'PAID'
                ? 'Link ya usado'
                : 'Link no disponible'}
          </AlertTitle>
          <AlertDescription>
            {error.code === 'PAID' ? (
              <>
                Este link de pago ya fue utilizado. Tus entradas están en el
                correo de confirmación que te enviamos al pagar. Si no lo
                encontrás, revisá spam o correo no deseado.
              </>
            ) : (
              error.message
            )}
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto py-8 space-y-6">
      {mpStatus === 'failure' && (
        <Alert variant="destructive">
          <AlertTitle>Pago no completado</AlertTitle>
          <AlertDescription>
            El pago fue rechazado o cancelado. Podés intentar de nuevo.
          </AlertDescription>
        </Alert>
      )}
      {mpStatus === 'pending' && (
        <Alert>
          <AlertTitle>Pago pendiente</AlertTitle>
          <AlertDescription>
            Tu pago está en proceso. Cuando se acredite recibirás las entradas por email.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{checkout?.eventName}</CardTitle>
          <CardDescription>
            {checkout &&
              new Date(checkout.eventDate).toLocaleString('es-AR', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            {checkout?.eventLocation && ` · ${checkout.eventLocation}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <section className="mb-6">
            <p className="text-2xl font-bold">${checkout?.amount} ARS</p>
            {(checkout?.ticketQuantity ?? 1) > 1 && (
              <p className="text-sm text-muted-foreground">
                {checkout?.ticketQuantity} entradas × ${checkout?.unitPrice}
              </p>
            )}
          </section>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="buyerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerLastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" required autoComplete="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerEmailConfirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        required
                        autoComplete="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Te enviaremos tus entradas a este email cuando el pago se acredite.
                No necesitás crear una cuenta.
              </p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Pagar con Mercado Pago
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <section className="flex justify-center py-12">
          <Loader2 className="animate-spin w-10 h-10" />
        </section>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  );
}
