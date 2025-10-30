
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
import { Camera, KeyRound, Loader2, RotateCcw, Info, Terminal, RefreshCw, Trash2 } from "lucide-react";
import { createHmacSha256 } from "@/lib/utils";


type LogEntry = {
    timestamp: string;
    level: 'info' | 'error' | 'success' | 'warn';
    message: string;
    data?: any;
};

const SCANNER_CONTAINER_ID = "qr-reader-debug";

export default function ValidatorDebugPage() {
  const [secret, setSecret] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redeemedCount, setRedeemedCount] = useState(0);
  
  const scannerRef = useRef<ScannerController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const updateCount = () => {
        const count = registry.snapshot().filter(r => r.state === 'redeemed').length;
        setRedeemedCount(count);
    };
    const unsubscribe = registry.subscribe(updateCount);
    updateCount();
    return unsubscribe;
  }, []);

  const addLog = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    }, ...prev].slice(0, 50)); // Limita los logs a 50 entradas
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
    addLog('info', 'Generando firma para verificación...', {
        payloadToSign,
        secretKey: `${secret.substring(0, 5)}...${secret.substring(secret.length - 5)}`
    });
    
    try {
        const expectedSignature = await createHmacSha256(secret, payloadToSign);
        addLog('info', 'Firma del QR', sig);
        addLog('info', 'Firma generada localmente', expectedSignature);

        const isValid = expectedSignature === sig;
        if (isValid) {
            addLog('success', '¡Las firmas coinciden! El ticket es auténtico.');
        } else {
            addLog('error', '¡Las firmas NO coinciden! El ticket es inválido o la clave secreta es incorrecta.');
            setIsLoading(false);
            return;
        }

        // Si la firma es válida, proceder con el canje usando el servicio
        const validatorService = new ValidatorService(() => secret);
        const result = await validatorService.validateAndRedeem(payloadText);

        const level = result.outcome === 'valid' ? 'success' : result.outcome === 'already_redeemed' ? 'warn' : 'error';
        addLog(level, `Resultado final del canje: ${result.outcome.toUpperCase()}`, result);

    } catch (e: any) {
        addLog('error', 'Error durante el proceso de firma o validación', e.message);
    } finally {
        setIsLoading(false);
        // Opcional: reiniciar scanner para el siguiente
        // setTimeout(() => startScanner(), 1000);
    }
  }, [secret, addLog, toast]);

  const startScanner = useCallback(async () => {
    addLog('info', 'Intentando iniciar escáner...');
    if (!scannerRef.current) {
      scannerRef.current = new ScannerController(SCANNER_CONTAINER_ID);
    }
    try {
      setIsScanning(true);
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
  
  const clearLogs = () => setLogs([]);
  
  const clearRegistry = () => {
    registry.clear();
    addLog('warn', 'Registro de canjes locales ha sido limpiado.');
    toast({ title: 'Registro Limpiado', description: 'Todos los tickets canjeados en este dispositivo han sido reseteados.' });
  }

  const logColors = {
    info: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
    warn: 'text-yellow-400'
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
                                <KeyRound className="w-4 h-4" /> Clave Secreta del Evento
                            </Label>
                            <Textarea
                                id="secret-key"
                                placeholder="Pega la clave secreta que descargaste al crear el evento."
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                className="font-mono text-sm h-24"
                                disabled={isScanning || isLoading}
                            />
                        </div>

                        <div id={SCANNER_CONTAINER_ID} className={cn("w-full aspect-video border-2 border-dashed rounded-lg bg-muted flex items-center justify-center text-muted-foreground", { 'border-solid': isScanning })}>
                            {!isScanning && <p>Cámara inactiva</p>}
                            {isScanning && !isLoading && <p>Esperando QR...</p>}
                            {isLoading && <Loader2 className="h-8 w-8 animate-spin" />}
                        </div>

                        {!isScanning && (
                        <Button onClick={startScanner} className="w-full" disabled={!secret || isLoading}>
                            <Camera className="mr-2 h-4 w-4" /> Iniciar Escáner
                        </Button>
                        )}
                        {isScanning && (
                        <Button onClick={stopScanner} variant="outline" className="w-full" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Detener Escáner
                        </Button>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="flex-col items-stretch gap-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
                    <p>
                      Tickets canjeados en este dispositivo: <span className="font-bold text-foreground">{redeemedCount}</span>
                    </p>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={clearRegistry}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpiar Registro
                    </Button>
                  </div>
                </CardFooter>
            </Card>

            <Card className="h-full">
                 <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="flex items-center gap-2"><Terminal /> Logs en Vivo</CardTitle>
                        <Button variant="ghost" size="icon" onClick={clearLogs}><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                    <CardDescription>Los eventos del proceso de validación aparecerán aquí.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[450px] bg-black rounded-lg p-4 overflow-y-auto font-mono text-xs space-y-3">
                        {logs.length === 0 && <p className="text-muted-foreground">Esperando acciones...</p>}
                        {logs.map((log, i) => (
                            <div key={i} className={cn("border-l-2 pl-3", log.level === 'success' ? 'border-green-500' : log.level === 'error' ? 'border-red-500' : log.level === 'warn' ? 'border-yellow-500' : 'border-blue-500')}>
                               <p className={cn("font-bold flex justify-between", logColors[log.level])}>
                                 <span>{log.message}</span>
                                 <span className="text-muted-foreground/50">{log.timestamp}</span>
                               </p>
                               {log.data && (
                                    <pre className="mt-1 p-2 bg-muted/20 rounded-md overflow-x-auto text-muted-foreground">
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
