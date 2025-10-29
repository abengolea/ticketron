
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
      // Si hay JSON corrupto, reseteamos a initialValue
      return initialValue;
    }
  }, [initialValue, isBrowser, key]);

  // Inicialización perezosa
  const [value, setValue] = useState<T>(() => safeRead());

  // Sincroniza al montar (por si SSR hidrata con initialValue)
  useEffect(() => {
    mountedRef.current = true;
    setValue(safeRead());
    return () => {
      mountedRef.current = false;
    };
  }, [safeRead]);

  // Guardar ante cambios
  useEffect(() => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Evitar romper por storage lleno o privado
    }
  }, [key, value, isBrowser]);

  // (Opcional) sincronizar entre pestañas
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as T) : initialValue;
        if (mountedRef.current) setValue(next);
      } catch {
        if (mountedRef.current) setValue(initialValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [initialValue, isBrowser, key]);

  return [value, setValue] as const;
}

    