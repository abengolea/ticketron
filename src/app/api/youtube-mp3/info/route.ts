import { NextRequest, NextResponse } from 'next/server';
import { getVideoInfo, isValidYoutubeUrl } from '@/lib/youtube-mp3';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')?.trim();

  if (!url || !isValidYoutubeUrl(url)) {
    return NextResponse.json(
      { error: 'Pegá una URL válida de YouTube (watch, shorts o youtu.be).' },
      { status: 400 }
    );
  }

  try {
    const info = await getVideoInfo(url);
    return NextResponse.json(info);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'No se pudo obtener la información del video.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
