"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Camera, Loader2, AlertCircle, RotateCcw, XCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Html5Qrcode } from 'html5-qrcode';
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

export function TicketValidatorOnline() {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
        if (scannerRef.current && (scannerRef.current as any).isScanning) {
            scannerRef.current.stop().catch(() => {});
        }
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

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current && (scannerRef.current as any).isScanning) {
        await scannerRef.current.stop();
        const el = document.getElementById(readerId);
        if (el) el.innerHTML = "";
      }
    } catch (err) {
      console.error("Error al detener el escáner:", err);
    } finally {
        setIsScanning(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (isScanning) return;
    setValidationResult(null);
    setIsScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      
      const readerEl = document.getElementById(readerId);
      if (!readerEl) {
        throw new Error("Contenedor del lector no encontrado en el DOM.");
      }
      readerEl.innerHTML = "";

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId);
      }
      
      const scanner = scannerRef.current as any;
      if (scanner.isScanning) return;
      
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await stopScanner();
          handleValidate(decodedText);
        },
        () => {} // onError silenciado
      );
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error de Cámara', description: err.message || "No se pudo iniciar el escaneo. Revisa los permisos." });
      setIsScanning(false);
    }
  }, [isScanning, stopScanner, handleValidate, toast]);

  const resetValidation = () => {
    setValidationResult(null);
    stopScanner(); 
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
