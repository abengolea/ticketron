import { genkit, Genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

let aiInstance: Genkit | null = null;

export function getAi(): Genkit {
  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [googleAI()],
      model: 'googleai/gemini-2.5-flash',
    });
  }
  return aiInstance;
}

// Export a getter instead of the instance itself
export const ai = getAi();
