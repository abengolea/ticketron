"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const QR_READER_ID = "qr-reader-test";

export default function ScannerTestPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const { toast } = useToast();

    // Initialize scanner instance on mount
    useEffect(() => {
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode(QR_READER_ID, { verbose: false });
        }
        
        const scanner = scannerRef.current;

        // Cleanup on component unmount
        return () => {
            if (scanner && scanner.isScanning) {
                scanner.stop().catch(err => {
                    console.error("Test Page: Failed to stop scanner on cleanup.", err);
                });
            }
        };
    }, []);
    
    const startScanner = async () => {
        const scanner = scannerRef.current;
        if (!scanner || scanner.isScanning) {
            return;
        }

        setScanResult(null);
        setIsScanning(true);

        try {
            await scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText, decodedResult) => {
                    // success callback
                    setScanResult(decodedText);
                    stopScanner();
                },
                (errorMessage) => {
                    // parse error callback, ignored
                }
            );
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: err.message || 'No se pudo iniciar la cámara. Revisa los permisos.'
            });
            setIsScanning(false);
        }
    };

    const stopScanner = () => {
        const scanner = scannerRef.current;
        if (scanner && scanner.isScanning) {
            scanner.stop()
                .then(() => setIsScanning(false))
                .catch(err => {
                    console.error("Test Page: Failed to stop scanner.", err);
                    setIsScanning(false); // Force stop
                });
        } else {
            setIsScanning(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Página de Prueba del Escáner QR</CardTitle>
                    <CardDescription>
                        Esta página contiene solo el escáner para aislar y depurar el problema.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isScanning ? (
                        <div>
                            <div id={QR_READER_ID} className="w-full rounded-md border aspect-video bg-muted"></div>
                            <Button onClick={stopScanner} variant="outline" className="w-full mt-4">
                                Detener Escáner
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                            <Button onClick={startScanner} size="lg">
                                <Camera className="mr-2 h-5 w-5" />
                                Iniciar Escáner de Prueba
                            </Button>
                        </div>
                    )}
                    
                    {scanResult && (
                        <Alert variant="default">
                            <AlertTitle>Escaneo Exitoso</AlertTitle>
                            <AlertDescription className="font-mono break-all">
                                {scanResult}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}