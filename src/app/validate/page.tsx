import { TicketValidatorOnline } from '@/components/ticket-validator-online';

export default function ValidatePage() {
  return (
    <section className="space-y-6">
      <section className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Validador PDF</h1>
        <p className="text-muted-foreground mt-2">
          Para tickets generados e impresos en lote (formato legacy). Las entradas de venta digital
          se validan en Validador digital.
        </p>
      </section>
      <TicketValidatorOnline />
    </section>
  );
}
