'use client';

import { Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { copyTextSafe, gateValidatorUrl } from '@/lib/utils';

interface CopyGateLinkButtonProps {
  eventId: string;
  eventName?: string;
  showWhatsApp?: boolean;
  className?: string;
}

export function CopyGateLinkButton({
  eventId,
  eventName,
  showWhatsApp = false,
  className,
}: CopyGateLinkButtonProps) {
  const { toast } = useToast();

  async function handleCopy() {
    const copied = await copyTextSafe(gateValidatorUrl(eventId));
    toast({
      title: copied ? 'Link del validador copiado' : 'No se pudo copiar',
      description: copied
        ? 'Pasaselo al personal de entrada; no necesitan iniciar sesión.'
        : undefined,
    });
  }

  function handleWhatsApp() {
    const url = gateValidatorUrl(eventId);
    const text = eventName
      ? `Validador de entradas — ${eventName}: ${url}`
      : `Validador de entradas: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  if (!showWhatsApp) {
    return (
      <Button variant="outline" className={className} onClick={handleCopy}>
        <Copy className="w-4 h-4 mr-2" />
        Copiar link
      </Button>
    );
  }

  return (
    <section className={className}>
      <section className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          Copiar link
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={handleWhatsApp}>
          <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
          WhatsApp
        </Button>
      </section>
    </section>
  );
}
