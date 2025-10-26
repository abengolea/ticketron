"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle, Camera, Loader2, KeyRound, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Html5Qrcode } from 'html5-qrcode';
import { useFirestore } from '@/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketValidator } from './ticket-validator';

type ValidationResult = {
  status: 'valid' | 'invalid' | 'redeemed';
  message: string;
};

export function TicketValidatorOnline() {
  const [qrPayload, setQrPayload] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();

  const handleValidate = async (payload: string) => {
    if (!firestore) {
        toast({ variant: 'destructive', title: 'Error', description: 'Firestore is not connected.' });
        return;
    }
    if (!payload.trim()) {
      toast({ variant: "destructive", title: "Missing Payload", description: "QR Code data is empty." });
      return;
    }

    setIsLoading(true);
    setValidationResult(null);

    try {
      const data = JSON.parse(payload);
      const { eid: eventId, tid: ticketId } = data;

      if (!eventId || !ticketId) {
        setValidationResult({ status: 'invalid', message: 'Invalid QR payload. Missing event or ticket ID.' });
        setIsLoading(false);
        return;
      }
      
      const ticketRef = doc(firestore, 'events', eventId, 'tickets', ticketId);

      const resultMessage = await runTransaction(firestore, async (transaction) => {
        const ticketDoc = await transaction.get(ticketRef);

        if (!ticketDoc.exists()) {
          throw new Error(`Ticket not found in the database. ID: ${ticketId.substring(0,8)}...`);
        }

        const ticketData = ticketDoc.data();
        if (ticketData.redeemed) {
           throw new Error(`Ticket ${ticketId.substring(0,8)}... has already been redeemed on ${new Date(ticketData.redeemedAt.seconds * 1000).toLocaleString()}.`);
        }

        transaction.update(ticketRef, { redeemed: true, redeemedAt: new Date() });
        return `Ticket ${ticketId.substring(0,8)}... is valid and has been redeemed successfully.`;
      });

      setValidationResult({ status: 'valid', message: resultMessage });

    } catch (error: any) {
      let detailedError = `An unknown validation error occurred.`;
       if (error.code === 'permission-denied') {
            const customData = (error as { customData?: { _data?: { _operation?: string; _path?: { segments: string[] } } } }).customData?._data;
            const operation = customData?._operation || "unknown";
            const path = customData?._path?.segments.join('/') || "unknown";
            detailedError = `Firestore Security Rules do not allow this operation. [OPERATION: ${operation}, PATH: ${path}]`;
        } else {
            detailedError = error.message;
        }
      setValidationResult({ status: 'invalid', message: detailedError });
    } finally {
        setIsLoading(false);
        setQrPayload('');
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setValidationResult(null);

    try {
        await Html5Qrcode.getCameras();
        const scanner = new Html5Qrcode('qr-reader-online');
        scannerRef.current = scanner;
        
        scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                handleValidate(decodedText);
                stopScanner();
            },
            (errorMessage) => { /* ignore */ }
        ).catch(err => {
            toast({ variant: 'destructive', title: 'Scanner Error', description: err.message });
            setIsScanning(false);
        });
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Camera Error', description: "Could not get camera permissions. Please allow camera access." });
        setIsScanning(false);
    }
  };

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.error("Failed to stop scanner", err));
    }
    setIsScanning(false);
  }

  useEffect(() => {
    return () => {
        if(scannerRef.current && scannerRef.current.isScanning) {
            stopScanner();
        }
    }
  }, []);

  return (
    <Tabs defaultValue="online" className="max-w-2xl mx-auto">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="online">Online Validator</TabsTrigger>
            <TabsTrigger value="offline">Offline Validator</TabsTrigger>
        </TabsList>
        <TabsContent value="online">
            <Card>
                <CardHeader>
                    <CardTitle>Online Validator</CardTitle>
                    <CardDescription>Scan a ticket to validate it in real-time against the database. Requires an internet connection.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     {isScanning ? (
                        <div className="space-y-2">
                            <div id="qr-reader-online" className="w-full rounded-md border aspect-video bg-muted"></div>
                            <Button variant="outline" onClick={stopScanner} className="w-full">Cancel Scan</Button>
                        </div>
                    ) : (
                         <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                            <Button onClick={startScanner} variant="secondary" size="lg" disabled={isLoading}>
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <Camera className="mr-2 h-5 w-5" />
                                )}
                                {isLoading ? 'Validating...' : 'Scan QR Code'}
                            </Button>
                        </div>
                    )}
                     {validationResult && (
                        <Alert variant={validationResult.status === 'invalid' ? 'destructive' : 'default'} className={cn({
                            'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300': validationResult.status === 'valid',
                            'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300': validationResult.status === 'redeemed',
                        })}>
                            {validationResult.status === 'valid' && <CheckCircle2 className="h-4 w-4" />}
                            {validationResult.status === 'redeemed' && <AlertTriangle className="h-4 w-4" />}
                            {validationResult.status === 'invalid' && <AlertCircle className="h-4 w-4" />}
                            <AlertTitle className='capitalize'>{validationResult.status}</AlertTitle>
                            <AlertDescription>{validationResult.message}</AlertDescription>
                        </Alert>
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

    