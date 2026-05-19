import { TicketValidatorOnline } from '@/components/ticket-validator-online';

export default function ValidatePage() {
  return (
    <section className="space-y-6">
      <section className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Validador de tickets</h1>
        <p className="text-muted-foreground mt-2">
          Escaneá el código QR de un ticket impreso para validarlo con la base de datos online.
        </p>
      </section>
      <TicketValidatorOnline />
    </section>
  );
}
