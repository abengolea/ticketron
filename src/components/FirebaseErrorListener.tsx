
"use client";

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handler = (error: FirestorePermissionError) => {
      console.error("Firestore Permission Error Caught:", error);

      toast({
        variant: "destructive",
        title: "Error de Permisos de Firestore",
        description: (
          <div className="mt-2 w-full rounded-md bg-slate-950 p-4">
            <p className="text-sm text-white">Una operación de base de datos fue denegada por las reglas de seguridad.</p>
            <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
              <code className="text-white text-xs">
                {JSON.stringify(error.context, null, 2)}
              </code>
            </pre>
          </div>
        ),
        duration: 20000, 
      });
    };

    errorEmitter.on('permission-error', handler);

    return () => {
      errorEmitter.off('permission-error', handler);
    };
  }, [toast]);

  return null;
}
