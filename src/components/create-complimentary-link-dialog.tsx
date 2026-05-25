'use client';

import { useState } from 'react';
import { createComplimentaryLink } from '@/lib/actions/complimentary-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Gift, Loader2 } from 'lucide-react';

interface CreateComplimentaryLinkDialogProps {
  eventId: string;
  eventName: string;
  maxTickets: number;
  getIdToken: () => Promise<string | null>;
  onCreated?: () => void;
  triggerLabel?: string;
}

export function CreateComplimentaryLinkDialog({
  eventId,
  eventName,
  maxTickets,
  getIdToken,
  onCreated,
  triggerLabel = 'Entrada de cortesía',
}: CreateComplimentaryLinkDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [beneficiaryEmail, setBeneficiaryEmail] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [message, setMessage] = useState('');
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

    if (!beneficiaryEmail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Email requerido',
        description: 'Ingresá el email del beneficiario',
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

      const res = await createComplimentaryLink(token, {
        eventId,
        ticketQuantity: quantity,
        beneficiaryEmail: beneficiaryEmail.trim(),
        ...(beneficiaryName.trim() ? { beneficiaryName: beneficiaryName.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });

      if (res.success) {
        const email = beneficiaryEmail.trim();
        setOpen(false);
        setBeneficiaryEmail('');
        setBeneficiaryName('');
        setMessage('');
        setQuantity(1);
        onCreated?.();

        const copied = await copyTextSafe(res.data.ticketsUrl);
        const emailNote = res.data.emailSent
          ? `Email enviado a ${email}`
          : res.data.emailError ?? 'No se pudo enviar el email (revisá RESEND_API_KEY)';
        toast({
          title: 'Entrada de cortesía creada',
          description: `${quantity} entrada(s) · ${copied ? 'URL copiada' : 'Listo'} · ${emailNote}`,
        });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear la entrada. Intentá de nuevo.',
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full sm:w-auto">
          <Gift className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Entrada de cortesía</DialogTitle>
          <DialogDescription>
            {eventName} · Se generan QR al instante y se envían por email al beneficiario
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="beneficiaryEmail">Email del beneficiario</Label>
            <Input
              id="beneficiaryEmail"
              type="email"
              placeholder="invitado@ejemplo.com"
              value={beneficiaryEmail}
              onChange={(e) => setBeneficiaryEmail(e.target.value)}
              autoComplete="email"
            />
          </section>
          <section className="space-y-2">
            <Label htmlFor="beneficiaryName">Nombre (opcional)</Label>
            <Input
              id="beneficiaryName"
              placeholder="María García"
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
            />
          </section>
          <section className="space-y-2">
            <Label htmlFor="complimentaryMessage">Mensaje personal (opcional)</Label>
            <Textarea
              id="complimentaryMessage"
              placeholder="¡Te esperamos en la fiesta!"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </section>
          <section className="space-y-2">
            <Label htmlFor="cortesiaQuantity">Cantidad de entradas</Label>
            <QuantityStepper
              id="cortesiaQuantity"
              max={maxTickets}
              value={quantity}
              onChange={setQuantity}
            />
            <p className="text-sm text-muted-foreground">
              Disponibles: {maxTickets}
            </p>
          </section>
        </section>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
            {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Generar y enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
