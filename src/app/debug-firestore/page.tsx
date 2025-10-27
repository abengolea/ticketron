"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, useFirestore, useUser } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FirestorePermissionError } from "@/firebase/errors";
import { errorEmitter } from "@/firebase/error-emitter";
import { FlameKindling } from "lucide-react";

export default function DebugFirestorePage() {
  const firestore = useFirestore();
  const { user, loading } = useUser();
  const auth = useAuth();

  const handleTestWrite = () => {
    if (!firestore || !user) {
      alert("Firestore no está disponible o no has iniciado sesión.");
      return;
    }

    const testDocId = `test-${user.uid}-${Date.now()}`;
    const testDocRef = doc(firestore, 'debug_writes', testDocId);
    
    const testData = {
      message: "This is a test write.",
      userId: user.uid,
      userEmail: user.email,
      timestamp: new Date(),
    };

    console.log("Intentando escribir en:", testDocRef.path);

    // ** IMPLEMENTACIÓN CORRECTA DEL MANEJO DE ERRORES **
    // No usamos try/catch. Encadenamos .catch() a la promesa de Firestore.
    setDoc(testDocRef, testData)
      .then(() => {
        alert("¡Escritura exitosa! Esto no debería suceder si las reglas son restrictivas.");
      })
      .catch((serverError) => {
        // 1. Construimos el error contextual detallado.
        const permissionError = new FirestorePermissionError({
          path: testDocRef.path,
          operation: 'create',
          requestResourceData: testData,
        });

        // 2. Emitimos el error al listener global.
        // Esto activará el overlay de error de Next.js con la información detallada.
        errorEmitter.emit('permission-error', permissionError);

        // Opcionalmente, podemos registrar el error original del servidor en la consola
        // para una depuración adicional, pero el error emitido es el importante.
        console.error("Error original del servidor de Firestore:", serverError);
      });
  };

  if (loading) {
    return <p>Cargando usuario...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Página de Depuración de Firestore</CardTitle>
          <CardDescription>
            Esta página se utiliza para aislar y depurar el error "Missing or insufficient permissions".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <FlameKindling className="h-4 w-4" />
            <AlertTitle>Estado de la Depuración</AlertTitle>
            <AlertDescription>
              {user 
                ? `Sesión iniciada como ${user.email}. Presiona el botón para intentar una escritura en Firestore que se espera que falle.`
                : "Por favor, inicia sesión para poder realizar la prueba de escritura."
              }
            </AlertDescription>
          </Alert>
          <Button 
            onClick={handleTestWrite} 
            disabled={!user}
            className="w-full"
          >
            Ejecutar Escritura de Prueba
          </Button>
          <p className="text-sm text-muted-foreground">
            Al hacer clic, se intentará crear un documento en la colección <code>/debug_writes</code>. 
            Si las reglas de seguridad son restrictivas (como se espera), esto debería fallar y 
            el sistema de errores contextuales (<code>FirebaseErrorListener</code>) debería capturar 
            y mostrar un error detallado en el overlay de Next.js.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
