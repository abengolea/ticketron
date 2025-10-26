import { EventHistory } from "@/components/event-history";

export default function HistoryPage() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Event History</h1>
        <p className="text-muted-foreground mt-2">
          Browse previously generated events and their tickets.
        </p>
      </div>
      <EventHistory />
    </div>
  );
}
