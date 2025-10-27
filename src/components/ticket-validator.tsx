
"use client";

import { useState, useEffect, useRef } from 'react';
import { createHmac } from 'crypto-browserify';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, ScanLine, KeyRound, AlertTriangle, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Html5Qrcode } from 'html5-qrcode';

type ValidationResult = {
  status: 'valid' | 'invalid' | 'redeemed';
  message: string;
};

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [redeemedTickets, setRedeemedTickets] = useState<Set<string>>(new Set());
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader";

  const { toast } = useToast();

  useEffect(() => {
    // Load redeemed tickets from local storage on mount
    try {
      const storedRedeemed = localStorage.getItem('redeemedTickets');
      if (storedRedeemed) {
        setRedeemedTickets(new Set(JSON.parse(storedRedeemed)));
      }
    } catch (error) {
        console.error("No se pudieron parsear los tickets canjeados desde localStorage", error);
        localStorage.removeItem('redeemedTickets');
    }

    // Initialize scanner instance
    if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId);
    }
    const scanner = scannerRef.current;

    // Cleanup function to stop the scanner on unmount
    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(err => {
          console.error("Error al detener el escáner offline en cleanup:", err);
        });
      }
    };
  }, []);

  const stopScanner = () => {
    const scanner = scannerRef.current;
    if (scanner && scanner.isScanning) {
      scanner.stop()
        .then(() => setIsScanning(false))
        .catch(err => {
          console.error("Error al detener el escáner offline:", err);
          setIsScanning(false); // Force state update
        });
    } else {
        setIsScanning(false);
    }
  };

  const handleValidate = (payload: string) => {
    if (isScanning) {
      stopScanner();
    }
    if (!secretKey.trim() || !payload.trim()) {
      toast({
        variant: "destructive",
        title: "Falta Información",
        description: "Por favor, proporciona tanto una clave secreta como el contenido del QR.",
      })
      return;
    }

    try {
      const data = JSON.parse(payload);
      const { v, eid, tid, sig } = data;

      if (!v || !eid || !tid || !sig) {
        setValidationResult({ status: 'invalid', message: 'La estructura del código QR es inválida.' });
        return;
      }
      
      if (redeemedTickets.has(tid)) {
        setValidationResult({ status: 'redeemed', message: `El ticket ${tid.substring(0,8)}... ya ha sido canjeado.` });
        return;
      }

      const payloadToSign = `${eid}|${tid}|${v}`;
      const hmac = createHmac('sha256', Buffer.from(secretKey, 'base64'));
      hmac.update(payloadToSign);
      const expectedSig = hmac.digest().slice(0, 12).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

      if (expectedSig === sig) {
        setValidationResult({ status: 'valid', message: `El ticket ${tid.substring(0,8)}... es válido para ingresar.` });
        const newRedeemed = new Set(redeemedTickets).add(tid);
        setRedeemedTickets(newRedeemed);
        localStorage.setItem('redeemedTickets', JSON.stringify(Array.from(newRedeemed)));
      } else {
        setValidationResult({ status: 'invalid', message: 'Firma inválida. El ticket es una falsificación o la clave es incorrecta.' });
      }

    } catch (error) {
      setValidationResult({ status: 'invalid', message: 'Falló al parsear el código QR. ¿Es un JSON válido?' });
    }
    setQrPayload('');
  };

  const startScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
        toast({ variant: 'destructive', title: 'Error de Escáner', description: 'La instancia del escáner no está lista.' });
        return;
    }

    if (scanner.isScanning) {
        return;
    }

    setIsScanning(true);
    setValidationResult(null);

    try {
        await scanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                setQrPayload(decodedText);
                handleValidate(decodedText);
            },
            (errorMessage) => {
                // ignore errors
            }
        )
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error de Cámara', description: "No se pudo obtener permisos de cámara. Por favor, permite el acceso a la cámara." });
        setIsScanning(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Validador Offline</CardTitle>
        <CardDescription>Introduce la clave secreta y escanea un código QR para validar un ticket. Este método no requiere internet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
            />
        </div>

        {isScanning ? (
            <div className="space-y-2">
                <div id={readerId} className="w-full rounded-md border aspect-video"></div>
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
                    placeholder="Pega los datos del código QR escaneado aquí"
                    value={qrPayload}
                    onChange={(e) => setQrPayload(e.target.value)}
                    className="font-mono text-sm"
                />
            </div>
        )}

        {validationResult && (
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
        )}
      </CardContent>
      <CardFooter className='flex-col items-stretch gap-4'>
        <div className="flex gap-2">
          {!isScanning && <Button onClick={startScanner} variant="secondary" className="w-full"><Camera className="mr-2"/> Escanear QR</Button>}
          <Button onClick={() => handleValidate(qrPayload)} className='w-full' disabled={isScanning}>Validar Ticket</Button>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>Tickets canjeados: <span className="font-bold">{redeemedTickets.size}</span></p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
                setRedeemedTickets(new Set());
                localStorage.removeItem('redeemedTickets');
                toast({ title: "Lista de canjeados limpiada." });
            }}>Limpiar Lista</Button>
        </div>
      </CardFooter>
    </Card>
  );
}
