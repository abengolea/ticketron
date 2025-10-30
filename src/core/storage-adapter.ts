
// Adaptador de persistencia con operación check-and-set atómica y sync cross-tab
export interface AtomicResult<T> { ok: boolean; value: T }
type Listener = () => void;

export class StorageAdapter {
  private lsKey = "tickets.registry.v1";
  private listeners = new Set<Listener>();
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

  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emit() { for (const l of this.listeners) l(); }

  read(): Record<string, any> {
    try {
      const raw = localStorage.getItem(this.lsKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  write(obj: Record<string, any>) {
    try {
      localStorage.setItem(this.lsKey, JSON.stringify(obj));
      this.bc?.postMessage({ type: "SYNC" });
      this.emit();
    } catch { /* noop */ }
  }

  /** check-and-set atómico en el hilo actual */
  checkAndSet<T>(
    key: string,
    check: (current: any) => AtomicResult<T>,         // decide si puede mutar (y qué value devolver)
    mutate: (state: Record<string, any>) => void      // aplica la mutación
  ): AtomicResult<T> {
    const state = this.read();
    const res = check(state[key]);
    if (!res.ok) return res;
    mutate(state);
    this.write(state);
    return res;
  }

  clear() { this.write({}); }
}
export const storage = new StorageAdapter();
