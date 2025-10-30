"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ValidatorService, ValidateOutcome } from "@/core/validator-service";
import { ScannerController } from "@/core/scanner-controller";
import { registry } from "@/core/ticket-registry";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2, KeyRound, Loader2, RotateCcw, XCircle, AlertTriangle } from "lucide-react";

const SCANNER_CONTAINER_ID = "qr-reader-offline-v2";

type ValidationDisplayResult = {
  outcome: ValidateOutcome;
  message: string;
};

export function TicketValidator() {
  const [secret, setSecret] = useState("");
  const [result, setResult] = useState<ValidationDisplayResult | null>(null);
  const [redeemedCount, setRedeemedCount] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const scannerRef = useRef<ScannerController | null>(null);
  const { toast } = useToast();

  const validatorService = useMemo(() => new ValidatorService(() => secret), [secret]);

  // Suscribe to registry changes to update redeemed count
  useEffect(() => {
    const updateCount = () => {
      const snapshot = registry.snapshot();
      const count = snapshot.filter(r => r.state === 'redeemed').length;
      setRedeemedCount(count);
    };

    const unsubscribe = registry.subscribe(updateCount);
    updateCount(); // Initial count

    return unsubscribe;
  }, []);

  const handleDecode = useCallback(async (text: string) => {
    setIsLoading(true);
    setResult(null);
    if (!secret) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, introduce la clave secreta antes de escanear.'});
      setIsLoading(false);
      return;
    }
    const res = await validatorService.validateAndRedeem(text);
    setResult({ outcome: res.outcome, message: res.msg });
    setIsLoading(false);
  }, [validatorService, secret, toast]);

  const startScanner = useCallback(async () => {
    setResult(null);
    setIsScanning(true);
    // Initialize the scanner controller only on the client-side when the user clicks the button.
    if (!scannerRef.current) {
      scannerRef.current = new ScannerController(SCANNER_CONTAINER_ID);
    }
    try {
      await scannerRef.current.start(handleDecode);
    } catch(err: any) {
      toast({ variant: 'destructive', title: 'Error de Escáner', description: err.message });
      setIsScanning(false);
    }
  }, [handleDecode, toast]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.pause();
    }
    setIsScanning(false);
  }, []);
  
  const reset = () => {
    setResult(null);
    stopScanner();
  };

  const clearRedeemed = () => {
    registry.clear();
    toast({ title: "Registro de canjes limpiado." });
  };
  
  const renderResult = () => {
    if (!result) return null;

    const alertConfig = {
        valid: { variant: 'default', Icon: CheckCircle2, title: 'Válido', className: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300' },
        already_redeemed: { variant: 'default', Icon: AlertTriangle, title: 'Ya Canjeado', className: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300' },
        invalid: { variant: 'destructive', Icon: XCircle, title: 'Inválido' },
        void: { variant: 'destructive', Icon: XCircle, title: 'Anulado' },
        malformed: { variant: 'destructive', Icon: XCircle, title: 'QR Malformado' },
    }[result.outcome];

    if (!alertConfig) return null;

    return (
        <div className="space-y-4">
            <Alert variant={alertConfig.variant as any} className={cn(alertConfig.className)}>
                <alertConfig.Icon className="h-4 w-4" />
                <AlertTitle>{alertConfig.title}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
            </Alert>
            <Button onClick={reset} className="w-full">
              <RotateCcw className="mr-2 h-4 w-4" />
              Validar Otro Ticket
            </Button>
        </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validador Offline V2</CardTitle>
        <CardDescription>
          Valida tickets usando la clave secreta, sin conexión a internet. El estado se guarda en este dispositivo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {result ? renderResult() : (
            <div className="space-y-4">
                <div>
                  <Label htmlFor="secret-key" className="flex items-center gap-2 mb-2">
                    <KeyRound className="w-4 h-4" /> Clave Secreta
                  </Label>
                  <Textarea
                    id="secret-key"
                    placeholder="Pega la clave secreta del evento"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="font-mono text-sm"
                    disabled={isScanning}
                  />
                </div>

                <div id={SCANNER_CONTAINER_ID} className={cn("w-full aspect-video border rounded-lg bg-muted flex items-center justify-center text-muted-foreground", { 'hidden': !isScanning })}>
                  {isScanning && <Loader2 className="h-8 w-8 animate-spin" />}
                </div>

                {!isScanning && (
                   <Button onClick={startScanner} variant="secondary" className="w-full" disabled={!secret}>
                      <Camera className="mr-2 h-4 w-4" /> Escanear QR
                  </Button>
                )}
                {isScanning && (
                  <Button onClick={stopScanner} variant="outline" className="w-full">
                      Cancelar
                  </Button>
                )}
            </div>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4">
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>
              Tickets canjeados en este dispositivo: <span className="font-bold">{redeemedCount}</span>
            </p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={clearRedeemed}>
              Limpiar
            </Button>
          </div>
        </CardFooter>
    </Card>
  );
}
