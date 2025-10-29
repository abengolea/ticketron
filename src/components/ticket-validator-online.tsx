
"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Camera, Loader2, AlertCircle, RotateCcw, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type Html5Qrcode } from 'html5-qrcode';
import { useFirestore } from '@/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketValidator } from './ticket-validator';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { TicketStatus } from '@/lib/types';

type ValidationResult = {
  status: TicketStatus | 'invalid';
  message: string;
};

const readerId = "qr-reader-online";

export function TicketValidatorOnline() {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const { toast } = useToast();
  const firestore = useFirestore();

  useEffect(() => {
    // La función de limpieza se encarga de detener el escáner si el componente se desmonta.
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => {
          console.error("Error al detener el escáner online en cleanup:", err);
        });
      }
    };
  }, []); // El array vacío asegura que la limpieza se ejecute solo al desmontar.

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop()
        .then(() => setIsScanning(false))
        .catch(err => {
          console.error("Error al detener el escáner online:", err);
          setIsScanning(false);
        });
    } else {
        setIsScanning(false);
    }
  };


  const handleValidate = async (payload: string) => {
    stopScanner();
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
        setIsLoading(false);
        return;
      }
      
      ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);

      const resultMessage = await runTransaction(firestore, async (transaction) => {
        const ticketDoc = await transaction.get(ticketRef);

        if (!ticketDoc.exists()) {
          throw new Error(`Ticket no encontrado en la base de datos. ID: ${ticketId}`);
        }

        const ticketData = ticketDoc.data();
        
        if (ticketData.status === 'voided') {
            const reason = ticketData.voidedReason || 'Anulado por el administrador.';
            setValidationResult({ status: 'voided', message: `Ticket ANULADO. ${reason}` });
            return;
        }
        
        if (ticketData.status === 'redeemed') {
           throw new Error(`El ticket ${ticketId.substring(0,8)}... ya fue canjeado el ${new Date(ticketData.redeemedAt.seconds * 1000).toLocaleString()}.`);
        }

        transaction.update(ticketRef, { status: 'redeemed', redeemedAt: new Date() });
        return `El ticket ${ticketId.substring(0,8)}... es válido y ha sido canjeado exitosamente.`;
      });
      
      if (resultMessage) {
        setValidationResult({ status: 'active', message: resultMessage });
      }

    } catch (error: any) {
        if (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission-denied'))) {
            const permissionError = new FirestorePermissionError({
                path: ticketRef?.path || 'unknown path',
                operation: 'update',
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        if (!validationResult) { // Don't overwrite voided message
            setValidationResult({ status: 'invalid', message: error.message });
        }
    } finally {
        setIsLoading(false);
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setValidationResult(null);
    
    // Importación dinámica y creación de la instancia solo cuando se necesita.
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
                await handleValidate(decodedText);
            },
            (errorMessage) => { /* ignore */ }
        )
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error de Cámara', description: "No se pudo obtener permisos de cámara. Por favor, permite el acceso a la cámara." });
        setIsScanning(false);
    }
  };

  const resetValidation = () => {
    setValidationResult(null);
    setIsScanning(false);
    stopScanner();
  };

  const getAlertInfo = () => {
      if (!validationResult) return null;
      switch(validationResult.status) {
          case 'active':
          case 'redeemed': // In this context, a redeemed status from the transaction means it was just successfully redeemed.
              return { variant: 'default', Icon: CheckCircle2, title: 'Válido', className: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300' };
          case 'voided':
              return { variant: 'destructive', Icon: XCircle, title: 'Anulado' };
          case 'invalid': // Covers already redeemed and other errors
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
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    ) : (
                                        <Camera className="mr-2 h-5 w-5" />
                                    )}
                                    {isLoading ? 'Validando...' : 'Escanear Código QR'}
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
                            <Button onClick={resetValidation} className="w-full">
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
