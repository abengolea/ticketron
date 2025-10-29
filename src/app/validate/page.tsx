import { TicketValidatorOnline } from "@/components/ticket-validator-online";
import PrivateRoute from "@/components/private-route";

export default function ValidatePage() {
  return (
    <PrivateRoute>
        <div>
            <div className="text-center mb-8">
                <h1 className="text-4xl font-headline text-primary">Validador de Tickets</h1>
                <p className="text-muted-foreground mt-2">
                Escanea el código QR de un ticket para validarlo con la base de datos online.
                </p>
            </div>
            <TicketValidatorOnline />
        </div>
    </PrivateRoute>
  );
}
