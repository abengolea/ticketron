
"use client";

import { useSyncExternalStore } from "react";

// Helpers seguros para LS
function readLS(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem("redeemedTickets");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeLS(list: string[]) {
  try { window.localStorage.setItem("redeemedTickets", JSON.stringify(list)); } catch {}
}

class RedeemedTicketsStore {
  private set = new Set<string>();
  private listeners = new Set<() => void>();

  constructor() {
    this.set = new Set(readLS());
    // sync con otras pestañas
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === "redeemedTickets") {
          this.set = new Set(readLS());
          this.emit();
        }
      });
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  getSnapshot = () => Array.from(this.set);

  has = (key: string) => this.set.has(key);

  add = (key: string) => {
    if (this.set.has(key)) return false;
    this.set.add(key);
    writeLS(Array.from(this.set));
    this.emit();
    return true;
  };

  clear = () => {
    this.set.clear();
    writeLS([]);
    this.emit();
  };
}

const store = new RedeemedTicketsStore();

export function useRedeemedTickets() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
export const redeemedStore = store;
