
"use client";

import { useState, useEffect } from 'react';

// Hook para convertir una URL de imagen a un data URI base64
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
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          throw new Error(`Error al obtener el QR: ${response.statusText}`);
        }

        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMounted) {
            setBase64(reader.result as string);
            setLoading(false);
          }
        };
        reader.onerror = (err) => {
            if (isMounted) {
                setError(err);
                setLoading(false);
            }
        }
        reader.readAsDataURL(blob);

      } catch (err) {
        if (isMounted) {
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
