
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Options = {
  size?: number;       // px; ej 256
  margin?: number;     // 0..4
  errorCorrectionLevel?: "L"|"M"|"Q"|"H";
};

export function useQRAsBase64(payload: string, opts: Options = {}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setError(null);
        // default: nítido, sin borde grande
        const url = await QRCode.toDataURL(payload ?? "", {
          width: opts.size ?? 256,
          margin: opts.margin ?? 1,
          errorCorrectionLevel: opts.errorCorrectionLevel ?? "M",
        });
        if (!cancelled) setDataUrl(url);
      } catch (e:any) {
        if (!cancelled) setError(e);
      }
    }
    if (payload) run(); else setDataUrl(null);
    return () => { cancelled = true; };
  }, [payload, opts.size, opts.margin, opts.errorCorrectionLevel]);

  return { dataUrl, error };
}
