'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUser } from '@/firebase';
import { Loader2 } from 'lucide-react';

const BarScanner = dynamic(
  () => import('@/components/bar-scanner').then((m) => m.BarScanner),
  {
    ssr: false,
    loading: () => (
      <section className="flex justify-center py-12">
        <Loader2 className="animate-spin w-10 h-10" />
      </section>
    ),
  }
);

export default function BarRedeemPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useUser();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-headline font-bold text-center">Validador de barra</h1>
      {!user && (
        <Alert>
          <AlertDescription>
            Para validar vouchers necesitás{' '}
            <Link href="/login" className="font-medium text-primary underline underline-offset-2">
              iniciar sesión
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}
      <BarScanner eventId={eventId} />
    </section>
  );
}
