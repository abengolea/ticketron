
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2, KeyRound, Loader2, RotateCcw, XCircle, AlertTriangle } from "lucide-react";
import { createHmacSha256 } from "@/lib/utils";
import type { Html5Qrcode } from "html5-qrcode";

// --- START: Core logic safely re-implemented inside the component ---
// These classes are defined here to ensure they are NEVER part of the server-side bundle.

class StorageAdapter {
    private lsKey = "tickets.registry.v1";
    private bc?: BroadcastChannel;

    constructor() {
        if (typeof window !== "undefined") {
            this.bc = "BroadcastChannel" in window ? new BroadcastChannel("tickets-sync") : undefined;
        }
    }

    read(): Record<string, any> {
        if (typeof window === "undefined") return {};
        try {
            const raw = window.localStorage.getItem(this.lsKey);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    write(obj: Record<string, any>) {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(this.lsKey, JSON.stringify(obj));
            this.bc?.postMessage({ type: "SYNC" });
        } catch { /* noop */ }
    }

    checkAndSet<T>(
        key: string,
        check: (current: any) => { ok: boolean; value: T },
        mutate: (state: Record<string, any>) => void
    ): { ok: boolean; value: T } {
        const state = this.read();
        const res = check(state[key]);
        if (!res.ok) return res;
        mutate(state);
        this.write(state);
        return res;
    }
    
    clear() { this.write({}); }
}

type TicketState = "new" | "redeemed" | "void";
interface TicketRecord {
    id: string; state: TicketState; at: number; who?: string; reason?: string;
}

const canonicalId = (eid: unknown, tid: unknown) =>
    `${String(eid ?? "").trim().toLowerCase()}::${String(tid ?? "").trim().toLowerCase()}`;

class TicketRegistry {
    private storage = new StorageAdapter();

    get(id: string): TicketRecord | undefined {
        const raw = this.storage.read();
        const v = raw[id];
        return v ? ({ id, ...v }) : undefined;
    }

    redeem(id: string, who?: string): { ok: boolean; already?: boolean; record?: TicketRecord } {
        return this.storage.checkAndSet(id,
            (current) => {
                if (!current) return { ok: true, value: "create" as any };
                if (current.state === "redeemed") return { ok: false, value: "already" as any };
                if (current.state === "void") return { ok: false, value: "void" as any };
                return { ok: true, value: "update" as any };
            },
            (state) => {
                const now = Date.now();
                state[id] = { state: "redeemed", at: now, who };
            }
        ) as any;
    }
    
    clear() { this.storage.clear(); }
    
    snapshot(): TicketRecord[] {
        const raw = this.storage.read();
        return Object.entries(raw).map(([id, v]: any) => ({ id, ...v }));
    }
}

type ValidateOutcome = "valid" | "invalid" | "already_redeemed" | "void" | "malformed";

class ValidatorService {
    constructor(private secretProvider: () => string, private registry: TicketRegistry) {}

    async validateAndRedeem(payloadText: string): Promise<{ outcome: ValidateOutcome; id?: string; msg: string }> {
        let data: any;
        try { data = JSON.parse(payloadText); } catch { return { outcome: "malformed", msg: "QR no es JSON válido" }; }
        
        const { v, eid, tid, sig } = data ?? {};
        if (!v || !eid || !tid || !sig) return { outcome: "malformed", msg: "Faltan campos en el QR" };

        const id = canonicalId(eid, tid);
        const secret = this.secretProvider();
        if (!secret) return { outcome: "invalid", id, msg: "Falta la clave secreta para validar." };
        
        const expected = await createHmacSha256(secret, `${eid}|${tid}|${v}`);
        if (expected !== sig) return { outcome: "invalid", id, msg: "Firma inválida. Revisa que la clave secreta sea la correcta." };

        const rec = this.registry.get(id);
        if (rec?.state === "void") return { outcome: "void", id, msg: "Ticket anulado" };
        if (rec?.state === "redeemed") return { outcome: "already_redeemed", id, msg: `Ticket ya canjeado el ${new Date(rec.at).toLocaleString()}` };
        
        const res = this.registry.redeem(id, "operator");
        if (res.ok) return { outcome: "valid", id, msg: "Válido y canjeado con éxito." };
        
        if ((res as any).value === "already") return { outcome: "already_redeemed", id, msg: "Ticket ya canjeado (detectado durante el canje)" };
        if ((res as any).value === "void") return { outcome: "void", id, msg: "Ticket anulado (detectado durante el canje)" };
        
        return { outcome: "invalid", id, msg: "No se pudo canjear por una razón desconocida" };
    }
}


class ScannerController {
    private scanner: Html5Qrcode | null = null;
    private running = false;
    
