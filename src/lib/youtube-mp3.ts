import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import youtubedl from 'youtube-dl-exec';
import type { YoutubeVideoInfo } from '@/lib/youtube-mp3-shared';

export type { YoutubeVideoInfo } from '@/lib/youtube-mp3-shared';
export {
  isValidYoutubeUrl,
  sanitizeDownloadFilename,
  formatDuration,
} from '@/lib/youtube-mp3-shared';

function getFfmpegPath(): string {
  const ffmpegPath = require('ffmpeg-static') as string | null;
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static no está disponible. Reinstalá dependencias (npm install).');
  }
  return ffmpegPath;
}

const baseYtDlpFlags = () => ({
  noWarnings: true,
  noPlaylist: true,
  ffmpegLocation: getFfmpegPath(),
});

export async function getVideoInfo(url: string): Promise<YoutubeVideoInfo> {
  const payload = (await youtubedl(url, {
    ...baseYtDlpFlags(),
    dumpSingleJson: true,
    skipDownload: true,
  })) as {
    id?: string;
    title?: string;
    duration?: number;
    thumbnail?: string;
    uploader?: string;
  };

  if (!payload.id) {
    throw new Error('No se pudo leer la información del video.');
  }

  return {
    id: payload.id,
    title: payload.title ?? 'Sin título',
    duration: payload.duration ?? 0,
    thumbnail: payload.thumbnail,
    uploader: payload.uploader,
  };
}

export async function downloadMp3ToTemp(
  url: string
): Promise<{ filePath: string; title: string; tmpDir: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticketron-yt-'));
  const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

  await youtubedl(url, {
    ...baseYtDlpFlags(),
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: 256,
    output: outputTemplate,
    restrictFilenames: true,
  });

  const files = await fs.readdir(tmpDir);
  const mp3Name = files.find((f) => f.toLowerCase().endsWith('.mp3'));
  if (!mp3Name) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error('No se generó el archivo MP3.');
  }

  const title = mp3Name.replace(/\.mp3$/i, '');
  return { filePath: path.join(tmpDir, mp3Name), title, tmpDir };
}
