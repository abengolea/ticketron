'use client';

import { useState } from 'react';
import { TicketForm } from '@/components/ticket-form';
import { TicketPreview } from '@/components/ticket-preview';
import type { GenerationResult } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
function GeneratorPage() {
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGeneration = (result: GenerationResult | null, errorMsg: string | null) => {
    setIsLoading(false);
    setGenerationResult(result);
    setError(errorMsg);
  };

  if (generationResult) {
    return <TicketPreview result={generationResult} />;
  }

  return (
    <section className="max-w-4xl mx-auto">
      <section className="text-center mb-8">
        <h1 className="text-4xl font-headline text-primary">Generador de tickets</h1>
        <p className="text-muted-foreground mt-2">
          Configurá tu evento y generá tickets con QR para imprimir (PDF, ZIP, CSV).
        </p>
      </section>

      {isLoading && (
        <section className="flex justify-center items-center my-8">
          <section className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Generando los tickets...</p>
          </section>
        </section>
      )}

      {error && !isLoading && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Error en la generación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && (
        <TicketForm onGenerate={handleGeneration} setIsLoading={setIsLoading} />
      )}
    </section>
  );
}

export default function PrintGeneratorPage() {
  return <GeneratorPage />;
}
