import { EventHistory } from '@/components/event-history';
import PrivateRoute from '@/components/private-route';
import { PrintSectionNav } from '@/components/print-section-nav';

export default function HistoryPage() {
  return (
    <PrivateRoute>
      <section className="space-y-6">
        <PrintSectionNav />
        <section className="text-center mb-8">
          <h1 className="text-4xl font-headline text-primary">Historial de eventos</h1>
          <p className="text-muted-foreground mt-2">
            Explorá los eventos generados previamente y sus tickets para imprimir.
          </p>
        </section>
        <EventHistory />
      </section>
    </PrivateRoute>
  );
}
