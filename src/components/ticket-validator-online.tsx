
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Camera, Loader2, AlertCircle, RotateCcw, XCircle, ShieldCheck, Terminal, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketValidator } from './ticket-validator';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { TicketStatus } from '@/lib/types';
import type { Html5Qrcode } from 'html5-qrcode';

type ValidationResult = {
  status: TicketStatus | 'invalid';
  message: string;
  ticketId?: string;
  eventId?: string;
  ticketNumber?: number;
};

type FinalRedeemedState = {
  isRedeemed: true;
  message: string;
}

type LogEntry = {
    timestamp: string;
    level: 'info' | 'error' | 'success' | 'warn';
    message: string;
    data?: any;
};

const readerId = "qr-reader-online";

export function TicketValidatorOnline() {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [finalRedeemedState, setFinalRedeemedState] = useState<FinalRedeemedState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const addLog = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    }, ...prev].slice(0, 50));
  }, []);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
        // Use getState to check if the scanner is active
        try {
            const state = scannerRef.current.getState();
            if (state === 2 /* SCANNING */) {
                addLog('info', 'Intentando detener el escáner...');
                scannerRef.current.stop()
                    .then(() => {
                        setIsScanning(false);
                        addLog('success', 'Escáner detenido.');
                    })
                    .catch(err => {
                        console.error("Fallo al detener el escáner:", err);
                        setIsScanning(false); 
                        addLog('error', 'Fallo al detener el escáner.', err);
                    });
            } else {
                 setIsScanning(false);
            }
        } catch (e) {
            console.error("Error al obtener el estado del escáner, forzando detención de UI:", e);
            setIsScanning(false);
        }
    } else {
        setIsScanning(false);
    }
  }, [addLog]);

  useEffect(() => {
    // Dynamically import and initialize the scanner library.
    // This effect runs once on component mount.
    if (!scannerRef.current) {
        import('html5-qrcode').then(lib => {
            // Ensure the element exists before initialization.
            if (document.getElementById(readerId)) {
                scannerRef.current = new lib.Html5Qrcode(readerId, false);
                addLog('info', 'Librería de escáner inicializada.');
            } else {
                addLog('error', `Error de inicialización: Elemento con id=${readerId} no encontrado en el DOM.`);
            }
        }).catch(err => {
            addLog('error', 'No se pudo cargar la librería de escaneo', err);
        });
    }
    
    // Cleanup function to stop the scanner on component unmount
    return () => {
      if (scannerRef.current) {
        stopScanner();
      }
    };
  }, [stopScanner, addLog]);

  const handleValidate = useCallback(async (payload: string) => {
    setIsLoading(true);
    setValidationResult(null);
    addLog('info', 'QR Decodificado. Validando payload...', payload);

    if (!firestore) {
      const msg = 'Firestore no está conectado.';
      addLog('error', msg);
      toast({ variant: 'destructive', title: 'Error', description: msg });
      setIsLoading(false);
      return;
    }

    let ticketRef: any;
    try {
      const data = JSON.parse(payload);
      addLog('success', 'Payload JSON parseado correctamente.', data);

      const { eid: eventId, tid: ticketId } = data;

      if (!eventId || !ticketId) {
        const msg = 'Contenido de QR inválido. Falta el ID del evento o del ticket.';
        setValidationResult({ status: 'invalid', message: msg });
        addLog('error', msg, data);
        return;
      }
      
      addLog('info', 'Consultando Firestore...', { path: `events/${eventId}/tickets/${ticketId}` });
      ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);
      const ticketDoc = await getDoc(ticketRef);
      
      if (!ticketDoc.exists()) {
        const msg = `Ticket no encontrado en la base de datos. ID: ${ticketId}`;
        setValidationResult({ status: 'invalid', message: msg });
        addLog('error', msg);
        return;
      }

      addLog('success', 'Ticket encontrado en Firestore.');
      const ticketData = ticketDoc.data();
      addLog('info', 'Datos del ticket:', ticketData);
      
      if (ticketData.status === 'voided') {
          const msg = `Ticket ANULADO. ${ticketData.voidedReason || 'Anulado por el administrador.'}`;
          setValidationResult({ status: 'voided', message: msg });
          addLog('warn', msg);
      } else if (ticketData.status === 'redeemed') {
          const msg = `Este ticket YA FUE CANJEADO el ${new Date(ticketData.redeemedAt.seconds * 1000).toLocaleString()}.`;
          setValidationResult({ status: 'redeemed', message: msg });
          addLog('warn', msg);
      } else {
          const msg = `Ticket VÁLIDO (Nº ${ticketData.ticketNumber}) y listo para ser canjeado.`;
          setValidationResult({ status: 'active', message: msg, ticketId, eventId, ticketNumber: ticketData.ticketNumber });
          addLog('success', msg);
      }

    } catch (error: any) {
      addLog('error', `Error durante la validación: ${error.message}`, error);
      if (error.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: ticketRef?.path || 'unknown path',
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
      } else {
        setValidationResult({ status: 'invalid', message: error.message || 'Error al procesar el QR.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [firestore, toast, addLog]);
  
  const handleRedeem = async () => {
    if (!firestore || !user || !validationResult?.ticketId || !validationResult?.eventId) {
      const msg = 'No se puede canjear el ticket. Debes ser administrador e iniciar sesión.';
      addLog('error', msg);
      toast({ variant: 'destructive', title: 'Error', description: msg });
      return;
    }
    
    setIsRedeeming(true);
    addLog('info', 'Iniciando proceso de canje...');
    const { eventId, ticketId, ticketNumber } = validationResult;
    const ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);

    const updateData = {
      status: 'redeemed',
      redeemedAt: serverTimestamp(),
      redeemedBy: user.uid,
    };

    updateDoc(ticketRef, updateData)
      .then(() => {
        const msg = `¡Canje exitoso! Ticket Nº ${ticketNumber} ha sido utilizado.`;
        setFinalRedeemedState({ isRedeemed: true, message: msg });
        setValidationResult(null);
        addLog('success', msg, { ticketId, eventId, user: user.uid });
      })
      .catch((e: any) => {
        addLog('error', 'Error al canjear el ticket.', e);
        if (e.code === 'permission-denied') {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: ticketRef.path,
            operation: 'update',
            requestResourceData: updateData
          }));
        } else {
          toast({ variant: 'destructive', title: 'Error al Canjear', description: e.message });
        }
      })
      .finally(() => {
        setIsRedeeming(false);
      });
  };

  const startScanner = useCallback(() => {
    if (!scannerRef.current) {
        addLog('warn', 'startScanner llamado, pero scannerRef es nulo.');
        toast({variant: 'destructive', title: 'Error', description: 'El componente de escaneo no está listo aún.'});
        return;
    };
    if (isScanning) return;
    
    addLog('info', 'Iniciando escáner...');
    setValidationResult(null);
    setFinalRedeemedState(null);

    const scanner = scannerRef.current;
    const config = { fps: 5, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true };
    
    const onScanSuccess = (decodedText: string) => {
        addLog('success', 'Código QR detectado.');
        stopScanner();
        handleValidate(decodedText);
    };
    
    const onScanFailure = (error: any) => { /* Silenciado a propósito */ };
    
    setIsScanning(true);
    scanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
        .catch(err => {
            setIsScanning(false);
            addLog('error', 'No se pudo iniciar la cámara.', err);
            toast({ variant: 'destructive', title: 'Error de Escáner', description: err.message || "No se pudo iniciar la cámara." });
        });

  }, [isScanning, handleValidate, toast, stopScanner, addLog]);

  const resetValidation = () => {
    addLog('info', 'Reiniciando validador.');
    setValidationResult(null);
    setFinalRedeemedState(null);
    stopScanner();
  };

  const renderInitialState = () => (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div id={readerId} className="w-full rounded-md border aspect-video bg-muted hidden"></div>
      <Button onClick={startScanner} variant="secondary" size="lg" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
          {isLoading ? 'Verificando...' : 'Escanear Código QR'}
      </Button>
    </div>
  );

  const renderScanningState = () => (
    <div className="space-y-2">
        <div id={readerId} className="w-full rounded-md border aspect-video bg-muted"></div>
        <Button variant="outline" onClick={stopScanner} className="w-full">Cancelar Escaneo</Button>
    </div>
  );

  const renderResultState = () => {
    let alertInfo: { variant: string, Icon: React.ElementType, title: string, className: string } | null = null;
    let message: string = '';

    if (finalRedeemedState) {
        alertInfo = { variant: 'default', Icon: ShieldCheck, title: 'Canjeado con Éxito', className: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300' };
        message = finalRedeemedState.message;
    } else if (validationResult) {
        message = validationResult.message;
        switch(validationResult.status) {
            case 'active':
                alertInfo = { variant: 'default', Icon: CheckCircle2, title: 'Válido', className: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300' };
                break;
            case 'redeemed':
                alertInfo = { variant: 'default', Icon: AlertTriangle, title: 'Ya Canjeado', className: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300' };
                break;
            case 'voided':
                alertInfo = { variant: 'destructive', Icon: XCircle, title: 'Anulado', className: '' };
                break;
            case 'invalid':
                alertInfo = { variant: 'destructive', Icon: AlertCircle, title: 'Inválido', className: '' };
                break;
        }
    }
    
    if (!alertInfo) return null;

    return (
        <div className="space-y-4">
            <div id={readerId} className="w-full rounded-md border aspect-video bg-muted hidden"></div>
            <Alert variant={alertInfo.variant as any} className={cn(alertInfo.className)}>
                <alertInfo.Icon className="h-4 w-4" />
                <AlertTitle>{alertInfo.title}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
            </Alert>

            {validationResult?.status === 'active' && user && (
              <Button onClick={handleRedeem} className="w-full" disabled={isRedeeming}>
                {isRedeeming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Confirmar Canje del Ticket
              </Button>
            )}
            
            <Button onClick={resetValidation} variant="outline" className="w-full">
              <RotateCcw className="mr-2 h-4 w-4" />
              Validar Otro Ticket
            </Button>
        </div>
    );
  }

  const logColors: Record<LogEntry['level'], string> = {
    info: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
    warn: 'text-yellow-400'
  };
  
  const currentView = () => {
    if(isScanning) return renderScanningState();
    if(validationResult || finalRedeemedState) return renderResultState();
    return renderInitialState();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
        <Tabs defaultValue="online">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="online">Validador Online</TabsTrigger>
            <TabsTrigger value="offline">Validador Offline</TabsTrigger>
          </TabsList>
          <TabsContent value="online">
            <Card>
              <CardHeader>
                <CardTitle>Validador Online</CardTitle>
                <CardDescription>Escanea un ticket para validarlo en tiempo real contra la base de datos. Requiere conexión a internet.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentView()}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="offline">
            <TicketValidator />
          </TabsContent>
        </Tabs>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2"><Terminal /> Logs en Vivo</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setLogs([])}><RefreshCw className="h-4 w-4" /></Button>
                </div>
                <CardDescription>Los eventos del proceso de validación online aparecerán aquí.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] bg-black rounded-lg p-4 overflow-y-auto font-mono text-xs space-y-3">
                    {logs.length === 0 && <p className="text-muted-foreground">Esperando acciones...</p>}
                    {logs.map((log, i) => (
                        <div key={i} className={cn("border-l-2 pl-3", log.level === 'success' ? 'border-green-500' : log.level === 'error' ? 'border-red-500' : log.level === 'warn' ? 'border-yellow-500' : 'border-blue-500')}>
                            <p className={cn("font-bold flex justify-between", logColors[log.level])}>
                                <span>{log.message}</span>
                                <span className="text-muted-foreground/50">{log.timestamp}</span>
                            </p>
                            {log.data && (
                                <pre className="mt-1 p-2 bg-muted/20 rounded-md overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all">
                                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

    