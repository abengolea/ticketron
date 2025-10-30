
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Camera, Loader2, AlertCircle, RotateCcw, XCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketValidator } from './ticket-validator';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { TicketStatus } from '@/lib/types';

type ValidationResult = {
  status: TicketStatus | 'invalid';
  message: string;
  ticketId?: string;
  eventId?: string;
};

const readerId = "qr-reader-online";

// Wrapper de control del escáner para evitar ráfagas y manejar el ciclo de vida
class ScannerController {
  private scanner: Html5QrcodeScanner | null = null;
  private lastScan: { text: string; time: number } | null = null;
  private isScanning: boolean = false;

  async initialize(elementId: string, onScan: (text: string) => void, onError: (message: string) => void) {
    if (this.scanner) await this.destroy();

    try {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      this.scanner = new Html5QrcodeScanner(
        elementId,
        {
          fps: 2,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: true,
        },
        false // Verbose
      );

      this.scanner.render(
        (decodedText) => {
          const now = Date.now();
          if (this.lastScan && this.lastScan.text === decodedText && (now - this.lastScan.time) < 3000) {
            return;
          }
          this.lastScan = { text: decodedText, time: now };
          this.pause();
          onScan(decodedText);
        },
        (error) => { /* ignorar */ }
      );
      this.isScanning = true;
    } catch (err: any) {
      onError(err.message || "No se pudo inicializar el escáner.");
    }
  }

  pause() {
    if (this.scanner && this.isScanning) {
      try { this.scanner.pause(true); } catch {}
    }
  }

  resume() {
    if (this.scanner && this.isScanning) {
      try { this.scanner.resume(); } catch {}
    }
  }

  async destroy() {
    if (this.scanner) {
      try {
        if ((this.scanner as any).getState() === 2) { // state 2 is SCANNING
            await this.scanner.clear();
        }
      } catch {}
      this.scanner = null;
    }
    this.isScanning = false;
  }
}

