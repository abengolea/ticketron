import { TicketValidator } from "@/components/ticket-validator";

export default function ValidatePage() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Ticket Validator</h1>
        <p className="text-muted-foreground mt-2">
          Verify tickets offline by providing your secret key and the QR code payload.
        </p>
      </div>
      <TicketValidator />
    </div>
  );
}
