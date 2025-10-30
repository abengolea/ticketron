
import { storage } from "./storage-adapter";

export type TicketState = "new" | "redeemed" | "void";
export interface TicketRecord {
  id: string; state: TicketState; at: number; who?: string; reason?: string;
}
type Listener = () => void;

export const canonicalId = (eid: unknown, tid: unknown) =>
  `${String(eid ?? "").trim().toLowerCase()}::${String(tid ?? "").trim().toLowerCase()}`;

class TicketRegistry {
  private listeners = new Set<Listener>();
  subscribe(l: Listener) { return storage.subscribe(l); }       // proxy
  snapshot(): TicketRecord[] {
    const raw = storage.read();
    return Object.entries(raw).map(([id, v]: any) => ({ id, ...(v as TicketRecord) }));
  }
  get(id: string): TicketRecord | undefined {
    const raw = storage.read(); const v = raw[id]; return v ? ({ id, ...(v as TicketRecord) }) : undefined;
  }

  /** new→redeemed; idempotente */
  redeem(id: string, who?: string): { ok: boolean; already?: boolean; record?: TicketRecord } {
    return storage.checkAndSet(id,
      (current) => {
        if (!current) return { ok: true, value: "create" };
        if (current.state === "redeemed") return { ok: false, value: "already" };
        if (current.state === "void") return { ok: false, value: "void" };
        return { ok: true, value: "update" };
      },
      (state) => {
        const now = Date.now();
        state[id] = { id, state: "redeemed", at: now, who };
      }
    ) as any;
  }

  /** fuerza estado void (no usable) */
  setVoid(id: string, reason: string, who?: string) {
    storage.checkAndSet(id, () => ({ ok: true, value: null }), (s) => {
      s[id] = { id, state: "void", at: Date.now(), who, reason };
    });
  }

  /** reversa: redeemed→new (requiere permiso a nivel UI/rol) */
  unredeem(id: string, reason: string, who?: string) {
    storage.checkAndSet(id, () => ({ ok: true, value: null }), (s) => {
      s[id] = { id, state: "new", at: Date.now(), who, reason };
    });
  }

  clear() { storage.clear(); }
}
export const registry = new TicketRegistry();