export function TicketValidatorOnline() {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const scannerControllerRef = useRef<ScannerController | null>(null);

  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  
  // Inicializa el controlador una sola vez
  useEffect(() => {
    scannerControllerRef.current = new ScannerController();
    return () => {
        scannerControllerRef.current?.destroy();
    }
  }, []);


  const handleValidate = useCallback(async (payload: string) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Error', description: 'Firestore no está conectado.' });
      return;
    }
    if (!payload.trim()) {
      toast({ variant: "destructive", title: "Falta Contenido", description: "El código QR está vacío." });
      return;
    }

    setIsLoading(true);
    setValidationResult(null);

    let ticketRef: any;
    try {
      const data = JSON.parse(payload);
      const { eid: eventId, tid: ticketId } = data;

      if (!eventId || !ticketId) {
        setValidationResult({ status: 'invalid', message: 'Contenido de QR inválido. Falta el ID del evento o del ticket.' });
        return;
      }
      
      ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);
      const ticketDoc = await getDoc(ticketRef);
      
      if (!ticketDoc.exists()) {
        throw new Error(`Ticket no encontrado en la base de datos. ID: ${ticketId}`);
      }

      const ticketData = ticketDoc.data();
      
      if (ticketData.status === 'voided') {
          const reason = ticketData.voidedReason || 'Anulado por el administrador.';
          setValidationResult({ status: 'voided', message: `Ticket ANULADO. ${reason}` });
      } else if (ticketData.status === 'redeemed') {
          setValidationResult({ status: 'redeemed', message: `Este ticket YA FUE CANJEADO el ${new Date(ticketData.redeemedAt.seconds * 1000).toLocaleString()}.` });
      } else {
          setValidationResult({ status: 'active', message: 'Ticket VÁLIDO para ingresar.', ticketId, eventId });
      }

    } catch (error: any) {
      if (error.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: ticketRef?.path || 'unknown path',
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
      } else {
        setValidationResult({ status: 'invalid', message: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  }, [firestore, toast]);
  
  const handleRedeem = async () => {
    if (!firestore || !user || !validationResult?.ticketId || !validationResult?.eventId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se puede canjear el ticket. Debes ser administrador e iniciar sesión.' });
      return;
    }
    
    setIsRedeeming(true);
    const { eventId, ticketId } = validationResult;
    const ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);

    try {
      await updateDoc(ticketRef, { status: 'redeemed', redeemedAt: new Date() });
      setValidationResult({
        status: 'redeemed',
        message: `¡Éxito! El ticket ${ticketId.substring(0,8)}... ha sido canjeado.`
      });
      toast({ title: 'Ticket Canjeado', description: 'El estado se ha actualizado en la base de datos.'});
    } catch (e: any) {
      if (e.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: ticketRef.path,
          operation: 'update',
          requestResourceData: { status: 'redeemed' }
        }));
      } else {
        toast({ variant: 'destructive', title: 'Error al Canjear', description: e.message });
      }
    } finally {
      setIsRedeeming(false);
    }
  };

  const startScanner = useCallback(() => {
    setIsScanning(true);
    setValidationResult(null);
    scannerControllerRef.current?.initialize(readerId, 
    (decodedText) => {
        setIsScanning(false);
        handleValidate(decodedText);
    }, 
    (errorMessage) => {
        toast({ variant: 'destructive', title: 'Error de Cámara', description: errorMessage });
        setIsScanning(false);
    });
  }, [handleValidate, toast]);

  const stopScanner = useCallback(() => {
    scannerControllerRef.current?.destroy();
    setIsScanning(false);
  }, []);

  const resetValidation = () => {
    setValidationResult(null);
    stopScanner(); // Asegura que el escáner se detenga
  };

  const getAlertInfo = () => {
    if (!validationResult) return null;
    switch(validationResult.status) {
        case 'active':
            return { variant: 'default', Icon: CheckCircle2, title: 'Válido', className: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300' };
        case 'redeemed':
            return { variant: 'default', Icon: AlertTriangle, title: 'Ya Canjeado', className: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300' };
        case 'voided':
            return { variant: 'destructive', Icon: XCircle, title: 'Anulado' };
        case 'invalid':
            return { variant: 'destructive', Icon: AlertCircle, title: 'Inválido' };
        default:
            return { variant: 'destructive', Icon: AlertCircle, title: 'Error' };
    }
  }
  
  const alertInfo = getAlertInfo();

  return (
    <Tabs defaultValue="online" className="max-w-2xl mx-auto">
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
            {isScanning ? (
              <div className="space-y-2">
                <div id={readerId} className="w-full rounded-md border aspect-video bg-muted"></div>
                <Button variant="outline" onClick={stopScanner} className="w-full">Cancelar Escaneo</Button>
              </div>
            ) : (
              !validationResult && (
                <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                  <Button onClick={startScanner} variant="secondary" size="lg" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                    {isLoading ? 'Verificando...' : 'Escanear Código QR'}
                  </Button>
                </div>
              )
            )}
            {validationResult && alertInfo && (
              <div className="space-y-4">
                <Alert variant={alertInfo.variant as any} className={cn(alertInfo.className)}>
                  <alertInfo.Icon className="h-4 w-4" />
                  <AlertTitle>{alertInfo.title}</AlertTitle>
                  <AlertDescription>{validationResult.message}</AlertDescription>
                </Alert>

                {validationResult.status === 'active' && user && !userLoading && (
                  <Button onClick={handleRedeem} className="w-full" disabled={isRedeeming}>
                    {isRedeeming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Marcar como Canjeado
                  </Button>
                )}
                
                <Button onClick={resetValidation} variant="outline" className="w-full">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Validar Otro Ticket
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="offline">
        <TicketValidator />
      </TabsContent>
    </Tabs>
  );
}
