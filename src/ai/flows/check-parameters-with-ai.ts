'use server';

/**
 * @fileOverview A flow that uses AI to validate event parameters.
 *
 * - checkParametersWithAI - A function that validates event parameters using AI.
 * - CheckParametersInput - The input type for the checkParametersWithAI function.
 * - CheckParametersOutput - The return type for the checkParametersWithAI function.
 */

import { getAi } from '@/ai/genkit';
import { z } from 'genkit';

const CheckParametersInputSchema = z.object({
  event_name: z.string().describe('El nombre del evento.'),
  event_id: z.string().describe('Un ID corto para el evento.'),
  date_time: z.string().describe('La fecha y hora del evento.'),
  venue: z.string().describe('El lugar del evento.'),
  quantity: z.number().describe('La cantidad de tickets a generar.'),
  tickets_per_page: z.number().describe('El número de tickets por página.'),
  page_size: z.string().describe('El tamaño de página (ej. A4, Letter).'),
});
export type CheckParametersInput = z.infer<typeof CheckParametersInputSchema>;

const CheckParametersOutputSchema = z.object({
  valid: z.boolean().describe('Indica si los parámetros son válidos y consistentes.'),
  feedback: z.string().describe('Comentarios de la IA sobre los parámetros, en español.'),
});
export type CheckParametersOutput = z.infer<typeof CheckParametersOutputSchema>;

export async function checkParametersWithAI(input: CheckParametersInput): Promise<CheckParametersOutput> {
  return checkParametersFlow(input);
}

const prompt = getAi().definePrompt({
  name: 'checkParametersPrompt',
  input: { schema: CheckParametersInputSchema },
  output: { schema: CheckParametersOutputSchema },
  prompt: `Eres un asistente de IA que ayuda a validar parámetros de eventos. La respuesta debe ser en español.

  Se te darán los siguientes parámetros para un evento:
  Nombre del Evento: {{{event_name}}}
  ID del Evento: {{{event_id}}}
  Fecha y Hora: {{{date_time}}}
  Lugar: {{{venue}}}
  Cantidad: {{{quantity}}}
  Tickets por Página: {{{tickets_per_page}}}
  Tamaño de Página: {{{page_size}}}

  Determina si los parámetros son válidos y consistentes. Proporciona comentarios al usuario si falta información o es contradictoria.

  Si todo está bien, establece 'valid' en true y proporciona un mensaje positivo en el campo 'feedback'. De lo contrario, establece 'valid' en false y explica los problemas en el campo 'feedback'.

  La salida debe estar estructurada como un objeto JSON con los campos "valid" (booleano) y "feedback" (string).

  Considera lo siguiente:
  - si la cantidad de tickets es demasiado alta dada la cantidad de tickets por página y el tamaño de la página.
  - si la fecha y hora parecen ser válidas y completas.
  - si el ID del evento es una abreviatura razonable del nombre del evento, y es único.
`,
});

const checkParametersFlow = getAi().defineFlow(
  {
    name: 'checkParametersFlow',
    inputSchema: CheckParametersInputSchema,
    outputSchema: CheckParametersOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
