'use client';

import { useState } from 'react';
import { createPaymentLink } from '@/lib/actions/payment-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [recipientLabel, setRecipientLabel] = useState('');
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setQuantity(1);
    setRecipientLabel('');
  }

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

      const res = await createPaymentLink(token, {
        eventId,
        ticketQuantity: quantity,
        recipientLabel: recipientLabel.trim() || undefined,
      });

      if (res.success) {
        setOpen(false);
        resetForm();
        onCreated?.();

        const labelNote = res.data.link.recipientLabel
          ? ` · ${res.data.link.recipientLabel}`
          : '';
        const copied = await copyTextSafe(res.data.checkoutUrl);
        toast({
          title: 'Link creado',
          description: `${quantity} entrada(s) · $${res.data.link.amount}${labelNote} · ${copied ? 'URL copiada' : 'Listo'}`,
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full sm:w-auto">
          <Link2 className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Generar link de pago</DialogTitle>
          <DialogDescription>
            {eventName} · ${unitPrice} por entrada
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="recipientLabel">Referencia (opcional)</Label>
            <Input
              id="recipientLabel"
              placeholder="Ej. Juan Pérez, mesa 3, grupo amigos"
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              maxLength={80}
            />
            <p className="text-sm text-muted-foreground">
              Solo para vos: identificá a quién le mandás el link
            </p>
          </section>
          <section className="space-y-2">
            <Label htmlFor="ticketQuantity">Cantidad de entradas</Label>
            <QuantityStepper
              id="ticketQuantity"
              max={maxTickets}
              value={quantity}
              onChange={setQuantity}
            />
            <p className="text-sm text-muted-foreground">
              Disponibles: {maxTickets} · Total: ${unitPrice * quantity} ARS
            </p>
          </section>
        </section>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
            {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Crear y copiar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
