
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, KeyRound, Loader2, RotateCcw, Terminal, RefreshCw, Trash2 } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

// --- START: Core logic re-implemented inside the component for isolation ---

// Correct implementation for Base64 to ArrayBuffer conversion for Web Crypto API
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64); // `atob` is fine here as we are reversing a `btoa` string
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Correct HMAC function using Web Crypto API
async function createHmacSha256(secret: string, data: string): Promise<string> {
    if (typeof window === 'undefined') return '';
    
    const secretKeyData = base64ToArrayBuffer(secret);
    const dataToSign = new TextEncoder().encode(data);

    const key = await window.crypto.subtle.importKey(
        'raw',
        secretKeyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', key, dataToSign);

    // Take the first 12 bytes of the signature
    const truncatedSignature = signature.slice(0, 12);
    
    // Convert to Base64 and make it URL-safe
    // `btoa` is the reverse of `atob`, converting binary string to base64
    const base64Signature = btoa(String.fromCharCode(...new Uint8Array(truncatedSignature)));
    return base64Signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}


class StorageAdapter {
    private lsKey = "tickets.registry.v1";
    private listeners = new Set<() => void>();
    private bc?: BroadcastChannel;

    constructor() {
        if (typeof window !== "undefined") {
            this.bc = "BroadcastChannel" in window ? new BroadcastChannel("tickets-sync") : undefined;
            window.addEventListener("storage", (e) => {
                if (e.key === this.lsKey) this.emit();
            });
            this.bc?.addEventListener("message", (e) => {
                if (e.data?.type === "SYNC") this.emit();
            });
        }
    }

    subscribe(l: () => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
    private emit() { for (const l of this.listeners) l(); }

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
            this.emit();
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
    private storage: StorageAdapter;
    constructor() {
        this.storage = new StorageAdapter();
    }
    
    subscribe(l: () => void) { return this.storage.subscribe(l); }

    snapshot(): TicketRecord[] {
        const raw = this.storage.read();
        return Object.entries(raw).map(([id, v]: any) => ({ id, ...v }));
    }

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
            { fps: 5, qrbox: { width: 260, height: 260 }, rememberLastUsedCamera: true },
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


const SCANNER_CONTAINER_ID = "qr-reader-debug";

type LogEntry = {
    timestamp: string;
    level: 'info' | 'error' | 'success' | 'warn';
    message: string;
    data?: any;
};


export default function ValidatorDebugPage() {
  const [secret, setSecret] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redeemedCount, setRedeemedCount] = useState(0);
  
  const scannerRef = useRef<ScannerController | null>(null);
  const registryRef = useRef<TicketRegistry | null>(null);
  const validatorRef = useRef<ValidatorService | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // This effect runs ONLY on the client.
    const reg = new TicketRegistry();
    registryRef.current = reg;
    
    const unsub = reg.subscribe(() => {
        if (registryRef.current) {
            setRedeemedCount(registryRef.current.snapshot().filter(r => r.state === 'redeemed').length);
        }
    });
    setRedeemedCount(reg.snapshot().filter(r => r.state === 'redeemed').length);

    import('html5-qrcode').then(lib => {
        scannerRef.current = new ScannerController(SCANNER_CONTAINER_ID, lib.Html5Qrcode);
    }).catch(err => {
        addLog('error', 'No se pudo cargar la librería de escaneo', err);
    });
    
    return unsub;
  }, []); // addLog is not a dependency as it's stable via useCallback

  useEffect(() => {
    if (registryRef.current) {
        validatorRef.current = new ValidatorService(() => secret, registryRef.current);
    }
  }, [secret]); // Re-create validator service if secret changes.

  const addLog = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    }, ...prev].slice(0, 50));
  }, []);

  const handleDecode = useCallback(async (payloadText: string) => {
    setIsLoading(true);
    addLog('info', 'QR Decodificado', payloadText);

    if (!validatorRef.current) {
        addLog('error', 'El servicio validador no está inicializado.');
        setIsLoading(false);
        return;
    }

    try {
        const result = await validatorRef.current.validateAndRedeem(payloadText);
        const level = result.outcome === 'valid' ? 'success' : result.outcome === 'already_redeemed' ? 'warn' : 'error';
        addLog(level, `Resultado final del canje: ${result.outcome.toUpperCase()}`, result);
    } catch (e: any) {
        addLog('error', 'Error durante el proceso de validación', e.message);
    } finally {
        setIsLoading(false);
    }
  }, [addLog]);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current) {
        addLog('error', 'El controlador del escáner no está listo.');
        return;
    }
    if (!secret) {
        addLog('warn', 'La clave secreta está vacía.');
        toast({variant: 'destructive', title: 'Clave Necesaria', description: 'Pega la clave secreta para continuar.'})
        return;
    }
    addLog('info', 'Intentando iniciar escáner...');
    setIsScanning(true);
    try {
      await scannerRef.current.start(handleDecode);
      addLog('success', 'Escáner iniciado. Apunte la cámara a un código QR.');
    } catch(err: any) {
      addLog('error', 'No se pudo iniciar el escáner.', err.message);
      toast({ variant: 'destructive', title: 'Error de Escáner', description: err.message });
      setIsScanning(false);
    }
  }, [handleDecode, secret, toast, addLog]);

  const stopScanner = useCallback(async () => {
    addLog('info', 'Deteniendo escáner...');
    if (scannerRef.current) {
      await scannerRef.current.pause();
    }
    setIsScanning(false);
    addLog('success', 'Escáner detenido.');
  }, [addLog]);
  
  const clearLogs = () => setLogs([]);
  
  const clearRegistry = () => {
    if (registryRef.current) {
        registryRef.current.clear();
        addLog('warn', 'Registro de canjes locales ha sido limpiado.');
        toast({ title: 'Registro Limpiado', description: 'Todos los tickets canjeados en este dispositivo han sido reseteados.' });
    }
  }

  const logColors = {
    info: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
    warn: 'text-yellow-400'
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
            <h1 className="text-4xl font-headline text-primary">Debug del Validador</h1>
            <p className="text-muted-foreground mt-2">
            Esta página te permite ver los detalles internos del proceso de validación de tickets.
            </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>Control del Validador</CardTitle>
                    <CardDescription>Pega la clave secreta y utiliza los controles para escanear.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="secret-key" className="flex items-center gap-2 mb-2">
                                <KeyRound className="w-4 h-4" /> Clave Secreta del Evento
                            </Label>
                            <Textarea
                                id="secret-key"
                                placeholder="Pega la clave secreta que descargaste al crear el evento."
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                className="font-mono text-sm h-24"
                                disabled={isScanning || isLoading}
                            />
                        </div>

                        <div id={SCANNER_CONTAINER_ID} className={cn("w-full aspect-video border-2 border-dashed rounded-lg bg-muted flex items-center justify-center text-muted-foreground", { 'border-solid': isScanning })}>
                            {!isScanning && <p>Cámara inactiva</p>}
                        </div>
                        
                        {isLoading && (
                            <div className="flex items-center justify-center text-muted-foreground">
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Procesando...
                            </div>
                        )}

                        {!isScanning && (
                        <Button onClick={startScanner} className="w-full" disabled={!secret || isLoading}>
                            <Camera className="mr-2 h-4 w-4" /> Iniciar Escáner
                        </Button>
                        )}
                        {isScanning && (
                        <Button onClick={stopScanner} variant="outline" className="w-full" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Detener Escáner
                        </Button>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="flex-col items-stretch gap-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
                    <p>
                      Tickets canjeados en este dispositivo: <span className="font-bold text-foreground">{redeemedCount}</span>
                    </p>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={clearRegistry}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpiar Registro
                    </Button>
                  </div>
                </CardFooter>
            </Card>

            <Card className="h-full">
                 <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="flex items-center gap-2"><Terminal /> Logs en Vivo</CardTitle>
                        <Button variant="ghost" size="icon" onClick={clearLogs}><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                    <CardDescription>Los eventos del proceso de validación aparecerán aquí.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[450px] bg-black rounded-lg p-4 overflow-y-auto font-mono text-xs space-y-3">
                        {logs.length === 0 && <p className="text-muted-foreground">Esperando acciones...</p>}
                        {logs.map((log, i) => (
                            <div key={i} className={cn("border-l-2 pl-3", log.level === 'success' ? 'border-green-500' : log.level === 'error' ? 'border-red-500' : log.level === 'warn' ? 'border-yellow-500' : 'border-blue-500')}>
                               <p className={cn("font-bold flex justify-between", logColors[log.level])}>
                                 <span>{log.message}</span>
                                 <span className="text-muted-foreground/50">{log.timestamp}</span>
                               </p>
                               {log.data && (
                                    <pre className="mt-1 p-2 bg-muted/20 rounded-md overflow-x-auto text-muted-foreground">
                                        {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                                    </pre>
                               )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}

    