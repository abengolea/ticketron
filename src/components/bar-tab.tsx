'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  listBarProducts,
  createBarProduct,
  updateBarProduct,
  listBarOrders,
} from '@/lib/actions/bar';
import { useQRAsBase64 } from '@/hooks/useQRAsBase64';
import { formatArs } from '@/lib/payment-link-utils';
import { copyTextSafe } from '@/lib/utils';
import type { SerializedBarOrder, SerializedBarProduct } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { useToast } from '@/hooks/use-toast';
import {
  Beer,
  Copy,
  Download,
  Loader2,
  Pencil,
  QrCode,
  ScanLine,
} from 'lucide-react';

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Sin pagar',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

function productPurchaseUrl(eventId: string, productId: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${appUrl}/bar/${eventId}/${productId}`;
}

interface BarTabProps {
  eventId: string;
  eventName: string;
  getIdToken: () => Promise<string | null>;
}

export function BarTab({ eventId, eventName, getIdToken }: BarTabProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<SerializedBarProduct[]>([]);
  const [orders, setOrders] = useState<SerializedBarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '' });
  const [qrProduct, setQrProduct] = useState<SerializedBarProduct | null>(null);
  const [editProduct, setEditProduct] = useState<SerializedBarProduct | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const [productsRes, ordersRes] = await Promise.all([
      listBarProducts(token, eventId),
      listBarOrders(token, eventId),
    ]);
    if (productsRes.success) setProducts(productsRes.data);
    if (ordersRes.success) setOrders(ordersRes.data);
    setLoading(false);
  }, [eventId, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    const price = parseInt(newProduct.price, 10);
    if (!newProduct.name.trim() || !price || price <= 0) {
      toast({
        variant: 'destructive',
        title: 'Datos incompletos',
        description: 'Ingresá nombre y un precio mayor a 0',
      });
      return;
    }

    setCreating(true);
    const token = await getIdToken();
    if (!token) {
      setCreating(false);
      return;
    }
    const res = await createBarProduct(token, {
      eventId,
      name: newProduct.name.trim(),
      price,
    });
    setCreating(false);

    if (res.success) {
      toast({ title: 'Producto creado', description: res.data.name });
      setNewProduct({ name: '', price: '' });
      setQrProduct(res.data);
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  async function handleToggleActive(product: SerializedBarProduct) {
    const token = await getIdToken();
    if (!token) return;
    const res = await updateBarProduct(token, {
      productId: product.id,
      active: !product.active,
    });
    if (res.success) {
      load();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  const paidOrders = useMemo(() => orders.filter((o) => o.status === 'PAID'), [orders]);
  const barRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
  const redeemedCount = paidOrders.filter((o) => o.voucherStatus === 'USED').length;
  const pendingRedeemCount = paidOrders.length - redeemedCount;

  const soldByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of paidOrders) {
      map.set(o.productId, (map.get(o.productId) ?? 0) + o.quantity);
    }
    return map;
  }, [paidOrders]);

  if (loading) {
    return (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-8 h-8" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recaudado en barra</CardDescription>
            <CardTitle className="text-2xl">{formatArs(barRevenue)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {paidOrders.length} orden{paidOrders.length === 1 ? '' : 'es'} pagadas
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vouchers por canjear</CardDescription>
            <CardTitle className="text-2xl">{pendingRedeemCount}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {redeemedCount} ya entregados
            </p>
          </CardHeader>
        </Card>
        <Card className="flex flex-col justify-center">
          <CardContent className="pt-6">
            <Button asChild className="w-full">
              <Link href={`/bar/redeem/${eventId}`}>
                <ScanLine className="w-4 h-4 mr-2" />
                Validador de barra
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Para que el jefe de barra escanee y entregue
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beer className="w-5 h-5" />
            Cargar producto
          </CardTitle>
          <CardDescription>
            Creá un trago con su precio y generá el QR para que los compradores lo escaneen y paguen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateProduct} className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <section className="sm:col-span-2">
              <Label htmlFor="barProductName">Nombre del trago</Label>
              <Input
                id="barProductName"
                placeholder="Ej. Fernet con coca, Gin tonic"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                maxLength={60}
                required
              />
            </section>
            <section>
              <Label htmlFor="barProductPrice">Precio (ARS)</Label>
              <Input
                id="barProductPrice"
                type="number"
                min={1}
                placeholder="5000"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                required
              />
            </section>
            <section className="sm:col-span-3">
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Crear producto y ver QR
              </Button>
            </section>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos de barra</CardTitle>
          <CardDescription>
            Cada producto tiene su QR. Imprimilo y pegalo en la barra: el comprador lo escanea,
            paga con Mercado Pago y recibe un voucher QR para retirar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Vendidos</TableHead>
                <TableHead>A la venta</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Todavía no cargaste productos de barra
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id} className={p.active ? undefined : 'opacity-60'}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{formatArs(p.price)}</TableCell>
                    <TableCell>{soldByProduct.get(p.id) ?? 0}</TableCell>
                    <TableCell>
                      <Switch
                        checked={p.active}
                        onCheckedChange={() => handleToggleActive(p)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <section className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setQrProduct(p)}>
                          <QrCode className="w-4 h-4 mr-1" />
                          QR
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar nombre o precio"
                          onClick={() => setEditProduct(p)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </section>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ventas de barra</CardTitle>
          <CardDescription>Órdenes generadas desde los QR de productos</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cant.</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Aún no hay ventas de barra
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{new Date(o.createdAt).toLocaleString('es-AR')}</TableCell>
                    <TableCell>{o.productName}</TableCell>
                    <TableCell>{o.quantity}</TableCell>
                    <TableCell>{formatArs(o.amount)}</TableCell>
                    <TableCell>
                      {o.buyerName || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.status === 'PAID' ? 'default' : 'outline'}>
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {o.status !== 'PAID' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : o.voucherStatus === 'USED' ? (
                        <Badge variant="secondary">
                          Entregado
                          {o.usedAt
                            ? ` · ${new Date(o.usedAt).toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Por canjear</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {qrProduct && (
        <ProductQrDialog
          product={qrProduct}
          eventName={eventName}
          onClose={() => setQrProduct(null)}
        />
      )}

      {editProduct && (
        <EditProductDialog
          product={editProduct}
          getIdToken={getIdToken}
          onClose={() => setEditProduct(null)}
          onSaved={() => {
            setEditProduct(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function ProductQrDialog({
  product,
  eventName,
  onClose,
}: {
  product: SerializedBarProduct;
  eventName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const url = productPurchaseUrl(product.eventId, product.id);
  const { dataUrl } = useQRAsBase64(url, { size: 480, errorCorrectionLevel: 'M' });

  async function handleCopy() {
    const copied = await copyTextSafe(url);
    toast({ title: copied ? 'Link copiado' : 'No se pudo copiar' });
  }

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-bar-${product.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            {eventName} · {formatArs(product.price)} — escaneá para comprar y pagar
          </DialogDescription>
        </DialogHeader>
        <section className="flex flex-col items-center gap-3">
          {dataUrl ? (
            <Image
              src={dataUrl}
              alt={`QR ${product.name}`}
              width={280}
              height={280}
              className="rounded-lg border"
              unoptimized
            />
          ) : (
            <Loader2 className="w-12 h-12 animate-spin my-24" />
          )}
          <p className="text-xs text-muted-foreground break-all text-center">{url}</p>
        </section>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy} className="w-full sm:w-auto">
            <Copy className="w-4 h-4 mr-2" />
            Copiar link
          </Button>
          <Button onClick={handleDownload} disabled={!dataUrl} className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Descargar PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({
  product,
  getIdToken,
  onClose,
  onSaved,
}: {
  product: SerializedBarProduct;
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsedPrice = parseInt(price, 10);
    if (!name.trim() || !parsedPrice || parsedPrice <= 0) {
      toast({
        variant: 'destructive',
        title: 'Datos inválidos',
        description: 'Nombre y precio mayor a 0 requeridos',
      });
      return;
    }
    setSaving(true);
    const token = await getIdToken();
    if (!token) {
      setSaving(false);
      return;
    }
    const res = await updateBarProduct(token, {
      productId: product.id,
      name: name.trim(),
      price: parsedPrice,
    });
    setSaving(false);
    if (res.success) {
      toast({ title: 'Producto actualizado' });
      onSaved();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
          <DialogDescription>
            El QR no cambia: sigue apuntando al mismo producto con el precio nuevo.
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="editBarName">Nombre</Label>
            <Input
              id="editBarName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </section>
          <section className="space-y-2">
            <Label htmlFor="editBarPrice">Precio (ARS)</Label>
            <Input
              id="editBarPrice"
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </section>
        </section>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