    constructor(private containerId: string, private Html5QrcodeLib: any) {}

    async start(onDecode: (text: string) => Promise<void>) {
        if (this.running) return;

        if (!this.scanner) {
            this.scanner = new this.Html5QrcodeLib(this.containerId, false);
        }
        
        const el = document.getElementById(this.containerId);
        if (!el) throw new Error("Contenedor del lector no existe");
        
        this.running = true;
        await this.scanner!.start(
            { facingMode: "environment" },
            { fps: 5, qrbox: { width: 260, height: 260 } },
            async (decodedText: string) => {
                await this.pause();
                await onDecode(decodedText);
            },
            () => {}
        );
    }

    async pause() {
        if (!this.running || !this.scanner) return;
        try {
            if ((this.scanner as any).isScanning) {
                await this.scanner.stop();
            }
        } catch(e) {
            console.error("Scanner stop error", e);
        } finally {
            this.running = false;
        }
    }
}


// --- END: Core logic ---


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
  
  const { toast } = useToast();

  const validatorServiceRef = useRef<ValidatorService | null>(null);
  const scannerControllerRef = useRef<ScannerController | null>(null);
  const registryRef = useRef<TicketRegistry | null>(null);

  useEffect(() => {
    // This effect runs ONLY on the client.
    registryRef.current = new TicketRegistry();
    validatorServiceRef.current = new ValidatorService(() => secret, registryRef.current!);
    
    // We dynamically import the scanner library here.
    import('html5-qrcode').then(lib => {
       scannerControllerRef.current = new ScannerController(SCANNER_CONTAINER_ID, lib.Html5Qrcode);
    }).catch(err => {
        console.error("Failed to load html5-qrcode", err);
        toast({ variant: 'destructive', title: 'Error Crítico', description: 'No se pudo cargar la librería de escaneo.' });
    });

    // Set initial count
    if (registryRef.current) {
        setRedeemedCount(registryRef.current.snapshot().filter(r => r.state === 'redeemed').length);
    }
  }, [secret, toast]); 

  const handleDecode = useCallback(async (text: string) => {
    if (!validatorServiceRef.current) return;
    
    setResult(null);

    const res = await validatorServiceRef.current.validateAndRedeem(text);
    setResult({ outcome: res.outcome, message: res.msg });

    // Update count after validation
    if (registryRef.current) {
        setRedeemedCount(registryRef.current.snapshot().filter(r => r.state === 'redeemed').length);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!scannerControllerRef.current) {
        toast({ variant: 'destructive', title: 'Error', description: 'El escáner aún no está listo.' });
        return;
    }
    if (!secret) {
        toast({ variant: 'destructive', title: 'Error', description: 'Por favor, introduce la clave secreta.' });
        return;
    }
    setResult(null);
    setIsScanning(true);
    try {
      await scannerControllerRef.current.start(handleDecode);
    } catch(err: any) {
      toast({ variant: 'destructive', title: 'Error de Escáner', description: err.message });
      setIsScanning(false);
    }
  }, [handleDecode, secret, toast]);

  const stopScanner = useCallback(async () => {
    if (scannerControllerRef.current) {
      await scannerControllerRef.current.pause();
    }
    setIsScanning(false);
  }, []);
  
  const reset = () => {
    setResult(null);
    stopScanner();
  };

  const clearRedeemed = () => {
    if(registryRef.current) {
        registryRef.current.clear();
        setRedeemedCount(0);
        toast({ title: "Registro de canjes limpiado." });
    }
  };
  
  const renderResult = () => {
    if (!result) return null;

    const alertConfig = {
        valid: { variant: 'default', Icon: CheckCircle2, title: 'Válido', className: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300' },
        already_redeemed: { variant: 'default', Icon: AlertTriangle, title: 'Ya Canjeado', className: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300' },
        invalid: { variant: 'destructive', Icon: XCircle, title: 'Inválido', className: '' },
        void: { variant: 'destructive', Icon: XCircle, title: 'Anulado', className: '' },
        malformed: { variant: 'destructive', Icon: XCircle, title: 'QR Malformado', className: '' },
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
        <CardTitle>Validador Offline</CardTitle>
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
