
"use client";

import { useState } from "react";
import { TicketForm } from "@/components/ticket-form";
import { TicketPreview } from "@/components/ticket-preview";
import type { GenerationResult } from "@/lib/types";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import PrivateRoute from "@/components/private-route";

function GeneratorPage() {
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGeneration = (result: GenerationResult | null, error: string | null) => {
    setIsLoading(false); // Importante: detener el loader aquí
    setGenerationResult(result);
    setError(error);
  };

  // Si ya tenemos un resultado, solo mostramos la previsualización
  if (generationResult) {
    return <TicketPreview result={generationResult} />;
  }
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* El título se muestra siempre, a menos que ya tengamos resultado */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Generador de Tickets</h1>
        <p className="text-muted-foreground mt-2">
          Configura los detalles de tu evento a continuación y genera tus tickets para imprimir.
        </p>
      </div>

      {/* Loader centralizado */}
      {isLoading && (
        <div className="flex justify-center items-center my-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Generando los tickets...
            </p>
          </div>
        </div>
      )}

      {/* Mensaje de error */}
      {error && !isLoading && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Error en la Generación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* El formulario solo se muestra si NO estamos cargando */}
      {!isLoading && (
        <TicketForm onGenerate={handleGeneration} setIsLoading={setIsLoading} />
      )}
    </div>
  );
}


export default function Home() {
    return (
        <PrivateRoute>
            <GeneratorPage />
        </PrivateRoute>
    )
}
