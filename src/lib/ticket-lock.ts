
// "use client" NO es necesario acá (no renderiza), pero este módulo se usa en cliente.
export class TicketLockManager {
  private locks = new Map<string, Promise<void>>();

  async acquireLock(ticketId: string): Promise<() => void> {
    // Espera a que liberen si ya hay lock para este ticket
    while (this.locks.has(ticketId)) {
      await this.locks.get(ticketId);
    }
    let release!: () => void;
    const p = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(ticketId, p);
    // devolvemos la función de liberación
    return () => {
      this.locks.delete(ticketId);
      release();
    };
  }
}

export const ticketLock = new TicketLockManager();
