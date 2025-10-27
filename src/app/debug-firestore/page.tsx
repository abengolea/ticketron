"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, useFirestore, useUser } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FirestorePermissionError } from "@/firebase/errors";
import { errorEmitter } from "@/firebase/error-emitter";
import { FlameKindling } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DebugFirestorePage() {
  const firestore = useFirestore();
  const { user, loading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();

  const handleTestWrite = () => {
    if (!firestore || !user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Firestore no está disponible o no has iniciado sesión.",
      });
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

    setDoc(testDocRef, testData)
      .then(() => {
        toast({
          title: "¡Escritura Exitosa!",
          description: "El documento de prueba se ha escrito correctamente en Firestore.",
        });
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: testDocRef.path,
          operation: 'create',
          requestResourceData: testData,
        });

        errorEmitter.emit('permission-error', permissionError);
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
                ? `Sesión iniciada como ${user.email}. Presiona el botón para intentar una escritura en Firestore.`
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
            Si las reglas de seguridad son correctas, debería aparecer una notificación de "Escritura Exitosa". 
            Si fallan, el sistema de errores contextuales mostrará un error detallado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
