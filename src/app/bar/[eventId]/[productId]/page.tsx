'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getBarProductPublic, createBarOrder } from '@/lib/actions/bar';
import { QuantityStepper } from '@/components/quantity-stepper';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedBarProduct } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Beer, Loader2 } from 'lucide-react';

export default function BarProductPage() {
  const { eventId, productId } = useParams<{ eventId: string; productId: string }>();
  const [product, setProduct] = useState<SerializedBarProduct | null>(null);
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await getBarProductPublic(eventId, productId);
      if (res.success) {
        setProduct(res.data.product);
        setEventName(res.data.eventName);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }
    load();
  }, [eventId, productId]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    const res = await createBarOrder({
      eventId,
      items: [{ productId, quantity }],
      buyerName: buyerName.trim(),
    });
    if (res.success) {
      window.location.href = res.data.initPoint;
    } else {
      setError(res.error);
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    );
  }

  if (error && !product) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>Barra</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (!product) return null;

  return (
    <section className="max-w-md mx-auto space-y-4 py-6">
      <Card>
        <CardHeader className="text-center">
          <Beer className="w-10 h-10 mx-auto text-primary" />
          <CardTitle className="font-headline text-2xl">{product.name}</CardTitle>
          <CardDescription>
            {eventName} · {formatArs(product.price)} c/u
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="barQuantity">Cantidad</Label>
            <QuantityStepper id="barQuantity" max={20} value={quantity} onChange={setQuantity} />
          </section>
          <section className="space-y-2">
            <Label htmlFor="barBuyerName">Tu nombre y apellido (obligatorio)</Label>
            <Input
              id="barBuyerName"
              placeholder="Para identificarte al retirar"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              maxLength={60}
            />
          </section>

          <section className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold">{formatArs(product.price * quantity)}</span>
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handlePay}
            disabled={paying || buyerName.trim().length < 2}
            className="w-full"
            size="lg"
          >
            {paying && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Pagar con Mercado Pago
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Después de pagar vas a recibir un QR para retirar tu pedido en la barra.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
