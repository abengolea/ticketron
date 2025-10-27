"use client";

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CameraOff, Loader } from 'lucide-react';

export default function ScannerTestPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        let stream: MediaStream | null = null;

        const getCameraPermission = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("La API de MediaDevices no es soportada en este navegador.");
                }
                
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                setHasCameraPermission(true);
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err: any) {
                console.error('Error al acceder a la cámara:', err);
                let errorMessage = "No se pudo acceder a la cámara. Por favor, revisa los permisos en la configuración de tu navegador.";
                if (err.name === "NotAllowedError") {
                    errorMessage = "Has denegado el permiso para acceder a la cámara. Por favor, habilítalo en la configuración de tu navegador.";
                } else if (err.name === "NotFoundError") {
                    errorMessage = "No se encontró ningún dispositivo de cámara conectado.";
                }

                setError(errorMessage);
                setHasCameraPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Error de Cámara',
                    description: errorMessage,
                });
            }
        };

        getCameraPermission();

        // Función de limpieza para detener el stream de la cámara
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [toast]); // toast está estabilizado con useCallback

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Página de Prueba de Cámara</CardTitle>
                    <CardDescription>
                        Esta página intenta acceder directamente a la cámara para diagnosticar problemas de permisos.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {hasCameraPermission === null && !error && (
                        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                           <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                           <p className="mt-4 text-muted-foreground">Solicitando permiso de cámara...</p>
                        </div>
                    )}
                    
                    {error && (
                         <Alert variant="destructive">
                            <CameraOff className="h-4 w-4" />
                            <AlertTitle>Acceso a la Cámara Denegado</AlertTitle>
                            <AlertDescription>
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="aspect-video w-full rounded-md border bg-muted flex items-center justify-center">
                         <video ref={videoRef} className={hasCameraPermission ? "w-full h-full object-cover" : "hidden"} autoPlay muted playsInline />
                         {!hasCameraPermission && (
                             <CameraOff className="w-16 h-16 text-muted-foreground/50" />
                         )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
