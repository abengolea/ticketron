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

/** --- Normalización fuerte del ID --- */
function canonicalId(eid: unknown, tid: unknown) {
  const e = String(eid ?? "").trim().toLowerCase();
  const t = String(tid ?? "").trim().toLowerCase();
  // si querés más agresivo, descomenta:
  // const norm = (s: string) => s.replace(/[\s\-_:]/g, "");
  // return `${norm(e)}::${norm(t)}`;
  return `${e}::${t}`;
}

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState("");
  const [qrPayload, setQrPayload] = useState("");

  // Guardamos CLAVES CANÓNICAS, no tid crudo
  const [redeemedKeys, setRedeemedKeys] = useLocalStorage<string[]>("redeemedTickets", []);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const validatingRef = useRef(false);

  // set in-memory para bloqueos inmediatos (misma pestaña, mismo tick)
  const redeemedRef = useRef<Set<string>>(new Set(redeemedKeys));
  useEffect(() => {
    redeemedRef.current = new Set(redeemedKeys);
  }, [redeemedKeys]);

  // Anti-ráfaga del mismo decodedText
  const lastDecodedRef = useRef<string | null>(null);
  const lastDecodedAtRef = useRef<number>(0);
  const DEBOUNCE_MS = 1000;

  const { toast } = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const stop = async () => {
        try {
          if (scannerRef.current && (scannerRef.current as any).isScanning) {
            await scannerRef.current.stop();
            const el = document.getElementById(readerId);
            if (el) el.innerHTML = "";
          }
        } catch (err) {
          console.error("Error al detener el escáner offline en cleanup:", err);
        }
      };
      stop();
    };
  }, []);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current && (scannerRef.current as any).isScanning) {
        await scannerRef.current.stop();
        const el = document.getElementById(readerId);
        if (el) el.innerHTML = "";
      }
    } catch (err) {
      console.error("Error al detener el escáner offline:", err);
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  }, []);

  /** Marca canónico una sola vez (idempotente y atómico con localStorage) */
  const markRedeemedOnce = useCallback(
    (key: string): boolean => {
      if (redeemedRef.current.has(key)) return false;
      redeemedRef.current.add(key);
      setRedeemedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      return true;
    },
    [setRedeemedKeys]
  );

  const validateTicket = useCallback(
    async (payload: string) => {
      if (validatingRef.current) return;
      validatingRef.current = true;

      try {
        if (!secretKey.trim() || !payload.trim()) {
          toast({
            variant: "destructive",
            title: "Falta información",
            description: "Proporciona una clave secreta y el contenido del QR.",
          });
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
        if (v == null || eid == null || tid == null || sig == null) {
          setValidationResult({ status: "invalid", message: "Estructura del QR inválida. Faltan campos." });
          return;
        }

        // *** Normalización del ID ***
        const key = canonicalId(eid, tid);

        // Idempotencia inmediata
        if (redeemedRef.current.has(key)) {
          setValidationResult({
            status: "redeemed",
            message: `El ticket ${String(tid).toString().slice(0, 8)}… ya fue canjeado.`,
          });
          return;
        }

        // Verificación de firma (usa los valores crudos, no normalizados)
        const payloadToSign = `${eid}|${tid}|${v}`;
        const expectedSig = await createHmacSha256(secretKey, payloadToSign);

        if (expectedSig === sig) {
          const added = markRedeemedOnce(key);
          setValidationResult({
            status: added ? "valid" : "redeemed",
            message: added
              ? `El ticket ${String(tid).toString().slice(0, 8)}… es válido para ingresar.`
              : `El ticket ${String(tid).toString().slice(0, 8)}… ya fue canjeado.`,
          });
        } else {
          setValidationResult({
            status: "invalid",
            message: "Firma inválida: ticket falsificado o clave incorrecta.",
          });
        }
      } finally {
        validatingRef.current = false;
      }
    },
    [secretKey, toast, markRedeemedOnce]
  );

  const handleManualValidation = useCallback(async () => {
    await validateTicket(qrPayload);
  }, [qrPayload, validateTicket]);

  const startScanner = useCallback(async () => {
    if (isScanning) return;
    setValidationResult(null);
    setIsScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const readerEl = document.getElementById(readerId);
      if (!readerEl) throw new Error("Contenedor del lector no encontrado en el DOM.");
      readerEl.innerHTML = "";

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId);
      }

      const scanner = scannerRef.current as any;
      if (scanner.isScanning) return;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          // Anti-ráfaga del MISMO texto
          const now = Date.now();
          if (
            lastDecodedRef.current === decodedText &&
            now - lastDecodedAtRef.current < DEBOUNCE_MS
          ) {
            return; // ignorar repetición inmediata
          }
          lastDecodedRef.current = decodedText;
          lastDecodedAtRef.current = now;

          await stopScanner();
          if (!mountedRef.current) return;
          setQrPayload(decodedText);
          await validateTicket(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.error("Error iniciando escáner:", err);
      toast({
        variant: "destructive",
        title: "Error de cámara",
        description: "No se pudo iniciar el escaneo. Revisa permisos o el dispositivo.",
      });
      if (mountedRef.current) setIsScanning(false);
    }
  }, [isScanning, stopScanner, toast, validateTicket]);

  const clearRedeemed = useCallback(() => {
    redeemedRef.current.clear();
    setRedeemedKeys([]);
    toast({ title: "Lista de canjeados limpiada." });
  }, [setRedeemedKeys, toast]);

  const resetValidation = useCallback(() => {
    setValidationResult(null);
    setQrPayload("");
    stopScanner();
  }, [stopScanner]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validador Offline</CardTitle>
        <CardDescription>
          Introduce la clave secreta y escanea un código QR para validar un ticket. No requiere internet.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!validationResult && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret-key" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Clave Secreta
              </Label>
              <Textarea
                id="secret-key"
                placeholder="Pega la clave secreta de 32 bytes aquí"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="font-mono text-sm"
                disabled={isScanning}
              />
            </div>

            {isScanning ? (
              <div className="space-y-2">
                <div id={readerId} className="w-full rounded-md border aspect-video bg-muted" />
                <Button variant="outline" onClick={stopScanner} className="w-full">
                  Cancelar Escaneo
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="qr-payload" className="flex items-center gap-2">
                  <ScanLine className="w-4 h-4" />
                  Contenido del Código QR
                </Label>
                <Textarea
                  id="qr-payload"
                  placeholder="Pega los datos del código QR escaneado aquí, o usa el botón para escanear."
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
            <Button onClick={handleManualValidation} className="w-full" disabled={isScanning || !qrPayload}>
              Validar Ticket
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>
              Tickets canjeados: <span className="font-bold">{redeemedKeys.length}</span>
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
