'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Html5Qrcode } from 'html5-qrcode';
import { useIdToken } from '@/hooks/use-id-token';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { validateBarVoucher, type BarValidationResponse } from '@/lib/actions/bar';
import { normalizeQrScanInput } from '@/lib/qr';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { BarValidationResult } from '@/lib/models';

const SCANNER_ID = 'bar-qr-reader';

const RESULT_UI: Record<
  BarValidationResult,
  { title: string; Icon: typeof CheckCircle2; className: string }
> = {
  VALID: {
    title: 'Entregar pedido',
    Icon: CheckCircle2,
    className:
      'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300',
  },
  ALREADY_USED: {
    title: 'Ya canjeado',
    Icon: AlertTriangle,
    className:
      'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300',
  },
  INVALID: {
    title: 'Inválido',
    Icon: XCircle,
    className: '',
  },
  NOT_PAID: {
    title: 'Sin pagar',
    Icon: XCircle,
    className: '',
  },
  WRONG_EVENT: {
    title: 'Evento incorrecto',
    Icon: XCircle,
    className: '',
  },
};

interface BarScannerProps {
  eventId: string;
}

export function BarScanner({ eventId }: BarScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastPayloadRef = useRef<string | null>(null);
  const { getIdToken, user } = useIdToken();
  const [lastResult, setLastResult] = useState<BarValidationResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      setIsScanning(false);
      return;
    }
    try {
      const state = scanner.getState();
      if (state === 2) {
        await scanner.stop();
      }
    } catch {
      /* ignorar al desmontar */
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleScan = useCallback(
    async (qrPayload: string) => {
      if (processingRef.current) return;
      if (lastPayloadRef.current === qrPayload) return;

      processingRef.current = true;
      lastPayloadRef.current = qrPayload;
      setIsValidating(true);
      await stopScanner();

      const token = await getIdToken();
      if (!token) {
        setLastResult({
          result: 'INVALID',
          message: 'Iniciá sesión para validar vouchers de barra.',
        });
        setIsValidating(false);
        processingRef.current = false;
        return;
      }

      const response = await validateBarVoucher(token, {
        eventId,
        qrPayload: normalizeQrScanInput(qrPayload),
      });
      if (response.success) {
        setLastResult(response.data);
      } else {
        setLastResult({ result: 'INVALID', message: response.error });
      }
      setIsValidating(false);
      processingRef.current = false;
    },
    [eventId, getIdToken, stopScanner]
  );

  const startScanner = useCallback(async () => {
    if (!user) return;
    setCameraError(null);
    setLastResult(null);
    lastPayloadRef.current = null;
    processingRef.current = false;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(SCANNER_ID, false);
      }
      const scanner = scannerRef.current;
      setIsScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 260, height: 260 } },
        async (decoded) => {
          await handleScan(decoded);
        },
        () => {}
      );
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara');
      setIsScanning(false);
    }
  }, [handleScan, user]);

  useEffect(() => {
    if (user) {
      startScanner();
    }
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user]);

  const resetForNextScan = () => {
    setLastResult(null);
    lastPayloadRef.current = null;
    processingRef.current = false;
    startScanner();
  };

  const renderResult = () => {
    if (!lastResult) return null;
    const { Icon, title, className } = RESULT_UI[lastResult.result];

    return (
      <div className="space-y-4">
        <Alert
          variant={lastResult.result === 'VALID' ? 'default' : 'destructive'}
          className={cn(className)}
        >
          <Icon className="h-5 w-5" />
          <AlertTitle className="text-lg">{title}</AlertTitle>
          <AlertDescription className="text-base space-y-2">
            {lastResult.productName && (
              <p className="text-xl font-bold text-foreground">
                {lastResult.productName} x{lastResult.quantity ?? 1}
              </p>
            )}
            <p>{lastResult.message}</p>
            {lastResult.buyerName && (
              <p className="font-semibold text-foreground">{lastResult.buyerName}</p>
            )}
            {lastResult.voucherCode && (
              <p className="font-mono text-xs opacity-80">{lastResult.voucherCode}</p>
            )}
          </AlertDescription>
        </Alert>
        <Button onClick={resetForNextScan} className="w-full" size="lg">
          <RotateCcw className="mr-2 h-5 w-5" />
          Escanear otro voucher
        </Button>
      </div>
    );
  };

  const showScanner = !lastResult && !isValidating;

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Escanear voucher de barra</CardTitle>
          <CardDescription>
            Apuntá la cámara al QR del comprador. Si es válido, entregá el pedido que aparece
            en pantalla.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user && (
            <Alert>
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span>Iniciá sesión para escanear y validar vouchers.</span>
                <Button asChild size="sm" variant="secondary" className="shrink-0">
                  <Link href="/login">Ingresar</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isValidating && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Validando voucher…</p>
            </div>
          )}

          {showScanner && user && (
            <>
              <div
                id={SCANNER_ID}
                className={cn(
                  'w-full rounded-lg overflow-hidden min-h-[280px] bg-muted',
                  !isScanning && 'hidden'
                )}
              />
              {cameraError && (
                <Alert variant="destructive">
                  <AlertDescription>{cameraError}</AlertDescription>
                </Alert>
              )}
              {!isScanning && !cameraError && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Iniciando cámara…</p>
                </div>
              )}
              {isScanning && (
                <Button variant="outline" onClick={stopScanner} className="w-full">
                  Cancelar escaneo
                </Button>
              )}
            </>
          )}

          {lastResult && !isValidating && renderResult()}

          {user && !lastResult && !isScanning && !isValidating && cameraError && (
            <Button onClick={startScanner} className="w-full" size="lg">
              <Camera className="mr-2 h-5 w-5" />
              Reintentar cámara
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
