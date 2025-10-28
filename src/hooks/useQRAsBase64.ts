
"use client";

import { useState, useEffect } from 'react';

// Hook para convertir una URL de imagen a un data URI base64 usando un proxy local
export function useQRAsBase64(imageUrl: string) {
  const [base64, setBase64] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchAsBase64() {
      if (!imageUrl) return;

      setLoading(true);
      setError(null);
      
      try {
        // Apuntamos a nuestra propia ruta API que actúa como proxy
        const proxyUrl = `/api/qr?url=${encodeURIComponent(imageUrl)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Error from QR proxy: ${errorData.details || response.statusText}`);
        }

        const data = await response.json();

        if (isMounted) {
            setBase64(data.base64);
            setLoading(false);
        }

      } catch (err) {
        if (isMounted) {
          console.error("Error fetching QR code via proxy:", err);
          setError(err);
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
