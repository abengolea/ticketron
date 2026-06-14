'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { validateTicketAtGatePublic } from '@/lib/actions/gate';
import { normalizeQrScanInput } from '@/lib/qr';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { GateValidationResult } from '@/lib/models';

const SCANNER_ID = 'gate-qr-reader';

type ScanResult = {
  result: GateValidationResult;
  message: string;
  buyerName?: string;
  ticketCode?: string;
};

const RESULT_UI: Record<
  GateValidationResult,
  {
    title: string;
    Icon: typeof CheckCircle2;
    className: string;
  }
> = {
  VALID: {
    title: 'Válido',
    Icon: CheckCircle2,
    className:
      'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300',
  },
  ALREADY_USED: {
    title: 'Ya usado',
    Icon: AlertTriangle,
    className:
      'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300',
  },
  INVALID: {
    title: 'Inválido',
    Icon: XCircle,
    className: '',
  },
  CANCELLED: {
    title: 'Cancelado',
    Icon: XCircle,
    className: '',
  },
  WRONG_EVENT: {
    title: 'Evento incorrecto',
    Icon: XCircle,
    className: '',
  },
};

interface GateScannerProps {
  eventId: string;
}

export function GateScanner({ eventId }: GateScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const lastPayloadRef = useRef<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const disposeScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      if (state === 2) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      /* ignorar al desmontar o si el DOM ya no existe */
    }
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      if (mountedRef.current) setIsScanning(false);
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
      if (mountedRef.current) setIsScanning(false);
    }
  }, []);

  const handleScan = useCallback(
    async (qrPayload: string) => {
      if (processingRef.current) return;
      if (lastPayloadRef.current === qrPayload) return;

      processingRef.current = true;
      lastPayloadRef.current = qrPayload;
      if (!mountedRef.current) return;
      setIsValidating(true);
      await stopScanner();
      if (!mountedRef.current) return;

      const response = await validateTicketAtGatePublic({
        eventId,
        qrPayload: normalizeQrScanInput(qrPayload),
      });
      if (!mountedRef.current) return;
      if (response.success) {
        setLastResult(response.data);
      } else {
        setLastResult({ result: 'INVALID', message: response.error });
      }
      setIsValidating(false);
      processingRef.current = false;
    },
    [eventId, stopScanner]
  );

  const startScanner = useCallback(async () => {
    if (!mountedRef.current) return;
    setCameraError(null);
    setLastResult(null);
    lastPayloadRef.current = null;
    processingRef.current = false;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!mountedRef.current) return;
      if (!document.getElementById(SCANNER_ID)) return;
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
      if (!mountedRef.current) {
        await disposeScanner();
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setCameraError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara');
      setIsScanning(false);
    }
  }, [handleScan, disposeScanner]);

  useEffect(() => {
    mountedRef.current = true;
    void startScanner();
    return () => {
      mountedRef.current = false;
      void disposeScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const resetForNextScan = () => {
    setLastResult(null);
    lastPayloadRef.current = null;
    processingRef.current = false;
    startScanner();
  };

  const renderResult = () => {
    if (!lastResult) return null;
    const ui = RESULT_UI[lastResult.result];
    const { Icon, title, className } = ui;

    return (
      <div className="space-y-4">
        <Alert
          variant={lastResult.result === 'VALID' ? 'default' : 'destructive'}
          className={cn(className)}
        >
          <Icon className="h-5 w-5" />
          <AlertTitle className="text-lg">{title}</AlertTitle>
          <AlertDescription className="text-base space-y-2">
            <p>{lastResult.message}</p>
            {lastResult.buyerName && (
              <p className="font-semibold text-foreground">{lastResult.buyerName}</p>
            )}
            {lastResult.ticketCode && (
              <p className="font-mono text-xs opacity-80">{lastResult.ticketCode}</p>
            )}
            {lastResult.result === 'ALREADY_USED' && (
              <p className="text-sm opacity-90">
                Reenviar el email no crea una entrada nueva: es el mismo código QR.
              </p>
            )}
          </AlertDescription>
        </Alert>
        <Button onClick={resetForNextScan} className="w-full" size="lg">
          <RotateCcw className="mr-2 h-5 w-5" />
          Validar otra entrada
        </Button>
      </div>
    );
  };

  const showScanner = !lastResult && !isValidating;

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Escanear entrada</CardTitle>
          <CardDescription>
            Apuntá la cámara al QR. Al leerlo, verás el resultado acá mismo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isValidating && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Validando entrada…</p>
            </div>
          )}

          <div
            id={SCANNER_ID}
            className={cn(
              'w-full rounded-lg overflow-hidden min-h-[280px] bg-muted',
              !showScanner || !isScanning ? 'hidden' : undefined
            )}
          />

          {showScanner && (
            <>
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

          {!lastResult && !isScanning && !isValidating && cameraError && (
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
