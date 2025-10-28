
"use client";

import { useState, useEffect } from 'react';

// Hook para convertir una URL de imagen a un data URI base64 usando un proxy local
export function useQRAsBase64(imageUrl: string | null) {
  const [base64, setBase64] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchAsBase64() {
      if (!imageUrl) {
        setLoading(false);
        setError(new Error("Image URL is null or empty."));
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        // Apuntamos a nuestra propia ruta API que actúa como proxy
        const proxyUrl = `/api/qr?url=${encodeURIComponent(imageUrl)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ details: response.statusText }));
          throw new Error(`Error from QR proxy: ${errorData.details || response.statusText}`);
        }

        const data = await response.json();

        if (isMounted) {
            if (data.base64) {
                setBase64(data.base64);
            } else {
                throw new Error("Proxy response did not contain base64 data.");
            }
        }

      } catch (err) {
        if (isMounted) {
          console.error("Error fetching QR code via proxy:", err);
          setError(err);
        }
      } finally {
        if (isMounted) {
            setLoading(false);
        }
      }
    }

    fetchAsBase64();

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  return { base64, loading, error };
}
