'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/components/role-guard';
import { Loader2 } from 'lucide-react';

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
    <RoleGuard allowedRoles={['admin', 'gate']}>
      <section className="space-y-4">
        <h1 className="text-2xl font-headline font-bold text-center">Control de puerta</h1>
        <GateScanner eventId={eventId} />
      </section>
    </RoleGuard>
  );
}
