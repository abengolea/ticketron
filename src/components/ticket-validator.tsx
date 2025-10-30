
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
import type { Html5Qrcode } from "html5-qrcode";
import { createHmacSha256 } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";

type ValidationResult = {
  status: "valid" | "invalid" | "redeemed";
  message: string;
};

const readerId = "qr-reader-offline";

const canonicalId = (eid: unknown, tid: unknown) =>
  `${String(eid ?? "").trim().toLowerCase()}::${String(tid ?? "").trim().toLowerCase()}`;

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [redeemed, setRedeemed] = useLocalStorage<string[]>("redeemedTickets", []);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const redeemedRef = useRef(new Set(redeemed));

  const { toast } = useToast();

  useEffect(() => {
    redeemedRef.current = new Set(redeemed);
  }, [redeemed]);

  useEffect(() => {
    return () => {
      if (scannerRef.current && (scannerRef.current as any).isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const markRedeemed = useCallback((key: string) => {
    if (redeemedRef.current.has(key)) return false;
    redeemedRef.current.add(key);

    try {
      sessionStorage.setItem(key, "redeemed");
    } catch {}

    setRedeemed((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      return next;
    });

    return true;
  }, [setRedeemed]);

  const validateTicket = useCallback(async (payload: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      if (!secretKey.trim() || !payload.trim()) {
        toast({ variant: "destructive", title: "Falta información", description: "Clave secreta y QR son requeridos." });
        return;
      }

      let data: any;
      try {
        data = JSON.parse(payload);
      } catch {
        setValidationResult({ status: "invalid", message: "El QR no contiene JSON válido." });
        return;
      }

      const { v, eid, tid, sig } = data ?? {};
      if (!v || !eid || !tid || !sig) {
        setValidationResult({ status: "invalid", message: "Estructura del QR inválida." });
        return;
      }

      const key = canonicalId(eid, tid);
      if (redeemedRef.current.has(key) || sessionStorage.getItem(key) === 'redeemed') {
        setValidationResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya fue canjeado.` });
        return;
      }

      const expectedSig = await createHmacSha256(secretKey, `${eid}|${tid}|${v}`);

      if (expectedSig === sig) {
        const added = markRedeemed(key);
        setValidationResult({ status: "valid", message: `El ticket ${String(tid).slice(0, 8)}… es válido y se marcó como canjeado.` });
      } else {
        setValidationResult({ status: "invalid", message: "Firma inválida: ticket falsificado o clave incorrecta." });
      }
    } finally {
      processingRef.current = false;
    }
  }, [secretKey, toast, markRedeemed]);

  const stopScanner = useCallback(async () => {
    try {
        if (scannerRef.current && (scannerRef.current as any).isScanning) {
            await scannerRef.current.stop();
            const el = document.getElementById(readerId);
            if(el) el.innerHTML = "";
        }
    } catch (e) {
        console.error("Error stopping scanner", e);
    } finally {
        setIsScanning(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (isScanning || processingRef.current) return;
    setValidationResult(null);
    setIsScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      
      const readerEl = document.getElementById(readerId);
      if (!readerEl) throw new Error("Contenedor del lector no encontrado.");
      
      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
            await stopScanner();
            setQrPayload(decodedText);
            await validateTicket(decodedText);
        },
        (errorMessage: string) => {}
      );
    } catch (err: any) {
        toast({ variant: "destructive", title: "Error de cámara", description: err.message || "No se pudo iniciar el escáner. Revisa los permisos." });
        setIsScanning(false);
    }
  }, [isScanning, stopScanner, toast, validateTicket]);

  const resetValidation = () => {
    setValidationResult(null);
    setQrPayload("");
  };

  const clearRedeemed = () => {
    setRedeemed([]);
    try {
      const keys = Object.keys(sessionStorage);
      for(const key of keys) {
        if(key.includes('::')) sessionStorage.removeItem(key);
      }
    } catch {}
    toast({ title: "Lista de canjeados limpiada." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validador Offline</CardTitle>
        <CardDescription>Valida QRs sin internet; cada ticket queda “quemado” tras el primer canje.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!validationResult && (
          <div className="space-y-4">
            <div>
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
              <div>
                <div id={readerId} className="w-full rounded-md border aspect-video bg-muted" />
                <Button variant="outline" onClick={stopScanner} className="w-full mt-2">
                  Cancelar Escaneo
                </Button>
              </div>
            ) : (
              <div>
                <Label htmlFor="qr-payload" className="flex items-center gap-2">
                  <ScanLine className="w-4 h-4" /> Contenido del QR
                </Label>
                <Textarea
                  id="qr-payload"
                  placeholder="Pega aquí el JSON del código QR"
                  value={qrPayload}
                  onChange={(e) => setQrPayload(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
        )}

        {validationResult && (
          <div className="space-y-4">
            <Alert
              variant={validationResult.status === "invalid" ? "destructive" : "default"}
              className={cn({
                "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300":
                  validationResult.status === "valid",
                "bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300":
                  validationResult.status === "redeemed",
              })}
            >
              {validationResult.status === "valid" && <CheckCircle2 className="h-4 w-4" />}
              {validationResult.status === "redeemed" && <AlertTriangle className="h-4 w-4" />}
              {validationResult.status === "invalid" && <XCircle className="h-4 w-4" />}
              <AlertTitle className="capitalize">
                {validationResult.status === "valid"
                  ? "Válido"
                  : validationResult.status === "invalid"
                  ? "Inválido"
                  : "Canjeado"}
              </AlertTitle>
              <AlertDescription>{validationResult.message}</AlertDescription>
            </Alert>
            <Button onClick={resetValidation} className="w-full">
              <RotateCcw className="mr-2 h-4 w-4" />
              Validar Otro Ticket
            </Button>
          </div>
        )}
      </CardContent>

      {!validationResult && (
        <CardFooter className="flex-col items-stretch gap-4">
          <div className="flex gap-2">
            {!isScanning && (
              <Button onClick={startScanner} variant="secondary" className="w-full">
                <Camera className="mr-2" /> Escanear QR
              </Button>
            )}
            <Button
              onClick={() => validateTicket(qrPayload)}
              className="w-full"
              disabled={isScanning || !qrPayload}
            >
              Validar Ticket
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>
              Tickets canjeados: <span className="font-bold">{redeemed.length}</span>
            </p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={clearRedeemed}>
              Limpiar Lista
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
