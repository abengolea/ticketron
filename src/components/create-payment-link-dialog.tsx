'use client';

import { useState } from 'react';
import { createPaymentLink } from '@/lib/actions/payment-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Link2, Loader2 } from 'lucide-react';

interface CreatePaymentLinkDialogProps {
  eventId: string;
  eventName: string;
  unitPrice: number;
  maxTickets: number;
  getIdToken: () => Promise<string | null>;
  onCreated?: () => void;
  triggerLabel?: string;
}

export function CreatePaymentLinkDialog({
  eventId,
  eventName,
  unitPrice,
  maxTickets,
  getIdToken,
  onCreated,
  triggerLabel = 'Generar link',
}: CreatePaymentLinkDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (quantity < 1 || quantity > maxTickets) {
      toast({
        variant: 'destructive',
        title: 'Cantidad inválida',
        description: `Elegí entre 1 y ${maxTickets} entradas`,
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

      const res = await createPaymentLink(token, { eventId, ticketQuantity: quantity });

      if (res.success) {
        setOpen(false);
        setQuantity(1);
        onCreated?.();

        const copied = await copyTextSafe(res.data.checkoutUrl);
        toast({
          title: 'Link creado',
          description: `${quantity} entrada(s) · $${res.data.link.amount} · ${copied ? 'URL copiada' : 'Listo'}`,
        });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear el link. Intentá de nuevo.',
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Link2 className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar link de pago</DialogTitle>
          <DialogDescription>
            {eventName} · ${unitPrice} por entrada
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-2">
          <Label htmlFor="ticketQuantity">Cantidad de entradas</Label>
          <Input
            id="ticketQuantity"
            type="number"
            min={1}
            max={maxTickets}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
          />
          <p className="text-sm text-muted-foreground">
            Disponibles: {maxTickets} · Total: ${unitPrice * quantity} ARS
          </p>
        </section>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Crear y copiar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
