import { EventHistory } from "@/components/event-history";
import PrivateRoute from "@/components/private-route";

export default function HistoryPage() {
  return (
    <PrivateRoute>
      <div>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-headline text-primary">Historial de Eventos</h1>
          <p className="text-muted-foreground mt-2">
            Explora los eventos generados previamente y sus tickets.
          </p>
        </div>
        <EventHistory />
      </div>
    </PrivateRoute>
  );
}
