
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { CheckCircle2, XCircle, ScanLine, KeyRound, AlertTriangle, Camera, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createHmacSha256 } from "@/lib/utils";
import { ticketLock } from "@/lib/ticket-lock";
import { useRedeemedTickets, redeemedStore } from "@/stores/redeemed-store";

type ValidationResult = { status: "valid" | "invalid" | "redeemed"; message: string; };
const readerId = "qr-reader-offline";
const canonicalId = (eid: unknown, tid: unknown) =>
  `${String(eid ?? "").trim().toLowerCase()}::${String(tid ?? "").trim().toLowerCase()}`;

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const redeemedList = useRedeemedTickets(); // estado consistente
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastDecodedRef = useRef<string>("");
  const lastDecodedAtRef = useRef(0);
  const DEBOUNCE_MS = 1200;

  const { toast } = useToast();

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current && (scannerRef.current as any).isScanning) {
        await scannerRef.current.stop();
        const el = document.getElementById(readerId);
        if (el) el.innerHTML = "";
      }
    } catch {}
    setIsScanning(false);
  }, []);

  const validatePayload = useCallback(async (payload: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      if (!secretKey.trim() || !payload.trim()) {
        toast({ variant: "destructive", title: "Falta información", description: "Clave secreta y QR son requeridos." });
        return;
      }
      let data: any;
      try { data = JSON.parse(payload); } catch {
        setResult({ status: "invalid", message: "El QR no contiene JSON válido." }); return;
      }
      const { v, eid, tid, sig } = data ?? {};
      if (!v || !eid || !tid || !sig) {
        setResult({ status: "invalid", message: "Estructura del QR incompleta." }); return;
      }

      const key = canonicalId(eid, tid);

      // Chequeo duro en store externo (consistente)
      if (redeemedStore.has(key)) {
        setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya fue canjeado.` });
        return;
      }

      const expected = await createHmacSha256(secretKey, `${eid}|${tid}|${v}`);
      if (expected !== sig) {
        setResult({ status: "invalid", message: "Firma inválida: clave incorrecta o ticket adulterado." }); return;
      }

      // Adquirir lock por ticketId para evitar doble canje concurrente
      const release = await ticketLock.acquireLock(key);
      try {
        // Re-chequeo bajo lock
        if (redeemedStore.has(key)) {
          setResult({ status: "redeemed", message: `El ticket ${String(tid).slice(0, 8)}… ya fue canjeado.` });
          return;
        }
        redeemedStore.add(key);
        setResult({ status: "valid", message: `El ticket ${String(tid).slice(0, 8)}… es válido y quedó canjeado.` });
      } finally {
        release();
      }
    } finally {
      processingRef.current = false;
    }
  }, [secretKey, toast]);

  const startScanner = useCallback(async () => {
    if (isScanning) return;
    setResult(null);
    setIsScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const el = document.getElementById(readerId);
      if (!el) throw new Error("No se encontró el contenedor del lector.");
      el.innerHTML = "";
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode(readerId);
      const scanner = scannerRef.current as any;
      if (scanner.isScanning) return;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 5, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          const now = Date.now();
          if (decodedText === lastDecodedRef.current && now - lastDecodedAtRef.current < DEBOUNCE_MS) {
            return; // anti-ráfaga
          }
          lastDecodedRef.current = decodedText;
          lastDecodedAtRef.current = now;

          await stopScanner();       // corta frames antes de validar
          await validatePayload(decodedText);
        },
        () => {} // onError silenciado
      );
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error de cámara", description: "No se pudo iniciar el escaneo." });
      setIsScanning(false);
    }
  }, [isScanning, stopScanner, toast, validatePayload]);

  const handleManual = useCallback(async () => {
    setResult(null);
    await validatePayload(qrPayload);
  }, [qrPayload, validatePayload]);

  const resetValidation = useCallback(() => {
    setResult(null);
    setQrPayload("");
  }, []);

  const clearRedeemed = useCallback(() => {
    redeemedStore.clear();
    toast({ title: "Lista de canjeados limpiada." });
  }, [toast]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

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
                <Button variant="outline" onClick={stopScanner} className="w-full">Cancelar Escaneo</Button>
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
              <Button onClick={startScanner} variant="secondary" className="w-full">
                <Camera className="mr-2" /> Escanear QR
              </Button>
            )}
            <Button onClick={handleManual} className="w-full" disabled={isScanning || !qrPayload}>
              Validar Ticket
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>Tickets canjeados: <span className="font-bold">{redeemedList.length}</span></p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={clearRedeemed}>Limpiar Lista</Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
