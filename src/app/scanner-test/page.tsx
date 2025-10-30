
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Camera, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Html5Qrcode } from 'html5-qrcode';

const readerId = "qr-reader-test";

export default function ScannerTestPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const { toast } = useToast();

    // The library is imported dynamically only on the client-side
    useEffect(() => {
        import('html5-qrcode').then(lib => {
            if (!scannerRef.current) {
                scannerRef.current = new lib.Html5Qrcode(readerId, false);
            }
        }).catch(err => {
            console.error("Failed to load html5-qrcode lib", err);
            setScanError("Could not load scanner library.");
        });

        // Cleanup function to stop the scanner on component unmount
        return () => {
            if (scannerRef.current && (scannerRef.current as any).isScanning) {
                scannerRef.current.stop().catch(err => {
                    console.error("Error stopping scanner on cleanup:", err);
                });
            }
        };
    }, []);

    const startScanner = useCallback(async () => {
        if (!scannerRef.current) {
            toast({ variant: 'destructive', title: 'Error', description: 'Scanner library not loaded yet.' });
            return;
        }
        const scanner = scannerRef.current;
        if ((scanner as any).isScanning) return;

        setScanResult(null);
        setScanError(null);
        setIsScanning(true);

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
        };

        try {
            await scanner.start(
                { facingMode: "environment" },
                config,
                (decodedText: string) => {
                    setScanResult(decodedText);
                    stopScanner(); // Stop after successful scan
                },
                (errorMessage: string) => {
                    // This is called continuously, ignore it.
                }
            );
        } catch (err: any) {
            console.error("Error starting scanner:", err);
            const errorMessage = err.message || "Could not start scanner. Check camera permissions.";
            setScanError(errorMessage);
            setIsScanning(false);
            toast({
                variant: 'destructive',
                title: 'Camera Error',
                description: errorMessage,
            });
        }
    }, [toast]);

    const stopScanner = useCallback(() => {
        if (scannerRef.current && (scannerRef.current as any).isScanning) {
            scannerRef.current.stop()
                .then(() => {
                    setIsScanning(false);
                })
                .catch(err => {
                    console.error("Failed to stop scanner:", err);
                    setIsScanning(false); // Force state anyway
                });
        }
    }, []);


    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>QR Scanner Test Page</CardTitle>
                    <CardDescription>
                        This page tests the <code>html5-qrcode</code> library in isolation to debug rendering or communication errors.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div id={readerId} className={cn(!isScanning && "hidden", "w-full rounded-md border aspect-video bg-muted")}></div>

                    {!isScanning && (
                        <div className="flex justify-center items-center h-48 border-2 border-dashed rounded-lg">
                            <Button onClick={startScanner} variant="secondary" size="lg">
                                <Camera className="mr-2 h-5 w-5" />
                                Start Test Scanner
                            </Button>
                        </div>
                    )}
                    
                    {isScanning && (
                        <Button onClick={stopScanner} variant="outline" className="w-full">
                            Stop Scanner
                        </Button>
                    )}

                    {scanResult && (
                        <Alert variant="default" className="bg-green-100 dark:bg-green-900/50">
                            <CheckCircle className="h-4 w-4" />
                            <AlertTitle>Scan Successful</AlertTitle>
                            <AlertDescription className="font-mono break-all">{scanResult}</AlertDescription>
                        </Alert>
                    )}
                    
                    {scanError && (
                        <Alert variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>Scanner Error</AlertTitle>
                            <AlertDescription>{scanError}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
