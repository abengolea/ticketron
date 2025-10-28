'use server';
/**
 * @fileOverview Flow para solicitar la revisión de código a otra IA.
 *
 * - reviewComponentCode - Un flow que resume los problemas y pide una revisión.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ReviewInputSchema = z.object({
  files: z.array(z.object({
    path: z.string().describe('La ruta del archivo a revisar.'),
    content: z.string().describe('El contenido completo del archivo.'),
  })),
});

const ReviewOutputSchema = z.object({
  summary: z.string().describe('Resumen de los problemas encontrados.'),
  recommendations: z.string().describe('Recomendaciones para solucionar los problemas de forma definitiva.'),
  corrected_code: z.array(z.object({
    path: z.string(),
    code: z.string(),
  })).describe('El código corregido para cada archivo problemático.'),
});

const reviewCodeFlow = ai.defineFlow(
  {
    name: 'reviewCodeFlow',
    inputSchema: ReviewInputSchema,
    outputSchema: ReviewOutputSchema,
  },
  async (input) => {

    const prompt = ai.definePrompt({
      name: 'reviewCodePrompt',
      input: { schema: ReviewInputSchema },
      output: { schema: ReviewOutputSchema },
      prompt: `
        Eres un experto en Next.js y React, especializado en depurar problemas complejos de renderizado y estado.
        Un colega (otra IA) ha estado luchando con una serie de errores en una aplicación y necesita tu ayuda.

        ### Resumen de los Problemas Enfrentados:

        La aplicación ha sufrido de:
        1.  **Errores de Sintaxis Constantes:** Repetidos fallos por llaves de cierre '}' faltantes o mal ubicadas en componentes de React, causando errores de compilación ("Unexpected token").
        2.  **Bucle de Renderizado Infinito ("Maximum update depth exceeded"):** Causado por el uso incorrecto del hook \`useEffect\` sin un array de dependencias \`[]\`, lo que provocaba que se llamara a \`setState\` en un ciclo sin fin.
        3.  **Errores de Renderizado Server/Client:** Código que depende de APIs del navegador (como \`window\`, \`localStorage\` o la inicialización de librerías que manipulan el DOM como \`html5-qrcode\`) se intentaba ejecutar en el lado del servidor, resultando en errores genéricos y fatales durante el renderizado inicial.
        4.  **Funcionalidad Rota (PDF en Blanco):** La librería \`html2canvas\` no podía capturar un componente porque su contenedor se renderizaba con \`visibility: hidden\`.

        ### Archivos Problemáticos para Revisar:

        A continuación se presenta el código de los componentes que han causado más problemas. Necesito que los analices en profundidad.

        {{#each files}}
        ---
        **Archivo: {{path}}**
        \`\`\`typescript
        {{{content}}}
        \`\`\`
        ---
        {{/each}}

        ### Tu Tarea:

        Actúa como un revisor de código senior y estricto. Tu objetivo es encontrar la causa raíz de esta inestabilidad y proponer una solución definitiva.

        1.  **Analiza el Código:** Revisa los archivos proporcionados en busca de cualquier antipatrón, uso incorrecto de hooks, lógica propensa a errores de renderizado en Next.js, o cualquier otra cosa que pueda causar problemas. Sé exhaustivo.
        2.  **Escribe un Resumen:** Describe los problemas fundamentales que encuentres en el código. ¿Hay un patrón de errores? ¿Cuál es la causa raíz de la fragilidad del código?
        3.  **Da Recomendaciones Claras:** Proporciona una lista de acciones concretas y "buenas prácticas" que la otra IA debería seguir para evitar estos errores en el futuro al trabajar con React y Next.js.
        4.  **Proporciona el Código Corregido:** Reescribe las versiones finales y robustas de los archivos, aplicando todas tus recomendaciones para que sean a prueba de errores. Asegúrate de que el código sea limpio, correcto y siga las mejores prácticas de React.
      `,
    });

    const { output } = await prompt(input);
    return output!;
  }
);
