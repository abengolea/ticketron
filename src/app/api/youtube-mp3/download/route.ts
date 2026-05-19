import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import {
  downloadMp3ToTemp,
  isValidYoutubeUrl,
  sanitizeDownloadFilename,
} from '@/lib/youtube-mp3';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !isValidYoutubeUrl(url)) {
    return NextResponse.json(
      { error: 'Pegá una URL válida de YouTube (watch, shorts o youtu.be).' },
      { status: 400 }
    );
  }

  let tmpDir: string | undefined;
  try {
    const { filePath, title, tmpDir: dir } = await downloadMp3ToTemp(url);
    tmpDir = dir;

    const buffer = await fs.readFile(filePath);
    const safeName = sanitizeDownloadFilename(title);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeName}.mp3"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error al convertir el video a MP3.';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
