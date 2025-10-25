'use server';

/**
 * @fileOverview A flow that uses AI to validate event parameters.
 *
 * - checkParametersWithAI - A function that validates event parameters using AI.
 * - CheckParametersInput - The input type for the checkParametersWithAI function.
 * - CheckParametersOutput - The return type for the checkParametersWithAI function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CheckParametersInputSchema = z.object({
  event_name: z.string().describe('The name of the event.'),
  event_id: z.string().describe('A short string ID for the event.'),
  date_time: z.string().describe('The date and time of the event.'),
  venue: z.string().describe('The venue of the event.'),
  quantity: z.number().describe('The number of tickets to generate.'),
  tickets_per_page: z.number().describe('The number of tickets per page.'),
  page_size: z.string().describe('The page size (e.g., A4, Letter).'),
});
export type CheckParametersInput = z.infer<typeof CheckParametersInputSchema>;

const CheckParametersOutputSchema = z.object({
  valid: z.boolean().describe('Whether the parameters are valid and consistent.'),
  feedback: z.string().describe('Feedback from the AI about the parameters.'),
});
export type CheckParametersOutput = z.infer<typeof CheckParametersOutputSchema>;

export async function checkParametersWithAI(input: CheckParametersInput): Promise<CheckParametersOutput> {
  return checkParametersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'checkParametersPrompt',
  input: {schema: CheckParametersInputSchema},
  output: {schema: CheckParametersOutputSchema},
  prompt: `You are an AI assistant that helps validate event parameters.

  You will be given the following parameters for an event:
  Event Name: {{{event_name}}}
  Event ID: {{{event_id}}}
  Date and Time: {{{date_time}}}
  Venue: {{{venue}}}
  Quantity: {{{quantity}}}
  Tickets Per Page: {{{tickets_per_page}}}
  Page Size: {{{page_size}}}

  Determine if the parameters are valid and consistent. Provide feedback to the user if any information is missing or contradictory.

  If everything is fine, set valid to true and provide a positive message in the feedback field. Otherwise, set valid to false and explain the issues in the feedback field.

  The output should be structured as a JSON object with "valid" (boolean) and "feedback" (string) fields.

  Consider these:
  - if the quantity of tickets is too high given the tickets_per_page and page_size.
  - if the date_time appears to be valid and complete.
  - if the event_id is a reasonable abbreviation of the event_name, and is unique.
`,
});

const checkParametersFlow = ai.defineFlow(
  {
    name: 'checkParametersFlow',
    inputSchema: CheckParametersInputSchema,
    outputSchema: CheckParametersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
