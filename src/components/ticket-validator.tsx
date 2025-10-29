
"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, ScanLine, KeyRound, AlertTriangle, Camera, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type Html5Qrcode } from 'html5-qrcode';
import { createHmacSha256 } from '@/lib/utils';
import { useLocalStorage } from '@/hooks/use-local-storage';

type ValidationResult = {
  status: 'valid' | 'invalid' | 'redeemed';
  message: string;
};

const readerId = "qr-reader-offline";

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [redeemedTickets, setRedeemedTickets] = useLocalStorage<string[]>('redeemedTickets', []);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    // La función de limpieza se encarga de detener el escáner si el componente se desmonta.
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => {
          console.error("Error al detener el escáner offline en cleanup:", err);
        });
      }
    };
  }, []); // Array vacío para que solo se ejecute al montar y desmontar.

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop()
        .then(() => setIsScanning(false))
        .catch(err => {
          console.error("Error al detener el escáner offline:", err);
          setIsScanning(false);
        });
    } else {
      setIsScanning(false);
    }
  };

  const validateTicket = async (payload: string) => {
    if (!secretKey.trim() || !payload.trim()) {
      toast({
        variant: "destructive",
        title: "Falta Información",
        description: "Por favor, proporciona tanto una clave secreta como el contenido del QR.",
      });
      return;
    }

    try {
      const data = JSON.parse(payload);
      const { v, eid, tid, sig } = data;

      if (!v || !eid || !tid || !sig) {
        setValidationResult({ status: 'invalid', message: 'La estructura del código QR es inválida.' });
        return;
      }
      
      // CRITICAL FIX: Create a fresh Set from the latest state value
      // before checking for redeemed tickets.
      const currentRedeemedSet = new Set(redeemedTickets);
      if (currentRedeemedSet.has(tid)) {
        setValidationResult({ status: 'redeemed', message: `El ticket ${tid.substring(0,8)}... ya ha sido canjeado.` });
        return;
      }

      const payloadToSign = `${eid}|${tid}|${v}`;
      const expectedSig = await createHmacSha256(secretKey, payloadToSign);

      if (expectedSig === sig) {
        setValidationResult({ status: 'valid', message: `El ticket ${tid.substring(0,8)}... es válido para ingresar.` });
        // Add to redeemed list immediately after successful validation
        setRedeemedTickets(prev => [...prev, tid]);
      } else {
        setValidationResult({ status: 'invalid', message: 'Firma inválida. El ticket es una falsificación o la clave es incorrecta.' });
      }

    } catch (error) {
      setValidationResult({ status: 'invalid', message: 'Falló al parsear el código QR. ¿Es un JSON válido?' });
    }
  };

  const handleManualValidation = async () => {
    await validateTicket(qrPayload);
  }

  const startScanner = async () => {
    setIsScanning(true);
    setValidationResult(null);

    // Importación dinámica y creación bajo demanda.
    const { Html5Qrcode } = await import('html5-qrcode');
    if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId, false);
    }
    const scanner = scannerRef.current;
    
    if (scanner.isScanning) {
        return;
    }

    try {
        await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                stopScanner();
                setQrPayload(decodedText);
                await validateTicket(decodedText);
            },
            (errorMessage) => { /* ignore */ }
        )
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error de Cámara', description: "No se pudo obtener permisos de cámara. Por favor, permite el acceso a la cámara." });
        setIsScanning(false);
    }
  };
  
  const clearRedeemed = () => {
    setRedeemedTickets([]);
    toast({ title: "Lista de canjeados limpiada." });
  };

  const resetValidation = () => {
    setValidationResult(null);
    setQrPayload('');
    setIsScanning(false);
    stopScanner();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validador Offline</CardTitle>
        <CardDescription>Introduce la clave secreta y escanea un código QR para validar un ticket. Este método no requiere internet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!validationResult && (
          <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="secret-key" className='flex items-center gap-2'>
                    <KeyRound className='w-4 h-4'/>
                    Clave Secreta
                </Label>
                <Textarea
                    id="secret-key"
                    placeholder="Pega la clave secreta de 32 bytes aquí"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    className="font-mono text-sm"
                    disabled={isScanning}
                />
            </div>

            {isScanning ? (
                <div className="space-y-2">
                    <div id={readerId} className="w-full rounded-md border aspect-video bg-muted"></div>
                    <Button variant="outline" onClick={stopScanner} className="w-full">Cancelar Escaneo</Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <Label htmlFor="qr-payload" className='flex items-center gap-2'>
                        <ScanLine className='w-4 h-4' />
                        Contenido del Código QR
                    </Label>
                    <Textarea
                        id="qr-payload"
                        placeholder="Pega los datos del código QR escaneado aquí, o usa el botón para escanear."
                        value={qrPayload}
                        onChange={(e) => setQrPayload(e.target.value)}
                        className="font-mono text-sm"
                    />
                </div>
            )}
          </div>
        )}

        {validationResult && (
          <div className="space-y-4">
            <Alert variant={validationResult.status === 'invalid' ? 'destructive' : 'default'} className={cn({
              'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300': validationResult.status === 'valid',
              'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300': validationResult.status === 'redeemed',
            })}>
              {validationResult.status === 'valid' && <CheckCircle2 className="h-4 w-4" />}
              {validationResult.status === 'redeemed' && <AlertTriangle className="h-4 w-4" />}
              {validationResult.status === 'invalid' && <XCircle className="h-4 w-4" />}
              <AlertTitle className='capitalize'>{validationResult.status === 'valid' ? 'Válido' : (validationResult.status === 'invalid' ? 'Inválido' : 'Canjeado')}</AlertTitle>
              <AlertDescription>{validationResult.message}</AlertDescription>
            </Alert>
             <Button onClick={resetValidation} className="w-full">
                <RotateCcw className="mr-2 h-4 w-4" />
                Validar Otro Ticket
            </Button>
          </div>
        )}
      </CardContent>
      {!validationResult && (
        <CardFooter className='flex-col items-stretch gap-4'>
          <div className="flex gap-2">
            {!isScanning && <Button onClick={startScanner} variant="secondary" className="w-full"><Camera className="mr-2"/> Escanear QR</Button>}
            <Button onClick={handleManualValidation} className='w-full' disabled={isScanning || !qrPayload}>Validar Ticket</Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
              <p>Tickets canjeados: <span className="font-bold">{redeemedTickets.length}</span></p>
              <Button variant="outline" size="sm" className="ml-auto" onClick={clearRedeemed}>Limpiar Lista</Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
