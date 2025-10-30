
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ValidatorService, ValidateOutcome } from "@/core/validator-service";
import { ScannerController } from "@/core/scanner-controller";
import { registry, TicketRecord } from "@/core/ticket-registry";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, KeyRound, Loader2, RotateCcw, Info, Terminal } from "lucide-react";
import { createHmacSha256 } from "@/lib/utils";


type LogEntry = {
    timestamp: string;
    level: 'info' | 'error' | 'success';
    message: string;
    data?: any;
};

const SCANNER_CONTAINER_ID = "qr-reader-debug";

export default function ValidatorDebugPage() {
  const [secret, setSecret] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const scannerRef = useRef<ScannerController | null>(null);
  const { toast } = useToast();

  const addLog = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    }, ...prev]);
  }, []);

  const handleDecode = useCallback(async (payloadText: string) => {
    setIsLoading(true);
    addLog('info', 'QR Decodificado', payloadText);

    if (!secret) {
        addLog('error', 'Clave secreta no proporcionada. Abortando validación.');
        setIsLoading(false);
        toast({ variant: 'destructive', title: 'Error', description: 'Por favor, introduce la clave secreta.'});
        return;
    }
    
    let qrData: any;
    try {
        qrData = JSON.parse(payloadText);
        addLog('success', 'Payload JSON parseado correctamente', qrData);
    } catch {
        addLog('error', 'El contenido del QR no es un JSON válido.');
        setIsLoading(false);
        return;
    }

    const { v, eid, tid, sig } = qrData ?? {};
    if (!v || !eid || !tid || !sig) {
        addLog('error', 'Faltan campos esenciales en el QR (v, eid, tid, sig).');
        setIsLoading(false);
        return;
    }
    
    const payloadToSign = `${eid}|${tid}|${v}`;
    addLog('info', 'Generando firma con los siguientes datos:', {
        payloadToSign,
        secretKey: `${secret.substring(0, 5)}...${secret.substring(secret.length - 5)}`
    });
    
    try {
        const expectedSignature = await createHmacSha256(secret, payloadToSign);
        addLog('info', 'Firma Generada (expected)', expectedSignature);
        addLog('info', 'Firma del QR (sig)', sig);

        const isValid = expectedSignature === sig;
        if (isValid) {
            addLog('success', '¡Las firmas coinciden! El ticket es auténtico.');
        } else {
            addLog('error', '¡Las firmas NO coinciden! El ticket es inválido o la clave secreta es incorrecta.');
            setIsLoading(false);
            return;
        }

        // Si la firma es válida, proceder con el registro
        const validatorService = new ValidatorService(() => secret);
        const result = await validatorService.validateAndRedeem(payloadText);

        addLog(result.outcome === 'valid' ? 'success' : 'error', 'Resultado final del canje', result);

    } catch (e: any) {
        addLog('error', 'Error durante el proceso de firma o validación', e.message);
    } finally {
        setIsLoading(false);
    }
  }, [secret, addLog, toast]);

  const startScanner = useCallback(async () => {
    addLog('info', 'Iniciando escáner...');
    setIsScanning(true);
    if (!scannerRef.current) {
      scannerRef.current = new ScannerController(SCANNER_CONTAINER_ID);
    }
    try {
      await scannerRef.current.start(handleDecode);
      addLog('success', 'Escáner iniciado. Apunte la cámara a un código QR.');
    } catch(err: any) {
      addLog('error', 'No se pudo iniciar el escáner.', err.message);
      toast({ variant: 'destructive', title: 'Error de Escáner', description: err.message });
      setIsScanning(false);
    }
  }, [handleDecode, toast, addLog]);

  const stopScanner = useCallback(async () => {
    addLog('info', 'Deteniendo escáner...');
    if (scannerRef.current) {
      await scannerRef.current.pause();
    }
    setIsScanning(false);
    addLog('success', 'Escáner detenido.');
  }, [addLog]);
  
  const reset = () => {
    setLogs([]);
    stopScanner();
  };

  const logColors = {
    info: 'text-muted-foreground',
    success: 'text-green-500',
    error: 'text-red-500',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
            <h1 className="text-4xl font-headline text-primary">Debug del Validador</h1>
            <p className="text-muted-foreground mt-2">
            Esta página te permite ver los detalles internos del proceso de validación de tickets.
            </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>Control del Validador</CardTitle>
                    <CardDescription>Pega la clave secreta y utiliza los controles para escanear.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="secret-key" className="flex items-center gap-2 mb-2">
                                <KeyRound className="w-4 h-4" /> Clave Secreta
                            </Label>
                            <Textarea
                                id="secret-key"
                                placeholder="Pega la clave secreta del evento aquí"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                className="font-mono text-sm h-24"
                                disabled={isScanning || isLoading}
                            />
                        </div>

                        <div id={SCANNER_CONTAINER_ID} className={cn("w-full aspect-video border rounded-lg bg-muted flex items-center justify-center text-muted-foreground", { 'hidden': !isScanning })}>
                            {isScanning && <Loader2 className="h-8 w-8 animate-spin" />}
                        </div>

                        {!isScanning && (
                        <Button onClick={startScanner} className="w-full" disabled={!secret || isLoading}>
                            <Camera className="mr-2 h-4 w-4" /> Iniciar Escáner
                        </Button>
                        )}
                        {isScanning && (
                        <Button onClick={stopScanner} variant="outline" className="w-full" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Detener
                        </Button>
                        )}
                    </div>
                </CardContent>

                <CardFooter>
                    <Button variant="ghost" className="w-full" onClick={reset}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Limpiar Logs y Reiniciar
                    </Button>
                </CardFooter>
            </Card>

            <Card className="h-full">
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Terminal /> Logs en Vivo</CardTitle>
                    <CardDescription>Los eventos del proceso de validación aparecerán aquí.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[450px] bg-muted/50 rounded-lg p-4 overflow-y-auto font-mono text-xs space-y-3">
                        {logs.length === 0 && <p className="text-muted-foreground">Esperando acciones...</p>}
                        {logs.map((log, i) => (
                            <div key={i} className={cn("border-l-2 pl-3", log.level === 'success' ? 'border-green-500' : log.level === 'error' ? 'border-red-500' : 'border-border')}>
                               <p className="font-bold flex justify-between">
                                 <span>{log.message}</span>
                                 <span className="text-muted-foreground/50">{log.timestamp}</span>
                               </p>
                               {log.data && (
                                    <pre className={cn("mt-1 p-2 bg-black rounded-md overflow-x-auto", logColors[log.level])}>
                                        {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                                    </pre>
                               )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
