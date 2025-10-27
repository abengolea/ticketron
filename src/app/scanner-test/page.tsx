"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const readerId = "qr-reader-test";

export default function ScannerTestPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        // Inicializa el objeto scanner una sola vez
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode(readerId, false);
        }
        const scanner = scannerRef.current;

        // Función de limpieza para detener el escáner al desmontar el componente
        return () => {
            if (scanner && scanner.isScanning) {
                scanner.stop().catch(err => {
                    console.error("Error al detener el escáner de prueba en el cleanup:", err);
                });
            }
        };
    }, []);

    const startScanner = async () => {
        const scanner = scannerRef.current;
        if (!scanner) {
            toast({ variant: 'destructive', title: 'Error', description: 'La instancia del escáner no se ha inicializado.' });
            return;
        }

        // Ya está escaneando, no hacer nada
        if (scanner.isScanning) return;

        setScanResult(null);
        setScanError(null);
        setIsScanning(true);

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
        };

        const onScanSuccess = (decodedText: string) => {
            setScanResult(decodedText);
            stopScanner(); // Detener después de un escaneo exitoso
        };

        const onScanFailure = (error: any) => {
            // Se ignora porque se llama continuamente
        };

        try {
            await scanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
        } catch (err: any) {
            console.error("Error al iniciar el escáner:", err);
            const errorMessage = err.message || "No se pudo iniciar el escáner. Revisa los permisos de la cámara.";
            setScanError(errorMessage);
            setIsScanning(false);
            toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: errorMessage,
            });
        }
    };

    const stopScanner = () => {
        const scanner = scannerRef.current;
        if (scanner && scanner.isScanning) {
            scanner.stop()
                .then(() => {
                    setIsScanning(false);
                })
                .catch(err => {
                    console.error("Fallo al detener el escáner:", err);
                    setIsScanning(false); // Forzar el estado de todas formas
                });
        }
    };


    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Página de Prueba del Escáner QR</CardTitle>
                    <CardDescription>
                        Esta página prueba la librería <code>html5-qrcode</code> de forma aislada para depurar errores de renderizado o comunicación.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div id={readerId} className={cn(!isScanning && "hidden", "w-full rounded-md border aspect-video bg-muted")}></div>

                    {!isScanning && (
                        <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                            <Button onClick={startScanner} variant="secondary" size="lg">
                                <Camera className="mr-2 h-5 w-5" />
                                Iniciar Escáner de Prueba
                            </Button>
                        </div>
                    )}
                    
                    {isScanning && (
                        <Button onClick={stopScanner} variant="outline" className="w-full">
                            Detener Escáner
                        </Button>
                    )}

                    {scanResult && (
                        <Alert variant="default" className="bg-green-100 dark:bg-green-900/50">
                            <CheckCircle className="h-4 w-4" />
                            <AlertTitle>Escaneo Exitoso</AlertTitle>
                            <AlertDescription className="font-mono break-all">{scanResult}</AlertDescription>
                        </Alert>
                    )}
                    
                    {scanError && (
                        <Alert variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>Error del Escáner</AlertTitle>
                            <AlertDescription>{scanError}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
