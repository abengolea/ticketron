"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const QR_READER_ID = "qr-reader-test";

export default function ScannerTestPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const { toast } = useToast();

    // Effect for cleaning up the scanner
    useEffect(() => {
        // This function is returned from useEffect and will be called on component unmount
        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => {
                    // This error is often safe to ignore, as it can happen if the camera is already closed.
                    console.warn("Test Page: Failed to stop scanner on cleanup, it might have been already stopped.", err);
                });
            }
        };
    }, []);
    
    const startScanner = async () => {
        // Ensure we have a fresh instance, in case the old one was corrupted
        const scanner = new Html5Qrcode(QR_READER_ID, { verbose: false });
        scannerRef.current = scanner;

        if (scanner.isScanning) {
            console.log("Scanner is already running.");
            return;
        }

        setScanResult(null);
        setIsScanning(true);

        try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length) {
                await scanner.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText, decodedResult) => {
                        // success callback
                        setScanResult(decodedText);
                        // Stop scanning after a successful scan
                        stopScanner();
                    },
                    (errorMessage) => {
                        // parse error callback, we can ignore it.
                    }
                );
            } else {
                 throw new Error('No se encontraron cámaras.');
            }
        } catch (err: any) {
            console.error("Error starting scanner:", err);
            toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: err.message || 'No se pudo iniciar la cámara. Revisa los permisos y recarga la página.'
            });
            // Ensure we reset the state if starting fails
            setIsScanning(false);
        }
    };

    const stopScanner = () => {
        const scanner = scannerRef.current;
        // Check if scanner exists and is actually scanning
        if (scanner && scanner.isScanning) {
            scanner.stop()
                .then(() => {
                    setIsScanning(false);
                })
                .catch(err => {
                    console.error("Test Page: Failed to stop scanner.", err);
                    // Force state update even on error to avoid inconsistent UI
                    setIsScanning(false);
                });
        } else {
            // If it's not scanning, just make sure the state is correct.
             if (isScanning) {
                setIsScanning(false);
            }
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
