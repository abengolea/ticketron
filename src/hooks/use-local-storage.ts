
"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const isBrowser = typeof window !== "undefined";
  const mountedRef = useRef(false);

  const safeRead = useCallback((): T => {
    if (!isBrowser) return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  }, [initialValue, isBrowser, key]);

  // Inicialización perezosa desde storage (sin “re-sync” que pise)
  const [value, _setValue] = useState<T>(() => safeRead());

  // Setter que persiste *dentro* del updater (atómico)
  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      _setValue((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
        if (isBrowser) {
          try {
            window.localStorage.setItem(key, JSON.stringify(next));
          } catch {
            // no romper UI si storage falla
          }
        }
        return next;
      });
    },
    [isBrowser, key]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sincronizar cambios externos (otras pestañas)
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as T) : initialValue;
        if (mountedRef.current) _setValue(next);
      } catch {
        if (mountedRef.current) _setValue(initialValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [initialValue, isBrowser, key]);

  return [value, setValue] as const;
}
