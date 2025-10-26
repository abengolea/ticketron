
import {NextResponse} from 'next/server';
import {
  checkParametersFlow,
  CheckParametersInputSchema,
} from '@/ai/flows/check-parameters-with-ai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validationResult = CheckParametersInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {error: 'Invalid input parameters', details: validationResult.error.issues},
        {status: 400}
      );
    }

    const aiResult = await checkParametersFlow(validationResult.data);
    return NextResponse.json(aiResult);
    
  } catch (error: any) {
    console.error('Error in /api/validate-event:', error);
    return NextResponse.json(
      {error: error.message || 'An unknown error occurred in the AI validation endpoint.'},
      {status: 500}
    );
  }
}
