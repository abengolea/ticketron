
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, ScanLine, KeyRound, AlertTriangle, Camera, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createHmacSha256 } from "@/lib/utils";
import { Html5Qrcode, Html5QrcodeScanner } from "html5-qrcode";

// Estado Global fuera de React para evitar carreras y problemas de ciclo de vida.
class GlobalTicketState {
  private static instance: GlobalTicketState;
  private redeemedMap: Map<string, number> = new Map();
  private processingMap: Map<string, boolean> = new Map();

  private constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
      try {
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem('redeemedTickets');
        if (stored) {
          const tickets: { key: string, timestamp: number }[] = JSON.parse(stored);
          if (Array.isArray(tickets)) {
             tickets.forEach(t => this.redeemedMap.set(t.key, t.timestamp));
          }
        }
      } catch (e) {
        console.error('Error cargando tickets canjeados desde localStorage:', e);
        localStorage.removeItem('redeemedTickets');
      }
  }

  public static getInstance(): GlobalTicketState {
    if (!GlobalTicketState.instance) {
      GlobalTicketState.instance = new GlobalTicketState();
    }
    return GlobalTicketState.instance;
  }
  
  private getKey(eid: string, tid: string | number): string {
      return `${String(eid).trim().toLowerCase()}_${String(tid).trim().toLowerCase()}`;
  }

  isRedeemed(eid: string, tid: string | number): boolean {
    return this.redeemedMap.has(this.getKey(eid, tid));
  }

  isProcessing(eid: string, tid: string | number): boolean {
    return this.processingMap.get(this.getKey(eid, tid)) === true;
  }

  startProcessing(eid: string, tid: string | number): boolean {
    const key = this.getKey(eid, tid);
    if (this.isProcessing(eid, tid) || this.isRedeemed(eid, tid)) {
      return false;
    }
    this.processingMap.set(key, true);
    return true;
  }

  finishProcessing(eid: string, tid: string | number) {
    this.processingMap.delete(this.getKey(eid, tid));
  }

  markAsRedeemed(eid: string, tid: string | number): boolean {
    const key = this.getKey(eid, tid);
    if (this.redeemedMap.has(key)) {
      return false;
    }
    const timestamp = Date.now();
    this.redeemedMap.set(key, timestamp);

    try {
        const allTickets = Array.from(this.redeemedMap.entries()).map(([key, timestamp]) => ({ key, timestamp }));
        localStorage.setItem('redeemedTickets', JSON.stringify(allTickets));
    } catch (e) {
        console.error("Error guardando en localStorage:", e);
    }
    
    return true;
  }
  
  getRedeemedCount(): number {
      return this.redeemedMap.size;
  }

  clear() {
    this.redeemedMap.clear();
    this.processingMap.clear();
    try {
        localStorage.removeItem('redeemedTickets');
    } catch (e) {
        console.error("Error limpiando localStorage:", e);
    }
  }
}

// Controlador del Scanner para un manejo más estricto
class ScannerController {
  private static instance: ScannerController;
  private scanner: Html5Qrcode | null = null;
  private lastScan: { text: string; time: number } | null = null;
  private isRunning: boolean = false;
  
  public static getInstance(): ScannerController {
    if (!ScannerController.instance) {
      ScannerController.instance = new ScannerController();
    }
    return ScannerController.instance;
  }
  
