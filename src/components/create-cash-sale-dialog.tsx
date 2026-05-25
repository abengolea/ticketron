'use client';

import { useState } from 'react';
import { createCashSale } from '@/lib/actions/cash-sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { QuantityStepper } from '@/components/quantity-stepper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { copyTextSafe } from '@/lib/utils';
import { Banknote, Loader2 } from 'lucide-react';

interface CreateCashSaleDialogProps {
  eventId: string;
  eventName: string;
  unitPrice: number;
  maxTickets: number;
  getIdToken: () => Promise<string | null>;
  onCreated?: () => void;
  triggerLabel?: string;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CreateCashSaleDialog({
  eventId,
  eventName,
  unitPrice,
  maxTickets,
  getIdToken,
  onCreated,
  triggerLabel = 'Cobro en efectivo',
}: CreateCashSaleDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [buyerLastName, setBuyerLastName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);

  const total = unitPrice * quantity;

  async function handleCreate() {
    if (quantity < 1 || quantity > maxTickets) {
      toast({
        variant: 'destructive',
        title: 'Cantidad inválida',
        description: `Elegí entre 1 y ${maxTickets} entradas`,
      });
      return;
    }

    if (sendEmail && !buyerEmail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Email requerido',
        description: 'Ingresá el email del comprador para enviar las entradas',
      });
      return;
    }

    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Sesión expirada',
          description: 'Volvé a iniciar sesión e intentá de nuevo',
        });
        return;
      }

      const email = buyerEmail.trim();
      const res = await createCashSale(token, {
        eventId,
        ticketQuantity: quantity,
        ...(buyerName.trim() ? { buyerName: buyerName.trim() } : {}),
        ...(buyerLastName.trim() ? { buyerLastName: buyerLastName.trim() } : {}),
        ...(buyerPhone.trim() ? { buyerPhone: buyerPhone.trim() } : {}),
        ...(email ? { buyerEmail: email } : {}),
        sendEmail: sendEmail && Boolean(email),
      });

      if (res.success) {
        setOpen(false);
        setBuyerName('');
        setBuyerLastName('');
        setBuyerPhone('');
        setBuyerEmail('');
        setQuantity(1);
        setSendEmail(true);
        onCreated?.();

        const copied = await copyTextSafe(res.data.ticketsUrl);
        let description = `${quantity} entrada(s) emitida(s) · ${formatArs(total)} · ${copied ? 'URL copiada' : 'Listo'}`;
        if (sendEmail && email) {
          description += res.data.emailSent
            ? ` · Email enviado a ${email}`
            : ` · ${res.data.emailError ?? 'No se pudo enviar el email'}`;
        }
        toast({
          title: 'Cobro en efectivo registrado',
          description,
        });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo registrar el cobro. Intentá de nuevo.',
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full sm:w-auto">
          <Banknote className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobro en efectivo</DialogTitle>
          <DialogDescription>
            {eventName} · {formatArs(unitPrice)} c/u · Sin Mercado Pago
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="cashQuantity">Cantidad de entradas</Label>
            <QuantityStepper
              id="cashQuantity"
              max={maxTickets}
              value={quantity}
              onChange={setQuantity}
            />
            <p className="text-sm text-muted-foreground">
              Disponibles: {maxTickets} · Total: {formatArs(total)}
            </p>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <section className="space-y-2">
              <Label htmlFor="cashBuyerName">Nombre (opcional)</Label>
              <Input
                id="cashBuyerName"
                placeholder="Juan"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </section>
            <section className="space-y-2">
              <Label htmlFor="cashBuyerLastName">Apellido (opcional)</Label>
              <Input
                id="cashBuyerLastName"
                placeholder="Pérez"
                value={buyerLastName}
                onChange={(e) => setBuyerLastName(e.target.value)}
              />
            </section>
          </section>
          <section className="space-y-2">
            <Label htmlFor="cashBuyerPhone">Teléfono (opcional)</Label>
            <Input
              id="cashBuyerPhone"
              type="tel"
              placeholder="+54 9 11 1234-5678"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
            />
          </section>
          <section className="space-y-2">
            <Label htmlFor="cashBuyerEmail">Email del comprador</Label>
            <Input
              id="cashBuyerEmail"
              type="email"
              placeholder="comprador@ejemplo.com"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              autoComplete="email"
            />
          </section>
          <section className="flex items-center gap-2">
            <Checkbox
              id="cashSendEmail"
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(v === true)}
            />
            <Label htmlFor="cashSendEmail" className="font-normal cursor-pointer">
              Enviar entradas por email al confirmar
            </Label>
          </section>
        </section>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
            {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Cobrar y emitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
