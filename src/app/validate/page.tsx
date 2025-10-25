import { TicketValidatorOnline } from "@/components/ticket-validator-online";

export default function ValidatePage() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Ticket Validator</h1>
        <p className="text-muted-foreground mt-2">
          Scan a ticket's QR code to validate it against the online database.
        </p>
      </div>
      <TicketValidatorOnline />
    </div>
  );
}
