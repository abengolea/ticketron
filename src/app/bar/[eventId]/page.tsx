'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { listBarProductsPublic, createBarOrder } from '@/lib/actions/bar';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedBarProduct } from '@/lib/models';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Beer, Loader2, Minus, Plus } from 'lucide-react';

const MAX_PER_PRODUCT = 20;

export default function BarMenuPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [products, setProducts] = useState<SerializedBarProduct[]>([]);
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await listBarProductsPublic(eventId);
      if (res.success) {
        setProducts(res.data.products);
        setEventName(res.data.eventName);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }
    load();
  }, [eventId]);

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) => {
      const next = Math.min(MAX_PER_PRODUCT, Math.max(0, (prev[productId] ?? 0) + delta));
      const updated = { ...prev };
      if (next === 0) {
        delete updated[productId];
      } else {
        updated[productId] = next;
      }
      return updated;
    });
  }

  const { totalAmount, totalUnits, selectedItems } = useMemo(() => {
    const selected = products.filter((p) => (cart[p.id] ?? 0) > 0);
    return {
      selectedItems: selected,
      totalUnits: selected.reduce((sum, p) => sum + cart[p.id]!, 0),
      totalAmount: selected.reduce((sum, p) => sum + p.price * cart[p.id]!, 0),
    };
  }, [products, cart]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    const res = await createBarOrder({
      eventId,
      items: selectedItems.map((p) => ({ productId: p.id, quantity: cart[p.id]! })),
      buyerName: buyerName.trim() || undefined,
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

  if (error && products.length === 0) {
    return (
      <section className="max-w-md mx-auto py-12">
        <Alert variant="destructive">
          <AlertTitle>Barra</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto space-y-4 py-6 pb-36">
      <Card>
        <CardHeader className="text-center">
          <Beer className="w-10 h-10 mx-auto text-primary" />
          <CardTitle className="font-headline text-2xl">Barra</CardTitle>
          <CardDescription>
            {eventName} — elegí tus bebidas, pagá con Mercado Pago y retirá todo con un QR
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay bebidas disponibles en este momento
            </p>
          ) : (
            products.map((p) => {
              const qty = cart[p.id] ?? 0;
              return (
                <section
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    qty > 0 ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <section className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{formatArs(p.price)}</p>
                  </section>
                  <section className="flex items-center gap-2 shrink-0">
                    {qty > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => changeQuantity(p.id, -1)}
                          aria-label={`Quitar ${p.name}`}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
                      </>
                    )}
                    <Button
                      variant={qty > 0 ? 'default' : 'outline'}
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => changeQuantity(p.id, 1)}
                      disabled={qty >= MAX_PER_PRODUCT}
                      aria-label={`Agregar ${p.name}`}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </section>
                </section>
              );
            })
          )}
        </CardContent>
      </Card>

      {totalUnits > 0 && (
        <section className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <section className="max-w-md mx-auto space-y-3 px-4 py-4">
            <section className="space-y-1 text-sm">
              {selectedItems.map((p) => (
                <section key={p.id} className="flex justify-between text-muted-foreground">
                  <span>
                    {p.name} x{cart[p.id]}
                  </span>
                  <span>{formatArs(p.price * cart[p.id]!)}</span>
                </section>
              ))}
              <section className="flex justify-between font-bold text-base text-foreground">
                <span>Total ({totalUnits} ítem{totalUnits === 1 ? '' : 's'})</span>
                <span>{formatArs(totalAmount)}</span>
              </section>
            </section>
            <section className="space-y-1">
              <Label htmlFor="barBuyerName" className="text-xs text-muted-foreground">
                Tu nombre (opcional, para identificarte al retirar)
              </Label>
              <Input
                id="barBuyerName"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                maxLength={60}
              />
            </section>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handlePay} disabled={paying} className="w-full" size="lg">
              {paying && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Pagar {formatArs(totalAmount)} con Mercado Pago
            </Button>
          </section>
        </section>
      )}
    </section>
  );
}
