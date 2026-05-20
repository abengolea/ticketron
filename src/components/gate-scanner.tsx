'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Html5Qrcode } from 'html5-qrcode';
import { useIdToken } from '@/hooks/use-id-token';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { validateTicketAtGate } from '@/lib/actions/gate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { GateValidationResult } from '@/lib/models';

const RESULT_STYLES: Record<
  GateValidationResult,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  VALID: { label: 'VÁLIDO', variant: 'default' },
  ALREADY_USED: { label: 'YA USADO', variant: 'secondary' },
  INVALID: { label: 'INVÁLIDO', variant: 'destructive' },
  CANCELLED: { label: 'CANCELADO', variant: 'destructive' },
  WRONG_EVENT: { label: 'EVENTO INCORRECTO', variant: 'destructive' },
};

interface GateScannerProps {
  eventId: string;
}

export function GateScanner({ eventId }: GateScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { getIdToken, user } = useIdToken();
  const [lastResult, setLastResult] = useState<{
    result: GateValidationResult;
    message: string;
    buyerName?: string;
    ticketCode?: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const scanner = new Html5Qrcode('gate-qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decoded) => {
            if (!mounted) return;
            await handleScan(decoded);
          },
          () => {}
        );
        if (mounted) setScanning(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara');
      }
    }

    start();

    return () => {
      mounted = false;
      scannerRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleScan(qrPayload: string) {
    const token = await getIdToken();
    if (!token) {
      setLastResult({
        result: 'INVALID',
        message: 'Iniciá sesión para validar entradas en puerta.',
      });
      return;
    }

    const response = await validateTicketAtGate(token, { eventId, qrPayload });
    if (response.success) {
      setLastResult(response.data);
      if (response.data.result === 'VALID') {
        await scannerRef.current?.pause(true);
        setTimeout(() => scannerRef.current?.resume(), 2000);
      }
    } else {
      setLastResult({ result: 'INVALID', message: response.error });
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {!user && (
        <Alert>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span>Iniciá sesión para escanear y validar entradas.</span>
            <Button asChild size="sm" variant="secondary" className="shrink-0">
              <Link href="/login">Ingresar</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Escanear entrada</CardTitle>
        </CardHeader>
        <CardContent>
          <div id="gate-qr-reader" className="w-full rounded-lg overflow-hidden min-h-[300px]" />
          {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          {!scanning && !error && (
            <p className="text-muted-foreground text-sm">Iniciando cámara...</p>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card
          className={
            lastResult.result === 'VALID' ? 'border-green-500' : 'border-destructive'
          }
        >
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <Badge
              variant={RESULT_STYLES[lastResult.result].variant}
              className="text-lg px-4 py-1"
            >
              {RESULT_STYLES[lastResult.result].label}
            </Badge>
            <p className="text-center">{lastResult.message}</p>
            {lastResult.buyerName && (
              <p className="font-semibold">{lastResult.buyerName}</p>
            )}
            {lastResult.ticketCode && (
              <p className="text-xs text-muted-foreground font-mono">
                {lastResult.ticketCode}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
