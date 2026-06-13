'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CopyGateLinkButton } from '@/components/copy-gate-link-button';
import { ArrowLeft, Loader2 } from 'lucide-react';

const GateScanner = dynamic(
  () => import('@/components/gate-scanner').then((m) => m.GateScanner),
  {
    ssr: false,
    loading: () => (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    ),
  }
);

export default function GatePage() {
  const { eventId } = useParams<{ eventId: string }>();

  return (
    <section className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/gate">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Elegir otro evento
        </Link>
      </Button>
      <h1 className="text-2xl font-headline font-bold text-center">Validador digital</h1>
      <CopyGateLinkButton eventId={eventId} className="w-full max-w-lg mx-auto" />
      <GateScanner eventId={eventId} />
    </section>
  );
}