  async start(elementId: string, onScan: (text: string) => void, onError: (error: string) => void) {
    if (this.isRunning) return;

    try {
        this.scanner = new Html5Qrcode(elementId);
        this.isRunning = true;

        await this.scanner.start(
            { facingMode: "environment" },
            { fps: 2, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            (decodedText, decodedResult) => {
                const now = Date.now();
                if (this.lastScan && this.lastScan.text === decodedText && (now - this.lastScan.time) < 3000) {
                    return; // Filtro anti-ráfaga
                }
                this.lastScan = { text: decodedText, time: now };
                this.stop(); // Detener inmediatamente
                onScan(decodedText);
            },
            (errorMessage) => { /* ignorar */ }
        );
    } catch (err: any) {
        this.isRunning = false;
        onError(err.message || "No se pudo iniciar el escáner.");
    }
  }

  async stop() {
    if (this.scanner && this.isRunning) {
      try {
        await this.scanner.stop();
      } catch (e) {
        console.error("Error al detener el escáner:", e);
      } finally {
        this.scanner = null;
        this.isRunning = false;
      }
    }
  }
}

const readerId = "qr-reader-offline";

export function TicketValidator() {
    const [secretKey, setSecretKey] = useState("");
    const [qrPayload, setQrPayload] = useState("");
    const [result, setResult] = useState<{ status: string, message: string } | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [redeemedCount, setRedeemedCount] = useState(0);

    const globalState = useRef(GlobalTicketState.getInstance());
    const scannerController = useRef(ScannerController.getInstance());
    const { toast } = useToast();

    useEffect(() => {
        setRedeemedCount(globalState.current.getRedeemedCount());
        // Limpieza al desmontar
        return () => {
            scannerController.current.stop();
        };
    }, []);

    const validateTicket = useCallback(async (payload: string) => {
        if (!secretKey.trim() || !payload.trim()) {
            toast({ variant: "destructive", title: "Falta información", description: "Clave secreta y QR son requeridos." });
            return;
        }

        let data;
        try {
            data = JSON.parse(payload);
        } catch {
            setResult({ status: "invalid", message: "El QR no contiene JSON válido." });
            return;
        }

        const { v, eid, tid, sig } = data ?? {};
        if (v == null || eid == null || tid == null || sig == null) {
            setResult({ status: "invalid", message: "Estructura del QR inválida." });
            return;
        }

        if (globalState.current.isProcessing(eid, tid)) {
            setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya está siendo procesado.` });
            return;
        }

        if (globalState.current.isRedeemed(eid, tid)) {
            setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya fue canjeado.` });
            return;
        }

        if (!globalState.current.startProcessing(eid, tid)) {
            setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya está en proceso o canjeado.` });
            return;
        }

        try {
            const expectedSig = await createHmacSha256(secretKey, `${eid}|${tid}|${v}`);
            if (expectedSig === sig) {
                if (globalState.current.markAsRedeemed(eid, tid)) {
                    setResult({ status: "valid", message: `El ticket ${String(tid).slice(0, 8)}… es válido y se marcó como canjeado.` });
                    setRedeemedCount(globalState.current.getRedeemedCount());
                } else {
                    setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya fue canjeado (detectado en race condition).` });
                }
            } else {
                setResult({ status: "invalid", message: "Firma inválida: ticket falsificado o clave incorrecta." });
            }
        } finally {
            globalState.current.finishProcessing(eid, tid);
        }
    }, [secretKey, toast]);

    const handleStartScan = () => {
        setResult(null);
        setIsScanning(true);
        scannerController.current.start(
            readerId,
            (text) => {
                setIsScanning(false);
                setQrPayload(text);
                validateTicket(text);
            },
            (error) => {
                setIsScanning(false);
                toast({ variant: "destructive", title: "Error de Cámara", description: error });
            }
        );
    };

    const handleStopScan = () => {
        scannerController.current.stop();
        setIsScanning(false);
    };

    const handleManualValidation = () => {
        setResult(null);
        validateTicket(qrPayload);
    };

    const resetValidation = () => {
        setResult(null);
        setQrPayload("");
    };

    const clearRedeemed = () => {
        globalState.current.clear();
        setRedeemedCount(0);
        toast({ title: "Lista de canjeados limpiada." });
    };

    return (
    <Card>
      <CardHeader>
        <CardTitle>Validador Offline</CardTitle>
        <CardDescription>Valida QRs sin internet; cada ticket queda “quemado” tras el primer canje.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!result && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret-key" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Clave Secreta
              </Label>
              <Textarea
                id="secret-key"
                placeholder="Pega la clave secreta de 32 bytes"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="font-mono text-sm"
                disabled={isScanning}
              />
            </div>

            {isScanning ? (
              <div className="space-y-2">
                <div id={readerId} className="w-full rounded-md border aspect-video bg-muted" />
                <Button variant="outline" onClick={handleStopScan} className="w-full">Cancelar Escaneo</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="qr-payload" className="flex items-center gap-2">
                  <ScanLine className="w-4 h-4" /> Contenido del Código QR
                </Label>
                <Textarea
                  id="qr-payload"
                  placeholder='Pega aquí el JSON del QR ({"eid": "...", "tid": "...", "v": "...", "sig": "..."})'
                  value={qrPayload}
                  onChange={(e) => setQrPayload(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <Alert
              variant={result.status === "invalid" ? "destructive" : "default"}
              className={cn({
                "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300":
                  result.status === "valid",
                "bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300":
                  result.status === "redeemed",
              })}
            >
              {result.status === "valid" && <CheckCircle2 className="h-4 w-4" />}
              {result.status === "redeemed" && <AlertTriangle className="h-4 w-4" />}
              {result.status === "invalid" && <XCircle className="h-4 w-4" />}
              <AlertTitle className="capitalize">
                {result.status === "valid" ? "Válido" : result.status === "invalid" ? "Inválido" : "Canjeado"}
              </AlertTitle>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
            <Button onClick={resetValidation} className="w-full">
              <RotateCcw className="mr-2 h-4 w-4" /> Validar Otro Ticket
            </Button>
          </div>
        )}
      </CardContent>

      {!result && (
        <CardFooter className="flex-col items-stretch gap-4">
          <div className="flex gap-2">
            {!isScanning && (
              <Button onClick={handleStartScan} variant="secondary" className="w-full">
                <Camera className="mr-2" /> Escanear QR
              </Button>
            )}
            <Button onClick={handleManualValidation} className="w-full" disabled={isScanning || !qrPayload}>
              Validar Ticket
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>Tickets canjeados: <span className="font-bold">{redeemedCount}</span></p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={clearRedeemed}>Limpiar Lista</Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

    