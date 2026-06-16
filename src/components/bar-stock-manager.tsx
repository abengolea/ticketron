'use client';

import { useCallback, useEffect, useState } from 'react';
import { listBarProductsStaff, setBarProductActive } from '@/lib/actions/bar';
import { useIdToken } from '@/hooks/use-id-token';
import { formatArs } from '@/lib/payment-link-utils';
import type { SerializedBarProduct } from '@/lib/models';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface BarStockManagerProps {
  eventId: string;
}

/** Permite al personal de barra (admin/gate) dar de baja productos sin stock */
export function BarStockManager({ eventId }: BarStockManagerProps) {
  const { getIdToken, user } = useIdToken();
  const { toast } = useToast();
  const [products, setProducts] = useState<SerializedBarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await listBarProductsStaff(token, eventId);
    if (res.success) setProducts(res.data);
    setLoading(false);
  }, [eventId, getIdToken]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function handleToggle(product: SerializedBarProduct) {
    setUpdatingId(product.id);
    const token = await getIdToken();
    if (!token) {
      setUpdatingId(null);
      return;
    }
    const res = await setBarProductActive(token, {
      productId: product.id,
      active: !product.active,
    });
    setUpdatingId(null);
    if (res.success) {
      toast({
        title: product.active ? 'Producto dado de baja' : 'Producto a la venta',
        description: product.name,
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: !product.active } : p))
      );
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Stock de la barra</CardTitle>
        <CardDescription>
          Si se acaba un producto, dalo de baja: desaparece del menú al instante. Cuando
          repongas, volvé a activarlo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <section className="flex justify-center py-6">
            <Loader2 className="animate-spin w-6 h-6" />
          </section>
        ) : products.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No hay productos cargados para este evento
          </p>
        ) : (
          <section className="space-y-2">
            {products.map((p) => (
              <section
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <section className="min-w-0">
                  <p className={`font-medium truncate ${p.active ? '' : 'text-muted-foreground line-through'}`}>
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatArs(p.price)}
                    {p.stock !== null && (
                      <>
                        {' · '}
                        <span className={p.stock <= 5 ? 'font-semibold text-destructive' : ''}>
                          {p.stock === 0 ? 'sin unidades' : `quedan ${p.stock}`}
                        </span>
                      </>
                    )}
                  </p>
                </section>
                <section className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={
                      !p.active
                        ? 'secondary'
                        : p.stock === 0
                          ? 'destructive'
                          : 'default'
                    }
                  >
                    {!p.active ? 'Pausado' : p.stock === 0 ? 'Agotado' : 'A la venta'}
                  </Badge>
                  {updatingId === p.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Switch
                      checked={p.active}
                      onCheckedChange={() => handleToggle(p)}
                      aria-label={`Activar o desactivar ${p.name}`}
                    />
                  )}
                </section>
              </section>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
