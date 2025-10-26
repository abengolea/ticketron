"use client";

import { useState } from "react";
import { TicketForm } from "@/components/ticket-form";
import { TicketPreview } from "@/components/ticket-preview";
import type { GenerationResult } from "@/lib/types";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGeneration = (result: GenerationResult | null, error: string | null) => {
    setGenerationResult(result);
    setError(error);
  };

  if (generationResult) {
    return <TicketPreview result={generationResult} />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Generador de Tickets</h1>
        <p className="text-muted-foreground mt-2">
          Configura los detalles de tu evento a continuación y genera tus tickets para imprimir.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center my-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">
              La IA está verificando los parámetros y generando los tickets...
            </p>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Error en la Generación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className={isLoading ? "hidden" : ""}>
        <TicketForm onGenerate={handleGeneration} setIsLoading={setIsLoading} />
      </div>
    </div>
  );
}
